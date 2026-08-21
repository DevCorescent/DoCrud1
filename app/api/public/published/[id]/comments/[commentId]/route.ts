import { NextRequest, NextResponse } from 'next/server';
import { deliverMentions } from '@/lib/server/mention-delivery';
import { normalizeMentions, mentionsToPlainText } from '@/lib/server/mention-text';
import { getAuthSession } from '@/lib/server/auth';
import { deleteComment, updateComment } from '@/lib/server/file-transfers';
import { mapPublishedComments } from '@/lib/server/published-comments';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    const { id, commentId } = await params;
    const session = await getAuthSession();
    const userId = session?.user?.id || session?.user?.email || '';
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to edit comments.' }, { status: 401 });
    }
    const body = await request.json() as { text?: string };
    if (!body.text?.trim()) {
      return NextResponse.json({ error: 'Comment text required' }, { status: 400 });
    }
    /* An edit goes through the same mention validation as a new comment, so a
       PATCH cannot smuggle in a mention whose label disagrees with its id. */
    const { text: normalizedText, mentionedIds } = await normalizeMentions(body.text.trim());
    const updated = await updateComment(id, commentId, userId, normalizedText);

    /* People newly named by the edit are told once; anyone already notified
       for this comment is skipped by the delivery ledger, so re-saving or
       re-adding an existing mention sends nothing further. */
    if (mentionedIds.length > 0) {
      const actorName = session?.user?.name || 'Someone';
      void deliverMentions({
        commentId,
        publicationId: updated.id,
        publicationTitle: updated.title || updated.fileName || 'a publication',
        href: `/published/${updated.shareId || id}#comments`,
        actorId: userId,
        actorName,
        mentionedIds,
        preview: mentionsToPlainText(normalizedText),
      }).catch(() => {});
    }

    return NextResponse.json({ comments: await mapPublishedComments(updated.comments, userId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed';
    /* Both ownership guards in lib/server/file-transfers.ts are authorization
       failures, but they word themselves differently — match each, so a
       non-owner delete reports 403 rather than a misleading 500. */
    const denied = message.startsWith('Not allowed') || message.startsWith('You can only');
    const status = denied ? 403 : message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    const { id, commentId } = await params;
    const session = await getAuthSession();
    const userId = session?.user?.id || session?.user?.email || '';
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to delete comments.' }, { status: 401 });
    }
    const updated = await deleteComment(id, commentId, userId);
    return NextResponse.json({ comments: await mapPublishedComments(updated.comments, userId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed';
    /* Both ownership guards in lib/server/file-transfers.ts are authorization
       failures, but they word themselves differently — match each, so a
       non-owner delete reports 403 rather than a misleading 500. */
    const denied = message.startsWith('Not allowed') || message.startsWith('You can only');
    const status = denied ? 403 : message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
