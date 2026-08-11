import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { toggleTrend, getFileTransferById } from '@/lib/server/file-transfers';
import { earnCredits } from '@/lib/server/credits';
import { addSocialEvent } from '@/lib/server/social-events';
import { getStoredUserById, getStoredUserByEmail } from '@/lib/server/users';

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
      const post = await getFileTransferById(id);
      if (post?.uploadedByUserId && post.uploadedByUserId !== identifier) {
        void earnCredits(post.uploadedByUserId, 'post_like', 1, `Your post "${post.title || post.fileName}" is trending`).catch(() => {});

        // Targeted lookup instead of loading the whole users table to find one actor.
        const actor = identifier.includes('@')
          ? await getStoredUserByEmail(identifier).catch(() => null)
          : await getStoredUserById(identifier).catch(() => null);
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
