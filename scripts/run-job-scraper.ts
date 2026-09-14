/**
 * The job scraper, run OUTSIDE any HTTP request.
 *
 *   npx tsx scripts/run-job-scraper.ts [--limit N] [--trigger manual|timer]
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * The scrape used to run inline inside POST /api/super-admin/jobs/scraper/run.
 * Two independent things broke because of that, and both are fixed by moving
 * the work out of the request rather than by tuning either of them:
 *
 *  1. nginx closes a proxied response after `proxy_read_timeout` (60 s in
 *     production). A run over 7 sources exceeds that, so the browser received
 *     nginx's HTML 504 and the operator was told "Network error" — while the
 *     run itself carried on invisibly.
 *
 *  2. Because the route has a 300 s platform ceiling, `runCanonicalIngest`
 *     reserves part of it for persistence and gives the REST to the source
 *     loop as a deadline. The whole-corpus load happens BEFORE that loop, so
 *     when the corpus grew large enough to consume the window, every source
 *     was skipped with reason `deadline` and the run "succeeded" having
 *     discovered nothing. That is the observed `Discovered: 0` with zero
 *     failed sources — reproduced in scripts/job-scraper-worker.selftest.ts.
 *
 * A worker has neither constraint: no proxy in front of it and no request
 * ceiling, so it passes NO deadline at all and the source loop always runs.
 *
 * ═══ WHAT IT DELIBERATELY DOES NOT DO ═══
 *
 * It contains no ingestion logic. It calls the same canonical pipeline the
 * admin route calls, so there is exactly one scraper in this codebase and no
 * second set of behaviours to keep in sync.
 *
 * EXIT CODES
 *   0  the run completed (including a run where some sources failed)
 *   1  configuration or startup error
 *   2  the run threw
 *   4  another run holds the lease — not an error, and not a failure
 */
import { randomUUID } from 'crypto';
import { hostname } from 'os';
import {
  acquireScraperLease, releaseScraperLease, renewScraperLease, LEASE_RENEW_MS,
} from '@/lib/server/job-sources/run-lock';

/** Structured, greppable, and free of anything secret. */
function log(fields: Record<string, string | number | boolean | undefined>): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${typeof v === 'string' && /\s/.test(v) ? JSON.stringify(v) : v}`);
  console.log(`[scraper] ${parts.join(' ')}`);
}

function parseArgs(argv: readonly string[]) {
  let limit: number | undefined;
  let trigger = 'manual';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--limit' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) limit = Math.floor(n);
      i += 1;
    } else if (argv[i] === '--trigger' && argv[i + 1]) {
      /* Constrained: this string is logged, so it is chosen from a known set
         rather than echoed back from the command line. */
      trigger = argv[i + 1] === 'timer' ? 'timer' : 'manual';
      i += 1;
    }
  }
  return { limit, trigger };
}

async function main(): Promise<number> {
  const { limit, trigger } = parseArgs(process.argv.slice(2));
  const runId = `run-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const owner = `${hostname()}:${process.pid}`;

  /* ONE scraper at a time, across PM2 and systemd alike. Taken before any
     provider is contacted, so a losing run costs nobody a single request. */
  const lease = await acquireScraperLease(runId, owner);
  if (!lease.ok) {
    log({
      event: 'skipped', reason: 'already_running',
      heldBy: lease.heldBy.runId, since: lease.heldBy.acquiredAt,
    });
    return 4;
  }

  /* Keep the lease alive for as long as the run legitimately takes. If a renewal
     reports the lease was lost, another run now owns it and this one must not
     keep writing — it stops rather than racing. */
  let lost = false;
  const renewer = setInterval(() => {
    void renewScraperLease(runId).then((held) => {
      if (!held) { lost = true; log({ event: 'lease_lost', runId }); }
    }).catch(() => { /* a transient renewal failure is covered by the TTL */ });
  }, LEASE_RENEW_MS);
  /* Never hold the process open on the timer alone. */
  if (typeof renewer.unref === 'function') renewer.unref();

  const startedAt = Date.now();
  log({ event: 'start', runId, trigger, owner, limit: limit ?? 'default' });

  try {
    const { runCanonicalIngestion } = await import('@/lib/server/job-sources/run-ingestion');

    /* ═══ NO `deadlineAt` — THIS IS THE POINT OF THE WORKER ═══
       The admin route must pass one because the platform will kill the request
       at 300 s. Nothing kills this process, so the source loop is never starved
       by a slow corpus load and `discovered: 0` cannot be produced by the
       clock. Runtime is bounded by systemd's own timeout instead. */
    const out = await runCanonicalIngestion({
      ...(limit ? { perSourceLimit: limit } : {}),
    });

    for (const s of out.perSource) {
      if (s.skipped && s.skipReason === 'requires_partnership') continue;
      log({
        event: 'source', runId, source: s.sourceId,
        ok: s.ok, skipped: s.skipped || undefined, reason: s.skipReason,
        discovered: s.discovered, inserted: s.inserted, updated: s.updated,
        unchanged: s.unchanged, rejected: s.rejected, durationMs: s.latencyMs,
        /* `error` is SourceFetchError's safe message — a host and a status,
           never a URL with credentials and never a stack. */
        error: s.error, errorKind: s.errorKind, errorStatus: s.errorStatus,
      });
    }

    log({
      event: 'complete', runId, trigger,
      durationMs: Date.now() - startedAt,
      sources: out.sources, sourcesOk: out.sourcesOk, failed: out.failed,
      skipped: out.skipped, deadlineSkipped: out.deadlineSkipped,
      discovered: out.discovered, inserted: out.inserted, updated: out.updated,
      unchanged: out.unchanged, duplicates: out.duplicateInRun,
      rejected: out.rejected, truncated: out.truncated,
      leaseLost: lost || undefined,
    });
    return 0;
  } catch (error) {
    /* The message only — a stack could name filesystem paths, and the summary
       is what an operator reads in the journal. */
    log({
      event: 'failed', runId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : 'scraper run failed',
    });
    return 2;
  } finally {
    clearInterval(renewer);
    /* Scoped to this runId, so a run that already lost its lease cannot
       release the successor's. */
    await releaseScraperLease(runId).catch(() => {});
  }
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    log({ event: 'startup_error', error: error instanceof Error ? error.message : 'unknown' });
    process.exitCode = 1;
  });
