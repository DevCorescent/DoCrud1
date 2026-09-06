/**
 * Collection-backed reads for hiring jobs.
 *
 * STATUS: four read paths now prefer this collection — job detail by id, the
 * jobs list, the marquee's company names, and the published count. Ranking is
 * deliberately NOT among them and still reads the full app_state document.
 *
 * `app_state` REMAINS THE SOURCE OF TRUTH. No storage adapter is registered for
 * `hiringJobsPath`, so every write still goes there exactly as before; this
 * collection is a read replica kept in step by `mirrorPublishedJobs()` on the
 * one write funnel. If the replica is unavailable, stale-proof or errors, every
 * caller falls back to app_state — an unavailable collection must never read as
 * "there are no jobs".
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
import { createHash } from 'crypto';
import type { HiringJobPosting } from '@/types/document';
import { getMongoDb } from '@/lib/server/database';

const COL = 'hiring_jobs';
const PUBLISHED = { status: 'published' } as const;

/* Position in the app_state array, written by the migration and refreshed by
   every mirror. The jobs page renders the API's order as-is under its default
   sort, so the replica has to reproduce app_state's order exactly — Mongo's
   natural order is not a guarantee. */
const ORDER_FIELD = '_order';
const BY_ORDER = { [ORDER_FIELD]: 1 } as const;

/* Content fingerprint, so a mirror can tell which jobs actually changed instead
   of rewriting all 362 documents every time. Both write paths — the CSV import
   (which prepends new rows and leaves the rest untouched) and a single-job
   edit — change a handful of jobs and reposition the rest, so the difference
   between "rewrite everything" and "rewrite what changed" is ~2.7 MB vs a few
   KB of writes. */
const FP_FIELD = '_fp';

/** Stable across key order, so a re-serialised but identical job hashes equal. */
function fingerprint(job: Record<string, unknown>): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>).sort()
          .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
      );
    }
    return v ?? null;
  };
  return createHash('sha1').update(JSON.stringify(canonical(job))).digest('hex');
}

/* One failed mirror means the replica may be behind app_state. Rather than
   serve possibly-stale jobs, this process stops trusting the collection and
   falls back for the rest of its life; the next deploy or successful mirror
   starts clean. Deliberately conservative: staleness is invisible to users,
   and invisible wrongness is worse than a slower read. */
let healthy = true;

/** Reads may use the collection. False after a failed mirror. */
export function hiringJobsCollectionUsable(): boolean {
  return healthy;
}

/** Marks the replica untrusted, sending every read back to app_state. */
export function markHiringJobsCollectionStale(reason: string) {
  if (healthy) console.warn(`[hiring_jobs] falling back to app_state: ${reason}`);
  healthy = false;
}

/**
 * Strips Mongo's `_id` and this module's bookkeeping fields.
 *
 * `_order`, `_fp` and `migratedAt` exist only to keep the replica ordered,
 * diffable and traceable; letting any of them reach a caller would add a field
 * to the job-detail response that app_state never had. The self-test compares the two paths
 * byte for byte precisely to catch that.
 */
function strip<T extends Record<string, unknown>>(doc: T): Omit<T, '_id' | 'migratedAt' | '_order' | '_fp'> {
  const { _id: _a, migratedAt: _b, _order: _c, _fp: _d, ...rest } = doc as Record<string, unknown>;
  return rest as Omit<T, '_id' | 'migratedAt' | '_order' | '_fp'>;
}

/**
 * Whether the collection has been migrated and can serve reads.
 *
 * Deliberately a cheap `countDocuments` with a limit rather than a full read —
 * this is the guard a caller checks before preferring the collection.
 */
export async function hiringJobsCollectionReady(): Promise<boolean> {
  if (!healthy) return false;
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
  if (!healthy) return null;
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
  employmentType: 1, workMode: 1, experienceLevel: 1, hiringUrgency: 1,
  preferredSkills: 1, applyUrl: 1, shareUrl: 1, createdAt: 1, updatedAt: 1,
} as const;

export async function selectPublishedJobListDocs(): Promise<HiringJobPosting[] | null> {
  if (!healthy) return null;
  const db = await getMongoDb();
  if (!db) return null;
  try {
    const docs = await db.collection(COL)
      .find(PUBLISHED, { projection: LIST_PROJECTION })
      .sort(BY_ORDER)
      .toArray();
    return docs as unknown as HiringJobPosting[];
  } catch {
    return null;
  }
}

