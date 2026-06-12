import { User } from '@/types/document';
import { createPasswordHash, normalizeEmail } from '@/lib/server/security';
import { defaultRoleProfiles } from '@/lib/server/roles';
import { getStoredUsersFromRepository, saveStoredUsersToRepository } from '@/lib/server/repositories';
import { getDbPool } from '@/lib/server/database';
import {
  deleteUserRow,
  reconcileUserRows,
  selectAllUserRows,
  selectUserRowByEmail,
  selectUserRowById,
  upsertUserRow,
} from '@/lib/server/db/users-rows';

export interface StoredUser extends User {
  passwordHash?: string;
  passwordSalt?: string;
}

const defaultUsers: StoredUser[] = [
  {
    id: '1',
    email: 'admin@company.com',
    name: 'Admin User',
    role: 'admin',
    accountType: 'business',
    permissions: ['all'],
    roleProfileId: defaultRoleProfiles[0].id,
    roleProfileName: defaultRoleProfiles[0].name,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    lastLogin: '2024-01-01T00:00:00Z',
    ...createPasswordHash('admin123'),
  },
  {
    id: '2',
    email: 'hr@company.com',
    name: 'HR Manager',
    role: 'hr',
    accountType: 'business',
    permissions: ['appointment-letter', 'offer-letter', 'termination-letter', 'resignation-letter', 'performance-appraisal', 'internship-letter'],
    roleProfileId: defaultRoleProfiles[1].id,
    roleProfileName: defaultRoleProfiles[1].name,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    ...createPasswordHash('hr123'),
  },
  {
    id: '3',
    email: 'legal@company.com',
    name: 'Legal Advisor',
    role: 'legal',
    accountType: 'business',
    permissions: ['nda', 'employment-contract', 'loan-agreement', 'service-agreement', 'partnership-agreement', 'contractual-agreement'],
    roleProfileId: defaultRoleProfiles[2].id,
    roleProfileName: defaultRoleProfiles[2].name,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    ...createPasswordHash('legal123'),
  },
];

let _usersCache: { data: StoredUser[]; expiresAt: number } | null = null;
const USERS_CACHE_TTL = 3_000; // 3 s — deduplicates concurrent requests without stale risk

export function invalidateUsersCache(): void {
  _usersCache = null;
}

export async function getStoredUsers(): Promise<StoredUser[]> {
  if (_usersCache && _usersCache.expiresAt > Date.now()) {
    return _usersCache.data;
  }
  let result: StoredUser[];
  if (getDbPool()) {
    const rows = await selectAllUserRows();
    result = rows.length === 0
      ? defaultUsers.map((u) => ({ ...u, email: normalizeEmail(u.email) }))
      : rows.map((user) => ({ ...user, email: normalizeEmail(user.email) }));
  } else {
    const users = await getStoredUsersFromRepository<StoredUser>(defaultUsers);
    result = users.map((user) => ({ ...user, email: normalizeEmail(user.email) }));
  }
  _usersCache = { data: result, expiresAt: Date.now() + USERS_CACHE_TTL };
  return result;
}

export async function saveStoredUsers(users: StoredUser[]) {
  invalidateUsersCache();
  if (getDbPool()) {
    await reconcileUserRows(users);
    return;
  }
  await saveStoredUsersToRepository(users);
}

/** Per-row fetch by id — avoids loading the full table. */
export async function getStoredUserById(id: string): Promise<StoredUser | null> {
  if (getDbPool()) {
    const row = await selectUserRowById(id);
    if (row) return { ...row, email: normalizeEmail(row.email) };
    // DB miss — could be a default/seeded user not yet in the DB table; fall through
  }
  const users = await getStoredUsers();
  return users.find((u) => u.id === id) || null;
}

/** Per-row fetch by email — avoids loading the full table. */
export async function getStoredUserByEmail(email: string): Promise<StoredUser | null> {
  const normalized = normalizeEmail(email);
  if (getDbPool()) {
    const row = await selectUserRowByEmail(normalized);
    if (row) return { ...row, email: normalizeEmail(row.email) };
    // DB miss — fall through to full list
  }
  const users = await getStoredUsers();
  return users.find((u) => normalizeEmail(u.email) === normalized) || null;
}

/** Per-row upsert — for the common single-user mutation paths. */
export async function upsertStoredUser(user: StoredUser): Promise<void> {
  invalidateUsersCache();
  if (getDbPool()) {
    await upsertUserRow({ ...user, email: normalizeEmail(user.email) });
    return;
  }
  const users = await getStoredUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  const next = idx === -1 ? [...users, user] : users.map((u, i) => (i === idx ? user : u));
  await saveStoredUsers(next);
}

/** Per-row delete — single DELETE instead of full table rewrite. */
export async function deleteStoredUser(id: string): Promise<boolean> {
  invalidateUsersCache();
  if (getDbPool()) {
    return deleteUserRow(id);
  }
  const users = await getStoredUsers();
  const next = users.filter((u) => u.id !== id);
  if (next.length === users.length) return false;
  await saveStoredUsers(next);
  return true;
}
