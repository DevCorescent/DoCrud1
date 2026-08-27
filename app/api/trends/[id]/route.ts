/**
 * One trend, with its full daily history — the detail view's chart data.
 * Public, like the board itself.
 */
import { NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getTrend } from '@/lib/server/trends';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession().catch(() => null);
    const viewerId = session?.user ? await resolveSessionUserId(session).catch(() => null) : null;

    const trend = await getTrend(params.id, viewerId);
    if (!trend) return NextResponse.json({ error: 'Trend not found.' }, { status: 404 });

    return NextResponse.json({ trend }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[trends/:id] GET error', error);
    return NextResponse.json({ error: 'Unable to load this trend.' }, { status: 500 });
  }
}
