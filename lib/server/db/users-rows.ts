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

/**
 * Existence check for one user id — the cheapest possible lookup.
 *
 * `_id` equality on the default index (IDHACK), projected down to `_id` alone,
 * so nothing but the key crosses the wire. For callers that need to know a user
 * exists without reading the document (e.g. the profile QR endpoint).
 *
 * Returns null when Mongo is not configured, so the caller can fall back.
 */
export async function selectUserIdExists(id: string): Promise<boolean | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection(COL).findOne({ _id: id as never }, { projection: { _id: 1 } });
  return Boolean(doc);
}

/**
 * Presence-only projection for a batch of user ids.
 *
 * One indexed `$in` query returning just `lastSeenAt` — deliberately not
 * `selectAllUserRows()`, which would pull the whole users collection (and every
 * heartbeat write invalidates the users cache, so that read would rarely hit).
 *
 * Returns null when Mongo is not configured so the caller can fall back to the
 * JSON storage path.
 */
export interface PresenceRow {
  lastSeenAt: string | null;
  presenceEndedAt: string | null;
}

export async function selectUserPresenceRows(
  ids: string[],
): Promise<Map<string, PresenceRow> | null> {
  const db = await getMongoDb();
  if (!db) return null;

  const docs = await db.collection<StoredUser & { _id: string }>(COL)
    .find(
      { _id: { $in: ids as never } },
      { projection: { _id: 1, lastSeenAt: 1, presenceEndedAt: 1 } },
    )
    .toArray();

  return new Map(docs.map((doc) => [
    String(doc._id),
    { lastSeenAt: doc.lastSeenAt ?? null, presenceEndedAt: doc.presenceEndedAt ?? null },
  ]));
}

/** Stamp presence without rewriting the rest of the user document. */
export async function updateUserLastSeenRow(id: string, lastSeenAt: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;
  const result = await db.collection(COL)
    .updateOne({ _id: id as never }, { $set: { lastSeenAt } });
  return result.matchedCount > 0;
}

/** Mark presence as explicitly ended (logout). Leaves `lastSeenAt` intact. */
export async function updateUserPresenceEndedRow(id: string, presenceEndedAt: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;
  const result = await db.collection(COL)
    .updateOne({ _id: id as never }, { $set: { presenceEndedAt } });
  return result.matchedCount > 0;
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
