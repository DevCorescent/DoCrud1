import crypto from 'crypto';
import { readJsonFile, writeJsonFile, messagesPath, followsPath } from '@/lib/server/storage';
import { getDbPool } from '@/lib/server/database';

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function rowToConversation(row: Record<string, unknown>): Conversation {
  return {
    id: row.id as string,
    participants: row.participants as string[],
    status: row.status as Conversation['status'],
    requestFrom: (row.request_from as string | null) ?? undefined,
    source: (row.source as 'service' | null) ?? undefined,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    lastMessage: (row.last_message as Conversation['lastMessage']) ?? undefined,
    unreadCount: (row.unread_count as Record<string, number>) ?? {},
  };
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: row.id as string,
    conversationId: row.conversation_id as string,
    senderId: row.sender_id as string,
    content: row.content as string,
    type: row.type as Message['type'],
    attachmentUrl: (row.attachment_url as string | null) ?? undefined,
    attachmentName: (row.attachment_name as string | null) ?? undefined,
    attachmentSize: (row.attachment_size as number | null) ?? undefined,
    attachmentMimeType: (row.attachment_mime_type as string | null) ?? undefined,
    sentAt: (row.sent_at as Date).toISOString(),
    seenBy: (row.seen_by as string[]) ?? [],
    replyTo: (row.reply_to as ReplyTo | null) ?? undefined,
    edited: (row.edited as boolean) ?? false,
    editedAt: row.edited_at ? (row.edited_at as Date).toISOString() : undefined,
    deleted: (row.deleted as boolean) ?? false,
    deletedAt: row.deleted_at ? (row.deleted_at as Date).toISOString() : undefined,
  };
}

// ── JSON fallback ─────────────────────────────────────────────────────────────

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
  const follows = await readJsonFile<Record<string, string[]>>(followsPath, {});
  const aFollowsB = (follows[userA] ?? []).includes(userB);
  const bFollowsA = (follows[userB] ?? []).includes(userA);
  return aFollowsB && bFollowsA;
}

// ── Core conversation & message functions (DB-first, JSON fallback) ───────────

