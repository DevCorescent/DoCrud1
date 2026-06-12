import { InternalMailMessage, InternalMailThread, User } from '@/types/document';
import { internalMailboxPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { getEffectiveSaasPlanForUser } from '@/lib/server/saas';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildThreadStatus(thread: InternalMailThread): InternalMailThread['overallStatus'] {
  const lastMessage = thread.messages[thread.messages.length - 1];
  if (!lastMessage) return 'active';
  if (lastMessage.status === 'actioned') return 'actioned';
  if (lastMessage.status === 'read') return 'read';
  if (lastMessage.status === 'delivered' || lastMessage.status === 'sent') return 'awaiting_reply';
  return 'active';
}

export async function getInternalMailThreads() {
  return readJsonFile<InternalMailThread[]>(internalMailboxPath, []);
}

export async function saveInternalMailThreads(threads: InternalMailThread[]) {
  await writeJsonFile(internalMailboxPath, threads);
}

export function getMailboxOrganizationId(user: User) {
  if (user.role === 'client') return user.id;
  if (user.role === 'member' && user.organizationId) return user.organizationId;
  return null;
}

export async function getVisibleInternalMailThreads(user: User) {
  const threads = await getInternalMailThreads();
  if (user.role === 'admin') {
    return threads;
  }

  const organizationId = getMailboxOrganizationId(user);
  if (!organizationId) return [];

  return threads.filter((thread) =>
    thread.organizationId === organizationId
    && thread.participants.some((participant) => participant.email.toLowerCase() === user.email.toLowerCase()),
  );
}

export async function createInternalMailThread(
  actor: User,
  payload: { subject: string; body: string; recipients: Array<{ id: string; name: string; email: string }> },
) {
  const organizationId = getMailboxOrganizationId(actor);
  if (!organizationId) {
    throw new Error('Internal mailbox is only available inside business workspaces.');
  }

  const threads = await getInternalMailThreads();
  if (actor.role !== 'admin') {
    const plan = await getEffectiveSaasPlanForUser(actor);
    const maxMailboxThreads = plan?.maxMailboxThreads ?? 0;
    if (maxMailboxThreads > 0) {
      const cycleStart = actor.subscription?.currentPeriodStart
        ? new Date(actor.subscription.currentPeriodStart)
        : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const cycleEnd = actor.subscription?.currentPeriodEnd
        ? new Date(actor.subscription.currentPeriodEnd)
        : new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, cycleStart.getDate());
      const cycleThreads = threads.filter((thread) =>
        thread.organizationId === organizationId
        && new Date(thread.createdAt) >= cycleStart
        && new Date(thread.createdAt) <= cycleEnd,
      ).length;

      if (cycleThreads >= maxMailboxThreads) {
        throw new Error(`Your current plan allows up to ${maxMailboxThreads} internal mailbox threads in the current billing cycle. Upgrade to continue.`);
      }
    } else {
      throw new Error('Internal mailbox is not included in your current plan.');
    }
  }

  const createdAt = new Date().toISOString();
  const threadId = createId('mail-thread');
  const messageId = createId('mail-message');
  const participants = [
    { id: actor.id, name: actor.name, email: actor.email },
    ...payload.recipients.map((recipient) => ({ id: recipient.id, name: recipient.name, email: recipient.email })),
  ];
  const message: InternalMailMessage = {
    id: messageId,
    threadId,
    organizationId,
    senderId: actor.id,
    senderName: actor.name,
    senderEmail: actor.email,
    recipientIds: payload.recipients.map((recipient) => recipient.id),
    recipientEmails: payload.recipients.map((recipient) => recipient.email),
    subject: payload.subject.trim(),
    body: payload.body.trim(),
    status: 'sent',
    createdAt,
    updatedAt: createdAt,
    readBy: [actor.email.toLowerCase()],
  };

  const thread: InternalMailThread = {
    id: threadId,
    organizationId,
    subject: payload.subject.trim(),
    participants,
    messages: [message],
    createdAt,
    updatedAt: createdAt,
    lastMessagePreview: payload.body.trim().slice(0, 160),
    overallStatus: 'awaiting_reply',
    latestAiSummary: undefined,
    latestAiActionItems: [],
  };

  await saveInternalMailThreads([thread, ...threads]);
  return thread;
}

export async function replyInternalMailThread(
  actor: User,
  threadId: string,
  body: string,
) {
  const organizationId = getMailboxOrganizationId(actor);
  if (!organizationId && actor.role !== 'admin') {
    throw new Error('Internal mailbox is only available inside business workspaces.');
  }

  const threads = await getInternalMailThreads();
  const thread = threads.find((entry) => entry.id === threadId);
  if (!thread) {
    throw new Error('Mail thread not found.');
  }

  const createdAt = new Date().toISOString();
  const message: InternalMailMessage = {
    id: createId('mail-message'),
    threadId: thread.id,
    organizationId: thread.organizationId,
    senderId: actor.id,
    senderName: actor.name,
    senderEmail: actor.email,
    recipientIds: thread.participants.filter((participant) => participant.email.toLowerCase() !== actor.email.toLowerCase()).map((participant) => participant.id),
    recipientEmails: thread.participants.filter((participant) => participant.email.toLowerCase() !== actor.email.toLowerCase()).map((participant) => participant.email),
    subject: thread.subject,
    body: body.trim(),
    status: 'sent',
    createdAt,
    updatedAt: createdAt,
    readBy: [actor.email.toLowerCase()],
  };

  const nextThreads: InternalMailThread[] = threads.map((entry) => entry.id === thread.id
      ? {
        ...entry,
        updatedAt: createdAt,
        messages: [...entry.messages, message],
        lastMessagePreview: body.trim().slice(0, 160),
        overallStatus: 'awaiting_reply' as const,
      }
    : entry);

  await saveInternalMailThreads(nextThreads);
  return nextThreads.find((entry) => entry.id === thread.id) || null;
}

export async function updateInternalMailThread(
  threadId: string,
  updater: (thread: InternalMailThread) => InternalMailThread,
) {
  const threads = await getInternalMailThreads();
  const nextThreads = threads.map((thread) => thread.id === threadId ? updater(thread) : thread);
  const normalized = nextThreads.map((thread) => ({
    ...thread,
    overallStatus: buildThreadStatus(thread),
  }));
  await saveInternalMailThreads(normalized);
  return normalized.find((thread) => thread.id === threadId) || null;
}
