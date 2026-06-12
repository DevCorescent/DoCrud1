import type { UserProfileData } from '@/lib/server/user-profiles';
import { getDbPool } from '@/lib/server/database';

function rowToProfile(row: { user_id: string; full_record: unknown }): { userId: string; profile: UserProfileData } {
  return {
    userId: row.user_id,
    profile: (row.full_record && typeof row.full_record === 'object'
      ? (row.full_record as UserProfileData)
      : {}) as UserProfileData,
  };
}

export async function selectAllUserProfileRows(): Promise<Record<string, UserProfileData>> {
  const pool = getDbPool();
  if (!pool) return {};
  const result = await pool.query(`SELECT user_id, full_record FROM user_profiles`);
  const map: Record<string, UserProfileData> = {};
  for (const row of result.rows) {
    const { userId, profile } = rowToProfile(row);
    map[userId] = profile;
  }
  return map;
}

export async function selectUserProfileRow(userId: string): Promise<UserProfileData | null> {
  const pool = getDbPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT user_id, full_record FROM user_profiles WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  return result.rows[0] ? rowToProfile(result.rows[0]).profile : null;
}

function profileToParams(userId: string, profile: UserProfileData) {
  const publicFace = (profile as { publicFace?: { category?: string; approvedAt?: string } }).publicFace;
  return [
    userId,
    profile.headline || null,
    profile.bio || null,
    profile.location || null,
    profile.website || null,
    profile.avatarUrl || null,
    profile.bannerUrl || null,
    profile.coverGradient || null,
    profile.pronouns || null,
    Boolean(profile.openToWork),
    Boolean(profile.profileSetupDone),
    Boolean(profile.onboardingDone),
    Boolean(profile.emailVerified),
    profile.emailVerifiedAt || null,
    Boolean(profile.docrudGo),
    profile.docrudGoPurchasedAt || null,
    publicFace?.category || null,
    publicFace?.approvedAt || null,
    JSON.stringify(profile.skills || []),
    JSON.stringify(profile.interests || []),
    JSON.stringify(profile.experience || []),
    JSON.stringify(profile.education || []),
    JSON.stringify(profile.achievements || []),
    JSON.stringify(profile.socialLinks || {}),
    JSON.stringify(profile),
    profile.updatedAt || null,
  ] as const;
}

const INSERT_SQL = `INSERT INTO user_profiles (
  user_id, headline, bio, location, website, avatar_url, banner_url, cover_gradient,
  pronouns, open_to_work, profile_setup_done, onboarding_done, email_verified,
  email_verified_at, docrud_go, docrud_go_purchased_at, public_face_category,
  public_face_approved_at, skills, interests, experience, education, achievements,
  social_links, full_record, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
  $19::jsonb, $20::jsonb, $21::jsonb, $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb,
  COALESCE($26::timestamptz, NOW())
)`;

export async function upsertUserProfileRow(userId: string, profile: UserProfileData): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  await pool.query(
    `${INSERT_SQL}
    ON CONFLICT (user_id) DO UPDATE SET
      headline = EXCLUDED.headline,
      bio = EXCLUDED.bio,
      location = EXCLUDED.location,
      website = EXCLUDED.website,
      avatar_url = EXCLUDED.avatar_url,
      banner_url = EXCLUDED.banner_url,
      cover_gradient = EXCLUDED.cover_gradient,
      pronouns = EXCLUDED.pronouns,
      open_to_work = EXCLUDED.open_to_work,
      profile_setup_done = EXCLUDED.profile_setup_done,
      onboarding_done = EXCLUDED.onboarding_done,
      email_verified = EXCLUDED.email_verified,
      email_verified_at = EXCLUDED.email_verified_at,
      docrud_go = EXCLUDED.docrud_go,
      docrud_go_purchased_at = EXCLUDED.docrud_go_purchased_at,
      public_face_category = EXCLUDED.public_face_category,
      public_face_approved_at = EXCLUDED.public_face_approved_at,
      skills = EXCLUDED.skills,
      interests = EXCLUDED.interests,
      experience = EXCLUDED.experience,
      education = EXCLUDED.education,
      achievements = EXCLUDED.achievements,
      social_links = EXCLUDED.social_links,
      full_record = EXCLUDED.full_record,
      updated_at = COALESCE(EXCLUDED.updated_at, NOW())`,
    [...profileToParams(userId, profile)],
  );
}

