import { getProfileData, getAllProfiles, updateProfileData, atomicMutateProfileJson, type UserProfileData } from '@/lib/server/user-profiles';
import { getDbPool, getMongoDb } from '@/lib/server/database';
import {
  INFINITY_MONTHLY_PAISE,
  INFINITY_ANNUAL_PAISE,
  INFINITY_DRIVE_GB,
} from '@/lib/infinity-plan';

/* ── Constants ──────────────────────────────────────────────────── */

// Canonical values live in lib/infinity-plan.ts (client-safe) and are re-exported
// here so existing importers of this module keep working unchanged.
export { INFINITY_MONTHLY_PAISE, INFINITY_ANNUAL_PAISE, INFINITY_DRIVE_GB };

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
/**
 * The exact profile patch an activation/renewal writes, given the CURRENT
 * profile. Extracted so activateInfinity() and the atomic bulk path
 * (activateInfinityIfInactive) compute expiry/renewal IDENTICALLY — there is
 * one definition of Infinity semantics, not two.
 */
function computeInfinityActivationFields(
  profile: UserProfileData,
  opts: ActivateOpts,
  now: Date,
): Partial<UserProfileData> {
  const period = normalizeInfinityPeriod(opts.period);
  const days   = PERIOD_DAYS[period];

  const isRenewal = !!profile.docrudInfinity;

  // For renewals: extend from current expiry if still valid, else extend from now
  const baseDate = isRenewal && profile.docrudInfinityExpiresAt
    ? (() => {
        const exp = new Date(profile.docrudInfinityExpiresAt);
        return exp.getTime() > now.getTime() ? exp : now;
      })()
    : now;

  const expiresAt = addDays(baseDate, days);

  return {
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
  };
}

export async function activateInfinity(userId: string, opts: ActivateOpts = {}): Promise<void> {
  const profile = await getProfileData(userId);
  await updateProfileData(userId, computeInfinityActivationFields(profile, opts, new Date()));
}

/**
 * Activate Infinity for a user ONLY IF they are not already active — atomically.
 * Returns true if this call activated them, false if they were already active
 * (or a concurrent racer activated them first).
 *
 * This closes the bulk-activation TOCTOU: the "is this user already premium?"
 * check and the write happen as ONE indivisible step, so two concurrent bulk
 * requests can never both activate/renew the same user.
 *
 *  - Mongo: a single conditional updateOne. The filter encodes "not active"
 *    (no Infinity, or expired). Only the first racer matches and writes; the
 *    second finds nothing to match and, on the upsert path, hits a duplicate
 *    _id (11000) — either way it is a no-op. Atomic across processes/instances.
 *  - JSON: the read-check-write runs inside the storage write lock, so on this
 *    single process no other writer can interleave.
 *
 * Fields are computed by the SAME computeInfinityActivationFields() used by
 * activateInfinity(), so expiry/renewal/grantedFree semantics are identical.
 */
