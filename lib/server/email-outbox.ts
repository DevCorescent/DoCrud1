import {
  emailOutboxPath, readJsonFile, writeJsonFile, withStorageLock,
} from '@/lib/server/storage';
import { getDbPool } from '@/lib/server/database';
import {
  selectEmailOutboxRowById,
  selectEmailOutboxRows,
  trimEmailOutboxRows,
  upsertEmailOutboxRow,
  queryEmailOutboxRows,
  type OutboxQueryFilter,
} from '@/lib/server/db/email-outbox-rows';

export type { OutboxQueryFilter };

export type OutboundEmailStatus = 'queued' | 'sent' | 'failed' | 'tested';

export type OutboundEmailEvent = {
  id: string;
  createdAt: string;
  status: OutboundEmailStatus;
  type: 'document_delivery' | 'collection_request' | 'system' | 'test' | 'docrud_go_welcome' | 'admin_user_message' | 'feed_moderation'
    /* Phase 9. */
    | 'hiring_status';
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  messageId?: string;
  sentAt?: string;
  sentBy?: string;
  error?: string;
  /* ── Operational fields (Phase 11) ──────────────────────────────────────
     These are NOT new information. `classifyMailError` already computed all
     of them at the moment of failure and then threw them away, leaving an
     admin to re-read a raw SMTP string to find out whether retrying was even
     possible. They are recorded here by the sender that failed.

     All optional, because rows written before this existed do not have them.
     The read path derives a classification from the stored error text for
     those, and says that it did - a derived answer presented as a recorded
     one would be a quiet lie about provenance. */
  /** Classification from the shared classifier. */
  failureKind?: string;
  /** SMTP reply code, when the provider gave one. */
  providerCode?: number;
  /** Whether retrying could plausibly succeed without someone intervening. */
  retryable?: boolean;
  /** Delivery attempts so far. Campaign retries carry this across passes. */
  attempts?: number;
  /** When this row last changed. */
  updatedAt?: string;
  /** When the provider refused it. */
  failedAt?: string;
  /* ── Provider delivery events (Phase 14) ────────────────────────────────
     What the provider reported AFTER accepting the message. Recorded on the
     same row the send wrote, rather than in a second log: a bounce is the
     later half of that message's story. The row's `status` is deliberately
     left alone - the provider really did accept it, and rewriting that would
     erase what happened at send time. */
  providerEvent?: 'hard_bounce' | 'soft_bounce' | 'complaint';
  providerEventAt?: string;
  providerEventCode?: number;
  providerEventMessage?: string;
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

/* ── The operational query (Phase 11) ──────────────────────────────────────

   `getEmailOutbox(limit)` above stays exactly as it was: several callers use
   it for "the last N events" and none of them want filtering. This is the
   console's read path, and it exists because paging and filtering an audit
   trail in the BROWSER stops working precisely when the trail becomes worth
   reading.

   Mongo does the work in the database, against indexes. The local-file store
   has no query engine, so it filters in memory over a file that is capped at
   2,000 rows by `appendEmailOutboxEvent` - correct, and bounded by that cap
   rather than by anything this function does. The cap IS the scaling limit,
   and it is stated in the response so the console can say so out loud. */

export interface OutboxQueryOptions {
  page?: number;
  limit?: number;
  direction?: "asc" | "desc";
  filter?: OutboxQueryFilter;
}

export interface OutboxQueryResult {
  rows: OutboundEmailEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** Which store answered, so the UI can be honest about its limits. */
  backend: "mongo" | "file";
  /** Set when the file store's row cap could be hiding older matches. */
  truncated: boolean;
}

/** Hard ceiling. A page size is a request, not an instruction. */
export const OUTBOX_MAX_PAGE_SIZE = 100;
export const OUTBOX_FILE_SCAN_LIMIT = 2000;

/** The in-memory equivalent of `buildOutboxQuery`, for the file store. */
export function matchesOutboxFilter(
  ev: OutboundEmailEvent, filter: OutboxQueryFilter,
): boolean {
  if (filter.status?.length && !filter.status.includes(ev.status)) return false;
  if (filter.type?.length && !filter.type.includes(ev.type)) return false;

  const md = ev.metadata ?? {};
  if (filter.campaignId && md.campaignId !== filter.campaignId) return false;
  if (filter.systemEmailType && md.systemEmail !== filter.systemEmailType) return false;
  if (filter.failureKind && ev.failureKind !== filter.failureKind) return false;
  if (filter.providerEvent && ev.providerEvent !== filter.providerEvent) return false;
  if (typeof filter.providerCode === "number" && ev.providerCode !== filter.providerCode) {
    return false;
  }

  /* Same definition of "a test" as the Mongo path: the metadata flag OR the
     row type. Disagreeing here would put test sends into production figures
     on one storage backend and not the other. */
  const isTest = md.test === "true" || ev.type === "test";
  if (filter.test === true && !isTest) return false;
  if (filter.test === false && isTest) return false;

  /* Mirrors `describeOutboxSource`, precedence included. */
  if (filter.source) {
    const derived = isTest ? "test"
      : md.campaignId ? "campaign"
        : md.systemEmail ? "system_email" : "transactional";
    if (derived !== filter.source) return false;
  }

  if (filter.from && ev.createdAt < filter.from) return false;
  if (filter.to && ev.createdAt > filter.to) return false;

  if (filter.search) {
    const needle = filter.search.toLowerCase();
    const haystack = [
      ev.to, ev.subject, ev.messageId, md.campaignId, md.systemEmail,
    ].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

export async function queryEmailOutbox(
  options: OutboxQueryOptions = {},
): Promise<OutboxQueryResult> {
  const page = Math.max(1, Math.floor(Number(options.page) || 1));
  const limit = Math.max(
    1, Math.min(OUTBOX_MAX_PAGE_SIZE, Math.floor(Number(options.limit) || 25)));
  const direction = options.direction === "asc" ? 1 : -1;
  const filter = options.filter ?? {};

  if (getDbPool()) {
    const { rows, total } = await queryEmailOutboxRows(filter, { page, limit, direction });
    return {
      rows, total, page, limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      backend: "mongo",
      truncated: false,
    };
  }

  const state = await readJsonFile<OutboxState>(emailOutboxPath, fallback).catch(() => fallback);
  const events = Array.isArray(state?.events) ? state.events : [];
  const matched = events.filter((ev) => matchesOutboxFilter(ev, filter));
  matched.sort((a, b) => {
    const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return direction === 1 ? d : -d;
  });

  const start = (page - 1) * limit;
  return {
    rows: matched.slice(start, start + limit),
    total: matched.length,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(matched.length / limit)),
    backend: "file",
    /* The store itself keeps only the newest rows, so an older match may
       simply not be on disk any more. */
    truncated: events.length >= OUTBOX_FILE_SCAN_LIMIT,
  };
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

/** One row by id, from whichever store holds it. */
export async function getEmailOutboxEventById(
  id: string,
): Promise<OutboundEmailEvent | null> {
  if (getDbPool()) return selectEmailOutboxRowById(id);
  const state = await readJsonFile<OutboxState>(emailOutboxPath, fallback).catch(() => fallback);
  const events = Array.isArray(state?.events) ? state.events : [];
  return events.find((ev) => ev.id === id) ?? null;
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

