/**
 * Durable storage for precomputed recommendations.
 *
 * ═══ WHAT IS STORED, AND WHAT IS NOT ═══
 *
 * The scoring OUTCOME — job id, score, reasons — and never the postings
 * themselves. Canonical job data stays in `hiring_jobs` and is fetched at read
 * time for the page actually being served. Copying job documents per user would
 * duplicate the corpus once per member and go stale the moment a posting was
 * edited.
 *
 * Measured: 500 results is ~105 KB BSON, and even the full 5,276-job corpus is
 * ~1.1 MB — comfortably inside MongoDB's 16 MB document limit, so the FULL
 * recommended set fits in one document per user, which is what `scope=recommended`
 * needs to report an honest `total`.
 *
 * ═══ FRESHNESS IS A VERSION CONTRACT, NOT A TIMESTAMP ═══
 *
 * A record is current only when its `profileVersion`, `corpusVersion` and
 * `scorerVersion` all match the present values. `generatedAt` is observability:
 * useful for measuring lag, useless for correctness, because wall-clock ordering
 * cannot be trusted across processes.
 *
 * ═══ NOTHING HERE IS WIRED TO A ROUTE ═══
 *
 * No API reads this yet. It is storage plus the guards, so the read cutover can
 * be built against something already tested.
 */
import { getMongoDb } from '@/lib/server/database';

const COL = 'recommendation_results';

/** Bumped when a scorer change invalidates every stored result. */
export const SCORER_VERSION = 1;

/** The scopes that can be precomputed. `personalized` is deliberately absent —
    its applied-job exclusion depends on live application state. */
export type RecommendationScope = 'row' | 'recommended';

/**
 * One persisted recommendation.
 *
 * Carries the whole MATCH payload, not just the score. The live card renders
 * matchSummary, matchFactors, matchedSkills and missingSkills alongside the
 * number, and an equivalence run proved that storing only `reasons` would strip
 * the entire match-breakdown UI on a precomputed read — a visible product
 * change wearing a performance costume.
 *
 * The optional fields are OMITTED when empty rather than stored as empty
 * arrays, exactly as the live card omits them, so a reconstructed card and a
 * live one serialise identically and a client can still test for presence.
 *
 * Still no job document: title, company, description and salary all stay in
 * `hiring_jobs` and are fetched for the page being served.
 */
export interface StoredRecommendation {
  jobId: string;
  score: number;
  reasons: string[];
  summary?: string;
  factors?: Array<{ kind: string; label: string; detail: string; points: number; max: number }>;
  matchedSkills?: string[];
  missingSkills?: string[];
}

export interface RecommendationResultRecord {
  userId: string;
  scope: RecommendationScope;
  profileVersion: number;
  corpusVersion: string;
  scorerVersion: number;
  generatedAt: string;
  /** `ready` = scored. `empty_profile` = nothing to score against, which is a
      real answer and must never be confused with a failure. */
  status: 'ready' | 'empty_profile';
  results: StoredRecommendation[];
  /** The real size of the recommended set, before any page trim. */
  total: number;
}

export interface FreshnessExpectation {
  profileVersion: number;
  corpusVersion: string;
}

export type Freshness =
  | 'fresh' | 'missing' | 'stale_profile' | 'stale_corpus' | 'stale_scorer';

/**
 * Why a record cannot be served, or that it can.
 *
 * Each staleness reason is named separately rather than collapsed into a
 * boolean: "the corpus moved" and "this member edited their profile" call for
 * different recomputation priorities, and `missing` is not staleness at all.
 */
export function freshnessOf(
  record: Pick<RecommendationResultRecord, 'profileVersion' | 'corpusVersion' | 'scorerVersion'> | null,
  expected: FreshnessExpectation,
): Freshness {
  if (!record) return 'missing';
  if (record.scorerVersion !== SCORER_VERSION) return 'stale_scorer';
  if (record.profileVersion !== expected.profileVersion) return 'stale_profile';
  if (record.corpusVersion !== expected.corpusVersion) return 'stale_corpus';
  return 'fresh';
}

