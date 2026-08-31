import type { SecureFileTransfer } from '@/types/document';
import { getMongoDb } from '@/lib/server/database';

const COL = 'file_transfers';

function strip(doc: SecureFileTransfer & { _id?: unknown }): SecureFileTransfer {
  const { _id: _unused, ...rest } = doc as { _id?: unknown } & SecureFileTransfer;
  return rest as SecureFileTransfer;
}

/* `revokedAt` is absent on live transfers rather than null, so this asks for
   "not set to a value" — the same thing the in-memory `!ft.revokedAt` check
   does. Typed loosely because the driver's Filter type does not model an
   optional string field being absent. */
const SITEMAP_FILTER = {
  directoryVisibility: 'public',
  $or: [{ revokedAt: { $exists: false } }, { revokedAt: '' }],
} as unknown as Record<string, never>;

/** The only fields the public sitemap reads from a transfer. */
export type FileTransferSitemapRow = Pick<
  SecureFileTransfer, 'id' | 'updatedAt' | 'createdAt'
>;

/**
 * Public, non-revoked transfers, projected to the handful of fields the
 * sitemap needs.
 *
 * `selectAllFileTransferRows` returns WHOLE documents — `dataUrl` blobs
 * included — so using it here shipped the entire file corpus over the wire to
 * build a list of URLs. Measured at ~161s for 189 transfers, which blew the
 * sitemap's 8s guard every time and silently dropped every /published/ URL
 * from the sitemap. Filtering and projecting in the database fixes both the
 * time and the missing URLs.
 */
export async function selectPublicFileTransferSitemapRows(
  limit = 5000,
): Promise<FileTransferSitemapRow[] | null> {
  const db = await getMongoDb();
  if (!db) return null;

  const docs = await db
    .collection<SecureFileTransfer & { _id: string }>(COL)
    .find(
      /* `revokedAt` is absent on live transfers rather than null, so the check
         is "not set to a value" — matching the in-memory `!ft.revokedAt`. */
      SITEMAP_FILTER,
      { projection: { _id: 0, id: 1, updatedAt: 1, createdAt: 1 } },
    )
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs as unknown as FileTransferSitemapRow[];
}

export async function selectAllFileTransferRows(): Promise<SecureFileTransfer[]> {
  const db = await getMongoDb();
  if (!db) return [];

  const docs = await db
    .collection<SecureFileTransfer & { _id: string }>(COL)
    .find({})
    .sort({ createdAt: -1, _id: -1 })
    .toArray();

  return docs.map(strip);
}

/**
 * Public file transfers for one user.
 *
 * Used by profile analytics so we don't load every file_transfer
 * document in the database.
 */
export async function selectPublicFileTransferRowsForUser(
  userId: string,
): Promise<SecureFileTransfer[]> {
  const db = await getMongoDb();
  if (!db) return [];

  const docs = await db
    .collection(COL)
    .find({
      uploadedByUserId: userId,
      directoryVisibility: 'public',
      revokedAt: null,
    })
    .project({
      dataUrl: 0,
      encryptedDataUrl: 0,
    })
    .toArray();

  return docs.map((doc) => {
    const { _id: _unused, ...rest } = doc as {
      _id?: unknown;
    } & SecureFileTransfer;

    return rest as SecureFileTransfer;
  });
}

/**
 * Public analytics totals for one user, aggregated inside MongoDB.
 *
 * Returns a single small document instead of streaming every matching
 * file_transfer row (which can each carry multi-MB dataUrl blobs) back to
 * Node just to sum a handful of counters.
 */
