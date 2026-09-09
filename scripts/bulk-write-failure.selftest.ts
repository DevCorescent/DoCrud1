/**
 * Self-test — what a FAILING bulk write must and must not do.
 *
 * `upsertHiringJobs` now chunks its batch and reads real counts off a
 * MongoBulkWriteError. Both are ways to get the failure path wrong:
 *
 *   - a chunked writer can lose the counts from chunks that already committed,
 *     making a partial write look like a no-op and a retry look like a first
 *     attempt;
 *   - an unordered bulk that rejects still wrote the documents that succeeded,
 *     so reporting `written: 0` understates what is in the store;
 *   - and the one thing that must never happen: a failure reported as success.
 *
 * These run against mongodb-memory-server, gated by `isIsolatedTestMongo()`.
 */
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean) {
  checks += 1;
  if (!ok) { failures += 1; console.log(`  ✗ ${label}`); }
  else console.log(`  ✓ ${label}`);
}

const ORDER_STEP = 1_048_576;
function makeJob(i: number, variant = ''): Record<string, unknown> {
  return {
    id: `bwf-${i}`, title: `Engineer ${i}${variant}`, organizationName: 'FailCo',
    organizationId: 'org', createdByUserId: 'user', location: 'Pune',
    status: 'published', isActive: true, sourceId: 'fail-source',
    sourceJobId: `ext-${i}`, description: `Role ${i}`,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

async function main() {
  const mongo = await startTestMongo();
  try {
    if (!isIsolatedTestMongo()) {
      console.error('REFUSING TO RUN: not pointed at an isolated test database.');
      process.exit(1);
    }
    const { getMongoDb } = await import('@/lib/server/database');
    const { upsertHiringJobs, bulkBatchSize } =
      await import('@/lib/server/db/hiring-jobs-collection');
    const db = await getMongoDb();
    if (!db) throw new Error('no isolated database');
    const col = db.collection('hiring_jobs');

    console.log('\n── 1. Chunking is bounded and configurable ──');
    const prev = process.env.INGEST_BULK_BATCH_SIZE;
    delete process.env.INGEST_BULK_BATCH_SIZE;
    check('default batch size is 500', bulkBatchSize() === 500);
    process.env.INGEST_BULK_BATCH_SIZE = '250';
    check('a valid override is honoured', bulkBatchSize() === 250);
    process.env.INGEST_BULK_BATCH_SIZE = '999999';
    check('an absurd value is capped at 1000', bulkBatchSize() === 1000);
    process.env.INGEST_BULK_BATCH_SIZE = '0';
    check('zero falls back to the default', bulkBatchSize() === 500);
    process.env.INGEST_BULK_BATCH_SIZE = 'nonsense';
    check('a non-numeric value falls back to the default', bulkBatchSize() === 500);
    if (prev === undefined) delete process.env.INGEST_BULK_BATCH_SIZE;
    else process.env.INGEST_BULK_BATCH_SIZE = prev;

    console.log('\n── 2. A batch spanning many chunks writes every document ──');
    process.env.INGEST_BULK_BATCH_SIZE = '50';
    await col.deleteMany({});
    const many = Array.from({ length: 512 }, (_, i) => ({
      job: makeJob(i), order: (512 - i) * ORDER_STEP,
    }));
    const big = await upsertHiringJobs(many);
    check('the multi-chunk write reports ok', big.ok);
    check('every document was written', big.written === 512);
    check('the store holds all 512', (await col.countDocuments({})) === 512);
    check('no document was duplicated',
      (await col.distinct('id')).length === 512);

    console.log('\n── 3. Unchanged documents cost no write, across chunks ──');
    const again = await upsertHiringJobs(many);
    check('re-writing identical documents writes nothing', again.written === 0);
    check('all 512 reported unchanged', again.unchanged === 512);
    check('the corpus is unchanged', (await col.countDocuments({})) === 512);

    console.log('\n── 4. A mid-batch validation failure keeps earlier chunks ──');
    /* A new job with no order is refused by design. Put it late in the batch so
       earlier chunks have already committed when the throw happens. */
    const mixed: Array<{ job: Record<string, unknown>; order?: number }> = [];
    for (let i = 600; i < 700; i += 1) mixed.push({ job: makeJob(i), order: -i * ORDER_STEP });
    mixed.push({ job: makeJob(9999) }); // new, no order -> refused
    const before = await col.countDocuments({});
    const partial = await upsertHiringJobs(mixed);
    check('the failure is reported, not swallowed', !partial.ok);
    check('an error message is returned', typeof partial.error === 'string' && partial.error.length > 0);
    check('it does NOT claim zero writes when earlier chunks committed',
      partial.written > 0);
    check('documents from the committed chunks are really stored',
      (await col.countDocuments({})) > before);
    check('the refused document was not written',
      (await col.countDocuments({ id: 'bwf-9999' })) === 0);

    console.log('\n── 5. A failure never deletes anything ──');
    const survived = await col.countDocuments({});
    await upsertHiringJobs([{ job: makeJob(12345) }]).catch(() => undefined);
    check('a refused write removed no existing document',
      (await col.countDocuments({})) === survived);

    console.log('\n── 6. Retry after failure creates no duplicates ──');
    const retryBatch = Array.from({ length: 100 }, (_, i) => ({
      job: makeJob(600 + i, ' retried'), order: -(600 + i) * ORDER_STEP,
    }));
    const r1 = await upsertHiringJobs(retryBatch);
    const r2 = await upsertHiringJobs(retryBatch);
    check('the retry succeeds', r1.ok && r2.ok);
    check('the retry writes nothing new', r2.written === 0);
    check('the retry reports them unchanged', r2.unchanged === 100);
    const idsNow = await col.distinct('id');
    check('no duplicate ids exist after retry',
      idsNow.length === (await col.countDocuments({})));

    console.log('\n── 7. An empty batch is a no-op, never a truncation ──');
    const held = await col.countDocuments({});
    const none = await upsertHiringJobs([]);
    check('an empty batch reports ok with no writes', none.ok && none.written === 0);
    check('an empty batch deleted nothing', (await col.countDocuments({})) === held);

    if (prev === undefined) delete process.env.INGEST_BULK_BATCH_SIZE;
    else process.env.INGEST_BULK_BATCH_SIZE = prev;

    console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  } finally {
    await mongo.stop();
  }
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
