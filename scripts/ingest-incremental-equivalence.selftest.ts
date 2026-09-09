/**
 * Self-test — the incremental candidate lookup must be INDISTINGUISHABLE from
 * the whole-corpus path.
 *
 * `runCanonicalIngestion` historically loaded every posting so `planIngest`
 * could index the corpus by identity. That is 733 MB of heap at 100K postings
 * (measured, scripts/ingestion-scale.bench.ts) against a 1024 MB serverless
 * limit. `selectJobDocsForSource` replaces it with a per-source lookup.
 *
 * Swapping how the write path finds its candidates is the kind of change that
 * silently creates duplicates: miss one stored posting and the planner inserts
 * a second copy instead of updating the first. So this file does not test the
 * new path in isolation — it runs BOTH paths over identical fixtures against a
 * real (in-memory) MongoDB and asserts the resulting corpora are equal.
 *
 * Everything runs against mongodb-memory-server and `isIsolatedTestMongo()` is
 * a hard gate, so this can never touch Atlas.
 */
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean) {
  checks += 1;
  if (!ok) { failures += 1; console.log(`  ✗ ${label}`); }
  else console.log(`  ✓ ${label}`);
}

/** A Greenhouse board response with `n` postings. */
function board(n: number, opts: { titleSuffix?: string; skip?: number[] } = {}) {
  const jobs = [];
  for (let i = 0; i < n; i += 1) {
    if (opts.skip?.includes(i)) continue;
    jobs.push({
      id: 1000 + i,
      title: `Engineer ${i}${opts.titleSuffix ?? ''}`,
      location: { name: 'Bengaluru, India' },
      departments: [{ name: 'Engineering' }],
      content: `<p>Build things. Role ${i}.</p>`,
      absolute_url: `https://boards.greenhouse.io/equivtest/jobs/${1000 + i}`,
      updated_at: '2026-02-01T00:00:00Z',
    });
  }
  return { jobs };
}

/** Comparable shape: the fields ingestion is responsible for, sorted by id. */
function snapshot(jobs: Array<Record<string, unknown>>) {
  return jobs
    .map((j) => ({
      sourceId: j.sourceId, sourceJobId: j.sourceJobId, title: j.title,
      organizationName: j.organizationName, location: j.location,
      description: j.description, canonicalUrl: j.canonicalUrl,
      status: j.status, isActive: j.isActive,
    }))
    .sort((a, b) => String(a.sourceJobId).localeCompare(String(b.sourceJobId)));
}

