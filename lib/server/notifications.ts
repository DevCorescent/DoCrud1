import { DocumentHistory, User, WorkspaceNotification } from '@/types/document';
import { notificationStatePath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { getVisibleInternalMailThreads } from '@/lib/server/internal-mailbox';
import { getHistoryEntries } from '@/lib/server/history';
import { buildBillingThreshold } from '@/lib/server/billing';
import { getUserUsageSummary } from '@/lib/server/saas';
import { getVisibleDealRooms } from '@/lib/server/deal-rooms';
import { getDeduplicatedSocialEventsForUser } from '@/lib/server/social-events';
import { getUserNames } from '@/lib/server/users';
import { getProfileAvatars } from '@/lib/server/user-profiles';
import { hasInfinity } from '@/lib/server/infinity';
import { getDbPool, getMongoDb } from '@/lib/server/database';

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

async function buildBillingNotifications(
  user: User,
  state: NotificationState,
  historyPromise?: Promise<DocumentHistory[]>,
) {
  if (user.workspaceAccessMode === 'board_room_only') return [] as WorkspaceNotification[];
  if (user.role === 'admin') return [] as WorkspaceNotification[];

  // Reuse the caller's history read when there is one. Awaited only after the
  // early returns above, so admin / board-room users still fetch nothing extra.
  const { usage } = await getUserUsageSummary(user, historyPromise ? await historyPromise : undefined);
  const threshold = buildBillingThreshold(usage.thresholdPercentUsed ?? 0, usage.remainingGenerations);
  if (threshold.state === 'healthy') return [];

  /* Stable per ALERT INSTANCE.
     The old key was `billing-<state>-<cycleEndAt || 'current'>`, which had two
     failure modes: the id changed when a cycle rolled over (so a dismissed
     alert came back unread), and the literal 'current' fallback collided
     across cycles (so a genuinely new alert could arrive already-read).

     The cycle is now identified by its START, which does not move for the life
     of the cycle, and a cycle with no dates falls back to the user id rather
     than a shared constant — so two users, and two different cycles, can never
     share a key. Legacy ids are still honoured for read-state (see
     isBillingRead) so nothing the user already dismissed reappears. */
  const cycleKey = usage.cycleStartAt || usage.cycleEndAt || `nocycle-${user.id}`;
  const notificationId = `billing-${threshold.state}-${cycleKey}`;
  const legacyNotificationId = `billing-${threshold.state}-${usage.cycleEndAt || 'current'}`;
  return [{
    id: notificationId,
    type: 'billing',
    title: threshold.state === 'limit_reached' ? 'Plan limit reached' : 'Plan usage alert',
    body: threshold.recommendation,
    href: '/workspace?tab=billing',
    createdAt: new Date().toISOString(),
    // Honour the pre-fix id too, so an alert dismissed before this change
    // stays dismissed.
    read: isRead(state, user.id, notificationId) || isRead(state, user.id, legacyNotificationId),
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
  if (getDbPool() && userId) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<{ _id: string; userId: string; notificationId: string }>('notification_reads')
        .find({ userId }).toArray();
      return { readMap: { [userId]: docs.map((d) => d.notificationId) } };
    }
  }
  const state = await readJsonFile<NotificationState>(notificationStatePath, emptyState);
  /* Scope the JSON blob to the caller. Without this the whole cross-user map is
     handed back, and a later whole-file write could persist another user's
     entries from a stale snapshot. Callers only ever need their own reads. */
  if (userId) return { readMap: { [userId]: state.readMap?.[userId] ?? [] } };
  return state;
}

export async function saveNotificationState(state: NotificationState) {
  await writeJsonFile(notificationStatePath, state);
}

/* ── JSON write serialisation ──────────────────────────────────────────────
   The JSON path is read-modify-write over one file, so two concurrent
   mark-read calls could each write a snapshot taken before the other's change
   and silently drop it. Every mutation is chained onto a single in-process
   promise, so writes run one at a time and each one re-reads the current file
   first. (The Mongo path needs none of this — it uses per-id upserts.) */
let jsonWriteQueue: Promise<unknown> = Promise.resolve();

function withJsonStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = jsonWriteQueue.then(fn, fn);
  // Keep the chain alive even if one mutation rejects.
  jsonWriteQueue = run.then(() => undefined, () => undefined);
  return run;
}

