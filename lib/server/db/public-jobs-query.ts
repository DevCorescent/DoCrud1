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
import { SK_NEWEST, SK_SALARY, SK_RELEVANCE } from '@/lib/server/db/public-sort-keys';
import type { PublicJobQuery } from '@/lib/server/job-api/queries';
import { pageParams } from '@/lib/server/job-api/queries';
import { getMongoDb } from '@/lib/server/database';

const APP_STATE_KEY = 'json:data/hiring-jobs.json';
const COL = 'app_state';
/** The canonical per-posting collection. */
const HIRING_JOBS_COL = 'hiring_jobs';

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
/**
 * How a field is addressed in each shape.
 *
 * The corpus lives in TWO places during the migration: as an array inside one
 * `app_state` document, where an element is bound to `$$j`, and as one document
 * per posting in `hiring_jobs`, where fields are addressed directly. The only
 * difference between the two pipelines is that prefix — every rule below is
 * built through this function so the semantics cannot fork. A second copy of
 * "what active means" or "how salary filters" is exactly how two sources start
 * answering the same question differently.
 */
export type FieldRef = (field: string) => string;
export const ARRAY_REF: FieldRef = (f) => `$$j.${f}`;
export const DOC_REF: FieldRef = (f) => `$${f}`;

const activeCond = (ref: FieldRef) => ({
  $and: [
    { $eq: [ref('status'), 'published'] },
    { $ne: [ref('isActive'), false] },
    { $eq: [{ $ifNull: [ref('expiresAt'), ''] }, ''] },
  ],
});

const ACTIVE = activeCond(ARRAY_REF);

/** The sort key expression for each order publicJobs supports. */
/** Which persisted field carries this sort mode's precomputed key. */
function persistedSortField(sort: PublicJobQuery['sort']): string {
  switch (sort) {
    case 'salary': return SK_SALARY;
    case 'relevance': return SK_RELEVANCE;
    default: return SK_NEWEST;
  }
}

