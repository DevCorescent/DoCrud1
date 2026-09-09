/**
 * Where does public-read latency actually go?
 *
 * The clean benchmark showed a contradiction worth resolving before anyone
 * optimizes anything: EXPLAIN on the newest page reports 20 keys examined, 20
 * documents examined and 1 ms, while the same query measured end-to-end takes
 * ~394 ms at 100K and ~928 ms at 250K — and that ratio tracks the corpus size,
 * which an index-covered page never should.
 *
 * The production read is a single `$facet` with two branches: the page, and the
 * exact total. This times each branch on its own so the cost lands on whichever
 * one owns it, instead of being attributed to "the query".
 *
 * DIAGNOSTIC ONLY. It changes nothing and asserts nothing.
 */
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';

const SCALES = (process.env.SCALES ?? '100000,250000')
  .split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
const REPS = Number(process.env.REPS ?? 5);
const ORDER_STEP = 1_048_576;

function makeJob(i: number): Record<string, unknown> {
  const iso = new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString();
  return {
    id: `rd-${i}`, title: `Engineer ${i}`, organizationName: 'BenchCo',
    organizationId: 'org', createdByUserId: 'user', location: 'Bengaluru',
    country: 'IN', employmentType: 'full_time', workMode: 'remote',
    experienceLevel: 'mid',
    description: `Role ${i}. ` + 'Design and own services. '.repeat(8),
    status: 'published', isActive: true, sourceId: 'bench', sourceJobId: `ext-${i}`,
    salaryMin: 600000, salaryMax: 1200000, domainConfidence: 0.5,
    postedAt: iso, createdAt: iso, updatedAt: iso, ingestedAt: iso,
  };
}

const p50 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function main() {
  const mongo = await startTestMongo();
  try {
    if (!isIsolatedTestMongo()) { console.error('REFUSING: not isolated.'); process.exit(1); }
    const { getMongoDb } = await import('@/lib/server/database');
    const { upsertHiringJobs } = await import('@/lib/server/db/hiring-jobs-collection');
    const { selectPublicJobsPageFromCollection } = await import('@/lib/server/db/public-jobs-query');
    const db = await getMongoDb();
    if (!db) throw new Error('no db');
    const col = db.collection('hiring_jobs');

    /* The production index plan. Without it this measures a collection scan and
       says nothing about production — the first draft of this script made
       exactly that mistake and reported 0 keys examined. */
    /* The plan carries `supports`/`cost` documentation fields alongside the
       index spec, so it is narrowed through `unknown` rather than asserted to
       a shape it does not literally have. */
    const { HIRING_JOBS_INDEXES } = await import('./db-indexes-hiring-jobs.mjs') as unknown as {
      HIRING_JOBS_INDEXES: Array<{ keys: Record<string, number>; options: Record<string, unknown> }>;
    };
    for (const idx of HIRING_JOBS_INDEXES) await col.createIndex(idx.keys as never, idx.options);
    console.log(`indexes created: ${(await col.indexes()).length}`);

    let seeded = 0;
    for (const n of SCALES) {
      while (seeded < n) {
        const upto = Math.min(n, seeded + 2000);
        const batch = [];
        for (let i = seeded; i < upto; i += 1) batch.push({ job: makeJob(i), order: (n - i) * ORDER_STEP });
        const r = await upsertHiringJobs(batch);
        if (!r.ok) throw new Error('seed failed');
        seeded = upto;
      }
      console.log(`\n═══ ${n} documents ═══`);

      const time = async (label: string, fn: () => Promise<unknown>) => {
        await fn();
        const xs: number[] = [];
        for (let r = 0; r < REPS; r += 1) { const t = Date.now(); await fn(); xs.push(Date.now() - t); }
        console.log(`  ${label.padEnd(34)} p50 ${String(p50(xs)).padStart(5)} ms`);
        return p50(xs);
      };

      const full = await time('full production read ($facet)',
        () => selectPublicJobsPageFromCollection({ page: 1, pageSize: 20, sort: 'newest' } as never));

      /* Branch 1: the page alone, exactly as the $facet's items branch runs it. */
      const pageOnly = await time('  page branch only', () => col.aggregate([
        { $match: { status: 'published' } },
        { $sort: { _skNewest: -1, id: 1 } },
        { $skip: 0 }, { $limit: 20 },
      ]).toArray());

      /* Branch 2: the exact total. */
      const countOnly = await time('  exact count branch only', () => col.aggregate([
        { $match: { status: 'published' } }, { $count: 'n' },
      ]).toArray());

      await time('  countDocuments (plain predicate)', () => col.countDocuments({ status: 'published' }));

      console.log(`  -> page ${pageOnly} + count ${countOnly} = ${pageOnly + countOnly} ms vs ${full} ms measured`);
      console.log(`  -> unexplained by the two branches: ${full - pageOnly - countOnly} ms`);

      const ex = await col.aggregate([
        { $match: { status: 'published' } },
        { $sort: { _skNewest: -1, id: 1 } }, { $limit: 20 },
      ]).explain('executionStats') as Record<string, unknown>;
      const stats = (ex.executionStats ?? {}) as Record<string, unknown>;
      console.log(`  EXPLAIN page: examined ${stats.totalDocsExamined} docs / ${stats.totalKeysExamined} keys in ${stats.executionTimeMillis} ms`);
    }
  } finally { await mongo.stop(); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
