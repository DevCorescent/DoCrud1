import crypto from 'crypto';
import { readJsonFile, writeJsonFile, messagesPath, followsPath } from '@/lib/server/storage';
import { getDbPool, getMongoDb } from '@/lib/server/database';

export interface ReplyTo {
  id: string;
  content: string;
  senderId: string;
  type: 'text' | 'image' | 'file';
  attachmentName?: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: 'text' | 'image' | 'file';
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
  attachmentMimeType?: string;
  sentAt: string;
  seenBy: string[];
  replyTo?: ReplyTo;
  edited?: boolean;
  editedAt?: string;
  deleted?: boolean;
  deletedAt?: string;
}

export interface Conversation {
  id: string;
  participants: string[];
  status: 'active' | 'request' | 'rejected';
  requestFrom?: string;
  source?: 'service';
  createdAt: string;
  updatedAt: string;
  lastMessage?: {
    content: string;
    senderId: string;
    sentAt: string;
    type: string;
  };
  unreadCount: Record<string, number>;
}

export interface ChatMeta {
  label?: string;
  labelColor?: string;
  bgColor?: string;
  notes?: string;
  pinnedAt?: string;
}

export interface AutoReplySettings {
  enabled: boolean;
  message: string;
  cooldownMinutes: number;
  lastSentAt: Record<string, string>;
}

export interface QuickReply {
  id: string;
  title: string;
  content: string;
}

export interface BusinessTool {
  id: string;
  label: string;
  value: string;
  extra?: string;
}

export interface BusinessProfile {
  catalogues: BusinessTool[];
  meetings: BusinessTool[];
  payments: BusinessTool[];
  contacts: BusinessTool[];
}

interface MessagesData {
  conversations: Record<string, Conversation>;
  messages: Record<string, Message[]>;
  typingStatus: Record<string, Record<string, number>>;
  messageIndex: Record<string, Record<string, string[]>>;
  chatMeta: Record<string, Record<string, ChatMeta>>;
  autoReply: Record<string, AutoReplySettings>;
  quickReplies: Record<string, QuickReply[]>;
  businessProfiles: Record<string, BusinessProfile>;
}

type ConvDoc = Conversation & { _id: string };
type MsgDoc = Message & { _id: string };

function stripConv({ _id: _u, ...rest }: ConvDoc): Conversation { return rest; }
function stripMsg({ _id: _u, ...rest }: MsgDoc): Message { return rest; }

// ── JSON fallback helpers ─────────────────────────────────────────────────────

async function getData(): Promise<MessagesData> {
  return readJsonFile<MessagesData>(messagesPath, {
    conversations: {},
    messages: {},
    typingStatus: {},
    messageIndex: {},
    chatMeta: {},
    autoReply: {},
    quickReplies: {},
    businessProfiles: {},
  });
}

async function saveData(data: MessagesData): Promise<void> {
  await writeJsonFile(messagesPath, data);
}

async function areMutualFollowers(userA: string, userB: string): Promise<boolean> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const followId = `${userA}_${userB}`;
      const reverseId = `${userB}_${userA}`;
      const count = await db.collection('user_follows').countDocuments({ _id: { $in: [followId, reverseId] } as any });
      return count === 2;
    }
  }
  const follows = await readJsonFile<Record<string, string[]>>(followsPath, {});
  const aFollowsB = (follows[userA] ?? []).includes(userB);
  const bFollowsA = (follows[userB] ?? []).includes(userA);
  return aFollowsB && bFollowsA;
}

// ── Conversations ─────────────────────────────────────────────────────────────