export async function deleteUserProfileRow(userId: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) return false;
  const result = await pool.query(`DELETE FROM user_profiles WHERE user_id = $1`, [userId]);
  return (result.rowCount ?? 0) > 0;
}

export async function bulkReplaceUserProfileRows(profiles: Record<string, UserProfileData>): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  const entries = Object.entries(profiles);
  const incomingIds = new Set(entries.map(([userId]) => userId));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ user_id: string }>('SELECT user_id FROM user_profiles');
    const toDelete = existing.rows.map((r) => r.user_id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) {
      await client.query('DELETE FROM user_profiles WHERE user_id = ANY($1::text[])', [toDelete]);
    }
    if (entries.length > 0) {
      const jsonArray = JSON.stringify(entries.map(([userId, profile]) => ({ ...profile, _uid: userId })));
      await client.query(
        `INSERT INTO user_profiles (
          user_id, headline, bio, location, website, avatar_url, banner_url, cover_gradient,
          pronouns, open_to_work, profile_setup_done, onboarding_done, email_verified,
          email_verified_at, docrud_go, docrud_go_purchased_at, public_face_category,
          public_face_approved_at, skills, interests, experience, education, achievements,
          social_links, full_record, updated_at
        )
        SELECT
          (r->>'_uid')::text,
          (r->>'headline')::text,
          (r->>'bio')::text,
          (r->>'location')::text,
          (r->>'website')::text,
          (r->>'avatarUrl')::text,
          (r->>'bannerUrl')::text,
          (r->>'coverGradient')::text,
          (r->>'pronouns')::text,
          COALESCE((r->>'openToWork')::boolean, false),
          COALESCE((r->>'profileSetupDone')::boolean, false),
          COALESCE((r->>'onboardingDone')::boolean, false),
          COALESCE((r->>'emailVerified')::boolean, false),
          (r->>'emailVerifiedAt')::text,
          COALESCE((r->>'docrudGo')::boolean, false),
          (r->>'docrudGoPurchasedAt')::text,
          (r->'publicFace'->>'category')::text,
          (r->'publicFace'->>'approvedAt')::text,
          COALESCE(r->'skills', '[]'::jsonb),
          COALESCE(r->'interests', '[]'::jsonb),
          COALESCE(r->'experience', '[]'::jsonb),
          COALESCE(r->'education', '[]'::jsonb),
          COALESCE(r->'achievements', '[]'::jsonb),
          COALESCE(r->'socialLinks', '{}'::jsonb),
          r - '_uid',
          COALESCE((r->>'updatedAt')::timestamptz, NOW())
        FROM jsonb_array_elements($1::jsonb) AS r
        ON CONFLICT (user_id) DO UPDATE SET
          headline = EXCLUDED.headline,
          bio = EXCLUDED.bio,
          location = EXCLUDED.location,
          website = EXCLUDED.website,
          avatar_url = EXCLUDED.avatar_url,
          banner_url = EXCLUDED.banner_url,
          cover_gradient = EXCLUDED.cover_gradient,
          pronouns = EXCLUDED.pronouns,
          open_to_work = EXCLUDED.open_to_work,
          profile_setup_done = EXCLUDED.profile_setup_done,
          onboarding_done = EXCLUDED.onboarding_done,
          email_verified = EXCLUDED.email_verified,
          email_verified_at = EXCLUDED.email_verified_at,
          docrud_go = EXCLUDED.docrud_go,
          docrud_go_purchased_at = EXCLUDED.docrud_go_purchased_at,
          public_face_category = EXCLUDED.public_face_category,
          public_face_approved_at = EXCLUDED.public_face_approved_at,
          skills = EXCLUDED.skills,
          interests = EXCLUDED.interests,
          experience = EXCLUDED.experience,
          education = EXCLUDED.education,
          achievements = EXCLUDED.achievements,
          social_links = EXCLUDED.social_links,
          full_record = EXCLUDED.full_record,
          updated_at = NOW()`,
        [jsonArray],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
