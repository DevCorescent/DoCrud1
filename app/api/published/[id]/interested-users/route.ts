import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getFileTransfers } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const transfers = await getFileTransfers();
    const post = transfers.find((t) => t.id === id || t.shareId === id);
    if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Only the post owner can see the list
    const viewerId = session.user.id || session.user.email || '';
    const isOwner = post.uploadedByUserId === viewerId ||
      post.uploadedBy?.toLowerCase() === (session.user.email || '').toLowerCase();
    if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const users = (post as unknown as { interestedUsers?: Array<{ id: string; name: string; markedAt: string }> })
      .interestedUsers ?? [];
    return NextResponse.json({
      users,
      count: post.interestedCount ?? users.length,
      postTitle: post.title || post.fileName,
      category: post.directoryCategory,
    });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