export async function getOrCreateConversation(
  fromUserId: string,
  toUserId: string,
  source?: 'service',
): Promise<{ conversation: Conversation; created: boolean }> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const existing = await db.collection<ConvDoc>('conversations').findOne({
        participants: { $all: [fromUserId, toUserId], $size: 2 },
      });
      if (existing) {
        const conv = stripConv(existing);
        if (source === 'service' && !conv.source) {
          await db.collection('conversations').updateOne({ _id: existing._id as any }, { $set: { source: 'service', updatedAt: new Date().toISOString() } });
          conv.source = 'service';
        }
        return { conversation: conv, created: false };
      }

      const mutual = await areMutualFollowers(fromUserId, toUserId);
      const status: Conversation['status'] = mutual ? 'active' : 'request';
      const id = `conv_${crypto.randomBytes(8).toString('hex')}`;
      const now = new Date().toISOString();
      const conversation: Conversation = {
        id, participants: [fromUserId, toUserId], status,
        requestFrom: mutual ? undefined : fromUserId,
        source, createdAt: now, updatedAt: now,
        unreadCount: { [fromUserId]: 0, [toUserId]: 0 },
      };
      await db.collection<ConvDoc>('conversations').insertOne({ ...conversation, _id: id });
      return { conversation, created: true };
    }
  }

  const data = await getData();
  const existing = Object.values(data.conversations).find(
    (c) => c.participants.includes(fromUserId) && c.participants.includes(toUserId) && c.participants.length === 2,
  );
  if (existing) {
    if (source === 'service' && !existing.source) {
      existing.source = 'service';
      data.conversations[existing.id] = existing;
      await saveData(data);
    }
    return { conversation: existing, created: false };
  }

  const mutual = await areMutualFollowers(fromUserId, toUserId);
  const status: Conversation['status'] = mutual ? 'active' : 'request';
  const id = `conv_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id, participants: [fromUserId, toUserId], status,
    requestFrom: mutual ? undefined : fromUserId,
    ...(source ? { source } : {}),
    createdAt: now, updatedAt: now,
    unreadCount: { [fromUserId]: 0, [toUserId]: 0 },
  };
  data.conversations[id] = conversation;
  data.messages[id] = [];
  await saveData(data);
  return { conversation, created: true };
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string,
  type: Message['type'] = 'text',
  attachment?: Pick<Message, 'attachmentUrl' | 'attachmentName' | 'attachmentSize' | 'attachmentMimeType'>,
  replyTo?: ReplyTo,
): Promise<Message> {
  const id = `msg_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const convDoc = await db.collection<ConvDoc>('conversations').findOne({ _id: conversationId });
      if (!convDoc) throw new Error('Conversation not found');
      const conv = stripConv(convDoc);

      const message: Message = {
        id, conversationId, senderId, content, type, ...attachment,
        sentAt: now, seenBy: [senderId], ...(replyTo ? { replyTo } : {}),
      };
      await db.collection<MsgDoc>('messages').insertOne({ ...message, _id: id });

      const displayContent = type === 'image' ? '📷 Image' : type === 'file' ? `📎 ${attachment?.attachmentName ?? 'File'}` : content;
      const newUnread = { ...conv.unreadCount };
      for (const p of conv.participants) {
        if (p !== senderId) newUnread[p] = (newUnread[p] ?? 0) + 1;
      }
      await db.collection('conversations').updateOne(
        { _id: conversationId as any },
        { $set: { lastMessage: { content: displayContent, senderId, sentAt: now, type }, unreadCount: newUnread, updatedAt: now } },
      );
      return message;
    }
  }

  const data = await getData();
  const conv = data.conversations[conversationId];
  if (!conv) throw new Error('Conversation not found');

  const message: Message = {
    id, conversationId, senderId, content, type, ...attachment,
    sentAt: now, seenBy: [senderId], ...(replyTo ? { replyTo } : {}),
  };
  if (!data.messages[conversationId]) data.messages[conversationId] = [];
  data.messages[conversationId].push(message);

  const displayContent = type === 'image' ? '📷 Image' : type === 'file' ? `📎 ${attachment?.attachmentName ?? 'File'}` : content;
  data.conversations[conversationId].lastMessage = { content: displayContent, senderId, sentAt: now, type };
  data.conversations[conversationId].updatedAt = now;
  for (const p of conv.participants) {
    if (p !== senderId) data.conversations[conversationId].unreadCount[p] = (data.conversations[conversationId].unreadCount[p] ?? 0) + 1;
  }
  await saveData(data);
  return message;
}

export async function getConversations(userId: string): Promise<Conversation[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<ConvDoc>('conversations')
        .find({ participants: userId }).sort({ updatedAt: -1 }).toArray();
      return docs.map(stripConv);
    }
  }
  const data = await getData();
  return Object.values(data.conversations)
    .filter((c) => c.participants.includes(userId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<MsgDoc>('messages')
        .find({ conversationId, deleted: { $ne: true } }).sort({ sentAt: 1 }).toArray();
      return docs.map(stripMsg);
    }
  }
  const data = await getData();
  return (data.messages[conversationId] ?? []).filter((m) => !m.deleted);
}

