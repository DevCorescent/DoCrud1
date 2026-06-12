import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { appendHistoryEntry } from '@/lib/server/history';
import { canUserAccessFeature } from '@/lib/server/saas';
import {
  createBoardRoomScopedUser,
  createDealRoom,
  deleteDealRoom,
  getDealRoomWorkspaceData,
  getVisibleDealRooms,
  respondToBoardRoomAccessRequest,
  updateDealRoom,
} from '@/lib/server/deal-rooms';
import type { DealRoomParticipant } from '@/types/document';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const users = await getStoredUsers();
  const actor = users.find((user) => user.email.toLowerCase() === (session.user.email || '').toLowerCase());
  if (!actor) {
    return { error: NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 }) };
  }

  if (actor.role !== 'admin' && actor.role !== 'individual') {
    const accessAllowed = await canUserAccessFeature(actor, 'deal_room');
    if (!accessAllowed || (actor.role !== 'client' && actor.role !== 'member')) {
      return { error: NextResponse.json({ error: 'Your current plan does not include board room workflows.' }, { status: 403 }) };
    }
  }

  return { actor };
}

export async function GET() {
  try {
    const resolved = await getActor();
    if (resolved.error) {
      return resolved.error;
    }

    const payload = await getDealRoomWorkspaceData(resolved.actor);
    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load board rooms.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await getActor();
    if (resolved.error) {
      return resolved.error;
    }

    if (resolved.actor.role !== 'admin' && resolved.actor.role !== 'client') {
      return NextResponse.json({ error: 'Only workspace managers can create board rooms.' }, { status: 403 });
    }

    const payload = await request.json() as {
      title: string;
      summary: string;
      counterpartyName: string;
      roomType?: 'sales' | 'vendor' | 'partnership' | 'fundraise' | 'hiring' | 'custom';
      targetCloseDate?: string;
    };

    const room = await createDealRoom(resolved.actor, payload);
    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create board room.' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const resolved = await getActor();
    if (resolved.error) {
      return resolved.error;
    }

    const payload = await request.json() as {
      roomId: string;
      action:
        | 'update_room'
        | 'update_stage'
        | 'add_participant'
        | 'remove_participant'
        | 'add_asset'
        | 'remove_asset'
        | 'add_sign_document'
        | 'add_task'
        | 'update_task'
        | 'add_message'
        | 'add_note'
        | 'create_room_user'
        | 'respond_access_request';
      roomType?: 'sales' | 'vendor' | 'partnership' | 'fundraise' | 'hiring' | 'custom';
      title?: string;
      summary?: string;
      counterpartyName?: string;
      targetCloseDate?: string;
      stage?: 'draft' | 'shared' | 'under_review' | 'negotiation' | 'approval' | 'signed' | 'closed';
      participant?: Partial<DealRoomParticipant>;
      participantId?: string;
      asset?: { assetType: 'document' | 'transfer' | 'sheet'; assetId: string; title: string; subtitle?: string; href?: string };
      assetId?: string;
      signDocument?: {
        title: string;
        fileName: string;
        mimeType: string;
        dataUrl: string;
        recipientName?: string;
        recipientEmail?: string;
        requiredDocuments?: string[];
        shareAccessPolicy?: 'standard' | 'expiring' | 'one_time';
        expiryDays?: number;
        maxAccessCount?: number;
      };
      task?: { title: string; description?: string; dueAt?: string; ownerId?: string; ownerName?: string };
      taskId?: string;
      status?: 'open' | 'in_progress' | 'blocked' | 'done';
      note?: string;
      message?: string;
      visibility?: 'all_participants' | 'internal_only';
      roomUser?: { name: string; loginId?: string; password?: string; accessLevel: 'viewer' | 'editor' | 'approver' };
      requestId?: string;
      decision?: 'approved' | 'rejected';
    };

    if (!payload.roomId) {
      return NextResponse.json({ error: 'Room ID is required.' }, { status: 400 });
    }

    if (payload.action === 'create_room_user') {
      if (!payload.roomUser) {
        return NextResponse.json({ error: 'Board room user details are required.' }, { status: 400 });
      }
      const result = await createBoardRoomScopedUser(resolved.actor, payload.roomId, payload.roomUser);
      return NextResponse.json(result);
    }

    if (payload.action === 'respond_access_request') {
      if (!payload.requestId || !payload.decision) {
        return NextResponse.json({ error: 'Request and decision are required.' }, { status: 400 });
      }
      const result = await respondToBoardRoomAccessRequest(resolved.actor, payload.roomId, payload.requestId, payload.decision);
      return NextResponse.json(result);
    }

    if (payload.action === 'add_sign_document') {
      if (!payload.signDocument?.title?.trim() || !payload.signDocument.fileName?.trim() || !payload.signDocument.dataUrl?.startsWith('data:')) {
        return NextResponse.json({ error: 'Sign document title, file, and upload data are required.' }, { status: 400 });
      }

      const rooms = await getVisibleDealRooms(resolved.actor);
      const room = rooms.find((entry) => entry.id === payload.roomId);
      if (!room) {
        return NextResponse.json({ error: 'Board room not found.' }, { status: 404 });
      }

      const expiryDays = payload.signDocument.shareAccessPolicy === 'expiring' && typeof payload.signDocument.expiryDays === 'number'
        ? payload.signDocument.expiryDays
        : undefined;
      const shareExpiresAt = expiryDays ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString() : undefined;
      const historyEntry = await appendHistoryEntry({
        documentSourceType: 'uploaded_pdf',
        templateId: 'board-room-sign-packet',
        templateName: payload.signDocument.title.trim(),
        category: 'Board Room',
        generatedBy: resolved.actor.name,
        uploadedPdfFileName: payload.signDocument.fileName.trim(),
        uploadedPdfMimeType: payload.signDocument.mimeType || 'application/pdf',
        uploadedPdfDataUrl: payload.signDocument.dataUrl,
        clientName: payload.signDocument.recipientName?.trim() || room.counterpartyName,
        clientEmail: payload.signDocument.recipientEmail?.trim().toLowerCase() || undefined,
        clientOrganization: room.counterpartyName,
        organizationId: room.organizationId,
        organizationName: room.organizationName,
        folderLabel: room.title,
        recipientSignatureRequired: true,
        recipientAccess: 'view',
        shareAccessPolicy: payload.signDocument.shareAccessPolicy || 'standard',
        shareExpiresAt,
        maxAccessCount: payload.signDocument.shareAccessPolicy === 'one_time'
          ? Math.max(1, Number(payload.signDocument.maxAccessCount || 1))
          : undefined,
        requiredDocumentWorkflowEnabled: Boolean(payload.signDocument.requiredDocuments?.length),
        requiredDocuments: payload.signDocument.requiredDocuments || [],
        sharedSessionLabel: room.title,
        automationNotes: [`Created from board room ${room.title}`],
      });

      const updatedRoom = await updateDealRoom(resolved.actor, payload.roomId, (current) => ({
        ...current,
        signDocuments: [
          {
            id: `brd-${Date.now()}`,
            historyId: historyEntry.id,
            shareId: historyEntry.shareId,
            shareUrl: historyEntry.shareUrl || '',
            sharePassword: historyEntry.sharePassword || '',
            title: historyEntry.templateName,
            fileName: historyEntry.uploadedPdfFileName || payload.signDocument?.fileName.trim() || 'document.pdf',
            recipientName: historyEntry.clientName,
            recipientEmail: historyEntry.clientEmail,
            requiredDocuments: historyEntry.requiredDocuments || [],
            shareAccessPolicy: historyEntry.shareAccessPolicy || 'standard',
            shareExpiresAt: historyEntry.shareExpiresAt,
            maxAccessCount: historyEntry.maxAccessCount,
            recipientSignatureRequired: historyEntry.recipientSignatureRequired !== false,
            status: historyEntry.requiredDocumentWorkflowEnabled ? 'documents_pending' : 'ready_to_sign',
            createdAt: historyEntry.generatedAt,
          },
          ...current.signDocuments,
        ],
        activity: [
          {
            id: `bra-${Date.now()}`,
            type: 'asset_linked',
            message: `${resolved.actor.name} added a signable board room document packet.`,
            actorId: resolved.actor.id,
            actorName: resolved.actor.name,
            createdAt: new Date().toISOString(),
          },
          ...current.activity,
        ],
      }));

      return NextResponse.json(updatedRoom);
    }

    const updated = await updateDealRoom(resolved.actor, payload.roomId, (room) => {
      const next = {
        ...room,
        participants: [...room.participants],
        linkedAssets: [...room.linkedAssets],
        signDocuments: [...room.signDocuments],
        tasks: [...room.tasks],
        messages: [...room.messages],
        notes: [...room.notes],
        activity: [...room.activity],
      };

      const actorParticipant = room.participants.find((participant) => participant.userId === resolved.actor.id);

      switch (payload.action) {
        case 'update_room':
          next.title = payload.title?.trim() || next.title;
          next.summary = payload.summary !== undefined ? payload.summary.trim() : next.summary;
          next.counterpartyName = payload.counterpartyName?.trim() || next.counterpartyName;
          next.roomType = payload.roomType || next.roomType;
          next.targetCloseDate = payload.targetCloseDate || undefined;
          next.activity.unshift({
            id: `bra-${Date.now()}`,
            type: 'updated',
            message: `${resolved.actor.name} updated board room details.`,
            actorId: resolved.actor.id,
            actorName: resolved.actor.name,
            createdAt: new Date().toISOString(),
          });
          break;
        case 'update_stage':
          if (!payload.stage) {
            throw new Error('Stage is required.');
          }
          next.stage = payload.stage;
          next.activity.unshift({
            id: `bra-${Date.now()}`,
            type: 'stage_changed',
            message: `${resolved.actor.name} moved the board room to ${payload.stage.replace(/_/g, ' ')}.`,
            actorId: resolved.actor.id,
            actorName: resolved.actor.name,
            createdAt: new Date().toISOString(),
          });
          break;
        case 'add_participant':
          if (!payload.participant?.name?.trim()) {
            throw new Error('Participant name is required.');
          }
          next.participants.unshift({
            id: `brp-${Date.now()}`,
            userId: payload.participant.userId,
            name: payload.participant.name.trim(),
            email: payload.participant.email?.trim().toLowerCase(),
            companyName: payload.participant.companyName?.trim(),
            roleType: payload.participant.roleType === 'external' ? 'external' : payload.participant.roleType === 'owner' ? 'owner' : 'internal',
            accessLevel: payload.participant.accessLevel === 'viewer' || payload.participant.accessLevel === 'approver' ? payload.participant.accessLevel : 'editor',
            inviteStatus: 'active',
            source: 'workspace',
            addedAt: new Date().toISOString(),
          });
          next.activity.unshift({
            id: `bra-${Date.now()}`,
            type: 'participant_added',
            message: `${resolved.actor.name} added ${payload.participant.name.trim()} to the board room.`,
            actorId: resolved.actor.id,
            actorName: resolved.actor.name,
            createdAt: new Date().toISOString(),
          });
          break;
        case 'remove_participant': {
          const removed = next.participants.find((participant) => participant.id === payload.participantId);
          next.participants = next.participants.filter((participant) => participant.id !== payload.participantId);
          if (removed) {
            next.activity.unshift({
              id: `bra-${Date.now()}`,
              type: 'participant_removed',
              message: `${resolved.actor.name} removed ${removed.name} from the board room.`,
              actorId: resolved.actor.id,
              actorName: resolved.actor.name,
              createdAt: new Date().toISOString(),
            });
          }
          break;
        }
        case 'add_asset':
          if (!payload.asset?.assetId || !payload.asset.title?.trim()) {
            throw new Error('Asset details are required.');
          }
          next.linkedAssets.unshift({
            id: `brl-${Date.now()}`,
            assetType: payload.asset.assetType,
            assetId: payload.asset.assetId,
            title: payload.asset.title.trim(),
            subtitle: payload.asset.subtitle?.trim(),
            href: payload.asset.href,
            linkedAt: new Date().toISOString(),
          });
          next.activity.unshift({
            id: `bra-${Date.now()}`,
            type: 'asset_linked',
            message: `${resolved.actor.name} linked ${payload.asset.title.trim()} to the board room.`,
            actorId: resolved.actor.id,
            actorName: resolved.actor.name,
            createdAt: new Date().toISOString(),
          });
          break;
        case 'remove_asset': {
          const removed = next.linkedAssets.find((asset) => asset.id === payload.assetId);
          next.linkedAssets = next.linkedAssets.filter((asset) => asset.id !== payload.assetId);
          if (removed) {
            next.activity.unshift({
              id: `bra-${Date.now()}`,
              type: 'asset_removed',
              message: `${resolved.actor.name} removed ${removed.title} from linked assets.`,
              actorId: resolved.actor.id,
              actorName: resolved.actor.name,
              createdAt: new Date().toISOString(),
            });
          }
          break;
        }
        case 'add_task':
          if (!payload.task?.title?.trim()) {
            throw new Error('Task title is required.');
          }
          next.tasks.unshift({
            id: `brt-${Date.now()}`,
            title: payload.task.title.trim(),
            description: payload.task.description?.trim(),
            dueAt: payload.task.dueAt || undefined,
            ownerId: payload.task.ownerId,
            ownerName: payload.task.ownerName,
            status: 'open',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          next.activity.unshift({
            id: `bra-${Date.now()}`,
            type: 'task_created',
            message: `${resolved.actor.name} created a new board room task.`,
            actorId: resolved.actor.id,
            actorName: resolved.actor.name,
            createdAt: new Date().toISOString(),
          });
          break;
        case 'update_task':
          next.tasks = next.tasks.map((task) =>
            task.id === payload.taskId
              ? {
                  ...task,
                  status: payload.status || task.status,
                  updatedAt: new Date().toISOString(),
                }
              : task
          );
          next.activity.unshift({
            id: `bra-${Date.now()}`,
            type: 'task_updated',
            message: `${resolved.actor.name} updated a board room task.`,
            actorId: resolved.actor.id,
            actorName: resolved.actor.name,
            createdAt: new Date().toISOString(),
          });
          break;
        case 'add_note':
          if (!payload.note?.trim()) {
            throw new Error('A note is required.');
          }
          next.notes.unshift({
            id: `brn-${Date.now()}`,
            body: payload.note.trim(),
            authorId: resolved.actor.id,
            authorName: resolved.actor.name,
            createdAt: new Date().toISOString(),
          });
          next.activity.unshift({
            id: `bra-${Date.now()}`,
            type: 'note_added',
            message: `${resolved.actor.name} added a board room update.`,
            actorId: resolved.actor.id,
            actorName: resolved.actor.name,
            createdAt: new Date().toISOString(),
          });
          break;
        case 'add_message': {
          if (!payload.message?.trim()) {
            throw new Error('A message is required.');
          }
          const requestedVisibility = payload.visibility === 'internal_only' ? 'internal_only' : 'all_participants';
          const canSendInternalMessage =
            resolved.actor.role === 'admin'
            || resolved.actor.role === 'client'
            || actorParticipant?.roleType === 'owner'
            || actorParticipant?.roleType === 'internal';
          const visibility = requestedVisibility === 'internal_only' && canSendInternalMessage ? 'internal_only' : 'all_participants';

          next.messages.unshift({
            id: `brm-${Date.now()}`,
            body: payload.message.trim(),
            authorId: resolved.actor.id,
            authorName: resolved.actor.name,
            authorRoleType:
              resolved.actor.role === 'admin' || resolved.actor.role === 'client'
                ? 'owner'
                : actorParticipant?.roleType === 'external'
                  ? 'external'
                  : actorParticipant?.roleType === 'owner'
                    ? 'owner'
                    : 'internal',
            visibility,
            createdAt: new Date().toISOString(),
          });
          next.activity.unshift({
            id: `bra-${Date.now()}`,
            type: 'message_added',
            message: `${resolved.actor.name} posted a ${visibility === 'internal_only' ? 'private internal' : 'board room'} message.`,
            actorId: resolved.actor.id,
            actorName: resolved.actor.name,
            createdAt: new Date().toISOString(),
          });
          break;
        }
        default:
          throw new Error('Unsupported update action.');
      }

      return next;
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update board room.' }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const resolved = await getActor();
    if (resolved.error) {
      return resolved.error;
    }

    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('roomId');
    if (!roomId) {
      return NextResponse.json({ error: 'Room ID is required.' }, { status: 400 });
    }

    await deleteDealRoom(resolved.actor, roomId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete board room.' }, { status: 400 });
  }
}
