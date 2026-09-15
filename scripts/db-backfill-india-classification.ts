/**
 * Re-normalise the location-derived COUNTRY and INDIA flags on published jobs.
 *
 *     npx tsx scripts/db-backfill-india-classification.ts            # dry run (default)
 *     npx tsx scripts/db-backfill-india-classification.ts --apply    # deliberate
 *     npx tsx scripts/db-backfill-india-classification.ts --verify   # independent recheck
 *
 * ═══ WHY ═══
 *
 * Two separate facts, corrected in one pass and reported apart:
 *
 *   A. The classifier now reads an explicit remote-country code — "Remote, in"
 *      and friends — which it could not before. ~340 Indian postings (all
 *      Nagarro) were stored as "we could not tell".
 *   B. Some documents predate the current classifier entirely and carry no
 *      country/isIndia even though today's rules decide them outright
 *      ("Bengaluru", "Pune", "India").
 *
 * ═══ SCOPE: TWO FIELDS ═══
 *
 * Only `country` and `isIndia` are written. Deliberately NOT written:
 *
 *   workMode    - `resolveWorkMode` needs the SOURCE's own value, and the
 *                 stored field is already the resolved result. Recomputing it
 *                 from the stored value could change what the work-mode filters
 *                 return, which is not what this pass is for.
 *   city/state  - location-derived and safe in principle, but they feed the
 *                 {status,country,state,city} index and widen the blast radius
 *                 past the flags the India work actually needs.
 *   domain, domainConfidence, scores - derived from title/description, not
 *                 location. `domainConfidence` also backs `_skRelevance`, a
 *                 public sort key.
 *   indiaBucket - not a stored field, and its multi-city behaviour is a
 *                 separate unresolved question ("Mumbai / Pune").
 *
 * Nothing else on the document is read for the decision or touched by the write.
 *
 * ═══ SAFETY ═══
 *
 * Batched by _id so it never holds the corpus and can resume. Idempotent: a
 * second run changes nothing. `$set` of at most two fields, plus `$unset` when
 * the classifier legitimately cannot decide and the stored value must go back
 * to absent. Every change is written to a compact ledger first.
 */
import { MongoClient } from 'mongodb';
import { classifyLocation } from '@/lib/server/job-sources/location';
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const VERIFY = process.argv.includes('--verify');
const BATCH = 500;
const LEDGER = path.join(process.cwd(), 'data', `india-backfill-ledger-${Date.now()}.json`);

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

/* The classifier is imported at the top, NOT reimplemented: a second copy of
   these rules is the one way a stored value could come to disagree with what
   ingestion would write for the same text. This file is .ts precisely so that
   import is possible — the sort-key backfill beside it is .mjs and had to
   inline its derivation, which is the situation being avoided here. */

