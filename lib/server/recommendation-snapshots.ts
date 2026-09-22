/**
 * Recommendation SNAPSHOTS — the durable second tier behind the route's
 * in-process cache, and the budget that stops a request waiting on a build.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * Measured on the production corpus (12,659 published postings, 72.6 MB):
 *
 *     corpus load, cold worker          ~52 s   (cross-region read)
 *     feature derivation, per version    8.8 s   (once per worker)
 *     scoring, features warm             0.2 s
 *     total on a cold worker            ~60 s → nginx 504
 *     total on a warm worker             0.6 s
 *
 * The in-process cache (route.ts) hides the warm cost, but every worker forgets
 * its corpus after ten idle minutes and every viewer's first visit misses it,
 * and both of those landed the WHOLE cold cost on a person's request. The
 * `recommendation_results` store already existed for exactly this — the scoring
 * outcome persisted per viewer per scope, rebuilt into cards from the CURRENT
 * postings — but it was written only by an unscheduled batch and read only
 * behind an off flag, for signed-in members, for one scope. So it held zero
 * records. This module makes the live path both its writer and its reader:
 *
 *     L1 fresh  → serve                                     (unchanged)
 *     L1 stale  → serve, refresh behind the response          (unchanged)
 *     L1 miss   → snapshot fresh?  serve it                   (~2 round trips)
 *               → else build, but WAIT AT MOST THE BUDGET;
 *                 past it, serve the newest valid snapshot,
 *                 or answer 503 — never a 60 s wait,
 *                 never a fabricated empty success.
 *
 * ═══ WHAT DOES NOT CHANGE ═══
 *
 * The scorer, the comparator, the recommended set, the card projection, the
 * response shape and the L1 cache's windows are untouched. A snapshot is the
 * output of the SAME `scoreRecommendations` pass the live path runs, stored,
 * and `renderSnapshot` rebuilds the SAME cards the live path builds — proven
 * field-for-field by scripts/recommendation-snapshot-delivery.selftest.ts.
 *
 * ═══ AUTHORIZATION ═══
 *
 * A snapshot is keyed by the SERVER-RESOLVED viewer id and the scope. The
 * signed-out viewer is one shared key, `anon`, whose snapshot is computed from
 * no profile at all — the same public answer every signed-out request already
 * received. Nothing derived from a member's profile is ever stored under it,
 * and a member's snapshot is read only for a request that resolved to that
 * member. Freshness is a version contract (profileVersion, corpusVersion,
 * scorerVersion), never a clock.
 */
import {
  freshnessOf, readRecommendationRecord, writeRecommendationRecord,
  SCORER_VERSION,
  type RecommendationResultRecord, type RecommendationScope, type StoredRecommendation,
} from '@/lib/server/db/recommendation-results';
import { reconstructRecommendedCards } from '@/lib/server/recommendation-reconstruct';
import { recommendedSet, type ScoredRecommendation } from '@/lib/server/recommendation-compute';
import { isValidApplyUrl } from '@/lib/jobs-ui';
import { coerceJobUrgency } from '@/lib/job-urgency';

/**
 * How long a request that found NO usable snapshot waits for the build.
 *
 * The contract is "cards within ~2 s"; the browser's own round trip and
 * rendering take the rest. A warm worker builds in ~0.6 s and lands inside
 * this; a cold one cannot, and the person gets a stale snapshot or an honest
 * 503 while the build finishes behind them and is persisted for the next
 * request. This is NOT a timeout on the build — the build always completes.
 */
export const SNAPSHOT_BUILD_BUDGET_MS = 1_500;

/**
 * The oldest snapshot that may be served while a fresh one is being built.
 *
 * A snapshot past its versions is still real postings, ranked by this same
 * scorer, and its cards are rebuilt from the CURRENT postings (a job
 * unpublished since simply drops). But a day-old ranking against a corpus that
 * has since turned over is not a recommendation anyone asked for, so beyond
 * this the request answers 503 instead.
 */