export async function getOrCreateConversation(
  fromUserId: string,
  toUserId: string,
  source?: 'service'
): Promise<{ conversation: Conversation; created: boolean }> {
  const pool = getDbPool();

  if (pool) {
    // Check existing
    const existing = await pool.query<Record<string, unknown>>(
      `SELECT * FROM conversations WHERE participants @> $1::jsonb AND participants @> $2::jsonb AND jsonb_array_length(participants) = 2 LIMIT 1`,
      [JSON.stringify([fromUserId]), JSON.stringify([toUserId])]
    );
    if (existing.rows[0]) {
      const conv = rowToConversation(existing.rows[0]);
      if (source === 'service' && !conv.source) {
        await pool.query(`UPDATE conversations SET source = 'service', updated_at = NOW() WHERE id = $1`, [conv.id]);
        conv.source = 'service';
      }
      return { conversation: conv, created: false };
    }

    const mutual = await areMutualFollowers(fromUserId, toUserId);
    const status: Conversation['status'] = mutual ? 'active' : 'request';
    const id = `conv_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();
    const unreadCount = { [fromUserId]: 0, [toUserId]: 0 };

    await pool.query(
      `INSERT INTO conversations (id, participants, status, request_from, source, unread_count, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6::jsonb, $7, $7)`,
      [id, JSON.stringify([fromUserId, toUserId]), status, mutual ? null : fromUserId, source ?? null, JSON.stringify(unreadCount), now]
    );

    const conversation: Conversation = {
      id, participants: [fromUserId, toUserId], status,
      requestFrom: mutual ? undefined : fromUserId,
      source, createdAt: now, updatedAt: now, unreadCount,
    };
    return { conversation, created: true };
  }

  // JSON fallback
  const data = await getData();
  const existing = Object.values(data.conversations).find(
    (c) => c.participants.includes(fromUserId) && c.participants.includes(toUserId) && c.participants.length === 2
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
  replyTo?: ReplyTo
): Promise<Message> {
  const pool = getDbPool();
  const id = `msg_${crypto.randomBytes(8).toString('hex')}`;
  const now = new Date().toISOString();

  if (pool) {
    const convRow = await pool.query<Record<string, unknown>>(`SELECT * FROM conversations WHERE id = $1`, [conversationId]);
    if (!convRow.rows[0]) throw new Error('Conversation not found');
    const conv = rowToConversation(convRow.rows[0]);

    await pool.query(
      `INSERT INTO messages (id, conversation_id, sender_id, content, type, attachment_url, attachment_name, attachment_size, attachment_mime_type, reply_to, seen_by, sent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12)`,
      [id, conversationId, senderId, content, type,
        attachment?.attachmentUrl ?? null, attachment?.attachmentName ?? null,
        attachment?.attachmentSize ?? null, attachment?.attachmentMimeType ?? null,
        replyTo ? JSON.stringify(replyTo) : null,
        JSON.stringify([senderId]), now]
    );

    const displayContent = type === 'image' ? '📷 Image' : type === 'file' ? `📎 ${attachment?.attachmentName ?? 'File'}` : content;
    const newUnread = { ...conv.unreadCount };
    for (const p of conv.participants) {
      if (p !== senderId) newUnread[p] = (newUnread[p] ?? 0) + 1;
    }
    await pool.query(
      `UPDATE conversations SET last_message = $1::jsonb, unread_count = $2::jsonb, updated_at = $3 WHERE id = $4`,
      [JSON.stringify({ content: displayContent, senderId, sentAt: now, type }), JSON.stringify(newUnread), now, conversationId]
    );

    return { id, conversationId, senderId, content, type, ...attachment, sentAt: now, seenBy: [senderId], ...(replyTo ? { replyTo } : {}) };
  }

  // JSON fallback
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
    if (p !== senderId) {
      data.conversations[conversationId].unreadCount[p] = (data.conversations[conversationId].unreadCount[p] ?? 0) + 1;
    }
  }
  await saveData(data);
  return message;
}

export async function getConversations(userId: string): Promise<Conversation[]> {
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM conversations WHERE participants @> $1::jsonb ORDER BY updated_at DESC`,
      [JSON.stringify([userId])]
    );
    return result.rows.map(rowToConversation);
  }
  const data = await getData();
  return Object.values(data.conversations)
    .filter((c) => c.participants.includes(userId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM messages WHERE conversation_id = $1 AND deleted = FALSE ORDER BY sent_at ASC`,
      [conversationId]
    );
    return result.rows.map(rowToMessage);
  }
  const data = await getData();
  return (data.messages[conversationId] ?? []).filter((m) => !m.deleted);
}

export async function markAsRead(conversationId: string, userId: string): Promise<void> {
  const pool = getDbPool();
  if (pool) {
    await pool.query(
      `UPDATE messages SET seen_by = (
         CASE WHEN seen_by @> $1::jsonb THEN seen_by ELSE seen_by || $1::jsonb END
       ) WHERE conversation_id = $2 AND deleted = FALSE`,
      [JSON.stringify([userId]), conversationId]
    );
    const convRow = await pool.query<Record<string, unknown>>(`SELECT unread_count FROM conversations WHERE id = $1`, [conversationId]);
    if (convRow.rows[0]) {
      const unread = (convRow.rows[0].unread_count as Record<string, number>) ?? {};
      unread[userId] = 0;
      await pool.query(`UPDATE conversations SET unread_count = $1::jsonb WHERE id = $2`, [JSON.stringify(unread), conversationId]);
    }
    return;
  }
  const data = await getData();
  if (!data.conversations[conversationId]) return;
  if (data.messages[conversationId]) {
    data.messages[conversationId] = data.messages[conversationId].map((m) =>
      m.seenBy.includes(userId) ? m : { ...m, seenBy: [...m.seenBy, userId] }
    );
  }
  data.conversations[conversationId].unreadCount[userId] = 0;
  await saveData(data);
}

export async function setTyping(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
  // Typing state is ephemeral — always use in-memory JSON file (short-lived, not worth a DB round-trip)
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
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<Record<string, unknown>>(`SELECT participants FROM conversations WHERE id = $1`, [conversationId]);
    if (!result.rows[0]) throw new Error('Conversation not found');
    const participants = result.rows[0].participants as string[];
    if (!participants.includes(userId)) throw new Error('Not a participant');
    await pool.query(`UPDATE conversations SET status = 'active', request_from = NULL, updated_at = NOW() WHERE id = $1`, [conversationId]);
    return;
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
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<Record<string, unknown>>(`SELECT participants FROM conversations WHERE id = $1`, [conversationId]);
    if (!result.rows[0]) throw new Error('Conversation not found');
    const participants = result.rows[0].participants as string[];
    if (!participants.includes(userId)) throw new Error('Not a participant');
    await pool.query(`UPDATE conversations SET status = 'rejected', updated_at = NOW() WHERE id = $1`, [conversationId]);
    return;
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
  since: number
): Promise<{
  newMessages: Message[];
  typingUsers: string[];
  conversations: Conversation[];
  deletedMessageIds: string[];
}> {
  const pool = getDbPool();
  const sinceIso = new Date(since).toISOString();

  if (pool) {
    const [newMsgsResult, deletedResult, convsResult] = await Promise.all([
      pool.query<Record<string, unknown>>(
        `SELECT * FROM messages WHERE conversation_id = $1 AND sent_at > $2 AND deleted = FALSE ORDER BY sent_at ASC`,
        [conversationId, sinceIso]
      ),
      pool.query<{ id: string }>(
        `SELECT id FROM messages WHERE conversation_id = $1 AND deleted = TRUE AND deleted_at > $2`,
        [conversationId, sinceIso]
      ),
      pool.query<Record<string, unknown>>(
        `SELECT * FROM conversations WHERE participants @> $1::jsonb ORDER BY updated_at DESC`,
        [JSON.stringify([userId])]
      ),
    ]);

    const cutoff = Date.now() - 4000;
    const data = await getData();
    const typingData = data.typingStatus?.[conversationId] ?? {};
    const typingUsers = Object.entries(typingData)
      .filter(([uid, ts]) => uid !== userId && ts > cutoff)
      .map(([uid]) => uid);

    return {
      newMessages: newMsgsResult.rows.map(rowToMessage),
      deletedMessageIds: deletedResult.rows.map((r) => r.id),
      conversations: convsResult.rows.map(rowToConversation),
      typingUsers,
    };
  }

  const data = await getData();
  const newMessages = (data.messages[conversationId] ?? []).filter(
    (m) => new Date(m.sentAt).getTime() > since && !m.deleted
  );
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
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<{ total: string }>(
      `SELECT COALESCE(SUM((unread_count->$1)::int), 0) AS total FROM conversations WHERE participants @> $2::jsonb AND status = 'active'`,
      [userId, JSON.stringify([userId])]
    );
    return parseInt(result.rows[0]?.total ?? '0', 10);
  }
  const data = await getData();
  return Object.values(data.conversations)
    .filter((c) => c.participants.includes(userId) && c.status === 'active')
    .reduce((sum, c) => sum + (c.unreadCount[userId] ?? 0), 0);
}

export async function getMessageRequests(userId: string): Promise<Conversation[]> {
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT * FROM conversations WHERE participants @> $1::jsonb AND status = 'request' AND request_from != $2`,
      [JSON.stringify([userId]), userId]
    );
    return result.rows.map(rowToConversation);
  }
  const data = await getData();
  return Object.values(data.conversations).filter(
    (c) => c.participants.includes(userId) && c.status === 'request' && c.requestFrom !== userId
  );
}

