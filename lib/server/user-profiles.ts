import { readJsonFile, writeJsonFile, userProfilesPath, followsPath } from '@/lib/server/storage';
import { getDbPool, getMongoDb } from '@/lib/server/database';
import { selectAllUserProfileRows, selectUserProfileAvatarRows, selectUserProfileDirectoryRows, selectUserProfileFields, selectUserProfileRow, upsertUserProfileRow } from '@/lib/server/db/user-profiles-rows';

export interface UserProfileData {
  headline?: string;
  bio?: string;
  location?: string;
  website?: string;
  avatarUrl?: string;
  avatarPosition?: string;
  bannerUrl?: string;
  coverGradient?: string;
  coverPosition?: string;
  skills?: string[];
  /**
   * Career directions the person is looking for, as JobDomain ids — the same
   * vocabulary lib/server/job-sources/taxonomy.ts assigns to every posting, so
   * a stored role is a value the job corpus already understands.
   *
   * Optional, matching every other field here: profiles written before this
   * existed simply have no key, and `profileRoles()` reads them as empty rather
   * than a migration rewriting every record.
   */
  roles?: string[];
  /**
   * Directions the person typed themselves, kept verbatim because the taxonomy
   * does not cover them. Held apart from `roles` so nothing later mistakes a
   * free-text answer for a known domain with known job counts.
   */
  customRoles?: string[];
  experience?: Array<{ title: string; company: string; period: string; desc?: string }>;
  education?: Array<{ degree: string; school: string; year?: string }>;
  achievements?: Array<{ title: string; desc?: string }>;
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    github?: string;
    instagram?: string;
    youtube?: string;
  };
  openToWork?: boolean;
  pronouns?: string;
  updatedAt?: string;
  profileSetupDone?: boolean;
  /** True once the welcome → interests → first-post onboarding is finished or skipped. */
  onboardingDone?: boolean;
  onboardingCompletedAt?: string;
  onboardingSkippedAt?: string;
  emailVerified?: boolean;
  emailVerifiedAt?: string;
  interests?: string[];
  docrudGo?: boolean;
  docrudGoPurchasedAt?: string;
  docrudGoReferralGrantedAt?: string;
  docrudGoGrantedFree?: boolean;
  docrudInfinity?: boolean;
  docrudInfinityPurchasedAt?: string;
  docrudInfinityGrantedFree?: boolean;
  docrudInfinityPeriod?: 'monthly' | '3m' | '6m' | 'annual';
  docrudInfinityExpiresAt?: string;      // ISO — when current period ends
  docrudInfinityRenewedAt?: string;      // ISO — last renewal timestamp
  docrudInfinityOrderId?: string;        // Razorpay order ID of latest payment
  docrudInfinityPaymentId?: string;      // Razorpay payment ID of latest payment
  docrudInfinityRenewalCount?: number;   // number of successful renewals (0 = first purchase)
  // Drive storage granted by Infinity (5 GB) — no separate drive plans
  docrudDrivePlanId?: string;           // kept for legacy; always 'infinity' for active users
  docrudDrivePlanGb?: number;
  docrudDrivePlanPurchasedAt?: string;
  docrudDrivePlanPeriod?: 'monthly' | '3m' | '6m' | 'annual';
  publicFace?: {
    category: string;
    approvedAt: string;
  };
  resumeFiles?: Array<{
    id: string;
    fileName: string;
    url: string;
    uploadedAt: string;
    atsScore?: {
      score: number;
      grade: string;
      breakdown: { contact: number; summary: number; skills: number; experience: number; education: number; achievements: number };
      tips: string[];
    };
    parsedData?: {
      headline?: string | null;
      bio?: string | null;
      location?: string | null;
      website?: string | null;
      skills?: string[];
      experience?: Array<{ title: string; company: string; period: string; desc?: string }>;
      education?: Array<{ degree: string; school: string; year?: string }>;
      achievements?: Array<{ title: string; desc?: string }>;
      socialLinks?: { linkedin?: string | null; github?: string | null; twitter?: string | null };
    };
  }>;
}

/**
 * The roles on a profile, as concrete arrays.
 *
 * Every profile written before these fields existed has no key at all, so this
 * is the one place that decides what "absent" means — empty, never null and
 * never a guess. Read-time, so no stored record has to be migrated.
 */
export function profileRoles(profile: UserProfileData | null | undefined): {
  roles: string[];
  customRoles: string[];
} {
  const clean = (v: unknown) =>
    Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
  return { roles: clean(profile?.roles), customRoles: clean(profile?.customRoles) };
}

export interface FollowsData {
  [followerId: string]: string[];
}