export async function aggregatePublicAnalyticsForUser(
  userId: string,
  nowIso: string,
): Promise<{
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  publishCount: number;
  featuredCount: number;
} | null> {
  const db = await getMongoDb();
  if (!db) return null;

  const docs = await db
    .collection(COL)
    .aggregate([
      {
        $match: {
          uploadedByUserId: userId,
          directoryVisibility: 'public',
          revokedAt: null,
        },
      },
      {
        $group: {
          _id: null,
          publishCount: { $sum: 1 },
          totalViews: { $sum: { $ifNull: ['$viewCount', { $ifNull: ['$openCount', 0] }] } },
          totalLikes: { $sum: { $ifNull: ['$likesCount', 0] } },
          totalComments: { $sum: { $ifNull: ['$commentsCount', 0] } },
          featuredCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $toBool: { $ifNull: ['$featured', false] } },
                    { $gt: [{ $ifNull: ['$featuredUntil', ''] }, nowIso] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ])
    .toArray();

  const row = docs[0] as
    | {
        publishCount?: number;
        totalViews?: number;
        totalLikes?: number;
        totalComments?: number;
        featuredCount?: number;
      }
    | undefined;

  return {
    totalViews: row?.totalViews ?? 0,
    totalLikes: row?.totalLikes ?? 0,
    totalComments: row?.totalComments ?? 0,
    publishCount: row?.publishCount ?? 0,
    featuredCount: row?.featuredCount ?? 0,
  };
}

/**
 * Lean query for the public feed — filters public-only transfers at the DB level,
 * excludes the large dataUrl/encryptedDataUrl fields (can be MB each), but adds a
 * computed boolean `hasDataUrl` so thumbnail URL logic can still work correctly.
 * Orders of magnitude faster than selectAllFileTransferRows for feed use-cases.
 */
export async function selectPublicFileTransfersForFeed(
  options: { moderationFiltered?: boolean } = {},
): Promise<
  (SecureFileTransfer & {
    hasDataUrl?: boolean;
    hasImageDataUrl?: boolean;
    hasHtmlDataUrl?: boolean;
  })[]
> {
  const db = await getMongoDb();
  if (!db) return [];
  const { moderationFiltered = true } = options;
  const docs = await db.collection(COL).aggregate([
    {
      $match: {
        directoryVisibility: 'public',
        authMode: 'public',
        revokedAt: null,
        ...(moderationFiltered ? { moderationStatus: { $nin: ['suspended', 'removed'] } } : {}),
      },
    },
    {
      $addFields: {
        hasDataUrl: {
          $cond: {
            if: { $and: [{ $ifNull: ['$dataUrl', false] }, { $ne: ['$dataUrl', ''] }] },
            then: true,
            else: false,
          },
        },
        // Prefix tests evaluated server-side, so callers can reproduce
        // `dataUrl.startsWith('data:image/')` without the blob crossing the wire.
        hasImageDataUrl: {
          $eq: [{ $indexOfCP: [{ $ifNull: ['$dataUrl', ''] }, 'data:image/'] }, 0],
        },
        hasHtmlDataUrl: {
          $eq: [{ $indexOfCP: [{ $ifNull: ['$dataUrl', ''] }, 'data:text/html'] }, 0],
        },
      },
    },
    { $project: { dataUrl: 0, encryptedDataUrl: 0 } },
    { $sort: { createdAt: -1, _id: -1 } },
  ]).toArray();
  return docs.map(d => {
    const { _id: _unused, ...rest } = d as { _id?: unknown } & SecureFileTransfer & {
      hasDataUrl?: boolean;
      hasImageDataUrl?: boolean;
      hasHtmlDataUrl?: boolean;
    };
    return rest;
  });
}

/** Fields that are large and never needed by list/summary views. */
const LIST_PROJECTION = {
  dataUrl: 0,
  encryptedDataUrl: 0,
  accessEvents: 0,
  comments: 0,
  likedBy: 0,
  trendedBy: 0,
  interestedBy: 0,
} as const;

/**
 * Most-recently-updated active transfers, filtered and limited in MongoDB.
 *
 * Callers that only render a short "recent" list previously pulled the whole
 * collection (dataUrl blobs and all) and sorted it in Node.
 */
export async function selectRecentFileTransferRows(
  match: Record<string, unknown>,
  limit: number,
): Promise<SecureFileTransfer[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db
    .collection(COL)
    .find({ revokedAt: null, ...match })
    .project(LIST_PROJECTION)
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit)
    .toArray();
  return docs.map((doc) => {
    const { _id: _unused, ...rest } = doc as { _id?: unknown } & SecureFileTransfer;
    return rest as SecureFileTransfer;
  });
}

/**
 * Non-revoked transfers matching an arbitrary filter, without the blob fields.
 *
 * For directory search paths that still need to score rows in JS — the match
 * itself belongs in MongoDB, and the multi-MB dataUrl never has to travel.
 */
export async function selectLeanFileTransferRows(
  match: Record<string, unknown>,
): Promise<SecureFileTransfer[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db
    .collection(COL)
    .find({ revokedAt: null, ...match })
    .project(LIST_PROJECTION)
    .toArray();
  return docs.map((doc) => {
    const { _id: _unused, ...rest } = doc as { _id?: unknown } & SecureFileTransfer;
    return rest as SecureFileTransfer;
  });
}

/** Per-category counts for non-revoked transfers, counted inside MongoDB. */
export async function aggregateDirectoryCategoryCounts(): Promise<Array<{ label: string; count: number }> | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const docs = await db
    .collection(COL)
    .aggregate([
      { $match: { revokedAt: null, directoryCategory: { $type: 'string' } } },
      { $group: { _id: { $trim: { input: '$directoryCategory' } }, count: { $sum: 1 } } },
      { $match: { _id: { $ne: '' } } },
    ])
    .toArray();
  return (docs as Array<{ _id: string; count: number }>).map((d) => ({ label: d._id, count: d.count }));
}

