import type { DocWordDocument } from '@/types/document';
import { getMongoDb } from '@/lib/server/database';

const COL = 'docword_documents';

function strip(doc: DocWordDocument & { _id?: unknown }): DocWordDocument {
  const { _id: _unused, ...rest } = doc as { _id?: unknown } & DocWordDocument;
  return rest as DocWordDocument;
}

export async function selectAllDocWordRows(): Promise<DocWordDocument[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db.collection<DocWordDocument & { _id: string }>(COL)
    .find({}).sort({ updatedAt: -1, _id: -1 }).toArray();
  return docs.map(strip);
}

export async function selectDocWordRowById(id: string): Promise<DocWordDocument | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection<DocWordDocument & { _id: string }>(COL).findOne({ _id: id });
  return doc ? strip(doc) : null;
}

export async function selectDocWordRowByShareToken(token: string): Promise<DocWordDocument | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection<DocWordDocument & { _id: string }>(COL).findOne({ shareToken: token });
  return doc ? strip(doc) : null;
}

export async function upsertDocWordRow(d: DocWordDocument): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  await db.collection(COL).replaceOne({ _id: d.id as any }, { ...d, _id: d.id }, { upsert: true });
}

export async function deleteDocWordRow(id: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;
  const result = await db.collection(COL).deleteOne({ _id: id as any });
  return result.deletedCount > 0;
}

export async function bulkReplaceDocWordRows(rows: DocWordDocument[]): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection(COL);
  const incomingIds = rows.map((r) => r.id);
  await col.deleteMany({ _id: { $nin: incomingIds as any } });
  if (rows.length > 0) {
    await (col as any).bulkWrite(
      rows.map((d) => ({
        replaceOne: {
          filter: { _id: d.id },
          replacement: { ...d, _id: d.id },
          upsert: true,
        },
      })),
    );
  }
}
