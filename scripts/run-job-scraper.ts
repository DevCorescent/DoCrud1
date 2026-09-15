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
 * ceiling. It is NOT unbounded, though — `TimeoutStartSec` in the systemd unit
 * is a hard execution window, and every write in a run happens after the source
 * loop, so a kill mid-loop loses the entire pass. This worker therefore runs on
 * an explicit budget SMALLER than that timeout, stops reading new sources while
 * there is still time to persist, and resumes from where it stopped on the next
 * invocation. See DEFAULT_BUDGET_MS and the call into `runCanonicalIngest`.
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
/* ═══ THIS IMPORT MUST STAY FIRST ═══

   `import` statements are hoisted and evaluated in order, before ANY top-level
   statement in this file. So the environment cannot be loaded from inside
   main() if a module imported above it reads process.env while it is being
   evaluated. Loading it in the first import removes that ordering hazard
   entirely rather than relying on nobody ever introducing one.

   Everything that touches configuration — the database handle, the lease, the
   source registry — is imported DYNAMICALLY below, after this has run. */
import { loadAppEnvOrThrow } from './load-env';
import { randomUUID } from 'crypto';
import { hostname } from 'os';

/**
 * The worker's execution window, in milliseconds.
 *
 * Paired with `TimeoutStartSec=840` in ops/systemd/docrud-job-scraper.service:
 * this must be comfortably SMALLER, so the run stops on its own terms and
 * persists, rather than being killed with everything still in memory.
 */
export const DEFAULT_BUDGET_MS = 780_000;

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
  let runId: string | undefined;
  let budgetMs: number | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--limit' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) limit = Math.floor(n);
      i += 1;
    } else if (argv[i] === '--budget-ms' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) budgetMs = Math.floor(n);
      i += 1;
    } else if (argv[i] === '--run-id' && argv[i + 1]) {
      /* Validated, not trusted: this reaches a storage key and a log line. */
      if (/^[A-Za-z0-9_-]{1,64}$/.test(argv[i + 1])) runId = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--trigger' && argv[i + 1]) {
      /* Constrained: this string is logged, so it is chosen from a known set
         rather than echoed back from the command line. */
      trigger = argv[i + 1] === 'timer' ? 'timer' : 'manual';
      i += 1;
    }
  }
  return { limit, trigger, runId, budgetMs };
}

