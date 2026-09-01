/**
 * The ingestion work queue.
 *
 * WHY THIS EXISTS. Three sources fit comfortably inside one serverless
 * request. Three hundred do not: the request would exceed its time limit long
 * before the last source was reached, and every run would fail in the middle
 * with no record of where it stopped. A queue turns one impossible request
 * into many small ones that can be retried independently.
 *
 * WHY MONGO AND NOT A QUEUE SERVICE. The project has no Redis and no broker,
 * and adding one would be a new piece of infrastructure to operate for a job
 * that runs three times a day. Mongo is already here, and
 * `findOneAndUpdate` gives exactly the primitive a queue needs: an atomic
 * claim. This is the same approach `claimCampaign` already proves in the mail
 * system — read and write inside ONE operation so two workers cannot both win.
 *
 * WHAT MAKES IT SAFE:
 *  · A task is claimed by a single atomic update, so two workers racing for the
 *    same task produce one winner and one empty result.
 *  · A claim EXPIRES. A worker killed mid-task (a serverless timeout, a
 *    deploy) would otherwise hold its task for ever; the lease lets another
 *    worker pick it up once the lease lapses.
 *  · Tasks are keyed by `runId + sourceId`, so enqueuing the same work twice
 *    is a no-op rather than a duplicate fetch.
 */
import { getMongoDb } from '@/lib/server/database';

const COL = 'job_ingestion_queue';

export type QueueTaskStatus = 'pending' | 'claimed' | 'done' | 'failed';

export interface QueueTask {
  /** `${runId}:${sourceId}` — the identity that makes enqueue idempotent. */
  _id: string;
  runId: string;
  sourceId: string;
  status: QueueTaskStatus;
  attempts: number;
  maxAttempts: number;
  /** Opaque resume token handed back to the adapter. */
  cursor: string | null;
  createdAt: string;
  /** When the current claim lapses and another worker may take over. */
  leaseExpiresAt?: string;
  claimedBy?: string;
  finishedAt?: string;
  error?: string;
  /** Earliest time this task may be claimed. Used for backoff. */
  availableAt: string;
}

/** How long a worker may hold a task before another may take it. */
export const LEASE_MS = 120_000;

/**
 * Backoff between attempts on the same source.
 *
 * Deliberately its own small schedule rather than the mail system's
 * `nextRetryAt`: an SMTP rejection and a job board returning 503 are different
 * failures with different remedies, and sharing one classifier would force
 * both to bend. What IS shared is the shape - exponential, bounded, explicit.
 */
const BACKOFF_MS = [30_000, 120_000, 600_000];

export function backoffFor(attempt: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempt - 1, 0), BACKOFF_MS.length - 1)];
}

async function collection() {
  const db = await getMongoDb();
  return db ? db.collection<QueueTask>(COL) : null;
}

let indexPromise: Promise<void> | null = null;

/** Indexes the claim query needs. Idempotent; a failure degrades, not breaks. */
async function ensureIndexes(): Promise<void> {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const col = await collection();
    if (!col) return;
    await Promise.all([
      /* The claim query: pending-or-lapsed, due now, oldest first. */
      col.createIndex({ status: 1, availableAt: 1 }, { name: 'queue_claimable' }),
      col.createIndex({ runId: 1, status: 1 }, { name: 'queue_by_run' }),
      col.createIndex({ leaseExpiresAt: 1 }, { name: 'queue_lease' }),
    ]);
  })().catch((err) => {
    console.error('[job-queue] index creation failed; the queue still works', err);
    indexPromise = null;
  });
  return indexPromise;
}

export function taskId(runId: string, sourceId: string): string {
  return `${runId}:${sourceId}`;
}

/** True when Mongo is available. The queue has no local-file equivalent. */
export async function queueAvailable(): Promise<boolean> {
  return Boolean(await collection());
}

/**
 * Add one task per source. Idempotent: re-enqueuing a run changes nothing.
 */