/** Directory-wide totals, summed inside MongoDB instead of over a full read. */
export async function aggregateDirectoryStats(): Promise<{
  totalFiles: number;
  publicFiles: number;
  totalSizeInBytes: number;
  totalOpens: number;
  totalDownloads: number;
} | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const docs = await db
    .collection(COL)
    .aggregate([
      { $match: { revokedAt: null } },
      {
        $group: {
          _id: null,
          totalFiles: { $sum: 1 },
          publicFiles: { $sum: { $cond: [{ $eq: ['$directoryVisibility', 'public'] }, 1, 0] } },
          totalSizeInBytes: { $sum: { $ifNull: ['$sizeInBytes', 0] } },
          totalOpens: { $sum: { $ifNull: ['$openCount', 0] } },
          totalDownloads: { $sum: { $ifNull: ['$downloadCount', 0] } },
        },
      },
    ])
    .toArray();
  const row = docs[0] as Record<string, number> | undefined;
  return {
    totalFiles: row?.totalFiles ?? 0,
    publicFiles: row?.publicFiles ?? 0,
    totalSizeInBytes: row?.totalSizeInBytes ?? 0,
    totalOpens: row?.totalOpens ?? 0,
    totalDownloads: row?.totalDownloads ?? 0,
  };
}

/**
 * The set of access passwords already in use.
 *
 * Upload used to read the entire collection (6.6 MB of dataUrl blobs, measured)
 * purely to check a new password against existing ones. `distinct` returns just
 * the values.
 */
export async function selectExistingAccessPasswords(): Promise<Set<string>> {
  const db = await getMongoDb();
  if (!db) return new Set();
  const values = await db.collection(COL).distinct('accessPassword', {
    accessPassword: { $type: 'string' },
  });
  return new Set(
    (values as string[]).map((value) => value.trim().toUpperCase()).filter(Boolean),
  );
}

export async function selectFileTransferRowById(idOrShareId: string): Promise<SecureFileTransfer | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection<SecureFileTransfer & { _id: string }>(COL).findOne({
    $or: [{ _id: idOrShareId }, { shareId: idOrShareId }],
  });
  return doc ? strip(doc) : null;
}

/**
 * Lean lookup for thumbnail serving — prefer thumbnailUrl / mime without pulling
 * multi-MB dataUrl blobs. Falls back to full row only when needed by caller.
 */
