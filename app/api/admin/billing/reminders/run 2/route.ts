import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getOriginForRequest } from '@/lib/server/request';
import { sendPlanRenewalReminders } from '@/lib/server/billing-reminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const origin = getOriginForRequest(request);
    const body = await request.json().catch(() => null) as any;
    const daysAhead = typeof body?.daysAhead === 'number' ? body.daysAhead : Number(body?.daysAhead || 3);
    const result = await sendPlanRenewalReminders({
      origin,
      daysAhead,
      actorEmail: session.user.email || 'admin',
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to run billing reminders.' }, { status: 500 });
  }
}