export async function enqueueSources(
  runId: string,
  sources: Array<{ sourceId: string; maxAttempts: number; cursor?: string | null }>,
): Promise<number> {
  const col = await collection();
  if (!col || sources.length === 0) return 0;
  await ensureIndexes();

  const now = new Date().toISOString();
  const ops = sources.map((s) => ({
    updateOne: {
      filter: { _id: taskId(runId, s.sourceId) },
      /* $setOnInsert only: re-enqueuing must never reset a task another
         worker has already claimed or completed. */
      update: {
        $setOnInsert: {
          runId,
          sourceId: s.sourceId,
          status: 'pending' as QueueTaskStatus,
          attempts: 0,
          maxAttempts: s.maxAttempts,
          cursor: s.cursor ?? null,
          createdAt: now,
          availableAt: now,
        },
      },
      upsert: true,
    },
  }));

  const res = await col.bulkWrite(ops as never);
  return res.upsertedCount ?? 0;
}

/**
 * Claim one task, atomically.
 *
 * A task is claimable when it is pending and due, OR when it was claimed by a
 * worker whose lease has since lapsed. The whole decision happens inside one
 * `findOneAndUpdate`, which is what makes two concurrent workers safe: the
 * database, not this code, decides who wins.
 */
export async function claimTask(workerId: string): Promise<QueueTask | null> {
  const col = await collection();
  if (!col) return null;
  await ensureIndexes();

  const now = new Date();
  const nowIso = now.toISOString();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_MS).toISOString();

  const claimed = await col.findOneAndUpdate(
    {
      availableAt: { $lte: nowIso },
      $or: [
        { status: 'pending' },
        /* Recovery: a worker that died still holds this task on paper. */
        { status: 'claimed', leaseExpiresAt: { $lt: nowIso } },
      ],
    } as never,
    {
      $set: { status: 'claimed', claimedBy: workerId, leaseExpiresAt },
      $inc: { attempts: 1 },
    } as never,
    /* Oldest first, so a source is never starved by newer arrivals. */
    { sort: { availableAt: 1 }, returnDocument: 'after' } as never,
  );

  return (claimed as unknown as QueueTask | null) ?? null;
}

export async function completeTask(
  id: string, cursor: string | null,
): Promise<void> {
  const col = await collection();
  if (!col) return;
  await col.updateOne(
    { _id: id } as never,
    {
      $set: {
        status: 'done' as QueueTaskStatus,
        cursor,
        finishedAt: new Date().toISOString(),
      },
      $unset: { leaseExpiresAt: '', claimedBy: '' },
    } as never,
  );
}

/**
 * Record a failed attempt.
 *
 * Returns the task to `pending` with a backoff while attempts remain, and
 * marks it `failed` once the budget is spent. A task that has failed
 * permanently is kept, not deleted: it is the evidence of what went wrong.
 */
export async function failTask(
  id: string, error: string, attempts: number, maxAttempts: number,
): Promise<{ willRetry: boolean }> {
  const col = await collection();
  if (!col) return { willRetry: false };

  const willRetry = attempts < maxAttempts;
  const availableAt = new Date(Date.now() + backoffFor(attempts)).toISOString();

  await col.updateOne(
    { _id: id } as never,
    {
      $set: willRetry
        ? { status: 'pending' as QueueTaskStatus, error, availableAt }
        : {
            status: 'failed' as QueueTaskStatus,
            error,
            finishedAt: new Date().toISOString(),
          },
      $unset: { leaseExpiresAt: '', claimedBy: '' },
    } as never,
  );

  return { willRetry };
}

export interface QueueStats {
  pending: number; claimed: number; done: number; failed: number;
}

export async function runQueueStats(runId: string): Promise<QueueStats> {
  const empty: QueueStats = { pending: 0, claimed: 0, done: 0, failed: 0 };
  const col = await collection();
  if (!col) return empty;
  const rows = await col.aggregate([
    { $match: { runId } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]).toArray();
  for (const r of rows as Array<{ _id: QueueTaskStatus; n: number }>) {
    if (r._id in empty) empty[r._id] = r.n;
  }
  return empty;
}

/** Remove finished tasks for a run. History lives in the run record. */
export async function clearRunTasks(runId: string): Promise<number> {
  const col = await collection();
  if (!col) return 0;
  const res = await col.deleteMany({ runId } as never);
  return res.deletedCount ?? 0;
}