function resolveSocialHref(e: { type: string; href?: string; actorId?: string; resourceId?: string }): string {
  if (e.href) return e.href;
  switch (e.type) {
    case 'follow':
    case 'profile_view':
      return e.actorId ? `/u/${e.actorId}` : '/';
    case 'like':
    case 'comment':
    case 'mention':
      return e.resourceId ? `/published/${e.resourceId}` : (e.actorId ? `/u/${e.actorId}` : '/');
    case 'gig_applied':
      return e.resourceId ? `/published/gig/${e.resourceId}` : `/workspace?tab=gigs`;
    case 'document_viewed':
      return e.resourceId ? `/documents/${e.resourceId}` : (e.actorId ? `/u/${e.actorId}` : '/');
    default:
      return e.actorId ? `/u/${e.actorId}` : '/';
  }
}

async function buildSocialNotifications(user: User, state: NotificationState): Promise<WorkspaceNotification[]> {
  const events = await getDeduplicatedSocialEventsForUser(user.id);

  // Resolve each actor's current profile avatar. Most event producers never snapshot
  // actorAvatar, and snapshots taken before a DP upload are stale — so read the live
  // profile avatar (same source the published feed uses) and keep the stored snapshot
  // only as a fallback. Users without a DP still resolve to undefined → initials avatar.
  // ONE batched, avatarUrl-projected query. Previously this was getProfileData()
  // per actor: N round trips, each pulling a whole profile document to read a
  // single field (measured: 4 extra queries on a typical notifications request).
  const actorIds = Array.from(new Set(events.map((e) => e.actorId).filter(Boolean)));

  // PRIVACY: actor identity in these notifications is a Docrud Infinity feature,
  // exactly as it is in /api/profile/activity. Without the entitlement the owner
  // sees "Someone ..." and no avatar or profile link — the identity never
  // reaches the response. Fetched alongside the avatars, so no extra latency.
  const [canSeeIdentity, avatarRows, nameRows] = await Promise.all([
    hasInfinity(user.id).catch(() => false),
    getProfileAvatars(actorIds).catch(() => new Map<string, string | null>()),
    // `actorName` is snapshotted when the event is written, so it goes stale
    // after a rename. Resolved in the same batch — no extra round trip.
    getUserNames(actorIds).catch(() => new Map<string, string>()),
  ]);
  const avatarByActorId = new Map(
    actorIds.map((id) => [id, canSeeIdentity ? avatarRows.get(id) || undefined : undefined]),
  );

  return events.map((rawEvent) => {
    // Redact before any title/href is built, so nothing downstream can leak it.
    const e = canSeeIdentity
      // Canonical name replaces the snapshot; redaction below is unchanged.
      ? { ...rawEvent, actorName: nameRows.get(rawEvent.actorId) || rawEvent.actorName }
      // actorAvatar is cleared too: identity redaction covers the PHOTO as well
      // as the name. Without this, the `|| e.actorAvatar` fallback below would
      // hand back the raw event's snapshot and leak the actor's picture next to
      // the word "Someone".
      : { ...rawEvent, actorName: 'Someone', actorId: '', actorHeadline: undefined, href: undefined, actorAvatar: undefined };
    const notificationId = `social-${rawEvent.id}`;
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
      actorAvatar: avatarByActorId.get(e.actorId) || e.actorAvatar,
      actorId: e.actorId,
      metadata: {
        resourceTitle: e.resourceTitle,
        excerpt: e.excerpt,
      },
    };
  });
}

/** Newest-first cap on what a single refresh returns. */
export const NOTIFICATION_PAGE_LIMIT = 50;

