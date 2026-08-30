/**
 * ATS evaluation history — storage.
 *
 * Follows the project's existing two-tier convention exactly (see
 * lib/server/db/service-reviews-rows.ts and lib/server/security/rate-limit.ts):
 * a Mongo collection when MONGODB_URI is configured, a JSON file under data/
 * otherwise, so development works with no database. No new dependency.
 *
 * WHAT IS STORED, AND WHAT IS NOT
 * -------------------------------
 * The report needed to redisplay an evaluation, and nothing else. The resume is
 * NOT copied here — it already lives on the profile, and duplicating it would
 * mean a second copy to secure and to delete. The job description is NOT stored
 * either; only a SHA-256 of it, which is enough to recognise "you already ran
 * this posting" without retaining the text. The one exception is `jobTitle`,
 * because a history list with no job name is unusable.
 *
 * OWNERSHIP
 * ---------
 * Every read is scoped by `userId` in the QUERY, never filtered after the fact.
 * A report belonging to another member does not come back and then get rejected
 * — it is never selected. That makes cross-user access a property of the query
 * rather than a check someone can forget to write.
 */
import crypto from 'node:crypto';
import path from 'path';
import { getMongoDb } from '@/lib/server/database';
import { dataDir, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { assertPersistenceAvailable, atsLog } from './safety';
import type { AtsApiResponse } from './api';

const COL = 'ats_reports';
const reportsPath = path.join(dataDir, 'ats-reports.json');

/** Newest-first, and a hard ceiling so one member cannot grow unbounded. */
export const HISTORY_PAGE_SIZE = 20;

/**
 * RETENTION POLICY — the 100 most recent evaluations per member.
 *
 * A stated policy rather than a silent cap: history is a convenience for
 * comparing recent attempts, not a record of account activity, and an
 * unbounded per-user collection is a storage and query problem that only
 * appears once it is already a problem. When the ceiling is reached the OLDEST
 * evaluation is removed as a new one is written. This is surfaced in the
 * history UI so nobody discovers it by finding a report missing.
 *
 * Changing this number changes what members keep — treat it as product policy,
 * not a tuning knob.
 */
export const MAX_REPORTS_PER_USER = 100;

export interface AtsReportSummary {
  id: string;
  userId: string;
  /** The profile resume used, when one was. Null for an uploaded/pasted resume. */
  resumeId: string | null;
  resumeName: string | null;
  jobTitle: string;
  /** SHA-256 of the normalized job description. The text itself is not kept. */
  jobDescriptionHash: string;
  overallScore: number;
  label: AtsApiResponse['label'];
  keywordScore: number;
  experienceScore: number;
  alignmentScore: number;
  resumeQualityScore: number;
  parsingCap: AtsApiResponse['breakdown']['parsingCap'];
  createdAt: string;
}

export interface AtsReportRecord extends AtsReportSummary {
  /** The full response, so the saved report renders identically to the original. */
  result: AtsApiResponse;
}

/**
 * Index bootstrap, once per process.
 *
 * The project has no migration step — ensureDatabaseSchema() is a documented
 * no-op and collections are created lazily — so the index is declared next to
 * the queries that need it. `createIndex` is idempotent, and the promise is
 * cached so concurrent requests during a cold start issue one command, not one
 * each.
 *
 * Both queries this collection serves are covered:
 *   listAtsReports  — find({userId}).sort({createdAt:-1})   → the compound index
 *   getAtsReport    — findOne({_id, userId})                → _id, plus userId
 * Without the compound index a member's history is a collection scan followed
 * by an in-memory sort, which degrades as every member's reports accumulate in
 * one collection.
 */
let indexReady: Promise<void> | null = null;
async function ensureIndexes(db: NonNullable<Awaited<ReturnType<typeof getMongoDb>>>): Promise<void> {
  if (!indexReady) {
    indexReady = db.collection(COL)
      .createIndex({ userId: 1, createdAt: -1 }, { name: 'ats_reports_user_recent' })
      .then(() => undefined)
      .catch((err) => {
        /* A missing index is a performance problem, never a correctness one, so
           it must not fail the request. Retry on the next cold start. */
        indexReady = null;
        atsLog('ATS_HISTORY_WRITE_FAILED', { stage: 'ensureIndexes', reason: String((err as Error)?.name ?? 'error') });
      });
  }
  return indexReady;
}

/** Stable hash of a job description — same posting, same id, across runs. */
export function hashJobDescription(jobDescription: string): string {
  return crypto.createHash('sha256')
    .update(jobDescription.replace(/\s+/g, ' ').trim().toLowerCase())
    .digest('hex');
}

function summarize(record: AtsReportRecord): AtsReportSummary {
  const { result: _omitted, ...summary } = record;
  return summary;
}

/* ── JSON fallback, serialized so concurrent writers cannot clobber ── */
let writeChain: Promise<void> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(() => undefined, () => undefined);
  return run;
}

async function readAll(): Promise<AtsReportRecord[]> {
  return readJsonFile<AtsReportRecord[]>(reportsPath, []);
}

