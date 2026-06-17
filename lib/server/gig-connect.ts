import crypto from 'node:crypto';
import { getDbPool, getMongoDb } from '@/lib/server/database';
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
  oneTimeAmountInPaise: 4900,
  oneTimeMinQuantity: 5,
  oneTimeMaxQuantity: 250,
  monthlyPassAmountInPaise: 19900,
  monthlyPassCredits: 30,
  oneTimeValidDays: 30,
  monthlyValidDays: 30,
} as const;

function nowIso() {
  return new Date().toISOString();
}

type PurchaseDoc = Omit<GigConnectPurchase, 'razorpay'> & {
  _id: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
};

function docToPurchase(doc: PurchaseDoc): GigConnectPurchase {
  const { _id: _u, razorpayOrderId, razorpayPaymentId, razorpaySignature, ...rest } = doc;
  return {
    ...rest,
    razorpay: {
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
    },
  };
}

function purchaseToDoc(record: GigConnectPurchase): PurchaseDoc {
  const { razorpay, ...rest } = record;
  return {
    ...rest,
    _id: record.id,
    razorpayOrderId: razorpay.orderId,
    razorpayPaymentId: razorpay.paymentId,
    razorpaySignature: razorpay.signature,
  };
}

export async function listGigConnectPurchases(buyerUserId: string) {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<PurchaseDoc>('gig_connect_purchases')
        .find({ buyerUserId }).sort({ createdAt: -1 }).limit(120).toArray();
      return docs.map(docToPurchase);
    }
  }
  const raw = await readJsonFile<GigConnectPurchase[]>(gigConnectPurchasesPath, []);
  return raw.filter((p) => p.buyerUserId === buyerUserId);
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

  const now = nowIso();
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const result = await db.collection<PurchaseDoc>('gig_connect_purchases').findOneAndUpdate(
        {
          _id: params.purchaseId,
          buyerUserId: params.buyerUserId,
          status: 'paid',
          $or: [{ validUntil: { $exists: false } }, { validUntil: null as any }, { validUntil: { $gt: now } }],
          $expr: { $lt: ['$creditsUsed', '$creditsGranted'] },
        },
        { $inc: { creditsUsed: 1 }, $set: { updatedAt: now } },
        { returnDocument: 'after' },
      );
      return result ? { ok: true } : null;
    }
  }

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

  const payload = await response.json().catch(() => null) as Record<string, unknown>;
  if (!response.ok || !payload?.id) {
    const err = (payload?.error as Record<string, unknown> | undefined)?.description;
    throw new Error(typeof err === 'string' ? err : 'Unable to create Razorpay order.');
  }

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

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection<PurchaseDoc>('gig_connect_purchases').insertOne(purchaseToDoc(record));
    }
  } else {
    const existing = await readJsonFile<GigConnectPurchase[]>(gigConnectPurchasesPath, []);
    await writeJsonFile(gigConnectPurchasesPath, [record, ...existing].slice(0, 6000));
  }

  return {
    order: payload,
    keyId: razorpayConfig.keyId,
    isTestMode: razorpayConfig.isTestMode,
    amountInPaise,
    currency: 'INR',
    mode,
    purchaseId: record.id,
    buyer: { name: params.buyerName || '', email: params.buyerEmail || '' },
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
  if (!isValid) throw new Error('Razorpay payment signature verification failed.');

  const mode: GigConnectMode = params.mode === 'monthly_pass' ? 'monthly_pass' : 'one_time';
  const now = new Date();
  const nowIsoValue = now.toISOString();
  const validUntil = mode === 'monthly_pass'
    ? new Date(now.getTime() + GIG_CONNECT_PRICING.monthlyValidDays * 24 * 60 * 60 * 1000).toISOString()
    : new Date(now.getTime() + GIG_CONNECT_PRICING.oneTimeValidDays * 24 * 60 * 60 * 1000).toISOString();

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const existing = await db.collection<PurchaseDoc>('gig_connect_purchases')
        .findOne({ _id: params.purchaseId, buyerUserId: params.buyerUserId, razorpayOrderId: params.razorpay_order_id });
      if (!existing) throw new Error('Purchase not found.');

      const storedAmount = Math.max(0, Math.round(Number(existing.amountInPaise || 0)));
      const resolvedAmount = mode === 'monthly_pass' ? GIG_CONNECT_PRICING.monthlyPassAmountInPaise : storedAmount;
      const creditsGranted = mode === 'monthly_pass'
        ? GIG_CONNECT_PRICING.monthlyPassCredits
        : Math.round(resolvedAmount / GIG_CONNECT_PRICING.oneTimeAmountInPaise);

      if (mode === 'one_time') {
        if (creditsGranted < GIG_CONNECT_PRICING.oneTimeMinQuantity) throw new Error(`Minimum purchase is ${GIG_CONNECT_PRICING.oneTimeMinQuantity} credits.`);
        if (creditsGranted > GIG_CONNECT_PRICING.oneTimeMaxQuantity) throw new Error(`Maximum purchase is ${GIG_CONNECT_PRICING.oneTimeMaxQuantity} credits.`);
        if (creditsGranted * GIG_CONNECT_PRICING.oneTimeAmountInPaise !== resolvedAmount) throw new Error('Purchase amount does not match requested credits.');
      }

      const updated = await db.collection('gig_connect_purchases').updateOne(
        { _id: params.purchaseId as any, buyerUserId: params.buyerUserId, razorpayOrderId: params.razorpay_order_id },
        {
          $set: {
            status: 'paid',
            productMode: mode,
            amountInPaise: resolvedAmount,
            razorpayPaymentId: params.razorpay_payment_id,
            razorpaySignature: params.razorpay_signature,
            creditsGranted,
            creditsUsed: 0,
            validUntil,
            updatedAt: nowIsoValue,
          },
        },
      );
      if (!updated.modifiedCount) throw new Error('Purchase verification failed.');
      return { ok: true };
    }
  }

  const existingList = await readJsonFile<GigConnectPurchase[]>(gigConnectPurchasesPath, []);
  const idx = existingList.findIndex((p) => p.id === params.purchaseId && p.buyerUserId === params.buyerUserId);
  if (idx === -1) throw new Error('Purchase not found.');
  const current = existingList[idx];
  if (current.razorpay.orderId !== params.razorpay_order_id) throw new Error('Purchase does not match this order.');

  const storedAmount = Math.max(0, Math.round(Number(current.amountInPaise || 0)));
  const resolvedAmount = mode === 'monthly_pass' ? GIG_CONNECT_PRICING.monthlyPassAmountInPaise : storedAmount;
  const creditsGranted = mode === 'monthly_pass'
    ? GIG_CONNECT_PRICING.monthlyPassCredits
    : Math.round(resolvedAmount / GIG_CONNECT_PRICING.oneTimeAmountInPaise);

  if (mode === 'one_time') {
    if (creditsGranted < GIG_CONNECT_PRICING.oneTimeMinQuantity) throw new Error(`Minimum purchase is ${GIG_CONNECT_PRICING.oneTimeMinQuantity} credits.`);
    if (creditsGranted > GIG_CONNECT_PRICING.oneTimeMaxQuantity) throw new Error(`Maximum purchase is ${GIG_CONNECT_PRICING.oneTimeMaxQuantity} credits.`);
    if (creditsGranted * GIG_CONNECT_PRICING.oneTimeAmountInPaise !== resolvedAmount) throw new Error('Purchase amount does not match requested credits.');
  }

  existingList[idx] = {
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
  await writeJsonFile(gigConnectPurchasesPath, existingList.slice(0, 6000));
  return existingList[idx];
}