export const SNAPSHOT_MAX_STALE_AGE_MS = 24 * 60 * 60_000;

/** The signed-out viewer's shared key — the same key the L1 cache uses. */
export const ANON_VIEWER = 'anon';

/**
 * The `row` snapshot stores this many top-ranked entries, then is trimmed to
 * the feed config's `maxCards` at render time — exactly `rowScope`'s
 * `scored.slice(0, maxCards)`, because the config caps maxCards at 20
 * (feed-config.ts), so a stored prefix of 20 always contains the row. Storing
 * the prefix rather than the trimmed row means a superadmin raising maxCards
 * is honoured by the very next render, not the next rebuild.
 */
export const ROW_SNAPSHOT_MAX = 20;

/** Retry-After (seconds) sent with a 503 while a build is in flight. */
export const RETRY_AFTER_SECONDS = 2;

export type RecsPayload = { jobs: unknown[]; total: number };

export function viewerKeyOf(meId: string | null): string {
  return meId ?? ANON_VIEWER;
}

/**
 * ONE definition of what a scored posting stores. The batch path
 * (recommendation-batch.ts) uses this same function, so a snapshot written by
 * the live route and one written by the scheduler are byte-for-byte alike.
 */
export function storedEntryOf(s: ScoredRecommendation): StoredRecommendation {
  const job = s.job;
  const entry: StoredRecommendation = {
    jobId: String(job.id),
    score: s.score,
    reasons: Array.isArray(job.matchReasons) ? (job.matchReasons as string[]) : [],
  };
  if (typeof job.matchSummary === 'string') entry.summary = job.matchSummary;
  if (Array.isArray(job.matchFactors)) entry.factors = job.matchFactors as StoredRecommendation['factors'];
  if (Array.isArray(job.matchedSkills)) entry.matchedSkills = job.matchedSkills as string[];
  if (Array.isArray(job.missingSkills)) entry.missingSkills = job.missingSkills as string[];
  return entry;
}

export interface SnapshotSource {
  viewerKey: string;
  profileVersion: number;
  corpusVersion: string;
  /** The SORTED output of scoreRecommendations — the live path's own array. */
  scored: ReadonlyArray<ScoredRecommendation>;
  showMatch: boolean;
  now: number;
}

/**
 * Both scope records from ONE scoring pass.
 *
 * `recommended` is the full recommended set (what /jobs?recommended=1
 * renders); `row` is the ranked prefix the carousel is cut from. `total` is the
 * recommended set's real size on BOTH, exactly as the live payload reports it
 * for either scope.
 */
export function snapshotRecordsFromScored(src: SnapshotSource): {
  row: RecommendationResultRecord;
  recommended: RecommendationResultRecord;
} {
  const { recommended, total } = recommendedSet(src.scored as ScoredRecommendation[]);
  const base = {
    userId: src.viewerKey,
    profileVersion: src.profileVersion,
    corpusVersion: src.corpusVersion,
    scorerVersion: SCORER_VERSION,
    generatedAt: new Date(src.now).toISOString(),
    /* No signals recommends nothing, and that is a real answer, not a failed
       build — `status` names which. It also tells the renderer to build cards
       WITHOUT match fields, as the live path does when showMatch is false. */
    status: (src.showMatch ? 'ready' : 'empty_profile') as RecommendationResultRecord['status'],
    total,
  };
  return {
    row: { ...base, scope: 'row', results: src.scored.slice(0, ROW_SNAPSHOT_MAX).map(storedEntryOf) },
    recommended: { ...base, scope: 'recommended', results: recommended.map(storedEntryOf) },
  };
}

export type SnapshotState = 'fresh' | 'stale' | 'unusable';

/**
 * Whether a stored snapshot may answer THIS request.
 *
 *   fresh     every version matches — serve it as the answer.
 *   stale     versions moved (profile edited, corpus changed) but the scorer
 *             is the same and it is younger than the ceiling — serve it only
 *             while a fresh build runs past the budget.
 *   unusable  absent, a different scorer, too old, or malformed — never served.
 */
