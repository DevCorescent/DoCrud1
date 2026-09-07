/**
 * The scheduled refresh: what makes a stale recommendation become fresh.
 *
 * ═══ WHAT WAS MISSING ═══
 *
 * Everything else in Phase 3.5 exists — persistence, the version contract, the
 * stale guard, the one-corpus-read batch. Nothing CALLED it. A member could
 * change their skills, `profileVersion` would move, the stored record would be
 * correctly reported stale, and it would stay stale forever because no caller
 * ever ran the batch.
 *
 * ═══ THE SMALLEST MECHANISM THAT WORKS ═══
 *
 * A Vercel cron hitting a thin route, which calls this. No queue, no Redis, no
 * worker pool — those are later phases and none of them is needed to satisfy a
 * fifteen-minute target for a few hundred members. What this does establish is
 * the SEAM: a bounded, idempotent, single-flighted function that a queue can
 * drive later without any of the logic moving.
 *
 * ═══ SINGLE-FLIGHT, BECAUSE OVERLAP IS THE EXPENSIVE MISTAKE ═══
 *
 * Two concurrent passes would each read the ~7.4 MB corpus and score the same
 * members, doubling the cost of the thing this phase exists to make cheap — and
 * cron invocations DO overlap when a run outlives its interval. A lock document
 * with a lease makes a second invocation report `skipped` rather than compete.
 * The lease expires, so a crashed run cannot wedge the schedule shut.
 */
import { getMongoDb } from '@/lib/server/database';
import { readHiringCorpusVersion } from '@/lib/server/db/hiring-jobs-collection';
import { freshnessOf, SCORER_VERSION, type RecommendationScope } from '@/lib/server/db/recommendation-results';
import { corpusVersionKey, refreshRecommendations, type RefreshStats } from '@/lib/server/recommendation-refresh';
import type { BatchProfileInput } from '@/lib/server/recommendation-batch';

const LOCK_COL = 'scheduler_locks';
const LOCK_ID = 'recommendation_refresh';
const PROFILES_COL = 'user_profiles';
const RESULTS_COL = 'recommendation_results';

/** How long one pass may hold the lock before another may take it. Longer than
    a healthy run, short enough that a crash costs one interval, not a day. */
export const LOCK_LEASE_MS = 10 * 60 * 1000;

/** Members recomputed per invocation. Derived from measurement, not taste: the
    corpus read was measured at 145.6 s and scoring at up to 0.89 s per member,
    so 150 members costs ~279 s against the route's 300 s maxDuration. The next
    tick picks up the remainder, so a backlog drains across runs rather than
    timing one out. */
export const DEFAULT_MAX_PROFILES = 150;

export interface ScheduleResult {
  ran: boolean;
  skippedReason?: 'locked' | 'no_corpus_version' | 'nothing_stale';
  stats?: RefreshStats;
  /** Members found stale BEFORE the bound was applied. */
  staleFound?: number;
  /** True when more remained than this pass could take. */
  moreRemaining?: boolean;
  lockHeldMs?: number;
}

/**
 * Take the lock, or report that someone else holds it.
 *
 * One atomic upsert: the filter matches only an absent or EXPIRED lease, so two
 * simultaneous callers cannot both win.
 */
async function acquireLock(now: number): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) throw new Error('recommendation scheduler: no database');
  const expiresAt = new Date(now + LOCK_LEASE_MS).toISOString();
  try {
    const res = await db.collection(LOCK_COL).updateOne(
      { _id: LOCK_ID as never, $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $lt: new Date(now).toISOString() } }] },
      { $set: { expiresAt, startedAt: new Date(now).toISOString() } },
      { upsert: true },
    );
    return (res.modifiedCount ?? 0) > 0 || (res.upsertedCount ?? 0) > 0;
  } catch (error) {
    /* A duplicate key means another invocation inserted first — that is the
       lock working, not a failure. */
    if ((error as { code?: number })?.code === 11000) return false;
    throw error;
  }
}

async function releaseLock(): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  /* Expire it rather than delete it, so the document keeps its startedAt for
     anyone inspecting the last run. */
  await db.collection(LOCK_COL).updateOne(
    { _id: LOCK_ID as never },
    { $set: { expiresAt: new Date(0).toISOString(), finishedAt: new Date().toISOString() } },
  ).catch(() => undefined);
}

/**
 * Which members need recomputing.
 *
 * Compares each profile's current `profileVersion` against the version stored
 * with its recommendation record. Both sides are read as small projections —
 * no profile bodies, no results arrays — so finding the stale set costs a
 * fraction of recomputing it.
 *
 * A member with NO record is stale by definition, which is how a new member
 * gets their first recommendations.
 */
