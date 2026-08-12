import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { deleteComment } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      commentId: string;
    }>;
  },
) {
  try {
    const { id, commentId } = await params;

    if (!id || !commentId) {
      return NextResponse.json(
        { error: 'Post ID and comment ID are required.' },
        { status: 400 },
      );
    }

    const session = await getAuthSession();

    const userId =
      session?.user?.id ||
      session?.user?.email ||
      '';

    if (!userId) {
      return NextResponse.json(
        { error: 'Sign in to delete your comment.' },
        { status: 401 },
      );
    }

    const updated = await deleteComment(
      id,
      commentId,
      userId,
    );

    return NextResponse.json({
      success: true,
      deletedCommentId: commentId,
      commentsCount: updated.commentsCount ?? 0,
    });
  } catch (error) {
    console.error('[DELETE COMMENT]', error);

    const message =
      error instanceof Error
        ? error.message
        : 'Failed to delete comment.';

    if (message === 'Post not found.') {
      return NextResponse.json(
        { error: message },
        { status: 404 },
      );
    }

    if (message === 'Comment not found.') {
      return NextResponse.json(
        { error: message },
        { status: 404 },
      );
    }

    if (
      message ===
      'You can only delete your own comments.'
    ) {
      return NextResponse.json(
        { error: message },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}