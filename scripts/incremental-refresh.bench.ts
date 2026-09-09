/**
 * The steady-state question: what does a refresh cost once the corpus is large?
 *
 * Scenario, per the Phase 6 brief:
 *
 *     100,000 existing jobs
 *   +   1,000 changed
 *   +     500 new
 *   +     500 unchanged
 *
 * The claim under test is that this costs O(touched), not O(corpus): the
 * candidate lookup must read ~2,000 documents and the writer must issue ~1,500
 * writes, no matter how large the corpus behind them is.
 *
 *   npm run bench:incremental-refresh
 *   CORPUS=25000 npm run bench:incremental-refresh
 *
 * Loopback against mongodb-memory-server, gated by `isIsolatedTestMongo()`.
 */
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';

const CORPUS = Number(process.env.CORPUS ?? 100000);
const CHANGED = Number(process.env.CHANGED ?? 1000);
const NEW = Number(process.env.NEW ?? 500);
const UNCHANGED = Number(process.env.UNCHANGED ?? 500);
const SEED_BATCH = 2000;
const ORDER_STEP = 1_048_576;

function makeJob(i: number, variant = ''): Record<string, unknown> {
  const iso = new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString();
  return {
    id: `inc-${i}`, title: `Engineer ${i}${variant}`, organizationName: 'BenchCo',
    organizationId: 'bench-org', createdByUserId: 'bench-user',
    location: 'Bengaluru', employmentType: 'full_time', workMode: 'remote',
    experienceLevel: 'mid',
    description: `Role ${i}. ` + 'Design, build and own services. '.repeat(8),
    preferredSkills: ['typescript', 'mongodb'], targetRoleKeywords: ['engineer'],
    status: 'published', isActive: true,
    applyUrl: `https://example.com/jobs/${i}`, shareUrl: `/jobs/inc-${i}`,
    sourceId: 'bench-source', sourceJobId: `ext-${i}`, minimumAtsScore: 0,
    postedAt: iso, createdAt: iso, updatedAt: iso, ingestedAt: iso,
  };
}

const heapMB = () => Math.round(process.memoryUsage().heapUsed / 1048576);

async function main() {
  const mongo = await startTestMongo();
  try {
    if (!isIsolatedTestMongo()) {
      console.error('REFUSING TO RUN: not pointed at an isolated test database.');
      process.exit(1);
    }
    const { getMongoDb } = await import('@/lib/server/database');
    const { upsertHiringJobs, selectJobDocsForSource, bulkBatchSize } =
      await import('@/lib/server/db/hiring-jobs-collection');
    const db = await getMongoDb();
    if (!db) throw new Error('no isolated database');
    const col = db.collection('hiring_jobs');

    console.log(`\nSeeding ${CORPUS} documents (batch ${bulkBatchSize()})...`);
    const seedStart = Date.now();
    for (let s = 0; s < CORPUS; s += SEED_BATCH) {
      const batch = [];
      for (let i = s; i < Math.min(CORPUS, s + SEED_BATCH); i += 1) {
        batch.push({ job: makeJob(i), order: (CORPUS - i) * ORDER_STEP });
      }
      const r = await upsertHiringJobs(batch);
      if (!r.ok) throw new Error('seed failed');
    }
    console.log(`  seeded in ${((Date.now() - seedStart) / 1000).toFixed(1)}s`);

    /* The refresh payload: changed, unchanged, and brand-new postings. */
    const touched: Array<{ job: Record<string, unknown>; order?: number }> = [];
    for (let i = 0; i < CHANGED; i += 1) touched.push({ job: makeJob(i, ' v2') });
    for (let i = CHANGED; i < CHANGED + UNCHANGED; i += 1) touched.push({ job: makeJob(i) });
    for (let i = 0; i < NEW; i += 1) {
      touched.push({ job: makeJob(CORPUS + i), order: -(i + 1) * ORDER_STEP });
    }

    if (global.gc) global.gc();
    const heap0 = heapMB();

    /* 1. Candidate lookup — must read ~touched, never the corpus. */
    const t0 = Date.now();
    const ids = touched.map((t) => String((t.job as { sourceJobId: string }).sourceJobId));
    const candidates = await selectJobDocsForSource('bench-source', { sourceJobIds: ids });
    const lookupMs = Date.now() - t0;

    /* 2. Write. */
    const t1 = Date.now();
    const res = await upsertHiringJobs(touched);
    const writeMs = Date.now() - t1;
    const heapPeak = heapMB();

    const after = await col.countDocuments({});
    const totalMs = lookupMs + writeMs;

    console.log(`\n  corpus before        : ${CORPUS}`);
    console.log(`  refresh payload      : ${touched.length} (${CHANGED} changed, ${UNCHANGED} unchanged, ${NEW} new)`);
    console.log(`  candidates read      : ${candidates.length}   <- must track the payload, not ${CORPUS}`);
    console.log(`  candidate lookup     : ${lookupMs} ms`);
    console.log(`  bulk write           : ${writeMs} ms  (batch size ${bulkBatchSize()})`);
    console.log(`  documents written    : ${res.written}`);
    console.log(`  documents unchanged  : ${res.unchanged}   <- zero writes issued for these`);
    console.log(`  write failures       : ${res.failed}`);
    console.log(`  total refresh        : ${totalMs} ms  (${Math.round(touched.length / (totalMs / 1000))} jobs/sec)`);
    console.log(`  heap delta           : ${heapPeak - heap0} MB (peak ${heapPeak} MB)`);
    console.log(`  corpus after         : ${after}  (expected ${CORPUS + NEW})`);

    const ok = after === CORPUS + NEW
      && res.written === CHANGED + NEW
      && res.unchanged === UNCHANGED
      && candidates.length === CHANGED + UNCHANGED;
    console.log(`\n  ${ok ? 'PASS' : 'FAIL'}: refresh touched exactly what it should`);
    if (!ok) process.exitCode = 1;
  } finally {
    await mongo.stop();
  }
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