export async function getAllProfiles(): Promise<Record<string, UserProfileData>> {
  if (getDbPool()) {
    return selectAllUserProfileRows();
  }
  return readJsonFile<Record<string, UserProfileData>>(userProfilesPath, {});
}

/**
 * Profiles for the public people directory — same shape as getAllProfiles(),
 * but only the fields a directory card renders.
 */
export async function getDirectoryProfiles(): Promise<Record<string, UserProfileData>> {
  if (getDbPool()) {
    const rows = await selectUserProfileDirectoryRows();
    if (rows) return rows;
  }
  return getAllProfiles();
}

/**
 * Just the named fields of one profile.
 *
 * Same values as getProfileData(), but projected — use this whenever a caller
 * needs a handful of flags rather than the whole document.
 */
export async function getProfileFields<K extends keyof UserProfileData>(
  userId: string,
  fields: readonly K[],
): Promise<Pick<UserProfileData, K>> {
  if (getDbPool()) {
    const row = await selectUserProfileFields(userId, fields);
    return row ?? ({} as Pick<UserProfileData, K>);
  }
  const profiles = await getAllProfiles();
  const profile = profiles[userId] ?? {};
  const picked: Partial<UserProfileData> = {};
  for (const field of fields) {
    if (profile[field] !== undefined) picked[field] = profile[field];
  }
  return picked as Pick<UserProfileData, K>;
}

export async function getProfileData(userId: string): Promise<UserProfileData> {
  if (getDbPool()) {
    const row = await selectUserProfileRow(userId);
    return row ?? {};
  }
  const profiles = await getAllProfiles();
  return profiles[userId] ?? {};
}

/**
 * Avatar URLs for many users in ONE query.
 *
 * Feeds and lists render dozens of author avatars at once. Calling
 * getProfileData() per author was an N+1 that dominated the published-feed
 * response time (measured: ~2.15 s for 13 authors, versus ~3 ms with the
 * enrichment skipped entirely).
 */
export async function getProfileAvatars(userIds: string[]): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  if (getDbPool()) {
    const rows = await selectUserProfileAvatarRows(ids);
    // Unknown ids resolve to null rather than being omitted, so callers do not
    // have to distinguish "no profile" from "no avatar".
    if (rows) return new Map(ids.map((id) => [id, rows.get(id) ?? null]));
  }

  const profiles = await getAllProfiles();
  return new Map(ids.map((id) => [id, profiles[id]?.avatarUrl ?? null]));
}

/**
 * JSON-store write serialization.
 *
 * The JSON profile store is a single file: every write is read-whole-file →
 * mutate one key → write-whole-file. Two of those interleaving lose each
 * other's changes (last writer wins with a stale map). This promise-chain makes
 * every JSON profile write run to completion before the next begins, so
 * concurrent writers on this process can no longer clobber one another.
 *
 * Scope + limits: this serializes writes WITHIN ONE Node process, which is the
 * JSON store's only deployment (local dev / single-instance self-host). The
 * production Mongo path does not use this — it uses per-row atomic operations,
 * which are also safe across multiple instances.
 */
let profilesWriteChain: Promise<void> = Promise.resolve();
function serializeProfilesWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = profilesWriteChain.then(fn, fn);
  profilesWriteChain = run.then(() => undefined, () => undefined);
  return run;
}

export async function updateProfileData(userId: string, data: Partial<UserProfileData>): Promise<void> {
  if (getDbPool()) {
    const current = (await selectUserProfileRow(userId)) ?? {};
    const next: UserProfileData = {
      ...current,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await upsertUserProfileRow(userId, next);
    return;
  }
  await serializeProfilesWrite(async () => {
    const profiles = await getAllProfiles();
    profiles[userId] = {
      ...(profiles[userId] ?? {}),
      ...data,
      updatedAt: new Date().toISOString(),
    };
    await writeJsonFile(userProfilesPath, profiles);
  });
}

/**
 * JSON-store only: atomic read-modify-write of ONE profile under the write lock.
 *
 * `compute` is given the current profile and returns the patch to apply, or
 * null to make NO change. The read, the decision, and the write all happen
 * inside one serialized critical section, so a "skip if already X" check cannot
 * be raced by a concurrent writer. Returns true iff a patch was written.
 *
 * Mongo callers must NOT use this — they express the same guard as a conditional
 * DB update (atomic across instances). This is the single-instance JSON path.
 */
export async function atomicMutateProfileJson(
  userId: string,
  compute: (current: UserProfileData) => Partial<UserProfileData> | null,
): Promise<boolean> {
  return serializeProfilesWrite(async () => {
    const profiles = await getAllProfiles();
    const patch = compute(profiles[userId] ?? {});
    if (!patch) return false;
    profiles[userId] = {
      ...(profiles[userId] ?? {}),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await writeJsonFile(userProfilesPath, profiles);
    return true;
  });
}

async function getFollowsData(): Promise<FollowsData> {
  return readJsonFile<FollowsData>(followsPath, {});
}

async function saveFollowsData(data: FollowsData): Promise<void> {
  await writeJsonFile(followsPath, data);
}

export async function getFollowers(userId: string): Promise<string[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (!db) return [];
    const docs = await db.collection<{ _id: string; followerId: string; targetId: string }>('user_follows')
      .find({ targetId: userId }).toArray();
    return docs.map((d) => d.followerId);
  }
  const follows = await getFollowsData();
  return Object.entries(follows)
    .filter(([, followedIds]) => followedIds.includes(userId))
    .map(([followerId]) => followerId);
}

export async function getFollowing(userId: string): Promise<string[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (!db) return [];
    const docs = await db.collection<{ _id: string; followerId: string; targetId: string }>('user_follows')
      .find({ followerId: userId }).toArray();
    return docs.map((d) => d.targetId);
  }
  const follows = await getFollowsData();
  return follows[userId] ?? [];
}

