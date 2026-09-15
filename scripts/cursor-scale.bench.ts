/**
 * Does a 20-row page cost the same at 1M postings as at 12K?
 *
 *   npx tsx scripts/cursor-scale.bench.ts
 *   SIZES=12659,100000 npx tsx scripts/cursor-scale.bench.ts
 *
 * SYNTHETIC. Seeded mongodb-memory-server, not production. It answers one
 * question — whether the work for a page grows with the corpus — and that
 * question is about query SHAPE, which a synthetic corpus answers honestly.
 * It says nothing about real Atlas latency, network, or cache behaviour, and
 * no number here should be quoted as production performance.
 *
 * The baseline is the offset pagination this replaced: at 12,659 postings,
 * page 500 examined 10,020 index keys to return 20 rows, and every page also
 * consumed the whole match set for an exact `total`.
 */
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';

const SIZES = (process.env.SIZES ?? '12659,50000,100000,250000,500000,1000000')
  .split(',').map((n) => Number(n.trim())).filter((n) => Number.isFinite(n) && n > 0);
const PAGE = 20;
const SEED_BATCH = 5000;

interface Stats { nReturned: number; totalKeysExamined: number; totalDocsExamined: number }

function doc(i: number) {
  const id = `job-${String(i).padStart(8, '0')}`;
  return {
    _id: id, id, status: 'published', title: `Engineer ${i}`,
    organizationName: `Co ${i % 500}`, location: 'Remote',
    /* Ties are the realistic case: the production corpus has 8 distinct
       `_skSalary` values across thousands of postings. */
    _skNewest: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    _skSalary: (i % 40) * 1000, _skRelevance: (i % 20) / 20,
    createdAt: '2026-01-01T00:00:00.000Z', postedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function main() {
  const mongo = await startTestMongo();
  if (!mongo) { console.log('mongodb-memory-server unavailable — cannot run'); return; }
  if (!isIsolatedTestMongo()) throw new Error('refusing to run outside an isolated test mongo');

  const { getMongoDb } = await import('@/lib/server/database');
  const Q = await import('@/lib/server/db/public-jobs-query');
  const C = await import('@/lib/server/db/public-jobs-cursor');
  const db = await getMongoDb();
  if (!db) throw new Error('no test db');
  const col = db.collection('hiring_jobs');

  console.log('SYNTHETIC — seeded in-memory MongoDB, not production Atlas\n');
  console.log('  corpus     mode          returned  keys  docs      ms');
  console.log('  ' + '─'.repeat(52));

  let seeded = 0;
  for (const size of SIZES) {
    if (seeded === 0) { await col.deleteMany({}); await col.createIndex({ status: 1, _skNewest: -1, id: 1 }, { name: 'published_sk_newest' }); }
    for (let i = seeded; i < size; i += SEED_BATCH) {
      await col.insertMany(Array.from({ length: Math.min(SEED_BATCH, size - i) }, (_, k) => doc(i + k)) as never);
    }
    seeded = size;

    const stats = async (cursor: unknown) => {
      const t = Date.now();
      const e = await col.aggregate(
        Q.buildPublicJobsCollectionPipeline({ pageSize: String(PAGE) } as never, { cursor: cursor as never }),
      ).explain('executionStats') as Record<string, never>;
      /* Mongo reports these at the TOP LEVEL for some pipelines and under
         `stages[0].$cursor` for others. Reading only the first and defaulting
         to zeros is how a benchmark reports "0 keys examined" and looks like a
         spectacular result instead of a broken harness. */
      const src = e as unknown as {
        executionStats?: Stats;
        stages?: Array<{ $cursor?: { executionStats?: Stats } }>;
      };
      const ex = src.executionStats ?? src.stages?.[0]?.$cursor?.executionStats;
      if (!ex) throw new Error('explain returned no executionStats — harness is wrong, not the query');
      if (ex.nReturned === 0) throw new Error('explain returned 0 rows — the fixtures did not match the query');
      return { ...ex, ms: Date.now() - t };
    };

    const first = await stats(null);
    console.log(`  ${String(size).padStart(9)}  first         ${String(first.nReturned).padStart(8)}${String(first.totalKeysExamined).padStart(6)}${String(first.totalDocsExamined).padStart(6)}${String(first.ms).padStart(8)}`);

    /* Walk 200 pages in — 4,000 rows deep. Under offset pagination that is
       exactly where the cost used to appear. */
    let token: string | null = null;
    for (let i = 0; i < 200; i += 1) {
      const q = { pageSize: String(PAGE) } as never;
      const page = await Q.selectPublicJobsPageFromCollection(q, { cursor: token ? C.decodeCursor(token, q) : null });
      if (!page?.nextCursor) break;
      token = page.nextCursor;
    }
    const deep = await stats(token ? C.decodeCursor(token, { pageSize: String(PAGE) } as never) : null);
    console.log(`  ${' '.repeat(9)}  deep (~4,000) ${String(deep.nReturned).padStart(8)}${String(deep.totalKeysExamined).padStart(6)}${String(deep.totalDocsExamined).padStart(6)}${String(deep.ms).padStart(8)}`);
  }

  console.log('\n  The number that matters is keys/docs, not ms: it must not grow');
  console.log('  with the corpus or with depth. Offset pagination examined 10,020');
  console.log('  keys at page 500 on a 12,659-posting corpus.');
  await mongo.stop();
  /* The app's global MongoClient outlives mongo.stop() and keeps the event
     loop alive; without an explicit exit this harness hangs after finishing. */
  process.exit(0);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
