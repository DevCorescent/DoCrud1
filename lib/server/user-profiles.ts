import { readJsonFile, writeJsonFile, userProfilesPath, followsPath } from '@/lib/server/storage';
import { getDbPool } from '@/lib/server/database';
import { selectAllUserProfileRows, selectUserProfileRow, upsertUserProfileRow } from '@/lib/server/db/user-profiles-rows';

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
  onboardingDone?: boolean;
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
  docrudInfinityPeriod?: 'monthly' | 'annual';
  docrudInfinityExpiresAt?: string;      // ISO — when current period ends
  docrudInfinityRenewedAt?: string;      // ISO — last renewal timestamp
  docrudInfinityOrderId?: string;        // Razorpay order ID of latest payment
  docrudInfinityPaymentId?: string;      // Razorpay payment ID of latest payment
  docrudInfinityRenewalCount?: number;   // number of successful renewals (0 = first purchase)
  // Drive storage granted by Infinity (5 GB) — no separate drive plans
  docrudDrivePlanId?: string;           // kept for legacy; always 'infinity' for active users
  docrudDrivePlanGb?: number;
  docrudDrivePlanPurchasedAt?: string;
  docrudDrivePlanPeriod?: 'monthly' | 'annual';
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

export interface FollowsData {
  [followerId: string]: string[];
}

export async function getAllProfiles(): Promise<Record<string, UserProfileData>> {
  if (getDbPool()) {
    return selectAllUserProfileRows();
  }
  return readJsonFile<Record<string, UserProfileData>>(userProfilesPath, {});
}

export async function getProfileData(userId: string): Promise<UserProfileData> {
  if (getDbPool()) {
    const row = await selectUserProfileRow(userId);
    return row ?? {};
  }
  const profiles = await getAllProfiles();
  return profiles[userId] ?? {};
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
  const profiles = await getAllProfiles();
  profiles[userId] = {
    ...(profiles[userId] ?? {}),
    ...data,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(userProfilesPath, profiles);
}

async function getFollowsData(): Promise<FollowsData> {
  return readJsonFile<FollowsData>(followsPath, {});
}

async function saveFollowsData(data: FollowsData): Promise<void> {
  await writeJsonFile(followsPath, data);
}

export async function getFollowers(userId: string): Promise<string[]> {
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<{ follower_id: string }>(`SELECT follower_id FROM user_follows WHERE target_id = $1`, [userId]);
    return result.rows.map((r) => r.follower_id);
  }
  const follows = await getFollowsData();
  return Object.entries(follows)
    .filter(([, followedIds]) => followedIds.includes(userId))
    .map(([followerId]) => followerId);
}

export async function getFollowing(userId: string): Promise<string[]> {
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<{ target_id: string }>(`SELECT target_id FROM user_follows WHERE follower_id = $1`, [userId]);
    return result.rows.map((r) => r.target_id);
  }
  const follows = await getFollowsData();
  return follows[userId] ?? [];
}

export async function isFollowing(followerId: string, targetId: string): Promise<boolean> {
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM user_follows WHERE follower_id = $1 AND target_id = $2) AS exists`,
      [followerId, targetId]
    );
    return result.rows[0]?.exists ?? false;
  }
  const following = await getFollowing(followerId);
  return following.includes(targetId);
}

export async function followUser(followerId: string, targetId: string): Promise<void> {
  const pool = getDbPool();
  if (pool) {
    await pool.query(
      `INSERT INTO user_follows (follower_id, target_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [followerId, targetId]
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
  const pool = getDbPool();
  if (pool) {
    await pool.query(`DELETE FROM user_follows WHERE follower_id = $1 AND target_id = $2`, [followerId, targetId]);
    return;
  }
  const follows = await getFollowsData();
  const current = follows[followerId] ?? [];
  follows[followerId] = current.filter((id) => id !== targetId);
  await saveFollowsData(follows);
}

export async function getFollowCounts(userId: string): Promise<{ followers: number; following: number }> {
  const pool = getDbPool();
  if (pool) {
    const [fersResult, fingResult] = await Promise.all([
      pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM user_follows WHERE target_id = $1`, [userId]),
      pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM user_follows WHERE follower_id = $1`, [userId]),
    ]);
    return {
      followers: parseInt(fersResult.rows[0]?.count ?? '0', 10),
      following: parseInt(fingResult.rows[0]?.count ?? '0', 10),
    };
  }
  const [followers, following] = await Promise.all([getFollowers(userId), getFollowing(userId)]);
  return { followers: followers.length, following: following.length };
}
