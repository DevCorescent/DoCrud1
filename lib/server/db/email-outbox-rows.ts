import type { OutboundEmailEvent } from '@/lib/server/email-outbox';
import { getMongoDb } from '@/lib/server/database';

const COL = 'email_outbox';

function strip(doc: OutboundEmailEvent & { _id?: unknown }): OutboundEmailEvent {
  const { _id: _unused, ...rest } = doc as { _id?: unknown } & OutboundEmailEvent;
  return rest as OutboundEmailEvent;
}

export async function selectEmailOutboxRows(limit = 200): Promise<OutboundEmailEvent[]> {
  const db = await getMongoDb();
  if (!db) return [];
  const safeLimit = Math.max(1, Math.min(500, limit));
  const docs = await db.collection<OutboundEmailEvent & { _id: string }>(COL)
    .find({}).sort({ createdAt: -1, _id: -1 }).limit(safeLimit).toArray();
  return docs.map(strip);
}

/* ── Indexes ───────────────────────────────────────────────────────────────
   The console sorts by createdAt and filters by status, type and the
   metadata keys the senders write. Without these, every page of an operational
   view is a collection scan - fine at 2,000 rows, ruinous later.

   `createIndex` is idempotent and the promise is cached, following the pattern
   already used for ATS reports. A failure to build an index must never fail a
   query: the console is slower, not broken. */
let indexPromise: Promise<void> | null = null;

async function ensureIndexes(db: NonNullable<Awaited<ReturnType<typeof getMongoDb>>>) {
  if (!indexPromise) {
    indexPromise = Promise.all([
      db.collection(COL).createIndex({ createdAt: -1, _id: -1 }, { name: 'outbox_recent' }),
      db.collection(COL).createIndex({ status: 1, createdAt: -1 }, { name: 'outbox_status_recent' }),
      db.collection(COL).createIndex({ type: 1, createdAt: -1 }, { name: 'outbox_type_recent' }),
      db.collection(COL).createIndex(
        { 'metadata.campaignId': 1, createdAt: -1 }, { name: 'outbox_campaign_recent' }),
      db.collection(COL).createIndex({ to: 1, createdAt: -1 }, { name: 'outbox_recipient_recent' }),
    ]).then(() => undefined).catch((err) => {
      console.error('[email-outbox] index creation failed; queries still work', err);
      /* Cleared so a later call can retry rather than being stuck. */
      indexPromise = null;
    });
  }
  return indexPromise;
}

export interface OutboxQueryFilter {
  /** Stored statuses, not display labels. */
  status?: string[];
  /** Derived source. Expressed here as predicates over what senders record. */
  source?: 'campaign' | 'system_email' | 'test' | 'transactional';
  type?: string[];
  campaignId?: string;
  systemEmailType?: string;
  /** true = tests only, false = production only, undefined = everything. */
  test?: boolean;
  failureKind?: string;
  providerEvent?: string;
  providerCode?: number;
  /** Matched against recipient, subject, message id and campaign id. */
  search?: string;
  from?: string;
  to?: string;
}

