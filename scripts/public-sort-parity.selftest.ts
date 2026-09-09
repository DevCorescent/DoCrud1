/**
 * Phase 2.7H — does the persisted sort key order the board identically?
 *
 * Run: npm run test:public-sort-parity
 *
 * The old pipeline computed `postedAt ?? createdAt` (and the salary/relevance
 * equivalents) with `$addFields` and sorted on the result. The new one sorts on
 * a stored copy of the same value. That is only safe if the two produce the
 * SAME ORDER — not a similar one — so this compares exact ordered id lists,
 * page by page, across every sort mode, against data chosen to break a sloppy
 * derivation: missing dates, empty strings, equal values, zero salaries.
 *
 * Runs against a real isolated mongod, because the question is what MongoDB
 * does with these documents, not what a model of it would do.
 */
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';
import {
  derivePublicSortKeys, sortKeysAreCurrent, SK_NEWEST, SK_SALARY, SK_RELEVANCE,
} from '../lib/server/db/public-sort-keys';

let passed = 0, failed = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

/* ── the derivation, tested as a pure function first ─────────────────────── */
{
  const k = derivePublicSortKeys;
  check('newest prefers postedAt', k({ postedAt: 'B', createdAt: 'A' })[SK_NEWEST] === 'B');
  check('newest falls back to createdAt', k({ createdAt: 'A' })[SK_NEWEST] === 'A');
  check('newest with neither is the empty string', k({})[SK_NEWEST] === '');
  /* $ifNull does NOT skip '' — it returns it. The parity harness caught this
     when an empty postedAt sorted differently under old and new queries. */
  check('an EMPTY postedAt is KEPT, because $ifNull only skips null/missing',
    k({ postedAt: '', createdAt: 'A' })[SK_NEWEST] === '');
  check('salary prefers salaryMax', k({ salaryMax: 9, salaryMin: 1 })[SK_SALARY] === 9);
  check('salary falls back to salaryMin', k({ salaryMin: 1 })[SK_SALARY] === 1);
  check('salary with neither is 0', k({})[SK_SALARY] === 0);
  check('a zero salaryMax is kept, not treated as absent', k({ salaryMax: 0, salaryMin: 5 })[SK_SALARY] === 0);
  check('a non-numeric salary is passed through, as $ifNull would',
    (k({ salaryMax: 'abc', salaryMin: 5 })[SK_SALARY] as unknown) === 'abc');
  check('relevance defaults to 0', k({})[SK_RELEVANCE] === 0);
  check('relevance keeps a real value', k({ domainConfidence: 0.42 })[SK_RELEVANCE] === 0.42);
  check('sortKeysAreCurrent detects a stale key',
    !sortKeysAreCurrent({ postedAt: 'B', [SK_NEWEST]: 'A', [SK_SALARY]: 0, [SK_RELEVANCE]: 0 }));
  check('and accepts a correct one',
    sortKeysAreCurrent({ postedAt: 'B', [SK_NEWEST]: 'B', [SK_SALARY]: 0, [SK_RELEVANCE]: 0 }));
}

/* ── data designed to expose ordering mistakes ───────────────────────────── */
const FIXTURES: Array<Record<string, unknown>> = [
  { id: 'a-normal', postedAt: '2026-03-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z', salaryMax: 900000, domainConfidence: 0.9 },
  { id: 'b-no-postedAt', createdAt: '2026-04-01T00:00:00.000Z', salaryMin: 500000, domainConfidence: 0.5 },
  { id: 'c-no-dates', salaryMax: 100000, domainConfidence: 0.1 },
  { id: 'd-empty-postedAt', postedAt: '', createdAt: '2026-02-01T00:00:00.000Z', salaryMax: 700000 },
  { id: 'e-tie-date', postedAt: '2026-03-01T00:00:00.000Z', salaryMax: 900000, domainConfidence: 0.9 },
  { id: 'f-tie-date-2', postedAt: '2026-03-01T00:00:00.000Z', salaryMax: 900000, domainConfidence: 0.9 },
  { id: 'g-zero-salary', postedAt: '2026-05-01T00:00:00.000Z', salaryMax: 0, salaryMin: 800000 },
  { id: 'h-no-salary', postedAt: '2026-06-01T00:00:00.000Z' },
  { id: 'i-no-relevance', postedAt: '2026-07-01T00:00:00.000Z', salaryMax: 300000 },
  { id: 'j-old', postedAt: '2020-01-01T00:00:00.000Z', salaryMax: 1200000, domainConfidence: 1 },
];

