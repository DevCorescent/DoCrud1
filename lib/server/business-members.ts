import { getDbPool } from '@/lib/server/database';
import { readJsonFile, writeJsonFile } from '@/lib/server/storage';
import path from 'path';
import crypto from 'crypto';

const dataDir = path.join(process.cwd(), 'data');
const invitesPath = path.join(dataDir, 'business-page-invites.json');
const membersPath = path.join(dataDir, 'business-page-members.json');

/* ─── Types ──────────────────────────────────────────────────────── */
export interface BusinessInvite {
  id: string;
  businessPageId: string;
  token: string;
  createdBy: string;
  label?: string;
  maxUses?: number | null;
  useCount: number;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface BusinessMember {
  id: string;
  businessPageId: string;
  userId: string;
  role: string;
  title?: string;
  department?: string;
  inviteId?: string | null;
  status: string;
  joinedAt: string;
}

export interface MemberWithProfile extends BusinessMember {
  name?: string;
  avatarUrl?: string;
  headline?: string;
  location?: string;
  profileSetupDone?: boolean;
}

/* ─── Token generation ───────────────────────────────────────────── */
export function generateInviteToken(): string {
  return crypto.randomBytes(20).toString('base64url');
}

/* ─── Invite CRUD ────────────────────────────────────────────────── */

async function readInvites(): Promise<BusinessInvite[]> {
  return readJsonFile<BusinessInvite[]>(invitesPath, []);
}
async function saveInvites(invites: BusinessInvite[]): Promise<void> {
  await writeJsonFile(invitesPath, invites);
}

export async function createInvite(params: {
  businessPageId: string;
  createdBy: string;
  label?: string;
  maxUses?: number | null;
  expiresAt?: string | null;
}): Promise<BusinessInvite> {
  const now = new Date().toISOString();
  const invite: BusinessInvite = {
    id: `inv_${crypto.randomBytes(6).toString('hex')}`,
    businessPageId: params.businessPageId,
    token: generateInviteToken(),
    createdBy: params.createdBy,
    label: params.label,
    maxUses: params.maxUses ?? null,
    useCount: 0,
    expiresAt: params.expiresAt ?? null,
    isActive: true,
    createdAt: now,
  };

  const pool = getDbPool();
  if (pool) {
    await pool.query(
      `INSERT INTO business_page_invites (id,business_page_id,token,created_by,label,max_uses,use_count,expires_at,is_active,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,TRUE,$8)`,
      [invite.id, invite.businessPageId, invite.token, invite.createdBy, invite.label ?? null, invite.maxUses ?? null, invite.expiresAt ?? null, now]
    );
    return invite;
  }
  const invites = await readInvites();
  await saveInvites([invite, ...invites]);
  return invite;
}

export async function getInvitesByPage(businessPageId: string): Promise<BusinessInvite[]> {
  const pool = getDbPool();
  if (pool) {
    const r = await pool.query<{
      id: string; business_page_id: string; token: string; created_by: string;
      label: string | null; max_uses: number | null; use_count: number;
      expires_at: string | null; is_active: boolean; created_at: string;
    }>(
      `SELECT * FROM business_page_invites WHERE business_page_id=$1 ORDER BY created_at DESC`,
      [businessPageId]
    );
    return r.rows.map(row => ({
      id: row.id, businessPageId: row.business_page_id, token: row.token, createdBy: row.created_by,
      label: row.label ?? undefined, maxUses: row.max_uses, useCount: row.use_count,
      expiresAt: row.expires_at, isActive: row.is_active, createdAt: row.created_at,
    }));
  }
  const invites = await readInvites();
  return invites.filter(i => i.businessPageId === businessPageId);
}

export async function getInviteByToken(token: string): Promise<BusinessInvite | null> {
  const pool = getDbPool();
  if (pool) {
    const r = await pool.query<{
      id: string; business_page_id: string; token: string; created_by: string;
      label: string | null; max_uses: number | null; use_count: number;
      expires_at: string | null; is_active: boolean; created_at: string;
    }>(`SELECT * FROM business_page_invites WHERE token=$1`, [token]);
    if (!r.rows[0]) return null;
    const row = r.rows[0];
    return {
      id: row.id, businessPageId: row.business_page_id, token: row.token, createdBy: row.created_by,
      label: row.label ?? undefined, maxUses: row.max_uses, useCount: row.use_count,
      expiresAt: row.expires_at, isActive: row.is_active, createdAt: row.created_at,
    };
  }
  const invites = await readInvites();
  return invites.find(i => i.token === token) ?? null;
}

export async function revokeInvite(inviteId: string): Promise<void> {
  const pool = getDbPool();
  if (pool) {
    await pool.query(`UPDATE business_page_invites SET is_active=FALSE WHERE id=$1`, [inviteId]);
    return;
  }
  const invites = await readInvites();
  await saveInvites(invites.map(i => i.id === inviteId ? { ...i, isActive: false } : i));
}

export async function deleteInvite(inviteId: string): Promise<void> {
  const pool = getDbPool();
  if (pool) {
    await pool.query(`DELETE FROM business_page_invites WHERE id=$1`, [inviteId]);
    return;
  }
  const invites = await readInvites();
  await saveInvites(invites.filter(i => i.id !== inviteId));
}

/* ─── Member CRUD ────────────────────────────────────────────────── */

async function readMembers(): Promise<BusinessMember[]> {
  return readJsonFile<BusinessMember[]>(membersPath, []);
}
async function saveMembers(members: BusinessMember[]): Promise<void> {
  await writeJsonFile(membersPath, members);
}

export async function acceptInvite(params: {
  token: string;
  userId: string;
}): Promise<{ member: BusinessMember; invite: BusinessInvite } | { error: string }> {
  const invite = await getInviteByToken(params.token);
  if (!invite) return { error: 'Invite link not found or invalid.' };
  if (!invite.isActive) return { error: 'This invite link has been revoked.' };
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) return { error: 'This invite link has expired.' };
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) return { error: 'This invite link has reached its usage limit.' };

  // Check if already a member
  const existing = await getMemberByUserId(invite.businessPageId, params.userId);
  if (existing) return { error: 'You are already a member of this business page.' };

  const now = new Date().toISOString();
  const member: BusinessMember = {
    id: `mem_${crypto.randomBytes(6).toString('hex')}`,
    businessPageId: invite.businessPageId,
    userId: params.userId,
    role: 'employee',
    inviteId: invite.id,
    status: 'active',
    joinedAt: now,
  };

  const pool = getDbPool();
  if (pool) {
    await pool.query(
      `INSERT INTO business_page_members (id,business_page_id,user_id,role,invite_id,status,joined_at)
       VALUES ($1,$2,$3,'employee',$4,'active',$5)
       ON CONFLICT (business_page_id, user_id) DO NOTHING`,
      [member.id, member.businessPageId, member.userId, invite.id, now]
    );
    await pool.query(
      `UPDATE business_page_invites SET use_count=use_count+1 WHERE id=$1`,
      [invite.id]
    );
    return { member, invite };
  }

  const members = await readMembers();
  await saveMembers([member, ...members]);

  const invites = await readInvites();
  await saveInvites(invites.map(i => i.id === invite.id ? { ...i, useCount: i.useCount + 1 } : i));

  return { member, invite };
}

