import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { toggleCommentLike } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    const { id, commentId } = await params;
    const session = await getAuthSession();
    const identifier = session?.user?.id || session?.user?.email || '';
    if (!identifier) {
      return NextResponse.json({ error: 'Sign in to like comments.' }, { status: 401 });
    }
    const result = await toggleCommentLike(id, commentId, identifier);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
