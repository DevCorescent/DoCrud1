import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getEmailOutbox } from '@/lib/server/email-outbox';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const limit = Number(request.nextUrl.searchParams.get('limit') || 200);
    const events = await getEmailOutbox(limit);

    const summary = events.reduce(
      (acc, ev) => {
        acc.total += 1;
        if (ev.status === 'sent') acc.sent += 1;
        if (ev.status === 'failed') acc.failed += 1;
        acc.opens += Number(ev.tracking?.opens || 0);
        acc.clicks += Number(ev.tracking?.clicks || 0);
        return acc;
      },
      { total: 0, sent: 0, failed: 0, opens: 0, clicks: 0 },
    );

    return NextResponse.json({ summary, events });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load outbox' }, { status: 500 });
  }
}

