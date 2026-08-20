/**
 * The free-Premium launch allocation.
 *
 * "Granted free" is deliberately the same condition the Super Admin dashboard
 * already reports as `infinityFree`: an active Docrud Infinity subscription
 * that was handed out rather than bought. Free grants come from Super Admin
 * (app/api/super-admin/users) and from referral rewards
 * (lib/server/referrals), both of which set grantedFree: true; a purchase
 * through /api/billing/infinity never does. So paid subscribers are not
 * counted against the allocation, which is what the offer promises.
 *
 * Only the aggregate ever leaves the server — never who those users are.
 */
import { getAllProfiles } from '@/lib/server/user-profiles';

/** The launch allocation. Defined once, server-side. */
export const TOTAL_FREE_PREMIUM_SPOTS = 5000;

export type FreePremiumSpots = {
  spotsLeft: number;
  totalSpots: number;
};

/* Counting walks every profile, and the banner asks on each page load, so the
   result is memoised briefly — the same pattern /api/public/ad-banners uses.
   A minute of staleness on a launch counter is not worth a full scan per view. */
const CACHE_TTL = 60_000;
let cache: { value: FreePremiumSpots; ts: number } | null = null;

type ProfileEntry = { docrudInfinity?: boolean; docrudInfinityGrantedFree?: boolean };

export async function getFreePremiumSpots(): Promise<FreePremiumSpots> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.value;

  const profiles = await getAllProfiles();
  const granted = (Object.values(profiles) as ProfileEntry[]).filter(
    (p) => p?.docrudInfinity === true && p?.docrudInfinityGrantedFree === true,
  ).length;

  /* Clamped, so an over-allocation can never render as a negative promise. */
  const value: FreePremiumSpots = {
    spotsLeft: Math.max(0, TOTAL_FREE_PREMIUM_SPOTS - granted),
    totalSpots: TOTAL_FREE_PREMIUM_SPOTS,
  };
  cache = { value, ts: Date.now() };
  return value;
}
