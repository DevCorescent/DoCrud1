import type { StoredUser } from '@/lib/server/users';
import { getDbPool } from '@/lib/server/database';

function rowToUser(row: {
  id: string;
  email: string;
  name: string;
  role: string;
  permissions: unknown;
  organization_id: string | null;
  password_hash: string | null;
  password_salt: string | null;
  profile: unknown;
  is_active: boolean;
  created_at: string | null;
  last_login: string | null;
}): StoredUser {
  const profile = row.profile && typeof row.profile === 'object' ? (row.profile as StoredUser) : ({} as StoredUser);
  return {
    ...profile,
    id: row.id,
    email: String(row.email).toLowerCase(),
    name: row.name,
    role: row.role as StoredUser['role'],
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
    organizationId: row.organization_id ?? profile.organizationId,
    passwordHash: row.password_hash ?? profile.passwordHash,
    passwordSalt: row.password_salt ?? profile.passwordSalt,
    isActive: row.is_active,
    createdAt: profile.createdAt || row.created_at || new Date().toISOString(),
    lastLogin: profile.lastLogin || row.last_login || undefined,
  };
}

export async function selectAllUserRows(): Promise<StoredUser[]> {
  const pool = getDbPool();
  if (!pool) return [];
  const result = await pool.query(
    `SELECT id, email, name, role, permissions, organization_id, password_hash, password_salt,
            profile, is_active, created_at, last_login
     FROM users ORDER BY created_at ASC, id ASC`,
  );
  return result.rows.map((r) => rowToUser(r as never));
}

export async function selectUserRowById(id: string): Promise<StoredUser | null> {
  const pool = getDbPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT id, email, name, role, permissions, organization_id, password_hash, password_salt,
            profile, is_active, created_at, last_login
     FROM users WHERE id = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] ? rowToUser(result.rows[0] as never) : null;
}

export async function selectUserRowByEmail(email: string): Promise<StoredUser | null> {
  const pool = getDbPool();
  if (!pool) return null;
  const result = await pool.query(
    `SELECT id, email, name, role, permissions, organization_id, password_hash, password_salt,
            profile, is_active, created_at, last_login
     FROM users WHERE email = $1 LIMIT 1`,
    [String(email).toLowerCase()],
  );
  return result.rows[0] ? rowToUser(result.rows[0] as never) : null;
}

function userToParams(user: StoredUser) {
  return [
    user.id,
    String(user.email).toLowerCase(),
    user.name,
    user.role,
    JSON.stringify(user.permissions || []),
    user.organizationId || null,
    user.passwordHash || null,
    user.passwordSalt || null,
    JSON.stringify(user),
    Boolean(user.isActive ?? true),
    user.createdAt || null,
    user.lastLogin || null,
  ] as const;
}

const INSERT_SQL = `INSERT INTO users (
  id, email, name, role, permissions, organization_id, password_hash, password_salt,
  profile, is_active, created_at, last_login, updated_at
) VALUES (
  $1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10,
  COALESCE($11::timestamptz, NOW()), $12::timestamptz, NOW()
)`;

export async function upsertUserRow(user: StoredUser): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  await pool.query(
    `${INSERT_SQL}
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      permissions = EXCLUDED.permissions,
      organization_id = EXCLUDED.organization_id,
      password_hash = EXCLUDED.password_hash,
      password_salt = EXCLUDED.password_salt,
      profile = EXCLUDED.profile,
      is_active = EXCLUDED.is_active,
      last_login = EXCLUDED.last_login,
      updated_at = NOW()`,
    [...userToParams(user)],
  );
}

export async function deleteUserRow(id: string): Promise<boolean> {
  const pool = getDbPool();
  if (!pool) return false;
  const result = await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Diff-based replacement: delete rows not in the incoming list, then batch-upsert
 * all supplied users in a single UNNEST round-trip.
 */
export async function reconcileUserRows(users: StoredUser[]): Promise<void> {
  const pool = getDbPool();
  if (!pool) return;
  const incomingIds = new Set(users.map((u) => u.id));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query<{ id: string }>(`SELECT id FROM users`);
    const toDelete = existing.rows.map((r) => r.id).filter((id) => !incomingIds.has(id));
    if (toDelete.length) {
      await client.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [toDelete]);
    }
    if (users.length > 0) {
      const ids: string[] = [], emails: string[] = [], names: string[] = [], roles: string[] = [];
      const permissions: string[] = [], orgIds: (string | null)[] = [];
      const pwdHashes: (string | null)[] = [], pwdSalts: (string | null)[] = [];
      const profiles: string[] = [], isActives: boolean[] = [];
      const createdAts: (string | null)[] = [], lastLogins: (string | null)[] = [];
      for (const user of users) {
        const p = userToParams(user);
        ids.push(p[0] as string); emails.push(p[1] as string); names.push(p[2] as string);
        roles.push(p[3] as string); permissions.push(p[4] as string); orgIds.push(p[5] as string | null);
        pwdHashes.push(p[6] as string | null); pwdSalts.push(p[7] as string | null);
        profiles.push(p[8] as string); isActives.push(p[9] as boolean);
        createdAts.push(p[10] as string | null); lastLogins.push(p[11] as string | null);
      }
      await client.query(
        `INSERT INTO users (
          id, email, name, role, permissions, organization_id, password_hash, password_salt,
          profile, is_active, created_at, last_login, updated_at
        )
        SELECT u.id, u.email, u.name, u.role, u.permissions::jsonb, u.organization_id,
               u.password_hash, u.password_salt, u.profile::jsonb, u.is_active,
               COALESCE(u.created_at::timestamptz, NOW()), u.last_login::timestamptz, NOW()
        FROM UNNEST(
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[],
          $7::text[], $8::text[], $9::text[], $10::boolean[], $11::text[], $12::text[]
        ) AS u(id, email, name, role, permissions, organization_id, password_hash, password_salt,
               profile, is_active, created_at, last_login)
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          permissions = EXCLUDED.permissions,
          organization_id = EXCLUDED.organization_id,
          password_hash = EXCLUDED.password_hash,
          password_salt = EXCLUDED.password_salt,
          profile = EXCLUDED.profile,
          is_active = EXCLUDED.is_active,
          last_login = EXCLUDED.last_login,
          updated_at = NOW()`,
        [ids, emails, names, roles, permissions, orgIds, pwdHashes, pwdSalts,
          profiles, isActives, createdAts, lastLogins],
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
