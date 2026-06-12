import { TeamWorkspaceMember, TeamWorkspaceSummary, User } from '@/types/document';
import { getHistoryEntries } from '@/lib/server/history';
import { getStoredUsers, saveStoredUsers } from '@/lib/server/auth';
import { createPasswordHash, normalizeEmail } from '@/lib/server/security';
import { getEffectiveSaasPlanForUser } from '@/lib/server/saas';

function createMemberId() {
  return `member-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTemporaryPassword() {
  return `Doc${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString().slice(-4)}`;
}

function sanitizeLoginId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24);
}

function createInternalMailboxEmail(loginId: string, organizationName?: string) {
  const workspaceSlug = sanitizeLoginId((organizationName || 'workspace').replace(/\s+/g, '-')) || 'workspace';
  return `${loginId}@${workspaceSlug}.internal.docrud`;
}

function getWorkspaceOwnerContext(user: User) {
  if (user.role === 'admin') {
    return {
      ownerId: user.id,
      organizationName: user.organizationName || user.name || 'docrud admin workspace',
    };
  }

  if (user.role === 'client') {
    return {
      ownerId: user.id,
      organizationName: user.organizationName || user.name,
    };
  }

  if (user.role === 'member' && user.organizationId) {
    return {
      ownerId: user.organizationId,
      organizationName: user.organizationName || user.name,
    };
  }

  return null;
}

export async function getTeamWorkspaceSummary(user: User): Promise<TeamWorkspaceSummary | null> {
  const ownerContext = getWorkspaceOwnerContext(user);
  if (!ownerContext) return null;

  const [users, history, plan] = await Promise.all([
    getStoredUsers(),
    getHistoryEntries(),
    user.role === 'admin' ? Promise.resolve(null) : getEffectiveSaasPlanForUser(user),
  ]);

  const members = users.filter((entry) => entry.role === 'member' && entry.organizationId === ownerContext.ownerId);
  const isUnlimitedWorkspace = user.role === 'admin';
  const maxMembers = isUnlimitedWorkspace ? Math.max(memberCardsLengthFallback(members.length), 9999) : Math.max(plan?.maxInternalUsers || 1, 1);

  const memberCards: TeamWorkspaceMember[] = members.map((member) => {
    const memberHistory = history.filter((entry) =>
      entry.generatedBy?.toLowerCase() === member.email.toLowerCase()
      || entry.accessEvents?.some((event) => event.actorName?.toLowerCase() === member.name.toLowerCase()),
    );
    const lastTouched = memberHistory[0]?.generatedAt || member.lastLogin || member.createdAt;
    return {
      id: member.id,
      name: member.name,
      email: member.email,
      loginId: member.loginId,
      role: member.role,
      organizationId: member.organizationId,
      organizationName: member.organizationName,
      permissions: member.permissions || [],
      inviteStatus: member.inviteStatus || (member.isActive === false ? 'disabled' : 'active'),
      isActive: member.isActive !== false,
      createdAt: member.createdAt,
      lastLogin: member.lastLogin,
      lastActivityAt: member.lastActivityAt || lastTouched,
      generatedDocuments: memberHistory.length,
      recentActivityLabel: lastTouched ? `Last activity ${new Date(lastTouched).toLocaleString()}` : 'No activity yet',
    };
  });

  const recentActivity = history
    .filter((entry) => entry.organizationId === ownerContext.ownerId)
    .flatMap((entry) => (entry.accessEvents || []).slice(0, 5).map((event) => ({
      id: `${entry.id}-${event.id}`,
      actorName: event.actorName || entry.generatedBy || 'Workspace user',
      action: event.eventType,
      createdAt: event.createdAt,
      reference: entry.referenceNumber || entry.templateName,
    })))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 12);

  return {
    planName: isUnlimitedWorkspace ? 'Super Admin Workspace' : plan?.name || user.subscription?.planName || 'Current plan',
    maxMembers,
    usedMembers: memberCards.length,
    remainingMembers: isUnlimitedWorkspace ? 9999 : Math.max(maxMembers - memberCards.length, 0),
    canInvite: isUnlimitedWorkspace ? true : memberCards.length < maxMembers,
    members: memberCards,
    recentActivity,
  };
}

function memberCardsLengthFallback(length: number) {
  return Math.max(length, 1);
}

export async function inviteTeamWorkspaceMember(
  actor: User,
  payload: { name: string; email?: string; loginId?: string; permissions?: string[]; password?: string },
) {
  const ownerContext = getWorkspaceOwnerContext(actor);
  if (!ownerContext) {
    throw new Error('Team workspace is only available for business workspaces.');
  }

  if (!payload.name?.trim()) {
    throw new Error('Name is required.');
  }

  const normalizedLoginId = sanitizeLoginId(payload.loginId || payload.name);
  if (!normalizedLoginId) {
    throw new Error('A valid login ID is required.');
  }
  const normalizedEmail = normalizeEmail(payload.email?.trim() || createInternalMailboxEmail(normalizedLoginId, ownerContext.organizationName));
  const [users, plan] = await Promise.all([
    getStoredUsers(),
    actor.role === 'admin' ? Promise.resolve(null) : getEffectiveSaasPlanForUser(actor),
  ]);

  if (users.some((entry) => entry.email === normalizedEmail || entry.loginId === normalizedLoginId)) {
    throw new Error('A user with this login ID already exists.');
  }

  const currentMembers = users.filter((entry) => entry.role === 'member' && entry.organizationId === ownerContext.ownerId);
  const maxMembers = actor.role === 'admin' ? Number.MAX_SAFE_INTEGER : Math.max(plan?.maxInternalUsers || 1, 1);
  if (actor.role !== 'admin' && currentMembers.length >= maxMembers) {
    throw new Error(`Your current plan supports up to ${maxMembers} internal users. Upgrade to invite more teammates.`);
  }

  const temporaryPassword = payload.password?.trim() || createTemporaryPassword();
  const member = {
    id: createMemberId(),
    email: normalizedEmail,
    loginId: normalizedLoginId,
    name: payload.name.trim(),
    role: 'member',
    accountType: 'business' as const,
    permissions: Array.isArray(payload.permissions) && payload.permissions.length > 0
      ? payload.permissions.map(String)
      : ['dashboard', 'generate_documents', 'history', 'document_summary', 'docsheet', 'visualizer', 'deal_room', 'internal_mailbox', 'support', 'profile', 'file_transfers'],
    organizationId: ownerContext.ownerId,
    organizationName: ownerContext.organizationName,
    isActive: true,
    createdAt: new Date().toISOString(),
    createdFromSignup: false,
    invitedByUserId: actor.id,
    invitedByEmail: actor.email,
    inviteStatus: 'active' as const,
    subscription: actor.subscription,
    ...createPasswordHash(temporaryPassword),
  };

  await saveStoredUsers([...users, member]);

  const { passwordHash, passwordSalt, ...safeMember } = member;
  return {
    member: safeMember,
    temporaryPassword,
  };
}

export async function updateTeamWorkspaceMember(
  actor: User,
  memberId: string,
  payload: { isActive?: boolean; permissions?: string[]; inviteStatus?: 'pending' | 'active' | 'disabled' },
) {
  const ownerContext = getWorkspaceOwnerContext(actor);
  if (!ownerContext) {
    throw new Error('Team workspace is only available for business workspaces.');
  }

  const users = await getStoredUsers();
  const target = users.find((entry) => entry.id === memberId && entry.role === 'member' && entry.organizationId === ownerContext.ownerId);
  if (!target) {
    throw new Error('Team member not found.');
  }

  const nextUsers = users.map((entry) => entry.id === memberId
    ? {
        ...entry,
        isActive: payload.isActive ?? entry.isActive,
        permissions: Array.isArray(payload.permissions) ? payload.permissions.map(String) : entry.permissions,
        inviteStatus: payload.inviteStatus || entry.inviteStatus || 'active',
      }
    : entry);
  await saveStoredUsers(nextUsers);
  return nextUsers.find((entry) => entry.id === memberId) || null;
}
