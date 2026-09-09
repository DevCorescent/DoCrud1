/**
 * Whether a recommendation request is answered from the precomputed store.
 *
 * ═══ THE FLAG ═══
 *
 *     RECOMMENDATION_READ_FROM_PRECOMPUTED=true    serve stored results
 *     anything else (or absent)                    compute LIVE   ← DEFAULT
 *
 * Same shape as JOB_READ_FROM_HIRING_JOBS, deliberately: server-side only, read
 * from the environment and never from a request, so no query parameter, header
 * or body can make one viewer read from a different place than another. Exactly
 * the string "true" enables it; a malformed, empty or missing value is OFF, and
 * OFF is the path that has been serving production all along.
 *
 * ROLLBACK IS THE FLAG. Setting it back to false restores live computation on
 * the next request — no deploy and no data movement, because nothing here
 * WRITES anything. The store is filled by the scheduler either way.
 *
 * ═══ WHY THIS RETURNS null SO OFTEN ═══
 *
 * A precomputed read is an OPTIMISATION, not a source of truth. Every condition
 * that could make the stored answer wrong — stale versions, a missing record, a
 * signed-out viewer, a storage failure — returns null, and null means "the
 * caller must compute live". It never means "no matches".
 *
 * That is the one distinction this file exists to preserve. Returning an empty
 * payload on a storage failure would turn an outage into a member being told
 * they match nothing, which is the exact failure Phase 2.4 removed from the
 * jobs read path. A null costs a live recompute; an empty array costs trust.
 *
 * ═══ WHAT IS NEVER SERVED FROM HERE ═══
 *
 * The personalized scope. It excludes applied jobs and carries ATS results,
 * both of which change without the profile or corpus changing, so a version
 * triple cannot prove a stored copy still correct. It stays live.
 */
import {
  freshnessOf, readRecommendationRecord,
  type RecommendationResultRecord, type RecommendationScope,
} from '@/lib/server/db/recommendation-results';
import { reconstructRecommendedCards } from '@/lib/server/recommendation-reconstruct';

export type RecommendationReadSource = 'live' | 'precomputed';

/** Exactly "true" enables it. Everything else, including absence, is OFF. */
export function recommendationReadSource(): RecommendationReadSource {
  return process.env.RECOMMENDATION_READ_FROM_PRECOMPUTED === 'true' ? 'precomputed' : 'live';
}

/** Why a request fell back to live. Recorded for the rollout, never returned
    to the client — it would describe another member's storage state. */
export type FallbackReason =
  | 'flag_off' | 'anonymous' | 'missing' | 'stale' | 'read_failed' | 'jobs_missing';

export interface PrecomputedRead {
  jobs: Array<Record<string, unknown>>;
  total: number;
  /** Which store answered, for logging and the equivalence sampling. */
  source: 'precomputed';
  generatedAt: string;
}

export interface PrecomputedReadOptions {
  profileVersion: number;
  corpusVersion: string;
  /** Test seam. */
  readRecord?: typeof readRecommendationRecord;
}

/**
 * The stored record for this viewer, but only if it is provably current.
 *
 * Deliberately does NOT render cards. The record names its job ids, and the
 * caller needs them to fetch just those postings — fetching the corpus first
 * would spend the saving this store exists to create. So freshness is settled
 * here, cheaply, and rendering happens after.
 *
 * Returns null — meaning "compute live" — for every reason a stored answer
 * could be wrong or absent. `onFallback` is told which, so a rollout can see
 * whether misses are freshness (expected, transient) or read failures (not).
 */
export async function readFreshRecommendationRecord(
  userId: string | null,
  scope: RecommendationScope,
  options: PrecomputedReadOptions,
  onFallback?: (reason: FallbackReason) => void,
): Promise<RecommendationResultRecord | null> {
  const decline = (reason: FallbackReason) => { onFallback?.(reason); return null; };

  if (recommendationReadSource() !== 'precomputed') return decline('flag_off');
  /* A signed-out viewer has no stored record and must not be given anyone
     else's. There is no shared/anonymous recommendation record by design. */
  if (!userId) return decline('anonymous');

  let record: RecommendationResultRecord | null;
  try {
    record = await (options.readRecord ?? readRecommendationRecord)(userId, scope);
  } catch (error) {
    /* The store is down. Fall back to the live path, which is slower but
       correct — NOT to an empty result, which would be fast and wrong. */
    console.error('[recommendations] precomputed read failed; falling back to live', error);
    return decline('read_failed');
  }

  if (!record) return decline('missing');
  if (freshnessOf(record, {
    profileVersion: options.profileVersion,
    corpusVersion: options.corpusVersion,
  }) !== 'fresh') return decline('stale');
  return record;
}

/**
 * Render a fresh record into the exact payload the live path produces.
 *
 * Cards are rebuilt from the CURRENT postings, so a job edited since it was
 * scored renders its current text; only the ranking is remembered.
 *
 * Returns null when the postings could not be loaded, or when every stored
 * posting has vanished — a record that is fresh by version but empty in
 * substance is not the same as "no matches", so the caller recomputes.
 */
export function renderPrecomputed(
  record: RecommendationResultRecord,
  canonicalById: ReadonlyMap<string, Record<string, unknown>> | null,
  onFallback?: (reason: FallbackReason) => void,
): PrecomputedRead | null {
  if (!canonicalById) { onFallback?.('jobs_missing'); return null; }
  const jobs = reconstructRecommendedCards(record.results, canonicalById);
  if (jobs.length === 0 && record.results.length > 0) {
    onFallback?.('jobs_missing');
    return null;
  }
  return { jobs, total: record.total, source: 'precomputed', generatedAt: record.generatedAt };
}