/* Which rule decided this record — so Group A and Group B stay distinguishable. */
const REMOTE_CODE = /^\s*remote\s*[,\-:–—]\s*([a-z]{2})\s*$/i;

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.error('MONGODB_URI is not set'); process.exit(1); }
  const client = new MongoClient(uri, { minPoolSize: 1 });
  await client.connect();
  const col = client.db(process.env.MONGODB_DB || 'docrud').collection('hiring_jobs');

  const total = await col.countDocuments({ status: 'published' });
  console.log(`hiring_jobs published: ${total}`);
  console.log(`mode: ${VERIFY ? 'VERIFY ONLY' : APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  let scanned = 0, unchanged = 0, updated = 0, failed = 0;
  const groups: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  const before: Record<string, number> = { t: 0, f: 0, u: 0 };
  const after: Record<string, number> = { t: 0, f: 0, u: 0 };
  const byLocation = new Map<string, number>();
  const ledger: Array<Record<string, unknown>> = [];
  let cursorId: unknown = null;

  for (;;) {
    const filter: Record<string, unknown> = cursorId ? { _id: { $gt: cursorId }, status: 'published' } : { status: 'published' };
    const batch = await col.find(filter, { projection: { _id: 1, location: 1, country: 1, isIndia: 1 } })
      .sort({ _id: 1 }).limit(BATCH).toArray();
    if (batch.length === 0) break;
    cursorId = batch[batch.length - 1]._id;

    const ops: Array<Record<string, unknown>> = [];
    for (const doc of batch) {
      scanned += 1;
      const loc = String(doc.location ?? '');
      const derived = classifyLocation(loc);

      const bKey = doc.isIndia === true ? 't' : doc.isIndia === false ? 'f' : 'u';
      before[bKey] += 1;
      const aKey = derived.isIndia === true ? 't' : derived.isIndia === false ? 'f' : 'u';
      after[aKey] += 1;

      const sameIndia = doc.isIndia === derived.isIndia
        || (doc.isIndia === undefined && derived.isIndia === undefined);
      const sameCountry = (doc.country ?? undefined) === (derived.country ?? undefined);
      if (sameIndia && sameCountry) {
        unchanged += 1;
        if (derived.isIndia === undefined) groups.C += 1; else groups.D += 1;
        continue;
      }

      REMOTE_CODE.test(loc) ? (groups.A += 1) : (groups.B += 1);
      const k = `${JSON.stringify(loc)} : ${String(doc.isIndia)}/${String(doc.country)} -> ${String(derived.isIndia)}/${String(derived.country)}`;
      byLocation.set(k, (byLocation.get(k) ?? 0) + 1);
      ledger.push({
        id: String(doc._id), location: loc,
        from: { country: doc.country ?? null, isIndia: doc.isIndia ?? null },
        to: { country: derived.country ?? null, isIndia: derived.isIndia ?? null },
        group: REMOTE_CODE.test(loc) ? 'A' : 'B',
      });

      const $set: Record<string, unknown> = {};
      const $unset: Record<string, unknown> = {};
      if (derived.country !== undefined) $set.country = derived.country; else $unset.country = '';
      if (derived.isIndia !== undefined) $set.isIndia = derived.isIndia; else $unset.isIndia = '';
      const update: Record<string, unknown> = {};
      if (Object.keys($set).length) update.$set = $set;
      if (Object.keys($unset).length) update.$unset = $unset;
      ops.push({ updateOne: { filter: { _id: doc._id }, update } });
    }

    if (ops.length && APPLY && !VERIFY) {
      try {
        const res = await col.bulkWrite(ops as never, { ordered: false });
        updated += res.modifiedCount ?? 0;
      } catch (error) {
        failed += ops.length;
        console.error('  batch failed:', error instanceof Error ? error.message : error);
      }
    }
    if (scanned % 5000 === 0) console.log(`  scanned ${scanned}/${total}…`);
  }

  if (APPLY && !VERIFY && ledger.length) {
    fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
  }

  console.log('\n── RESULT ──');
  console.log(`  scanned            : ${scanned}`);
  console.log(`  unchanged          : ${unchanged}`);
  console.log(`  would change       : ${ledger.length}`);
  console.log(`  updated            : ${updated}`);
  console.log(`  failed             : ${failed}`);
  console.log('\n  GROUPS');
  console.log(`    A explicit remote country code : ${groups.A}`);
  console.log(`    B stale, classifier already knew: ${groups.B}`);
  console.log(`    C still undetermined            : ${groups.C}`);
  console.log(`    D already correct               : ${groups.D}`);
  console.log('\n  isIndia          BEFORE   AFTER');
  console.log(`    true           ${String(before.t).padStart(7)} ${String(after.t).padStart(7)}`);
  console.log(`    false          ${String(before.f).padStart(7)} ${String(after.f).padStart(7)}`);
  console.log(`    undetermined   ${String(before.u).padStart(7)} ${String(after.u).padStart(7)}`);

  if (byLocation.size) {
    console.log('\n  CHANGES BY LOCATION (top 12)');
    for (const [k, n] of Array.from(byLocation.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
      console.log(`    ${String(n).padStart(5)}  ${k}`);
    }
  }

  const consistent = ledger.length === 0;
  console.log(`\n  CONSISTENCY GATE: ${consistent ? 'PASS — stored classification matches the classifier' : `FAIL — ${ledger.length} documents disagree`}`);
  if (APPLY && !VERIFY && ledger.length) console.log(`  ledger: ${LEDGER}`);
  if (!APPLY && !VERIFY) console.log('  DRY RUN. Nothing was written. Re-run with --apply.');

  await client.close();

}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