async function main(): Promise<number> {
  const { limit, trigger, runId: providedRunId, budgetMs: budgetArg } = parseArgs(process.argv.slice(2));

  /* The same `.env*` resolution the Next.js server performs, so the worker
     scrapes EXACTLY the boards the dashboard lists and writes to EXACTLY the
     database the app reads. Without it MONGODB_URI is undefined here and the
     run would either throw on the lease or, worse, proceed against an
     unconfigured store. Names only are ever reported — never values. */
  const env = loadAppEnvOrThrow({
    required: ['MONGODB_URI'],
    /* At least one board list, or the run would legitimately find nothing and
       there would be no way to tell that from a misconfiguration. */
    anyOf: [
      'GREENHOUSE_BOARDS', 'LEVER_COMPANIES', 'ASHBY_JOB_BOARDS',
      'SMARTRECRUITERS_COMPANIES', 'WORKDAY_BOARDS', 'WORKABLE_COMPANIES',
      'RECRUITEE_COMPANIES', 'PERSONIO_COMPANIES', 'BAMBOOHR_COMPANIES',
      'MICROSOFT_CAREERS',
    ],
  });
  log({ event: 'env', files: env.loadedFiles.join(',') || '(none)' });

  /* ═══ THE EXECUTION WINDOW ═══

     MUST stay below the unit's `TimeoutStartSec` (840 s), because the run has
     to finish AND persist while the process is still alive — a kill at the
     systemd boundary loses the whole pass. 780 s leaves a minute of headroom
     for the final writes to land and the lease to be released.

     Overridable for a one-off longer or shorter run, but the default is the
     one that matches the installed unit. If the unit's timeout is ever raised,
     raise this too — and never above it. */
  const envBudget = Number(process.env.SCRAPER_BUDGET_MS);
  const budgetMs = budgetArg
    ?? (Number.isFinite(envBudget) && envBudget > 0 ? envBudget : DEFAULT_BUDGET_MS);
  log({ event: 'budget', budgetMs, source: budgetArg ? 'flag' : (process.env.SCRAPER_BUDGET_MS ? 'env' : 'default') });

  /* Imported only now — after the environment exists. */
  const {
    acquireScraperLease, releaseScraperLease, renewScraperLease, LEASE_RENEW_MS,
  } = await import('@/lib/server/job-sources/run-lock');
  const runs = await import('@/lib/server/job-sources/runs');
  /* The API opens the run BEFORE spawning this process, so that its 202 can
     hand the browser a runId to poll immediately. When that happened the id is
     passed in and must be reused — minting a second one here would leave the
     UI polling a run nothing will ever update. */
  const runId = providedRunId ?? `run-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
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

  /* ═══ SIGNALS MUST RELEASE THE LEASE ═══

     Node's DEFAULT handling of SIGINT/SIGTERM terminates the process
     immediately: the `finally` below does not run, so the lease is left held
     and the scraper refuses to start again until the 15-minute TTL expires.
     That was observed — a Ctrl+C'd run blocked the next attempt for a quarter
     of an hour — and it matters beyond the keyboard, because `systemctl stop`
     and a TimeoutStartSec kill both send SIGTERM.

     Installing a handler makes the interrupt orderly: release, then exit with
     the conventional 128+signal code so systemd and the shell still see a
     terminated process rather than a clean one. The TTL remains the backstop
     for the cases no handler can cover (SIGKILL, power loss, OOM). */
  let releasing = false;
  const onSignal = (signal: NodeJS.Signals, code: number) => {
    /* A second Ctrl+C must not start a second release. */
    if (releasing) return;
    releasing = true;
    log({ event: 'interrupted', runId, signal });
    void releaseScraperLease(runId)
      .catch(() => { /* the TTL covers a failed release */ })
      .finally(() => { process.exit(code); });
  };
  process.once('SIGINT', () => onSignal('SIGINT', 130));
  process.once('SIGTERM', () => onSignal('SIGTERM', 143));

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

  /* ═══ THE RUN RECORD IS THE UI's ONLY SOURCE OF TRUTH ═══

     Written from here rather than from the API, because this is the process
     that actually knows what happened. Everything below is best-effort: a
     storage hiccup while recording PROGRESS must never abort a scrape that is
     otherwise working. The scrape is the product; the record describes it. */
  const record = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch { /* progress reporting is never fatal */ }
  };

  if (providedRunId) {
    /* The API already opened this run as `queued`. */
    await record(() => runs.claimIngestionRun(runId, owner));
  } else {
    await record(() => runs.startIngestionRun(runId, {
      trigger: trigger === 'timer' ? 'timer' : 'manual',
      workerId: owner,
    }));
  }

  /* Proof of life, so a crashed worker is distinguishable from a slow one. */
  const heart = setInterval(() => { void record(() => runs.heartbeatIngestionRun(runId)); },
    LEASE_RENEW_MS);
  if (typeof heart.unref === 'function') heart.unref();

  try {
    const { runCanonicalIngest } = await import('@/lib/server/scraper-client');

    /* ═══ THE WORKER IS BOUNDED, AND MUST KNOW IT ═══

       This previously called `runCanonicalIngestion` DIRECTLY with no deadline,
       reasoning that "nothing kills this process". That was wrong in three
       ways, and a full 87-source run proved all three at once by being killed
       at ~14 minutes with no `event=complete` and nothing persisted:

         1. systemd DOES kill it. `TimeoutStartSec=840` is a hard execution
            window, so the worker is exactly as bounded as the HTTP route was —
            it just had no idea. Every write in a run happens AFTER the source
            loop, so a kill mid-loop loses the ENTIRE pass: no jobs, no
            per-source state, no cursors, no timestamps.

         2. Without a deadline the loop never stops voluntarily, so it can never
            reach the write it was killed before performing. The mechanism to
            stop early and persist already existed and was simply unused.

         3. Calling the pipeline directly skipped the resume bookkeeping that
            lives in `runCanonicalIngest`: the round-robin cursor and the
            per-source resume tokens were never loaded and never saved. With 87
            sources and a window that fits only some of them, the worker
            re-read the head of the list on every invocation and could never
            reach the tail.

       Routing through `runCanonicalIngest` fixes all three: it sizes a
       persistence reserve against the corpus, sets `deadlineAt`, resumes after
       the last attempted source, restores each source's cursor, and writes the
       state back. A run that cannot fit 87 sources now covers what it can and
       the NEXT run continues from there — instead of losing everything.

       The budget is deliberately SHORTER than the systemd timeout: the run must
       finish and persist while the process is still alive. */
    const summary = await runCanonicalIngest({
      budgetMs,
      ...(limit ? { totalLimit: limit } : {}),
    });
    /* The unflattened summary: per-source skip reasons, write breakdown,
       deadlineSkipped and seenStamped — the fields the journal needs. */
    const out = summary.raw;
    if (!out) throw new Error('scraper run returned no detailed summary');

    for (const s of out.perSource) {
      if (s.skipped && s.skipReason === 'requires_partnership') continue;
      await record(() => runs.recordSourceResult(runId, {
        sourceId: s.sourceId, ok: s.ok, jobsFound: s.discovered,
        latencyMs: s.latencyMs, attempts: 1,
        ...(s.skipped ? { skipped: true } : {}),
        ...(s.skipReason === 'deadline' || s.skipReason === 'disabled'
          ? { skipReason: s.skipReason }
          : {}),
        inserted: s.inserted, updated: s.updated, unchanged: s.unchanged,
        duplicates: s.duplicateInRun, rejected: s.rejected,
        ...(s.error ? { error: s.error } : {}),
        ...(s.errorKind ? { errorKind: s.errorKind } : {}),
        ...(s.errorStatus ? { errorStatus: s.errorStatus } : {}),
      }));
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

    /* Counted from the per-source results rather than re-derived, so the
       headline numbers and the per-source lines can never disagree. Partnership
       skips are excluded: they are configuration, not an operational event. */
    const attempted = out.perSource.filter(
      (x) => !(x.skipped && x.skipReason === 'requires_partnership'),
    );
    const skippedForTime = attempted.filter((x) => x.skipped && x.skipReason === 'deadline').length;

    log({
      event: 'complete', runId, trigger, owner,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      sources: attempted.length,
      sourcesOk: attempted.filter((x) => x.ok && !x.skipped).length,
      sourcesFailed: attempted.filter((x) => !x.ok).length,
      sourcesSkipped: attempted.filter((x) => x.skipped).length,
      failed: out.failed, skipped: out.skipped,
      deadlineSkipped: out.deadlineSkipped,
      discovered: out.discovered, inserted: out.inserted, updated: out.updated,
      unchanged: out.unchanged, duplicates: out.duplicateInRun,
      rejected: out.rejected, truncated: out.truncated,
      seenStamped: out.seenStamped,
      leaseLost: lost || undefined,
    });

    /* ═══ THE TWO OUTCOMES THAT LOOK LIKE SUCCESS AND ARE NOT ═══

       Both were observed in production reporting a healthy-looking run. They
       are called out as their own log line so `journalctl -p warning` and any
       future alerting can find them without parsing the summary. Neither
       changes the exit code: the run genuinely completed, and turning a
       diagnosable condition into a systemd failure would only bury it. */
    if (skippedForTime > 0) {
      log({ event: 'warning', runId, issue: 'deadline_skipped',
        detail: `${skippedForTime} source(s) were never contacted because the run ran out of time` });
    }
    if (out.discovered === 0 && attempted.some((x) => !x.skipped)) {
      log({ event: 'warning', runId, issue: 'zero_discovered',
        detail: 'sources were contacted but returned no postings at all' });
    }

    /* `partial` is the point of this call. A run that lost one board used to be
       recorded as `completed` — the same word as a run where everything worked. */
    const outcome = runs.runOutcome(attempted);
    await record(() => runs.finishIngestionRun(runId, outcome, undefined, {
      discovered: out.discovered, inserted: out.inserted, updated: out.updated,
      unchanged: out.unchanged, duplicates: out.duplicateInRun,
      rejected: out.rejected, deadlineSkipped: out.deadlineSkipped,
    }));
    log({ event: 'outcome', runId, outcome });
    return 0;
  } catch (error) {
    /* The message only — a stack could name filesystem paths, and the summary
       is what an operator reads in the journal. */
    const message = error instanceof Error ? error.message : 'scraper run failed';
    log({ event: 'failed', runId, durationMs: Date.now() - startedAt, error: message });
    await record(() => runs.finishIngestionRun(runId, 'failed', message));
    return 2;
  } finally {
    clearInterval(renewer);
    clearInterval(heart);
    /* Scoped to this runId, so a run that already lost its lease cannot
       release the successor's. */
    await releaseScraperLease(runId).catch(() => {});
  }
}

/**
 * ═══ ONLY WHEN INVOKED DIRECTLY ═══
 *
 * This module used to call `main()` at import time, so merely importing it —
 * to read a constant, say — STARTED A REAL SCRAPE: it loaded production
 * environment, took the Mongo lease, and began fetching boards. That happened:
 * a self-test importing DEFAULT_BUDGET_MS acquired the lease and ran for five
 * minutes before being killed. Nothing was written (the run died before the
 * post-loop write) and the lease self-expired on its TTL, but the module has no
 * business doing any of that unless it was actually run.
 *
 * `process.argv[1]` is the script the runtime was pointed at. Comparing against
 * it works under `npx tsx scripts/run-job-scraper.ts`, which is how both systemd
 * and an operator invoke it, and is false for any import.
 */
const invokedDirectly = (() => {
  const entry = process.argv[1] ?? '';
  return entry.endsWith('run-job-scraper.ts') || entry.endsWith('run-job-scraper.js');
})();

if (invokedDirectly) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      log({ event: 'startup_error', error: error instanceof Error ? error.message : 'unknown' });
      process.exitCode = 1;
    });
}
