import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { toggleTrend, getFileTransfers } from '@/lib/server/file-transfers';
import { earnCredits } from '@/lib/server/credits';
import { addSocialEvent } from '@/lib/server/social-events';
import { getStoredUsers } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    const identifier = session?.user?.id || session?.user?.email || '';
    if (!identifier) {
      return NextResponse.json({ error: 'Sign in to trend posts.' }, { status: 401 });
    }

    const result = await toggleTrend(id, identifier);

    if (result.trended) {
      const transfers = await getFileTransfers();
      const post = transfers.find((t) => t.id === id || t.shareId === id);
      if (post?.uploadedByUserId && post.uploadedByUserId !== identifier) {
        void earnCredits(post.uploadedByUserId, 'post_like', 1, `Your post "${post.title || post.fileName}" is trending`).catch(() => {});

        const users = await getStoredUsers().catch(() => []);
        const actor = users.find((u) => u.id === identifier || u.email === identifier);
        void addSocialEvent({
          type: 'like',
          actorId: actor?.id ?? identifier,
          actorName: actor?.name || session?.user?.name || 'Someone',
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
