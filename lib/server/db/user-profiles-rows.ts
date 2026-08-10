import type { UserProfileData } from '@/lib/server/user-profiles';
import { getMongoDb } from '@/lib/server/database';

const COL = 'user_profiles';

export async function selectAllUserProfileRows(): Promise<Record<string, UserProfileData>> {
  const db = await getMongoDb();
  if (!db) return {};
  const docs = await db.collection<UserProfileData & { _id: string }>(COL).find({}).toArray();
  const map: Record<string, UserProfileData> = {};
  for (const { _id, ...profile } of docs) {
    map[_id] = profile as UserProfileData;
  }
  return map;
}

export async function selectUserProfileRow(userId: string): Promise<UserProfileData | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection<UserProfileData & { _id: string }>(COL).findOne({ _id: userId });
  if (!doc) return null;
  const { _id: _unused, ...profile } = doc;
  return profile as UserProfileData;
}

/**
 * Avatars for a batch of users — one indexed `$in` projecting a single field.
 *
 * The feed used to call selectUserProfileRow() per author: N round trips to the
 * database, each pulling the WHOLE profile document (which can carry a base64
 * avatar, resume text and portfolio blobs) just to read `avatarUrl`.
 *
 * Returns null when Mongo is not configured so the caller can fall back to the
 * JSON store, which is already a single read.
 */
export async function selectUserProfileAvatarRows(
  userIds: string[],
): Promise<Map<string, string | null> | null> {
  const db = await getMongoDb();
  if (!db) return null;
  if (userIds.length === 0) return new Map();

  const docs = await db.collection<UserProfileData & { _id: string }>(COL)
    .find({ _id: { $in: userIds as never } }, { projection: { _id: 1, avatarUrl: 1 } })
    .toArray();

  return new Map(docs.map((doc) => [String(doc._id), doc.avatarUrl ?? null]));
}

export async function upsertUserProfileRow(userId: string, profile: UserProfileData): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  await db.collection(COL).replaceOne(
    { _id: userId as any },
    { _id: userId, ...profile },
    { upsert: true },
  );
}

export async function deleteUserProfileRow(userId: string): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;
  const result = await db.collection(COL).deleteOne({ _id: userId as any });
  return result.deletedCount > 0;
}

export async function bulkReplaceUserProfileRows(profiles: Record<string, UserProfileData>): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection(COL);
  const entries = Object.entries(profiles);
  const incomingIds = entries.map(([userId]) => userId);
  await col.deleteMany({ _id: { $nin: incomingIds as any } });
  if (entries.length > 0) {
    await (col as any).bulkWrite(
      entries.map(([userId, profile]) => ({
        replaceOne: {
          filter: { _id: userId },
          replacement: { _id: userId, ...profile },
          upsert: true,
        },
      })),
    );
  }
}
