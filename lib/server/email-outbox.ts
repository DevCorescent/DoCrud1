import {
  emailOutboxPath, readJsonFile, writeJsonFile, withStorageLock,
} from '@/lib/server/storage';
import { getDbPool } from '@/lib/server/database';
import {
  selectEmailOutboxRowById,
  selectEmailOutboxRows,
  trimEmailOutboxRows,
  upsertEmailOutboxRow,
} from '@/lib/server/db/email-outbox-rows';

export type OutboundEmailStatus = 'queued' | 'sent' | 'failed' | 'tested';

export type OutboundEmailEvent = {
  id: string;
  createdAt: string;
  status: OutboundEmailStatus;
  type: 'document_delivery' | 'collection_request' | 'system' | 'test' | 'docrud_go_welcome' | 'admin_user_message' | 'feed_moderation';
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  messageId?: string;
  sentAt?: string;
  sentBy?: string;
  error?: string;
  tracking: {
    opens: number;
    clicks: number;
    lastOpenedAt?: string;
    lastClickedAt?: string;
  };
  metadata?: Record<string, string>;
};

type OutboxState = {
  events: OutboundEmailEvent[];
};

const fallback: OutboxState = { events: [] };

/* ── Serialising local-file mutations ──────────────────────────────────────

   THE BUG THIS FIXES: appending is a read-modify-write over the whole
   document, with an `await` between the read and the write. The campaign send
   loop runs four recipients at a time, so four appends would all read the same
   array, each build `[theirEvent, ...sameOldEvents]`, and the last write would
   win — three events silently lost. Observed in testing: a campaign correctly
   recorded `failed: 2` while the outbox contained one row.

   That is unacceptable for an audit trail, and reducing concurrency to 1 would
   fix the symptom by making sending four times slower.

   The lock is the shared per-path helper, so appends and updates serialise
   against each other. The Mongo path does not use it at all — it upserts
   individual rows and was never affected. */
const OUTBOX_LOCK = 'email-outbox';

function withOutboxLock<T>(operation: () => Promise<T>): Promise<T> {
  return withStorageLock(OUTBOX_LOCK, operation);
}

function safeString(value: unknown) {
  return String(value ?? '').trim();
}

export function createOutboundEmailId(prefix = 'eml') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getEmailOutbox(limit = 200): Promise<OutboundEmailEvent[]> {
  if (getDbPool()) {
    return selectEmailOutboxRows(limit);
  }
  const state = await readJsonFile<OutboxState>(emailOutboxPath, fallback);
  const events = Array.isArray(state?.events) ? state.events : [];
  return events
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, Math.max(1, Math.min(500, limit)));
}

export async function appendEmailOutboxEvent(event: OutboundEmailEvent) {
  if (getDbPool()) {
    await upsertEmailOutboxRow(event);
    await trimEmailOutboxRows(2000);
    return;
  }
  return withOutboxLock(async () => {
    const state = await readJsonFile<OutboxState>(emailOutboxPath, fallback);
    const events = Array.isArray(state?.events) ? state.events : [];
    /* Re-appending an id that already exists would duplicate the row. */
    const deduped = events.filter((ev) => ev.id !== event.id);
    const next = [event, ...deduped].slice(0, 2000);
    await writeJsonFile(emailOutboxPath, { events: next });
  });
}

export async function updateEmailOutboxEvent(id: string, updater: (event: OutboundEmailEvent) => OutboundEmailEvent) {
  if (getDbPool()) {
    const existing = await selectEmailOutboxRowById(id);
    if (!existing) return;
    await upsertEmailOutboxRow(updater(existing));
    return;
  }
  /* Shares the chain with append: an update racing an append would otherwise
     drop whichever wrote first, and tracking pixels fire concurrently. */
  return withOutboxLock(async () => {
    const state = await readJsonFile<OutboxState>(emailOutboxPath, fallback);
    const events = Array.isArray(state?.events) ? state.events : [];
    const next = events.map((ev) => (ev.id === id ? updater(ev) : ev));
    await writeJsonFile(emailOutboxPath, { events: next });
  });
}

export async function markEmailOpened(id: string) {
  await updateEmailOutboxEvent(id, (ev) => ({
    ...ev,
    tracking: {
      ...ev.tracking,
      opens: Number(ev.tracking?.opens || 0) + 1,
      lastOpenedAt: new Date().toISOString(),
    },
  }));
}

export async function markEmailClicked(id: string) {
  await updateEmailOutboxEvent(id, (ev) => ({
    ...ev,
    tracking: {
      ...ev.tracking,
      clicks: Number(ev.tracking?.clicks || 0) + 1,
      lastClickedAt: new Date().toISOString(),
    },
  }));
}

export function buildTrackingPixel(origin: string, id: string) {
  const base = safeString(origin);
  const url = `${base}/api/mail/track/open?id=${encodeURIComponent(id)}`;
  return `<img src="${url}" alt="" width="1" height="1" style="display:none;opacity:0" />`;
}

export function rewriteLinksForTracking(origin: string, id: string, input: string) {
  const base = safeString(origin);
  const raw = String(input || '');
  const urlRegex = /\bhttps?:\/\/[^\s<>"')]+/gi;
  return raw.replace(urlRegex, (url) => (
    `${base}/api/mail/track/click?id=${encodeURIComponent(id)}&url=${encodeURIComponent(url)}`
  ));
}

