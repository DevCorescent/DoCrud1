import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import { getFollowers, getFollowing, getAllProfiles, isFollowing as checkIsFollowing } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

interface UserCard {
  id: string;
  name: string;
  headline?: string;
  avatarUrl?: string;
  location?: string;
  accountType?: string;
  isFollowing: boolean;
}

export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const { userId } = params;

    const session = await getAuthSession();
    const users = await getStoredUsers();
    const sessionUser = session?.user?.email
      ? users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase())
      : null;

    const [followerIds, followingIds, profiles] = await Promise.all([
      getFollowers(userId),
      getFollowing(userId),
      getAllProfiles(),
    ]);

    const buildCard = async (uid: string): Promise<UserCard | null> => {
      const u = users.find((x) => x.id === uid);
      if (!u) return null;
      const p = profiles[uid] ?? {};
      const following = sessionUser ? await checkIsFollowing(sessionUser.id, uid) : false;
      return {
        id: u.id,
        name: u.name,
        headline: p.headline,
        avatarUrl: p.avatarUrl,
        location: p.location,
        accountType: u.accountType,
        isFollowing: following,
      };
    };

    const [followers, following] = await Promise.all([
      Promise.all(followerIds.map(buildCard)),
      Promise.all(followingIds.map(buildCard)),
    ]);

    return NextResponse.json({
      followers: followers.filter(Boolean) as UserCard[],
      following: following.filter(Boolean) as UserCard[],
    });
  } catch (error) {
    console.error('[profile/connections] GET error', error);
    return NextResponse.json({ error: 'Failed to load connections.' }, { status: 500 });
  }
}
