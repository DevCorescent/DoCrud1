/**
 * Phase 2.7H — stamp the persisted public sort keys onto existing postings.
 *
 *     node scripts/db-backfill-sort-keys.mjs            # dry run (default)
 *     node scripts/db-backfill-sort-keys.mjs --apply    # deliberate
 *     node scripts/db-backfill-sort-keys.mjs --verify   # completeness gate only
 *
 * ═══ WHY THIS MUST RUN BEFORE THE QUERY CUTOVER ═══
 *
 * A document missing `_skNewest` sorts FIRST under a descending sort. Ship the
 * indexed query against a corpus that has not been backfilled and stale
 * postings quietly climb to the top of the public board — a wrong feed that
 * looks healthy. So: run this, prove completeness, THEN deploy the query.
 *
 * ═══ SAFETY ═══
 *
 * Bounded batches by _id, so it never holds the corpus in memory and can be
 * interrupted and resumed from where it stopped. Idempotent: a second run
 * updates nothing. It only ever $sets the three key fields — no deletes, no
 * replaceOne, no other field touched.
 */
import { MongoClient } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const VERIFY_ONLY = process.argv.includes('--verify');
const BATCH = 500;

for (const file of ['.env', '.env.local']) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env) || process.env[k] === '') process.env[k] = v;
  }
}

/* The SAME derivation the writer uses, inlined because this is a .mjs
   maintenance script; the self-test pins the two against each other. */
const strOr = (v) => (typeof v === 'string' && v !== '' ? v : null);
const numOr = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const derive = (j) => ({
  _skNewest: strOr(j.postedAt) ?? strOr(j.createdAt) ?? '',
  _skSalary: numOr(j.salaryMax) ?? numOr(j.salaryMin) ?? 0,
  _skRelevance: numOr(j.domainConfidence) ?? 0,
});

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI is not set.'); process.exit(1); }
const client = new MongoClient(uri);
await client.connect();
const db = client.db(process.env.MONGODB_DB || undefined);
const col = db.collection('hiring_jobs');

const total = await col.countDocuments();
console.log(`hiring_jobs: ${total} documents`);
console.log(`mode: ${VERIFY_ONLY ? 'VERIFY ONLY' : APPLY ? 'APPLY' : 'DRY RUN'}\n`);

let scanned = 0, correct = 0, missing = 0, incorrect = 0, malformed = 0, updated = 0, failed = 0;
let cursorId = null;

for (;;) {
  const filter = cursorId ? { _id: { $gt: cursorId } } : {};
  const batch = await col.find(filter, {
    projection: {
      _id: 1, postedAt: 1, createdAt: 1, salaryMax: 1, salaryMin: 1,
      domainConfidence: 1, _skNewest: 1, _skSalary: 1, _skRelevance: 1,
    },
  }).sort({ _id: 1 }).limit(BATCH).toArray();
  if (batch.length === 0) break;
  cursorId = batch[batch.length - 1]._id;

  const ops = [];
  for (const doc of batch) {
    scanned += 1;
    let expected;
    try { expected = derive(doc); } catch { malformed += 1; continue; }
    const has = doc._skNewest !== undefined && doc._skSalary !== undefined && doc._skRelevance !== undefined;
    const same = has && doc._skNewest === expected._skNewest
      && doc._skSalary === expected._skSalary && doc._skRelevance === expected._skRelevance;
    if (same) { correct += 1; continue; }
    if (!has) missing += 1; else incorrect += 1;
    /* $set of exactly three fields. Nothing else is touched, ever. */
    ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: expected } } });
  }

  if (ops.length && APPLY && !VERIFY_ONLY) {
    try {
      const res = await col.bulkWrite(ops, { ordered: false });
      updated += (res.modifiedCount ?? 0);
    } catch (err) {
      failed += ops.length;
      console.error(`  ! batch failed: ${err.message}`);
    }
  }
  if (scanned % 10000 === 0) console.log(`  scanned ${scanned}/${total}…`);
}

console.log('\n── RESULT ──');
console.log(`  scanned          : ${scanned}`);
console.log(`  already correct  : ${correct}`);
console.log(`  missing keys     : ${missing}`);
console.log(`  incorrect keys   : ${incorrect}`);
console.log(`  malformed source : ${malformed}`);
console.log(`  updated          : ${updated}`);
console.log(`  failed           : ${failed}`);

const complete = scanned === total && missing === 0 && incorrect === 0 && malformed === 0 && failed === 0;
console.log(`\n  COMPLETENESS GATE: ${complete ? 'PASS — safe to serve the indexed query' : 'FAIL — do NOT cut over'}`);
if (!APPLY && !VERIFY_ONLY) console.log('  DRY RUN. Nothing was written. Re-run with --apply.');

await client.close();
process.exit(complete || (!APPLY && !VERIFY_ONLY) ? 0 : 1);