export async function markAsRead(conversationId: string, userId: string): Promise<void> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection('messages').updateMany(
        { conversationId, deleted: { $ne: true } },
        { $addToSet: { seenBy: userId } },
      );
      const convDoc = await db.collection<ConvDoc>('conversations').findOne({ _id: conversationId });
      if (convDoc) {
        const unread = { ...convDoc.unreadCount };
        unread[userId] = 0;
        await db.collection('conversations').updateOne({ _id: conversationId as any }, { $set: { unreadCount: unread } });
      }
      return;
    }
  }
  const data = await getData();
  if (!data.conversations[conversationId]) return;
  if (data.messages[conversationId]) {
    data.messages[conversationId] = data.messages[conversationId].map((m) =>
      m.seenBy.includes(userId) ? m : { ...m, seenBy: [...m.seenBy, userId] },
    );
  }
  data.conversations[conversationId].unreadCount[userId] = 0;
  await saveData(data);
}

export async function setTyping(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
  const data = await getData();
  if (!data.typingStatus) data.typingStatus = {};
  if (!data.typingStatus[conversationId]) data.typingStatus[conversationId] = {};
  if (isTyping) {
    data.typingStatus[conversationId][userId] = Date.now();
  } else {
    delete data.typingStatus[conversationId][userId];
  }
  await saveData(data);
}

export async function getTypingUsers(conversationId: string, excludeUserId: string): Promise<string[]> {
  const data = await getData();
  const typingData = data.typingStatus?.[conversationId] ?? {};
  const cutoff = Date.now() - 4000;
  return Object.entries(typingData)
    .filter(([uid, ts]) => uid !== excludeUserId && ts > cutoff)
    .map(([uid]) => uid);
}

export async function acceptRequest(conversationId: string, userId: string): Promise<void> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<ConvDoc>('conversations').findOne({ _id: conversationId });
      if (!doc) throw new Error('Conversation not found');
      if (!doc.participants.includes(userId)) throw new Error('Not a participant');
      await db.collection('conversations').updateOne({ _id: conversationId as any }, { $set: { status: 'active', requestFrom: null, updatedAt: new Date().toISOString() } });
      return;
    }
  }
  const data = await getData();
  const conv = data.conversations[conversationId];
  if (!conv) throw new Error('Conversation not found');
  if (!conv.participants.includes(userId)) throw new Error('Not a participant');
  conv.status = 'active';
  conv.requestFrom = undefined;
  await saveData(data);
}

export async function rejectRequest(conversationId: string, userId: string): Promise<void> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<ConvDoc>('conversations').findOne({ _id: conversationId });
      if (!doc) throw new Error('Conversation not found');
      if (!doc.participants.includes(userId)) throw new Error('Not a participant');
      await db.collection('conversations').updateOne({ _id: conversationId as any }, { $set: { status: 'rejected', updatedAt: new Date().toISOString() } });
      return;
    }
  }
  const data = await getData();
  const conv = data.conversations[conversationId];
  if (!conv) throw new Error('Conversation not found');
  if (!conv.participants.includes(userId)) throw new Error('Not a participant');
  conv.status = 'rejected';
  await saveData(data);
}

