import { NextRequest, NextResponse } from 'next/server';
import { getFileTransfers, updateFileTransfer } from '@/lib/server/file-transfers';
import { getAuthSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    const viewerIdentifier = session?.user?.id || session?.user?.email || '';
    const viewerUserId = session?.user?.id || '';
    const transfers = await getFileTransfers();
    const t = transfers.find(
      (x) => (x.id === id || x.shareId === id) &&
              x.directoryVisibility === 'public' &&
              x.authMode === 'public' &&
              !x.revokedAt &&
              x.moderationStatus !== 'removed',
    );
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
      id: t.id,
      shareId: t.shareId,
      category: t.directoryCategory?.toLowerCase() || 'document',
      badge: t.directoryTags?.[0] || 'Published',
      title: t.title || t.fileName,
      byline: `${t.uploadedByName || t.uploadedBy?.split('@')[0] || 'Docrud User'} · ${t.fileName}`,
      uploadedByName: t.uploadedByName || t.uploadedBy?.split('@')[0] || 'Docrud User',
      body: t.notes || '',
      chips: (t.directoryTags ?? []).slice(1).length > 0 ? (t.directoryTags ?? []).slice(1) : undefined,
      postedAt: t.createdAt,
      featured: !!t.featured,
      isReal: true,
      likesCount: t.likesCount ?? 0,
      likedByViewer: viewerIdentifier ? (t.likedBy ?? []).includes(viewerIdentifier) : false,
      trendCount: t.trendCount ?? 0,
      viewCount: t.viewCount ?? t.openCount ?? 0,
      trendedByViewer: viewerIdentifier ? (t.trendedBy ?? []).includes(viewerIdentifier) : false,
      interestedCount: t.interestedCount ?? 0,
      interestedByViewer: viewerIdentifier ? (t.interestedBy ?? []).includes(viewerIdentifier) : false,
      commentsCount: t.commentsCount ?? 0,
      comments: (t.comments ?? []).map((c) => ({
        id: c.id,
        author: c.userName,
        text: c.text,
        createdAt: c.createdAt,
        userId: c.userId,
        parentId: c.parentId ?? null,
        likesCount: (c.likedBy ?? []).length,
        likedByViewer: viewerIdentifier ? (c.likedBy ?? []).includes(viewerIdentifier) : false,
      })),
      dataUrl: t.dataUrl || null,
      mimeType: t.mimeType || null,
      videoUrl: t.videoUrl || null,
      thumbnailUrl: (() => {
        const u = t.thumbnailUrl;
        if (u && !u.startsWith('data:')) return u;
        if (t.mimeType?.startsWith('image/') && t.dataUrl?.startsWith('data:image/')) {
          return `/api/public/thumbnail/${t.id}`;
        }
        if (
          t.mimeType === 'text/html' &&
          (t.directoryCategory === 'post' || t.directoryCategory === 'product') &&
          t.dataUrl?.startsWith('data:text/html')
        ) {
          return `/api/public/thumbnail/${t.id}`;
        }
        return null;
      })(),
      uploadedByUserId: t.uploadedByUserId,
      canDelete: viewerUserId ? t.uploadedByUserId === viewerUserId : false,
      interestedUsers: viewerUserId && t.uploadedByUserId === viewerUserId
        ? ((t as unknown as { interestedUsers?: Array<{ id: string; name: string; markedAt: string }> }).interestedUsers ?? [])
        : undefined,
    });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    const viewerUserId = session?.user?.id;
    if (!viewerUserId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const transfers = await getFileTransfers();
    const t = transfers.find((x) => (x.id === id || x.shareId === id) && !x.revokedAt);
    if (!t) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    if (t.uploadedByUserId !== viewerUserId) return NextResponse.json({ error: 'You can only delete your own posts.' }, { status: 403 });

    await updateFileTransfer(t.id, { revokedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete.' }, { status: 500 });
  }
}