export async function activateInfinityIfInactive(userId: string, opts: ActivateOpts = {}): Promise<boolean> {
  if (getDbPool()) {
    const now = new Date();
    const profile = await getProfileData(userId);
    // Fast path: already active → never touch it (also spares an exception).
    if (profileHasActiveInfinity(profile, now.getTime())) return false;

    const fields = computeInfinityActivationFields(profile, opts, now);
    const db = await getMongoDb();
    if (!db) {
      // No Mongo handle despite a pool: fall back to the non-atomic path rather
      // than fail the whole bulk. Logged so the degraded mode is visible.
      console.warn('[infinity] activateInfinityIfInactive: no Mongo db handle, using non-atomic activate');
      await updateProfileData(userId, fields);
      return true;
    }
    const nowIso = now.toISOString();
    // CAS guard: write only while the user is still not active. `$lt` on the
    // ISO expiry is a chronological compare (all our timestamps are ...Z ISO).
    const notActive = {
      _id: userId,
      $or: [
        { docrudInfinity: { $ne: true } },
        { docrudInfinityExpiresAt: { $lt: nowIso } },
      ],
    } as Record<string, unknown>;
    try {
      const res = await db.collection('user_profiles').updateOne(
        notActive,
        { $set: { ...fields, updatedAt: nowIso } },
        { upsert: true },
      );
      return (res.upsertedCount ?? 0) > 0 || (res.modifiedCount ?? 0) > 0 || (res.matchedCount ?? 0) > 0;
    } catch (err: unknown) {
      // A concurrent racer created/activated the row first → duplicate _id.
      if ((err as { code?: number })?.code === 11000) return false;
      throw err;
    }
  }

  // JSON store: the guard + write are one serialized critical section.
  return atomicMutateProfileJson(userId, (current) => {
    if (profileHasActiveInfinity(current, Date.now())) return null; // already active → skip
    return computeInfinityActivationFields(current, opts, new Date());
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

/* ── Bulk grant (Super Admin) ───────────────────────────────────────
 *
 * "Active Infinity" is decided the SAME way getInfinityStatus() decides it:
 * the flag is on AND the expiry has not passed. The server is the only place
 * this is evaluated — the browser never sends a user list or a premium status.
 */

/** Whether a profile currently has ACTIVE (non-expired) Infinity. */
function profileHasActiveInfinity(
  p: { docrudInfinity?: boolean; docrudInfinityExpiresAt?: string } | undefined,
  now: number,
): boolean {
  if (!p?.docrudInfinity) return false;
  if (p.docrudInfinityExpiresAt && new Date(p.docrudInfinityExpiresAt).getTime() < now) return false;
  return true;
}

/**
 * Every real user with their current active-Infinity status, computed
 * server-side. A user with no profile row simply has no Infinity (eligible).
 * This is the single source of truth for both the counts and the bulk grant, so
 * the two can never disagree about who is eligible.
 */
async function loadUserInfinityState(): Promise<{ userIds: string[]; activeById: Map<string, boolean> }> {
  const { getStoredUsers } = await import('@/lib/server/auth');
  const [users, profiles] = await Promise.all([getStoredUsers(), getAllProfiles()]);
  const now = Date.now();
  const activeById = new Map<string, boolean>();
  for (const u of users) activeById.set(u.id, profileHasActiveInfinity(profiles[u.id], now));
  return { userIds: users.map((u) => u.id), activeById };
}

export interface InfinityCounts {
  totalUsers: number;
  /** Users with ACTIVE (non-expired) Infinity right now. */
  premiumCount: number;
  /** Everyone else — the exact set the bulk grant would activate. */
  nonPremiumCount: number;
}

export async function getInfinityCounts(): Promise<InfinityCounts> {
  const { userIds, activeById } = await loadUserInfinityState();
  const premiumCount = userIds.reduce((n, id) => n + (activeById.get(id) ? 1 : 0), 0);
  return { totalUsers: userIds.length, premiumCount, nonPremiumCount: userIds.length - premiumCount };
}

export interface BulkActivateResult {
  totalUsers: number;
  /** Users skipped because they already had active Infinity (idempotency). */
  alreadyPremiumCount: number;
  /** Users actually activated by this run. */
  activatedCount: number;
  /** Users whose activation threw (kept honest; the rest still succeed). */
  failedCount: number;
}

/**
 * Grants Infinity to every user who does NOT currently have active Infinity,
 * reusing the exact single-user activateInfinity() path (same period, expiry and
 * grantedFree semantics as a manual admin grant / referral bonus). Users who are
 * already active are left completely untouched, which makes a second run a no-op
 * (0 activated) — the idempotency guarantee.
 */
export async function bulkActivateInfinityForNonPremium(
  opts: { period?: InfinityPeriod } = {},
): Promise<BulkActivateResult> {
  const { userIds } = await loadUserInfinityState();
  const period = normalizeInfinityPeriod(opts.period);

  let activatedCount = 0;
  let alreadyPremiumCount = 0;
  let failedCount = 0;
  // Every user goes through the ATOMIC check-and-activate. Eligibility is no
  // longer decided from a pre-scan snapshot (which a concurrent request could
  // race) — each user's "already active?" test and write are one atomic step,
  // so two concurrent bulk runs activate each user at most once.
  for (const id of userIds) {
    try {
      const didActivate = await activateInfinityIfInactive(id, { period, grantedFree: true });
      if (didActivate) activatedCount += 1;
      else alreadyPremiumCount += 1;
    } catch (err) {
      console.error('[infinity] bulk activation failed for user', id, err);
      failedCount += 1;
    }
  }

  return {
    totalUsers: userIds.length,
    alreadyPremiumCount,
    activatedCount,
    failedCount,
  };
}