async function main() {
  const mongo = await startTestMongo();
  try {
    if (!isIsolatedTestMongo()) { console.error('not isolated'); process.exit(1); }
    const { getMongoDb } = await import('@/lib/server/database');
    const { upsertHiringJobs } = await import('@/lib/server/db/hiring-jobs-collection');
    const { selectPublicJobsPageFromCollection } = await import('@/lib/server/db/public-jobs-query');
    const db = await getMongoDb();
    if (!db) throw new Error('no db');
    const col = db.collection('hiring_jobs');

    await upsertHiringJobs(FIXTURES.map((job, i) => ({
      job: {
        ...job, title: `Job ${job.id}`, organizationName: 'Acme', status: 'published',
        description: 'A role.', location: 'Pune', country: 'IN',
      },
      order: i * 1048576,
    })));

    /* ── the writer stamped every key ── */
    const docs = await col.find({}).toArray();
    check('the writer stamped a key on every document',
      docs.every((d) => d[SK_NEWEST] !== undefined && d[SK_SALARY] !== undefined && d[SK_RELEVANCE] !== undefined));
    check('and every stored key equals the derivation',
      docs.every((d) => sortKeysAreCurrent(d as Record<string, unknown>)),
      docs.filter((d) => !sortKeysAreCurrent(d as Record<string, unknown>)).map((d) => String(d._id)).join(','));
    check('the keys never reach a public payload',
      !JSON.stringify(await selectPublicJobsPageFromCollection({ pageSize: 50 }))
        .match(/_skNewest|_skSalary|_skRelevance/));

    /* ── OLD ordering, reproduced by the same aggregation the old code used ── */
    const oldOrder = async (sort: string | undefined, dir: 1 | -1, keyExpr: unknown) => {
      const rows = await col.aggregate([
        { $match: { status: 'published' } },
        { $addFields: { __k: keyExpr } },
        { $sort: { __k: dir, id: 1 } },
        { $project: { _id: 0, id: 1 } },
      ]).toArray();
      void sort;
      return rows.map((r) => String(r.id));
    };
    const NEW = async (sort: string | undefined, page = 1, pageSize = 50) =>
      (await selectPublicJobsPageFromCollection({ sort, page, pageSize } as never))!
        .items.map((j) => String((j as { id?: unknown }).id));

    const MODES: Array<[string | undefined, 1 | -1, unknown]> = [
      ['newest', -1, { $ifNull: ['$postedAt', { $ifNull: ['$createdAt', ''] }] }],
      ['salary', -1, { $ifNull: ['$salaryMax', { $ifNull: ['$salaryMin', 0] }] }],
      ['relevance', -1, { $ifNull: ['$domainConfidence', 0] }],
      [undefined, -1, { $ifNull: ['$postedAt', { $ifNull: ['$createdAt', ''] }] }],
    ];

    for (const [mode, dir, expr] of MODES) {
      const before = await oldOrder(mode, dir, expr);
      const after = await NEW(mode);
      check(`EXACT PARITY — sort=${mode ?? '(default)'}`,
        before.join(',') === after.join(','), `\n      old: ${before.join(',')}\n      new: ${after.join(',')}`);
    }

    /* ── paging must agree page by page, including the last ── */
    for (const mode of ['newest', 'salary', 'relevance']) {
      const full = await oldOrder(mode, -1, MODES.find((m) => m[0] === mode)![2]);
      for (const size of [3, 4]) {
        const pages = Math.ceil(full.length / size);
        for (let p = 1; p <= pages; p += 1) {
          const expected = full.slice((p - 1) * size, p * size);
          const actual = await NEW(mode, p, size);
          check(`parity — sort=${mode} page ${p}/${pages} size ${size}`,
            expected.join(',') === actual.join(','), `${expected.join(',')} vs ${actual.join(',')}`);
        }
      }
    }

    /* ── filters must not change the ordering contract ── */
    const filtered = await selectPublicJobsPageFromCollection({ country: 'IN', pageSize: 50 } as never);
    check('a filtered page still returns rows', (filtered?.items.length ?? 0) > 0);
    check('and its total is the filtered count', filtered?.total === FIXTURES.length);

    /* ── the index is actually used now ── */
    await col.createIndex({ status: 1, [SK_NEWEST]: -1, id: 1 }, { name: 'published_sk_newest' });
    const ex = await col.aggregate([
      { $match: { status: 'published' } },
      { $sort: { [SK_NEWEST]: -1, id: 1 } },
      { $limit: 20 },
    ]).explain('executionStats') as Record<string, unknown>;
    const plan = JSON.stringify(ex);
    check('the persisted sort is served by an index scan, not a blocking sort',
      /IXSCAN/.test(plan) && !/"stage":"SORT"/.test(plan));

    console.log(`\n${passed} checks passed, ${failed} failed.`);
    if (failed > 0) { console.error('FAILED'); await mongo.stop(); process.exit(1); }
    console.log('ALL CHECKS PASSED');
  } finally {
    await mongo.stop();
  }
  process.exit(0);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
