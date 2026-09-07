/**
 * Phase 2.2 — canonical hiring_jobs preparation.
 *
 * Run: npm run test:hiring-jobs-canonical
 *
 * The reconciliation planner is a PURE FUNCTION, so it is executed here against
 * real inputs rather than asserted about by reading source. The parts that are
 * structural — a budget reservation, a closed bypass, an index plan — are
 * checked against the actual files.
 *
 * NOTHING HERE TOUCHES A DATABASE.
 */
import { readFileSync } from 'node:fs';
import {
  planReconciliation, isPlanSafe, type ReconcileEntry,
} from '../lib/server/db/hiring-jobs-reconcile';
import { fingerprintJob } from '../lib/server/db/hiring-jobs-collection';
import {
  saveReserveMs, SAVE_RESERVE_BASE_MS, SAVE_RESERVE_MAX_SHARE,
} from '../lib/server/scraper-client';
import { HIRING_JOBS_INDEXES } from './db-indexes-hiring-jobs.mjs';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');
const e = (id: string, order: number, fp: string): ReconcileEntry => ({ id, order, fp });

/* ═══ 1. Budget reservation ══════════════════════════════════════════════ */

const WINDOW = 300_000;
check('an empty corpus still reserves the floor',
  saveReserveMs(0, WINDOW) === SAVE_RESERVE_BASE_MS);
check('the reserve GROWS with the corpus',
  saveReserveMs(10_000, WINDOW) > saveReserveMs(1_000, WINDOW));
check("today's corpus reserves more than the old flat 45s",
  saveReserveMs(5_276, WINDOW) > 45_000);
check('the reserve is capped so sources are still read',
  saveReserveMs(1_000_000, WINDOW) <= Math.floor(WINDOW * SAVE_RESERVE_MAX_SHARE));
check('the cap never drops below the floor, even for a tiny window',
  saveReserveMs(1_000_000, 10_000) >= SAVE_RESERVE_BASE_MS);
check('a negative job count cannot shrink the reserve',
  saveReserveMs(-5, WINDOW) === SAVE_RESERVE_BASE_MS);
check('sources always keep some of the window',
  saveReserveMs(1_000_000, WINDOW) < WINDOW);

const CLIENT = read('lib/server/scraper-client.ts');
check('the deadline subtracts the computed reserve, not a constant',
  /opts\.budgetMs - reserveMs/.test(CLIENT));
check('the corpus size is read WITHOUT loading any postings',
  /countPublishedJobs\(\)/.test(CLIENT) && !/getHiringJobs\(\)/.test(CLIENT));

/* ═══ 2. A failed mirror is never reported as success ════════════════════ */

const HIRING = read('lib/server/hiring.ts');
check('saveHiringJobs returns the mirror outcome to its caller',
  /Promise<SaveHiringJobsResult>/.test(HIRING) && /mirrored: mirror\.ok/.test(HIRING));
check('and a mirror failure is logged as an error, not swallowed',
  /MIRROR FAILED/.test(HIRING));
check('but it still does not fail the save — app_state is already written',
  /app_state remains the source of truth/.test(HIRING) || /remains authoritative/i.test(HIRING));

/* ═══ 3. The production bypass is closed ═════════════════════════════════ */

