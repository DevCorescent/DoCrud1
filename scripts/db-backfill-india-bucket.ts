/**
 * Backfill `_indiaBucket` on every hiring_jobs document — P2.9-C.
 *
 *     npx tsx scripts/db-backfill-india-bucket.ts             # dry run (default): counts only, writes nothing
 *     npx tsx scripts/db-backfill-india-bucket.ts --apply     # deliberate: writes the field
 *     npx tsx scripts/db-backfill-india-bucket.ts --verify    # completeness gate only
 *
 * ═══ WHY ═══
 *
 * The India chips were served by a `$switch` over every location alias,
 * evaluated per document because no index can bound it — 704 ms and 1,358
 * documents for a 20-row Delhi NCR page, and the whole corpus for a chip that
 * matched nothing. lib/server/db/public-india-bucket.ts computes the SAME
 * value once at write time; this script computes it for the rows that
 * predate that write path, using that one function — there is no second
 * derivation to drift.
 *
 * ═══ THE GATE ═══
 *
 * `--verify` (and the tail of `--apply`) recomputes the value for EVERY row
 * and passes only when all of them carry it. The query layer reads the field
 * for the remote-india / city / Delhi-NCR chips, so serving it before this
 * gate passes would silently drop rows from those chips. Deploy order is
 * therefore: backfill → gate PASS → deploy the query change.
 *
 * Writes are `$set` of one field, batched, idempotent, and ledgered to
 * data/india-bucket-ledger-<ts>.json (gitignored pattern) so a rollback can
 * `$unset` exactly what was touched.
 */
import { writeFileSync } from 'node:fs';
import { loadAppEnv } from './load-env';
loadAppEnv(process.cwd());

const APPLY = process.argv.includes('--apply');
const VERIFY_ONLY = process.argv.includes('--verify');
const BATCH = 500;

(async () => {
  const { getMongoDb } = await import('@/lib/server/database');
  const { publicIndiaBucket, INDIA_BUCKET_FIELD } = await import('@/lib/server/db/public-india-bucket');
  const db = await getMongoDb();
  if (!db) { console.error('MONGODB_URI is not set.'); process.exit(1); }
  const col = db.collection('hiring_jobs');
  const total = await col.estimatedDocumentCount();
  console.log(`hiring_jobs: ${total} documents`);
  console.log(`mode: ${VERIFY_ONLY ? 'VERIFY ONLY' : APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  let scanned = 0, correct = 0, missing = 0, incorrect = 0, updated = 0, failed = 0;
  const byValue: Record<string, number> = {};
  const touched: string[] = [];
  let cursorId: unknown = null;
  for (;;) {
    const filter = cursorId ? { _id: { $gt: cursorId } } : {};
    const batch = await col.find(filter as never, { projection: { _id: 1, location: 1, workMode: 1, country: 1, [INDIA_BUCKET_FIELD]: 1 } })
      .sort({ _id: 1 }).limit(BATCH).toArray();
    if (batch.length === 0) break;
    cursorId = batch[batch.length - 1]._id;
    const ops: Array<Record<string, unknown>> = [];
    for (const doc of batch) {
      scanned += 1;
      const expected = publicIndiaBucket(doc as Record<string, unknown>);
      byValue[expected || '(none)'] = (byValue[expected || '(none)'] ?? 0) + 1;
      const current = (doc as Record<string, unknown>)[INDIA_BUCKET_FIELD];
      if (current === expected) { correct += 1; continue; }
      if (current === undefined) missing += 1; else incorrect += 1;
      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { [INDIA_BUCKET_FIELD]: expected } } } });
      touched.push(String(doc._id));
    }
    if (APPLY && ops.length) {
      try { const res = await col.bulkWrite(ops as never, { ordered: false }); updated += res.modifiedCount; }
      catch (e) { failed += ops.length; console.error('  batch failed:', (e as Error).message); }
    }
    if (scanned % 5000 === 0) console.log(`  scanned ${scanned}/${total}…`);
  }
  console.log('\n── RESULT ──');
  console.log(`  scanned          : ${scanned}`);
  console.log(`  already correct  : ${correct}`);
  console.log(`  missing field    : ${missing}`);
  console.log(`  incorrect value  : ${incorrect}`);
  console.log(`  updated          : ${updated}`);
  console.log(`  failed           : ${failed}`);
  console.log(`  distribution     : ${Object.entries(byValue).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', ')}`);
  if (APPLY && touched.length) {
    const ledger = `data/india-bucket-ledger-${Date.now()}.json`;
    writeFileSync(ledger, JSON.stringify({ field: INDIA_BUCKET_FIELD, ids: touched }, null, 0));
    console.log(`  ledger           : ${ledger} (${touched.length} ids; rollback = $unset on these)`);
  }
  /* The gate: every row carries the value the derivation computes NOW. After
     --apply the verification re-runs from scratch rather than trusting the
     write counts. */
  let complete = false;
  if (VERIFY_ONLY) complete = missing === 0 && incorrect === 0 && failed === 0;
  else if (APPLY) {
    let bad = 0; let cid: unknown = null;
    for (;;) {
      const f = cid ? { _id: { $gt: cid } } : {};
      const b = await col.find(f as never, { projection: { _id: 1, location: 1, workMode: 1, country: 1, [INDIA_BUCKET_FIELD]: 1 } }).sort({ _id: 1 }).limit(BATCH).toArray();
      if (!b.length) break; cid = b[b.length - 1]._id;
      for (const d of b) if ((d as Record<string, unknown>)[INDIA_BUCKET_FIELD] !== publicIndiaBucket(d as Record<string, unknown>)) bad += 1;
    }
    complete = bad === 0 && failed === 0;
    console.log(`  re-verified      : ${bad} rows differ`);
  }
  if (VERIFY_ONLY || APPLY) console.log(`\n  COMPLETENESS GATE: ${complete ? 'PASS — safe to serve the indexed chips' : 'FAIL — do NOT deploy the query change'}`);
  else console.log('\n  DRY RUN. Nothing was written. Re-run with --apply.');
  process.exit(VERIFY_ONLY || APPLY ? (complete ? 0 : 1) : 0);
})().catch((e) => { console.error('BACKFILL FAILED', e instanceof Error ? e.message : e); process.exit(1); });
