/**
 * Non-destructive migration: app_state hiring jobs → a `hiring_jobs` collection.
 *
 * Run with:  npm run db:migrate-hiring-jobs
 *            npm run db:migrate-hiring-jobs -- --dry-run
 *
 * WHY
 * ---
 * Every job lives inside ONE `app_state` document (`json:data/hiring-jobs.json`),
 * ~2.7 MB across 360 postings. A document is the smallest unit Mongo will hand
 * back, so any read that misses the in-process cache pays for all of it. One
 * document per job lets each caller read only the jobs and fields it needs.
 *
 * SAFETY — THIS SCRIPT NEVER DESTROYS ANYTHING
 * --------------------------------------------
 *  · app_state is READ ONLY here. It is never written, trimmed or deleted, and
 *    remains the source of truth until reads are switched in a later, separate
 *    change. It is the backup.
 *  · Writes are `updateOne(..., { upsert: true })` keyed on the job's own id, so
 *    running twice updates in place rather than duplicating. Idempotent.
 *  · A job present in `hiring_jobs` but absent from app_state is reported, not
 *    deleted — this script never decides that data should disappear.
 *  · --dry-run performs every read and comparison and writes nothing.
 *
 * Follows scripts/db-indexes.mjs: a deliberate, re-runnable maintenance script
 * rather than a startup hook, because it only needs to run when asked.
 */
import { MongoClient } from 'mongodb';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const APP_STATE_KEY = 'json:data/hiring-jobs.json';
const TARGET = 'hiring_jobs';
const DRY_RUN = process.argv.includes('--dry-run');

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is required.');
  process.exit(1);
}

/** Fields whose equality decides whether the copy is faithful. */
const VALIDATED_FIELDS = [
  'id', 'title', 'organizationName', 'organizationId', 'location', 'department',
  'employmentType', 'workMode', 'experienceLevel', 'status',
  'description', 'responsibilities', 'requirements',
  'preferredSkills', 'targetRoleKeywords', 'minimumAtsScore',
  'applyUrl', 'shareUrl', 'createdAt', 'updatedAt', 'source', 'pageId',
  'createdByUserId', 'createdByEmail', 'requiredDocuments',
];

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/* The whole set is ~2.7 MB. On a slow link a single bulkWrite exceeds the
   default socket timeout, so writes are batched below and the socket is given
   room for each batch rather than for the whole migration at once. */
const BATCH_SIZE = 25;
const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 60000,
  socketTimeoutMS: 600000,
  connectTimeoutMS: 60000,
});

