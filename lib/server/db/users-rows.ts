import type { StoredUser } from '@/lib/server/users';
import { getMongoDb } from '@/lib/server/database';

const COL = 'users';

function strip(doc: StoredUser & { _id?: unknown }): StoredUser {
  const { _id: _unused, ...rest } = doc as { _id?: unknown } & StoredUser;
  return rest as StoredUser;
}

export async function selectAllUserRows(): Promise<StoredUser[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const docs = await db.collection<StoredUser & { _id: string }>(COL)
    .find({}).sort({ createdAt: 1, _id: 1 }).toArray();
  return docs.map(strip);
}

export async function selectUserRowById(id: string): Promise<StoredUser | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection<StoredUser & { _id: string }>(COL).findOne({ _id: id });
  return doc ? strip(doc) : null;
}

export async function selectUserRowByEmail(email: string): Promise<StoredUser | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const lower = String(email).toLowerCase();
  const doc = await db.collection<StoredUser & { _id: string }>(COL).findOne({ email: lower });
  return doc ? strip(doc) : null;
}

export async function upsertUserRow(user: StoredUser): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const doc = { ...user, _id: user.id, email: String(user.email).toLowerCase() };
  await db.collection(COL).replaceOne({ _id: user.id as any }, doc, { upsert: true });
}

export async function deleteUserRow(id: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;
  const result = await db.collection(COL).deleteOne({ _id: id as any });
  return result.deletedCount > 0;
}

export async function reconcileUserRows(users: StoredUser[]): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection(COL);
  const incomingIds = users.map((u) => u.id);
  await col.deleteMany({ _id: { $nin: incomingIds as any } });
  if (users.length > 0) {
    await (col as any).bulkWrite(
      users.map((user) => ({
        replaceOne: {
          filter: { _id: user.id },
          replacement: { ...user, _id: user.id, email: String(user.email).toLowerCase() },
          upsert: true,
        },
      })),
    );
  }
}
