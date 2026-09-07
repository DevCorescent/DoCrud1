/**
 * The refresh pass: what actually joins scoring to storage.
 *
 * ═══ ONE CORPUS READ, MANY USERS ═══
 *
 * The corpus read is ~86 s for 7.43 MB; scoring one profile against all 5,276
 * postings is 40–890 ms. The read is ~100× the scoring, so this reads it ONCE
 * and scores every stale profile against that one in-memory copy. A per-user
 * job would pay the expensive part once per member and be slower than the
 * endpoint it replaces — and repeatedly reading that corpus is what produced
 * `ResetPool` / `InterruptInUseConnections` in Phase 3.1.
 *
 * ═══ IT DECIDES NOTHING ABOUT SCORING ═══
 *
 * Scoring goes through `computeRecordForProfile`, which goes through the one
 * canonical scorer. This file chooses WHO to recompute and WHEN to write.
 *
 * ═══ NOT SCHEDULED ═══
 *
 * No cron entry, no queue, no route calls this. It is a callable seam, free of
 * HTTP concerns, so a later phase can drive it from a scheduler or BullMQ
 * without moving business logic. Deliberately not wired: a refresh cadence is a
 * product decision, and an unscheduled function is inert.
 */
import { computeRecordForProfile, REC_JOB_FIELDS, type BatchProfileInput } from '@/lib/server/recommendation-batch';
import {
  freshnessOf, readRecommendationRecord, writeRecommendationRecord,
  SCORER_VERSION, type RecommendationResultRecord, type RecommendationScope,
} from '@/lib/server/db/recommendation-results';
import { getMongoDb } from '@/lib/server/database';
import { readHiringCorpusVersion } from '@/lib/server/db/hiring-jobs-collection';

/** `count:maxUpdatedAt` — the existing corpus identity, stringified. */
export function corpusVersionKey(v: { count: number; maxUpdatedAt: string } | null): string | null {
  return v ? `${v.count}:${v.maxUpdatedAt}` : null;
}

export interface RefreshStats {
  corpusSize: number;
  corpusVersion: string;
  candidates: number;
  recomputed: number;
  alreadyFresh: number;
  written: number;
  /** Refused because a newer result already existed — not an error. */
  discardedStale: number;
  failed: number;
  scoringMs: number;
  persistMs: number;
}

export interface RefreshOptions {
  scope?: RecommendationScope;
  /** Profiles scored per slice. Bounds peak memory to corpus + one slice. */
  batchSize?: number;
  now?: number;
  /** Injected for tests; production reads the collection. */
  loadCorpus?: () => Promise<Array<Record<string, unknown>>>;
  /** Injected for tests. Production derives it from the corpus itself, so a
      caller cannot claim a freshness it has not verified. */
  corpusVersion?: string;
  readRecord?: typeof readRecommendationRecord;
  writeRecord?: typeof writeRecommendationRecord;
}

/**
 * The corpus, projected to the twelve fields the scorer and card need.
 *
 * From `hiring_jobs` rather than the app_state blob: one document per posting,
 * and the projection drops the ~40% of each document nothing here reads.
 * `description` stays — ranking-parity proved removing it changes matchReasons.
 */
async function loadRecCorpus(): Promise<Array<Record<string, unknown>>> {
  const db = await getMongoDb();
  if (!db) throw new Error('recommendation refresh: no database');
  const projection: Record<string, 0 | 1> = { _id: 0 };
  for (const f of REC_JOB_FIELDS) projection[f] = 1;
  return db.collection('hiring_jobs')
    .find({ status: 'published' }, { projection })
    .toArray() as unknown as Array<Record<string, unknown>>;
}

/**
 * Recompute the profiles whose stored result is missing or stale.
 *
 * `profiles` is supplied by the caller rather than queried here, so the
 * selection policy — everyone, one cohort, one user — stays outside this
 * function and it remains testable without a database.
 */
export async function refreshRecommendations(
  profiles: ReadonlyArray<BatchProfileInput>,
  options: RefreshOptions = {},
): Promise<RefreshStats> {
  const scope: RecommendationScope = options.scope ?? 'recommended';
  const batchSize = Math.max(1, options.batchSize ?? 50);
  const now = options.now ?? Date.now();
  const readRecord = options.readRecord ?? readRecommendationRecord;
  const writeRecord = options.writeRecord ?? writeRecommendationRecord;

  const corpusVersion = options.corpusVersion
    ?? corpusVersionKey(await readHiringCorpusVersion().catch(() => null));
  if (!corpusVersion) {
    /* Without a corpus identity every result would be unverifiable, and writing
       records that can never be proven fresh is worse than writing none. */
    throw new Error('recommendation refresh: corpus version unavailable');
  }

  /* THE ONE READ. */
  const jobs = await (options.loadCorpus ?? loadRecCorpus)();

  const stats: RefreshStats = {
    corpusSize: jobs.length,
    corpusVersion,
    candidates: profiles.length,
    recomputed: 0,
    alreadyFresh: 0,
    written: 0,
    discardedStale: 0,
    failed: 0,
    scoringMs: 0,
    persistMs: 0,
  };

  for (let i = 0; i < profiles.length; i += batchSize) {
    const slice = profiles.slice(i, i + batchSize);

    for (const profile of slice) {
      try {
        const existing = await readRecord(profile.userId, scope);
        const freshness = freshnessOf(existing, {
          profileVersion: profile.profileVersion,
          corpusVersion,
        });
        if (freshness === 'fresh') { stats.alreadyFresh += 1; continue; }

        const t0 = Date.now();
        const computed = computeRecordForProfile(profile, jobs, corpusVersion, now);
        stats.scoringMs += Date.now() - t0;
        stats.recomputed += 1;

        const record: RecommendationResultRecord = {
          userId: computed.userId,
          scope,
          profileVersion: computed.profileVersion,
          corpusVersion,
          scorerVersion: SCORER_VERSION,
          generatedAt: computed.generatedAt,
          status: computed.status,
          results: computed.results,
          total: computed.total,
        };

        const t1 = Date.now();
        const outcome = await writeRecord(record);
        stats.persistMs += Date.now() - t1;
        if (outcome.written) stats.written += 1;
        else stats.discardedStale += 1;
      } catch (error) {
        /* One member's failure costs that member, never the pass — and the
           PREVIOUS record is untouched, so a failed recompute leaves the last
           known good result serving. Counted, never swallowed silently. */
        stats.failed += 1;
        console.error('[recommendations/refresh] failed for one profile', {
          scope,
          reason: error instanceof Error ? error.message : 'unknown',
        });
      }
    }
    /* `slice` falls out of scope; only the corpus stays resident, which is the
       entire point of reading it once. */
  }

  return stats;
}
