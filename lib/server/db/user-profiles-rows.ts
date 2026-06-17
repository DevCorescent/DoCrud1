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
