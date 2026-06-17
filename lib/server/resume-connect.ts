import crypto from 'node:crypto';
import { getDbPool, getMongoDb } from '@/lib/server/database';
import { readJsonFile, resumeConnectPurchasesPath, writeJsonFile } from '@/lib/server/storage';
import { getRazorpayConfig, verifyRazorpayPaymentSignature } from '@/lib/server/billing';
import { consumeTalentConnectFromSubscription, getTalentConnectEntitlement } from '@/lib/server/connect-entitlements';

export type ResumeConnectMode = 'one_time' | 'monthly_pass';

export type ResumeConnectPurchase = {
  id: string;
  buyerUserId: string;
  productMode: ResumeConnectMode;
  resumeId?: string;
  resumeSlug?: string;
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

export const RESUME_CONNECT_PRICING = {
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

function clampInt(value: unknown, min: number, max: number) {
  const num = Math.round(Number(value || 0));
  return Math.max(min, Math.min(max, num));
}

type PurchaseDoc = Omit<ResumeConnectPurchase, 'razorpay'> & {
  _id: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
};

function docToPurchase(doc: PurchaseDoc): ResumeConnectPurchase {
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

function purchaseToDoc(record: ResumeConnectPurchase): PurchaseDoc {
  const { razorpay, ...rest } = record;
  return {
    ...rest,
    _id: record.id,
    razorpayOrderId: razorpay.orderId,
    razorpayPaymentId: razorpay.paymentId,
    razorpaySignature: razorpay.signature,
  };
}

export async function listBuyerPurchases(buyerUserId: string) {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<PurchaseDoc>('resume_connect_purchases')
        .find({ buyerUserId }).sort({ createdAt: -1 }).limit(120).toArray();
      return docs.map(docToPurchase);
    }
  }
  const raw = await readJsonFile<ResumeConnectPurchase[]>(resumeConnectPurchasesPath, []);
  return raw.filter((p) => p.buyerUserId === buyerUserId);
}

function isPurchaseActive(p: ResumeConnectPurchase) {
  if (p.status !== 'paid') return false;
  if (!p.validUntil) return true;
  const until = new Date(p.validUntil);
  return Number.isFinite(until.getTime()) && until.getTime() > Date.now();
}

export async function hasResumeConnectAccess(params: { buyerUserId: string; resumeId: string }) {
  const planEntitlement = await getTalentConnectEntitlement(params.buyerUserId);
  if (planEntitlement.ok) {
    return { ok: true, mode: 'subscription' as const, purchaseId: `sub:${params.buyerUserId}` };
  }

  const purchases = await listBuyerPurchases(params.buyerUserId);
  const active = purchases.filter(isPurchaseActive);

  const pass = active.find((p) => p.productMode === 'monthly_pass' && p.creditsUsed < p.creditsGranted);
  if (pass) return { ok: true, mode: 'monthly_pass' as const, purchaseId: pass.id };

  const oneTime = active.find((p) => (
    p.productMode === 'one_time'
    && (p.resumeId ? p.resumeId === params.resumeId : true)
    && p.creditsUsed < p.creditsGranted
  ));
  if (oneTime) return { ok: true, mode: 'one_time' as const, purchaseId: oneTime.id };

  return { ok: false as const };
}

export async function consumeResumeConnectCredit(params: { buyerUserId: string; purchaseId: string }) {
  if (params.purchaseId.startsWith('sub:')) {
    return consumeTalentConnectFromSubscription(params.buyerUserId);
  }

  const now = nowIso();
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const result = await db.collection<PurchaseDoc>('resume_connect_purchases').findOneAndUpdate(
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

  const raw = await readJsonFile<ResumeConnectPurchase[]>(resumeConnectPurchasesPath, []);
  const index = raw.findIndex((p) => p.id === params.purchaseId && p.buyerUserId === params.buyerUserId);
  if (index === -1) return null;
  const target = raw[index];
  if (!isPurchaseActive(target)) return null;
  if (target.creditsUsed >= target.creditsGranted) return null;
  raw[index] = { ...target, creditsUsed: target.creditsUsed + 1, updatedAt: now };
  await writeJsonFile(resumeConnectPurchasesPath, raw.slice(0, 6000));
  return raw[index];
}

export async function createResumeConnectOrder(params: {
  buyerUserId: string;
  buyerName?: string;
  buyerEmail?: string;
  mode: ResumeConnectMode;
  resumeId?: string;
  resumeSlug?: string;
  quantity?: number;
}) {
  const razorpayConfig = getRazorpayConfig();
  if (!razorpayConfig.serverConfigured) {
    throw new Error('Razorpay payment gateway is not configured.');
  }

  const mode: ResumeConnectMode = params.mode === 'monthly_pass' ? 'monthly_pass' : 'one_time';
  const isResumeSpecific = mode === 'one_time' && Boolean(params.resumeId);
  const quantity = mode === 'one_time' && !isResumeSpecific
    ? clampInt(params.quantity, RESUME_CONNECT_PRICING.oneTimeMinQuantity, RESUME_CONNECT_PRICING.oneTimeMaxQuantity)
    : 1;
  const amountInPaise = mode === 'monthly_pass'
    ? RESUME_CONNECT_PRICING.monthlyPassAmountInPaise
    : RESUME_CONNECT_PRICING.oneTimeAmountInPaise * quantity;

  const receipt = `resume_${params.buyerUserId.slice(0, 8)}_${Date.now().toString(36).slice(-8)}`;
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
        product: 'resume_connect',
        mode,
        buyerUserId: params.buyerUserId,
        resumeId: params.resumeId || '',
        resumeSlug: params.resumeSlug || '',
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
  const record: ResumeConnectPurchase = {
    id,
    buyerUserId: params.buyerUserId,
    productMode: mode,
    resumeId: params.resumeId,
    resumeSlug: params.resumeSlug,
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
      await (db.collection('resume_connect_purchases') as any).insertOne(purchaseToDoc(record));
    }
  } else {
    const existing = await readJsonFile<ResumeConnectPurchase[]>(resumeConnectPurchasesPath, []);
    await writeJsonFile(resumeConnectPurchasesPath, [record, ...existing].slice(0, 6000));
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

export async function verifyResumeConnectPayment(params: {
  buyerUserId: string;
  purchaseId: string;
  mode: ResumeConnectMode;
  resumeId?: string;
  resumeSlug?: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) {
  const isValid = verifyRazorpayPaymentSignature(params.razorpay_order_id, params.razorpay_payment_id, params.razorpay_signature);
  if (!isValid) throw new Error('Razorpay payment signature verification failed.');

  const mode: ResumeConnectMode = params.mode === 'monthly_pass' ? 'monthly_pass' : 'one_time';
  const now = new Date();
  const nowIsoValue = now.toISOString();
  const validUntil = mode === 'monthly_pass'
    ? new Date(now.getTime() + RESUME_CONNECT_PRICING.monthlyValidDays * 24 * 60 * 60 * 1000).toISOString()
    : new Date(now.getTime() + RESUME_CONNECT_PRICING.oneTimeValidDays * 24 * 60 * 60 * 1000).toISOString();

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const existing = await db.collection<PurchaseDoc>('resume_connect_purchases')
        .findOne({ _id: params.purchaseId, buyerUserId: params.buyerUserId, razorpayOrderId: params.razorpay_order_id });
      if (!existing) throw new Error('Purchase not found.');

      const storedAmount = Math.max(0, Math.round(Number(existing.amountInPaise || 0)));
      const isResumeSpecific = mode === 'one_time' && Boolean(params.resumeId || existing.resumeId);
      const resolvedAmount = mode === 'monthly_pass'
        ? RESUME_CONNECT_PRICING.monthlyPassAmountInPaise
        : isResumeSpecific ? RESUME_CONNECT_PRICING.oneTimeAmountInPaise : storedAmount;
      const creditsGranted = mode === 'monthly_pass'
        ? RESUME_CONNECT_PRICING.monthlyPassCredits
        : isResumeSpecific ? 1 : Math.round(resolvedAmount / RESUME_CONNECT_PRICING.oneTimeAmountInPaise);

      if (mode === 'one_time' && !isResumeSpecific) {
        if (creditsGranted < RESUME_CONNECT_PRICING.oneTimeMinQuantity) throw new Error(`Minimum purchase is ${RESUME_CONNECT_PRICING.oneTimeMinQuantity} credits.`);
        if (creditsGranted > RESUME_CONNECT_PRICING.oneTimeMaxQuantity) throw new Error(`Maximum purchase is ${RESUME_CONNECT_PRICING.oneTimeMaxQuantity} credits.`);
        if (creditsGranted * RESUME_CONNECT_PRICING.oneTimeAmountInPaise !== resolvedAmount) throw new Error('Purchase amount does not match requested credits.');
      }

      const updateFields: Record<string, unknown> = {
        status: 'paid',
        productMode: mode,
        amountInPaise: resolvedAmount,
        razorpayPaymentId: params.razorpay_payment_id,
        razorpaySignature: params.razorpay_signature,
        creditsGranted,
        creditsUsed: 0,
        validUntil,
        updatedAt: nowIsoValue,
      };
      if (mode === 'one_time') {
        updateFields.resumeId = params.resumeId ?? null;
        updateFields.resumeSlug = params.resumeSlug ?? null;
      }
      const updated = await db.collection('resume_connect_purchases').updateOne(
        { _id: params.purchaseId as any, buyerUserId: params.buyerUserId, razorpayOrderId: params.razorpay_order_id },
        { $set: updateFields },
      );
      if (!updated.modifiedCount) throw new Error('Purchase verification failed.');
      return { ok: true };
    }
  }

  const existingList = await readJsonFile<ResumeConnectPurchase[]>(resumeConnectPurchasesPath, []);
  const idx = existingList.findIndex((p) => p.id === params.purchaseId && p.buyerUserId === params.buyerUserId);
  if (idx === -1) throw new Error('Purchase not found.');
  const current = existingList[idx];
  if (current.razorpay.orderId !== params.razorpay_order_id) throw new Error('Purchase does not match this order.');

  const isResumeSpecific = mode === 'one_time' && Boolean(params.resumeId || current.resumeId);
  const storedAmount = Math.max(0, clampInt(current.amountInPaise, 0, 10_000_000));
  const resolvedAmount = mode === 'monthly_pass'
    ? RESUME_CONNECT_PRICING.monthlyPassAmountInPaise
    : isResumeSpecific ? RESUME_CONNECT_PRICING.oneTimeAmountInPaise : storedAmount;
  const resolvedQuantity = mode === 'monthly_pass'
    ? RESUME_CONNECT_PRICING.monthlyPassCredits
    : isResumeSpecific ? 1 : Math.round(resolvedAmount / RESUME_CONNECT_PRICING.oneTimeAmountInPaise);

  if (mode === 'one_time' && !isResumeSpecific) {
    if (resolvedQuantity < RESUME_CONNECT_PRICING.oneTimeMinQuantity) throw new Error(`Minimum purchase is ${RESUME_CONNECT_PRICING.oneTimeMinQuantity} credits.`);
    if (resolvedQuantity > RESUME_CONNECT_PRICING.oneTimeMaxQuantity) throw new Error(`Maximum purchase is ${RESUME_CONNECT_PRICING.oneTimeMaxQuantity} credits.`);
    if (resolvedQuantity * RESUME_CONNECT_PRICING.oneTimeAmountInPaise !== resolvedAmount) throw new Error('Purchase amount does not match requested credits.');
  }

  existingList[idx] = {
    ...current,
    productMode: mode,
    resumeId: mode === 'one_time' ? params.resumeId : undefined,
    resumeSlug: mode === 'one_time' ? params.resumeSlug : undefined,
    amountInPaise: resolvedAmount,
    status: 'paid',
    razorpay: {
      orderId: params.razorpay_order_id,
      paymentId: params.razorpay_payment_id,
      signature: params.razorpay_signature,
    },
    creditsGranted: resolvedQuantity,
    creditsUsed: 0,
    validUntil,
    updatedAt: nowIsoValue,
  };
  await writeJsonFile(resumeConnectPurchasesPath, existingList.slice(0, 6000));
  return existingList[idx];
}

export async function resolveResumeSlugForId(resumeId?: string, resumeSlug?: string) {
  if (resumeSlug) return resumeSlug;
  if (!resumeId) return '';
  return '';
}
