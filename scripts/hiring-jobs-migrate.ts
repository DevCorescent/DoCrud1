/**
 * Phase 2.3 — apply the reconciliation plan to `hiring_jobs`.
 *
 *   npm run jobs:migrate           # pre-flight + plan, WRITES NOTHING
 *   npm run jobs:migrate -- --apply
 *
 * ═══ WHAT THIS IS ALLOWED TO TOUCH ═══
 *
 * `hiring_jobs`, and nothing else. `app_state` remains the source of truth and
 * is never opened for writing here — the collection is brought into step WITH
 * it, never the other way round. That is what makes rollback trivial during
 * this phase: stop reading the collection and the product is exactly as it was.
 *
 * ═══ IT REUSES THE PLANNER, IT DOES NOT REPLACE IT ═══
 *
 * The decision of what to write comes from `planReconciliation()` and is gated
 * by `isPlanSafe()` — the same pure functions the dry-run prints. This file
 * only executes a plan it did not invent, so what was reviewed is what runs.
 *
 * ═══ IDEMPOTENT BY CONSTRUCTION ═══
 *
 * Every write is an upsert keyed on `_id = job.id`, and the plan is recomputed
 * from live state each run. Running it twice is running it once: the second
 * pass finds every fingerprint already correct and plans nothing.
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
import {
  planReconciliation, isPlanSafe, FP_FIELD, ORDER_FIELD,
} from '../lib/server/db/hiring-jobs-reconcile';

const COL = 'hiring_jobs';
const BATCH = 500;
const APPLY = process.argv.includes('--apply');

/** Any of these ends the run before a single write. */
function abort(reason: string): never {
  console.error(`\nABORTED — ${reason}`);
  console.error('Nothing was written.');
  process.exit(1);
}

(async () => {
  const db = await getMongoDb();
  if (!db) abort('no database configured');

  /* ── Pre-flight ────────────────────────────────────────────────────────*/
  console.log('═══ PRE-FLIGHT ═══');
  console.log(`  database   : ${db.databaseName}`);
  console.log(`  collection : ${COL}`);
  console.log(`  mode       : ${APPLY ? 'APPLY (writes hiring_jobs only)' : 'PLAN ONLY (no writes)'}`);

  const collections = (await db.listCollections().toArray()).map((c) => c.name);
  if (!collections.includes(COL)) abort(`collection ${COL} does not exist`);

  /* A FAILED read is now distinguishable from an empty one, so it is named as
     such instead of arriving here as `[]`. This is the exact condition that
     produced a "delete all 5,276" plan during Phase 2.3. */
  let jobs;
  try {
    jobs = await getHiringJobs();
  } catch (error) {
    if (error instanceof StorageReadError) {
      abort(`the SOURCE READ FAILED (${error.message}) — this is not an empty corpus. Retry.`);
    }
    throw error;
  }
  if (!Array.isArray(jobs)) abort('source corpus is not an array');
  if (jobs.length === 0) abort('source corpus is EMPTY — refusing to reconcile against nothing');
  console.log(`  source     : ${jobs.length} postings`);

  const ids = jobs.map((j) => String((j as { id?: unknown }).id ?? ''));
  if (ids.some((id) => !id)) abort('a source posting has no id');
  const unique = new Set(ids);
  if (unique.size !== ids.length) abort(`duplicate ids in source (${ids.length - unique.size})`);

  const rows = await db.collection(COL)
    .find({}, { projection: { _id: 1, [FP_FIELD]: 1, [ORDER_FIELD]: 1 } })
    .toArray();
  console.log(`  target     : ${rows.length} documents`);

  const target = new Map<string, { fp?: string; order?: number }>(
    rows.map((d) => [String(d._id), {
      fp: (d as Record<string, unknown>)[FP_FIELD] as string | undefined,
      order: (d as Record<string, unknown>)[ORDER_FIELD] as number | undefined,
    }]),
  );

  const source = jobs.map((job, index) => ({
    id: String((job as { id?: unknown }).id),
    order: index,
    fp: fingerprintJob(job as unknown as Record<string, unknown>),
  }));
  const byId = new Map(jobs.map((j) => [String((j as { id?: unknown }).id), j]));

  const plan = planReconciliation(source, target);
  const safety = isPlanSafe(plan);

  console.log('\n═══ PLAN ═══');
  console.log(`  inserts ${plan.counts.inserts} | updates ${plan.counts.updates} `
    + `| reorders ${plan.counts.reorders} | unchanged ${plan.counts.unchanged} `
    + `| removals ${plan.counts.removals}`);
  console.log(`  safe: ${safety.safe}${safety.reason ? ` — ${safety.reason}` : ''}`);

  if (!safety.safe) abort(`plan rejected by isPlanSafe: ${safety.reason}`);

  /* Phase 2.3 expects NO removals. A non-zero count is a state change nobody
     reviewed, so it stops here for a human rather than deleting postings. */
  if (plan.counts.removals !== 0) {
    abort(`plan contains ${plan.counts.removals} REMOVALS — Phase 2.3 expects 0. `
      + 'Review before any deletion is applied.');
  }

  if (!APPLY) {
    console.log('\nPLAN ONLY — no writes performed. Re-run with --apply to execute.');
    process.exit(0);
  }

  /* ── Apply ─────────────────────────────────────────────────────────────*/
  const writes = [...plan.inserts, ...plan.updates];
  console.log(`\n═══ APPLYING ═══\n  ${writes.length} document writes, ${plan.counts.reorders} position stamps`);

  const startedAt = Date.now();
  let done = 0, upserted = 0, modified = 0;

  /* Batched, unordered: one rejected document must not abandon the rest, and
     the whole set is never held in a single enormous request. */
  for (let i = 0; i < writes.length; i += BATCH) {
    const slice = writes.slice(i, i + BATCH);
    const ops = slice.map((entry) => {
      const job = byId.get(entry.id) as unknown as Record<string, unknown>;
      if (!job) abort(`planned write for ${entry.id} but it is absent from the source`);
      return {
        updateOne: {
          filter: { _id: entry.id as never },
          /* $set, matching mirrorPublishedJobs exactly — the collection keeps
             the same shape the mirror produces, including historical markers
             like migratedAt. Every source field is carried across verbatim;
             nothing is dropped, computed or invented. */
          update: { $set: { ...job, _id: entry.id, [ORDER_FIELD]: entry.order, [FP_FIELD]: entry.fp } },
          upsert: true,
        },
      };
    });
    const res = await db.collection(COL).bulkWrite(ops as never[], { ordered: false });
    upserted += res.upsertedCount ?? 0;
    modified += res.modifiedCount ?? 0;
    done += slice.length;
    console.log(`  ${done}/${writes.length} (upserted ${upserted}, modified ${modified})`);
  }

  /* Position-only stamps for documents whose content did not change. */
  for (let i = 0; i < plan.reorders.length; i += BATCH) {
    const slice = plan.reorders.slice(i, i + BATCH);
    const ops = slice.map((entry) => ({
      updateOne: {
        filter: { _id: entry.id as never },
        update: { $set: { [ORDER_FIELD]: entry.order } },
      },
    }));
    if (ops.length) await db.collection(COL).bulkWrite(ops as never[], { ordered: false });
  }

  console.log(`\n  applied in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log(`  upserted ${upserted} | modified ${modified}`);
  console.log('  app_state was NOT modified.');
  process.exit(0);
})();
