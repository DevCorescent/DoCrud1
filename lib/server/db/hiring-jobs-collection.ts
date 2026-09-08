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

/** Stable across key order, so a re-serialised but identical job hashes equal.
    Exported as `fingerprintJob` so the reconciliation planner and its dry-run
    decide "changed" with THIS function rather than a second copy that could
    drift from it. Pure — it hashes its argument and touches nothing else. */
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

export { fingerprint as fingerprintJob };

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

/** Marks the collection untrusted for the projection-based readers below.
    Since Phase 2.6+2.7E there is NO app_state fallback — the canonical reader
    throws instead — so the old wording would send an operator looking for a
    fallback that no longer exists. */
export function markHiringJobsCollectionStale(reason: string) {
  if (healthy) console.warn(`[hiring_jobs] collection marked untrusted: ${reason}`);
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
  employmentType: 1, workMode: 1, experienceLevel: 1,
  preferredSkills: 1, applyUrl: 1, shareUrl: 1, createdAt: 1, updatedAt: 1,
} as const;

/**
 * THE CANONICAL CORPUS: every job, every status, in board order.
 *
 * This is what `getHiringJobs()` now reads. Unlike the list selector below it
 * applies NO status filter and NO projection — employer paths need drafts and
 * closed postings, and ownership validation needs the whole document. The board
 * order is `_order` ascending, exactly as the app_state array order was.
 *
 * Throws rather than returning null. A failed canonical read must never be
 * mistaken for an empty board — that is the Phase 2.4 lesson, and it matters
 * more here than anywhere, because the corpus this returns is what write paths
 * reconcile against.
 */
/**
 * ONE job by id, any status. The targeted counterpart to selectAllJobDocs.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * Ownership validation, employer job detail and the applicant/contact routes
 * all needed a single posting and were reading the ENTIRE corpus to find it —
 * `(await getHiringJobs()).find(j => j.id === jobId)`. That was tolerable when
 * the corpus lived in one already-loaded document. Against a per-document
 * collection it means fetching every job to answer a question about one, which
 * at 100K is ~150 MB pulled into Node per request.
 *
 * `_id` is the primary key, so this is a single indexed lookup regardless of
 * corpus size.
 *
 * NO STATUS FILTER, deliberately: employers manage drafts and closed postings,
 * and `selectPublishedJobDocById` (which does filter) would make those
 * invisible to their owner. Callers apply their own visibility rules, exactly
 * as they did when scanning the full array.
 */
export async function selectJobDocById(id: string): Promise<HiringJobPosting | null> {
  if (!id) return null;
  const db = await getMongoDb();
  if (!db) throw new Error('canonical job store unavailable: no database');
  const doc = await db.collection(COL).findOne({ _id: id as never });
  return doc ? (strip(doc as Record<string, unknown>) as unknown as HiringJobPosting) : null;
}

export async function selectAllJobDocs(): Promise<HiringJobPosting[]> {
  const db = await getMongoDb();
  if (!db) throw new Error('canonical job store unavailable: no database');
  const docs = await db.collection(COL).find({}).sort(BY_ORDER).toArray();
  return docs.map((d) => strip(d as Record<string, unknown>) as unknown as HiringJobPosting);
}

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

/** What a recommendation card renders. LIST_PROJECTION plus `hiringUrgency`,
    which the card shows and the list view does not. */
const CARD_PROJECTION = {
  _id: 0,
  id: 1, title: 1, organizationName: 1, location: 1,
  employmentType: 1, workMode: 1, preferredSkills: 1,
  applyUrl: 1, createdAt: 1, hiringUrgency: 1,
} as const;

/**
 * The postings named by a stored recommendation, and nothing else.
 *
 * This is what makes reading from the precomputed store worth doing. Rebuilding
 * cards needs the CURRENT text of the ranked postings, but only of those — a
 * few hundred documents by _id, not the ~5,276-document corpus whose read was
 * measured at 145.6 s. Fetching the whole corpus to render a stored ranking
 * would spend the entire saving the store exists to create.
 *
 * Still filtered by PUBLISHED, so a posting unpublished since it was scored is
 * simply absent from the map and drops out of the rendered ranking rather than
 * being served from a stale record.
 *
 * Returns null when the replica cannot answer — never a partial map, which the
 * caller could not tell apart from "these postings are gone".
 */
export async function selectPublishedJobsByIds(
  ids: ReadonlyArray<string>,
): Promise<Map<string, HiringJobPosting> | null> {
  if (!healthy) return null;
  const db = await getMongoDb();
  if (!db) return null;
  const wanted = Array.from(new Set(ids.filter(Boolean)));
  if (wanted.length === 0) return new Map();
  try {
    const docs = await db.collection(COL)
      .find({ _id: { $in: wanted as never[] }, ...PUBLISHED }, { projection: CARD_PROJECTION })
      .toArray();
    const out = new Map<string, HiringJobPosting>();
    for (const doc of docs) {
      const job = strip(doc as Record<string, unknown>) as unknown as HiringJobPosting;
      /* Keyed by the posting's own `id`, NOT by `_id` — the projection drops
         `_id`, so keying on it would collapse every document onto one empty
         key and silently return a single job. */
      out.set(String((job as unknown as { id?: unknown }).id ?? ''), job);
    }
    out.delete('');
    return out;
  } catch {
    return null;
  }
}

