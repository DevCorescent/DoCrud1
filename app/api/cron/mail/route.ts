/**
 * Cron route — scheduled mail.
 *
 * THE PROBLEM THIS SOLVES: `runDueMailCampaigns()` already existed and worked,
 * but its only caller was /api/admin/mail/campaigns/run, which requires an
 * authenticated admin session. A campaign scheduled for 3am therefore sat at
 * 'scheduled' until a human happened to open the panel and press a button —
 * scheduling that only works while someone is watching is not scheduling.
 *
 * This endpoint gives that function a caller that needs no browser, no session
 * and no open page. It is intentionally thin: all campaign logic stays in
 * lib/server/mail-campaigns.ts, so there is exactly one send path and one state
 * machine.
 *
 * Authorization is the project's existing CRON_SECRET convention, shared via
 * lib/server/cron-auth.ts. Vercel Cron sends `Authorization: Bearer
 * <CRON_SECRET>` automatically once the variable is configured.
 *
 * SAFE TO CALL REPEATEDLY. `claimCampaign` means an overlapping invocation
 * reports 'skipped' rather than sending a second copy to every recipient.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkCronAuth } from '@/lib/server/cron-auth';
import { runDueMailCampaigns } from '@/lib/server/mail-campaigns';
import { getPublicAppBaseUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/* Sending is I/O-bound and batched; give it room beyond the default. */
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const auth = checkCronAuth(req);
  if (!auth.authorized) {
    /* The reason is a coarse category, never the secret or any hint of it. */
    return NextResponse.json(
      {
        error: auth.reason === 'missing-secret-config'
          ? 'Scheduled mail is not configured.'
          : 'Unauthorized',
      },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  try {
    /* Tracking pixels and rewritten links must point at the canonical public
       host, not at whatever internal hostname the scheduler happened to use. */
    const origin = getPublicAppBaseUrl();
    const summary = await runDueMailCampaigns(origin);

    const failed = summary.results.filter((r) => r.status === 'failed').length;
    const partial = summary.results.filter((r) => r.status === 'partial').length;

    return NextResponse.json({
      ok: true,
      processed: summary.processed,
      remaining: summary.remaining,
      failed,
      partial,
      durationMs: Date.now() - startedAt,
      results: summary.results,
    });
  } catch (error) {
    /* runDueMailCampaigns already isolates per-campaign failures, so reaching
       here means the run itself could not start (storage unavailable, for
       example). Log it server-side; return a flat message. */
    console.error('[cron/mail] run failed', error);
    return NextResponse.json(
      { ok: false, error: 'Scheduled mail run failed.', durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}

/** Vercel Cron issues GET. */
export async function GET(req: NextRequest) {
  return handle(req);
}

/** POST is accepted so an external scheduler can use either verb. */
export async function POST(req: NextRequest) {
  return handle(req);
}
