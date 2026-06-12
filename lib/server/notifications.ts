import { DocumentHistory, User, WorkspaceNotification } from '@/types/document';
import { notificationStatePath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { getVisibleInternalMailThreads } from '@/lib/server/internal-mailbox';
import { getHistoryEntries } from '@/lib/server/history';
import { buildBillingThreshold } from '@/lib/server/billing';
import { getUserUsageSummary } from '@/lib/server/saas';
import { getVisibleDealRooms } from '@/lib/server/deal-rooms';
import { getDeduplicatedSocialEventsForUser } from '@/lib/server/social-events';
import { getDbPool } from '@/lib/server/database';

type NotificationState = {
  readMap: Record<string, string[]>;
};

const emptyState: NotificationState = {
  readMap: {},
};

function isRead(state: NotificationState, userId: string, notificationId: string) {
  return (state.readMap[userId] || []).includes(notificationId);
}

function addNotification(list: WorkspaceNotification[], item: WorkspaceNotification) {
  if (!list.some((entry) => entry.id === item.id)) {
    list.push(item);
  }
}

function buildFeedbackNotifications(history: DocumentHistory[], user: User, state: NotificationState) {
  if (user.workspaceAccessMode === 'board_room_only') {
    return [];
  }
  const notifications: WorkspaceNotification[] = [];
  const relevant = user.role === 'admin'
    ? history
    : user.role === 'client'
      ? history.filter((entry) => entry.organizationId === user.id || entry.generatedBy?.toLowerCase() === user.email.toLowerCase())
      : user.role === 'member' && user.organizationId
        ? history.filter((entry) => entry.organizationId === user.organizationId)
        : history.filter((entry) => entry.generatedBy?.toLowerCase() === user.email.toLowerCase());

  relevant.forEach((entry) => {
    (entry.collaborationComments || []).forEach((comment) => {
      if (comment.repliedBy) return;
      const notificationId = `feedback-${comment.id}`;
      const documentHref = entry.shareUrl || (entry.shareId ? `/documents/${entry.shareId}` : '/workspace?tab=history');
      addNotification(notifications, {
        id: notificationId,
        type: 'feedback',
        title: `${comment.type === 'review' ? 'Review' : 'Comment'} on ${entry.templateName}`,
        body: `${comment.authorName} left feedback that still needs a response.`,
        href: documentHref,
        createdAt: comment.createdAt,
        read: isRead(state, user.id, notificationId),
        tone: 'amber',
        metadata: {
          documentId: entry.id,
          status: 'needs_reply',
        },
      });
    });
  });

  return notifications;
}

async function buildMailboxNotifications(user: User, state: NotificationState) {
  const notifications: WorkspaceNotification[] = [];
  const threads = await getVisibleInternalMailThreads(user);

  threads.forEach((thread) => {
    const unreadMessages = thread.messages.filter((message) =>
      message.senderId !== user.id && !(message.readBy || []).includes(user.email.toLowerCase()),
    );

    unreadMessages.forEach((message) => {
      const notificationId = `mail-${message.id}`;
      addNotification(notifications, {
        id: notificationId,
        type: 'mail',
        title: `New internal message from ${message.senderName}`,
        body: `${thread.subject}: ${message.body.slice(0, 96)}${message.body.length > 96 ? '...' : ''}`,
        href: `/workspace?tab=internal-mailbox&thread=${encodeURIComponent(thread.id)}`,
        createdAt: message.createdAt,
        read: isRead(state, user.id, notificationId),
        tone: 'sky',
        metadata: {
          threadId: thread.id,
          status: message.status || 'sent',
        },
      });
    });
  });

  return notifications;
}

async function buildBillingNotifications(user: User, state: NotificationState) {
  if (user.workspaceAccessMode === 'board_room_only') return [] as WorkspaceNotification[];
  if (user.role === 'admin') return [] as WorkspaceNotification[];

  const { usage } = await getUserUsageSummary(user);
  const threshold = buildBillingThreshold(usage.thresholdPercentUsed ?? 0, usage.remainingGenerations);
  if (threshold.state === 'healthy') return [];

  const notificationId = `billing-${threshold.state}-${usage.cycleEndAt || 'current'}`;
  return [{
    id: notificationId,
    type: 'billing',
    title: threshold.state === 'limit_reached' ? 'Plan limit reached' : 'Plan usage alert',
    body: threshold.recommendation,
    href: '/workspace?tab=billing',
    createdAt: new Date().toISOString(),
    read: isRead(state, user.id, notificationId),
    tone: threshold.state === 'limit_reached' ? 'rose' : threshold.state === 'critical' ? 'amber' : 'default',
    metadata: {
      status: threshold.state,
    },
  }];
}

async function buildBoardRoomNotifications(user: User, state: NotificationState) {
  const rooms = await getVisibleDealRooms(user);
  const notifications: WorkspaceNotification[] = [];
  const now = Date.now();

  rooms.forEach((room) => {
    const userParticipant = room.participants.find((participant) => participant.userId === user.id);
    const pendingRequest = room.accessRequests.find((request) => request.userId === user.id && request.status === 'pending');
    const approvedRequest = room.accessRequests.find((request) => request.userId === user.id && request.status === 'approved');
    const ownedPendingRequests = room.accessRequests.filter((request) => request.status === 'pending');
    const assignedTasks = room.tasks.filter((task) => task.ownerId === user.id && task.status !== 'done');
    const recentParticipantNotice = room.activity.find((activity) => activity.type === 'participant_added' && activity.createdAt >= (user.lastLogin || user.createdAt));
    const lastVisibleMessage = room.messages.find((message) => {
      if (message.authorId === user.id) {
        return false;
      }
      if (message.visibility === 'internal_only' && userParticipant?.roleType === 'external' && user.role !== 'admin' && user.role !== 'client') {
        return false;
      }
      return message.createdAt >= (user.lastLogin || user.createdAt);
    });

    if (recentParticipantNotice && userParticipant) {
      const notificationId = `board-room-member-${room.id}`;
      addNotification(notifications, {
        id: notificationId,
        type: 'system',
        title: `You were added to ${room.title}`,
        body: `Open the board room to review your access and current stage.`,
        href: `/workspace?tab=deal-room`,
        createdAt: recentParticipantNotice.createdAt,
        read: isRead(state, user.id, notificationId),
        tone: 'sky',
      });
    }

    assignedTasks.forEach((task) => {
      const notificationId = `board-room-task-${task.id}`;
      addNotification(notifications, {
        id: notificationId,
        type: 'system',
        title: `Board room task: ${task.title}`,
        body: `${room.title} has an open task assigned to you${task.dueAt ? ` before ${new Date(task.dueAt).toLocaleDateString()}` : ''}.`,
        href: `/workspace?tab=deal-room`,
        createdAt: task.updatedAt,
        read: isRead(state, user.id, notificationId),
        tone: task.status === 'blocked' ? 'rose' : 'default',
      });
    });

    if (pendingRequest) {
      const notificationId = `board-room-request-${pendingRequest.id}`;
      addNotification(notifications, {
        id: notificationId,
        type: 'system',
        title: `Board room access pending`,
        body: `Your request to join ${room.title} is waiting for approval.`,
        href: `/workspace?tab=deal-room`,
        createdAt: pendingRequest.requestedAt,
        read: isRead(state, user.id, notificationId),
        tone: 'amber',
      });
    }

    if (approvedRequest) {
      const notificationId = `board-room-approved-${approvedRequest.id}`;
      addNotification(notifications, {
        id: notificationId,
        type: 'system',
        title: `Board room access approved`,
        body: `Your request to join ${room.title} was approved. Open the board room from your workspace.`,
        href: `/workspace?tab=deal-room`,
        createdAt: approvedRequest.reviewedAt || approvedRequest.requestedAt,
        read: isRead(state, user.id, notificationId),
        tone: 'emerald',
      });
    }

    if (lastVisibleMessage) {
      const notificationId = `board-room-message-${room.id}-${lastVisibleMessage.id}`;
      addNotification(notifications, {
        id: notificationId,
        type: 'system',
        title: `${room.title} has a new message`,
        body:
          lastVisibleMessage.visibility === 'internal_only'
            ? `${lastVisibleMessage.authorName} posted a secure internal board room update.`
            : `${lastVisibleMessage.authorName} posted a new board room message.`,
        href: `/workspace?tab=deal-room`,
        createdAt: lastVisibleMessage.createdAt,
        read: isRead(state, user.id, notificationId),
        tone: 'sky',
      });
    }

    if ((user.role === 'admin' || user.role === 'client' || userParticipant?.accessLevel === 'approver') && ownedPendingRequests.length > 0) {
      const latest = ownedPendingRequests[0];
      const notificationId = `board-room-owned-request-${room.id}`;
      addNotification(notifications, {
        id: notificationId,
        type: 'system',
        title: `Approval needed in ${room.title}`,
        body: `${ownedPendingRequests.length} join request${ownedPendingRequests.length > 1 ? 's are' : ' is'} waiting for your review.`,
        href: `/workspace?tab=deal-room`,
        createdAt: latest.requestedAt,
        read: isRead(state, user.id, notificationId),
        tone: 'amber',
      });
    }

    if (room.targetCloseDate) {
      const deadlineMs = new Date(room.targetCloseDate).getTime();
      const daysLeft = Math.ceil((deadlineMs - now) / (24 * 60 * 60 * 1000));
      if (daysLeft <= 5 && room.stage !== 'signed' && room.stage !== 'closed') {
        const notificationId = `board-room-deadline-${room.id}`;
        addNotification(notifications, {
          id: notificationId,
          type: 'system',
          title: `Deadline approaching for ${room.title}`,
          body: daysLeft <= 0 ? 'The target close date is due now. Move the room forward or reset the timeline.' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left to close this board room.`,
          href: `/workspace?tab=deal-room`,
          createdAt: room.updatedAt,
          read: isRead(state, user.id, notificationId),
          tone: daysLeft <= 1 ? 'rose' : 'amber',
        });
      }
    }
  });

  return notifications;
}

export async function getNotificationState(userId?: string): Promise<NotificationState> {
  const pool = getDbPool();
  if (pool && userId) {
    const result = await pool.query<{ notification_id: string }>(
      `SELECT notification_id FROM notification_reads WHERE user_id = $1`,
      [userId]
    );
    const readIds = result.rows.map((r) => r.notification_id);
    return { readMap: { [userId]: readIds } };
  }
  return readJsonFile<NotificationState>(notificationStatePath, emptyState);
}

export async function saveNotificationState(state: NotificationState) {
  await writeJsonFile(notificationStatePath, state);
}

function resolveSocialHref(e: { type: string; href?: string; actorId?: string; resourceId?: string }): string | undefined {
  if (e.href) return e.href;
  switch (e.type) {
    case 'follow':
    case 'profile_view':
      return e.actorId ? `/u/${e.actorId}` : undefined;
    case 'like':
    case 'comment':
    case 'mention':
      return e.resourceId ? `/published/${e.resourceId}` : (e.actorId ? `/u/${e.actorId}` : undefined);
    case 'gig_applied':
      return e.resourceId ? `/published/gig/${e.resourceId}` : `/workspace?tab=gigs`;
    case 'document_viewed':
      return e.resourceId ? `/documents/${e.resourceId}` : (e.actorId ? `/u/${e.actorId}` : undefined);
    default:
      return e.actorId ? `/u/${e.actorId}` : undefined;
  }
}

async function buildSocialNotifications(user: User, state: NotificationState): Promise<WorkspaceNotification[]> {
  const events = await getDeduplicatedSocialEventsForUser(user.id);
  return events.map((e) => {
    const notificationId = `social-${e.id}`;
    const toneMap: Record<string, WorkspaceNotification['tone']> = {
      follow: 'sky',
      profile_view: 'default',
      like: 'rose',
      comment: 'emerald',
      mention: 'amber',
      gig_applied: 'emerald',
      document_viewed: 'default',
    };
    const titleMap: Record<string, string> = {
      follow: `${e.actorName} followed you`,
      profile_view: `${e.actorName} viewed your profile`,
      like: `${e.actorName} liked${e.resourceTitle ? ` "${e.resourceTitle}"` : ' your post'}`,
      comment: `${e.actorName} commented${e.resourceTitle ? ` on "${e.resourceTitle}"` : ''}`,
      mention: `${e.actorName} mentioned you${e.resourceTitle ? ` in "${e.resourceTitle}"` : ''}`,
      gig_applied: `${e.actorName} applied to your gig${e.resourceTitle ? ` "${e.resourceTitle}"` : ''}`,
      document_viewed: `${e.actorName} viewed${e.resourceTitle ? ` "${e.resourceTitle}"` : ' your document'}`,
    };
    const bodyMap: Record<string, string> = {
      follow: e.actorHeadline ? e.actorHeadline : 'Check out their profile.',
      profile_view: 'Your profile is getting attention.',
      like: e.excerpt || 'They appreciated your content.',
      comment: e.excerpt || 'Tap to read their reply.',
      mention: e.excerpt || 'You were mentioned in a post.',
      gig_applied: e.excerpt || 'Review their application in Gigs.',
      document_viewed: 'Someone opened your shared document.',
    };
    return {
      id: notificationId,
      type: e.type as WorkspaceNotification['type'],
      title: titleMap[e.type] ?? `${e.actorName} interacted with you`,
      body: bodyMap[e.type] ?? '',
      href: resolveSocialHref(e),
      createdAt: e.createdAt,
      read: isRead(state, user.id, notificationId),
      tone: toneMap[e.type] ?? 'default',
      actorName: e.actorName,
      actorAvatar: e.actorAvatar,
      actorId: e.actorId,
      metadata: {
        resourceTitle: e.resourceTitle,
        excerpt: e.excerpt,
      },
    };
  });
}

export async function getWorkspaceNotifications(user: User) {
  const state = await getNotificationState(user.id);
  const [history, mailNotifications, billingNotifications, boardRoomNotifications, socialNotifications] = await Promise.all([
    getHistoryEntries(),
    buildMailboxNotifications(user, state),
    buildBillingNotifications(user, state),
    buildBoardRoomNotifications(user, state),
    buildSocialNotifications(user, state),
  ]);

  const feedbackNotifications = buildFeedbackNotifications(history, user, state);
  const all = [
    ...socialNotifications,
    ...mailNotifications,
    ...feedbackNotifications,
    ...billingNotifications,
    ...boardRoomNotifications,
  ].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  return {
    notifications: all,
    unreadCount: all.filter((entry) => !entry.read).length,
  };
}

export async function markWorkspaceNotificationsRead(userId: string, notificationIds: string[]) {
  const pool = getDbPool();
  if (pool && notificationIds.length > 0) {
    const values = notificationIds.map((_, i) => `($1, $${i + 2}, NOW())`).join(', ');
    await pool.query(
      `INSERT INTO notification_reads (user_id, notification_id, read_at) VALUES ${values} ON CONFLICT DO NOTHING`,
      [userId, ...notificationIds]
    );
    return { readMap: { [userId]: notificationIds } };
  }
  const state = await getNotificationState();
  const existing = new Set(state.readMap[userId] || []);
  notificationIds.forEach((id) => existing.add(id));
  const nextState: NotificationState = {
    ...state,
    readMap: { ...state.readMap, [userId]: Array.from(existing) },
  };
  await saveNotificationState(nextState);
  return nextState;
}