/**
 * Phase 2.7B — write SOME jobs, without touching the rest.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * `saveHiringJobs()` takes the entire corpus and rewrites all of it to change
 * one posting. app_state is a single MongoDB document now at 12.28 MB against a
 * 16 MB hard limit, so that costs O(corpus) per write and puts a hard ceiling
 * near 6,800 jobs. This writes only what changed: O(changed).
 *
 * ═══ WHAT MAKES IT DIFFERENT FROM THE MIRROR BELOW ═══
 *
 * `mirrorPublishedJobs` ends by deleting everything absent from its input. That
 * is correct there — its input is the whole corpus by definition, so absence
 * really does mean "gone". It would be catastrophic here: this function's input
 * is ONE BATCH, and a scraper returning 40 of 5,276 jobs would delete 5,236
 * live postings.
 *
 * SO THIS FUNCTION NEVER DELETES ANYTHING. Absence of evidence is not evidence
 * of absence. Removal is a lifecycle decision made elsewhere, from positive
 * evidence that a posting is gone.
 *
 * ═══ POSITION IS THE CALLER'S TO KNOW, NOT THIS FUNCTION'S TO GUESS ═══
 *
 * `_order` is a position within the whole corpus, and the corpus is exactly
 * what a batch writer cannot see. It is not simply "append", either: an import
 * PREPENDS new postings (`[...valid, ...current]` in job-import.ts). Inventing
 * a position here would silently reorder the public feed, and leaving it unset
 * would be worse — the list read sorts on `_order` ascending, and a missing
 * value sorts FIRST, so every new job would jump to the top of the board.
 *
 * So `order` is required on insert and supplied by the caller, which is the
 * same arrangement as today: planIngest decides positions, this only records
 * them. On update the stored position is left alone unless a new one is given.
 *
 * ═══ NO app_state, ANYWHERE ═══
 *
 * Neither read nor written. That independence is the entire point of the phase.
 */
export interface UpsertJobInput {
  job: Record<string, unknown>;
  /** Corpus position. REQUIRED when the job is new — there is no safe default;
      see the note above `upsertHiringJobs`. Optional for a known job, whose
      stored position is then left untouched. */
  order?: number;
}

export interface UpsertResult {
  ok: boolean;
  /** Documents written because they were new or their fingerprint changed. */
  written: number;
  /** Jobs whose fingerprint already matched — no write was issued at all. */
  unchanged: number;
  /** Individual write failures from an unordered bulk. Never silently dropped. */
  failed: number;
  error?: string;
}

