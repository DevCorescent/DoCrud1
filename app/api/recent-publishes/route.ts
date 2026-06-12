import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getFileTransfers } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

type RecentPublishSource = 'public' | 'yours';

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const fixed = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(fixed).replace(/\.0$/, '')} ${units[unitIndex]}`;
}

function isOwnedByViewer(
  entry: Awaited<ReturnType<typeof getFileTransfers>>[number],
  viewer: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>['user'],
) {
  if (viewer.role === 'admin') {
    return entry.uploadedByUserId === viewer.id
      || entry.uploadedBy.toLowerCase() === (viewer.email || '').toLowerCase();
  }

  if (viewer.role === 'client') {
    return entry.organizationId === viewer.id
      || entry.uploadedByUserId === viewer.id
      || entry.uploadedBy.toLowerCase() === (viewer.email || '').toLowerCase();
  }

  return entry.uploadedByUserId === viewer.id
    || entry.uploadedBy.toLowerCase() === (viewer.email || '').toLowerCase();
}

export async function GET() {
  try {
    const [session, transfers] = await Promise.all([getAuthSession(), getFileTransfers()]);
    const viewer = session?.user || null;

    const activeTransfers = transfers
      .filter((entry) => !entry.revokedAt)
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

    const publicTransfers = activeTransfers.filter(
      (entry) => entry.directoryVisibility === 'public' && entry.authMode === 'public',
    );

    const ownedTransfers = viewer
      ? activeTransfers.filter((entry) => isOwnedByViewer(entry, viewer))
      : [];

    const selected = viewer
      ? [
          ...ownedTransfers.slice(0, 8).map((entry) => ({ entry, source: 'yours' as RecentPublishSource })),
          ...publicTransfers
            .filter((entry) => !ownedTransfers.some((owned) => owned.id === entry.id))
            .slice(0, 10)
            .map((entry) => ({ entry, source: 'public' as RecentPublishSource })),
        ]
      : publicTransfers
          .slice(0, 12)
          .map((entry) => ({ entry, source: 'public' as RecentPublishSource }));

    const items = selected.map(({ entry, source }) => ({
      id: entry.id,
      shareId: entry.shareId,
      title: entry.title || entry.fileName,
      fileName: entry.fileName,
      notes: entry.notes,
      mimeType: entry.mimeType,
      category: entry.directoryCategory,
      tags: entry.directoryTags || [],
      visibility: entry.directoryVisibility === 'public' ? 'public' : 'private',
      source,
      sizeLabel: formatBytes(entry.sizeInBytes || 0),
      openCount: entry.openCount || 0,
      interestedCount: entry.interestedCount ?? 0,
      downloadCount: entry.downloadCount || 0,
      updatedAt: entry.updatedAt,
      createdAt: entry.createdAt,
      publishedBy: entry.organizationName || entry.uploadedBy,
      href:
        source === 'yours' && entry.directoryVisibility !== 'public'
          ? '/workspace?tab=file-transfers'
          : `/transfer/${entry.shareId}`,
    }));

    return NextResponse.json({
      items,
      generatedAt: new Date().toISOString(),
      mode: viewer ? 'mixed' : 'public',
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Unable to load recent publishes.' }, { status: 500 });
  }
}
