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

/**
 * Directory-card fields for every profile, in one projected query.
 *
 * selectAllUserProfileRows() returns whole profile documents — resume text,
 * portfolio entries, base64 avatars — and measured 4.8 s against the live
 * cluster. The people directory renders a fixed, small set of fields, so it
 * asks for exactly those.
 */
const DIRECTORY_FIELDS = [
  'docrudGo',
  'publicFace',
  'headline',
  'bio',
  'location',
  'avatarUrl',
  'bannerUrl',
  'coverGradient',
  'coverPosition',
  'skills',
  'openToWork',
  'pronouns',
] as const;

export async function selectUserProfileDirectoryRows(): Promise<Record<string, UserProfileData> | null> {
  const db = await getMongoDb();
  if (!db) return null;

  const projection: Record<string, unknown> = { _id: 1 };
  for (const field of DIRECTORY_FIELDS) projection[field] = 1;

  // `coverGradient` is legacy: normally a ~50 character CSS gradient, but older
  // profile edits stored the cover photo in it as a base64 data URL (current
  // uploads go to bannerUrl instead, and the profile editor clears these on
  // save). One such value is 217 KB — 80% of this query's entire payload.
  //
  // Directory cards apply it as `style={{ background: coverGradient }}`, and a
  // bare data URL is not valid CSS there, so it renders nothing while also
  // suppressing the fallback gradient. Dropping it server-side keeps the blob
  // off the wire AND lets those cards fall back to a real gradient.
  //
  // Scoped to the directory only — /u/[userId] renders the same legacy value as
  // an <img>, where it does work, and is untouched.
  projection.coverGradient = {
    $cond: [
      { $eq: [{ $indexOfCP: [{ $ifNull: ['$coverGradient', ''] }, 'data:'] }, 0] },
      '$$REMOVE',
      '$coverGradient',
    ],
  };

  const docs = await db.collection(COL).aggregate([{ $project: projection }]).toArray();

  const map: Record<string, UserProfileData> = {};
  for (const { _id, ...profile } of docs as Array<{ _id: string } & UserProfileData>) {
    map[String(_id)] = profile as UserProfileData;
  }
  return map;
}

/**
 * A named subset of one profile document.
 *
 * Profile documents carry base64 avatars, resume files and portfolio entries.
 * Callers that need two or three flags should not pay for all of that — most
 * importantly the NextAuth jwt callback, which runs on every authenticated
 * request and reads a single boolean.
 */
export async function selectUserProfileFields<K extends keyof UserProfileData>(
  userId: string,
  fields: readonly K[],
): Promise<Pick<UserProfileData, K> | null> {
  const db = await getMongoDb();
  if (!db) return null;

  const projection: Record<string, 1> = {};
  for (const field of fields) projection[field as string] = 1;

  const doc = await db
    .collection<UserProfileData & { _id: string }>(COL)
    .findOne({ _id: userId }, { projection });
  if (!doc) return null;

  const { _id: _unused, ...profile } = doc;
  return profile as Pick<UserProfileData, K>;
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
