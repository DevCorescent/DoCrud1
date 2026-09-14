/**
 * Cross-process single-flight lease for the job scraper.
 *
 * ═══ WHY NOT `withStorageLock` ═══
 *
 * That helper is explicitly per-process (see lib/server/storage.ts): it
 * serialises callers inside ONE Node process and says so. The scraper is about
 * to be run from two different processes — the PM2 Next.js server (an operator
 * pressing Run scraper) and a systemd worker (the timer) — so a per-process
 * lock is exactly the shape of lock that cannot help here. Two full ingestions
 * overlapping would fetch every board twice and race each other's writes.
 *
 * ═══ WHY A LEASE AND NOT A FLAG ═══
 *
 * A boolean "running" flag is only correct while nothing ever crashes. A worker
 * killed by OOM, a deploy, or `systemctl stop` never clears it, and the scraper
 * is then wedged until somebody notices and edits the database by hand. A LEASE
 * expires on its own: the holder must keep renewing it to keep it, so death is
 * indistinguishable from silence and recovery needs no human.
 *
 * The trade is the usual one — a lease can expire while its holder is merely
 * slow, allowing a second run. That is why the TTL is far longer than a normal
 * run and why the holder renews on a timer well inside it. A duplicated run is
 * survivable (ingestion is idempotent by identity); a permanently wedged
 * scraper is not.
 *
 * Acquisition is a single atomic `findOneAndUpdate` on a fixed _id, so two
 * simultaneous callers cannot both win regardless of which process they are in.
 */
import { getMongoDb } from '@/lib/server/database';

const COL = 'job_scraper_locks';
/** One scraper, one lock row. The fixed id is what makes the upsert atomic. */
const LOCK_ID = 'job-scraper';

/**
 * How long a lease survives without renewal.
 *
 * Generous on purpose. A full run is minutes, and the cost of expiring early
 * (a second run doing duplicate work) is paid every time the estimate is wrong,
 * whereas the cost of expiring late is only a delayed retry after a crash.
 */
export const LEASE_TTL_MS = 15 * 60_000;
/** Renewal cadence. Comfortably inside the TTL so one missed tick is harmless. */
export const LEASE_RENEW_MS = 60_000;

export interface ScraperLease {
  runId: string;
  owner: string;
  acquiredAt: string;
  expiresAt: string;
}

export type AcquireResult =
  | { ok: true; lease: ScraperLease }
  | { ok: false; reason: 'already_running'; heldBy: ScraperLease };

interface LockDoc {
  _id: string;
  runId: string;
  owner: string;
  acquiredAt: Date;
  expiresAt: Date;
}

/**
 * The one collection this module touches, behind a seam.
 *
 * The lock's whole value is its behaviour under contention, expiry and crash —
 * none of which can be exercised against a real Atlas connection in a unit
 * test, and all of which are exactly what must not regress. So the accessor is
 * overridable.
 *
 * It REFUSES to be overridden in production rather than ignoring the override:
 * a silently-ignored stub would let a test-shaped caller believe it held a
 * lease it never took, which is the one failure this file exists to prevent.
 * Same reasoning, and same shape, as the loadJobs/saveJobs guard in
 * run-ingestion.ts.
 */
export interface LockCollection {
  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: { $set: Record<string, unknown> },
    opts: { upsert?: boolean; returnDocument?: 'after' },
  ): Promise<unknown>;
  updateOne(
    filter: Record<string, unknown>,
    update: { $set: Record<string, unknown> },
  ): Promise<{ matchedCount: number }>;
  findOne(filter?: Record<string, unknown>): Promise<unknown>;
}

let collectionOverride: LockCollection | null = null;

/** Test-only. Throws in production rather than being quietly honoured. */
export function setLockCollectionForTests(col: LockCollection | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('run-lock: the collection seam is test-only and must not be used in production');
  }
  collectionOverride = col;
}

