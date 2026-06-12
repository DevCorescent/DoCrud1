import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import { followUser, unfollowUser, getFollowCounts, isFollowing } from '@/lib/server/user-profiles';
import { addSocialEvent } from '@/lib/server/social-events';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const users = await getStoredUsers();
  return users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase()) ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json()) as { targetUserId?: string; action?: 'follow' | 'unfollow' };
    const { targetUserId, action } = body;

    if (!targetUserId || !action) {
      return NextResponse.json({ error: 'targetUserId and action are required.' }, { status: 400 });
    }

    if (action !== 'follow' && action !== 'unfollow') {
      return NextResponse.json({ error: 'action must be "follow" or "unfollow".' }, { status: 400 });
    }

    if (actor.id === targetUserId) {
      return NextResponse.json({ error: 'You cannot follow yourself.' }, { status: 400 });
    }

    const users = await getStoredUsers();
    const target = users.find((u) => u.id === targetUserId);
    if (!target) {
      return NextResponse.json({ error: 'Target user not found.' }, { status: 404 });
    }

    if (action === 'follow') {
      await followUser(actor.id, targetUserId);
      // Emit social notification for the target user
      void addSocialEvent({
        type: 'follow',
        actorId: actor.id,
        actorName: actor.name || actor.email,
        actorAvatar: (actor as any).profile?.avatarUrl,
        actorHeadline: (actor as any).profile?.headline,
        targetUserId,
        href: `/u/${actor.id}`,
      }).catch(() => { /* non-critical */ });
    } else {
      await unfollowUser(actor.id, targetUserId);
    }

    const [counts, nowFollowing] = await Promise.all([
      getFollowCounts(targetUserId),
      isFollowing(actor.id, targetUserId),
    ]);

    return NextResponse.json({ followers: counts.followers, following: nowFollowing });
  } catch (error) {
    console.error('[profile/follow] POST error', error);
    return NextResponse.json({ error: 'Failed to process follow action.' }, { status: 500 });
  }
}
