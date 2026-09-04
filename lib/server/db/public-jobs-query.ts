/**
 * The public job feed, answered inside MongoDB.
 *
 * ═══ THE PROBLEM ═══
 *
 * Every posting lives in ONE `app_state` document — 5,276 jobs, ~12 MB, of
 * which descriptions are the bulk. A document is the smallest unit Mongo
 * returns, and `paginate()` slices in JavaScript AFTER the read, so asking for
 * one row cost the entire corpus. Measured cold against the live cluster:
 * 145,623 ms to transfer 12 MB for a `pageSize=1` request.
 *
 * ═══ WHY NOT THE `hiring_jobs` COLLECTION ═══
 *
 * One document per job would allow real `$match`/`$sort`/`$skip`/`$limit` with
 * indexes, and that collection exists. It is a MIRROR, and it is currently
 * BEHIND: 5,118 rows against 5,276 live postings. Pointing the feed at it today
 * would quietly drop 158 real jobs, and bringing it in step is a write
 * migration against live production data. So the feed stays on the source of
 * truth, and the work moves into the database instead of the data moving out.
 *
 * ═══ WHAT THIS DOES ═══
 *
 *     $filter    — active + every query filter, applied to the array in place
 *     $sortArray — the requested order, computed on a merged-in sort key
 *     $slice     — the requested page, and only it
 *     $map       — `publicJobView`'s allow-list, applied server-side
 *
 * plus `$size` of the filtered array for `total`. Descriptions still cross the
 * wire, because `publicJobView` returns them and dropping them would change the
 * response — but only for the ~20 postings on the page, not for all 5,276.
 *
 * ═══ EQUIVALENCE IS THE WHOLE CONTRACT ═══
 *
 * This must return exactly what `publicJobs()` returns. Every rule below is a
 * translation of that function, and `scripts/public-jobs-equivalence.selftest.ts`
 * INTERPRETS the pipeline this builds and requires it to agree with the real
 * `publicJobs()` on every fixture and query shape. The builder is therefore a
 * pure function of the query: it takes no database and performs no I/O, so the
 * thing under test is the thing that ships.
 *
 * Two translations are easy to get wrong and are named explicitly:
 *
 *   • `lower()` in queries.ts both LOWERCASES AND TRIMS, and coerces null and
 *     undefined to ''. `$toLower` alone does none of that, and errors outright
 *     on a numeric field. `lowerExpr()` reproduces all of it.
 *
 *   • Substring matching uses `$indexOfCP`, NOT `$regexMatch`. A regex built
 *     from `?search=` would let a visitor inject `.*` — or a catastrophically
 *     backtracking pattern — into a query that runs over every posting.
 *     `$indexOfCP` treats the needle as literal text, so there is nothing to
 *     escape and nothing to exploit.
 */
import type { PublicJobQuery } from '@/lib/server/job-api/queries';
import { pageParams } from '@/lib/server/job-api/queries';
import { getMongoDb } from '@/lib/server/database';

const APP_STATE_KEY = 'json:data/hiring-jobs.json';
const COL = 'app_state';

/** The field the sort key is merged onto. Never leaves the pipeline: the final
    `$map` is an allow-list and does not name it. */
const SORT_KEY = '__k';

/** queries.ts `lower()`: trim + lowercase, with null/undefined as ''. */
function lowerExpr(path: string): Record<string, unknown> {
  return { $trim: { input: { $toLower: { $ifNull: [{ $toString: path }, ''] } } } };
}

/**
 * A user-supplied value, forced to be DATA.
 *
 * In an aggregation expression a string beginning with `$` is a FIELD PATH, not
 * text. Dropping `?search=` or `?country=` in unwrapped would let a visitor
 * send `$value` or `$$j.title` and have Mongo resolve it against the document
 * instead of comparing against it — turning a filter into a query-logic
 * injection that can be used as a blind oracle over fields the API never
 * exposes. `$literal` says "this is a value", whatever it starts with.
 *
 * EVERY value that originates in the request must pass through here.
 */
function literal(value: string): Record<string, unknown> {
  return { $literal: value };
}

/** `haystack.includes(needle)` for an already-lowercased literal needle. */
function includesExpr(path: string, needle: string): Record<string, unknown> {
  return { $gte: [{ $indexOfCP: [lowerExpr(path), literal(needle)] }, 0] };
}

const lower = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/** `isJobActive`, translated — see `ACTIVE_JOB_COND` in hiring-jobs-rows.ts for
    why `$ne false` and the explicit empty-string case are both required. */
const ACTIVE = {
  $and: [
    { $eq: ['$$j.status', 'published'] },
    { $ne: ['$$j.isActive', false] },
    { $eq: [{ $ifNull: ['$$j.expiresAt', ''] }, ''] },
  ],
};

/** The sort key expression for each order publicJobs supports. */
function sortKeyExpr(sort: PublicJobQuery['sort']): { key: unknown; direction: 1 | -1 } {
  switch (sort) {
    /* (b.salaryMax ?? b.salaryMin ?? 0) - (a…) — descending numeric. */
    case 'salary':
      return { key: { $ifNull: ['$$j.salaryMax', { $ifNull: ['$$j.salaryMin', 0] }] }, direction: -1 };
    /* (b.domainConfidence ?? 0) - (a…) — descending numeric. */
    case 'relevance':
      return { key: { $ifNull: ['$$j.domainConfidence', 0] }, direction: -1 };
    /* String(b.postedAt ?? b.createdAt).localeCompare(String(a…)) — descending.
       Both sides compare well-formed ISO-8601 timestamps, which order
       identically under collation and under BSON string comparison because the
       first differing character is always a digit. */
    default:
      return { key: { $ifNull: ['$$j.postedAt', { $ifNull: ['$$j.createdAt', ''] }] }, direction: -1 };
  }
}