async function main() {
  const mongo = await startTestMongo();
  try {
    if (!isIsolatedTestMongo()) {
      console.error('REFUSING TO RUN: not pointed at an isolated test database.');
      process.exit(1);
    }
    process.env.JOB_SCRAPER_ENABLED = 'true';
    process.env.GREENHOUSE_BOARDS = 'equivtest|EquivTest|IN';

    const { getMongoDb } = await import('@/lib/server/database');
    const { runCanonicalIngestion } = await import('@/lib/server/job-sources/run-ingestion');
    const { selectAllJobDocs, selectJobDocsForSource } =
      await import('@/lib/server/db/hiring-jobs-collection');

    const db = await getMongoDb();
    if (!db) throw new Error('no isolated database');
    const col = db.collection('hiring_jobs');
    const reset = async () => { await col.deleteMany({}); };

    const deps = (payload: unknown) => ({ fetchJson: async () => payload });
    const run = (payload: unknown, incremental: boolean, extra = {}) =>
      runCanonicalIngestion({ deps: deps(payload), incremental, ...extra });

    console.log('\n── 1. First ingestion: both paths produce the same corpus ──');
    await reset();
    const wholeFirst = await run(board(40), false);
    const wholeCorpus = snapshot(await selectAllJobDocs() as never);
    await reset();
    const incFirst = await run(board(40), true);
    const incCorpus = snapshot(await selectAllJobDocs() as never);

    check('whole-corpus path inserted 40', wholeFirst.inserted === 40);
    check('incremental path inserted 40', incFirst.inserted === 40);
    check('both produced the same number of postings',
      wholeCorpus.length === incCorpus.length && incCorpus.length === 40);
    check('the two corpora are byte-identical',
      JSON.stringify(wholeCorpus) === JSON.stringify(incCorpus));

    console.log('\n── 2. Re-ingesting identical content writes nothing ──');
    const incSecond = await run(board(40), true);
    check('incremental: zero inserts on re-ingest', incSecond.inserted === 0);
    check('incremental: zero updates on re-ingest', incSecond.updated === 0);
    check('incremental: all 40 reported unchanged', incSecond.unchanged === 40);
    check('the corpus still holds exactly 40', (await col.countDocuments({})) === 40);

    console.log('\n── 3. Changed content updates in place, never duplicates ──');
    const incChanged = await run(board(40, { titleSuffix: ' (Senior)' }), true);
    check('40 updated', incChanged.updated === 40);
    check('nothing inserted', incChanged.inserted === 0);
    check('still exactly 40 postings — no duplicate records',
      (await col.countDocuments({})) === 40);

    console.log('\n── 4. New postings insert alongside existing ones ──');
    const incGrown = await run(board(50, { titleSuffix: ' (Senior)' }), true);
    check('10 new postings inserted', incGrown.inserted === 10);
    check('corpus is now 50', (await col.countDocuments({})) === 50);

    console.log('\n── 5. A source that disappears from the feed is NOT deleted ──');
    const before = await col.countDocuments({});
    await run(board(50, { titleSuffix: ' (Senior)', skip: [0, 1, 2, 3, 4] }), true);
    check('postings missing from the feed remain in the store',
      (await col.countDocuments({})) === before);

    console.log('\n── 6. A source that FAILS deletes nothing ──');
    const failing = { fetchJson: async () => { throw new Error('board 500'); } };
    const failed = await runCanonicalIngestion({ deps: failing, incremental: true });
    check('the run reports the source as failed', failed.inserted === 0);
    check('the corpus is untouched by the failure',
      (await col.countDocuments({})) === before);
    check('a failed fetch is not reported as an empty success',
      failed.perSource.some((s) => !s.ok));

    console.log('\n── 7. The lookup is scoped to its own source ──');
    const foreign = await selectJobDocsForSource('greenhouse:someone-else', {
      sourceJobIds: ['1000', '1001', '1002'],
    });
    check('another source sees none of these postings', foreign.length === 0);
    /* Employer-posted jobs carry no sourceId and must be unreachable. */
    await col.insertOne({
      _id: 'manual-1' as never, id: 'manual-1', title: 'Employer posted',
      organizationName: 'Acme', status: 'published', _order: 1,
    } as never);
    const manualLeak = await selectJobDocsForSource('greenhouse:equivtest', {
      organizationNames: ['Acme'], sourceJobIds: ['manual-1'],
    });
    check('an employer-posted job is never a candidate', manualLeak.length === 0);
    check('the employer-posted job is still stored',
      (await col.countDocuments({ id: 'manual-1' })) === 1);

    console.log('\n── 8. Equivalence holds after mutation, not just on an empty store ──');
    await reset();
    await run(board(30), false);
    const wholeMutated = await run(board(30, { titleSuffix: ' v2' }), false);
    const wholeAfter = snapshot(await selectAllJobDocs() as never);
    await reset();
    await run(board(30), true);
    const incMutated = await run(board(30, { titleSuffix: ' v2' }), true);
    const incAfter = snapshot(await selectAllJobDocs() as never);
    check('both paths report the same update count',
      wholeMutated.updated === incMutated.updated);
    check('both corpora are identical after an update pass',
      JSON.stringify(wholeAfter) === JSON.stringify(incAfter));

    console.log('\n── 9. The flag is server-side and defaults OFF ──');
    const { incrementalIngestEnabled } = await import('@/lib/server/job-sources/ingest-mode');
    const prev = process.env.INGEST_INCREMENTAL_LOOKUP;
    delete process.env.INGEST_INCREMENTAL_LOOKUP;
    check('unset means OFF', !incrementalIngestEnabled());
    process.env.INGEST_INCREMENTAL_LOOKUP = 'yes';
    check('anything but "true" means OFF', !incrementalIngestEnabled());
    process.env.INGEST_INCREMENTAL_LOOKUP = 'true';
    check('exactly "true" enables it', incrementalIngestEnabled());
    if (prev === undefined) delete process.env.INGEST_INCREMENTAL_LOOKUP;
    else process.env.INGEST_INCREMENTAL_LOOKUP = prev;

    console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  } finally {
    await mongo.stop();
  }
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
