import type { BillingTransaction } from '@/types/document';
import { getMongoDb } from '@/lib/server/database';

const COL = 'billing_transactions';

function strip(doc: BillingTransaction & { _id?: unknown }): BillingTransaction {
  const { _id: _unused, ...rest } = doc as { _id?: unknown } & BillingTransaction;
  return rest as BillingTransaction;
}

export async function selectAllBillingRows(): Promise<BillingTransaction[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db.collection<BillingTransaction & { _id: string }>(COL)
    .find({}).sort({ createdAt: -1, _id: -1 }).toArray();
  return docs.map(strip);
}

export async function selectBillingRowById(id: string): Promise<BillingTransaction | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection<BillingTransaction & { _id: string }>(COL).findOne({ _id: id });
  return doc ? strip(doc) : null;
}

export async function selectBillingRowByProviderOrderId(providerOrderId: string): Promise<BillingTransaction | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection<BillingTransaction & { _id: string }>(COL)
    .findOne({ providerOrderId });
  return doc ? strip(doc) : null;
}

export async function selectBillingRowsForUser(userId: string): Promise<BillingTransaction[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db.collection<BillingTransaction & { _id: string }>(COL)
    .find({ userId }).sort({ createdAt: -1, _id: -1 }).toArray();
  return docs.map(strip);
}

export async function upsertBillingRow(t: BillingTransaction): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  await db.collection(COL).replaceOne({ _id: t.id as any }, { ...t, _id: t.id }, { upsert: true });
}

export async function updateBillingRowByProviderOrderId(
  providerOrderId: string,
  patch: Partial<BillingTransaction>,
): Promise<BillingTransaction | null> {
  const existing = await selectBillingRowByProviderOrderId(providerOrderId);
  if (!existing) return null;
  const merged: BillingTransaction = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await upsertBillingRow(merged);
  return merged;
}

export async function deleteBillingRow(id: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;
  const result = await db.collection(COL).deleteOne({ _id: id as any });
  return result.deletedCount > 0;
}

export async function bulkReplaceBillingRows(rows: BillingTransaction[]): Promise<void> {
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