export async function getPollData(
  userId: string,
  conversationId: string,
  since: number,
): Promise<{ newMessages: Message[]; typingUsers: string[]; conversations: Conversation[]; deletedMessageIds: string[] }> {
  const sinceIso = new Date(since).toISOString();

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const [newMsgDocs, deletedDocs, convDocs] = await Promise.all([
        db.collection<MsgDoc>('messages')
          .find({ conversationId, sentAt: { $gt: sinceIso }, deleted: { $ne: true } })
          .sort({ sentAt: 1 }).toArray(),
        db.collection<MsgDoc>('messages')
          .find({ conversationId, deleted: true, deletedAt: { $gt: sinceIso } })
          .project({ _id: 1 }).toArray(),
        db.collection<ConvDoc>('conversations')
          .find({ participants: userId }).sort({ updatedAt: -1 }).toArray(),
      ]);

      const cutoff = Date.now() - 4000;
      const fileData = await getData();
      const typingData = fileData.typingStatus?.[conversationId] ?? {};
      const typingUsers = Object.entries(typingData)
        .filter(([uid, ts]) => uid !== userId && ts > cutoff)
        .map(([uid]) => uid);

      return {
        newMessages: newMsgDocs.map(stripMsg),
        deletedMessageIds: deletedDocs.map((d) => d._id),
        conversations: convDocs.map(stripConv),
        typingUsers,
      };
    }
  }

  const data = await getData();
  const newMessages = (data.messages[conversationId] ?? []).filter((m) => new Date(m.sentAt).getTime() > since && !m.deleted);
  const deletedMessageIds = (data.messages[conversationId] ?? [])
    .filter((m) => m.deleted && m.deletedAt && new Date(m.deletedAt).getTime() > since)
    .map((m) => m.id);
  const cutoff = Date.now() - 4000;
  const typingData = data.typingStatus?.[conversationId] ?? {};
  const typingUsers = Object.entries(typingData)
    .filter(([uid, ts]) => uid !== userId && ts > cutoff)
    .map(([uid]) => uid);
  const conversations = Object.values(data.conversations)
    .filter((c) => c.participants.includes(userId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return { newMessages, typingUsers, conversations, deletedMessageIds };
}

export async function getTotalUnread(userId: string): Promise<number> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const convs = await db.collection<ConvDoc>('conversations')
        .find({ participants: userId, status: 'active' }).toArray();
      return convs.reduce((sum, c) => sum + (c.unreadCount?.[userId] ?? 0), 0);
    }
  }
  const data = await getData();
  return Object.values(data.conversations)
    .filter((c) => c.participants.includes(userId) && c.status === 'active')
    .reduce((sum, c) => sum + (c.unreadCount[userId] ?? 0), 0);
}

export async function getMessageRequests(userId: string): Promise<Conversation[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<ConvDoc>('conversations')
        .find({ participants: userId, status: 'request', requestFrom: { $ne: userId } }).toArray();
      return docs.map(stripConv);
    }
  }
  const data = await getData();
  return Object.values(data.conversations).filter(
    (c) => c.participants.includes(userId) && c.status === 'request' && c.requestFrom !== userId,
  );
}

export async function toggleMessageIndex(conversationId: string, messageId: string, userId: string): Promise<{ indexed: boolean }> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docId = `${userId}_${conversationId}_${messageId}`;
      const existing = await db.collection('message_bookmarks').findOne({ _id: docId as any });
      if (existing) {
        await db.collection('message_bookmarks').deleteOne({ _id: docId as any });
        return { indexed: false };
      }
      await db.collection('message_bookmarks').insertOne({ _id: docId as any, userId, conversationId, messageId });
      return { indexed: true };
    }
  }
  const data = await getData();
  if (!data.messageIndex) data.messageIndex = {};
  if (!data.messageIndex[userId]) data.messageIndex[userId] = {};
  if (!data.messageIndex[userId][conversationId]) data.messageIndex[userId][conversationId] = [];
  const arr = data.messageIndex[userId][conversationId];
  const pos = arr.indexOf(messageId);
  if (pos === -1) { arr.push(messageId); await saveData(data); return { indexed: true }; }
  arr.splice(pos, 1); await saveData(data); return { indexed: false };
}

export async function getMessageIndex(conversationId: string, userId: string): Promise<string[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<{ _id: string; messageId: string }>('message_bookmarks')
        .find({ userId, conversationId }).toArray();
      return docs.map((d) => d.messageId);
    }
  }
  const data = await getData();
  return data.messageIndex?.[userId]?.[conversationId] ?? [];
}

export async function getChatMeta(conversationId: string, userId: string): Promise<ChatMeta> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<ChatMeta & { _id: string }>('conversation_meta')
        .findOne({ _id: `${userId}_${conversationId}` });
      if (!doc) return {};
      const { _id: _u, ...rest } = doc;
      return rest;
    }
  }
  const data = await getData();
  return data.chatMeta?.[userId]?.[conversationId] ?? {};
}

