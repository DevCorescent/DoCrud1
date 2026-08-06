import { getProfileData, updateProfileData } from '@/lib/server/user-profiles';
import { getDbPool, getMongoDb } from '@/lib/server/database';

/* ── Constants ──────────────────────────────────────────────────── */

export const INFINITY_MONTHLY_PAISE = 29900;    // ₹299
export const INFINITY_ANNUAL_PAISE  = 249900;   // ₹2,499
export const INFINITY_DRIVE_GB      = 5;

/** Billing + admin grant periods */
export type InfinityPeriod = 'monthly' | '3m' | '6m' | 'annual';

export const INFINITY_PERIODS: InfinityPeriod[] = ['monthly', '3m', '6m', 'annual'];

/** Days added per billing period */
export const PERIOD_DAYS: Record<InfinityPeriod, number> = {
  monthly: 30,   // 1 month
  '3m':    90,   // 3 months
  '6m':    180,  // 6 months
  annual:  365,  // 1 year
};

export const PERIOD_LABELS: Record<InfinityPeriod, string> = {
  monthly: '1 month',
  '3m':    '3 months',
  '6m':    '6 months',
  annual:  'Annual',
};

export function normalizeInfinityPeriod(value: unknown): InfinityPeriod {
  if (value === '3m' || value === '6m' || value === 'annual' || value === 'monthly') return value;
  return 'monthly';
}

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
  period?: InfinityPeriod;
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
  if (!userId) return false;
  const s = await getInfinityStatus(userId);
  return s.active;
}

/** Infinity check that resolves the canonical user id from the session (email-first). */
export async function hasInfinityForSession(
  session: { user?: { id?: string | null; email?: string | null } } | null | undefined,
): Promise<boolean> {
  const { resolveSessionUserId } = await import('@/lib/server/auth');
  const userId = await resolveSessionUserId(session);
  if (!userId) return false;
  return hasInfinity(userId);
}

/* ── Write ──────────────────────────────────────────────────────── */

interface ActivateOpts {
  period?:     InfinityPeriod;
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
  const period  = normalizeInfinityPeriod(opts.period);
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
  period?:      InfinityPeriod;
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
          period:       p.docrudInfinityPeriod as InfinityPeriod | undefined,
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
