import { NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getStoredUserById } from '@/lib/server/users';

export const dynamic = 'force-dynamic';

/** GET /api/me — canonical current user (email-resolved id). */
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = await resolveSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const user = await getStoredUserById(userId);
  return NextResponse.json({
    id: userId,
    email: user?.email || session.user.email || null,
    name: user?.name || session.user.name || null,
    role: user?.role || session.user.role || null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
