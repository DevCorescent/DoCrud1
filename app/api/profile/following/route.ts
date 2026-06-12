import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getFollowing } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

/** GET /api/profile/following — returns the list of userIds the current session user follows */
export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ followingIds: [] });
    }
    const users = await getStoredUsers();
    const me = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
    if (!me) return NextResponse.json({ followingIds: [] });
    const followingIds = await getFollowing(me.id);
    return NextResponse.json({ followingIds });
  } catch {
    return NextResponse.json({ followingIds: [] });
  }
}