export async function upsertHiringJobs(
  inputs: ReadonlyArray<UpsertJobInput>,
): Promise<UpsertResult> {
  const empty: UpsertResult = { ok: true, written: 0, unchanged: 0, failed: 0 };
  if (!Array.isArray(inputs)) throw new Error('upsertHiringJobs: inputs must be an array');
  /* An empty batch is a no-op, NOT an instruction to empty the collection. */
  if (inputs.length === 0) return empty;

  const db = await getMongoDb();
  if (!db) return { ok: false, written: 0, unchanged: 0, failed: inputs.length, error: 'no database' };
  const col = db.collection(COL);

  const ids: string[] = [];
  for (const input of inputs) {
    const id = String((input?.job as { id?: unknown })?.id ?? '');
    /* A job with no id cannot be addressed. Skipping it silently is how a
       corpus quietly loses postings, so it is refused outright. */
    if (!id) throw new Error('upsertHiringJobs: a job without an id cannot be written');
    ids.push(id);
  }

  try {
    /* Fingerprints for THIS BATCH only — a bounded $in, never a full scan. */
    const priors = new Map<string, string | undefined>(
      (await col.find({ _id: { $in: ids as never[] } }, { projection: { _id: 1, [FP_FIELD]: 1 } }).toArray())
        .map((d) => [String(d._id), (d as Record<string, unknown>)[FP_FIELD] as string | undefined]),
    );

    const ops: Array<Record<string, unknown>> = [];
    let unchanged = 0;

    inputs.forEach((input, i) => {
      const id = ids[i];
      const fp = fingerprint(input.job);
      if (priors.get(id) === fp) { unchanged += 1; return; } // identical: no write

      const set: Record<string, unknown> = { ...input.job, _id: id, [FP_FIELD]: fp };
      /* Only stamp a position when the caller supplied one, so an update never
         moves a posting that the caller had no opinion about. */
      if (typeof input.order === 'number') set[ORDER_FIELD] = input.order;

      const update: Record<string, unknown> = { $set: set };
      /* A NEW document with no caller position is refused, not defaulted.
         Phase 2.7C established that there is no safe default: planIngest
         PREPENDS new postings (`jobs.unshift(record)`), so "append at the end"
         — the obvious guess, and this function's first draft — puts a new job
         at the opposite end of the board from where production puts it today.
         Leaving `_order` unset is worse still: the list read sorts ascending
         and a missing value sorts FIRST.
         Both choices silently reorder the public feed, so the caller must say. */
      if (typeof input.order !== 'number' && !priors.has(id)) {
        throw new Error(
          `upsertHiringJobs: job ${id} is new and no order was supplied — `
          + 'position must come from the caller (see planIngest)',
        );
      }
      /* A non-integer position would collide or sort unpredictably once the
         gaps are halved; positions come from lib/server/db/job-order.ts, which
         only ever produces integers. */
      if (typeof input.order === 'number' && !Number.isSafeInteger(input.order)) {
        throw new Error(`upsertHiringJobs: job ${id} was given a non-integer order`);
      }

      ops.push({ updateOne: { filter: { _id: id }, update, upsert: true } });
    });

    if (ops.length === 0) return { ok: true, written: 0, unchanged, failed: 0 };

    /* Unordered: one bad document must not abandon the rest of the batch. */
    const res = await col.bulkWrite(ops as never[], { ordered: false });
    const written = (res.upsertedCount ?? 0) + (res.modifiedCount ?? 0);
    const failed = Math.max(0, ops.length - written);

    healthy = true;
    return { ok: true, written, unchanged, failed };
  } catch (error) {
    /* A write failure is REPORTED, never returned as a successful empty write.
       Some documents may have been written before the failure, so the replica
       is marked untrusted rather than assumed intact. */
    const message = error instanceof Error ? error.message : 'bulk upsert failed';
    markHiringJobsCollectionStale(`upsert failed: ${message}`);
    return { ok: false, written: 0, unchanged: 0, failed: inputs.length, error: message };
  }
}

/**
 * Retire ONE named posting. The only way a job leaves the canonical store.
 *
 * ═══ WHY THIS IS NOT PART OF upsertHiringJobs ═══
 *
 * `upsertHiringJobs` cannot delete, and that refusal is the safety property the
 * whole of Phase 2.7 is built on: a batch writer that deletes what its input
 * omits will eventually be handed a truncated scrape and take the board down.
 *
 * But "an employer deleted their job" is a real operation with real evidence —
 * an authenticated owner asked for it. That deserves a primitive of its own,
 * not a loophole in the batch writer. The distinction is the architecture:
 *
 *     deleteMany({_id: {$nin: incoming}})  "remove everything I did not see"
 *     retireHiringJob(id)                  "remove this one, because I was told to"
 *
 * The first infers removal from absence. The second is told, names its target,
 * and can remove exactly one document because `_id` is unique.
 *
 * AUTHORIZATION IS THE CALLER'S. This is the storage primitive; the ownership
 * gate lives in removeHiringJob, which is where it already was. This function
 * is deliberately not exported as a general-purpose delete helper.
 */
export type RetireOutcome = 'retired' | 'not_found' | 'failed';

export interface RetireResult {
  outcome: RetireOutcome;
  error?: string;
}

export async function retireHiringJob(id: string): Promise<RetireResult> {
  if (!id || typeof id !== 'string') return { outcome: 'failed', error: 'no job id' };
  const db = await getMongoDb();
  if (!db) return { outcome: 'failed', error: 'no database' };
  try {
    /* deleteOne, by _id. Not deleteMany, not a filter that could widen: one
       named document, or nothing. */
    const res = await db.collection(COL).deleteOne({ _id: id as never });
    /* Already gone is NOT a failure — a retry of a delete that succeeded must
       be safe, or every network timeout becomes a stuck job. */
    return { outcome: (res.deletedCount ?? 0) > 0 ? 'retired' : 'not_found' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'retire failed';
    markHiringJobsCollectionStale(`retire failed: ${message}`);
    return { outcome: 'failed', error: message };
  }
}

/**
 * The smallest `_order` currently stored, or null when the collection is empty.
 *
 * Needed to place a new posting at the FRONT, which is where planIngest and the
 * employer create path both put one. Served from the index in a single read.
 */
export async function minJobOrder(): Promise<number | null> {
  const db = await getMongoDb();
  if (!db) return null;
  try {
    const row = await db.collection(COL)
      .find({}, { projection: { _id: 0, [ORDER_FIELD]: 1 } })
      .sort({ [ORDER_FIELD]: 1 }).limit(1).toArray();
    const value = (row[0] as Record<string, unknown> | undefined)?.[ORDER_FIELD];
    return typeof value === 'number' ? value : null;
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
