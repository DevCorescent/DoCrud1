import { NextRequest, NextResponse } from 'next/server';
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
    const updated = await updateComment(id, commentId, userId, body.text.trim());
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
