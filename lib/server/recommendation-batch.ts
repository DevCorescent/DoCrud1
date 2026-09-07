/**
 * Batch recommendation precomputation.
 *
 * ═══ THE ONE ARCHITECTURAL RULE ═══
 *
 *     ONE corpus read  →  score MANY profiles in memory  →  persist per user
 *
 * NOT one read per user. Phase 3.1/3.2 measured the corpus read at ~86,032 ms
 * for 7.43 MB, while scoring all 5,276 postings for one profile costs 40–890 ms.
 * The read is ~100× the scoring. A per-user worker would therefore pay the
 * expensive part 474 times and be slower than the endpoint it replaces — and
 * repeatedly reading that corpus is exactly what produced `ResetPool` /
 * `InterruptInUseConnections` in Phase 3.1.
 *
 * So the corpus is read once per batch and held for the duration of that run,
 * which is the entire point of the optimisation; profiles are processed in
 * bounded slices so the RESULTS never accumulate unboundedly.
 *
 * ═══ THE SCORER IS UNTOUCHED ═══
 *
 * Scoring goes through `scoreRecommendations` — the same pure function the live
 * route now calls. There is no second algorithm here, and nothing in this file
 * decides what a match is worth.
 *
 * ═══ NOTHING HERE IS WIRED TO PRODUCTION ═══
 *
 * This module is a callable boundary, deliberately free of HTTP, queue and
 * scheduler concerns so a later phase can execute it from BullMQ without moving
 * business logic. It is not scheduled and no route reads its output yet.
 */
import { buildRecProfile, hasProfileSignals } from '@/lib/server/job-recommend';
import { mergeResumeSignals } from '@/lib/server/recommend-profile';
import { recommendedSet, scoreRecommendations } from '@/lib/server/recommendation-compute';

/** Bumped when a change to the scorer invalidates every stored result. */
export const SCORER_VERSION = 1;

/** The fields the scorer needs, plus applyUrl for the card. Twelve, and
    `description` is NOT among the droppable ones — see ranking-parity. */
export const REC_JOB_FIELDS = [
  'id', 'title', 'organizationName', 'location', 'employmentType', 'workMode',
  'experienceLevel', 'description', 'preferredSkills', 'targetRoleKeywords',
  'createdAt', 'applyUrl',
] as const;

/** One persisted recommendation. Canonical job data stays in `hiring_jobs`;
    this stores the SCORING outcome, not a copy of the posting. */
export interface StoredRecommendation {
  jobId: string;
  score: number;
  reasons: string[];
}

export interface RecommendationRecord {
  userId: string;
  /** Guards against a slow batch overwriting a newer profile's result. */
  profileVersion: number;
  /** `${count}:${maxUpdatedAt}` from the existing CorpusVersion. */
  corpusVersion: string;
  scorerVersion: number;
  generatedAt: string;
  status: 'ready' | 'empty_profile';
  /** The FULL recommended set — `scope=recommended` returns all of it. */
  results: StoredRecommendation[];
  /** The real size of the recommended set, not a page length. */
  total: number;
}

/** A profile to score, already loaded by the caller. */
export interface BatchProfileInput {
  userId: string;
  profileVersion: number;
  /** Raw profile fields, exactly as the route reads them. */
  fields: Record<string, unknown> | null;
}

export interface BatchOptions {
  /** How many profiles to hold results for before handing them off. */
  batchSize?: number;
  now?: number;
}

export interface BatchStats {
  usersProcessed: number;
  recommendationsPersisted: number;
  emptyProfiles: number;
  scoringMs: number;
  corpusSize: number;
}

/**
 * Score one already-loaded profile against an already-loaded corpus.
 *
 * Pure. The corpus is passed in precisely so it is not fetched here.
 */
