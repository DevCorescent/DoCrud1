import type { DocumentHistory } from '@/types/document';
import { getMongoDb } from '@/lib/server/database';

const COL = 'history_entries';

function strip(doc: DocumentHistory & { _id?: unknown }): DocumentHistory {
  const { _id: _unused, ...rest } = doc as { _id?: unknown } & DocumentHistory;
  return rest as DocumentHistory;
}

export async function selectAllHistoryRows(): Promise<DocumentHistory[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db.collection<DocumentHistory & { _id: string }>(COL)
    .find({}).sort({ generatedAt: -1, _id: -1 }).toArray();
  return docs.map(strip);
}

export async function selectHistoryRowById(idOrShareId: string): Promise<DocumentHistory | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection<DocumentHistory & { _id: string }>(COL).findOne({
    $or: [{ _id: idOrShareId }, { shareId: idOrShareId }],
  });
  return doc ? strip(doc) : null;
}

export async function upsertHistoryRow(entry: DocumentHistory): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  await db.collection(COL).replaceOne({ _id: entry.id as any }, { ...entry, _id: entry.id }, { upsert: true });
}

export async function deleteHistoryRow(id: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;
  const result = await db.collection(COL).deleteOne({ _id: id as any });
  return result.deletedCount > 0;
}

export interface HistoryFilterOpts {
  role: string;
  email: string;
  orgId: string | null;
}

export async function selectHistoryRowsForUser(opts: HistoryFilterOpts): Promise<DocumentHistory[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const { role, email, orgId } = opts;
  const col = db.collection<DocumentHistory & { _id: string }>(COL);
  const sort = { generatedAt: -1 as const, _id: -1 as const };
  const lowerEmail = email.toLowerCase();
  const iRe = (s: string) => new RegExp(`^${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

  if (role === 'admin') {
    return (await col.find({}).sort(sort).toArray()).map(strip);
  }
  if (role === 'employee') {
    return (await col.find({
      $or: [
        { generatedBy: { $regex: iRe(lowerEmail) } },
        { employeeEmail: { $regex: iRe(lowerEmail) } },
      ],
    }).sort(sort).toArray()).map(strip);
  }
  if (role === 'client') {
    return (await col.find({
      $or: [
        { organizationId: orgId || '' },
        { generatedBy: { $regex: iRe(lowerEmail) } },
        { clientEmail: { $regex: iRe(lowerEmail) } },
      ],
    }).sort(sort).toArray()).map(strip);
  }
  return (await col.find({ generatedBy: email }).sort(sort).toArray()).map(strip);
}

export async function reconcileHistoryRows(entries: DocumentHistory[]): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection(COL);
  const incomingIds = entries.map((e) => e.id);
  await col.deleteMany({ _id: { $nin: incomingIds as any } });
  if (entries.length > 0) {
    await (col as any).bulkWrite(
      entries.map((e) => ({
        replaceOne: {
          filter: { _id: e.id },
          replacement: { ...e, _id: e.id },
          upsert: true,
        },
      })),
    );
  }
}

export async function bulkReplaceHistoryRows(entries: DocumentHistory[]): Promise<void> {
  return reconcileHistoryRows(entries);
}
