/**
 * Public freshness for SCRAPED jobs — IMPLEMENTED BUT NOT ACTIVATED.
 *
 * ═══ THE RULE ═══
 *
 * A scraped posting stays publicly visible for 168 hours after the last time a
 * SUCCESSFUL scrape observed it on its board. The clock is `lastSeenAt`, which
 * `markSeen` stamps only on postings a source run actually matched — never on
 * a run that failed, was skipped, or returned nothing.
 *
 * ═══ WHAT THE CLOCK IS NOT ═══
 *
 *   ingestedAt / createdAt   when WE first stored it. A board that lists a job
 *                            for a year would have it expire at day seven.
 *   expiresAt                a TOMBSTONE. `isJobActive` and the public query
 *                            both treat ANY value as "gone". Writing
 *                            lastSeenAt + 168h into it would hide every job on
 *                            the site the moment it was materialised. It is
 *                            never read or written here.
 *   postedAt                 what the source claims. Not evidence of presence.
 *
 * ═══ WHY IT IS OFF ═══
 *
 * Measured on the live corpus: 4,646 of 6,475 scraped postings carry a
 * lastSeenAt older than 168h. They are stale because only two boards are
 * enabled and no timer refreshes them — not because they left their boards.
 * Activating this before real scrape cycles renew `lastSeenAt` would remove
 * 71.7% of the public corpus on deploy. So the filter ships behind
 * PUBLIC_FRESHNESS_ENABLED, exactly-"true" semantics, default OFF, and the
 * decision to turn it on is gated on evidence from `scripts/freshness-dry-run.ts`
 * after the scraper has demonstrably been renewing jobs.
 *
 * ═══ UNKNOWN IS NOT STALE ═══
 *
 * A posting whose lastSeenAt is missing or unparseable has UNKNOWN freshness.
 * It is neither hidden nor renewed here; 628 such postings exist today and
 * their treatment is a later, explicit decision. Turning "we don't know" into
 * "expired" is precisely the failure mode this codebase keeps refusing.
 *
 * Every predicate takes `now` as a parameter. None calls Date.now(): a rule
 * that reads the clock cannot be tested at a boundary, and the boundary is the
 * whole point.
 */
import type { HiringJobPosting } from '@/types/document';
import { isSourcedJob } from './lifecycle';
import type { FieldRef } from '@/lib/server/db/public-jobs-query';

/** 168 hours, as elapsed milliseconds. Not calendar days — no timezone can move it. */
export const PUBLIC_FRESHNESS_MS = 168 * 60 * 60 * 1000;

/**
 * Whether the public filter is switched on.
 *
 * Exactly the string "true". "TRUE", "1", "yes", "" and absent are all OFF, so
 * a mistyped value fails towards the behaviour production has always had.
 * Read at CALL time, never cached at import, so a test can flip it and so the
 * server's answer reflects its environment rather than its start-up.
 */
export function publicFreshnessEnabled(): boolean {
  return process.env.PUBLIC_FRESHNESS_ENABLED === 'true';
}

/**
 * Is this posting subject to the scraped-job freshness rule?
 *
 * Reuses the ONE existing ownership test. A second definition of "scraped" is
 * how the lifecycle sweep and the public feed would start disagreeing about
 * the same document.
 */
export function isScrapedJob(job: Partial<HiringJobPosting>): boolean {
  return isSourcedJob(job);
}

/**
 * Milliseconds since the last successful observation, or null when unknown.
 *
 *   missing lastSeenAt      -> null   (not 0, not infinity)
 *   malformed lastSeenAt    -> null   (a bad string is not evidence of age)
 *   future lastSeenAt       -> 0      (the existing lifecycle convention:
 *                                      "a future timestamp yields 0, not a
 *                                      negative age" — see jobAgeMs)
 */
export function freshnessAgeMs(job: Partial<HiringJobPosting>, now: number): number | null {
  const raw = job.lastSeenAt;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, now - at);
}

export type FreshnessState =
  /** Not a scraped posting; the rule does not apply. */
  | 'exempt'
  /** Observed within the window. */
  | 'fresh'
  /** Last observed 168h or more ago. */
  | 'stale'
  /** No usable lastSeenAt. Deliberately neither fresh nor stale. */
  | 'unknown';

export function freshnessState(job: Partial<HiringJobPosting>, now: number): FreshnessState {
  if (!isScrapedJob(job)) return 'exempt';
  const age = freshnessAgeMs(job, now);
  if (age === null) return 'unknown';
  /* The boundary: strictly less than 168h is fresh; 168h exactly is stale.
     167h59m59s -> fresh, 168h -> stale, 168h+1ms -> stale. */
  return age < PUBLIC_FRESHNESS_MS ? 'fresh' : 'stale';
}

/**
 * May the public see this posting, as far as freshness is concerned?
 *
 * Only `stale` says no. `exempt` (manual/employer) and `unknown` both say yes —
 * the first because the rule does not apply, the second because absence of
 * evidence is not evidence of absence. Everything else about visibility
 * (published, isActive, the expiresAt tombstone) is decided by `isJobActive`
 * and is NOT re-decided here.
 */
export function isPubliclyFresh(job: Partial<HiringJobPosting>, now: number): boolean {
  return freshnessState(job, now) !== 'stale';
}

/* ── The same rule, as an aggregation expression ─────────────────────────*/

/**
 * `freshnessState(job, now) === 'stale'`, for the public query.
 *
 * Built through `FieldRef` like every other public condition, so the
 * array-shape and document-shape pipelines get the identical clause. Mirrors
 * the pure predicate case by case:
 *
 *   sourced      $eq source 'scraper' OR sourceId non-empty   (isSourcedJob)
 *   seen         $dateFromString with onError/onNull -> null   (missing or
 *                malformed becomes null, i.e. UNKNOWN, i.e. NOT stale)
 *   stale        seen != null AND now - seen >= 168h          (future -> negative
 *                -> not >= -> fresh, matching the age-0 convention)
 *
 * `now` is a parameter for the same reason it is on the predicates.
 */
export function staleCond(ref: FieldRef, now: number): Record<string, unknown> {
  return {
    $let: {
      vars: {
        seen: {
          $dateFromString: { dateString: ref('lastSeenAt'), onError: null, onNull: null },
        },
      },
      in: {
        $and: [
          {
            $or: [
              { $eq: [ref('source'), 'scraper'] },
              { $gt: [{ $strLenCP: { $ifNull: [ref('sourceId'), ''] } }, 0] },
            ],
          },
          { $ne: ['$$seen', null] },
          { $gte: [{ $subtract: [new Date(now), '$$seen'] }, PUBLIC_FRESHNESS_MS] },
        ],
      },
    },
  };
}

/** `isPubliclyFresh`, for the public query: everything that is not stale. */
export function publiclyFreshCond(ref: FieldRef, now: number): Record<string, unknown> {
  return { $not: [staleCond(ref, now)] };
}
