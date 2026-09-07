/**
 * Phase 2 migration DRY-RUN. READ-ONLY: this script cannot write.
 *
 * Run: npm run jobs:dryrun
 *
 * It reads the source corpus and the canonical collection, plans the
 * reconciliation with the SAME pure function the executor will use, and prints
 * what would change. It opens no write path — there is no insert, update,
 * delete or index creation anywhere in this file, and the planner it calls is
 * pure by construction.
 */
import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return;
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
loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), '.env.local'));

import { getMongoDb } from '../lib/server/database';
import { getHiringJobs } from '../lib/server/hiring';
import { StorageReadError } from '../lib/server/storage';
import { fingerprintJob } from '../lib/server/db/hiring-jobs-collection';
import { planReconciliation, isPlanSafe, FP_FIELD, ORDER_FIELD } from '../lib/server/db/hiring-jobs-reconcile';

const COL = 'hiring_jobs';

(async () => {
  const db = await getMongoDb();
  if (!db) { console.error('No database configured.'); process.exit(1); }

  console.log('Reading the source corpus (app_state)…');
  const t0 = Date.now();
  let jobs;
  try {
    jobs = await getHiringJobs();
  } catch (error) {
    /* Named, not silently planned around. A failed read used to arrive as an
       empty corpus and produce a plan that would remove every document. */
    if (error instanceof StorageReadError) {
      console.error(`\nSOURCE READ FAILED — ${error.message}`);
      console.error('This is a storage failure, NOT an empty corpus. Nothing was planned.');
      process.exit(1);
    }
    throw error;
  }
  console.log(`  ${jobs.length} postings in ${Date.now() - t0} ms`);

  console.log('Reading the collection (ids + fingerprints only)…');
  const t1 = Date.now();
  const rows = await db.collection(COL)
    .find({}, { projection: { _id: 1, [FP_FIELD]: 1, [ORDER_FIELD]: 1 } })
    .toArray();
  console.log(`  ${rows.length} documents in ${Date.now() - t1} ms`);

  const target = new Map<string, { fp?: string; order?: number }>(
    rows.map((d) => [String(d._id), {
      fp: (d as Record<string, unknown>)[FP_FIELD] as string | undefined,
      order: (d as Record<string, unknown>)[ORDER_FIELD] as number | undefined,
    }]),
  );

  const source = jobs.map((job, index) => ({
    id: String((job as { id?: unknown }).id ?? ''),
    order: index,
    fp: fingerprintJob(job as unknown as Record<string, unknown>),
  })).filter((e) => e.id);

  const plan = planReconciliation(source, target);
  const safety = isPlanSafe(plan);

  console.log('\n═══ DRY-RUN PLAN — NOTHING WAS WRITTEN ═══');
  console.log(`  source postings : ${plan.counts.source}`);
  console.log(`  collection docs : ${plan.counts.target}`);
  console.log(`  would INSERT    : ${plan.counts.inserts}`);
  console.log(`  would UPDATE    : ${plan.counts.updates}`);
  console.log(`  would REORDER   : ${plan.counts.reorders}`);
  console.log(`  unchanged       : ${plan.counts.unchanged}`);
  console.log(`  would REMOVE    : ${plan.counts.removals}`);
  console.log(`  plan is safe    : ${safety.safe}${safety.reason ? ` — ${safety.reason}` : ''}`);

  const sample = (label: string, ids: string[]) => {
    if (!ids.length) return;
    console.log(`  ${label} sample: ${ids.slice(0, 5).join(', ')}${ids.length > 5 ? ` … +${ids.length - 5}` : ''}`);
  };
  sample('insert', plan.inserts.map((e) => e.id));
  sample('update', plan.updates.map((e) => e.id));
  sample('remove', plan.removals);

  const dupes = plan.counts.source - (plan.counts.inserts + plan.counts.updates
    + plan.counts.reorders + plan.counts.unchanged);
  console.log(`\n  duplicate ids in source: ${dupes} (every id must be planned exactly once)`);
  console.log('\nNo writes were performed by this script.');
  process.exit(0);
})();