/** publicJobView's allow-list, as a `$map` projection. Kept in the same order
    as the function it mirrors so the two can be diffed by eye. */
export const PUBLIC_JOB_VIEW_FIELDS = [
  'id', 'title', 'organizationName', 'location', 'city', 'state', 'country',
  'isIndia', 'workMode', 'employmentType', 'experienceLevel', 'department',
  'description', 'responsibilities', 'requirements', 'preferredSkills',
  'domain', 'subDomain', 'salaryMin', 'salaryMax', 'salaryCurrency',
  'salaryPeriod', 'postedAt', 'createdAt', 'updatedAt', 'applyUrl', 'shareUrl',
] as const;

/**
 * Build the aggregation that answers one public feed query.
 *
 * PURE. No database, no I/O — so the equivalence self-test can interpret the
 * exact structure that ships.
 */
export function buildPublicJobsPipeline(query: PublicJobQuery = {}): Record<string, unknown>[] {
  const conds: unknown[] = [ACTIVE];

  const search = lower(query.search);
  if (search) {
    conds.push({
      $or: [
        includesExpr('$$j.title', search),
        includesExpr('$$j.organizationName', search),
        includesExpr('$$j.description', search),
        {
          $anyElementTrue: {
            $map: {
              input: { $ifNull: ['$$j.preferredSkills', []] },
              as: 's',
              in: includesExpr('$$s', search),
            },
          },
        },
      ],
    });
  }

  /* `eq()` in publicJobs: an absent filter matches everything. */
  const EQ: Array<[keyof PublicJobQuery, string]> = [
    ['country', 'country'], ['state', 'state'], ['domain', 'domain'],
    ['subDomain', 'subDomain'], ['workMode', 'workMode'],
    ['employmentType', 'employmentType'], ['experienceLevel', 'experienceLevel'],
  ];
  for (const [param, field] of EQ) {
    const want = lower(query[param]);
    if (want) conds.push({ $eq: [lowerExpr(`$$j.${field}`), literal(want)] });
  }

  /* City matches the RAW location too, so a multi-location posting stays
     findable by each of its cities — `job.city` is deliberately absent on
     those. */
  const city = lower(query.city);
  if (city) {
    conds.push({ $or: [{ $eq: [lowerExpr('$$j.city'), literal(city)] }, includesExpr('$$j.location', city)] });
  }

  const minSalary = Number(query.minSalary);
  if (Number.isFinite(minSalary) && minSalary > 0) {
    /* A posting that states NO salary is KEPT: absence is not evidence that it
       pays less than the filter. */
    conds.push({
      /* minSalary is a validated finite number by this point, so it carries no
         field-path risk; it is still the only request value not wrapped. */
      $let: {
        vars: { ceiling: { $ifNull: ['$$j.salaryMax', { $ifNull: ['$$j.salaryMin', null] }] } },
        in: { $or: [{ $eq: ['$$ceiling', null] }, { $gte: ['$$ceiling', minSalary] }] },
      },
    });
  }

  const { pageSize, skip } = pageParams(query.page, query.pageSize);
  const { key, direction } = sortKeyExpr(query.sort);

  const filtered = { $filter: { input: '$value', as: 'j', cond: { $and: conds } } };

  /* The sort key is merged onto each posting so `$sortArray` can order by it
     and by `id` for the tie-break, exactly as the JS comparators do. */
  const keyed = {
    $map: {
      input: filtered,
      as: 'j',
      in: { $mergeObjects: ['$$j', { [SORT_KEY]: key }] },
    },
  };

  const sorted = { $sortArray: { input: keyed, sortBy: { [SORT_KEY]: direction, id: 1 } } };
  const page = { $slice: [sorted, skip, pageSize] };

  return [
    { $match: { _id: APP_STATE_KEY } },
    {
      $project: {
        _id: 0,
        total: { $size: filtered },
        items: {
          $map: {
            input: page,
            as: 'j',
            in: Object.fromEntries(PUBLIC_JOB_VIEW_FIELDS.map((f) => [f, `$$j.${f}`])),
          },
        },
      },
    },
  ];
}

export interface PublicJobsPage {
  items: Record<string, unknown>[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * Run the feed query in the database.
 *
 * Returns null when Mongo is unconfigured, the document is absent, or the
 * aggregation cannot run — the caller then falls back to the in-process path.
 * `null` means "ask the normal way", NEVER "there are no jobs".
 */
export async function selectPublicJobsPage(query: PublicJobQuery = {}): Promise<PublicJobsPage | null> {
  const db = await getMongoDb();
  if (!db) return null;
  try {
    const docs = await db.collection(COL).aggregate(buildPublicJobsPipeline(query)).toArray();
    const row = docs[0] as { total?: unknown; items?: unknown } | undefined;
    if (!row || !Array.isArray(row.items) || typeof row.total !== 'number') return null;
    const { page, pageSize } = pageParams(query.page, query.pageSize);
    return { items: row.items as Record<string, unknown>[], page, pageSize, total: row.total };
  } catch {
    /* A projection failure must never take the feed down — fall back. */
    return null;
  }
}
