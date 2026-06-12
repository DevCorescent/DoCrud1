import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { listInfinitySubscribers } from '@/lib/server/infinity';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

/**
 * GET /api/admin/billing/infinity-subscribers
 * Returns all users who have ever activated Docrud Infinity.
 * Admin-only.
 */
export async function GET() {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const subscribers = await listInfinitySubscribers();

    const now = Date.now();
    const active  = subscribers.filter((s) => s.active).length;
    const expired = subscribers.filter((s) => s.isExpired).length;
    const free    = subscribers.filter((s) => s.grantedFree).length;
    const monthly = subscribers.filter((s) => s.period === 'monthly' && s.active).length;
    const annual  = subscribers.filter((s) => s.period === 'annual'  && s.active).length;

    return NextResponse.json({
      total: subscribers.length,
      stats: { active, expired, free, monthly, annual },
      subscribers,
      fetchedAt: new Date(now).toISOString(),
    });
  } catch (error) {
    console.error('[infinity-subscribers GET]', error);
    return NextResponse.json({ error: 'Failed to fetch Infinity subscribers.' }, { status: 500 });
  }
}
