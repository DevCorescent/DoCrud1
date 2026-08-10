/**
 * Canonical Docrud Infinity plan values — client-safe (no server imports).
 *
 * These are the single source of truth re-exported by `lib/server/infinity.ts`
 * and `lib/server/drive-storage.ts`, and consumed directly by client components
 * (Storage Plans UI) so plan name / storage / pricing can never drift apart.
 */

/** Storage every account gets with no paid plan — 500 MB */
export const FREE_DRIVE_GB = 0.5;

/** Drive storage included with Docrud Infinity */
export const INFINITY_DRIVE_GB = 5;

export const INFINITY_MONTHLY_PAISE = 29900;   // ₹299
export const INFINITY_ANNUAL_PAISE  = 249900;  // ₹2,499

export const INFINITY_MONTHLY_RUPEES = INFINITY_MONTHLY_PAISE / 100;
export const INFINITY_ANNUAL_RUPEES  = INFINITY_ANNUAL_PAISE  / 100;

/** Discount of the annual plan vs. 12× monthly, rounded — e.g. 30 (%) */
export const INFINITY_ANNUAL_SAVING_PCT = Math.round(
  100 - (INFINITY_ANNUAL_PAISE / (INFINITY_MONTHLY_PAISE * 12)) * 100,
);

export const INFINITY_PLAN_LABEL = 'Docrud Infinity';
export const FREE_PLAN_LABEL     = 'Free';