async function lockCollection(): Promise<LockCollection | null> {
  if (collectionOverride) return collectionOverride;
  const db = await getMongoDb();
  if (!db) return null;
  return db.collection(COL) as unknown as LockCollection;
}

function toLease(doc: LockDoc): ScraperLease {
  return {
    runId: doc.runId,
    owner: doc.owner,
    acquiredAt: new Date(doc.acquiredAt).toISOString(),
    expiresAt: new Date(doc.expiresAt).toISOString(),
  };
}

/**
 * Take the lease, or report who holds it.
 *
 * The filter matches only a lock that is ABSENT or EXPIRED, so a live holder
 * makes the update match nothing. `upsert` then either creates the row (nobody
 * held it) or raises a duplicate-key error (somebody took it in between) — and
 * that error is the lock working, not a fault, so it is translated into
 * `already_running` rather than thrown.
 */
export async function acquireScraperLease(
  runId: string,
  owner: string,
  now = new Date(),
): Promise<AcquireResult> {
  const col = await lockCollection();
  if (!col) throw new Error('scraper lease requires a database connection');

  const expiresAt = new Date(now.getTime() + LEASE_TTL_MS);
  try {
    const updated = await col.findOneAndUpdate(
      /* Free, or the previous holder's lease has run out. */
      { _id: LOCK_ID, expiresAt: { $lte: now } },
      { $set: { runId, owner, acquiredAt: now, expiresAt } },
      { upsert: true, returnDocument: 'after' },
    );
    const doc = (updated as { value?: LockDoc } | null)?.value
      ?? (updated as unknown as LockDoc | null);
    if (doc && doc.runId === runId) return { ok: true, lease: toLease(doc) };
  } catch (error) {
    /* 11000 = duplicate key: the upsert lost the race to a live holder. Any
       other error is a real storage failure and must not be disguised as
       contention — a caller told "already running" would wait forever. */
    const code = (error as { code?: number }).code;
    if (code !== 11000) throw error;
  }

  const held = (await col.findOne({ _id: LOCK_ID })) as LockDoc | null;
  if (!held) {
    /* The holder vanished between the update and the read. Contention, not a
       bug: report it and let the caller retry rather than inventing a lease. */
    return {
      ok: false,
      reason: 'already_running',
      heldBy: { runId: 'unknown', owner: 'unknown', acquiredAt: now.toISOString(), expiresAt: now.toISOString() },
    };
  }
  return { ok: false, reason: 'already_running', heldBy: toLease(held) };
}

/**
 * Extend the lease. Scoped to `runId`, so a run whose lease already expired and
 * was taken by someone else cannot stamp on the new holder.
 *
 * Returns false when the lease was lost. The caller should treat that as "stop
 * writing" rather than ignore it.
 */
export async function renewScraperLease(runId: string, now = new Date()): Promise<boolean> {
  const col = await lockCollection();
  if (!col) return false;
  const res = await col.updateOne(
    { _id: LOCK_ID, runId },
    { $set: { expiresAt: new Date(now.getTime() + LEASE_TTL_MS) } },
  );
  return res.matchedCount === 1;
}

/**
 * Release the lease.
 *
 * Also scoped to `runId`: a slow run that already lost its lease must not
 * release the lease its successor now holds. Expiring the row rather than
 * deleting it keeps the history of who ran last visible.
 */
export async function releaseScraperLease(runId: string, now = new Date()): Promise<void> {
  const col = await lockCollection();
  if (!col) return;
  await col.updateOne({ _id: LOCK_ID, runId }, { $set: { expiresAt: now } });
}

/** Who holds the lease right now, or null when it is free. Read-only. */
export async function readScraperLease(now = new Date()): Promise<ScraperLease | null> {
  const col = await lockCollection();
  if (!col) return null;
  const doc = (await col.findOne({ _id: LOCK_ID })) as LockDoc | null;
  if (!doc || new Date(doc.expiresAt) <= now) return null;
  return toLease(doc);
}
