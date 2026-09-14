import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getIngestionRun } from '@/lib/server/job-sources/runs';
import { HEARTBEAT_STALE_MS } from '@/lib/server/job-sources/run-progress';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/* A single stored-document read. It is polled every few seconds, so it must be
   cheap and must never be the request that hangs. */
export const maxDuration = 15;

/**
 * The state of one scraper run.
 *
 * This is what makes the 202 useful: the browser gets a runId back
 * immediately and reads progress from here instead of holding a connection
 * open for minutes and being cut off by nginx at 60 s.
 *
 * Everything returned is READ from the persisted run record. Nothing is
 * estimated, interpolated or extrapolated — a progress bar that moves because
 * time passed rather than because work happened is worse than no progress bar,
 * because it cannot show a stall.
 *
 * Super-Admin only. The run record holds no secrets, but it does describe
 * infrastructure (worker host, source ids, error categories) that has no
 * business being public.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { runId: string } },
) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  /* Validated before it reaches storage, even though the only caller is our
     own UI: an id from the URL is input, and input is checked. */
  const runId = String(params.runId || '');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(runId)) {
    return NextResponse.json({ error: 'Invalid run id.' }, { status: 400 });
  }

  const run = await getIngestionRun(runId).catch(() => null);
  if (!run) return NextResponse.json({ error: 'Run not found.' }, { status: 404 });

  const active = run.status === 'queued' || run.status === 'running';
  const heartbeatAge = run.heartbeatAt
    ? Date.now() - Date.parse(run.heartbeatAt)
    : null;
  /* A run still marked `running` whose worker stopped reporting is a CRASHED
     run. Without saying so, the UI would poll a spinner forever. The record is
     not rewritten here — a read endpoint must not mutate state — it is only
     described accurately. */
  const stale = active
    && heartbeatAge !== null
    && heartbeatAge > HEARTBEAT_STALE_MS;

  return NextResponse.json({
    runId: run.runId,
    status: run.status,
    stale,
    trigger: run.trigger ?? null,
    requestedBy: run.requestedBy ?? null,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt ?? null,
    heartbeatAt: run.heartbeatAt ?? null,
    durationMs: run.durationMs
      ?? (active ? Math.max(0, Date.now() - Date.parse(run.startedAt)) : null),
    progress: {
      /* `sourcesTotal` is absent until a worker claims the run. `null` says
         "not known yet"; a 0 would render as a completed-of-zero bar. */
      sourcesTotal: run.sourcesTotal ?? null,
      sourcesCompleted: run.sourcesAttempted,
      sourcesSucceeded: run.sourcesSucceeded,
      sourcesFailed: run.sourcesFailed,
    },
    metrics: {
      discovered: run.discovered ?? run.jobsFound,
      inserted: run.inserted ?? 0,
      updated: run.updated ?? 0,
      unchanged: run.unchanged ?? 0,
      duplicates: run.duplicates ?? 0,
      rejected: run.rejected ?? 0,
      expired: run.expired ?? 0,
      deadlineSkipped: run.deadlineSkipped ?? 0,
    },
    /* Per-source rows, already bounded by MAX_RUN_SOURCE_RESULTS when written.
       `error` here is the adapter's safe message — a host and a status. */
    sources: run.sources.map((s) => ({
      sourceId: s.sourceId,
      ok: s.ok,
      skipped: s.skipped ?? false,
      skipReason: s.skipReason ?? null,
      discovered: s.jobsFound,
      inserted: s.inserted ?? 0,
      updated: s.updated ?? 0,
      unchanged: s.unchanged ?? 0,
      durationMs: s.latencyMs,
      error: s.error ?? null,
      errorKind: s.errorKind ?? null,
    })),
    error: run.error ?? null,
  });
}
