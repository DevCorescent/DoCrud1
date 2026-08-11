import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { getDbPool } from '@/lib/server/database';
import { selectRecentFileTransferRows } from '@/lib/server/db/file-transfers-rows';

export const dynamic = 'force-dynamic';

/** Upper bounds on what this endpoint can ever render (8 owned + 10 public). */
const OWNED_LIMIT = 8;
const PUBLIC_LIMIT = 12;

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
  viewer: NonNullable<NonNullable<Awaited<ReturnType<typeof getAuthSession>>>['user']>,
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

type Viewer = NonNullable<Awaited<ReturnType<typeof getAuthSession>>>['user'];
type Transfer = Awaited<ReturnType<typeof getFileTransfers>>[number];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Mongo equivalent of isOwnedByViewer(). */
function ownedMatch(viewer: Viewer) {
  const email = (viewer.email || '').toLowerCase();
  const or: Record<string, unknown>[] = [{ uploadedByUserId: viewer.id }];
  if (email) or.push({ uploadedBy: { $regex: `^${escapeRegExp(email)}$`, $options: 'i' } });
  if (viewer.role === 'client') or.push({ organizationId: viewer.id });
  return { $or: or };
}

/**
 * Fetches only the rows this endpoint can actually render.
 *
 * The public slice is over-fetched by OWNED_LIMIT so that removing the
 * viewer's own posts still leaves a full page of public ones.
 */
async function loadRecent(viewer: Viewer | null): Promise<{
  publicTransfers: Transfer[];
  ownedTransfers: Transfer[];
}> {
  const publicMatch = { directoryVisibility: 'public', authMode: 'public' };

  if (getDbPool()) {
    const [publicTransfers, ownedTransfers] = await Promise.all([
      selectRecentFileTransferRows(publicMatch, PUBLIC_LIMIT + OWNED_LIMIT),
      viewer ? selectRecentFileTransferRows(ownedMatch(viewer), OWNED_LIMIT) : Promise.resolve([]),
    ]);
    return { publicTransfers, ownedTransfers };
  }

  // JSON-file fallback (no database configured).
  const active = (await getFileTransfers())
    .filter((entry) => !entry.revokedAt)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  return {
    publicTransfers: active.filter(
      (entry) => entry.directoryVisibility === 'public' && entry.authMode === 'public',
    ),
    ownedTransfers: viewer ? active.filter((entry) => isOwnedByViewer(entry, viewer)) : [],
  };
}

export async function GET() {
  try {
    const session = await getAuthSession();
    const viewer = session?.user || null;

    const { publicTransfers, ownedTransfers } = await loadRecent(viewer);

    // Set membership instead of the previous nested `.some()` scan (O(n·m) → O(n)).
    const ownedIds = new Set(ownedTransfers.map((entry) => entry.id));

    const selected = viewer
      ? [
          ...ownedTransfers.slice(0, OWNED_LIMIT).map((entry) => ({ entry, source: 'yours' as RecentPublishSource })),
          ...publicTransfers
            .filter((entry) => !ownedIds.has(entry.id))
            .slice(0, 10)
            .map((entry) => ({ entry, source: 'public' as RecentPublishSource })),
        ]
      : publicTransfers
          .slice(0, PUBLIC_LIMIT)
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
