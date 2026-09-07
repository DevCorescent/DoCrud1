/**
 * Cron route — recommendation refresh.
 *
 * Thin by design: every decision (what is stale, what to recompute, how to
 * write it) lives in lib/server/recommendation-scheduler.ts, so the schedule
 * has no business logic of its own and a queue can drive the same function
 * later without moving any.
 *
 * Authorization is the project's existing CRON_SECRET convention via
 * lib/server/cron-auth.ts — the same one /api/cron/mail uses.
 *
 * SAFE TO CALL REPEATEDLY. The pass is single-flighted and idempotent: an
 * overlapping invocation reports `locked` instead of reading the corpus a
 * second time, and a pass with nothing stale writes nothing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/server/cron-auth';
import { runScheduledRefresh } from '@/lib/server/recommendation-scheduler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* The corpus read dominates the pass; give it room beyond the default. */
export const maxDuration = 300;

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.authorized) {
    return NextResponse.json(
      {
        error: auth.reason === 'missing-secret-config'
          ? 'Scheduled recommendations are not configured.'
          : 'Unauthorized',
      },
      { status: 401 },
    );
  }

  try {
    const result = await runScheduledRefresh();
    return NextResponse.json(result);
  } catch (error) {
    /* A failed pass is a FAILURE, not an empty success. The previous records
       are untouched, so the last good recommendations keep serving. */
    console.error('[cron/recommendations] refresh failed', error);
    return NextResponse.json({ error: 'Recommendation refresh failed.' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