export async function setChatMeta(conversationId: string, userId: string, patch: Partial<ChatMeta>): Promise<ChatMeta> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docId = `${userId}_${conversationId}`;
      const existing = await getChatMeta(conversationId, userId);
      const updated: ChatMeta = { ...existing, ...patch };
      await db.collection('conversation_meta').replaceOne(
        { _id: docId as any },
        { ...updated, _id: docId as any },
        { upsert: true },
      );
      return updated;
    }
  }
  const data = await getData();
  if (!data.chatMeta) data.chatMeta = {};
  if (!data.chatMeta[userId]) data.chatMeta[userId] = {};
  const existing = data.chatMeta[userId][conversationId] ?? {};
  const updated: ChatMeta = { ...existing, ...patch };
  data.chatMeta[userId][conversationId] = updated;
  await saveData(data);
  return updated;
}

export async function getAllChatMeta(userId: string): Promise<Record<string, ChatMeta>> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<ChatMeta & { _id: string; conversationId?: string }>('conversation_meta')
        .find({ _id: new RegExp(`^${userId}_`) }).toArray();
      const out: Record<string, ChatMeta> = {};
      for (const doc of docs) {
        const convId = doc._id.slice(userId.length + 1);
        const { _id: _u, conversationId: _cv, ...rest } = doc;
        out[convId] = rest;
      }
      return out;
    }
  }
  const data = await getData();
  return data.chatMeta?.[userId] ?? {};
}

/* ── Auto-reply ──────────────────────────────────────────────────────────────*/

const DEFAULT_AUTO_REPLY: AutoReplySettings = {
  enabled: false,
  message: "Thanks for your message! I'm currently unavailable but will get back to you as soon as possible.",
  cooldownMinutes: 30,
  lastSentAt: {},
};

export async function getAutoReply(userId: string): Promise<AutoReplySettings> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<AutoReplySettings & { _id: string }>('auto_reply_settings').findOne({ _id: userId });
      if (!doc) return { ...DEFAULT_AUTO_REPLY };
      const { _id: _u, ...rest } = doc;
      return rest;
    }
  }
  const data = await getData();
  return data.autoReply?.[userId] ?? { ...DEFAULT_AUTO_REPLY };
}

export async function setAutoReply(userId: string, patch: Partial<Omit<AutoReplySettings, 'lastSentAt'>>): Promise<AutoReplySettings> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const existing = await getAutoReply(userId);
      const updated: AutoReplySettings = { ...existing, ...patch };
      await db.collection('auto_reply_settings').replaceOne({ _id: userId as any }, { ...updated, _id: userId as any }, { upsert: true });
      return updated;
    }
  }
  const data = await getData();
  if (!data.autoReply) data.autoReply = {};
  const existing = data.autoReply[userId] ?? { ...DEFAULT_AUTO_REPLY };
  const updated: AutoReplySettings = { ...existing, ...patch };
  data.autoReply[userId] = updated;
  await saveData(data);
  return updated;
}

export async function triggerAutoReply(conversationId: string, recipientId: string, triggeredByUserId: string): Promise<void> {
  const settings = await getAutoReply(recipientId);
  if (!settings?.enabled || !settings.message?.trim()) return;

  const lastSent = settings.lastSentAt?.[conversationId];
  if (lastSent) {
    const elapsed = (Date.now() - new Date(lastSent).getTime()) / 60000;
    if (elapsed < (settings.cooldownMinutes ?? 30)) return;
  }
  if (recipientId === triggeredByUserId) return;

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const convDoc = await db.collection<ConvDoc>('conversations').findOne({ _id: conversationId });
      if (!convDoc || convDoc.status !== 'active') return;
    }
  } else {
    const data = await getData();
    const conv = data.conversations[conversationId];
    if (!conv || conv.status !== 'active') return;
  }

  const now = new Date().toISOString();
  await sendMessage(conversationId, recipientId, settings.message, 'text');

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<AutoReplySettings & { _id: string }>('auto_reply_settings').findOne({ _id: recipientId });
      const lastSentAt = { ...(doc?.lastSentAt ?? {}), [conversationId]: now };
      await db.collection('auto_reply_settings').updateOne({ _id: recipientId as any }, { $set: { lastSentAt } });
    }
  } else {
    const data = await getData();
    if (!data.autoReply[recipientId].lastSentAt) data.autoReply[recipientId].lastSentAt = {};
    data.autoReply[recipientId].lastSentAt[conversationId] = now;
    await saveData(data);
  }
}