export function classifySnapshot(
  record: RecommendationResultRecord | null,
  expected: { profileVersion: number; corpusVersion: string },
  now: number,
): SnapshotState {
  if (!record || !Array.isArray(record.results)) return 'unusable';
  if (record.status !== 'ready' && record.status !== 'empty_profile') return 'unusable';
  const freshness = freshnessOf(record, expected);
  if (freshness === 'fresh') return 'fresh';
  if (freshness === 'stale_scorer') return 'unusable';
  const age = now - Date.parse(String(record.generatedAt));
  if (!Number.isFinite(age) || age < 0 || age > SNAPSHOT_MAX_STALE_AGE_MS) return 'unusable';
  return 'stale';
}

/**
 * The card the live path builds when there is nothing to match against —
 * the same base projection as `reconstructRecommendedCards`, WITHOUT the match
 * fields it always attaches. `scoreRecommendations` omits matchScore and
 * matchReasons entirely when `showMatch` is false; a snapshot of that state
 * must render the same way, not with a fabricated score of 0.
 */
function plainCard(j: Record<string, unknown>): Record<string, unknown> {
  const card: Record<string, unknown> = {
    id: String(j.id ?? ''),
    title: String(j.title ?? '') || 'Open role',
    organizationName: String(j.organizationName ?? ''),
    location: String(j.location ?? ''),
    employmentType: String(j.employmentType ?? ''),
    workMode: String(j.workMode ?? ''),
    preferredSkills: (Array.isArray(j.preferredSkills) ? j.preferredSkills as string[] : []).slice(0, 4),
    applyUrl: isValidApplyUrl(String(j.applyUrl ?? '')) ? String(j.applyUrl) : '',
    createdAt: String(j.createdAt ?? ''),
  };
  const urgency = coerceJobUrgency(j.hiringUrgency);
  if (urgency) card.hiringUrgency = urgency;
  return card;
}

/**
 * Rebuild the live payload from a snapshot and the CURRENT postings.
 *
 * Pure: the postings are supplied. Order is the stored ranking. A posting that
 * has vanished is dropped, never invented. Returns null when the postings could
 * not be supplied, or when the record names postings and none survived — a
 * snapshot that is fresh by version but empty in substance is not "no matches".
 */
export function renderSnapshot(
  record: RecommendationResultRecord,
  scope: RecommendationScope,
  maxCards: number,
  canonicalById: ReadonlyMap<string, Record<string, unknown>> | null,
): RecsPayload | null {
  if (!canonicalById) return null;
  const results = scope === 'row' ? record.results.slice(0, Math.max(0, maxCards)) : record.results;

  let cards: Array<Record<string, unknown>>;
  if (record.status === 'empty_profile') {
    cards = [];
    const seen = new Set<string>();
    for (const entry of results) {
      if (seen.has(entry.jobId)) continue;
      seen.add(entry.jobId);
      const j = canonicalById.get(entry.jobId);
      if (j) cards.push(plainCard(j));
    }
  } else {
    cards = reconstructRecommendedCards(results, canonicalById);
  }

  if (cards.length === 0 && results.length > 0) return null;
  return { jobs: cards, total: record.total };
}

/** The ids a render needs, so the caller fetches only those postings. */
export function snapshotJobIds(record: RecommendationResultRecord, scope: RecommendationScope, maxCards: number): string[] {
  const results = scope === 'row' ? record.results.slice(0, Math.max(0, maxCards)) : record.results;
  return results.map((r) => r.jobId);
}

/**
 * Read a viewer's snapshot. Null on absence AND on failure: a snapshot is an
 * optimisation, and the caller's build path is always available and always
 * correct. A failure is logged, never turned into an empty answer.
 */
