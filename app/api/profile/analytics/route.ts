import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getPublicAnalyticsForUser } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const queryUserId = searchParams.get('userId');

    const session = await getAuthSession();

    let targetUserId: string;
    if (queryUserId) {
      targetUserId = queryUserId;
    } else {
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      const users = await getStoredUsers();
      const user = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
      targetUserId = user.id;
    }

    const analytics = await getPublicAnalyticsForUser(targetUserId);
    return NextResponse.json({ analytics });
  } catch (error) {
    console.error('[profile/analytics]', error);
    return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
  }
}