export function computeRecordForProfile(
  input: BatchProfileInput,
  jobs: ReadonlyArray<Record<string, unknown>>,
  corpusVersion: string,
  now: number,
): RecommendationRecord {
  const signals = mergeResumeSignals(
    input.fields as Parameters<typeof mergeResumeSignals>[0],
    (input.fields as { resumeFiles?: Parameters<typeof mergeResumeSignals>[1] })?.resumeFiles,
  );
  const profile = buildRecProfile(signals as Parameters<typeof buildRecProfile>[0]);
  const showMatch = hasProfileSignals(profile);

  const scored = scoreRecommendations({ profile, showMatch, jobs, now });
  const { recommended, total } = recommendedSet(scored);

  return {
    userId: input.userId,
    profileVersion: input.profileVersion,
    corpusVersion,
    scorerVersion: SCORER_VERSION,
    generatedAt: new Date(now).toISOString(),
    /* A profile with no signals recommends NOTHING, and that is a real answer.
       It must never be confused with a failed computation — see the status
       field, which names which of the two happened. */
    status: showMatch ? 'ready' : 'empty_profile',
    results: recommended.map((s) => ({
      jobId: String(s.job.id),
      score: s.score,
      reasons: Array.isArray(s.job.matchReasons) ? (s.job.matchReasons as string[]) : [],
    })),
    total,
  };
}

/**
 * Score many profiles against ONE corpus.
 *
 * `persist` is injected rather than imported so this stays testable without a
 * database and so the caller owns write concurrency. Results are handed over in
 * bounded slices and dropped, so peak memory is the corpus plus one slice —
 * never every user's results at once.
 */
export async function runRecommendationBatch(
  profiles: ReadonlyArray<BatchProfileInput>,
  jobs: ReadonlyArray<Record<string, unknown>>,
  corpusVersion: string,
  persist: (records: RecommendationRecord[]) => Promise<void>,
  options: BatchOptions = {},
): Promise<BatchStats> {
  const batchSize = Math.max(1, options.batchSize ?? 50);
  const now = options.now ?? Date.now();

  const stats: BatchStats = {
    usersProcessed: 0,
    recommendationsPersisted: 0,
    emptyProfiles: 0,
    scoringMs: 0,
    corpusSize: jobs.length,
  };

  for (let i = 0; i < profiles.length; i += batchSize) {
    const slice = profiles.slice(i, i + batchSize);
    const started = Date.now();
    const records = slice.map((p) => computeRecordForProfile(p, jobs, corpusVersion, now));
    stats.scoringMs += Date.now() - started;

    await persist(records);

    stats.usersProcessed += records.length;
    for (const r of records) {
      stats.recommendationsPersisted += r.results.length;
      if (r.status === 'empty_profile') stats.emptyProfiles += 1;
    }
    /* `records` and `slice` fall out of scope here; only the corpus stays
       resident, which is the whole point of reading it once. */
  }

  return stats;
}

/**
 * Is a stored record still current?
 *
 * Version comparison, not timestamps: a batch that started against profile
 * version 10 must never overwrite a result generated from version 11, and
 * wall-clock ordering cannot prove that ordering across processes.
 */
export function isRecordCurrent(
  record: Pick<RecommendationRecord, 'profileVersion' | 'corpusVersion' | 'scorerVersion'> | null,
  expected: { profileVersion: number; corpusVersion: string },
): boolean {
  if (!record) return false;
  return record.profileVersion === expected.profileVersion
    && record.corpusVersion === expected.corpusVersion
    && record.scorerVersion === SCORER_VERSION;
}

/**
 * May a freshly computed record replace what is stored?
 *
 * Refuses to move a profile version BACKWARDS. A slow batch finishing after a
 * newer one must discard its work rather than resurrect a stale ranking.
 */
export function mayReplace(
  existing: Pick<RecommendationRecord, 'profileVersion'> | null,
  incoming: Pick<RecommendationRecord, 'profileVersion'>,
): boolean {
  if (!existing) return true;
  return incoming.profileVersion >= existing.profileVersion;
}
