/**
 * Stage 2 — the live canonical ingestion run.
 *
 * This is the ORCHESTRATOR that finally makes Phases 3–8 the real ingestion
 * path. It implements no matching, normalization, identity, classification or
 * lifecycle logic of its own; every one of those already exists and is called
 * here:
 *
 *   registry.listSourceConfigs / getAdapter   (Phase 2)
 *   adapter.fetch  -> Stage 1 pagination       (Stage 1)
 *   normalizeSourceJob                          (Phase 3)
 *   jobIdentity (inside normalize)              (Phase 3)
 *   planIngest -> upsert                        (Phase 3)
 *   classifyJob (inside ingest)                 (Phase 4)
 *   markSeen / sourceRunIsTrustworthy           (Phase 8)
 *
 * ═══ WHAT CHANGES FOR A MEMBER ═══
 *
 * The old path (runApprovedScrape -> CSV -> importJobsFromCsv) could only ever
 * INSERT. A posting whose description, salary or location changed at the
 * source was recognised as already-known and skipped, so the stored copy went
 * stale and stayed stale. This path upserts: changed content updates the
 * existing record, in place, keeping its id, its owner, its status and its
 * applications.
 *
 * ═══ WHAT IT REFUSES TO DO ═══
 *
 *  · It never touches an employer-posted job. Identity is scoped by sourceId,
 *    and a member's posting has none, so it can never be matched.
 *  · It never expires anything. A failed, skipped or empty source produces no
 *    absence evidence, and expiry is Phase 8's decision made elsewhere.
 *  · It never rewrites a record whose content has not changed, so a steady
 *    board produces no writes and no `updatedAt` churn.
 *
 * ONE READ, ONE WRITE. The whole run reads the job store once and writes once,
 * chaining each source's plan onto the previous result. Per-source writes
 * would multiply a 20-source run into 20 read/modify/write cycles over the
 * same document.
 */
import type { HiringJobPosting } from '@/types/document';
import type { NormalizedJob, ProviderDeps } from '@/lib/server/job-scraper/types';
import { getHiringJobs, saveHiringJobs } from '@/lib/server/hiring';
import { getAdapter, isPartnershipBlocked, listSourceConfigs, safeMessage } from './registry';
import { normalizeSourceJob } from './normalize';
import { planIngest, type IngestReport } from './ingest';
import { markSeen } from './lifecycle';
import { SourceFetchError } from '@/lib/server/job-scraper/source-fetch';

/* ── Result shape ─────────────────────────────────────────────────────────*/

export interface SourceIngestStat {
  sourceId: string;
  name: string;
  /** True when the fetch completed without throwing. */
  ok: boolean;
  /** True when the source was never attempted. */
  skipped: boolean;
  skipReason?: string;
  /** Postings the adapter returned. */
  discovered: number;
  inserted: number;
  updated: number;
  unchanged: number;
  duplicateInRun: number;
  /** Drafts rejected for missing a title/company, or inactive-and-new. */
  rejected: number;
  latencyMs: number;
  /** Safe message. Never a stack trace, never a credential. */
  error?: string;
  /**
   * The failure CATEGORY, so an administrator can tell a dead host from a
   * misconfigured slug from a board that returned nonsense — 'http',
   * 'timeout', 'network', 'parse', 'redirect', 'content_type', 'config'…
   */
  errorKind?: string;
  /** The HTTP status, when the server actually sent one. */
  errorStatus?: number;
}

