import crypto from 'node:crypto';
import { getDbPool } from '@/lib/server/database';
import { gigConnectPurchasesPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { getRazorpayConfig, verifyRazorpayPaymentSignature } from '@/lib/server/billing';
import { consumeGigProposalFromSubscription, getGigProposalEntitlement } from '@/lib/server/connect-entitlements';

export type GigConnectMode = 'one_time' | 'monthly_pass';

export type GigConnectPurchase = {
  id: string;
  buyerUserId: string;
  productMode: GigConnectMode;
  amountInPaise: number;
  currency: 'INR';
  status: 'created' | 'paid' | 'expired';
  razorpay: {
    orderId?: string;
    paymentId?: string;
    signature?: string;
  };
  creditsGranted: number;
  creditsUsed: number;
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
};

export const GIG_CONNECT_PRICING = {
  oneTimeAmountInPaise: 4900, // ₹49
  oneTimeMinQuantity: 5,
  oneTimeMaxQuantity: 250,
  monthlyPassAmountInPaise: 19900, // ₹199
  monthlyPassCredits: 30,
  oneTimeValidDays: 30,
  monthlyValidDays: 30,
} as const;

function nowIso() {
  return new Date().toISOString();
}

export async function listGigConnectPurchases(buyerUserId: string) {
  const pool = getDbPool();
  if (!pool) {
    const raw = await readJsonFile<GigConnectPurchase[]>(gigConnectPurchasesPath, []);
    return raw.filter((p) => p.buyerUserId === buyerUserId);
  }

  const result = await pool.query(
    `
      SELECT
        id, buyer_user_id, product_mode, amount_in_paise, currency, status,
        razorpay_order_id, razorpay_payment_id, razorpay_signature,
        credits_granted, credits_used, valid_until, created_at, updated_at
      FROM gig_connect_purchases
      WHERE buyer_user_id = $1
      ORDER BY created_at DESC
      LIMIT 120
    `,
    [buyerUserId],
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    buyerUserId: String(row.buyer_user_id),
    productMode: row.product_mode === 'monthly_pass' ? 'monthly_pass' : 'one_time',
    amountInPaise: Number(row.amount_in_paise || 0),
    currency: 'INR' as const,
    status: row.status === 'paid' ? 'paid' : row.status === 'expired' ? 'expired' : 'created',
    razorpay: {
      orderId: row.razorpay_order_id ? String(row.razorpay_order_id) : undefined,
      paymentId: row.razorpay_payment_id ? String(row.razorpay_payment_id) : undefined,
      signature: row.razorpay_signature ? String(row.razorpay_signature) : undefined,
    },
    creditsGranted: Number(row.credits_granted || 0),
    creditsUsed: Number(row.credits_used || 0),
    validUntil: row.valid_until ? new Date(row.valid_until).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  })) as GigConnectPurchase[];
}

function isPurchaseActive(p: GigConnectPurchase) {
  if (p.status !== 'paid') return false;
  if (!p.validUntil) return true;
  const until = new Date(p.validUntil);
  return Number.isFinite(until.getTime()) && until.getTime() > Date.now();
}

export async function hasGigConnectAccess(params: { buyerUserId: string }) {
  const planEntitlement = await getGigProposalEntitlement(params.buyerUserId);
  if (planEntitlement.ok) {
    return { ok: true, mode: 'subscription' as const, purchaseId: `sub:${params.buyerUserId}` };
  }

  const purchases = await listGigConnectPurchases(params.buyerUserId);
  const active = purchases.filter(isPurchaseActive);

  const pass = active.find((p) => p.productMode === 'monthly_pass' && p.creditsUsed < p.creditsGranted);
  if (pass) return { ok: true, mode: 'monthly_pass' as const, purchaseId: pass.id };

  const oneTime = active.find((p) => p.productMode === 'one_time' && p.creditsUsed < p.creditsGranted);
  if (oneTime) return { ok: true, mode: 'one_time' as const, purchaseId: oneTime.id };

  return { ok: false as const };
}

