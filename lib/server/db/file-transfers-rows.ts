import type { SecureFileTransfer } from '@/types/document';
import { getMongoDb } from '@/lib/server/database';

const COL = 'file_transfers';

function strip(doc: SecureFileTransfer & { _id?: unknown }): SecureFileTransfer {
  const { _id: _unused, ...rest } = doc as { _id?: unknown } & SecureFileTransfer;
  return rest as SecureFileTransfer;
}

export async function selectAllFileTransferRows(): Promise<SecureFileTransfer[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db.collection<SecureFileTransfer & { _id: string }>(COL)
    .find({}).sort({ createdAt: -1, _id: -1 }).toArray();
  return docs.map(strip);
}

/**
 * Lean query for the public feed — filters public-only transfers at the DB level
 * and excludes the large dataUrl / encryptedDataUrl fields (can be MB each).
 * Orders of magnitude faster than selectAllFileTransferRows for feed use-cases.
 */
export async function selectPublicFileTransfersForFeed(): Promise<SecureFileTransfer[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db.collection<SecureFileTransfer & { _id: string }>(COL)
    .find(
      {
        directoryVisibility: 'public',
        authMode: 'public',
        revokedAt: { $exists: false },
        moderationStatus: { $nin: ['suspended', 'removed'] },
      },
      {
        projection: {
          dataUrl: 0,
          encryptedDataUrl: 0,
        },
      },
    )
    .sort({ createdAt: -1, _id: -1 })
    .toArray();
  return docs.map(strip);
}

export async function selectFileTransferRowById(idOrShareId: string): Promise<SecureFileTransfer | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection<SecureFileTransfer & { _id: string }>(COL).findOne({
    $or: [{ _id: idOrShareId }, { shareId: idOrShareId }],
  });
  return doc ? strip(doc) : null;
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