/**
 * Persist one evaluation.
 *
 * `createdAt` is passed IN rather than read from the clock here, so this
 * function stays testable and the caller owns the timestamp. Best-effort by
 * design: a history write that fails must never turn a successful evaluation
 * into an error response.
 */
export async function saveAtsReport(record: AtsReportRecord): Promise<void> {
  const db = await getMongoDb();
  assertPersistenceAvailable(Boolean(db));
  if (db) {
    await ensureIndexes(db);
    await db.collection(COL).replaceOne({ _id: record.id as never }, { ...record, _id: record.id }, { upsert: true });
    /* Trim the oldest beyond the ceiling, for this user only. */
    const excess = await db.collection(COL)
      .find({ userId: record.userId }, { projection: { _id: 1 } })
      .sort({ createdAt: -1, _id: -1 })
      .skip(MAX_REPORTS_PER_USER)
      .toArray();
    if (excess.length) {
      await db.collection(COL).deleteMany({ _id: { $in: excess.map((d) => d._id) } });
    }
    return;
  }
  await serialize(async () => {
    const all = await readAll();
    const others = all.filter((r) => r.id !== record.id);
    const mine = [record, ...others.filter((r) => r.userId === record.userId)]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_REPORTS_PER_USER);
    const theirs = others.filter((r) => r.userId !== record.userId);
    await writeJsonFile(reportsPath, [...mine, ...theirs]);
  });
}

/**
 * One page of a member's history, newest first.
 *
 * `userId` is part of the query, so another member's reports are never read.
 */
export async function listAtsReports(
  userId: string,
  { limit = HISTORY_PAGE_SIZE, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<{ items: AtsReportSummary[]; total: number }> {
  /* Clamped, never trusted: a caller asking for 10,000 rows or a negative
     offset gets one page from the start. */
  const size = Math.max(1, Math.min(HISTORY_PAGE_SIZE, Math.floor(limit) || HISTORY_PAGE_SIZE));
  const skip = Math.max(0, Math.min(Math.floor(offset) || 0, MAX_REPORTS_PER_USER));

  const db = await getMongoDb();
  assertPersistenceAvailable(Boolean(db));
  if (db) {
    await ensureIndexes(db);
    const [docs, total] = await Promise.all([
      db.collection<AtsReportRecord>(COL)
        /* `result` is excluded: a list of twenty full reports would be a large
           payload for a screen that shows five fields per row. */
        .find({ userId }, { projection: { result: 0 } })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip).limit(size)
        .toArray(),
      db.collection(COL).countDocuments({ userId }),
    ]);
    return {
      items: docs.map((doc) => {
        const { _id: _unused, ...rest } = doc as AtsReportRecord & { _id?: unknown };
        return rest as AtsReportSummary;
      }),
      total,
    };
  }

  const mine = (await readAll())
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { items: mine.slice(skip, skip + size).map(summarize), total: mine.length };
}

/** One report, or null. Scoped by userId, so another member's id resolves to null. */
export async function getAtsReport(userId: string, id: string): Promise<AtsReportRecord | null> {
  const db = await getMongoDb();
  assertPersistenceAvailable(Boolean(db));
  if (db) {
    const doc = await db.collection<AtsReportRecord>(COL).findOne({ _id: id as never, userId });
    if (!doc) return null;
    const { _id: _unused, ...rest } = doc as AtsReportRecord & { _id?: unknown };
    return rest as AtsReportRecord;
  }
  return (await readAll()).find((r) => r.id === id && r.userId === userId) ?? null;
}

/** Delete one report. Returns false when it does not exist FOR THIS USER. */
export async function deleteAtsReport(userId: string, id: string): Promise<boolean> {
  const db = await getMongoDb();
  assertPersistenceAvailable(Boolean(db));
  if (db) {
    const res = await db.collection(COL).deleteOne({ _id: id as never, userId });
    return res.deletedCount > 0;
  }
  return serialize(async () => {
    const all = await readAll();
    const next = all.filter((r) => !(r.id === id && r.userId === userId));
    if (next.length === all.length) return false;
    await writeJsonFile(reportsPath, next);
    return true;
  });
}

/**
 * Build the stored record from an evaluation.
 *
 * The score fields are copied FROM THE SERVER'S OWN RESULT. Nothing a client
 * sent can reach them — there is no path by which a caller supplies a score.
 */
export function buildAtsReportRecord(params: {
  id: string;
  userId: string;
  resumeId: string | null;
  resumeName: string | null;
  jobTitle: string;
  jobDescription: string;
  createdAt: string;
  result: AtsApiResponse;
}): AtsReportRecord {
  const { result } = params;
  return {
    id: params.id,
    userId: params.userId,
    resumeId: params.resumeId,
    resumeName: params.resumeName,
    jobTitle: params.jobTitle || result.alignment.jdTitle || 'Untitled role',
    jobDescriptionHash: hashJobDescription(params.jobDescription),
    overallScore: result.score,
    label: result.label,
    keywordScore: result.breakdown.keyword.score,
    experienceScore: result.breakdown.experience.score,
    alignmentScore: result.breakdown.alignment.score,
    resumeQualityScore: result.resumeQuality.score,
    parsingCap: result.breakdown.parsingCap,
    createdAt: params.createdAt,
    result,
  };
}
