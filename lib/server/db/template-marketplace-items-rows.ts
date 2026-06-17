import type { TemplateMarketplaceItem } from '@/types/document';
import { getMongoDb } from '@/lib/server/database';

const COL = 'template_marketplace_items';

function strip(doc: TemplateMarketplaceItem & { _id?: unknown }): TemplateMarketplaceItem {
  const { _id: _unused, ...rest } = doc as { _id?: unknown } & TemplateMarketplaceItem;
  return rest as TemplateMarketplaceItem;
}

export async function selectAllTemplateMarketplaceItemRows(): Promise<TemplateMarketplaceItem[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db.collection<TemplateMarketplaceItem & { _id: string }>(COL)
    .find({}).sort({ createdAt: -1, _id: -1 }).toArray();
  return docs.map(strip);
}

export async function selectTemplateMarketplaceItemRowById(id: string): Promise<TemplateMarketplaceItem | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection<TemplateMarketplaceItem & { _id: string }>(COL).findOne({ _id: id });
  return doc ? strip(doc) : null;
}

export async function selectTemplateMarketplaceItemRowsBySeller(sellerUserId: string): Promise<TemplateMarketplaceItem[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db.collection<TemplateMarketplaceItem & { _id: string }>(COL)
    .find({ sellerUserId }).sort({ createdAt: -1, _id: -1 }).toArray();
  return docs.map(strip);
}

export async function upsertTemplateMarketplaceItemRow(it: TemplateMarketplaceItem): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  await db.collection(COL).replaceOne({ _id: it.id as any }, { ...it, _id: it.id }, { upsert: true });
}

export async function deleteTemplateMarketplaceItemRow(id: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;
  const result = await db.collection(COL).deleteOne({ _id: id as any });
  return result.deletedCount > 0;
}

export async function incrementTemplateMarketplaceItemOpens(id: string): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  await db.collection(COL).updateOne(
    { _id: id as any },
    { $inc: { openCount: 1 }, $set: { updatedAt: new Date().toISOString() } },
  );
}

export async function bulkReplaceTemplateMarketplaceItemRows(rows: TemplateMarketplaceItem[]): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection(COL);
  const incomingIds = rows.map((r) => r.id);
  await col.deleteMany({ _id: { $nin: incomingIds as any } });
  if (rows.length > 0) {
    await (col as any).bulkWrite(
      rows.map((it) => ({
        replaceOne: {
          filter: { _id: it.id },
          replacement: { ...it, _id: it.id },
          upsert: true,
        },
      })),
    );
  }
}
