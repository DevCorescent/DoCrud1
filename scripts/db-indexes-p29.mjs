/**
 * P2.9-B — the indexes the split query builder can use. PLAN ONLY by default.
 *
 *     node scripts/db-indexes-p29.mjs            # prints the plan, creates nothing
 *     node scripts/db-indexes-p29.mjs --apply    # deliberate, after P2.9-A is deployed
 *                                                # and the _indiaBucket gate has PASSED
 *
 * ═══ WHY THESE THREE, AND NOT MORE ═══
 *
 * Each supports one measured query shape: an equality that bounds the scan,
 * followed by the newest sort key so the index also PROVIDES the order and
 * no in-memory SORT is needed (a blocking sort over a filter's matches is
 * the failure mode the audit measured: `{workMode:'hybrid'}` sorted 442
 * fetched documents in memory once the predicate became plain).
 *
 *   status + country       + _skNewest + id   → country=X, indiaBucket=india
 *   status + workMode      + _skNewest + id   → workMode (single or $in: SORT_MERGE)
 *   status + _indiaBucket  + _skNewest + id   → remote-india / city / delhi-ncr
 *
 * NOT created, on purpose: employmentType (99.3% of rows are full_time — an
 * index cannot help the common value and the rare ones are already bounded
 * by their selectivity) and experienceLevel (same argument, 5 values), and
 * salary/relevance variants of the above (no measured demand).
 *
 * DROP CANDIDATES (not touched here; verify no other caller by explain first):
 *   published_newest, published_salary, published_relevance — the raw-field
 *   trio the listing stopped using when it moved to the persisted _sk* keys.
 */
import { MongoClient } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';

for (const file of ['.env', '.env.local']) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('='); if (eq <= 0) continue;
    const k = line.slice(0, eq).trim(); let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env) || process.env[k] === '') process.env[k] = v;
  }
}

export const P29_INDEXES = [
  { keys: { status: 1, country: 1, _skNewest: -1, id: 1 }, options: { name: 'published_country_newest' } },
  { keys: { status: 1, workMode: 1, _skNewest: -1, id: 1 }, options: { name: 'published_workmode_newest' } },
  { keys: { status: 1, _indiaBucket: 1, _skNewest: -1, id: 1 }, options: { name: 'published_indiabucket_newest' } },
];

const apply = process.argv.includes('--apply');
console.log('P2.9-B index plan for hiring_jobs:');
for (const ix of P29_INDEXES) console.log(`  ${ix.options.name.padEnd(30)} ${JSON.stringify(ix.keys)}`);
if (!apply) { console.log('\nPLAN ONLY. Nothing was created. Re-run with --apply after the P2.9 gates.'); process.exit(0); }

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI is not set.'); process.exit(1); }
const client = new MongoClient(uri);
await client.connect();
const col = client.db(process.env.MONGODB_DB || 'docrud').collection('hiring_jobs');
for (const ix of P29_INDEXES) {
  const name = await col.createIndex(ix.keys, { ...ix.options, background: true });
  console.log(`  created/confirmed ${name}`);
}
await client.close();
