import type { ServiceReview } from '@/lib/server/services';
import { getMongoDb } from '@/lib/server/database';

const COL = 'service_reviews';

function strip(doc: ServiceReview & { _id?: unknown }): ServiceReview {
  const { _id: _unused, ...rest } = doc as { _id?: unknown } & ServiceReview;
  return rest as ServiceReview;
}

export async function selectAllServiceReviewRows(): Promise<ServiceReview[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db.collection<ServiceReview & { _id: string }>(COL)
    .find({}).sort({ createdAt: -1, _id: -1 }).toArray();
  return docs.map(strip);
}

export async function selectServiceReviewsForService(serviceId: string): Promise<ServiceReview[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db.collection<ServiceReview & { _id: string }>(COL)
    .find({ serviceId }).sort({ createdAt: -1, _id: -1 }).toArray();
  return docs.map(strip);
}

export async function existsServiceReviewForBooking(bookingId: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;
  const count = await db.collection(COL).countDocuments({ bookingId });
  return count > 0;
}

export async function upsertServiceReviewRow(r: ServiceReview): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  await db.collection(COL).replaceOne({ _id: r.id as any }, { ...r, _id: r.id }, { upsert: true });
}

export async function selectServiceReviewAggregateForService(
  serviceId: string,
): Promise<{ count: number; average: number }> {
  const db = await getMongoDb();
  if (!db) return { count: 0, average: 0 };
  const result = await db.collection(COL).aggregate([
    { $match: { serviceId } },
    { $group: { _id: null, count: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
  ]).toArray();
  const row = result[0] as { count: number; avgRating: number } | undefined;
  if (!row) return { count: 0, average: 0 };
  return { count: row.count, average: Math.round((row.avgRating ?? 0) * 10) / 10 };
}

export async function bulkReplaceServiceReviewRows(rows: ServiceReview[]): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection(COL);
  const incomingIds = rows.map((r) => r.id);
  await col.deleteMany({ _id: { $nin: incomingIds as any } });
  if (rows.length > 0) {
    await (col as any).bulkWrite(
      rows.map((r) => ({
        replaceOne: {
          filter: { _id: r.id },
          replacement: { ...r, _id: r.id },
          upsert: true,
        },
      })),
    );
  }
}
