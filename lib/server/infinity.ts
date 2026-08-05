import { getProfileData, updateProfileData } from '@/lib/server/user-profiles';
import { getDbPool, getMongoDb } from '@/lib/server/database';

/* ── Constants ──────────────────────────────────────────────────── */

export const INFINITY_MONTHLY_PAISE = 29900;    // ₹299
export const INFINITY_ANNUAL_PAISE  = 249900;   // ₹2,499
export const INFINITY_DRIVE_GB      = 5;

/** Days added per billing period */
const PERIOD_DAYS: Record<'monthly' | 'annual', number> = {
  monthly: 30,
  annual:  365,
};

function addDays(from: Date, days: number): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/* ── Types ──────────────────────────────────────────────────────── */

export interface InfinityStatus {
  active: boolean;
  isExpired: boolean;
  purchasedAt?: string;
  expiresAt?: string;
  period?: 'monthly' | 'annual';
  renewalCount?: number;
  grantedFree?: boolean;
  orderId?: string;
  paymentId?: string;
}

/* ── Read ───────────────────────────────────────────────────────── */

export async function getInfinityStatus(userId: string): Promise<InfinityStatus> {
  const profile = await getProfileData(userId);

  const active      = !!profile.docrudInfinity;
  const expiresAt   = profile.docrudInfinityExpiresAt;
  const isExpired   = active && !!expiresAt && new Date(expiresAt).getTime() < Date.now();

  return {
    active: active && !isExpired,
    isExpired,
    purchasedAt:  profile.docrudInfinityPurchasedAt,
    expiresAt,
    period:       profile.docrudInfinityPeriod,
    renewalCount: profile.docrudInfinityRenewalCount ?? 0,
    grantedFree:  profile.docrudInfinityGrantedFree,
    orderId:      profile.docrudInfinityOrderId,
    paymentId:    profile.docrudInfinityPaymentId,
  };
}

export async function hasInfinity(userId: string): Promise<boolean> {
  const s = await getInfinityStatus(userId);
  return s.active;
}

/* ── Write ──────────────────────────────────────────────────────── */

interface ActivateOpts {
  period?:     'monthly' | 'annual';
  grantedFree?: boolean;
  orderId?:    string;
  paymentId?:  string;
}

/**
 * Activates or renews Docrud Infinity for a user.
 * - First purchase: sets purchasedAt, expiresAt, period, orderId, paymentId
 * - Renewal: extends expiresAt from current expiry (or now if already expired),
 *   increments renewalCount, updates orderId/paymentId
 */
export async function activateInfinity(userId: string, opts: ActivateOpts = {}): Promise<void> {
  const profile = await getProfileData(userId);
  const period  = opts.period ?? 'monthly';
  const days    = PERIOD_DAYS[period];
  const now     = new Date();

  const isRenewal = !!profile.docrudInfinity;

  // For renewals: extend from current expiry if still valid, else extend from now
  const baseDate = isRenewal && profile.docrudInfinityExpiresAt
    ? (() => {
        const exp = new Date(profile.docrudInfinityExpiresAt);
        return exp.getTime() > now.getTime() ? exp : now;
      })()
    : now;

  const expiresAt = addDays(baseDate, days);

  await updateProfileData(userId, {
    docrudInfinity:              true,
    docrudGo:                    true,   // ensures badge shows in nav immediately
    docrudInfinityPurchasedAt:   profile.docrudInfinityPurchasedAt ?? now.toISOString(),
    docrudInfinityPeriod:        period,
    docrudInfinityExpiresAt:     expiresAt,
    docrudInfinityRenewedAt:     now.toISOString(),
    docrudInfinityRenewalCount:  (profile.docrudInfinityRenewalCount ?? 0) + (isRenewal ? 1 : 0),
    docrudInfinityGrantedFree:   opts.grantedFree ?? profile.docrudInfinityGrantedFree,
    docrudInfinityOrderId:       opts.orderId  ?? profile.docrudInfinityOrderId,
    docrudInfinityPaymentId:     opts.paymentId ?? profile.docrudInfinityPaymentId,
    // Drive storage from Infinity (5 GB)
    docrudDrivePlanId:           'infinity',
    docrudDrivePlanGb:           INFINITY_DRIVE_GB,
    docrudDrivePlanPurchasedAt:  profile.docrudDrivePlanPurchasedAt ?? now.toISOString(),
    docrudDrivePlanPeriod:       period,
  });
}

