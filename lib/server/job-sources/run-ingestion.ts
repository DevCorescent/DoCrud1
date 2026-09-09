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
import { getHiringJobs } from '@/lib/server/hiring';
import { selectJobDocsForSource } from '@/lib/server/db/hiring-jobs-collection';
import { incrementalIngestEnabled } from './ingest-mode';
import { writeHiringJobs } from '@/lib/server/hiring-write';
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
   * Load candidates per source instead of loading the whole corpus. Omit to
   * follow the server-side flag; tests set it explicitly to compare the two
   * paths against the same fixtures.
   */
  incremental?: boolean;
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
  /* ═══ THE INJECTION IS NOT AVAILABLE IN PRODUCTION ═══

     `loadJobs`/`saveJobs` exist so the orchestrator can be exercised as a pure
     function with no database at all — two self-tests rely on it and no
     production caller passes either. Left unguarded it is still an escape hatch
     around the ONE write funnel: anything supplying `saveJobs` would persist
     nothing to app_state and mirror nothing to hiring_jobs, while the run
     reported inserts and updates as though it had.

     So it THROWS rather than being silently ignored. Quietly falling back to
     the real save would run a production write that the caller explicitly asked
     not to happen; quietly honouring the override would be the hole itself.
     Refusing loudly is the only option that cannot surprise anyone. */
  if (process.env.NODE_ENV === 'production' && (options.saveJobs || options.loadJobs)) {
    throw new Error(
      'run-ingestion: loadJobs/saveJobs injection is test-only and must not be used in production — '
      + 'every production job write goes through the canonical writer',
    );
  }
  /* Filled when the write happens, so the default writer knows which postings
     are new and therefore need a board position. */
  let createdIds = new Set<string>();
  const defaultSave = async (toWrite: HiringJobPosting[]) => {
    const write = await writeHiringJobs(
      toWrite as unknown as Array<Record<string, unknown>>, createdIds,
    );
    if (!write.ok) throw new Error(write.error || 'ingestion write failed');
  };

  const load = options.loadJobs ?? getHiringJobs;
  /* Phase 2.7E: the default writer is the per-document canonical path. The
     injectable seam stays for tests and is still refused in production. */
  const save = options.saveJobs ?? defaultSave;

  /* ═══ WHOLE-CORPUS vs PER-SOURCE CANDIDATE LOOKUP ═══

     The whole-corpus path loads every posting so `planIngest` can index it by
     identity. That was measured at 733 MB of heap for 100K postings, against a
     1024 MB serverless limit, and the load is not covered by `saveReserveMs`.

     The incremental path instead asks, per source, for only the postings that
     source's drafts could possibly match. It is OFF by default and enabled
     server-side only — the corpus is small enough today that the whole-corpus
     path is not yet a problem, and the two must be proven equivalent before
     the default moves. See scripts/ingest-incremental-equivalence.selftest.ts.

     An injected `loadJobs` always wins: tests and the dry-run path supply their
     own corpus and must keep getting it. */
  const incremental = options.incremental ?? (!options.loadJobs && incrementalIngestEnabled());

  let jobs: HiringJobPosting[] = incremental ? [] : await load();
  const before = jobs;
  const matchedIds = new Set<string>();
  /* Under the incremental path `jobs` accumulates only what was touched, so the
     postings a source contributes are tracked as they are planned. */
  const seenIds = new Set<string>();

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

    /* Incremental: the candidate set is the postings THIS source could match,
       plus anything earlier sources in this run already pulled in (so a draft
       matched twice in one run still coalesces exactly as before). */
    let candidates = jobs;
    if (incremental) {
      const fromStore = await selectJobDocsForSource(config.sourceId, {
        sourceJobIds: drafts.map((d) => String(d.sourceJobId ?? '')),
        canonicalUrls: drafts.map((d) => String(d.canonicalUrl ?? d.sourceUrl ?? '')),
        organizationNames: drafts.map((d) => String(d.organizationName ?? '')),
      });
      const merged = new Map<string, HiringJobPosting>();
      for (const job of fromStore) merged.set(String(job.id), job);
      /* Anything already in `jobs` is newer than the stored copy. */
      for (const job of jobs) merged.set(String(job.id), job);
      candidates = Array.from(merged.values());
    }

    const plan = planIngest(drafts, candidates, { now: runAt });
    if (incremental) {
      /* Keep every posting this run has touched OR considered, so the heartbeat
         and the commit below see the same shape the whole-corpus path sees. */
      const next = new Map<string, HiringJobPosting>();
      for (const job of jobs) next.set(String(job.id), job);
      for (const job of plan.jobs) next.set(String(job.id), job);
      jobs = Array.from(next.values());
      for (const job of candidates) seenIds.add(String(job.id));
    } else {
      jobs = plan.jobs;
    }

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
  if (commit && changed) {
    /* Only the postings this run touched. `matchedIds` names them; anything not
       present before the run is a create and is positioned at the front. */
    /* Incremental holds no full `before` corpus; a posting is pre-existing
       exactly when the per-source lookup returned it. */
    const beforeIds = incremental
      ? seenIds
      : new Set(before.map((j) => String(j.id)));
    const touched = jobs.filter((j) => matchedIds.has(String(j.id)));
    createdIds = new Set(
      touched.map((j) => String(j.id)).filter((id) => !beforeIds.has(id)),
    );
    await save(touched);
  }
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
