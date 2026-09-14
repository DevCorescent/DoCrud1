import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { dispatchScraperRun } from '@/lib/server/job-sources/dispatch';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The execution window for this route.
 *
 * ═══ IT NO LONGER NEEDS ONE ═══
 *
 * This route USED to run the whole scrape inline, and the long comment that
 * stood here explained how 300 s was a ceiling rather than a guarantee. It
 * also said what the durable answer was: execute the run outside the request,
 * return a runId, and poll. That is now what happens, so the ceiling is no
 * longer load-bearing.
 *
 * What the route does today is: authenticate, check the lease, open a run
 * record, spawn the worker, answer 202. All of that is a handful of database
 * round-trips. 30 s is generous for it and is deliberately far below nginx's
 * 60 s `proxy_read_timeout`, so this response can never be the one the proxy
 * gives up on — which is exactly the failure that produced "Network error" on
 * the dashboard.
 */
export const maxDuration = 30;

/**
 * ACCEPT a scraper run. Does not perform it.
 *
 * The scrape itself goes through the canonical pipeline in the standalone
 * worker — the same entrypoint the systemd timer uses, so there is one
 * execution path rather than a request-shaped copy of one:
 *
 *   registry -> adapter (paginated) -> normalizeSourceJob -> identity
 *   -> dedupe/upsert -> classification -> lastSeenAt
 *
 * Super-Admin only.
 *
 * Responses:
 *   202  { runId, status: 'queued' }   poll GET .../scraper/runs/<runId>
 *   409  { error, runId, status }      a run is already in progress
 *   401  unauthenticated
 *   500  the worker could not be started
 */
export async function POST(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { limit?: unknown };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const totalLimit = Number(body.limit) || undefined;

  /* ═══ THE REQUEST NO LONGER RUNS THE SCRAPE ═══

     It used to, and that is what produced the "Network error" the dashboard
     showed for weeks: nginx closes a proxied response at 60 s, a run takes
     minutes, so the browser got an HTML 504 while the scrape carried on
     unseen. The fix is not a longer timeout — it is not doing minutes of work
     inside a request. The run is handed to the same standalone worker systemd
     uses, and this route answers with an id to poll. */
  const dispatched = await dispatchScraperRun({
    requestedBy: session.email || 'super-admin',
    ...(totalLimit ? { perSourceLimit: totalLimit } : {}),
  });

  if (!dispatched.ok) {
    if (dispatched.reason === 'already_running') {
      /* 409, not 500 and not a silent second run. The caller is told which run
         is already going so the UI can poll THAT one rather than starting a
         duplicate scrape of every board. */
      return NextResponse.json(
        { error: 'A scraper run is already in progress.', runId: dispatched.runId, status: 'running' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Could not start the scraper.' }, { status: 500 });
  }

  await appendSuperAdminAudit({
    action: 'jobs.scrape',
    targetType: 'hiring_job',
    /* The run was STARTED, not completed — its totals do not exist yet and
       recording zeros here would be a lie the audit log keeps forever. */
    details: { actor: session.email || 'super-admin', runId: dispatched.runId, dispatched: true },
  });

  return NextResponse.json(
    { runId: dispatched.runId, status: dispatched.status },
    { status: 202 },
  );
}
