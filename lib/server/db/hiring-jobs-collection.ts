/**
 * Collection-backed reads for hiring jobs — PREPARED, NOT YET IN USE.
 *
 * STATUS: opt-in. Nothing in the app imports these yet and no storage adapter
 * is registered for `hiringJobsPath`, so production reads are unchanged and
 * still served from the `app_state` document. This module exists so the
 * collection can be measured and validated before that switch is considered.
 *
 * WHY A COLLECTION AT ALL
 * -----------------------
 * `app_state` holds every posting in ONE ~2.7 MB document, and a document is
 * the smallest unit Mongo returns. `lib/server/db/hiring-jobs-rows.ts` already
 * works around that with server-side `$map` projections, which got the marquee
 * to 3 KB. The remaining case it CANNOT fix well is ranking, which needs a
 * field from nearly every job — with one document that means shipping all of
 * it; with one document per job, Mongo can project per document.
 *
 * WHAT THIS DOES **NOT** SOLVE — RANKING
 * --------------------------------------
 * A projected ranking read was prototyped here and REMOVED, because measuring
 * it disproved the idea. The reasoning was that `recommendMatch` only needs
 * `description` when a job has no skills/keywords (0 of 360 jobs) plus a
 * `length >= 200` check, so a computed length could replace 2.4 MB of prose.
 *
 * Scores did come out identical — 0/45 sampled jobs differed. But
 * `matchReasons` differed on 42/45. The scorer's reason line
 *
 *     if (matched.length) …
 *     else if (textHits) `${textHits} profile skills referenced`
 *
 * reaches the text fallback whenever no DECLARED skill matched, whether or not
 * the job has keywords — 43 of 45 sampled jobs. That reason is rendered on the
 * job cards, so dropping descriptions from the ranking read would visibly
 * change the product while leaving the score intact.
 *
 * Conclusion: the ranking path still needs full descriptions. A collection does
 * not fix that on its own; only computing `textHits` inside the query (moving
 * scorer logic into the database) would, and that is a change to the algorithm's
 * implementation, not a transport optimization.
 *
 * FALLBACK CONTRACT
 * -----------------
 * Every selector returns `null` when Mongo is unconfigured or the collection has
 * not been migrated, matching `selectUserPresenceRows`. `null` means "ask the
 * normal way", never "there is no data".
 */
import type { HiringJobPosting } from '@/types/document';
import { getMongoDb } from '@/lib/server/database';

const COL = 'hiring_jobs';
const PUBLISHED = { status: 'published' } as const;

/** Strips Mongo's `_id` and this module's own bookkeeping field. */
function strip<T extends Record<string, unknown>>(doc: T): Omit<T, '_id' | 'migratedAt'> {
  const { _id: _a, migratedAt: _b, ...rest } = doc as Record<string, unknown>;
  return rest as Omit<T, '_id' | 'migratedAt'>;
}

/**
 * Whether the collection has been migrated and can serve reads.
 *
 * Deliberately a cheap `countDocuments` with a limit rather than a full read —
 * this is the guard a caller checks before preferring the collection.
 */
export async function hiringJobsCollectionReady(): Promise<boolean> {
  const db = await getMongoDb();
  if (!db) return false;
  try {
    return (await db.collection(COL).countDocuments({}, { limit: 1 })) > 0;
  } catch {
    return false;
  }
}

/** Published-job count without transferring a single job. */
export async function countPublishedJobs(): Promise<number | null> {
  const db = await getMongoDb();
  if (!db) return null;
  try {
    return await db.collection(COL).countDocuments(PUBLISHED);
  } catch {
    return null;
  }
}

/** The card fields, matching `toPublicHiringJobListItem`. */
const LIST_PROJECTION = {
  _id: 0,
  id: 1, title: 1, organizationName: 1, location: 1, department: 1,
  employmentType: 1, workMode: 1, experienceLevel: 1,
  preferredSkills: 1, applyUrl: 1, shareUrl: 1, createdAt: 1, updatedAt: 1,
} as const;

export async function selectPublishedJobListDocs(): Promise<HiringJobPosting[] | null> {
  const db = await getMongoDb();
  if (!db) return null;
  try {
    const docs = await db.collection(COL)
      .find(PUBLISHED, { projection: LIST_PROJECTION })
      .sort({ createdAt: -1 })
      .toArray();
    return docs as unknown as HiringJobPosting[];
  } catch {
    return null;
  }
}

/** Employer names only — the marquee's entire input. */
export async function selectPublishedCompanyNames(): Promise<string[] | null> {
  const db = await getMongoDb();
  if (!db) return null;
  try {
    const docs = await db.collection(COL)
      .find(PUBLISHED, { projection: { _id: 0, organizationName: 1 } })
      .toArray();
    return docs.map((d) => String((d as { organizationName?: string }).organizationName ?? ''));
  } catch {
    return null;
  }
}

/** One job, whole — a single indexed `_id` lookup. */
export async function selectPublishedJobDocById(
  id: string,
): Promise<{ job: HiringJobPosting | null } | null> {
  const db = await getMongoDb();
  if (!db) return null;
  if (!id) return { job: null };
  try {
    const doc = await db.collection(COL).findOne({ _id: id as never, ...PUBLISHED });
    return { job: doc ? (strip(doc as Record<string, unknown>) as unknown as HiringJobPosting) : null };
  } catch {
    return null;
  }
}
