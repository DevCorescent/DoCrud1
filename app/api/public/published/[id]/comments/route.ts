import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { addComment, getFileTransferById } from '@/lib/server/file-transfers';
import { mapPublishedComments } from '@/lib/server/published-comments';
import { addSocialEvent } from '@/lib/server/social-events';
import { deliverMentions } from '@/lib/server/mention-delivery';
import { normalizeMentions, mentionsToPlainText } from '@/lib/server/mention-text';

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

    /* Commenting is a write, so identity is established before anything else
       is read. resolveSessionUserId is the same helper the rest of the app
       uses; it returns null when there is no usable session, which is the
       only signal this route trusts. Author identity is never taken from the
       request body — only text and parentId are read from it. */
    const session = await getAuthSession();
    const userId = session?.user ? await resolveSessionUserId(session) : null;
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to comment.' }, { status: 401 });
    }
    const userName = session?.user?.name || 'Anonymous';

    const body = await request.json() as { text?: string; parentId?: string };
    if (!body.text?.trim()) return NextResponse.json({ error: 'Comment text required' }, { status: 400 });

    const { text: normalizedText, mentionedIds } = await normalizeMentions(body.text.trim());
    const updated = await addComment(id, userId, userName, normalizedText, body.parentId ?? undefined);
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
        excerpt: mentionsToPlainText(body.text.trim()).slice(0, 120),
        href: `/published/${updated.shareId || id}`,
      }).catch(() => {});
    }

    /* The mention event type already exists; the post author is skipped when
       they are also the commenter, and nobody is notified about themselves. */
    /* Notification and mention chat message, once per (comment, person).
       Fired after the comment is saved and deliberately not awaited: the
       composer should not wait on conversation writes, and a failure here can
       never fail a comment that already exists. */
    const createdId = updated.comments?.[updated.comments.length - 1]?.id;
    if (createdId && mentionedIds.length > 0) {
      void deliverMentions({
        commentId: createdId,
        publicationId: updated.id,
        publicationTitle: updated.title || updated.fileName || 'a publication',
        href: `/published/${updated.shareId || id}#comments`,
        actorId: userId,
        actorName: userName,
        mentionedIds,
        preview: mentionsToPlainText(normalizedText),
      }).catch(() => {});
    }

    return NextResponse.json({ comments });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
