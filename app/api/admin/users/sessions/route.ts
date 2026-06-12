import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { listActiveSessions } from '@/lib/server/admin-users';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const windowMinutes = Number(request.nextUrl.searchParams.get('windowMinutes') || '15');
    const limit = Number(request.nextUrl.searchParams.get('limit') || '260');
    const sessions = await listActiveSessions({ windowMinutes, limit });
    return NextResponse.json({ windowMinutes, count: sessions.length, sessions });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load active sessions' }, { status: 500 });
  }
}