/** Escape user input before it reaches a regex. */
function literal(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Translate the console's filters into a Mongo query.
 *
 * Exported so the file-storage path and the tests can be checked against the
 * SAME intent, rather than two filter implementations drifting apart.
 */
export function buildOutboxQuery(filter: OutboxQueryFilter): Record<string, unknown> {
  const q: Record<string, unknown> = {};

  if (filter.status?.length) q.status = { $in: filter.status };
  if (filter.type?.length) q.type = { $in: filter.type };
  if (filter.campaignId) q['metadata.campaignId'] = filter.campaignId;
  if (filter.systemEmailType) q['metadata.systemEmail'] = filter.systemEmailType;
  if (filter.failureKind) q.failureKind = filter.failureKind;
  if (filter.providerEvent) q.providerEvent = filter.providerEvent;
  if (typeof filter.providerCode === 'number') q.providerCode = filter.providerCode;

  /* A test row is marked either by the metadata flag or by the row type, so
     "production only" has to exclude both - otherwise a test send would be
     counted in production figures, which section 13 forbids. */
  const testOr = [{ 'metadata.test': 'true' }, { type: 'test' }];
  const notTest = [{ 'metadata.test': { $ne: 'true' } }, { type: { $ne: 'test' } }];
  const and: Record<string, unknown>[] = [];

  if (filter.test === true) and.push({ $or: testOr });
  else if (filter.test === false) and.push(...notTest);

  /* Source mirrors `describeOutboxSource` exactly, INCLUDING its precedence:
     a test send may also name a system email, and it is a test first. */
  if (filter.source === 'test') {
    and.push({ $or: testOr });
  } else if (filter.source === 'campaign') {
    and.push(...notTest, { 'metadata.campaignId': { $exists: true, $ne: null } });
  } else if (filter.source === 'system_email') {
    and.push(
      ...notTest,
      { 'metadata.campaignId': { $in: [null, undefined] } },
      { 'metadata.systemEmail': { $exists: true, $ne: null } },
    );
  } else if (filter.source === 'transactional') {
    and.push(
      ...notTest,
      { 'metadata.campaignId': { $in: [null, undefined] } },
      { 'metadata.systemEmail': { $in: [null, undefined] } },
    );
  }

  if (and.length) q.$and = and;

  if (filter.from || filter.to) {
    const range: Record<string, string> = {};
    if (filter.from) range.$gte = filter.from;
    if (filter.to) range.$lte = filter.to;
    q.createdAt = range;
  }

  if (filter.search) {
    const rx = { $regex: literal(filter.search), $options: 'i' };
    const searchOr = [
      { to: rx }, { subject: rx }, { messageId: rx },
      { 'metadata.campaignId': rx }, { 'metadata.systemEmail': rx },
    ];
    /* Added to $and, so a search can never WIDEN an existing $or - an OR at
       the top level beside a source filter would return rows the admin
       explicitly filtered out. */
    const existing = (q.$and as Record<string, unknown>[] | undefined) ?? [];
    q.$and = [...existing, { $or: searchOr }];
  }

  return q;
}

export async function queryEmailOutboxRows(
  filter: OutboxQueryFilter,
  opts: { page: number; limit: number; direction: 1 | -1 },
): Promise<{ rows: OutboundEmailEvent[]; total: number }> {
  const db = await getMongoDb();
  if (!db) return { rows: [], total: 0 };
  await ensureIndexes(db);

  const col = db.collection<OutboundEmailEvent & { _id: string }>(COL);
  const query = buildOutboxQuery(filter);

  /* Counted and fetched with the same query, so the pager cannot claim a page
     that the list does not contain. */
  const [total, docs] = await Promise.all([
    col.countDocuments(query as never),
    col.find(query as never)
      .sort({ createdAt: opts.direction, _id: opts.direction })
      .skip((opts.page - 1) * opts.limit)
      .limit(opts.limit)
      .toArray(),
  ]);

  return { rows: docs.map(strip), total };
}

export async function selectEmailOutboxRowById(id: string): Promise<OutboundEmailEvent | null> {
  const db = await getMongoDb();
  if (!db) return null;
  const doc = await db.collection<OutboundEmailEvent & { _id: string }>(COL).findOne({ _id: id });
  return doc ? strip(doc) : null;
}

export async function upsertEmailOutboxRow(ev: OutboundEmailEvent): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  await db.collection(COL).replaceOne({ _id: ev.id as any }, { ...ev, _id: ev.id }, { upsert: true });
}

export async function trimEmailOutboxRows(maxRows: number): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection<{ _id: string }>(COL);
  const count = await col.countDocuments();
  if (count <= maxRows) return;
  const overflow = await col.find({})
    .sort({ createdAt: -1, _id: -1 })
    .skip(maxRows)
    .project({ _id: 1 })
    .toArray();
  if (overflow.length > 0) {
    await col.deleteMany({ _id: { $in: overflow.map((d) => d._id) } });
  }
}

export async function bulkReplaceEmailOutboxRows(events: OutboundEmailEvent[]): Promise<void> {
  const db = await getMongoDb();
  if (!db) return;
  const col = db.collection(COL);
  const incomingIds = events.map((e) => e.id);
  await col.deleteMany({ _id: { $nin: incomingIds as any } });
  if (events.length > 0) {
    await (col as any).bulkWrite(
      events.map((ev) => ({
        replaceOne: {
          filter: { _id: ev.id },
          replacement: { ...ev, _id: ev.id },
          upsert: true,
        },
      })),
    );
  }
}