export async function toggleMessageIndex(
  conversationId: string,
  messageId: string,
  userId: string
): Promise<{ indexed: boolean }> {
  const pool = getDbPool();
  if (pool) {
    const existing = await pool.query<{ message_id: string }>(
      `SELECT message_id FROM message_bookmarks WHERE user_id = $1 AND conversation_id = $2 AND message_id = $3`,
      [userId, conversationId, messageId]
    );
    if (existing.rows[0]) {
      await pool.query(`DELETE FROM message_bookmarks WHERE user_id = $1 AND conversation_id = $2 AND message_id = $3`, [userId, conversationId, messageId]);
      return { indexed: false };
    }
    await pool.query(`INSERT INTO message_bookmarks (user_id, conversation_id, message_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [userId, conversationId, messageId]);
    return { indexed: true };
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
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<{ message_id: string }>(
      `SELECT message_id FROM message_bookmarks WHERE user_id = $1 AND conversation_id = $2`,
      [userId, conversationId]
    );
    return result.rows.map((r) => r.message_id);
  }
  const data = await getData();
  return data.messageIndex?.[userId]?.[conversationId] ?? [];
}

export async function getChatMeta(conversationId: string, userId: string): Promise<ChatMeta> {
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT label, label_color, bg_color, notes, pinned_at FROM conversation_meta WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    if (!result.rows[0]) return {};
    const r = result.rows[0];
    return {
      label: (r.label as string | null) ?? undefined,
      labelColor: (r.label_color as string | null) ?? undefined,
      bgColor: (r.bg_color as string | null) ?? undefined,
      notes: (r.notes as string | null) ?? undefined,
      pinnedAt: r.pinned_at ? (r.pinned_at as Date).toISOString() : undefined,
    };
  }
  const data = await getData();
  return data.chatMeta?.[userId]?.[conversationId] ?? {};
}

export async function setChatMeta(conversationId: string, userId: string, patch: Partial<ChatMeta>): Promise<ChatMeta> {
  const pool = getDbPool();
  if (pool) {
    const existing = await getChatMeta(conversationId, userId);
    const updated: ChatMeta = { ...existing, ...patch };
    await pool.query(
      `INSERT INTO conversation_meta (conversation_id, user_id, label, label_color, bg_color, notes, pinned_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET label=EXCLUDED.label, label_color=EXCLUDED.label_color, bg_color=EXCLUDED.bg_color, notes=EXCLUDED.notes, pinned_at=EXCLUDED.pinned_at`,
      [conversationId, userId, updated.label ?? null, updated.labelColor ?? null, updated.bgColor ?? null, updated.notes ?? null, updated.pinnedAt ?? null]
    );
    return updated;
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
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT conversation_id, label, label_color, bg_color, notes, pinned_at FROM conversation_meta WHERE user_id = $1`,
      [userId]
    );
    const out: Record<string, ChatMeta> = {};
    for (const r of result.rows) {
      out[r.conversation_id as string] = {
        label: (r.label as string | null) ?? undefined,
        labelColor: (r.label_color as string | null) ?? undefined,
        bgColor: (r.bg_color as string | null) ?? undefined,
        notes: (r.notes as string | null) ?? undefined,
        pinnedAt: r.pinned_at ? (r.pinned_at as Date).toISOString() : undefined,
      };
    }
    return out;
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
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<Record<string, unknown>>(
      `SELECT enabled, message, cooldown_minutes, last_sent_at FROM auto_reply_settings WHERE user_id = $1`,
      [userId]
    );
    if (!result.rows[0]) return { ...DEFAULT_AUTO_REPLY };
    const r = result.rows[0];
    return {
      enabled: r.enabled as boolean,
      message: r.message as string,
      cooldownMinutes: r.cooldown_minutes as number,
      lastSentAt: (r.last_sent_at as Record<string, string>) ?? {},
    };
  }
  const data = await getData();
  return data.autoReply?.[userId] ?? { ...DEFAULT_AUTO_REPLY };
}

export async function setAutoReply(
  userId: string,
  patch: Partial<Omit<AutoReplySettings, 'lastSentAt'>>
): Promise<AutoReplySettings> {
  const pool = getDbPool();
  if (pool) {
    const existing = await getAutoReply(userId);
    const updated: AutoReplySettings = { ...existing, ...patch };
    await pool.query(
      `INSERT INTO auto_reply_settings (user_id, enabled, message, cooldown_minutes, last_sent_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
       ON CONFLICT (user_id) DO UPDATE SET enabled=EXCLUDED.enabled, message=EXCLUDED.message, cooldown_minutes=EXCLUDED.cooldown_minutes, updated_at=NOW()`,
      [userId, updated.enabled, updated.message, updated.cooldownMinutes, JSON.stringify(updated.lastSentAt)]
    );
    return updated;
  }
  const data = await getData();
  if (!data.autoReply) data.autoReply = {};
  const existing = data.autoReply[userId] ?? { ...DEFAULT_AUTO_REPLY };
  const updated: AutoReplySettings = { ...existing, ...patch };
  data.autoReply[userId] = updated;
  await saveData(data);
  return updated;
}

export async function triggerAutoReply(
  conversationId: string,
  recipientId: string,
  triggeredByUserId: string
): Promise<void> {
  const settings = await getAutoReply(recipientId);
  if (!settings?.enabled || !settings.message?.trim()) return;

  const lastSent = settings.lastSentAt?.[conversationId];
  if (lastSent) {
    const elapsed = (Date.now() - new Date(lastSent).getTime()) / 60000;
    if (elapsed < (settings.cooldownMinutes ?? 30)) return;
  }
  if (recipientId === triggeredByUserId) return;

  const pool = getDbPool();
  if (pool) {
    const convRow = await pool.query<Record<string, unknown>>(`SELECT status FROM conversations WHERE id = $1`, [conversationId]);
    const conv = convRow.rows[0];
    if (!conv || conv.status !== 'active') return;
  } else {
    const data = await getData();
    const conv = data.conversations[conversationId];
    if (!conv || conv.status !== 'active') return;
  }

  const now = new Date().toISOString();
  await sendMessage(conversationId, recipientId, settings.message, 'text');

  // Update lastSentAt
  if (pool) {
    const result = await pool.query<{ last_sent_at: Record<string, string> }>(
      `SELECT last_sent_at FROM auto_reply_settings WHERE user_id = $1`, [recipientId]
    );
    const lastSentAt = { ...(result.rows[0]?.last_sent_at ?? {}), [conversationId]: now };
    await pool.query(`UPDATE auto_reply_settings SET last_sent_at = $1::jsonb, updated_at = NOW() WHERE user_id = $2`, [JSON.stringify(lastSentAt), recipientId]);
  } else {
    const data = await getData();
    if (!data.autoReply[recipientId].lastSentAt) data.autoReply[recipientId].lastSentAt = {};
    data.autoReply[recipientId].lastSentAt[conversationId] = now;
    await saveData(data);
  }
}

/* ── Quick Replies ───────────────────────────────────────────────────────────*/

export async function getQuickReplies(userId: string): Promise<QuickReply[]> {
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<{ id: string; title: string; content: string }>(
      `SELECT id, title, content FROM quick_replies WHERE user_id = $1 ORDER BY created_at ASC`,
      [userId]
    );
    return result.rows;
  }
  const data = await getData();
  return data.quickReplies?.[userId] ?? [];
}