export async function consumeGigConnectCredit(params: { buyerUserId: string; purchaseId: string }) {
  if (params.purchaseId.startsWith('sub:')) {
    return consumeGigProposalFromSubscription(params.buyerUserId);
  }

  const pool = getDbPool();
  const now = nowIso();
  if (!pool) {
    const raw = await readJsonFile<GigConnectPurchase[]>(gigConnectPurchasesPath, []);
    const index = raw.findIndex((p) => p.id === params.purchaseId && p.buyerUserId === params.buyerUserId);
    if (index === -1) return null;
    const target = raw[index];
    if (!isPurchaseActive(target)) return null;
    if (target.creditsUsed >= target.creditsGranted) return null;
    raw[index] = { ...target, creditsUsed: target.creditsUsed + 1, updatedAt: now };
    await writeJsonFile(gigConnectPurchasesPath, raw.slice(0, 6000));
    return raw[index];
  }

  const result = await pool.query(
    `
      UPDATE gig_connect_purchases
      SET credits_used = credits_used + 1, updated_at = NOW()
      WHERE id = $1
        AND buyer_user_id = $2
        AND status = 'paid'
        AND (valid_until IS NULL OR valid_until > NOW())
        AND credits_used < credits_granted
      RETURNING id
    `,
    [params.purchaseId, params.buyerUserId],
  );
  return result.rows[0] ? { ok: true } : null;
}

export async function createGigConnectOrder(params: {
  buyerUserId: string;
  buyerName?: string;
  buyerEmail?: string;
  mode: GigConnectMode;
  quantity?: number;
}) {
  const razorpayConfig = getRazorpayConfig();
  if (!razorpayConfig.serverConfigured) {
    throw new Error('Razorpay payment gateway is not configured.');
  }

  const mode: GigConnectMode = params.mode === 'monthly_pass' ? 'monthly_pass' : 'one_time';
  const quantity = mode === 'one_time'
    ? Math.max(GIG_CONNECT_PRICING.oneTimeMinQuantity, Math.min(GIG_CONNECT_PRICING.oneTimeMaxQuantity, Math.round(Number(params.quantity || 0))))
    : 1;
  const amountInPaise = mode === 'monthly_pass'
    ? GIG_CONNECT_PRICING.monthlyPassAmountInPaise
    : GIG_CONNECT_PRICING.oneTimeAmountInPaise * quantity;

  const receipt = `gigc_${params.buyerUserId.slice(0, 8)}_${Date.now().toString(36).slice(-8)}`;
  const auth = Buffer.from(`${razorpayConfig.keyId}:${razorpayConfig.keySecret}`).toString('base64');

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes: {
        product: 'gig_connect',
        mode,
        buyerUserId: params.buyerUserId,
        quantity: String(quantity),
      },
    }),
  });

  const payload = await response.json().catch(() => null) as any;
  if (!response.ok || !payload?.id) {
    throw new Error(payload?.error?.description || 'Unable to create Razorpay order.');
  }

  const pool = getDbPool();
  const id = crypto.randomUUID();
  const now = nowIso();

  const record: GigConnectPurchase = {
    id,
    buyerUserId: params.buyerUserId,
    productMode: mode,
    amountInPaise,
    currency: 'INR',
    status: 'created',
    razorpay: { orderId: String(payload.id) },
    creditsGranted: 0,
    creditsUsed: 0,
    validUntil: undefined,
    createdAt: now,
    updatedAt: now,
  };

  if (!pool) {
    const existing = await readJsonFile<GigConnectPurchase[]>(gigConnectPurchasesPath, []);
    await writeJsonFile(gigConnectPurchasesPath, [record, ...existing].slice(0, 6000));
  } else {
    await pool.query(
      `
        INSERT INTO gig_connect_purchases (
          id, buyer_user_id, product_mode, amount_in_paise, currency,
          status, razorpay_order_id, credits_granted, credits_used, valid_until, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,'created',$6,$7,$8,$9,NOW(),NOW()
        )
      `,
      [
        record.id,
        record.buyerUserId,
        record.productMode,
        record.amountInPaise,
        record.currency,
        record.razorpay.orderId,
        0,
        0,
        null,
      ],
    );
  }

  return {
    order: payload,
    keyId: razorpayConfig.keyId,
    isTestMode: razorpayConfig.isTestMode,
    amountInPaise,
    currency: 'INR',
    mode,
    purchaseId: record.id,
    buyer: {
      name: params.buyerName || '',
      email: params.buyerEmail || '',
    },
  };
}

