/**
 * Dense → sparse `_order` migration. EXPLICIT MAINTENANCE, RUN BY HAND.
 *
 *     node scripts/db-rebalance-job-order.mjs            # plan only (default)
 *     node scripts/db-rebalance-job-order.mjs --apply    # deliberate
 *
 * WHY IT IS NEEDED
 * The old mirror stamped `_order` as a dense array index (0,1,2,…). The
 * canonical writer spaces positions ORDER_STEP apart so a new posting can be
 * inserted without renumbering the corpus. Existing documents still carry dense
 * values, and dense values leave no room between neighbours — position 4 and 5
 * have nothing between them — so an insertion there would be refused until the
 * corpus is re-spaced once.
 *
 * WHAT IT CHANGES: `_order`, and nothing else. Not `_id`, not `_fp`, not a
 * single business field. The board's ORDER is preserved exactly — documents are
 * read in their current order and re-stamped in that same order.
 *
 * WHAT IT NEVER DOES: delete, insert, reorder, or run by itself. No ingestion
 * path and no employer action can invoke it.
 */
import { MongoClient } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';

const ORDER_STEP = 1_048_576; // must match lib/server/db/job-order.ts
const APPLY = process.argv.includes('--apply');

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

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI is not set.'); process.exit(1); }

const client = new MongoClient(uri);
await client.connect();
const db = client.db(process.env.MONGODB_DB || undefined);
const col = db.collection('hiring_jobs');

/* Read ids in their CURRENT board order. Only _id and _order are read; the
   documents themselves are never loaded, let alone rewritten. */
const rows = await col.find({}, { projection: { _id: 1, _order: 1 } })
  .sort({ _order: 1 }).toArray();

console.log(`hiring_jobs: ${rows.length} documents`);
if (rows.length === 0) { console.log('nothing to do.'); await client.close(); process.exit(0); }

let exhausted = 0;
for (let i = 0; i + 1 < rows.length; i += 1) {
  const a = Number(rows[i]._order), b = Number(rows[i + 1]._order);
  if (Math.floor((a + b) / 2) <= a) exhausted += 1;
}
console.log(`  current spacing: ${exhausted} adjacent pairs with no room between them`);
console.log(`  after rebalance: 0 (every gap becomes ${ORDER_STEP})`);

const assignments = rows.map((r, i) => ({ id: String(r._id), order: i * ORDER_STEP }));
const changing = assignments.filter((a, i) => Number(rows[i]._order) !== a.order);
console.log(`  documents whose _order would change: ${changing.length}`);
console.log(`  ORDER PRESERVED: position ${assignments[0]?.order} .. ${assignments[assignments.length - 1]?.order}`);

if (!APPLY) {
  console.log('\nPLAN ONLY. Nothing was written. Re-run with --apply when intended.');
  await client.close();
  process.exit(0);
}

/* $set of one field. No replaceOne, so nothing else can be lost. */
const ops = changing.map((a) => ({
  updateOne: { filter: { _id: a.id }, update: { $set: { _order: a.order } } },
}));
for (let i = 0; i < ops.length; i += 500) {
  await col.bulkWrite(ops.slice(i, i + 500), { ordered: false });
  console.log(`  written ${Math.min(i + 500, ops.length)}/${ops.length}`);
}

const after = await col.find({}, { projection: { _id: 1, _order: 1 } }).sort({ _order: 1 }).toArray();
const same = after.every((r, i) => String(r._id) === assignments[i].id);
console.log(`\n  order preserved after rebalance: ${same ? 'YES' : 'NO — INVESTIGATE'}`);
console.log(`  documents: ${rows.length} before, ${after.length} after`);
await client.close();
process.exit(same && after.length === rows.length ? 0 : 1);