/**
 * May `incoming` replace `existing`?
 *
 * A batch that started against profile version 10 must never overwrite a result
 * generated from version 11 — the slow writer would resurrect a ranking the
 * member has already moved past. Versions decide this, not arrival order.
 *
 * Equal profile versions fall through to the corpus, so a run against a newer
 * corpus still wins; fully equal versions are allowed to replace, which makes a
 * retry after a partial failure safe.
 */
export function mayReplace(
  existing: Pick<RecommendationResultRecord, 'profileVersion' | 'corpusVersion' | 'scorerVersion'> | null,
  incoming: Pick<RecommendationResultRecord, 'profileVersion' | 'corpusVersion' | 'scorerVersion'>,
): boolean {
  if (!existing) return true;
  if (incoming.scorerVersion !== existing.scorerVersion) {
    return incoming.scorerVersion > existing.scorerVersion;
  }
  if (incoming.profileVersion !== existing.profileVersion) {
    return incoming.profileVersion > existing.profileVersion;
  }
  /* Same profile: a newer corpus wins, an older one does not, and identical
     versions replace so a retry is idempotent. */
  return incoming.corpusVersion >= existing.corpusVersion;
}

/** `userId:scope` — one document per user per scope, so a write can never
    accumulate duplicates and a read is a single `_id` lookup. */
export function recordId(userId: string, scope: RecommendationScope): string {
  return `${userId}:${scope}`;
}

/**
 * Indexes. `_id` already covers the only lookup the read path performs, so the
 * rest exist solely for finding STALE records to recompute — and each is
 * justified rather than added speculatively.
 */
export const RECOMMENDATION_INDEXES = [
  {
    keys: { scorerVersion: 1, generatedAt: 1 },
    options: { name: 'stale_sweep' },
    supports: 'the reconciliation pass finding the oldest records after a scorer bump',
  },
  {
    keys: { corpusVersion: 1 },
    options: { name: 'by_corpus_version' },
    supports: 'invalidating every record built against a superseded corpus',
  },
] as const;

/** Read one record. Returns null when absent; THROWS when the read fails, so a
    storage outage can never be mistaken for "this member has no matches". */
export async function readRecommendationRecord(
  userId: string,
  scope: RecommendationScope,
): Promise<RecommendationResultRecord | null> {
  const db = await getMongoDb();
  if (!db) throw new Error('recommendation store unavailable: no database');
  const doc = await db.collection(COL).findOne({ _id: recordId(userId, scope) as never });
  if (!doc) return null;
  const { _id, ...rest } = doc as Record<string, unknown>;
  return rest as unknown as RecommendationResultRecord;
}

/**
 * Replace a record, but only if it is not going backwards.
 *
 * Reads the current versions and refuses when `mayReplace` says the incoming
 * result is older. Returns whether it wrote, so a caller can count discards
 * rather than assume success.
 *
 * A refusal LEAVES THE PREVIOUS RECORD INTACT — the last known good result
 * survives a failed or late computation. There is no delete-then-insert.
 */
export async function writeRecommendationRecord(
  record: RecommendationResultRecord,
): Promise<{ written: boolean; reason?: 'stale' }> {
  const db = await getMongoDb();
  if (!db) throw new Error('recommendation store unavailable: no database');
  const _id = recordId(record.userId, record.scope);

  const existing = await db.collection(COL).findOne(
    { _id: _id as never },
    { projection: { _id: 0, profileVersion: 1, corpusVersion: 1, scorerVersion: 1 } },
  ) as Pick<RecommendationResultRecord, 'profileVersion' | 'corpusVersion' | 'scorerVersion'> | null;

  if (!mayReplace(existing, record)) return { written: false, reason: 'stale' };

  /* One atomic replace. The guard above is advisory under concurrency, so the
     filter repeats it: a racing newer write cannot be clobbered between the
     read and this call. */
  const guard = existing
    ? {
      _id: _id as never,
      profileVersion: { $lte: record.profileVersion },
      scorerVersion: { $lte: record.scorerVersion },
    }
    : { _id: _id as never };

  const res = await db.collection(COL).replaceOne(
    guard,
    { ...record, _id } as never,
    { upsert: !existing },
  );
  const written = (res.modifiedCount ?? 0) > 0 || (res.upsertedCount ?? 0) > 0;
  return written ? { written: true } : { written: false, reason: 'stale' };
}