/** Revokes Infinity access for a user (keeps purchase history fields for audit). */
export async function deactivateInfinity(userId: string): Promise<void> {
  await updateProfileData(userId, {
    docrudInfinity: false,
    docrudInfinityGrantedFree: false,
    docrudInfinityExpiresAt: new Date().toISOString(),
  });
}

/* ── Admin helpers ──────────────────────────────────────────────── */

export interface InfinitySubscriber {
  userId:       string;
  email:        string;
  name?:        string;
  active:       boolean;
  isExpired:    boolean;
  period?:      'monthly' | 'annual';
  purchasedAt?: string;
  expiresAt?:   string;
  renewalCount: number;
  grantedFree:  boolean;
}

/**
 * Returns all users who have ever had Infinity activated.
 * Uses Postgres when available for efficiency; falls back to full user scan.
 */
export async function listInfinitySubscribers(): Promise<InfinitySubscriber[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const profiles = await db.collection<Record<string, unknown> & { _id: string }>('user_profiles')
        .find({ docrudInfinity: true })
        .sort({ docrudInfinityPurchasedAt: -1 })
        .toArray();
      const userIds = profiles.map((p) => p._id);
      const userDocs = await db.collection<{ _id: string; email: string; name?: string }>('users')
        .find({ _id: { $in: userIds } }).toArray();
      const userMap = Object.fromEntries(userDocs.map((u) => [u._id, u]));
      const now = Date.now();
      return profiles.map((p) => {
        const u = userMap[p._id as string];
        const expiresAt = p.docrudInfinityExpiresAt as string | undefined;
        const isExpired = !!expiresAt && new Date(expiresAt).getTime() < now;
        return {
          userId:       p._id as string,
          email:        u?.email ?? '',
          name:         (u?.name) ?? undefined,
          active:       !isExpired,
          isExpired,
          period:       p.docrudInfinityPeriod as 'monthly' | 'annual' | undefined,
          purchasedAt:  p.docrudInfinityPurchasedAt as string | undefined,
          expiresAt,
          renewalCount: (p.docrudInfinityRenewalCount as number) ?? 0,
          grantedFree:  !!(p.docrudInfinityGrantedFree),
        };
      });
    }
  }

  // JSON fallback — scan all users
  const { getStoredUsers } = await import('@/lib/server/auth');
  const { getProfileData } = await import('@/lib/server/user-profiles');
  const users = await getStoredUsers();
  const now   = Date.now();

  const results: InfinitySubscriber[] = [];
  for (const user of users) {
    const profile = await getProfileData(user.id);
    if (!profile.docrudInfinity) continue;
    const expiresAt = profile.docrudInfinityExpiresAt;
    const isExpired = !!expiresAt && new Date(expiresAt).getTime() < now;
    results.push({
      userId:       user.id,
      email:        user.email,
      name:         user.name,
      active:       !isExpired,
      isExpired,
      period:       profile.docrudInfinityPeriod,
      purchasedAt:  profile.docrudInfinityPurchasedAt,
      expiresAt,
      renewalCount: profile.docrudInfinityRenewalCount ?? 0,
      grantedFree:  !!profile.docrudInfinityGrantedFree,
    });
  }
  return results.sort((a, b) =>
    (b.purchasedAt ?? '').localeCompare(a.purchasedAt ?? ''),
  );
}
