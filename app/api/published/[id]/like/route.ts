import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { toggleLike } from '@/lib/server/file-transfers';
import { earnCredits } from '@/lib/server/credits';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { addSocialEvent } from '@/lib/server/social-events';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    const identifier = session?.user?.id || session?.user?.email || '';
    if (!identifier) {
      return NextResponse.json({ error: 'Sign in to like posts.' }, { status: 401 });
    }

    const result = await toggleLike(id, identifier);

    // Award credits and fire social event when liked (not when unliked)
    if (result.liked) {
      const transfers = await getFileTransfers();
      const post = transfers.find((t) => t.id === id || t.shareId === id);
      if (post?.uploadedByUserId && post.uploadedByUserId !== identifier) {
        void earnCredits(post.uploadedByUserId, 'post_like', 1, `Your post "${post.title || post.fileName}" received a like`).catch(() => {});

        // Look up actor name/avatar
        const users = await getStoredUsers().catch(() => []);
        const actor = users.find((u) => u.id === identifier || u.email === identifier);
        void addSocialEvent({
          type: 'like',
          actorId: actor?.id ?? identifier,
          actorName: actor?.name || session?.user?.name || 'Someone',
          actorAvatar: actor ? undefined : undefined,
          targetUserId: post.uploadedByUserId,
          resourceId: post.id,
          resourceTitle: post.title || post.fileName,
          href: `/published/${post.shareId || post.id}`,
        }).catch(() => {});
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