function sortKeyExpr(sort: PublicJobQuery['sort'], ref: FieldRef = ARRAY_REF): { key: unknown; direction: 1 | -1 } {
  switch (sort) {
    /* (b.salaryMax ?? b.salaryMin ?? 0) - (a…) — descending numeric. */
    case 'salary':
      return { key: { $ifNull: [ref('salaryMax'), { $ifNull: [ref('salaryMin'), 0] }] }, direction: -1 };
    /* (b.domainConfidence ?? 0) - (a…) — descending numeric. */
    case 'relevance':
      return { key: { $ifNull: [ref('domainConfidence'), 0] }, direction: -1 };
    /* String(b.postedAt ?? b.createdAt).localeCompare(String(a…)) — descending.
       Both sides compare well-formed ISO-8601 timestamps, which order
       identically under collation and under BSON string comparison because the
       first differing character is always a digit. */
    default:
      return { key: { $ifNull: [ref('postedAt'), { $ifNull: [ref('createdAt'), ''] }] }, direction: -1 };
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
/**
 * Every filter the public feed applies, as aggregation conditions.
 *
 * SHARED by both pipelines. `publicJobs()` in queries.ts is the contract these
 * translate; `scripts/public-jobs-equivalence.selftest.ts` executes the result
 * against that function for 47 query shapes, so a change here that alters
 * behaviour fails there rather than reaching a visitor.
 */
export function buildPublicJobsConditions(query: PublicJobQuery, ref: FieldRef): unknown[] {
  const conds: unknown[] = [activeCond(ref)];

  const search = lower(query.search);
  if (search) {
    conds.push({
      $or: [
        includesExpr(ref('title'), search),
        includesExpr(ref('organizationName'), search),
        includesExpr(ref('description'), search),
        {
          $anyElementTrue: {
            $map: {
              input: { $ifNull: [ref('preferredSkills'), []] },
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
    if (want) conds.push({ $eq: [lowerExpr(ref(field)), literal(want)] });
  }

  /* City matches the RAW location too, so a multi-location posting stays
     findable by each of its cities — `job.city` is deliberately absent on
     those. */
  const city = lower(query.city);
  if (city) {
    conds.push({ $or: [{ $eq: [lowerExpr(ref('city')), literal(city)] }, includesExpr(ref('location'), city)] });
  }

  const minSalary = Number(query.minSalary);
  if (Number.isFinite(minSalary) && minSalary > 0) {
    /* A posting that states NO salary is KEPT: absence is not evidence that it
       pays less than the filter. */
    conds.push({
      /* minSalary is a validated finite number by this point, so it carries no
         field-path risk; it is still the only request value not wrapped. */
      $let: {
        vars: { ceiling: { $ifNull: [ref('salaryMax'), { $ifNull: [ref('salaryMin'), null] }] } },
        in: { $or: [{ $eq: ['$$ceiling', null] }, { $gte: ['$$ceiling', minSalary] }] },
      },
    });
  }

  return conds;
}

/**
 * Build the aggregation that answers one public feed query over the app_state
 * ARRAY. Pure — no database, no I/O.
 */
export function buildPublicJobsPipeline(query: PublicJobQuery = {}): Record<string, unknown>[] {
  const conds = buildPublicJobsConditions(query, ARRAY_REF);
  const { pageSize, skip } = pageParams(query.page, query.pageSize);
  const { key, direction } = sortKeyExpr(query.sort, ARRAY_REF);

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

/* ── The same query, over the hiring_jobs COLLECTION ──────────────────────*/

/**
 * Build the aggregation that answers one public feed query over one document
 * per posting.
 *
 * ═══ THE SEMANTICS ARE NOT RESTATED ═══
 *
 * Filters come from `buildPublicJobsConditions`, the sort key from
 * `sortKeyExpr` and the projection from `PUBLIC_JOB_VIEW_FIELDS` — the same
 * three sources the app_state pipeline uses, addressed through `DOC_REF`
 * instead of `ARRAY_REF`. Nothing about what a match IS is decided here; only
 * how the matching documents are gathered.
 *
 * ═══ WHY THE SHAPE DIFFERS ═══
 *
 *   $match  status         an indexable prefilter, so the planner can start
 *                          from `published_*` rather than reading everything
 *   $match  $expr          the exact conditions, which $expr cannot index but
 *                          which must not be approximated for speed
 *   $addFields sort key    postedAt ?? createdAt, computed exactly as the JS
 *                          comparator does
 *   $facet                 page and total in ONE round trip — `total` is the
 *                          count of everything matching, not of the page
 *
 * `$facet` matters for correctness as much as latency: computing `total` in a
 * second query could observe a different corpus if a write landed between them.
 */
export function buildPublicJobsCollectionPipeline(query: PublicJobQuery = {}): Record<string, unknown>[] {
  const conds = buildPublicJobsConditions(query, DOC_REF);
  const { pageSize, skip } = pageParams(query.page, query.pageSize);
  const { direction } = sortKeyExpr(query.sort, DOC_REF);

  return [
    /* Indexable prefilter. Redundant with the $expr below on purpose: it is
       what lets an index be used at all, and it can never widen the result
       because the $expr repeats it. */
    { $match: { status: 'published' } },
    { $match: { $expr: { $and: conds } } },
    /* Phase 2.7H: sort on the PERSISTED key rather than computing one.
       `$addFields` + a computed `$sort` forced MongoDB to derive a key for
       every match and sort them all in memory — 1,493 ms at 100K to return
       twenty rows, with published_newest/salary/relevance unused because no
       index can serve a computed expression.
       The stored key holds the identical coalesced value (see
       derivePublicSortKeys), so the ordering is unchanged and the index can
       now provide it. */
    { $sort: { [persistedSortField(query.sort)]: direction, id: 1 } },
    {
      $facet: {
        items: [
          { $skip: skip },
          { $limit: pageSize },
          /* Fields are COMPUTED (`$title`) rather than included (`1`).
             An inclusion projection returns keys in the stored document's
             order, which differs from the order the app_state pipeline builds;
             the values were identical but the serialised bodies were not. Naming
             each field as an expression constructs a new document in THIS
             order, so both stores emit byte-identical JSON and the dual-read
             comparator can stay strict instead of being taught to ignore a
             difference. A field that is absent is omitted by both, identically. */
          { $project: Object.fromEntries([['_id', 0], ...PUBLIC_JOB_VIEW_FIELDS.map((f) => [f, `$${f}`])]) },
        ],
        total: [{ $count: 'n' }],
      },
    },
  ];
}

/**
 * Run the feed query against `hiring_jobs`.
 *
 * Returns null when Mongo is unconfigured or the aggregation cannot run, so the
 * caller decides what to do — this function never invents a page and never
 * turns a failure into an empty feed.
 */
export async function selectPublicJobsPageFromCollection(
  query: PublicJobQuery = {},
): Promise<PublicJobsPage | null> {
  const db = await getMongoDb();
  if (!db) return null;
  try {
    const docs = await db.collection(HIRING_JOBS_COL)
      .aggregate(buildPublicJobsCollectionPipeline(query)).toArray();
    const row = docs[0] as { items?: unknown; total?: Array<{ n?: number }> } | undefined;
    if (!row || !Array.isArray(row.items)) return null;
    const { page, pageSize } = pageParams(query.page, query.pageSize);
    return {
      items: row.items as Record<string, unknown>[],
      page,
      pageSize,
      /* An empty $facet branch means zero matches — a real answer, not a
         failure. `total` is absent only when nothing matched. */
      total: Number(row.total?.[0]?.n ?? 0),
    };
  } catch {
    return null;
  }
}
