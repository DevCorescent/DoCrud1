/**
 * Push a trend up or down.
 *
 * Requires a session, and the voter is always the session user — the body
 * carries only a direction. One position per member per trend is enforced in
 * lib/server/trends.ts, so repeat clicks withdraw rather than accumulate.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { voteTrend } from '@/lib/server/trends';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession().catch(() => null);
    const userId = session?.user ? await resolveSessionUserId(session).catch(() => null) : null;
    if (!userId) return NextResponse.json({ error: 'Sign in to vote on trends.' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as { direction?: unknown };
    const direction = body.direction === 1 || body.direction === 'up' ? 1
      : body.direction === -1 || body.direction === 'down' ? -1
      : null;
    if (direction === null) {
      return NextResponse.json({ error: 'Direction must be up or down.' }, { status: 400 });
    }

    const result = await voteTrend(params.id, userId, direction);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({ trend: result.trend }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[trends/:id/vote] POST error', error);
    return NextResponse.json({ error: 'Unable to record that vote.' }, { status: 500 });
  }
}