export async function readSnapshot(
  viewerKey: string,
  scope: RecommendationScope,
  read: typeof readRecommendationRecord = readRecommendationRecord,
): Promise<RecommendationResultRecord | null> {
  try {
    return await read(viewerKey, scope);
  } catch (error) {
    console.error('[recommendations/snapshot] read failed; building live', error);
    return null;
  }
}

/**
 * Persist both scope records. Fire-and-forget by design — the response never
 * waits on it — and guarded by `writeRecommendationRecord`'s version check, so
 * a slow build can never overwrite a newer snapshot. A refused or failed write
 * leaves the previous snapshot intact. A stored record with the same three
 * versions is left alone rather than re-sent (it is the same pass's output).
 */
export async function persistSnapshots(
  records: { row: RecommendationResultRecord; recommended: RecommendationResultRecord },
  write: typeof writeRecommendationRecord = writeRecommendationRecord,
): Promise<{ row: boolean; recommended: boolean }> {
  const out = { row: false, recommended: false };
  for (const scope of ['row', 'recommended'] as const) {
    try {
      out[scope] = (await write(records[scope], { skipIfUnchanged: true })).written;
    } catch (error) {
      console.error(`[recommendations/snapshot] persist ${scope} failed`, error);
    }
  }
  return out;
}

export type SnapshotOutcome =
  | { state: 'fresh' | 'stale'; payload: RecsPayload }
  | { state: 'unusable' | 'disabled' };

export type MissAnswer =
  | { kind: 'disabled'; payload: RecsPayload }
  | { kind: 'fresh-snapshot'; payload: RecsPayload }
  | { kind: 'built'; payload: RecsPayload }
  | { kind: 'stale-snapshot'; payload: RecsPayload }
  | { kind: 'pending' };

/**
 * THE decision for a request that found nothing in the in-process cache.
 *
 *   disabled        the jobs feed is off: the live path's own empty answer.
 *   fresh-snapshot  the snapshot is provably current: it IS the answer, and
 *                   no ranking pass is started at all.
 *   built           the (single-flighted) pass finished inside the budget.
 *   stale-snapshot  it did not; the newest valid snapshot answers while the
 *                   pass keeps running behind the response.
 *   pending         it did not, and there is nothing honest to show: the
 *                   caller answers 503 and Retry-After. NEVER an empty 200.
 *
 * `build` is invoked at most once, and only when the snapshot is not fresh. A
 * pass that rejects inside the budget rejects this call, so the route's catch
 * answers it as the failure it is.
 */
export async function answerMiss(input: {
  snapshot: SnapshotOutcome;
  build: () => Promise<RecsPayload>;
  budgetMs: number;
}): Promise<MissAnswer> {
  const { snapshot } = input;
  if (snapshot.state === 'disabled') return { kind: 'disabled', payload: { jobs: [], total: 0 } };
  if (snapshot.state === 'fresh') return { kind: 'fresh-snapshot', payload: snapshot.payload };

  const built = await withBudget(input.build(), input.budgetMs);
  if (built.settled) return { kind: 'built', payload: built.value };
  if (snapshot.state === 'stale') return { kind: 'stale-snapshot', payload: snapshot.payload };
  return { kind: 'pending' };
}

/**
 * Wait for `work` at most `ms`. The promise is NOT cancelled — the build keeps
 * running, sets the caches and persists its snapshot when it finishes. Only
 * this caller stops waiting. A rejection inside the budget is re-thrown so the
 * route answers it honestly; one after the budget is the builder's to log.
 */
export async function withBudget<T>(
  work: Promise<T>,
  ms: number,
): Promise<{ settled: true; value: T } | { settled: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<{ settled: false }>((resolve) => {
    timer = setTimeout(() => resolve({ settled: false }), ms);
    /* Never keeps the process alive on its own. */
    (timer as { unref?: () => void }).unref?.();
  });
  try {
    return await Promise.race([
      work.then((value) => ({ settled: true as const, value })),
      expiry,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
