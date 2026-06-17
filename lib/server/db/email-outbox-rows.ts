import type { OutboundEmailEvent } from '@/lib/server/email-outbox';
import { getMongoDb } from '@/lib/server/database';

const COL = 'email_outbox';

function strip(doc: OutboundEmailEvent & { _id?: unknown }): OutboundEmailEvent {
  const { _id: _unused, ...rest } = doc as { _id?: unknown } & OutboundEmailEvent;
  return rest as OutboundEmailEvent;
}

export async function selectEmailOutboxRows(limit = 200): Promise<OutboundEmailEvent[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const safeLimit = Math.max(1, Math.min(500, limit));
  const docs = await db.collection<OutboundEmailEvent & { _id: string }>(COL)
    .find({}).sort({ createdAt: -1, _id: -1 }).limit(safeLimit).toArray();
  return docs.map(strip);
}

export async function selectEmailOutboxRowById(id: string): Promise<OutboundEmailEvent | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection<OutboundEmailEvent & { _id: string }>(COL).findOne({ _id: id });
  return doc ? strip(doc) : null;
}

export async function upsertEmailOutboxRow(ev: OutboundEmailEvent): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  await db.collection(COL).replaceOne({ _id: ev.id as any }, { ...ev, _id: ev.id }, { upsert: true });
}

export async function trimEmailOutboxRows(maxRows: number): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection<{ _id: string }>(COL);
  const count = await col.countDocuments();
  if (count <= maxRows) return;
  const overflow = await col.find({})
    .sort({ createdAt: -1, _id: -1 })
    .skip(maxRows)
    .project({ _id: 1 })
    .toArray();
  if (overflow.length > 0) {
    await col.deleteMany({ _id: { $in: overflow.map((d) => d._id) } });
  }
}

export async function bulkReplaceEmailOutboxRows(events: OutboundEmailEvent[]): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection(COL);
  const incomingIds = events.map((e) => e.id);
  await col.deleteMany({ _id: { $nin: incomingIds as any } });
  if (events.length > 0) {
    await (col as any).bulkWrite(
      events.map((ev) => ({
        replaceOne: {
          filter: { _id: ev.id },
          replacement: { ...ev, _id: ev.id },
          upsert: true,
        },
      })),
    );
  }
}
