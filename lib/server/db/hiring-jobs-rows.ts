/**
 * Projected reads for the hiring-jobs store.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every published posting lives in ONE `app_state` document
 * (`json:data/hiring-jobs.json`), currently ~2.7 MB across 360 jobs, of which
 * ~2.4 MB is `description`. `readJsonFile()` can only return that document
 * whole, so the marquee — which needs nothing but company names — paid for all
 * of it, as did the job list and a single job-detail lookup. Measured cold
 * against the live cluster: 48.5 s and 2737 KB, every time.
 *
 * WHY NOT A COLLECTION MIGRATION
 * ------------------------------
 * The obvious fix is to move each job into its own row in a `hiring_jobs`
 * collection, the way `users` and `user_profiles` already are. That is a
 * migration of live production data, and it would put the jobs feed at risk for
 * a window: `readJsonFile()` returns an adapter's result verbatim, so a
 * registered adapter over an empty collection reads as "no jobs" rather than
 * falling back. It is the right long-term shape, not the smallest safe step.
 *
 * WHAT THIS DOES INSTEAD
 * ----------------------
 * The document stays exactly where it is, in exactly its current shape, and
 * nothing about the write path changes. Mongo is simply asked to reduce the
 * array server-side — `$filter` to published, `$map` to the wanted fields — so
 * only the projection crosses the wire. Same storage, same semantics, a
 * fraction of the bytes:
 *
 *     company names     313 ms      3.1 KB    (was 48.5 s / 2737 KB)
 *     list fields      3579 ms    178.4 KB
 *     one job by id     326 ms      6.8 KB
 *
 * FALLBACK CONTRACT
 * -----------------
 * Every selector returns `null` when Mongo is not configured or the document is
 * absent — the same contract `selectUserPresenceRows` uses — so the caller
 * falls back to the existing full read and behaviour is unchanged. `null` means
 * "ask the normal way", never "there is no data".
 */
import type { HiringJobPosting } from '@/types/document';
import { getMongoDb } from '@/lib/server/database';

/** The single app_state document that holds every hiring job. */
const APP_STATE_KEY = 'json:data/hiring-jobs.json';
const COL = 'app_state';

/** Only published postings are ever projected — the same gate the app applies. */
const PUBLISHED = { $eq: ['$$j.status', 'published'] };

/** The card fields, kept in step with `toPublicHiringJobListItem`. */
export const JOB_LIST_FIELDS = [
  'id', 'title', 'organizationName', 'location', 'department',
  'employmentType', 'workMode', 'experienceLevel',
  'preferredSkills', 'applyUrl', 'shareUrl', 'createdAt', 'updatedAt',
] as const;

export type HiringJobListRow = Pick<HiringJobPosting, typeof JOB_LIST_FIELDS[number]>;

/** `{ id: '$$j.id', title: '$$j.title', … }` for the aggregation's `$map`. */
function projectFields(fields: readonly string[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f, `$$j.${f}`]));
}

/**
 * Runs one aggregation against the jobs document and returns the single
 * projected result, or null when it cannot be served this way.
 */
async function project<T>(stage: Record<string, unknown>): Promise<T | null> {
  const db = await getMongoDb();
  if (!db) return null;
  try {
    const docs = await db.collection(COL).aggregate([
      { $match: { _id: APP_STATE_KEY as never } },
      { $project: { _id: 0, ...stage } },
    ]).toArray();
    const value = docs[0]?.value;
    return value === undefined || value === null ? null : (value as T);
  } catch {
    // A projection failure must never take the feed down — fall back instead.
    return null;
  }
}

/**
 * The company name of every published posting, and nothing else.
 *
 * What the trusted-companies marquee needs: 3 KB rather than 2.7 MB. Names are
 * returned raw and unsorted; grouping and logo resolution stay with the caller
 * so the derivation rules live in one place.
 */