/** Employer names only — the marquee's entire input. */
export async function selectPublishedCompanyNames(): Promise<string[] | null> {
  if (!healthy) return null;
  const db = await getMongoDb();
  if (!db) return null;
  try {
    const docs = await db.collection(COL)
      .find(PUBLISHED, { projection: { _id: 0, organizationName: 1 } })
      .sort(BY_ORDER)
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
  if (!healthy) return null;
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

/**
 * Re-points the replica at what was just written to app_state.
 *
 * Called from `saveHiringJobs()` — the single write funnel — AFTER app_state has
 * been written, so app_state is always at least as fresh as this.
 *
 * DIFFERENTIAL, NOT WHOLESALE. It first reads a tiny `{_id, _fp, _order}`
 * projection (~30 KB) and then writes only:
 *   · jobs whose CONTENT changed — full document rewrite;
 *   · jobs that merely MOVED — a one-field `_order` update;
 *   · jobs no longer in app_state — deleted, because a removed job must not
 *     keep being served from the replica.
 * A CSV import of two rows therefore writes two documents plus a few hundred
 * tiny order stamps, rather than re-uploading every posting.
 *
 * Correctness is not traded for speed: anything whose fingerprint differs is
 * rewritten in full, so a changed job can never survive as a stale copy.
 *
 * Returns false on any failure, which marks the replica untrusted; the caller
 * does not treat that as a write failure, because the write itself succeeded.
 */
export async function mirrorPublishedJobs(
  jobs: Array<Record<string, unknown>>,
): Promise<{ ok: boolean; rewritten: number; reordered: number; removed: number }> {
  const failed = { ok: false, rewritten: 0, reordered: 0, removed: 0 };
  const db = await getMongoDb();
  if (!db) return failed;

  try {
    const usable = jobs.filter((j) => typeof j?.id === 'string' && j.id);
    if (usable.length !== jobs.length) {
      markHiringJobsCollectionStale('a job without an id cannot be mirrored');
      return failed;
    }

    const col = db.collection(COL);
    /* Small projection: ids, fingerprints and positions only. */
    const existing = new Map<string, { fp?: string; order?: number }>(
      (await col.find({}, { projection: { _id: 1, [FP_FIELD]: 1, [ORDER_FIELD]: 1 } }).toArray())
        .map((d) => [
          String(d._id),
          { fp: (d as Record<string, unknown>)[FP_FIELD] as string | undefined,
            order: (d as Record<string, unknown>)[ORDER_FIELD] as number | undefined },
        ]),
    );

    const ids: string[] = [];
    const ops: Array<Record<string, unknown>> = [];
    let rewritten = 0;
    let reordered = 0;

    usable.forEach((job, index) => {
      const id = String(job.id);
      ids.push(id);
      const fp = fingerprint(job);
      const prior = existing.get(id);

      if (!prior || prior.fp !== fp) {
        // New or genuinely changed — write the whole document.
        ops.push({
          updateOne: {
            filter: { _id: id },
            update: { $set: { ...job, _id: id, [ORDER_FIELD]: index, [FP_FIELD]: fp } },
            upsert: true,
          },
        });
        rewritten += 1;
      } else if (prior.order !== index) {
        // Identical content that merely shifted position — stamp the order only.
        ops.push({
          updateOne: { filter: { _id: id }, update: { $set: { [ORDER_FIELD]: index } } },
        });
        reordered += 1;
      }
    });

    if (ops.length) await col.bulkWrite(ops as never[], { ordered: false });

    /* A job removed from app_state must disappear here too — app_state remains
       the source of truth for what exists. */
    const removal = await col.deleteMany({ _id: { $nin: ids as never[] } });

    healthy = true;
    return { ok: true, rewritten, reordered, removed: removal.deletedCount ?? 0 };
  } catch (error) {
    markHiringJobsCollectionStale(error instanceof Error ? error.message : 'mirror failed');
    return failed;
  }
}

/**
 * A cheap fingerprint of the published job set, for deciding whether a warm
 * in-memory corpus is still current.
 *
 * WHY: the corpus is ~2.7 MB and costs ~43 s to re-read on this link. Expiring
 * it on a timer means paying that repeatedly even when nothing changed; never
 * expiring it means a job posted on ANOTHER instance is invisible to this one
 * for the life of the process, because explicit invalidation is in-process
 * only. This probe resolves both: ~50 bytes on the wire says whether a reload
 * is needed at all.
 *
 * `count` catches creates and deletes; `maxUpdatedAt` catches edits, publishes
 * and unpublishes, which change a timestamp without changing the count. Both
 * stores that feed the corpus are covered — hiring jobs and the Business Page
 * jobs merged in alongside them.
 *
 * Returns null when it cannot be determined, and the caller then treats the
 * corpus as stale rather than assuming it is fresh.
 */
export interface CorpusVersion { count: number; maxUpdatedAt: string }

export async function readHiringCorpusVersion(): Promise<CorpusVersion | null> {
  const db = await getMongoDb();
  if (!db) return null;
  try {
    const summarise = async (collection: string, match: Record<string, unknown>) => {
      const rows = await db.collection(collection).aggregate([
        { $match: match },
        { $group: { _id: null, count: { $sum: 1 }, maxUpdatedAt: { $max: '$updatedAt' } } },
      ]).toArray();
      const row = rows[0] as { count?: number; maxUpdatedAt?: unknown } | undefined;
      return {
        count: Number(row?.count ?? 0),
        maxUpdatedAt: typeof row?.maxUpdatedAt === 'string' ? row.maxUpdatedAt : '',
      };
    };

    const [hiring, business] = await Promise.all([
      summarise(COL, PUBLISHED),
      /* Business Page jobs use 'open' for their live state — see
         mapBusinessJobToFeedJob in lib/server/hiring.ts. */
      summarise('business_page_jobs', { status: 'open' }),
    ]);

    return {
      count: hiring.count + business.count,
      maxUpdatedAt: hiring.maxUpdatedAt > business.maxUpdatedAt ? hiring.maxUpdatedAt : business.maxUpdatedAt,
    };
  } catch {
    return null;
  }
}