export async function addQuickReply(userId: string, title: string, content: string): Promise<QuickReply> {
  const pool = getDbPool();
  const qr: QuickReply = { id: `qr_${crypto.randomBytes(6).toString('hex')}`, title: title.trim(), content: content.trim() };
  if (pool) {
    await pool.query(`INSERT INTO quick_replies (id, user_id, title, content) VALUES ($1,$2,$3,$4)`, [qr.id, userId, qr.title, qr.content]);
    return qr;
  }
  const data = await getData();
  if (!data.quickReplies) data.quickReplies = {};
  if (!data.quickReplies[userId]) data.quickReplies[userId] = [];
  data.quickReplies[userId].push(qr);
  await saveData(data);
  return qr;
}

export async function deleteQuickReply(userId: string, id: string): Promise<void> {
  const pool = getDbPool();
  if (pool) {
    await pool.query(`DELETE FROM quick_replies WHERE id = $1 AND user_id = $2`, [id, userId]);
    return;
  }
  const data = await getData();
  if (!data.quickReplies?.[userId]) return;
  data.quickReplies[userId] = data.quickReplies[userId].filter((q) => q.id !== id);
  await saveData(data);
}

export async function updateQuickReply(userId: string, id: string, title: string, content: string): Promise<void> {
  const pool = getDbPool();
  if (pool) {
    await pool.query(`UPDATE quick_replies SET title=$1, content=$2 WHERE id=$3 AND user_id=$4`, [title.trim(), content.trim(), id, userId]);
    return;
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
  const pool = getDbPool();
  if (pool) {
    const result = await pool.query<{ profile: BusinessProfile }>(
      `SELECT profile FROM business_profiles WHERE user_id = $1`, [userId]
    );
    return result.rows[0]?.profile ?? { ...EMPTY_PROFILE };
  }
  const data = await getData();
  return data.businessProfiles?.[userId] ?? { ...EMPTY_PROFILE };
}

export async function setBusinessProfile(userId: string, profile: BusinessProfile): Promise<BusinessProfile> {
  const pool = getDbPool();
  if (pool) {
    await pool.query(
      `INSERT INTO business_profiles (user_id, profile, updated_at) VALUES ($1,$2::jsonb,NOW())
       ON CONFLICT (user_id) DO UPDATE SET profile=EXCLUDED.profile, updated_at=NOW()`,
      [userId, JSON.stringify(profile)]
    );
    return profile;
  }
  const data = await getData();
  if (!data.businessProfiles) data.businessProfiles = {};
  data.businessProfiles[userId] = profile;
  await saveData(data);
  return profile;
}

export async function deleteMessage(conversationId: string, messageId: string, userId: string): Promise<void> {
  const pool = getDbPool();
  const now = new Date().toISOString();
  if (pool) {
    const result = await pool.query<{ sender_id: string }>(
      `SELECT sender_id FROM messages WHERE id = $1 AND conversation_id = $2`, [messageId, conversationId]
    );
    if (!result.rows[0]) throw new Error('Message not found');
    if (result.rows[0].sender_id !== userId) throw new Error('Not your message');
    await pool.query(`UPDATE messages SET deleted = TRUE, deleted_at = $1 WHERE id = $2`, [now, messageId]);
    return;
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