export async function verifyGigConnectPayment(params: {
  buyerUserId: string;
  purchaseId: string;
  mode: GigConnectMode;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  const isValid = verifyRazorpayPaymentSignature(params.razorpay_order_id, params.razorpay_payment_id, params.razorpay_signature);
  if (!isValid) {
    throw new Error('Razorpay payment signature verification failed.');
  }

  const mode: GigConnectMode = params.mode === 'monthly_pass' ? 'monthly_pass' : 'one_time';
  const now = new Date();
  const nowIsoValue = now.toISOString();
  const validUntil = mode === 'monthly_pass'
    ? new Date(now.getTime() + GIG_CONNECT_PRICING.monthlyValidDays * 24 * 60 * 60 * 1000).toISOString()
    : new Date(now.getTime() + GIG_CONNECT_PRICING.oneTimeValidDays * 24 * 60 * 60 * 1000).toISOString();

  const pool = getDbPool();
  if (!pool) {
    const existing = await readJsonFile<GigConnectPurchase[]>(gigConnectPurchasesPath, []);
    const idx = existing.findIndex((p) => p.id === params.purchaseId && p.buyerUserId === params.buyerUserId);
    if (idx === -1) throw new Error('Purchase not found.');
    const current = existing[idx];
    if (current.razorpay.orderId !== params.razorpay_order_id) throw new Error('Purchase does not match this order.');

    const storedAmount = Math.max(0, Math.round(Number(current.amountInPaise || 0)));
    const resolvedAmount = mode === 'monthly_pass' ? GIG_CONNECT_PRICING.monthlyPassAmountInPaise : storedAmount;
    const creditsGranted = mode === 'monthly_pass'
      ? GIG_CONNECT_PRICING.monthlyPassCredits
      : Math.round(resolvedAmount / GIG_CONNECT_PRICING.oneTimeAmountInPaise);
    if (mode === 'one_time') {
      if (creditsGranted < GIG_CONNECT_PRICING.oneTimeMinQuantity) {
        throw new Error(`Minimum purchase is ${GIG_CONNECT_PRICING.oneTimeMinQuantity} credits.`);
      }
      if (creditsGranted > GIG_CONNECT_PRICING.oneTimeMaxQuantity) {
        throw new Error(`Maximum purchase is ${GIG_CONNECT_PRICING.oneTimeMaxQuantity} credits.`);
      }
      if (creditsGranted * GIG_CONNECT_PRICING.oneTimeAmountInPaise !== resolvedAmount) {
        throw new Error('Purchase amount does not match requested credits.');
      }
    }

    existing[idx] = {
      ...current,
      productMode: mode,
      amountInPaise: resolvedAmount,
      status: 'paid',
      razorpay: {
        orderId: params.razorpay_order_id,
        paymentId: params.razorpay_payment_id,
        signature: params.razorpay_signature,
      },
      creditsGranted,
      creditsUsed: 0,
      validUntil,
      updatedAt: nowIsoValue,
    };
    await writeJsonFile(gigConnectPurchasesPath, existing.slice(0, 6000));
    return existing[idx];
  }

  const existingRow = await pool.query(
    `
      SELECT id, amount_in_paise
      FROM gig_connect_purchases
      WHERE id = $1 AND buyer_user_id = $2 AND razorpay_order_id = $3
      LIMIT 1
    `,
    [params.purchaseId, params.buyerUserId, params.razorpay_order_id],
  );
  if (!existingRow.rows[0]) throw new Error('Purchase not found.');

  const storedAmount = Math.max(0, Math.round(Number(existingRow.rows[0].amount_in_paise || 0)));
  const resolvedAmount = mode === 'monthly_pass' ? GIG_CONNECT_PRICING.monthlyPassAmountInPaise : storedAmount;
  const creditsGranted = mode === 'monthly_pass'
    ? GIG_CONNECT_PRICING.monthlyPassCredits
    : Math.round(resolvedAmount / GIG_CONNECT_PRICING.oneTimeAmountInPaise);

  if (mode === 'one_time') {
    if (creditsGranted < GIG_CONNECT_PRICING.oneTimeMinQuantity) {
      throw new Error(`Minimum purchase is ${GIG_CONNECT_PRICING.oneTimeMinQuantity} credits.`);
    }
    if (creditsGranted > GIG_CONNECT_PRICING.oneTimeMaxQuantity) {
      throw new Error(`Maximum purchase is ${GIG_CONNECT_PRICING.oneTimeMaxQuantity} credits.`);
    }
    if (creditsGranted * GIG_CONNECT_PRICING.oneTimeAmountInPaise !== resolvedAmount) {
      throw new Error('Purchase amount does not match requested credits.');
    }
  }

  const updated = await pool.query(
    `
      UPDATE gig_connect_purchases
      SET
        status = 'paid',
        product_mode = $3,
        amount_in_paise = $4,
        razorpay_payment_id = $5,
        razorpay_signature = $6,
        credits_granted = $7,
        credits_used = 0,
        valid_until = $8,
        updated_at = NOW()
      WHERE id = $1 AND buyer_user_id = $2 AND razorpay_order_id = $9
      RETURNING id
    `,
    [
      params.purchaseId,
      params.buyerUserId,
      mode,
      resolvedAmount,
      params.razorpay_payment_id,
      params.razorpay_signature,
      creditsGranted,
      new Date(validUntil),
      params.razorpay_order_id,
    ],
  );

  if (!updated.rows[0]) throw new Error('Purchase verification failed.');
  return { ok: true };
}