export async function getWorkspaceNotifications(user: User, limit: number = NOTIFICATION_PAGE_LIMIT) {
  // Started before the (serial) read-state fetch so the history round trip
  // overlaps it instead of queueing behind it, and shared with the billing
  // builder — getUserUsageSummary() used to issue a SECOND identical
  // getHistoryEntries() call, so the same collection was read twice per request.
  const historyPromise = getHistoryEntries();

  const state = await getNotificationState(user.id);
  const [history, mailNotifications, billingNotifications, boardRoomNotifications, socialNotifications] = await Promise.all([
    historyPromise,
    buildMailboxNotifications(user, state),
    buildBillingNotifications(user, state, historyPromise),
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

  /* `unreadCount` is counted over the WHOLE set before truncation, so the bell
     badge stays correct even when more notifications exist than are returned.
     `total`/`hasMore` are additive — existing clients that read only
     `notifications` and `unreadCount` are unaffected. */
  const unreadCount = all.filter((entry) => !entry.read).length;
  const capped = Number.isFinite(limit) && limit > 0 ? all.slice(0, limit) : all;

  return {
    notifications: capped,
    unreadCount,
    total: all.length,
    hasMore: capped.length < all.length,
  };
}

/**
 * Conservative read-state pruning.
 *
 * Read records accumulate one entry per (user, notification) forever, including
 * for notifications that no longer exist. This drops only entries whose
 * notification is NOT in the caller's current live set — so anything still on
 * screen keeps its read flag and nothing becomes unread again.
 *
 * Deliberately conservative:
 *  • runs only when the list has grown past PRUNE_THRESHOLD, not on every read;
 *  • needs a non-empty live set, so a transient failure that yields zero
 *    notifications can never wipe the user's history;
 *  • best-effort — a failure here must never break loading notifications.
 */
const PRUNE_THRESHOLD = 500;

export async function pruneNotificationReadState(userId: string, liveIds: string[]): Promise<number> {
  if (!userId || liveIds.length === 0) return 0;
  const live = new Set(liveIds);

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const col = db.collection<{ _id: string; userId: string; notificationId: string }>('notification_reads');
      const docs = await col.find({ userId }).toArray();
      if (docs.length <= PRUNE_THRESHOLD) return 0;
      const dead = docs.filter((d) => !live.has(d.notificationId)).map((d) => d._id);
      if (!dead.length) return 0;
      await col.deleteMany({ _id: { $in: dead } });
      return dead.length;
    }
  }

  return withJsonStateLock(async () => {
    const current = await readJsonFile<NotificationState>(notificationStatePath, emptyState);
    const ids = current.readMap?.[userId] ?? [];
    if (ids.length <= PRUNE_THRESHOLD) return 0;
    const kept = ids.filter((id) => live.has(id));
    if (kept.length === ids.length) return 0;
    await saveNotificationState({
      ...current,
      readMap: { ...current.readMap, [userId]: kept },
    });
    return ids.length - kept.length;
  });
}

export async function markWorkspaceNotificationsRead(userId: string, notificationIds: string[]) {
  if (getDbPool() && notificationIds.length > 0) {
    const db = await getMongoDb();
    if (db) {
      const col = db.collection('notification_reads');
      await (col as any).bulkWrite(
        notificationIds.map((notificationId) => ({
          replaceOne: {
            filter: { _id: `${userId}_${notificationId}` },
            replacement: { _id: `${userId}_${notificationId}`, userId, notificationId, readAt: new Date().toISOString() },
            upsert: true,
          },
        })),
      );
      return { readMap: { [userId]: notificationIds } };
    }
  }
  /* Serialised, and re-reads the FULL file inside the lock so other users'
     entries are preserved while only this user's list is modified. */
  return withJsonStateLock(async () => {
    const current = await readJsonFile<NotificationState>(notificationStatePath, emptyState);
    const existing = new Set(current.readMap?.[userId] || []);
    notificationIds.forEach((id) => existing.add(id));
    const nextState: NotificationState = {
      ...current,
      readMap: { ...current.readMap, [userId]: Array.from(existing) },
    };
    await saveNotificationState(nextState);
    return nextState;
  });
}