export interface IngestionRunSummary {
  runAt: string;
  sources: number;
  sourcesOk: number;
  failed: number;
  skipped: number;
  /* Totals, using the Stage 1 vocabulary so the dashboard reads one language. */
  discovered: number;
  inserted: number;
  updated: number;
  unchanged: number;
  duplicateInRun: number;
  rejected: number;
  truncated: number;
  /** Records whose lastSeenAt stamp was refreshed. */
  seenStamped: number;
  perSource: SourceIngestStat[];
  /** How identity was resolved across the whole run. Auditable. */
  identityBasis: IngestReport['basisCounts'];
  /**
   * The last source this run actually attempted. Feed it back as
   * `startAfterSourceId` next time and the run continues where it stopped.
   * Undefined when the run attempted nothing.
   */
  nextStartAfterSourceId?: string;
  /** Sources not started because the run ran out of its time budget. */
  deadlineSkipped: number;
  /**
   * Resume tokens produced by this run, keyed by sourceId. `null` means the
   * source finished its corpus. Sources absent from this map were not read and
   * their stored cursor must be left exactly as it was.
   */
  nextCursors: Record<string, string | null>;
}

/**
 * Rotate the list so it begins at the entry AFTER `afterId`.
 *
 * Every source is still present exactly once — this changes the ORDER of a
 * pass, never its membership, so no source can be dropped by rotating.
 */
function rotateFrom<T extends { sourceId: string }>(
  list: readonly T[],
  afterId?: string,
): T[] {
  if (!afterId) return [...list];
  const at = list.findIndex((c) => c.sourceId === afterId);
  /* An id that is no longer configured (removed from the environment) must not
     strand the cursor — fall back to the top of the list. */
  if (at < 0) return [...list];
  return [...list.slice(at + 1), ...list.slice(0, at + 1)];
}

export interface RunIngestionOptions {
  /** Injected for tests; production uses the adapters' own fetchers. */
  deps?: ProviderDeps;
  /** Fixed clock, so a run is reproducible. */
  now?: number;
  /** Ceiling on jobs carried forward per source. Truncation is REPORTED. */
  perSourceLimit?: number;
  /** Only run these sourceIds. Omit for every enabled source. */
  onlySourceIds?: readonly string[];
  /**
   * Epoch ms after which no NEW source is started.
   *
   * The run happens inside a request with a hard platform ceiling, and EVERY
   * write happens after the loop — the job store once at the end, the
   * per-source state after that. So a run that overruns is killed mid-loop and
   * persists NOTHING: not the sources it had already read, not their new job
   * counts, not even their timestamps. The whole pass is lost, and the next one
   * starts from the same place and loses it again.
   *
   * Stopping voluntarily turns that into progress. Sources not started are
   * reported as skipped for time, which leaves their previous state untouched —
   * they are not failures, they simply were not asked this pass.
   *
   * Omit for no deadline (tests, and any caller not inside a request).
   */
  deadlineAt?: number;
  /**
   * Per-source resume tokens from the previous run, keyed by sourceId.
   *
   * `SourceFetchResult.nextCursor` has been part of the adapter contract from
   * the start, but nothing stored it, so every adapter returned null and this
   * path passed null back. A source whose corpus is larger than one bounded
   * run — Microsoft, whose server fixes the page size at 10 — would otherwise
   * re-read its first pages every run and never reach the rest.
   */
  sourceCursors?: Readonly<Record<string, string>>;
  /**
   * Resume point: the run begins at the source AFTER this id, wrapping around.
   *
   * Paired with `deadlineAt` this is what stops the tail of a long source list
   * from starving. An unknown id is ignored and the run starts at the top.
   */
  startAfterSourceId?: string;
  /** Set false to compute the plan without writing. Defaults to true. */
  commit?: boolean;
  /**
   * Storage seams, defaulting to the real job store.
   *
   * Injectable so the orchestrator can be exercised as a pure function: with
   * these supplied it performs no database access at all. Without them it
   * still READ the store even in preview mode, which made every test depend on
   * a live connection — the opposite of the deterministic, DB-free testing the
   * rest of this pipeline is built on.
   */
  loadJobs?: () => Promise<HiringJobPosting[]>;
  saveJobs?: (jobs: HiringJobPosting[]) => Promise<void>;
}

const PER_SOURCE_LIMIT = 1000;

/* ── The run ──────────────────────────────────────────────────────────────*/

