/**
 * Real job matches for the onboarding jobs step.
 *
 * ═══ WHERE THE NUMBER COMES FROM ═══
 *
 * POST /api/onboarding/job-matches/count. The candidate's answers go to the
 * server, which scores the published corpus with the recommendation engine —
 * the same profile builder, scorer and "is this recommended" rule the homepage
 * "Job matches" tile uses (lib/server/onboarding-match-count.ts) — and answers
 * with the count and its display bucket. Two integers cross the wire; the
 * corpus never reaches the browser.
 *
 * ═══ WHAT IS DISPLAYED ═══
 *
 * The bucket: the real count floored to a multiple of five, by Docrud's
 * existing rule (getCompanyJobDisplayCount). Down, never up — the screen must
 * never promise more matches than the engine found. The card counts up from 0
 * in fives to that bucket (`countUpSteps`), so no frame shows a value the
 * engine did not reach.
 *
 * ═══ ERROR IS NOT ZERO ═══
 *
 * `fetchJobMatchCount` throws on any failed or malformed response. The caller
 * shows an error state with a retry; a broken read is never rendered as "no
 * matches", which is a real answer with a different meaning.
 */
import { getCompanyJobDisplayCount } from '@/lib/company-explorer';

/** What the step sends — the same answers signup will persist. */
export type JobMatchAnswers = {
  skills: readonly string[];
  roles: readonly string[];
  customRoles: readonly string[];
};

export type JobMatchCount = {
  /** The engine's count. Never invented, never persisted. */
  total: number;
  /** `total` floored to a multiple of five. Always <= total. */
  bucket: number;
};

/** The display bucket: floor to the nearest five, 0 below five. */
export function matchBucket(total: number): number {
  return getCompanyJobDisplayCount(total);
}

/**
 * The count to DISPLAY as text: the bucket, then "+".
 *
 * 23 shows as 20+, 44 as 40+, 25 as 25+. The arithmetic is Docrud's existing
 * rule (getCompanyJobDisplayCount), not a second copy of it.
 */
export function formatRecommendedJobCount(actual: number): string {
  return `${matchBucket(actual).toLocaleString('en-US')}+`;
}

/**
 * The values the card passes through on its way up: 0, 5, 10, … bucket.
 *
 * Every element is a multiple of five and no element exceeds the bucket, so an
 * animation that only ever shows elements of this list cannot over-promise at
 * any frame. A bucket of 0 yields [0].
 */
export function countUpSteps(bucket: number): number[] {
  const top = matchBucket(bucket);
  const steps = [0];
  for (let value = 5; value <= top; value += 5) steps.push(value);
  return steps;
}

/**
 * Asks the server for the candidate's match count.
 *
 * Throws on a failed response or a malformed body so the caller can show a
 * real error. The bucket is recomputed here from `total` rather than trusted
 * from the wire: by construction it can never exceed the count.
 */
export async function fetchJobMatchCount(
  answers: JobMatchAnswers,
  signal?: AbortSignal,
): Promise<JobMatchCount> {
  const res = await fetch('/api/onboarding/job-matches/count', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ onboarding: answers }),
    signal,
  });
  if (!res.ok) throw new Error(`Job matches responded ${res.status}`);
  const data = await res.json().catch(() => null);
  const total = Number(data?.total);
  if (!Number.isFinite(total) || total < 0) throw new Error('Job matches returned no count');
  return { total, bucket: matchBucket(total) };
}
