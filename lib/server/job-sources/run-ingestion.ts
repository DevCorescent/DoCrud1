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

  const configs = listSourceConfigs().filter((c) => {
    if (options.onlySourceIds && !options.onlySourceIds.includes(c.sourceId)) return false;
    return true;
  });

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

    let fetched: NormalizedJob[];
    try {
      const adapter = getAdapter(config.sourceId, options.deps ?? {});
      if (!adapter) throw new Error(`No adapter for source "${config.sourceId}".`);
      const result = await adapter.fetch(null);
      fetched = Array.isArray(result?.jobs) ? result.jobs : [];
    } catch (error) {
      /* A FAILED source contributes no jobs AND no absence evidence. Nothing
         downstream may read this as "the board is empty". */
      perSource.push({
        ...base, ok: false, skipped: false, latencyMs: Date.now() - started,
        error: safeMessage(error),
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
