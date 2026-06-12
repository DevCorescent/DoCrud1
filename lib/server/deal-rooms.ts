import type {
  DealRoom,
  DealRoomAccessRequest,
  DealRoomActivity,
  DealRoomLinkedAsset,
  DealRoomMessage,
  DealRoomParticipant,
  DealRoomSignDocument,
  DealRoomSummary,
  DealRoomTask,
  DocumentHistory,
  SecureFileTransfer,
  User,
} from '@/types/document';
import { getStoredUsers, saveStoredUsers } from '@/lib/server/auth';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { getHistoryEntries } from '@/lib/server/history';
import { createPasswordHash, normalizeEmail } from '@/lib/server/security';
import { dealRoomsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createShareToken() {
  return `${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function createStableShareToken(id?: string) {
  const normalized = String(id || createId('room'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(-14);
  return normalized || createShareToken();
}

function createJoinPassword() {
  return `BR-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString().slice(-2)}`;
}

function sanitizeLoginId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 24);
}

function createRoomScopedEmail(loginId: string, roomTitle?: string) {
  const roomSlug = sanitizeLoginId((roomTitle || 'board-room').replace(/\s+/g, '-')) || 'board-room';
  return `${loginId}@${roomSlug}.boardroom.docrud`;
}

function getWorkspaceContext(user: User) {
  if (user.role === 'admin' || user.role === 'client') {
    return {
      ownerId: user.id,
      organizationName: user.organizationName || user.name,
      manager: true,
    };
  }

  if (user.role === 'member' && user.organizationId) {
    return {
      ownerId: user.organizationId,
      organizationName: user.organizationName || user.name,
      manager: user.workspaceAccessMode !== 'board_room_only',
    };
  }

  return null;
}

function createActivity(type: DealRoomActivity['type'], message: string, actor?: User): DealRoomActivity {
  return {
    id: createId('bra'),
    type,
    message,
    actorId: actor?.id,
    actorName: actor?.name,
    createdAt: new Date().toISOString(),
  };
}

function normalizeParticipant(entry: Partial<DealRoomParticipant>): DealRoomParticipant {
  return {
    id: entry.id || createId('brp'),
    userId: entry.userId ? String(entry.userId) : undefined,
    name: String(entry.name || 'Participant'),
    email: entry.email ? String(entry.email).toLowerCase() : undefined,
    companyName: entry.companyName ? String(entry.companyName) : undefined,
    roleType: entry.roleType === 'external' ? 'external' : entry.roleType === 'owner' ? 'owner' : 'internal',
    accessLevel: entry.accessLevel === 'viewer' || entry.accessLevel === 'approver' ? entry.accessLevel : 'editor',
    addedAt: entry.addedAt || new Date().toISOString(),
    inviteStatus: entry.inviteStatus === 'pending' || entry.inviteStatus === 'disabled' ? entry.inviteStatus : 'active',
    source: entry.source === 'self_registered' || entry.source === 'creator_created' ? entry.source : 'workspace',
  };
}

function normalizeTask(entry: Partial<DealRoomTask>): DealRoomTask {
  const now = new Date().toISOString();
  return {
    id: entry.id || createId('brt'),
    title: String(entry.title || 'Untitled task'),
    description: entry.description ? String(entry.description) : undefined,
    status: entry.status === 'in_progress' || entry.status === 'blocked' || entry.status === 'done' ? entry.status : 'open',
    ownerId: entry.ownerId ? String(entry.ownerId) : undefined,
    ownerName: entry.ownerName ? String(entry.ownerName) : undefined,
    dueAt: entry.dueAt ? String(entry.dueAt) : undefined,
    createdAt: entry.createdAt || now,
    updatedAt: entry.updatedAt || now,
  };
}

function normalizeLinkedAsset(entry: Partial<DealRoomLinkedAsset>): DealRoomLinkedAsset {
  return {
    id: entry.id || createId('brl'),
    assetType: entry.assetType === 'transfer' || entry.assetType === 'sheet' ? entry.assetType : 'document',
    assetId: String(entry.assetId || ''),
    title: String(entry.title || 'Linked asset'),
    subtitle: entry.subtitle ? String(entry.subtitle) : undefined,
    href: entry.href ? String(entry.href) : undefined,
    linkedAt: entry.linkedAt || new Date().toISOString(),
  };
}

function normalizeSignDocument(entry: Partial<DealRoomSignDocument>): DealRoomSignDocument {
  return {
    id: entry.id || createId('brd'),
    historyId: String(entry.historyId || ''),
    shareId: entry.shareId ? String(entry.shareId) : undefined,
    shareUrl: String(entry.shareUrl || ''),
    sharePassword: String(entry.sharePassword || ''),
    title: String(entry.title || 'Board room signing packet'),
    fileName: String(entry.fileName || 'document.pdf'),
    recipientName: entry.recipientName ? String(entry.recipientName) : undefined,
    recipientEmail: entry.recipientEmail ? String(entry.recipientEmail).toLowerCase() : undefined,
    requiredDocuments: Array.isArray(entry.requiredDocuments) ? entry.requiredDocuments.map(String).filter(Boolean) : [],
    shareAccessPolicy: entry.shareAccessPolicy === 'expiring' || entry.shareAccessPolicy === 'one_time' ? entry.shareAccessPolicy : 'standard',
    shareExpiresAt: entry.shareExpiresAt ? String(entry.shareExpiresAt) : undefined,
    maxAccessCount: typeof entry.maxAccessCount === 'number' ? entry.maxAccessCount : undefined,
    status:
      entry.status === 'shared'
      || entry.status === 'documents_pending'
      || entry.status === 'ready_to_sign'
      || entry.status === 'signed'
      || entry.status === 'revoked'
        ? entry.status
        : 'drafted',
    recipientSignatureRequired: entry.recipientSignatureRequired !== false,
    createdAt: entry.createdAt || new Date().toISOString(),
    signedAt: entry.signedAt ? String(entry.signedAt) : undefined,
    signedBy: entry.signedBy ? String(entry.signedBy) : undefined,
  };
}

function normalizeAccessRequest(entry: Partial<DealRoomAccessRequest>): DealRoomAccessRequest {
  return {
    id: entry.id || createId('brr'),
    userId: String(entry.userId || ''),
    userName: String(entry.userName || 'User'),
    userEmail: String(entry.userEmail || '').toLowerCase(),
    requestedAccessLevel: entry.requestedAccessLevel === 'viewer' || entry.requestedAccessLevel === 'approver' ? entry.requestedAccessLevel : 'editor',
    note: entry.note ? String(entry.note) : undefined,
    status: entry.status === 'approved' || entry.status === 'rejected' ? entry.status : 'pending',
    requestedAt: entry.requestedAt || new Date().toISOString(),
    reviewedAt: entry.reviewedAt ? String(entry.reviewedAt) : undefined,
    reviewedBy: entry.reviewedBy ? String(entry.reviewedBy) : undefined,
  };
}

function normalizeMessage(entry: Partial<DealRoomMessage>): DealRoomMessage {
  return {
    id: entry.id || createId('brm'),
    body: String(entry.body || ''),
    authorId: entry.authorId ? String(entry.authorId) : undefined,
    authorName: String(entry.authorName || 'Board room participant'),
    authorRoleType: entry.authorRoleType === 'owner' || entry.authorRoleType === 'external' ? entry.authorRoleType : 'internal',
    visibility: entry.visibility === 'internal_only' ? 'internal_only' : 'all_participants',
    createdAt: entry.createdAt || new Date().toISOString(),
  };
}

function canViewBoardRoomMessage(user: User, room: DealRoom, message: DealRoomMessage) {
  if (message.visibility === 'all_participants') {
    return true;
  }

  if (user.role === 'admin' || user.role === 'client') {
    return true;
  }

  const participant = room.participants.find((entry) => entry.userId === user.id);
  return participant?.roleType !== 'external';
}

export function normalizeDealRoom(entry: Partial<DealRoom>): DealRoom {
  const now = new Date().toISOString();
  const shareToken = String(entry.shareToken || createStableShareToken(entry.id));
  return {
    id: entry.id || createId('room'),
    organizationId: String(entry.organizationId || ''),
    organizationName: entry.organizationName ? String(entry.organizationName) : undefined,
    roomType:
      entry.roomType === 'vendor' || entry.roomType === 'partnership' || entry.roomType === 'fundraise' || entry.roomType === 'hiring' || entry.roomType === 'custom'
        ? entry.roomType
        : 'sales',
    title: String(entry.title || 'Untitled board room'),
    summary: String(entry.summary || ''),
    counterpartyName: String(entry.counterpartyName || 'Counterparty'),
    targetCloseDate: entry.targetCloseDate ? String(entry.targetCloseDate) : undefined,
    stage:
      entry.stage === 'shared' || entry.stage === 'under_review' || entry.stage === 'negotiation' || entry.stage === 'approval' || entry.stage === 'signed' || entry.stage === 'closed'
        ? entry.stage
        : 'draft',
    ownerUserId: String(entry.ownerUserId || ''),
    ownerName: String(entry.ownerName || 'Workspace owner'),
    shareToken,
    joinPassword: String(entry.joinPassword || createJoinPassword()),
    shareUrl: String(entry.shareUrl || `/board-room/${shareToken}`),
    createdAt: entry.createdAt || now,
    updatedAt: entry.updatedAt || now,
    participants: Array.isArray(entry.participants) ? entry.participants.map(normalizeParticipant) : [],
    accessRequests: Array.isArray(entry.accessRequests) ? entry.accessRequests.map(normalizeAccessRequest) : [],
    linkedAssets: Array.isArray(entry.linkedAssets) ? entry.linkedAssets.map(normalizeLinkedAsset) : [],
    signDocuments: Array.isArray(entry.signDocuments) ? entry.signDocuments.map(normalizeSignDocument) : [],
    tasks: Array.isArray(entry.tasks) ? entry.tasks.map(normalizeTask) : [],
    messages: Array.isArray(entry.messages) ? entry.messages.map(normalizeMessage) : [],
    notes: Array.isArray(entry.notes)
      ? entry.notes.map((note) => ({
          id: String(note.id || createId('brn')),
          body: String(note.body || ''),
          authorId: note.authorId ? String(note.authorId) : undefined,
          authorName: String(note.authorName || 'Workspace user'),
          createdAt: String(note.createdAt || now),
        }))
      : [],
    activity: Array.isArray(entry.activity)
      ? entry.activity.map((activity) => ({
          id: String(activity.id || createId('bra')),
          type: activity.type || 'updated',
          message: String(activity.message || 'Updated room'),
          actorId: activity.actorId ? String(activity.actorId) : undefined,
          actorName: activity.actorName ? String(activity.actorName) : undefined,
          createdAt: String(activity.createdAt || now),
        }))
      : [],
  };
}

export async function getDealRooms() {
  const rooms = await readJsonFile<DealRoom[]>(dealRoomsPath, []);
  const normalizedRooms = rooms.map(normalizeDealRoom);
  const needsMigration = normalizedRooms.some((room, index) => {
    const original = rooms[index] as Partial<DealRoom> | undefined;
    return !original
      || !original.shareToken
      || !original.joinPassword
      || !original.shareUrl
      || !Array.isArray(original.accessRequests)
      || !Array.isArray(original.signDocuments)
      || !Array.isArray(original.messages)
      || room.participants.some((participant, participantIndex) => {
        const originalParticipant = original.participants?.[participantIndex];
        return !originalParticipant || !originalParticipant.inviteStatus || !originalParticipant.source;
      });
  });

  if (needsMigration) {
    await saveDealRooms(normalizedRooms);
  }

  return normalizedRooms;
}

export async function saveDealRooms(rooms: DealRoom[]) {
  await writeJsonFile(dealRoomsPath, rooms.map(normalizeDealRoom));
}

export function canAccessBoardRoom(user: User, room: DealRoom) {
  if (user.role === 'admin') {
    return true;
  }

  if ((user.boardRoomIds || []).includes(room.id)) {
    return true;
  }

  if (room.participants.some((participant) => participant.userId === user.id && participant.inviteStatus !== 'disabled')) {
    return true;
  }

  const context = getWorkspaceContext(user);
  if (!context) {
    return false;
  }

  if (user.role === 'client' && room.organizationId === context.ownerId) {
    return true;
  }

  return false;
}

export function canManageBoardRoom(user: User, room: DealRoom) {
  if (user.role === 'admin' || user.role === 'client') {
    return true;
  }

  const participant = room.participants.find((entry) => entry.userId === user.id);
  return participant?.roleType === 'owner' || participant?.accessLevel === 'approver';
}

export async function getVisibleDealRooms(user: User) {
  const rooms = await getDealRooms();
  return rooms
    .filter((room) => canAccessBoardRoom(user, room))
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function buildAssetOptions(history: DocumentHistory[], transfers: SecureFileTransfer[]) {
  const documentOptions = history.slice(0, 40).map((entry) => ({
    assetType: 'document' as const,
    assetId: entry.id,
    title: entry.templateName,
    subtitle: entry.referenceNumber || entry.clientName || entry.generatedBy,
    href: entry.shareUrl,
  }));

  const transferOptions = transfers.slice(0, 40).map((entry) => ({
    assetType: 'transfer' as const,
    assetId: entry.id,
    title: entry.title || entry.fileName,
    subtitle: entry.folderName || entry.organizationName || entry.uploadedBy,
    href: entry.shareUrl,
  }));

  const sheetOptions = history
    .filter((entry) => entry.docsheetWorkbook)
    .slice(0, 40)
    .map((entry) => ({
      assetType: 'sheet' as const,
      assetId: entry.docsheetWorkbook?.id || entry.id,
      title: entry.docsheetWorkbook?.title || entry.templateName,
      subtitle: entry.referenceNumber || `${entry.docsheetWorkbook?.sheets?.length || 0} sheets`,
      href: entry.shareUrl,
    }));

  return [...documentOptions, ...transferOptions, ...sheetOptions];
}

export async function getDealRoomWorkspaceData(user: User): Promise<{
  rooms: DealRoom[];
  summary: DealRoomSummary;
  participantOptions: Array<{ id: string; name: string; email: string; role: string }>;
  assetOptions: Array<{ assetType: 'document' | 'transfer' | 'sheet'; assetId: string; title: string; subtitle?: string; href?: string }>;
  currentUserId: string;
  currentUserRole: string;
  boardRoomOnly: boolean;
}> {
  const context = getWorkspaceContext(user);
  const [rooms, users, history, transfers] = await Promise.all([
    getVisibleDealRooms(user),
    getStoredUsers(),
    getHistoryEntries(),
    getFileTransfers(),
  ]);

  const participantOptions = context?.manager
    ? users
        .filter((entry) => (entry.organizationId === context.ownerId || entry.id === context.ownerId) && entry.isActive !== false)
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          email: entry.email,
          role: entry.role,
        }))
    : [];

  const historyScoped = context ? history.filter((entry) => entry.organizationId === context.ownerId) : [];
  const transferScoped = context ? transfers.filter((entry) => entry.organizationId === context.ownerId) : [];
  const historyById = new Map(historyScoped.map((entry) => [entry.id, entry] as const));

  const stageCounts = new Map<DealRoom['stage'], number>();
  const visibleRooms = rooms.map((room) => ({
    ...room,
    signDocuments: room.signDocuments.map((document) => {
      const historyEntry = historyById.get(document.historyId);
      if (!historyEntry) {
        return document;
      }
      let status: DealRoomSignDocument['status'] = document.status;
      if (historyEntry.revokedAt) {
        status = 'revoked';
      } else if (historyEntry.recipientSignedAt) {
        status = 'signed';
      } else if (historyEntry.requiredDocumentWorkflowEnabled && historyEntry.documentsVerificationStatus !== 'verified') {
        status = historyEntry.submittedDocuments?.length ? 'documents_pending' : 'documents_pending';
      } else if (historyEntry.recipientSignatureRequired) {
        status = 'ready_to_sign';
      } else {
        status = 'shared';
      }
      return normalizeSignDocument({
        ...document,
        shareId: historyEntry.shareId || document.shareId,
        shareUrl: historyEntry.shareUrl || document.shareUrl,
        sharePassword: historyEntry.sharePassword || document.sharePassword,
        shareAccessPolicy: historyEntry.shareAccessPolicy || document.shareAccessPolicy,
        shareExpiresAt: historyEntry.shareExpiresAt || document.shareExpiresAt,
        maxAccessCount: historyEntry.maxAccessCount ?? document.maxAccessCount,
        requiredDocuments: historyEntry.requiredDocuments || document.requiredDocuments,
        recipientSignatureRequired: historyEntry.recipientSignatureRequired ?? document.recipientSignatureRequired,
        recipientName: historyEntry.clientName || document.recipientName,
        recipientEmail: historyEntry.clientEmail || document.recipientEmail,
        signedAt: historyEntry.recipientSignedAt,
        signedBy: historyEntry.recipientSignerName,
        status,
      });
    }),
    messages: room.messages.filter((message) => canViewBoardRoomMessage(user, room, message)),
  }));

  visibleRooms.forEach((room) => {
    stageCounts.set(room.stage, (stageCounts.get(room.stage) || 0) + 1);
  });

  return {
    rooms: visibleRooms,
    summary: {
      totalRooms: visibleRooms.length,
      openRooms: visibleRooms.filter((room) => room.stage !== 'signed' && room.stage !== 'closed').length,
      closingSoonRooms: visibleRooms.filter((room) => room.targetCloseDate && new Date(room.targetCloseDate).getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000).length,
      linkedAssets: visibleRooms.reduce((sum, room) => sum + room.linkedAssets.length, 0),
      openTasks: visibleRooms.reduce((sum, room) => sum + room.tasks.filter((task) => task.status !== 'done').length, 0),
      stageDistribution: Array.from(stageCounts.entries()).map(([stage, count]) => ({ stage, count })),
    },
    participantOptions,
    assetOptions: context?.manager ? buildAssetOptions(historyScoped, transferScoped) : [],
    currentUserId: user.id,
    currentUserRole: user.role,
    boardRoomOnly: user.workspaceAccessMode === 'board_room_only',
  };
}

export async function createDealRoom(
  actor: User,
  payload: {
    title: string;
    summary: string;
    counterpartyName: string;
    roomType?: DealRoom['roomType'];
    targetCloseDate?: string;
  },
) {
  const context = getWorkspaceContext(actor);
  if (!context?.manager) {
    throw new Error('Board rooms can only be created from a managed business workspace.');
  }

  if (!payload.title?.trim() || !payload.counterpartyName?.trim()) {
    throw new Error('Board room title and counterparty name are required.');
  }

  const now = new Date().toISOString();
  const shareToken = createShareToken();
  const room = normalizeDealRoom({
    organizationId: context.ownerId,
    organizationName: context.organizationName,
    roomType: payload.roomType,
    title: payload.title.trim(),
    summary: payload.summary?.trim() || '',
    counterpartyName: payload.counterpartyName.trim(),
    targetCloseDate: payload.targetCloseDate || undefined,
    ownerUserId: actor.id,
    ownerName: actor.name,
    shareToken,
    shareUrl: `/board-room/${shareToken}`,
    joinPassword: createJoinPassword(),
    participants: [
      {
        id: createId('brp'),
        userId: actor.id,
        name: actor.name,
        email: actor.email,
        roleType: 'owner',
        accessLevel: 'approver',
        inviteStatus: 'active',
        source: 'workspace',
        addedAt: now,
      },
    ],
    activity: [createActivity('created', `${actor.name} created the board room.`, actor)],
  });

  const rooms = await getDealRooms();
  await saveDealRooms([room, ...rooms]);
  return room;
}

export async function createBoardRoomScopedUser(
  actor: User,
  roomId: string,
  payload: { name: string; loginId?: string; password?: string; accessLevel: 'viewer' | 'editor' | 'approver' },
) {
  const rooms = await getDealRooms();
  const room = rooms.find((entry) => entry.id === roomId);
  if (!room) {
    throw new Error('Board room not found.');
  }
  if (!canManageBoardRoom(actor, room)) {
    throw new Error('You do not have permission to create board room users.');
  }

  if (!payload.name?.trim()) {
    throw new Error('User name is required.');
  }

  const users = await getStoredUsers();
  const normalizedLoginId = sanitizeLoginId(payload.loginId || payload.name);
  if (!normalizedLoginId) {
    throw new Error('A valid username is required.');
  }
  if (users.some((entry) => entry.loginId === normalizedLoginId)) {
    throw new Error('That username is already in use.');
  }

  const password = (payload.password || `BR${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString().slice(-3)}`).trim();
  const roomUser: User & { passwordHash?: string; passwordSalt?: string } = {
    id: createId('board-user'),
    name: payload.name.trim(),
    email: normalizeEmail(createRoomScopedEmail(normalizedLoginId, room.title)),
    loginId: normalizedLoginId,
    role: 'member',
    accountType: 'business',
    permissions: ['deal_room'],
    isActive: true,
    createdAt: new Date().toISOString(),
    organizationId: room.organizationId,
    organizationName: room.organizationName,
    createdFromSignup: false,
    invitedByUserId: actor.id,
    invitedByEmail: actor.email,
    inviteStatus: 'active',
    workspaceAccessMode: 'board_room_only',
    boardRoomIds: [room.id],
    subscription: actor.subscription,
    ...createPasswordHash(password),
  };

  await saveStoredUsers([...users, roomUser]);

  const updatedRoom = await updateDealRoom(actor, room.id, (currentRoom) => ({
    ...currentRoom,
    participants: [
      {
        id: createId('brp'),
        userId: roomUser.id,
        name: roomUser.name,
        email: roomUser.email,
        roleType: 'external',
        accessLevel: payload.accessLevel,
        inviteStatus: 'active',
        source: 'creator_created',
        addedAt: new Date().toISOString(),
      },
      ...currentRoom.participants,
    ],
    activity: [
      createActivity('participant_added', `${actor.name} created a board-room-only user for ${roomUser.name}.`, actor),
      ...currentRoom.activity,
    ],
  }));

  const { passwordHash, passwordSalt, ...safeUser } = roomUser;
  return { room: updatedRoom, user: safeUser, password };
}

export async function requestBoardRoomAccess(
  roomToken: string,
  actor: User,
  payload: { joinPassword: string; requestedAccessLevel: 'viewer' | 'editor' | 'approver'; note?: string },
) {
  const rooms = await getDealRooms();
  const room = rooms.find((entry) => entry.shareToken === roomToken);
  if (!room) {
    throw new Error('Board room not found.');
  }
  if (room.joinPassword.toUpperCase() !== payload.joinPassword.trim().toUpperCase()) {
    throw new Error('Invalid board room password.');
  }

  const existingParticipant = room.participants.find((participant) => participant.userId === actor.id);
  if (existingParticipant) {
    return { status: 'joined' as const, room };
  }

  const existingRequest = room.accessRequests.find((request) => request.userId === actor.id && request.status === 'pending');
  if (existingRequest) {
    return { status: 'requested' as const, room };
  }

  const request = normalizeAccessRequest({
    userId: actor.id,
    userName: actor.name,
    userEmail: actor.email,
    requestedAccessLevel: payload.requestedAccessLevel,
    note: payload.note,
    status: 'pending',
  });

  const updatedRooms = rooms.map((entry) => entry.id === room.id ? normalizeDealRoom({
    ...entry,
    accessRequests: [request, ...entry.accessRequests],
    activity: [
      createActivity('updated', `${actor.name} requested ${payload.requestedAccessLevel} access to the board room.`, actor),
      ...entry.activity,
    ],
    updatedAt: new Date().toISOString(),
  }) : entry);
  await saveDealRooms(updatedRooms);
  return { status: 'requested' as const, room: updatedRooms.find((entry) => entry.id === room.id)! };
}

export async function respondToBoardRoomAccessRequest(
  actor: User,
  roomId: string,
  requestId: string,
  decision: 'approved' | 'rejected',
) {
  const users = await getStoredUsers();
  let participantAdded: DealRoomParticipant | null = null;

  const room = await updateDealRoom(actor, roomId, (currentRoom) => {
    if (!canManageBoardRoom(actor, currentRoom)) {
      throw new Error('You do not have permission to review board room requests.');
    }
    const targetRequest = currentRoom.accessRequests.find((entry) => entry.id === requestId);
    if (!targetRequest) {
      throw new Error('Access request not found.');
    }

    const nextRequests = currentRoom.accessRequests.map((entry) =>
      entry.id === requestId
        ? {
            ...entry,
            status: decision,
            reviewedAt: new Date().toISOString(),
            reviewedBy: actor.name,
          }
        : entry
    );

    const nextParticipants = [...currentRoom.participants];
    if (decision === 'approved' && !nextParticipants.some((entry) => entry.userId === targetRequest.userId)) {
      const requester = users.find((entry) => entry.id === targetRequest.userId);
      participantAdded = {
        id: createId('brp'),
        userId: targetRequest.userId,
        name: targetRequest.userName,
        email: targetRequest.userEmail,
        companyName: requester?.organizationName,
        roleType: 'external',
        accessLevel: targetRequest.requestedAccessLevel,
        inviteStatus: 'active',
        source: 'self_registered',
        addedAt: new Date().toISOString(),
      };
      nextParticipants.unshift(participantAdded);
    }

    return {
      ...currentRoom,
      accessRequests: nextRequests,
      participants: nextParticipants,
      activity: [
        createActivity(
          'updated',
          decision === 'approved'
            ? `${actor.name} approved a board room access request for ${targetRequest.userName}.`
            : `${actor.name} rejected a board room access request for ${targetRequest.userName}.`,
          actor,
        ),
        ...currentRoom.activity,
      ],
    };
  });

  return { room, participantAdded };
}

export async function updateDealRoom(
  actor: User,
  roomId: string,
  updater: (room: DealRoom) => DealRoom,
) {
  const rooms = await getDealRooms();
  const index = rooms.findIndex((entry) => entry.id === roomId);
  if (index === -1) {
    throw new Error('Board room not found.');
  }

  if (!canAccessBoardRoom(actor, rooms[index])) {
    throw new Error('You do not have access to this board room.');
  }

  const updated = normalizeDealRoom({
    ...updater(rooms[index]),
    updatedAt: new Date().toISOString(),
  });
  const nextRooms = rooms.map((entry, entryIndex) => (entryIndex === index ? updated : entry));
  await saveDealRooms(nextRooms);
  return updated;
}

export async function deleteDealRoom(actor: User, roomId: string) {
  const rooms = await getDealRooms();
  const target = rooms.find((room) => room.id === roomId);
  if (!target) {
    throw new Error('Board room not found.');
  }

  if (!canManageBoardRoom(actor, target)) {
    throw new Error('Only board room managers can delete this room.');
  }

  await saveDealRooms(rooms.filter((room) => room.id !== roomId));
}

export async function getPublicBoardRoomByToken(roomToken: string) {
  const rooms = await getDealRooms();
  return rooms.find((entry) => entry.shareToken === roomToken) || null;
}