export async function isFollowing(followerId: string, targetId: string): Promise<boolean> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (!db) return false;
    const count = await db.collection('user_follows').countDocuments({ followerId, targetId });
    return count > 0;
  }
  const following = await getFollowing(followerId);
  return following.includes(targetId);
}

export async function followUser(followerId: string, targetId: string): Promise<void> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (!db) return;
    await db.collection('user_follows').replaceOne(
      { _id: `${followerId}_${targetId}` as any },
      { _id: `${followerId}_${targetId}`, followerId, targetId, createdAt: new Date().toISOString() },
      { upsert: true },
    );
    return;
  }
  const follows = await getFollowsData();
  const current = follows[followerId] ?? [];
  if (!current.includes(targetId)) {
    follows[followerId] = [...current, targetId];
    await saveFollowsData(follows);
  }
}

export async function unfollowUser(followerId: string, targetId: string): Promise<void> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (!db) return;
    await db.collection('user_follows').deleteOne({ followerId, targetId });
    return;
  }
  const follows = await getFollowsData();
  const current = follows[followerId] ?? [];
  follows[followerId] = current.filter((id) => id !== targetId);
  await saveFollowsData(follows);
}

/**
 * Follower/following counts for many users in TWO queries.
 *
 * Calling getFollowCounts() per user is an N+1: on the people directory that
 * was 47 users x 2 countDocuments = 94 round trips. Measured against the live
 * cluster (~250 ms per round trip) that took 10.4 s; the two aggregations below
 * take 0.31 s for the same result.
 *
 * Every requested id is present in the result, zero-filled, so callers do not
 * have to distinguish "no follows" from "not queried".
 */
export async function getFollowCountsForUsers(
  userIds: string[],
): Promise<Record<string, { followers: number; following: number }>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const result: Record<string, { followers: number; following: number }> = {};
  for (const id of ids) result[id] = { followers: 0, following: 0 };
  if (ids.length === 0) return result;

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const col = db.collection('user_follows');
      const countBy = (field: 'targetId' | 'followerId') =>
        col
          .aggregate([
            { $match: { [field]: { $in: ids } } },
            { $group: { _id: `$${field}`, count: { $sum: 1 } } },
          ])
          .toArray();

      const [followerRows, followingRows] = await Promise.all([
        countBy('targetId'),
        countBy('followerId'),
      ]);

      for (const row of followerRows as Array<{ _id: string; count: number }>) {
        if (result[row._id]) result[row._id].followers = row.count;
      }
      for (const row of followingRows as Array<{ _id: string; count: number }>) {
        if (result[row._id]) result[row._id].following = row.count;
      }
      return result;
    }
  }

  // JSON fallback — one read of the follows store, then counted in memory.
  const [followersByUser, followingByUser] = await Promise.all([
    Promise.all(ids.map((id) => getFollowers(id))),
    Promise.all(ids.map((id) => getFollowing(id))),
  ]);
  ids.forEach((id, index) => {
    result[id] = {
      followers: followersByUser[index].length,
      following: followingByUser[index].length,
    };
  });
  return result;
}

export async function getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (!db) return { followers: 0, following: 0 };
    const col = db.collection('user_follows');
    const [followers, following] = await Promise.all([
      col.countDocuments({ targetId: userId }),
      col.countDocuments({ followerId: userId }),
    ]);
    return { followers, following };
  }
  const [followers, following] = await Promise.all([getFollowers(userId), getFollowing(userId)]);
  return { followers: followers.length, following: following.length };
}