try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'docrud');

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Migrating ${APP_STATE_KEY} → ${TARGET}\n`);

  /* ── 1. Read the source. Never written to. ─────────────────────────────── */
  const stateDoc = await db.collection('app_state').findOne({ _id: APP_STATE_KEY });
  const source = Array.isArray(stateDoc?.value) ? stateDoc.value : null;
  if (!source) {
    console.error(`Source document ${APP_STATE_KEY} is missing or not an array — nothing to migrate.`);
    process.exit(1);
  }

  const withId = source.filter((j) => j && typeof j.id === 'string' && j.id);
  if (withId.length !== source.length) {
    console.error(`ABORT: ${source.length - withId.length} job(s) have no usable id. Refusing to migrate a partial set.`);
    process.exit(1);
  }
  const uniqueIds = new Set(withId.map((j) => j.id));
  if (uniqueIds.size !== withId.length) {
    console.error(`ABORT: source contains ${withId.length - uniqueIds.size} duplicate id(s).`);
    process.exit(1);
  }
  console.log(`  source: ${withId.length} jobs, ${uniqueIds.size} unique ids, no duplicates`);

  /* ── 2. Upsert one document per job, keyed on the job's own id. ─────────── */
  const before = await db.collection(TARGET).countDocuments();
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  if (DRY_RUN) {
    const existing = new Map(
      (await db.collection(TARGET).find({}).toArray()).map((d) => [d._id, d]),
    );
    for (const job of withId) {
      const prior = existing.get(job.id);
      if (!prior) inserted += 1;
      else if (VALIDATED_FIELDS.some((f) => !same(prior[f], job[f]))) updated += 1;
      else unchanged += 1;
    }
  } else {
    /* Batched, unordered bulkWrites. `_id` IS the job id, so re-running updates
       in place and duplicates are structurally impossible — which also makes an
       interrupted run safe to simply re-run: completed batches become no-op
       updates and only the missing ones are written. */
    for (let i = 0; i < withId.length; i += BATCH_SIZE) {
      const batch = withId.slice(i, i + BATCH_SIZE);
      const ops = batch.map((job) => ({
        updateOne: {
          filter: { _id: job.id },
          update: { $set: { ...job, _id: job.id, migratedAt: new Date().toISOString() } },
          upsert: true,
        },
      }));
      const result = await db.collection(TARGET).bulkWrite(ops, { ordered: false });
      inserted += result.upsertedCount ?? 0;
      updated += result.modifiedCount ?? 0;
      process.stdout.write(`\r  writing… ${Math.min(i + BATCH_SIZE, withId.length)}/${withId.length}`);
    }
    process.stdout.write('\n');
    unchanged = withId.length - inserted - updated;
  }

  console.log(`  ${DRY_RUN ? 'would insert' : 'inserted'}: ${inserted}`);
  console.log(`  ${DRY_RUN ? 'would update' : 'updated'} : ${updated}`);
  console.log(`  unchanged   : ${unchanged}`);
  console.log(`  ${TARGET} count: ${before} → ${DRY_RUN ? '(unchanged, dry run)' : await db.collection(TARGET).countDocuments()}`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] nothing written. Re-run without --dry-run to apply.');
    process.exit(0);
  }

  /* ── 3. Validate the copy against the source, field by field. ──────────── */
  console.log('\nValidating…');
  const copied = await db.collection(TARGET).find({}).toArray();
  const byId = new Map(copied.map((d) => [d._id, d]));

  const problems = [];
  if (copied.length !== withId.length) {
    problems.push(`count mismatch: app_state ${withId.length} vs ${TARGET} ${copied.length}`);
  }
  if (new Set(copied.map((d) => d._id)).size !== copied.length) {
    problems.push('duplicate _id values in the target collection');
  }

  let fieldMismatches = 0;
  for (const job of withId) {
    const doc = byId.get(job.id);
    if (!doc) { problems.push(`missing id in ${TARGET}: ${job.id}`); continue; }
    for (const field of VALIDATED_FIELDS) {
      if (!same(job[field], doc[field])) {
        fieldMismatches += 1;
        if (problems.length < 10) problems.push(`${job.id}.${field} differs`);
      }
    }
  }

  const orphans = copied.filter((d) => !uniqueIds.has(d._id));
  if (orphans.length) {
    // Reported, never deleted — this script does not decide data should vanish.
    console.log(`  note: ${orphans.length} document(s) in ${TARGET} are not in app_state (left untouched)`);
  }

  const checks = [
    ['count matches', copied.length === withId.length],
    ['every source id present', withId.every((j) => byId.has(j.id))],
    ['no duplicate ids', new Set(copied.map((d) => d._id)).size === copied.length],
    ['all validated fields match (incl. description, org, timestamps, status)', fieldMismatches === 0],
  ];
  for (const [label, ok] of checks) console.log(`  ${ok ? '✓' : '✗'} ${label}`);

  if (problems.length) {
    console.error('\nVALIDATION FAILED — do NOT switch reads.');
    for (const p of problems.slice(0, 10)) console.error(`  · ${p}`);
    process.exit(1);
  }

  /* ── 4. Indexes for the access patterns that actually exist. ───────────── */
  console.log('\nIndexes:');
  /* `_id` is the job id, so lookup-by-id is already served by the default index
     — no extra index is created for it. */
  console.log('  · _id (job id) — default index, covers getPublishedHiringJobById');
  const created = [];
  /* Every list read filters status:'published' and the feed orders by newest.
     One compound index serves both the filter and the sort in one pass. */
  created.push(await db.collection(TARGET).createIndex(
    { status: 1, createdAt: -1 }, { name: 'status_createdAt' },
  ));
  /* The marquee groups by employer; this lets that read be index-covered
     instead of scanning every document. */
  created.push(await db.collection(TARGET).createIndex(
    { status: 1, organizationName: 1 }, { name: 'status_organizationName' },
  ));
  for (const name of created) console.log(`  · ${name} — created or already present`);
  console.log('  (no index on description/skills: no query filters on them — ranking scores in application code)');

  console.log('\nMIGRATION OK — app_state untouched, reads NOT switched.');
} finally {
  await client.close();
}
