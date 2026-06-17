import { getDbPool, getMongoDb } from '@/lib/server/database';
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

/* ─── JSON helpers ───────────────────────────────────────────────── */
async function readInvites(): Promise<BusinessInvite[]> {
  return readJsonFile<BusinessInvite[]>(invitesPath, []);
}
async function saveInvites(invites: BusinessInvite[]): Promise<void> {
  await writeJsonFile(invitesPath, invites);
}
async function readMembers(): Promise<BusinessMember[]> {
  return readJsonFile<BusinessMember[]>(membersPath, []);
}
async function saveMembers(members: BusinessMember[]): Promise<void> {
  await writeJsonFile(membersPath, members);
}

type InviteDoc = BusinessInvite & { _id: string };
type MemberDoc = BusinessMember & { _id: string };

function stripInvite({ _id: _u, ...rest }: InviteDoc): BusinessInvite { return rest; }
function stripMember({ _id: _u, ...rest }: MemberDoc): BusinessMember { return rest; }

/* ─── Invite CRUD ────────────────────────────────────────────────── */

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

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection<InviteDoc>('business_page_invites').insertOne({ ...invite, _id: invite.id });
      return invite;
    }
  }
  const invites = await readInvites();
  await saveInvites([invite, ...invites]);
  return invite;
}

export async function getInvitesByPage(businessPageId: string): Promise<BusinessInvite[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<InviteDoc>('business_page_invites')
        .find({ businessPageId }).sort({ createdAt: -1 }).toArray();
      return docs.map(stripInvite);
    }
  }
  const invites = await readInvites();
  return invites.filter((i) => i.businessPageId === businessPageId);
}

export async function getInviteByToken(token: string): Promise<BusinessInvite | null> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<InviteDoc>('business_page_invites').findOne({ token });
      return doc ? stripInvite(doc) : null;
    }
  }
  const invites = await readInvites();
  return invites.find((i) => i.token === token) ?? null;
}

export async function revokeInvite(inviteId: string): Promise<void> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection('business_page_invites').updateOne({ _id: inviteId as any }, { $set: { isActive: false } });
      return;
    }
  }
  const invites = await readInvites();
  await saveInvites(invites.map((i) => i.id === inviteId ? { ...i, isActive: false } : i));
}

export async function deleteInvite(inviteId: string): Promise<void> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection('business_page_invites').deleteOne({ _id: inviteId as any });
      return;
    }
  }
  const invites = await readInvites();
  await saveInvites(invites.filter((i) => i.id !== inviteId));
}

/* ─── Member CRUD ────────────────────────────────────────────────── */

export async function acceptInvite(params: {
  token: string;
  userId: string;
}): Promise<{ member: BusinessMember; invite: BusinessInvite } | { error: string }> {
  const invite = await getInviteByToken(params.token);
  if (!invite) return { error: 'Invite link not found or invalid.' };
  if (!invite.isActive) return { error: 'This invite link has been revoked.' };
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) return { error: 'This invite link has expired.' };
  if (invite.maxUses != null && invite.useCount >= invite.maxUses) return { error: 'This invite link has reached its usage limit.' };

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
  const memberDocId = `${invite.businessPageId}_${params.userId}`;

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection('business_page_members').updateOne(
        { _id: memberDocId as any },
        { $setOnInsert: { ...member, _id: memberDocId } as any },
        { upsert: true },
      );
      await db.collection('business_page_invites').updateOne(
        { _id: invite.id as any },
        { $inc: { useCount: 1 } },
      );
      return { member, invite };
    }
  }

  const members = await readMembers();
  await saveMembers([member, ...members]);
  const invites = await readInvites();
  await saveInvites(invites.map((i) => i.id === invite.id ? { ...i, useCount: i.useCount + 1 } : i));
  return { member, invite };
}

export async function getMembersByPage(businessPageId: string): Promise<BusinessMember[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<MemberDoc>('business_page_members')
        .find({ businessPageId, status: 'active' }).sort({ joinedAt: -1 }).toArray();
      return docs.map(stripMember);
    }
  }
  const members = await readMembers();
  return members.filter((m) => m.businessPageId === businessPageId && m.status === 'active');
}

export async function getMemberByUserId(businessPageId: string, userId: string): Promise<BusinessMember | null> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<MemberDoc>('business_page_members')
        .findOne({ businessPageId, userId });
      return doc ? stripMember(doc) : null;
    }
  }
  const members = await readMembers();
  return members.find((m) => m.businessPageId === businessPageId && m.userId === userId) ?? null;
}

export async function removeMember(businessPageId: string, userId: string): Promise<void> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection('business_page_members').updateOne(
        { businessPageId, userId },
        { $set: { status: 'removed' } },
      );
      return;
    }
  }
  const members = await readMembers();
  await saveMembers(members.map((m) =>
    m.businessPageId === businessPageId && m.userId === userId ? { ...m, status: 'removed' } : m,
  ));
}

export async function updateMemberRole(
  businessPageId: string,
  userId: string,
  patch: { role?: string; title?: string; department?: string },
): Promise<void> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const setFields: Record<string, unknown> = {};
      if (patch.role !== undefined) setFields.role = patch.role;
      if (patch.title !== undefined) setFields.title = patch.title;
      if (patch.department !== undefined) setFields.department = patch.department;
      await db.collection('business_page_members').updateOne(
        { businessPageId, userId },
        { $set: setFields },
      );
      return;
    }
  }
  const members = await readMembers();
  await saveMembers(members.map((m) =>
    m.businessPageId === businessPageId && m.userId === userId ? { ...m, ...patch } : m,
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
    }),
  );
}
