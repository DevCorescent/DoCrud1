import { NextRequest, NextResponse } from 'next/server';
import { getOriginForRequest } from '@/lib/server/request';
import { sendPlanRenewalReminders } from '@/lib/server/billing-reminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 400 });
  }

  const headerSecret = request.headers.get('x-cron-secret') || '';
  const querySecret = request.nextUrl.searchParams.get('secret') || '';
  if (headerSecret !== secret && querySecret !== secret) {
    return unauthorized();
  }

  const origin = getOriginForRequest(request);
  const daysAheadRaw = request.nextUrl.searchParams.get('daysAhead');
  const daysAhead = daysAheadRaw ? Number(daysAheadRaw) : 3;
  const result = await sendPlanRenewalReminders({ origin, daysAhead, actorEmail: 'cron' });
  return NextResponse.json(result);
}