export async function selectPublishedJobCompanyNames(): Promise<string[] | null> {
  return project<string[]>({
    value: {
      $map: {
        input: { $filter: { input: '$value', as: 'j', cond: PUBLISHED } },
        as: 'j',
        in: '$$j.organizationName',
      },
    },
  });
}

/**
 * Every published posting, projected to the fields a listing card renders.
 *
 * Drops `description`, `responsibilities` and `requirements` — 93% of the
 * document and nothing a card reads.
 */
export async function selectPublishedJobListRows(): Promise<HiringJobListRow[] | null> {
  return project<HiringJobListRow[]>({
    value: {
      $map: {
        input: { $filter: { input: '$value', as: 'j', cond: PUBLISHED } },
        as: 'j',
        in: projectFields(JOB_LIST_FIELDS),
      },
    },
  });
}

/**
 * One published posting, whole, without transferring the other 359.
 *
 * The detail page needs every field, so this projects no fields away — it just
 * selects the single matching element inside the array server-side.
 *
 * Returns `null` when the projection is unavailable (fall back), and
 * `{ job: null }` when it ran and the job genuinely does not exist.
 */
export async function selectPublishedJobRowById(
  id: string,
): Promise<{ job: HiringJobPosting | null } | null> {
  if (!id) return { job: null };
  const found = await project<HiringJobPosting[]>({
    value: {
      $filter: {
        input: '$value',
        as: 'j',
        cond: { $and: [PUBLISHED, { $eq: ['$$j.id', id] }] },
      },
    },
  });
  if (found === null) return null;
  return { job: found[0] ?? null };
}

/**
 * How many postings the public feed would return with no filters applied.
 *
 * ═══ WHY THIS EXISTS ═══
 *
 * The onboarding opportunity counter needs ONE NUMBER — the feed's `total`.
 * Getting it used to mean `/api/jobs/public?pageSize=1`, which loads the whole
 * corpus, filters it, sorts it, and throws all but one row away. Measured cold
 * against the live cluster the corpus read alone was 136 s / 12.01 MB, because
 * a document is the smallest unit Mongo returns and `paginate()` slices in JS
 * *after* everything has already crossed the wire. A `pageSize` of 1 saves
 * nothing.
 *
 * Here Mongo counts inside the document and returns an integer.
 *
 * ═══ THE PREDICATE IS `isJobActive`, TRANSLATED — NOT REINVENTED ═══
 *
 * lifecycle.ts is the single definition of active:
 *
 *     status === 'published' && isActive !== false && !expiresAt
 *
 * Each clause maps across exactly, including the parts that are easy to get
 * subtly wrong:
 *
 *   • `isActive !== false` is NOT `isActive === true`. A posting with the field
 *     absent is active, and `$ne` keeps it; `$eq: true` would silently drop
 *     every job that never set the flag.
 *
 *   • `!expiresAt` is JavaScript truthiness, and Mongo's `$not` does not agree
 *     with it: an EMPTY STRING is falsy in JS but truthy in an aggregation. So
 *     the absent/null/'' cases are named explicitly via `$ifNull` rather than
 *     left to `$not`, which would have counted `expiresAt: ''` as expired and
 *     quietly undercounted.
 *
 * A drift here would put a wrong number on the first screen a user sees, so
 * `scripts/onboarding-job-count.selftest.ts` runs this predicate and the real
 * `isJobActive` over the same fixtures and requires identical answers.
 *
 * Returns null when Mongo is unconfigured or the document is absent — "ask the
 * normal way", never "there are no jobs".
 */
export const ACTIVE_JOB_COND = {
  $and: [
    { $eq: ['$$j.status', 'published'] },
    { $ne: ['$$j.isActive', false] },
    { $eq: [{ $ifNull: ['$$j.expiresAt', ''] }, ''] },
  ],
};

export async function selectActiveJobCount(): Promise<number | null> {
  const value = await project<number>({
    value: { $size: { $filter: { input: '$value', as: 'j', cond: ACTIVE_JOB_COND } } },
  });
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
