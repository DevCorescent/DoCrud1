import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { toggleLike } from '@/lib/server/file-transfers';
import { earnCredits } from '@/lib/server/credits';
import { getFileTransfers } from '@/lib/server/file-transfers';

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

    // Award credits to post author when liked (not when unliked)
    if (result.liked) {
      const transfers = await getFileTransfers();
      const post = transfers.find((t) => t.id === id || t.shareId === id);
      if (post?.uploadedByUserId && post.uploadedByUserId !== identifier) {
        void earnCredits(post.uploadedByUserId, 'post_like', 1, `Your post "${post.title || post.fileName}" received a like`).catch(() => {});
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