export async function selectFileTransferThumbMeta(idOrShareId: string): Promise<{
  id: string;
  shareId?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  directoryCategory?: string;
  hasDataUrl: boolean;
} | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const docs = await db.collection(COL).aggregate([
    { $match: { $or: [{ _id: idOrShareId }, { shareId: idOrShareId }] } },
    {
      $project: {
        id: 1,
        shareId: 1,
        thumbnailUrl: 1,
        mimeType: 1,
        directoryCategory: 1,
        hasDataUrl: {
          $cond: {
            if: { $and: [{ $ifNull: ['$dataUrl', false] }, { $ne: ['$dataUrl', ''] }] },
            then: true,
            else: false,
          },
        },
      },
    },
    { $limit: 1 },
  ]).toArray();
  const d = docs[0] as
    | {
        id?: string;
        _id?: string;
        shareId?: string;
        thumbnailUrl?: string;
        mimeType?: string;
        directoryCategory?: string;
        hasDataUrl?: boolean;
      }
    | undefined;
  if (!d) return null;
  return {
    id: d.id || d._id || idOrShareId,
    shareId: d.shareId,
    thumbnailUrl: d.thumbnailUrl,
    mimeType: d.mimeType,
    directoryCategory: d.directoryCategory,
    hasDataUrl: !!d.hasDataUrl,
  };
}

export async function upsertFileTransferRow(t: SecureFileTransfer): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  await db.collection(COL).replaceOne({ _id: t.id as any }, { ...t, _id: t.id }, { upsert: true });
}

export async function deleteFileTransferRow(idOrShareId: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;
  const result = await db.collection(COL).deleteOne({
    $or: [{ _id: idOrShareId as any }, { shareId: idOrShareId }],
  });
  return result.deletedCount > 0;
}

export interface FileTransferFilterOpts {
  role: string;
  email: string;
  orgId: string | null;
}

export async function selectFileTransferRowsForUser(opts: FileTransferFilterOpts): Promise<SecureFileTransfer[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const { role, email, orgId } = opts;
  const col = db.collection<SecureFileTransfer & { _id: string }>(COL);
  const sort = { createdAt: -1 as const, _id: -1 as const };
  const lowerEmail = email.toLowerCase();

  if (role === 'admin') {
    return (await col.find({}).sort(sort).toArray()).map(strip);
  }
  if (role === 'client') {
    return (await col.find({
      $or: [{ organizationId: orgId || '' }, { uploadedBy: { $regex: new RegExp(`^${escRe(lowerEmail)}$`, 'i') } }],
    }).sort(sort).toArray()).map(strip);
  }
  return (await col.find({
    uploadedBy: { $regex: new RegExp(`^${escRe(lowerEmail)}$`, 'i') },
  }).sort(sort).toArray()).map(strip);
}

export async function reconcileFileTransferRows(rows: SecureFileTransfer[]): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection(COL);
  const incomingIds = rows.map((r) => r.id);
  await col.deleteMany({ _id: { $nin: incomingIds as any } });
  if (rows.length > 0) {
    await (col as any).bulkWrite(
      rows.map((t) => ({
        replaceOne: {
          filter: { _id: t.id },
          replacement: { ...t, _id: t.id },
          upsert: true,
        },
      })),
    );
  }
}

export async function patchFileTransfersByFolderId(
  folderId: string,
  patch: { folderName?: string | null; folderId?: string | null },
): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if ('folderName' in patch) updates.folderName = patch.folderName ?? null;
  if ('folderId' in patch) updates.folderId = patch.folderId ?? null;
  await db.collection(COL).updateMany({ folderId }, { $set: updates });
}

export async function patchFileTransfersByLockerId(
  lockerId: string,
  patch: { accessPassword?: string },
): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  if (patch.accessPassword !== undefined) {
    await db.collection(COL).updateMany(
      { lockerId },
      { $set: { accessPassword: patch.accessPassword, updatedAt: new Date().toISOString() } },
    );
  }
}

export async function bulkReplaceFileTransferRows(rows: SecureFileTransfer[]): Promise<void> {
  return reconcileFileTransferRows(rows);
}

function escRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
