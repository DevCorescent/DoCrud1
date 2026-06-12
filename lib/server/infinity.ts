import { getProfileData, updateProfileData } from '@/lib/server/user-profiles';
import { getDbPool } from '@/lib/server/database';

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
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<{
      user_id: string;
      email:   string;
      name:    string | null;
      record:  Record<string, unknown>;
    }>(`
      SELECT
        up.user_id,
        u.email,
        u.name,
        up.full_record AS record
      FROM user_profiles up
      JOIN users u ON u.id = up.user_id
      WHERE (up.full_record->>'docrudInfinity')::boolean = true
      ORDER BY up.full_record->>'docrudInfinityPurchasedAt' DESC NULLS LAST
    `);

    const now = Date.now();
    return result.rows.map((row) => {
      const r = row.record as Record<string, unknown>;
      const expiresAt = r.docrudInfinityExpiresAt as string | undefined;
      const isExpired = !!expiresAt && new Date(expiresAt).getTime() < now;
      return {
        userId:       row.user_id,
        email:        row.email,
        name:         row.name ?? undefined,
        active:       !isExpired,
        isExpired,
        period:       r.docrudInfinityPeriod as 'monthly' | 'annual' | undefined,
        purchasedAt:  r.docrudInfinityPurchasedAt as string | undefined,
        expiresAt,
        renewalCount: (r.docrudInfinityRenewalCount as number) ?? 0,
        grantedFree:  !!(r.docrudInfinityGrantedFree),
      };
    });
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
