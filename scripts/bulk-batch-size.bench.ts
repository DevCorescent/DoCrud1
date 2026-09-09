/**
 * Which bulk batch size should ingestion use?
 *
 * `upsertHiringJobs` chunks its batch; this measures what that chunk should be
 * rather than picking a round number. Each size writes the SAME corpus through
 * the SAME production writer, so the only variable is the chunk.
 *
 *   npm run bench:bulk-batch-size
 *   SIZES=100,500 CORPUS=5000 npm run bench:bulk-batch-size
 *
 * Three cases are timed per size, because they have different costs and
 * ingestion does all three:
 *   INSERT     — a cold corpus, every document new
 *   UPDATE     — every document present and changed
 *   UNCHANGED  — every document present and identical (the steady state, which
 *                the fingerprint pre-check should make nearly free)
 *
 * Loopback against mongodb-memory-server, gated by `isIsolatedTestMongo()`.
 * These are RELATIVE numbers for choosing a constant, not production latency.
 */
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';

const SIZES = (process.env.SIZES ?? '50,100,250,500,1000')
  .split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
const CORPUS = Number(process.env.CORPUS ?? 5000);
const ORDER_STEP = 1_048_576;

function makeJob(i: number, variant = ''): Record<string, unknown> {
  const iso = new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString();
  return {
    id: `bulk-${i}`, title: `Engineer ${i}${variant}`, organizationName: 'BenchCo',
    organizationId: 'bench-org', createdByUserId: 'bench-user',
    location: 'Bengaluru', employmentType: 'full_time', workMode: 'remote',
    experienceLevel: 'mid',
    description: `Role ${i}. ` + 'Design, build and own services. '.repeat(8),
    preferredSkills: ['typescript', 'mongodb'], targetRoleKeywords: ['engineer'],
    status: 'published', isActive: true,
    applyUrl: `https://example.com/jobs/${i}`, shareUrl: `/jobs/bulk-${i}`,
    sourceId: 'bench-source', sourceJobId: `ext-${i}`, minimumAtsScore: 0,
    postedAt: iso, createdAt: iso, updatedAt: iso,
  };
}

const pad = (v: unknown, n: number) => String(v).padStart(n);

async function main() {
  const mongo = await startTestMongo();
  try {
    if (!isIsolatedTestMongo()) {
      console.error('REFUSING TO RUN: not pointed at an isolated test database.');
      process.exit(1);
    }
    const { getMongoDb } = await import('@/lib/server/database');
    const { upsertHiringJobs } = await import('@/lib/server/db/hiring-jobs-collection');
    const db = await getMongoDb();
    if (!db) throw new Error('no isolated database');
    const col = db.collection('hiring_jobs');

    const inputs = (variant = '') => Array.from({ length: CORPUS }, (_, i) => ({
      job: makeJob(i, variant), order: (CORPUS - i) * ORDER_STEP,
    }));

    console.log(`\nCorpus ${CORPUS} documents, per batch size:\n`);
    console.log('  batch | insert ms | update ms | unchanged ms | round trips | written | unchanged');
    console.log('  ------+-----------+-----------+--------------+-------------+---------+----------');

    const results: Array<{ size: number; total: number }> = [];
    for (const size of SIZES) {
      process.env.INGEST_BULK_BATCH_SIZE = String(size);
      await col.deleteMany({});

      const t0 = Date.now();
      const ins = await upsertHiringJobs(inputs());
      const insMs = Date.now() - t0;

      const t1 = Date.now();
      const upd = await upsertHiringJobs(inputs(' v2'));
      const updMs = Date.now() - t1;

      const t2 = Date.now();
      const same = await upsertHiringJobs(inputs(' v2'));
      const sameMs = Date.now() - t2;

      if (!ins.ok || !upd.ok || !same.ok) throw new Error('a benchmark write failed');
      /* Two round trips per chunk (the fingerprint read, then the bulkWrite),
         across the three passes. */
      const chunks = Math.ceil(CORPUS / size);
      const trips = chunks * 2 * 3;
      console.log(`  ${pad(size, 5)} | ${pad(insMs, 9)} | ${pad(updMs, 9)} | ${pad(sameMs, 12)} | ${pad(trips, 11)} | ${pad(ins.written, 7)} | ${pad(same.unchanged, 8)}`);
      results.push({ size, total: insMs + updMs + sameMs });
    }

    const best = results.reduce((a, b) => (b.total < a.total ? b : a));
    console.log(`\n  fastest total: batch size ${best.size} (${best.total} ms across all three passes)`);
    console.log('  NOTE: loopback. Over a real network, fewer round trips matters more than shown here.');
    delete process.env.INGEST_BULK_BATCH_SIZE;
  } finally {
    await mongo.stop();
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