export async function getMembersByPage(businessPageId: string): Promise<BusinessMember[]> {
  const pool = getDbPool();
  if (pool) {
    const r = await pool.query<{
      id: string; business_page_id: string; user_id: string; role: string;
      title: string | null; department: string | null; invite_id: string | null;
      status: string; joined_at: string;
    }>(
      `SELECT * FROM business_page_members WHERE business_page_id=$1 AND status='active' ORDER BY joined_at DESC`,
      [businessPageId]
    );
    return r.rows.map(row => ({
      id: row.id, businessPageId: row.business_page_id, userId: row.user_id, role: row.role,
      title: row.title ?? undefined, department: row.department ?? undefined,
      inviteId: row.invite_id, status: row.status, joinedAt: row.joined_at,
    }));
  }
  const members = await readMembers();
  return members.filter(m => m.businessPageId === businessPageId && m.status === 'active');
}

export async function getMemberByUserId(businessPageId: string, userId: string): Promise<BusinessMember | null> {
  const pool = getDbPool();
  if (pool) {
    const r = await pool.query(
      `SELECT * FROM business_page_members WHERE business_page_id=$1 AND user_id=$2`,
      [businessPageId, userId]
    );
    if (!r.rows[0]) return null;
    const row = r.rows[0] as Record<string, unknown>;
    return {
      id: row.id as string, businessPageId: row.business_page_id as string,
      userId: row.user_id as string, role: row.role as string,
      title: row.title as string | undefined, department: row.department as string | undefined,
      inviteId: row.invite_id as string | null, status: row.status as string, joinedAt: row.joined_at as string,
    };
  }
  const members = await readMembers();
  return members.find(m => m.businessPageId === businessPageId && m.userId === userId) ?? null;
}

export async function removeMember(businessPageId: string, userId: string): Promise<void> {
  const pool = getDbPool();
  if (pool) {
    await pool.query(
      `UPDATE business_page_members SET status='removed' WHERE business_page_id=$1 AND user_id=$2`,
      [businessPageId, userId]
    );
    return;
  }
  const members = await readMembers();
  await saveMembers(members.map(m =>
    m.businessPageId === businessPageId && m.userId === userId ? { ...m, status: 'removed' } : m
  ));
}

export async function updateMemberRole(businessPageId: string, userId: string, patch: { role?: string; title?: string; department?: string }): Promise<void> {
  const pool = getDbPool();
  if (pool) {
    await pool.query(
      `UPDATE business_page_members SET role=COALESCE($3,role), title=COALESCE($4,title), department=COALESCE($5,department) WHERE business_page_id=$1 AND user_id=$2`,
      [businessPageId, userId, patch.role ?? null, patch.title ?? null, patch.department ?? null]
    );
    return;
  }
  const members = await readMembers();
  await saveMembers(members.map(m =>
    m.businessPageId === businessPageId && m.userId === userId
      ? { ...m, ...patch }
      : m
  ));
}

export async function getMembersWithProfiles(businessPageId: string): Promise<MemberWithProfile[]> {
  const { getProfileData } = await import('@/lib/server/user-profiles');
  const { readJsonFile: rjf, usersPath } = await import('@/lib/server/storage');
  const members = await getMembersByPage(businessPageId);

  const usersRaw = await rjf<Record<string, { id: string; name: string; email: string }>>(usersPath, {});
  const usersById: Record<string, { name: string }> = {};
  for (const u of Object.values(usersRaw)) {
    if (u?.id) usersById[u.id] = { name: u.name };
  }

  return Promise.all(
    members.map(async (m) => {
      const profile = await getProfileData(m.userId);
      return {
        ...m,
        name: usersById[m.userId]?.name || 'Unknown',
        avatarUrl: profile.avatarUrl,
        headline: profile.headline,
        location: profile.location,
        profileSetupDone: profile.profileSetupDone,
      };
    })
  );
}
