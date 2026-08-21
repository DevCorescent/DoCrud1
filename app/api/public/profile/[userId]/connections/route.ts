import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import { getFollowers, getFollowing, getAllProfiles } from '@/lib/server/user-profiles';

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

    /* The viewer's own following set is fetched ONCE, not once per card.
       buildCard used to `await isFollowing(viewer, uid)` for every person in
       both lists — an N+1 against the follow store that scaled with the size
       of the profile being viewed. One lookup, then an O(1) Set membership
       test per card. */
    const [followerIds, followingIds, profiles, viewerFollowingIds] = await Promise.all([
      getFollowers(userId),
      getFollowing(userId),
      getAllProfiles(),
      sessionUser ? getFollowing(sessionUser.id) : Promise.resolve([] as string[]),
    ]);
    const viewerFollows = new Set(viewerFollowingIds);

    /* Also O(1) per card: `users.find()` inside the map was a linear scan of
       every user for every follower. */
    const usersById = new Map(users.map((u) => [u.id, u]));

    const buildCard = (uid: string): UserCard | null => {
      const u = usersById.get(uid);
      if (!u) return null;
      const p = profiles[uid] ?? {};
      const following = sessionUser ? viewerFollows.has(uid) : false;
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

    /* buildCard is now synchronous, so no per-card promises at all. */
    const followers = followerIds.map(buildCard);
    const following = followingIds.map(buildCard);

    return NextResponse.json({
      followers: followers.filter(Boolean) as UserCard[],
      following: following.filter(Boolean) as UserCard[],
    });
  } catch (error) {
    console.error('[profile/connections] GET error', error);
    return NextResponse.json({ error: 'Failed to load connections.' }, { status: 500 });
  }
}