export async function findStaleProfiles(
  scope: RecommendationScope,
  corpusVersion: string,
  limit: number,
): Promise<{ profiles: BatchProfileInput[]; staleFound: number; moreRemaining: boolean }> {
  const db = await getMongoDb();
  if (!db) throw new Error('recommendation scheduler: no database');

  const records = await db.collection(RESULTS_COL)
    .find({}, { projection: { _id: 1, profileVersion: 1, corpusVersion: 1, scorerVersion: 1 } })
    .toArray();
  const byId = new Map(records.map((r) => [String(r._id), r as unknown as
    { profileVersion: number; corpusVersion: string; scorerVersion: number }]));

  const profiles = await db.collection(PROFILES_COL)
    .find({}, { projection: { _id: 1, profileVersion: 1 } })
    .toArray();

  const stale: BatchProfileInput[] = [];
  let staleFound = 0;
  for (const p of profiles) {
    const userId = String(p._id);
    const profileVersion = Number((p as { profileVersion?: unknown }).profileVersion) || 0;
    const stored = byId.get(`${userId}:${scope}`) ?? null;
    if (freshnessOf(stored, { profileVersion, corpusVersion }) === 'fresh') continue;
    staleFound += 1;
    /* `fields` is filled by the caller: the stale SET is cheap to compute, the
       profile bodies are not, so only the bounded slice is ever loaded. */
    if (stale.length < limit) stale.push({ userId, profileVersion, fields: null });
  }
  return { profiles: stale, staleFound, moreRemaining: staleFound > stale.length };
}

export interface ScheduleOptions {
  scope?: RecommendationScope;
  maxProfiles?: number;
  now?: number;
  /** Corpus identity; read from the database when not supplied. */
  corpusVersion?: string | null;
  /** Loads the recommendation-relevant fields for a bounded set of members. */
  loadProfileFields?: (userIds: string[]) => Promise<Map<string, Record<string, unknown>>>;
  /** Test seams; production uses the real implementations. */
  findStale?: typeof findStaleProfiles;
  runRefresh?: typeof refreshRecommendations;
  acquire?: (now: number) => Promise<boolean>;
  release?: () => Promise<void>;
}

/** The seven fields that feed the scorer — see RECOMMENDATION_INPUT_FIELDS. */
const REC_PROFILE_FIELDS = [
  'headline', 'skills', 'location', 'experience', 'interests', 'resumeFiles', 'matchPreferences',
] as const;

async function loadFields(userIds: string[]): Promise<Map<string, Record<string, unknown>>> {
  const db = await getMongoDb();
  if (!db) throw new Error('recommendation scheduler: no database');
  const projection: Record<string, 0 | 1> = { _id: 1 };
  for (const f of REC_PROFILE_FIELDS) projection[f] = 1;
  const rows = await db.collection(PROFILES_COL)
    .find({ _id: { $in: userIds as never[] } }, { projection })
    .toArray();
  return new Map(rows.map((r) => {
    const { _id, ...fields } = r as Record<string, unknown>;
    return [String(_id), fields];
  }));
}

/**
 * One scheduled pass.
 *
 * Idempotent: it recomputes only what versions say is stale, so running it
 * twice in a row does nothing the second time. Safe to call on any cadence.
 */
export async function runScheduledRefresh(options: ScheduleOptions = {}): Promise<ScheduleResult> {
  const scope = options.scope ?? 'recommended';
  const maxProfiles = Math.max(1, options.maxProfiles ?? DEFAULT_MAX_PROFILES);
  const now = options.now ?? Date.now();
  const acquire = options.acquire ?? acquireLock;
  const release = options.release ?? releaseLock;

  const corpusVersion = options.corpusVersion !== undefined
    ? options.corpusVersion
    : corpusVersionKey(await readHiringCorpusVersion().catch(() => null));
  if (!corpusVersion) {
    /* Without a corpus identity nothing written could ever be proven fresh, so
       the pass declines rather than writing unverifiable records. */
    return { ran: false, skippedReason: 'no_corpus_version' };
  }

  if (!(await acquire(now))) return { ran: false, skippedReason: 'locked' };

  const startedAt = Date.now();
  try {
    const { profiles, staleFound, moreRemaining } =
      await (options.findStale ?? findStaleProfiles)(scope, corpusVersion, maxProfiles);

    if (profiles.length === 0) {
      return { ran: true, skippedReason: 'nothing_stale', staleFound, moreRemaining: false, lockHeldMs: Date.now() - startedAt };
    }

    /* Bodies loaded ONLY for the bounded slice. */
    const fieldsById = await (options.loadProfileFields ?? loadFields)(profiles.map((p) => p.userId));
    const withFields = profiles.map((p) => ({ ...p, fields: fieldsById.get(p.userId) ?? null }));

    const stats = await (options.runRefresh ?? refreshRecommendations)(withFields, {
      scope, now, corpusVersion,
    });
    return { ran: true, stats, staleFound, moreRemaining, lockHeldMs: Date.now() - startedAt };
  } finally {
    /* Released even when the pass throws, so one failure does not hold the
       schedule shut until the lease expires. */
    await release();
  }
}
