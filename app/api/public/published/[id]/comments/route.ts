import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { addComment, getFileTransferById } from '@/lib/server/file-transfers';
import { mapPublishedComments } from '@/lib/server/published-comments';
import { addSocialEvent } from '@/lib/server/social-events';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    const viewerIdentifier = session?.user?.id || session?.user?.email || '';
    const found = await getFileTransferById(id);
    const t =
      found && found.directoryVisibility === 'public' && !found.revokedAt ? found : null;
    if (!t) return NextResponse.json({ comments: [] });
    return NextResponse.json({
      comments: await mapPublishedComments(t.comments, viewerIdentifier),
    });
  } catch {
    return NextResponse.json({ comments: [] });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as { text?: string; parentId?: string };
    if (!body.text?.trim()) return NextResponse.json({ error: 'Comment text required' }, { status: 400 });

    const session = await getAuthSession();
    const userId = session?.user?.id || session?.user?.email || `anon-${Date.now()}`;
    const userName = session?.user?.name || 'Anonymous';

    const updated = await addComment(id, userId, userName, body.text.trim(), body.parentId ?? undefined);
    const comments = await mapPublishedComments(updated.comments, userId);

    // Fire social event if the commenter is not the post author
    if (updated.uploadedByUserId && updated.uploadedByUserId !== userId) {
      void addSocialEvent({
        type: 'comment',
        actorId: userId,
        actorName: userName,
        targetUserId: updated.uploadedByUserId,
        resourceId: updated.id,
        resourceTitle: updated.title || updated.fileName,
        excerpt: body.text.trim().slice(0, 120),
        href: `/published/${updated.shareId || id}`,
      }).catch(() => {});
    }

    return NextResponse.json({ comments });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