/**
 * Fetch every enabled source and upsert the results into the canonical store.
 *
 * FAILURE IS ISOLATED PER SOURCE. Each source runs inside its own try/catch and
 * a throw ends that source alone — one company's board returning 500 costs
 * exactly one source, never the run.
 */
export async function runCanonicalIngestion(
  options: RunIngestionOptions = {},
): Promise<IngestionRunSummary> {
  const now = options.now ?? Date.now();
  const runAt = new Date(now).toISOString();
  const perSourceLimit = Math.max(1, options.perSourceLimit ?? PER_SOURCE_LIMIT);
  const commit = options.commit !== false;

  const configs = rotateFrom(
    listSourceConfigs().filter((c) => {
      if (options.onlySourceIds && !options.onlySourceIds.includes(c.sourceId)) return false;
      return true;
    }),
    options.startAfterSourceId,
  );

  /* The last source actually ASKED for jobs — successfully or not. Skipped
     sources do not move it: nothing was spent on them, so resuming after one
     would hand the next run the same starting point and starve the tail
     exactly as before. */
  let nextStartAfterSourceId: string | undefined;
  let outOfTime = false;
  /* null is meaningful: "this source is exhausted, start it from the top next
     run". Absent means the source was not read and its stored cursor stands. */
  const nextCursors: Record<string, string | null> = {};

  const perSource: SourceIngestStat[] = [];
  const identityBasis: IngestReport['basisCounts'] = { external_id: 0, canonical_url: 0, fingerprint: 0 };
  let truncated = 0;

  /* ONE read for the whole run. Each source's plan is chained onto the
     previous result, so two sources cannot each overwrite the other's work. */
  const load = options.loadJobs ?? getHiringJobs;
  const save = options.saveJobs ?? saveHiringJobs;
  let jobs: HiringJobPosting[] = await load();
  const before = jobs;
  const matchedIds = new Set<string>();

  for (const config of configs) {
    const started = Date.now();
    const base = {
      sourceId: config.sourceId, name: config.name,
      discovered: 0, inserted: 0, updated: 0, unchanged: 0,
      duplicateInRun: 0, rejected: 0,
    };

    /* Out of budget. Checked BEFORE the work, never during it: a source that
       has started is allowed to finish, because abandoning it half-read is what
       produces a partial board reported as a complete one. Once set, the flag
       stays set so the remainder of the list is reported consistently rather
       than one more source sneaking in on a fast clock. */
    if (!outOfTime && options.deadlineAt !== undefined && started >= options.deadlineAt) {
      outOfTime = true;
    }
    if (outOfTime) {
      perSource.push({ ...base, ok: true, skipped: true, skipReason: 'deadline', latencyMs: 0 });
      continue;
    }

    /* Never fetched, and never counted as a failure: a disabled source was not
       asked, and a partnership-blocked one must not be asked at all. */
    if (isPartnershipBlocked(config.sourceId)) {
      perSource.push({ ...base, ok: true, skipped: true, skipReason: 'requires_partnership', latencyMs: 0 });
      continue;
    }
    if (!config.enabled) {
      perSource.push({ ...base, ok: true, skipped: true, skipReason: 'disabled', latencyMs: 0 });
      continue;
    }

    /* Recorded before the fetch, so a source that fails still advances the
       cursor. Otherwise one permanently broken board would be retried first on
       every run and block everything behind it forever. */
    nextStartAfterSourceId = config.sourceId;

    let fetched: NormalizedJob[];
    try {
      const adapter = getAdapter(config.sourceId, options.deps ?? {});
      if (!adapter) throw new Error(`No adapter for source "${config.sourceId}".`);
      const result = await adapter.fetch(options.sourceCursors?.[config.sourceId] ?? null);
      fetched = Array.isArray(result?.jobs) ? result.jobs : [];
      /* Recorded per source, and only for a source that actually succeeded: a
         failed fetch proves nothing about where to resume, and advancing past
         a page we never read would skip it silently. */
      nextCursors[config.sourceId] = result?.nextCursor ?? null;
    } catch (error) {
      /* A FAILED source contributes no jobs AND no absence evidence. Nothing
         downstream may read this as "the board is empty". */
      /* The category survives alongside the message, so the console can say
         WHY rather than only that something went wrong. */
      const detail = error instanceof SourceFetchError
        ? { errorKind: error.kind, ...(error.status ? { errorStatus: error.status } : {}) }
        : {};
      perSource.push({
        ...base, ok: false, skipped: false, latencyMs: Date.now() - started,
        error: safeMessage(error), ...detail,
      });
      continue;
    }

    if (fetched.length > perSourceLimit) {
      truncated += fetched.length - perSourceLimit;
      fetched = fetched.slice(0, perSourceLimit);
    }

    const drafts = fetched.map((job) => normalizeSourceJob(job, { sourceId: config.sourceId, now }));
    const plan = planIngest(drafts, jobs, { now: runAt });
    jobs = plan.jobs;

    for (const id of plan.report.matchedJobIds) matchedIds.add(id);
    for (const key of Object.keys(identityBasis) as Array<keyof typeof identityBasis>) {
      identityBasis[key] += plan.report.basisCounts[key];
    }

    perSource.push({
      ...base,
      ok: true, skipped: false,
      discovered: fetched.length,
      inserted: plan.report.created,
      updated: plan.report.updated,
      unchanged: plan.report.unchanged,
      duplicateInRun: plan.report.duplicatesInBatch,
      rejected: plan.report.rejected.length,
      latencyMs: Date.now() - started,
    });
  }

  /* Phase 8 heartbeat, ONLY for postings a successful run actually confirmed.
     `markSeen` rate-limits itself, so a steady board is not rewritten on every
     run just to move a timestamp. */
  const stamps = markSeen(jobs, matchedIds, now);
  if (stamps.length) {
    const byId = new Map(stamps.map((s) => [s.id, s.lastSeenAt]));
    jobs = jobs.map((job) => {
      const at = byId.get(job.id);
      return at ? { ...job, lastSeenAt: at } : job;
    });
  }

  const totals = perSource.reduce((acc, s) => ({
    discovered: acc.discovered + s.discovered,
    inserted: acc.inserted + s.inserted,
    updated: acc.updated + s.updated,
    unchanged: acc.unchanged + s.unchanged,
    duplicateInRun: acc.duplicateInRun + s.duplicateInRun,
    rejected: acc.rejected + s.rejected,
  }), { discovered: 0, inserted: 0, updated: 0, unchanged: 0, duplicateInRun: 0, rejected: 0 });

  /* Write ONLY when something actually changed. A run where every posting was
     unchanged rewrites nothing and leaves the read caches warm — the common
     case once a board is steady. */
  const changed = totals.inserted > 0 || totals.updated > 0 || stamps.length > 0;
  if (commit && changed) await save(jobs);
  /* Nothing changed: hand back the array we read, unmodified. */
  if (!changed) jobs = before;

  return {
    runAt,
    sources: perSource.length,
    sourcesOk: perSource.filter((s) => s.ok && !s.skipped).length,
    failed: perSource.filter((s) => !s.ok).length,
    skipped: perSource.filter((s) => s.skipped).length,
    ...totals,
    truncated,
    seenStamped: stamps.length,
    perSource,
    identityBasis,
    ...(nextStartAfterSourceId ? { nextStartAfterSourceId } : {}),
    deadlineSkipped: perSource.filter((s) => s.skipReason === 'deadline').length,
    nextCursors,
  };
}

/**
 * The plan a run WOULD apply, without writing.
 *
 * Exposed so an operator can see what a run will do before it does it, and so
 * tests can assert the write behaviour without a database.
 */
export function previewIngestion(options: RunIngestionOptions = {}) {
  return runCanonicalIngestion({ ...options, commit: false });
}
