import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { addComment, getFileTransfers } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    const viewerIdentifier = session?.user?.id || session?.user?.email || '';
    const transfers = await getFileTransfers();
    const t = transfers.find(
      (x) => (x.id === id || x.shareId === id) &&
              x.directoryVisibility === 'public' &&
              !x.revokedAt,
    );
    if (!t) return NextResponse.json({ comments: [] });
    return NextResponse.json({
      comments: (t.comments ?? []).map((c) => ({
        id: c.id, author: c.userName, text: c.text,
        createdAt: c.createdAt, userId: c.userId,
        parentId: c.parentId ?? null,
        likesCount: (c.likedBy ?? []).length,
        likedByViewer: viewerIdentifier ? (c.likedBy ?? []).includes(viewerIdentifier) : false,
      })),
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
    const viewerIdentifier = userId;
    const comments = (updated.comments ?? []).map((c) => ({
      id: c.id, author: c.userName, text: c.text,
      createdAt: c.createdAt, userId: c.userId,
      parentId: c.parentId ?? null,
      likesCount: (c.likedBy ?? []).length,
      likedByViewer: (c.likedBy ?? []).includes(viewerIdentifier),
    }));
    return NextResponse.json({ comments });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
