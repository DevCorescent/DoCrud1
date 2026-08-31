import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getOriginForRequest } from '@/lib/server/request';
import { runDueMailCampaigns } from '@/lib/server/mail-campaigns';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const origin = getOriginForRequest(request);
    /* runDueMailCampaigns now returns a summary rather than a bare array; the
       existing `results` key is preserved so this endpoint's response shape is
       unchanged for anything already reading it. */
    const summary = await runDueMailCampaigns(origin);
    /* The summary already carries `results`, so the response keeps the exact
       key this endpoint has always returned, plus the new counts. */
    return NextResponse.json(summary);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to run due campaigns' }, { status: 500 });
  }
}