/* ── Quick Replies ───────────────────────────────────────────────────────────*/

export async function getQuickReplies(userId: string): Promise<QuickReply[]> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection<QuickReply & { _id: string; userId: string }>('quick_replies')
        .find({ userId }).sort({ createdAt: 1 }).toArray();
      return docs.map(({ _id: _u, userId: _uid, ...rest }) => rest as QuickReply);
    }
  }
  const data = await getData();
  return data.quickReplies?.[userId] ?? [];
}

export async function addQuickReply(userId: string, title: string, content: string): Promise<QuickReply> {
  const qr: QuickReply = { id: `qr_${crypto.randomBytes(6).toString('hex')}`, title: title.trim(), content: content.trim() };
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection('quick_replies').insertOne({ ...qr, _id: qr.id as any, userId, createdAt: new Date().toISOString() });
      return qr;
    }
  }
  const data = await getData();
  if (!data.quickReplies) data.quickReplies = {};
  if (!data.quickReplies[userId]) data.quickReplies[userId] = [];
  data.quickReplies[userId].push(qr);
  await saveData(data);
  return qr;
}

export async function deleteQuickReply(userId: string, id: string): Promise<void> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection('quick_replies').deleteOne({ _id: id as any, userId });
      return;
    }
  }
  const data = await getData();
  if (!data.quickReplies?.[userId]) return;
  data.quickReplies[userId] = data.quickReplies[userId].filter((q) => q.id !== id);
  await saveData(data);
}

export async function updateQuickReply(userId: string, id: string, title: string, content: string): Promise<void> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection('quick_replies').updateOne({ _id: id as any, userId }, { $set: { title: title.trim(), content: content.trim() } });
      return;
    }
  }
  const data = await getData();
  if (!data.quickReplies?.[userId]) return;
  const qr = data.quickReplies[userId].find((q) => q.id === id);
  if (qr) { qr.title = title.trim(); qr.content = content.trim(); }
  await saveData(data);
}

/* ── Business Profile ────────────────────────────────────────────────────────*/

const EMPTY_PROFILE: BusinessProfile = { catalogues: [], meetings: [], payments: [], contacts: [] };

export async function getBusinessProfile(userId: string): Promise<BusinessProfile> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<{ _id: string; profile: BusinessProfile }>('business_profiles').findOne({ _id: userId });
      return doc?.profile ?? { ...EMPTY_PROFILE };
    }
  }
  const data = await getData();
  return data.businessProfiles?.[userId] ?? { ...EMPTY_PROFILE };
}

export async function setBusinessProfile(userId: string, profile: BusinessProfile): Promise<BusinessProfile> {
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      await db.collection('business_profiles').replaceOne(
        { _id: userId as any },
        { _id: userId as any, profile, updatedAt: new Date().toISOString() },
        { upsert: true },
      );
      return profile;
    }
  }
  const data = await getData();
  if (!data.businessProfiles) data.businessProfiles = {};
  data.businessProfiles[userId] = profile;
  await saveData(data);
  return profile;
}

export async function deleteMessage(conversationId: string, messageId: string, userId: string): Promise<void> {
  const now = new Date().toISOString();
  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const doc = await db.collection<MsgDoc>('messages').findOne({ _id: messageId, conversationId });
      if (!doc) throw new Error('Message not found');
      if (doc.senderId !== userId) throw new Error('Not your message');
      await db.collection('messages').updateOne({ _id: messageId as any }, { $set: { deleted: true, deletedAt: now } });
      return;
    }
  }
  const data = await getData();
  const msgs = data.messages[conversationId];
  if (!msgs) throw new Error('Conversation not found');
  const msg = msgs.find((m) => m.id === messageId);
  if (!msg) throw new Error('Message not found');
  if (msg.senderId !== userId) throw new Error('Not your message');
  msg.deleted = true;
  msg.deletedAt = now;
  await saveData(data);
}
