/**
 * Index definitions for the canonical `hiring_jobs` collection.
 *
 * ═══ THIS SCRIPT DOES NOT RUN BY DEFAULT ═══
 *
 * Invoked without `--apply` it PRINTS the plan and exits. Creating indexes on a
 * live collection is a Phase 2.3 decision, not a side effect of reading a file.
 *
 *     node scripts/db-indexes-hiring-jobs.mjs            # plan only (default)
 *     node scripts/db-indexes-hiring-jobs.mjs --apply    # Phase 2.3, deliberate
 *
 * Every index below is justified by a query shape that exists TODAY in
 * lib/server/db/public-jobs-query.ts or hiring-jobs-collection.ts. Indexes that
 * merely sound useful are not here: each one is paid for on every write.
 *
 * ═══ WHY THERE IS NO TEXT INDEX ═══
 *
 * `?search=` is served by `$indexOfCP` over lowercased, trimmed fields — plain
 * substring containment. A MongoDB text index does NOT do that: it tokenises,
 * stems, applies stop-words and matches whole terms. Adopting one would silently
 * change which jobs match — "eng" would stop finding "engineer", and stemming
 * would start matching words the current implementation never would. That is a
 * product change wearing a performance costume.
 *
 * The 328-check public-jobs-equivalence suite is the contract, and a text index
 * would break it by design rather than by accident. If full-text search is
 * wanted later it is a deliberate feature with its own equivalence work — not
 * an index added during a migration.
 */

export const HIRING_JOBS_INDEXES = [
  {
    keys: { status: 1, isActive: 1, expiresAt: 1 },
    options: { name: 'active_predicate' },
    supports: 'isJobActive() — applied first by every public read',
    cost: 'low: three small scalar fields',
  },
  {
    keys: { status: 1, postedAt: -1, _id: 1 },
    options: { name: 'published_newest' },
    supports: "sort=newest (the DEFAULT) with the _id tie-break publicJobs uses",
    cost: 'low',
  },
  {
    keys: { status: 1, salaryMax: -1, _id: 1 },
    options: { name: 'published_salary' },
    supports: 'sort=salary, same tie-break',
    cost: 'low; salaryMax is present on very few documents today',
  },
  {
    keys: { status: 1, domainConfidence: -1, _id: 1 },
    options: { name: 'published_relevance' },
    supports: 'sort=relevance, same tie-break',
    cost: 'low',
  },
  {
    keys: { status: 1, country: 1, state: 1, city: 1 },
    options: { name: 'published_location' },
    supports: '?country / ?state / ?city equality filters (prefix-usable)',
    cost: 'medium: four fields, but all short strings',
  },
  {
    keys: { status: 1, workMode: 1, employmentType: 1, experienceLevel: 1 },
    options: { name: 'published_facets' },
    supports: '?workMode / ?employmentType / ?experienceLevel (prefix-usable)',
    cost: 'medium',
  },
  {
    keys: { sourceId: 1, sourceJobId: 1 },
    options: { name: 'ingest_identity' },
    supports: 'ingestion upserts locating an existing posting by provenance',
    cost: 'low; write-path only',
  },
];

/* ── Runner ───────────────────────────────────────────────────────────────

   Guarded so IMPORTING this file yields only the definitions. Without it, the
   self-test that reads HIRING_JOBS_INDEXES would print the plan and exit the
   process on import — a script that runs as a side effect of being read is
   exactly the kind of thing this migration should not have. */

import { pathToFileURL } from 'node:url';

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (!invokedDirectly) {
  // Imported for its definitions only.
} else {
  runPlan();
}

function runPlan() {
const apply = process.argv.includes('--apply');

console.log(`hiring_jobs index plan — ${HIRING_JOBS_INDEXES.length} indexes\n`);
for (const idx of HIRING_JOBS_INDEXES) {
  console.log(`  ${idx.options.name}`);
  console.log(`    keys     : ${JSON.stringify(idx.keys)}`);
  console.log(`    supports : ${idx.supports}`);
  console.log(`    cost     : ${idx.cost}\n`);
}
console.log('  NOT created: a text index — see the note at the top of this file.\n');

if (!apply) {
  console.log('PLAN ONLY. Nothing was created. Re-run with --apply in Phase 2.3.');
  process.exit(0);
}

/* Phase 2.3: creation is now implemented, still behind the explicit flag. */
createIndexes();
}

async function createIndexes() {
  const { MongoClient } = await import('mongodb');
  const fs = await import('node:fs');
  const path = await import('node:path');

  // .env, the way the other maintenance scripts read it.
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

  console.log(`Creating indexes on ${db.databaseName}.hiring_jobs\n`);
  const before = new Set((await col.indexes()).map((i) => i.name));

  let created = 0, already = 0;
  for (const idx of HIRING_JOBS_INDEXES) {
    const t0 = Date.now();
    try {
      /* `background: true` is a no-op on modern MongoDB (index builds no longer
         block readers or writers) but is harmless and explicit about intent. */
      const name = await col.createIndex(idx.keys, { ...idx.options, background: true });
      const ms = Date.now() - t0;
      if (before.has(name)) { already += 1; console.log(`  = ${name} (already present, ${ms}ms)`); }
      else { created += 1; console.log(`  + ${name} created in ${ms}ms`); }
    } catch (err) {
      console.error(`  ! ${idx.options.name} FAILED: ${err.message}`);
      await client.close();
      process.exit(1);
    }
  }

  const after = await col.indexes();
  console.log(`\n  created ${created}, already present ${already}`);
  console.log(`  collection now has ${after.length} indexes:`);
  for (const i of after) console.log(`    ${i.name} ${JSON.stringify(i.key)}`);

  const stats = await db.command({ collStats: 'hiring_jobs' }).catch(() => null);
  if (stats) {
    console.log(`\n  total index size: ${(stats.totalIndexSize / 1048576).toFixed(2)} MB`);
    console.log(`  index sizes: ${JSON.stringify(stats.indexSizes)}`);
  }
  await client.close();
  process.exit(0);
}