const INGEST = read('lib/server/job-sources/run-ingestion.ts');
check('injecting saveJobs/loadJobs in production throws',
  /NODE_ENV === 'production' && \(options\.saveJobs \|\| options\.loadJobs\)/.test(INGEST)
  && /throw new Error\(/.test(INGEST));
check('it refuses loudly rather than silently ignoring the override',
  /test-only and must not be used in production/.test(INGEST));
check('injection still works outside production, so tests keep their seam',
  /options\.saveJobs \?\? saveHiringJobs/.test(INGEST));

/* ═══ 4. Reconciliation planning — executed, not described ═══════════════ */

{
  const target = new Map([['a', { fp: 'fa', order: 0 }], ['b', { fp: 'fb', order: 1 }]]);
  const plan = planReconciliation([e('a', 0, 'fa'), e('b', 1, 'fb')], target);
  check('an identical snapshot plans no writes at all',
    plan.counts.inserts === 0 && plan.counts.updates === 0
    && plan.counts.reorders === 0 && plan.counts.removals === 0
    && plan.counts.unchanged === 2);
}
{
  const target = new Map([['a', { fp: 'fa', order: 0 }]]);
  const plan = planReconciliation([e('a', 0, 'fa'), e('new', 1, 'fn')], target);
  check('a job absent from the collection is an INSERT', plan.counts.inserts === 1);
  check('and the existing one is left alone', plan.counts.unchanged === 1);
  check('and nothing is removed', plan.counts.removals === 0);
}
{
  const target = new Map([['a', { fp: 'OLD', order: 0 }]]);
  const plan = planReconciliation([e('a', 0, 'NEW')], target);
  check('a changed fingerprint is an UPDATE', plan.counts.updates === 1 && plan.counts.unchanged === 0);
}
{
  const target = new Map([['a', { fp: 'fa', order: 5 }]]);
  const plan = planReconciliation([e('a', 0, 'fa')], target);
  check('identical content that merely moved is a REORDER, not a rewrite',
    plan.counts.reorders === 1 && plan.counts.updates === 0);
}
{
  const target = new Map([['gone', { fp: 'fg', order: 0 }], ['a', { fp: 'fa', order: 1 }]]);
  const plan = planReconciliation([e('a', 0, 'fa')], target);
  check('a job the source no longer lists is a REMOVAL',
    plan.counts.removals === 1 && plan.removals[0] === 'gone');
}
{
  /* THE SCALING POINT: removals are bounded by what is being REMOVED, never by
     what is being kept — which is what `$nin: [every id]` got wrong. */
  const target = new Map(Array.from({ length: 50_000 }, (_, i) => [`k${i}`, { fp: 'f', order: i }] as const));
  const source = Array.from({ length: 50_000 }, (_, i) => e(`k${i}`, i, 'f'));
  const plan = planReconciliation(source, target);
  check('50k unchanged jobs plan ZERO removals and zero writes',
    plan.counts.removals === 0 && plan.counts.updates === 0 && plan.counts.unchanged === 50_000);
}
{
  const target = new Map([['a', { fp: 'fa', order: 0 }]]);
  const plan = planReconciliation([e('a', 0, 'fa'), e('a', 1, 'DIFFERENT')], target);
  check('a duplicate id in the source is planned exactly once',
    plan.counts.inserts + plan.counts.updates + plan.counts.reorders + plan.counts.unchanged === 1);
}
{
  const plan = planReconciliation([], new Map());
  check('two empty sides plan nothing and do not throw', plan.counts.source === 0);
}

/* ═══ 5. Plan safety — a failed read must not empty the board ════════════ */

{
  const target = new Map(Array.from({ length: 100 }, (_, i) => [`k${i}`, { fp: 'f', order: i }] as const));
  const wipe = planReconciliation([], target);
  check('an EMPTY source against a full collection is refused',
    isPlanSafe(wipe).safe === false);
  check('and the refusal says why', /refusing to delete every job/.test(isPlanSafe(wipe).reason ?? ''));

  const half = planReconciliation(
    Array.from({ length: 50 }, (_, i) => e(`k${i}`, i, 'f')), target);
  check('removing half the board is refused as implausible', isPlanSafe(half).safe === false);

  const few = planReconciliation(
    Array.from({ length: 95 }, (_, i) => e(`k${i}`, i, 'f')), target);
  check('a small, plausible removal is allowed', isPlanSafe(few).safe === true);
  check('and the ceiling is configurable for a deliberate large prune',
    isPlanSafe(half, { maxRemovalRatio: 0.9 }).safe === true);
}
{
  const plan = planReconciliation([e('a', 0, 'f')], new Map());
  check('a first migration into an EMPTY collection is allowed',
    isPlanSafe(plan).safe === true && plan.counts.inserts === 1);
}

/* ═══ 6. Identity and fingerprint are reused, not reinvented ═════════════ */

const RECON = read('lib/server/db/hiring-jobs-reconcile.ts');
check('the planner defines no identity of its own', !/sourceJobId|canonicalUrl|contentHash/.test(RECON));
check('it performs no I/O', !/getMongoDb|collection\(|await db/.test(RECON));
check('_id stays the job id', /export const ID_FIELD = '_id'/.test(RECON));
check('the fingerprint is stable across key order',
  fingerprintJob({ a: 1, b: 2 }) === fingerprintJob({ b: 2, a: 1 }));
check('and changes when content changes',
  fingerprintJob({ a: 1 }) !== fingerprintJob({ a: 2 }));

/* ═══ 7. Empty-collection safety ═════════════════════════════════════════ */

check('an empty-but-reachable collection falls back instead of publishing nothing',
  /if \(docs && docs\.length\)/.test(HIRING));
check('the marquee does the same', /if \(fromCollection && fromCollection\.length\)/.test(HIRING));
/* Whitespace-normalised: the sentence wraps across lines in the source. */
check('and the reasoning is recorded where the guard lives',
  /must never render as "there are no jobs"/.test(HIRING.replace(/\s+/g, ' ')));
const COLLECTION = read('lib/server/db/hiring-jobs-collection.ts');
check('selectors still signal unavailability with null, not an empty array',
  /if \(!healthy\) return null;/.test(COLLECTION) && /if \(!db\) return null;/.test(COLLECTION));

/* ═══ 8. Index plan ══════════════════════════════════════════════════════ */

check('every proposed index is named', HIRING_JOBS_INDEXES.every((i: any) => i.options?.name));
check('every proposed index states what it supports and what it costs',
  HIRING_JOBS_INDEXES.every((i: any) => i.supports && i.cost));
check('the active predicate is indexed',
  HIRING_JOBS_INDEXES.some((i: any) => i.options.name === 'active_predicate'));
check('each sort has an index carrying the _id tie-break',
  ['published_newest', 'published_salary', 'published_relevance']
    .every((n) => HIRING_JOBS_INDEXES.some((i: any) => i.options.name === n && i.keys._id === 1)));
check('NO text index is proposed — it would change search semantics',
  !HIRING_JOBS_INDEXES.some((i: any) => Object.values(i.keys).includes('text')));
const IDXSCRIPT = read('scripts/db-indexes-hiring-jobs.mjs');
check('the index script is plan-only unless --apply is passed', /PLAN ONLY/.test(IDXSCRIPT));
/* --apply is implemented as of Phase 2.3. What must remain true is that it is
   the ONLY way indexes get created: never on import, never by default. */
check('index creation is gated behind the explicit --apply flag',
  /const apply = process\.argv\.includes\('--apply'\)/.test(IDXSCRIPT)
  && /if \(!apply\) \{[\s\S]{0,200}process\.exit\(0\)/.test(IDXSCRIPT));
check('importing the file creates nothing — the runner is guarded',
  /const invokedDirectly = process\.argv\[1\]/.test(IDXSCRIPT)
  && /if \(!invokedDirectly\)/.test(IDXSCRIPT));
check('createIndex is only reachable from the guarded runner',
  IDXSCRIPT.indexOf('function createIndexes') > IDXSCRIPT.indexOf('invokedDirectly'));

/* ═══ 9. The dry-run cannot write ════════════════════════════════════════ */

const DRYRUN = read('scripts/hiring-jobs-dryrun.ts');
for (const forbidden of ['insertOne', 'insertMany', 'updateOne', 'updateMany',
  'deleteOne', 'deleteMany', 'bulkWrite', 'createIndex', 'replaceOne', 'findOneAndUpdate']) {
  check(`the dry-run never calls ${forbidden}`, !new RegExp(`\\.${forbidden}\\(`).test(DRYRUN));
}
check('the dry-run reads the collection with a projection, not whole documents',
  /projection: \{ _id: 1/.test(DRYRUN));
check('and it uses the shared planner rather than its own logic',
  /planReconciliation\(/.test(DRYRUN));

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
