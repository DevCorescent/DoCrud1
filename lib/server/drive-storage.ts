import { getProfileData, updateProfileData } from '@/lib/server/user-profiles';
import { getDbPool, getMongoDb } from '@/lib/server/database';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { FREE_DRIVE_GB, INFINITY_DRIVE_GB } from '@/lib/infinity-plan';

// Canonical values live in lib/infinity-plan.ts (client-safe) and are re-exported
// here so existing importers of this module keep working unchanged.
export { FREE_DRIVE_GB, INFINITY_DRIVE_GB };

export const DRIVE_PLAN_GB: Record<string, number> = {
  'drive-starter': 10,
  'drive-pro':     50,
};

export interface DriveQuota {
  limitBytes:  number;
  limitGb:     number;
  planId:      string;  // 'free' | 'infinity' | 'drive-starter' | 'drive-pro'
  source:      'free' | 'infinity' | 'drive_plan';
}

/** Returns the storage limit for a user based on their active plan. */
export async function getUserDriveQuota(userId: string): Promise<DriveQuota> {
  const profile = await getProfileData(userId);

  // Drive storage plan takes precedence over Infinity (they stack — use highest)
  const drivePlanGb = profile.docrudDrivePlanId ? (DRIVE_PLAN_GB[profile.docrudDrivePlanId] ?? 0) : 0;
  const infinityGb  = profile.docrudInfinity ? INFINITY_DRIVE_GB : 0;

  if (drivePlanGb > 0 || infinityGb > 0) {
    // Use whichever is larger; drive plan stacks on top of Infinity
    const totalGb = infinityGb + drivePlanGb;
    const planId = profile.docrudDrivePlanId ?? 'infinity';
    return {
      limitGb:    totalGb,
      limitBytes: totalGb * 1024 * 1024 * 1024,
      planId,
      source:     drivePlanGb > 0 ? 'drive_plan' : 'infinity',
    };
  }

  return {
    limitGb:    FREE_DRIVE_GB,
    limitBytes: FREE_DRIVE_GB * 1024 * 1024 * 1024,
    planId:     'free',
    source:     'free',
  };
}

/** Returns the total bytes used by a user's file transfers. */
export async function getUserDriveUsedBytes(userId: string): Promise<number> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const result = await db.collection('file_transfers').aggregate([
        { $match: { uploadedByUserId: userId, revokedAt: null } },
        { $group: { _id: null, total: { $sum: '$sizeInBytes' } } },
      ]).toArray();
      return (result[0] as { total?: number } | undefined)?.total ?? 0;
    }
  }

  // JSON fallback
  const all = await getFileTransfers();
  return all
    .filter((t) => t.uploadedByUserId === userId && !t.revokedAt)
    .reduce((sum, t) => sum + (t.sizeInBytes ?? 0), 0);
}

export interface QuotaCheckResult {
  allowed:    boolean;
  usedBytes:  number;
  limitBytes: number;
  limitGb:    number;
  planId:     string;
}

/** Returns whether a new upload of `newFileSizeBytes` is within the user's quota. */
export async function checkDriveQuota(userId: string, newFileSizeBytes: number): Promise<QuotaCheckResult> {
  const [quota, usedBytes] = await Promise.all([
    getUserDriveQuota(userId),
    getUserDriveUsedBytes(userId),
  ]);

  return {
    allowed:    usedBytes + newFileSizeBytes <= quota.limitBytes,
    usedBytes,
    limitBytes: quota.limitBytes,
    limitGb:    quota.limitGb,
    planId:     quota.planId,
  };
}

/** Grants a drive storage plan to a user after successful payment. */
export async function grantDrivePlan(
  userId: string,
  planId: string,
  period: 'monthly' | 'annual',
): Promise<void> {
  const gb = DRIVE_PLAN_GB[planId];
  if (!gb) throw new Error(`Unknown drive plan: ${planId}`);
  await updateProfileData(userId, {
    docrudDrivePlanId:          planId,
    docrudDrivePlanGb:          gb,
    docrudDrivePlanPurchasedAt: new Date().toISOString(),
    docrudDrivePlanPeriod:      period,
  });
}
