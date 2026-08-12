import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { deleteComment, updateComment } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

function mapComments(
  comments: Array<{
    id: string;
    userId: string;
    userName: string;
    text: string;
    createdAt: string;
    parentId?: string;
    likedBy?: string[];
  }>,
  viewerIdentifier: string,
) {
  return comments.map((c) => ({
    id: c.id,
    author: c.userName,
    text: c.text,
    createdAt: c.createdAt,
    userId: c.userId,
    parentId: c.parentId ?? null,
    likesCount: (c.likedBy ?? []).length,
    likedByViewer: viewerIdentifier ? (c.likedBy ?? []).includes(viewerIdentifier) : false,
  }));
}

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
    return NextResponse.json({ comments: mapComments(updated.comments ?? [], userId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed';
    const status = message.startsWith('Not allowed') ? 403 : message.includes('not found') ? 404 : 500;
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
    return NextResponse.json({ comments: mapComments(updated.comments ?? [], userId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed';
    const status = message.startsWith('Not allowed') ? 403 : message.includes('not found') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
