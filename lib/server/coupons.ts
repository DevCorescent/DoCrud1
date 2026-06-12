import crypto from 'node:crypto';
import { couponCodesPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';

export type Coupon = {
  id: string;
  code: string;
  percentOff: number; // 0-100
  active: boolean;
  maxRedemptions?: number;
  redeemedCount: number;
  validFrom?: string;
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeCode(code: string) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 32);
}

export async function listCoupons() {
  const raw = await readJsonFile<Coupon[]>(couponCodesPath, []);
  return raw
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 2000);
}

export async function createCoupon(params: { code?: string; percentOff: number; maxRedemptions?: number; validUntil?: string }) {
  const percentOff = Math.max(1, Math.min(90, Math.round(Number(params.percentOff || 0))));
  const code = normalizeCode(params.code || `OFF${percentOff}`);
  if (!code) throw new Error('Coupon code is required.');

  const coupons = await listCoupons();
  if (coupons.some((c) => c.code === code)) {
    throw new Error('Coupon code already exists.');
  }

  const now = nowIso();
  const coupon: Coupon = {
    id: crypto.randomUUID(),
    code,
    percentOff,
    active: true,
    maxRedemptions: params.maxRedemptions ? Math.max(1, Math.round(Number(params.maxRedemptions))) : undefined,
    redeemedCount: 0,
    validFrom: now,
    validUntil: params.validUntil ? new Date(params.validUntil).toISOString() : undefined,
    createdAt: now,
    updatedAt: now,
  };

  await writeJsonFile(couponCodesPath, [coupon, ...coupons].slice(0, 5000));
  return coupon;
}

export async function setCouponActive(id: string, active: boolean) {
  const coupons = await listCoupons();
  const now = nowIso();
  const next = coupons.map((c) => (c.id === id ? { ...c, active: Boolean(active), updatedAt: now } : c));
  await writeJsonFile(couponCodesPath, next.slice(0, 5000));
  return next.find((c) => c.id === id) || null;
}

export async function validateCoupon(code: string) {
  const normalized = normalizeCode(code);
  if (!normalized) return { ok: false as const, reason: 'Invalid coupon code.' };
  const coupons = await listCoupons();
  const coupon = coupons.find((c) => c.code === normalized) || null;
  if (!coupon || !coupon.active) return { ok: false as const, reason: 'Coupon not available.' };

  const now = Date.now();
  if (coupon.validFrom) {
    const from = new Date(coupon.validFrom).getTime();
    if (Number.isFinite(from) && now < from) return { ok: false as const, reason: 'Coupon not active yet.' };
  }
  if (coupon.validUntil) {
    const until = new Date(coupon.validUntil).getTime();
    if (Number.isFinite(until) && now > until) return { ok: false as const, reason: 'Coupon expired.' };
  }
  if (coupon.maxRedemptions && coupon.redeemedCount >= coupon.maxRedemptions) {
    return { ok: false as const, reason: 'Coupon redemption limit reached.' };
  }

  return { ok: true as const, coupon };
}

export async function markCouponRedeemed(code: string) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  const coupons = await listCoupons();
  const now = nowIso();
  let updated: Coupon | null = null;
  const next = coupons.map((c) => {
    if (c.code !== normalized) return c;
    updated = { ...c, redeemedCount: Math.max(0, Math.round(c.redeemedCount || 0)) + 1, updatedAt: now };
    return updated;
  });
  if (!updated) return null;
  await writeJsonFile(couponCodesPath, next.slice(0, 5000));
  return updated;
}

