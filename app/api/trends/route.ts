/**
 * Community Trends — list and create.
 *
 * GET is public: anyone can read the board, signed out included. When a
 * session exists the response also carries that viewer's own position on each
 * trend so the up/down controls render in the right state without a second
 * call.
 *
 * POST requires a signed-in member. The author is always taken from the
 * session — a client cannot post a trend as somebody else.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { createTrend, listTrends } from '@/lib/server/trends';

export const dynamic = 'force-dynamic';

async function viewerId(): Promise<string | null> {
  const session = await getAuthSession().catch(() => null);
  if (!session?.user) return null;
  return resolveSessionUserId(session).catch(() => null);
}

export async function GET() {
  try {
    const trends = await listTrends(await viewerId());
    return NextResponse.json({ trends }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[trends] GET error', error);
    return NextResponse.json({ trends: [] }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession().catch(() => null);
    const userId = session?.user ? await resolveSessionUserId(session).catch(() => null) : null;
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to add a trend.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as {
      title?: string; category?: string; description?: string;
    };

    const result = await createTrend({
      title: String(body.title ?? ''),
      category: typeof body.category === 'string' ? body.category : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      userId,
      userName: session?.user?.name || session?.user?.email?.split('@')[0] || 'Someone',
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ trend: result.trend }, { status: 201 });
  } catch (error) {
    console.error('[trends] POST error', error);
    return NextResponse.json({ error: 'Unable to add this trend.' }, { status: 500 });
  }
}
