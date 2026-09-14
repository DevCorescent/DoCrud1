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
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--limit' && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) limit = Math.floor(n);
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
  return { limit, trigger, runId };
}

async function main(): Promise<number> {
  const { limit, trigger, runId: providedRunId } = parseArgs(process.argv.slice(2));

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

main()
  .then((code) => { process.exitCode = code; })
  .catch((error) => {
    log({ event: 'startup_error', error: error instanceof Error ? error.message : 'unknown' });
    process.exitCode = 1;
  });
