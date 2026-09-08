/**
 * Phase 2.4 — a storage failure must never look like an empty dataset.
 *
 * Run: npm run test:storage-failure-semantics
 *
 * ═══ WHAT THIS GUARDS ═══
 *
 * During the Phase 2.3 migration a transient Atlas read failed. `readJsonFile`
 * answered with its fallback, the corpus read as ZERO postings, and the
 * reconciliation planner was handed an empty source against 5,276 live
 * documents — a plan to delete the entire job board. `isPlanSafe()` refused it.
 * Nothing else in the path would have.
 *
 * The same silence reaches visitors: an unreachable database rendering as
 * "there are no jobs" over HTTP 200 is indistinguishable from an empty board.
 *
 * The error type and the planner are executed here against real values; the
 * route-level contracts are asserted against the files that define them.
 */
import { readFileSync } from 'node:fs';
import { StorageReadError } from '../lib/server/storage';
import { planReconciliation, isPlanSafe } from '../lib/server/db/hiring-jobs-reconcile';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');
const STORAGE = read('lib/server/storage.ts');
const HIRING = read('lib/server/hiring.ts');

/* ═══ TEST 1 — a successful EMPTY read stays a legitimate empty result ═══ */

const STRICT = STORAGE.slice(STORAGE.indexOf('export async function readJsonFileStrict'));
check('an ABSENT app_state key returns the fallback, not an error',
  /return value === null \? fallbackWhenAbsent : value;/.test(STRICT));
check('a missing FILE (ENOENT) returns the fallback too',
  /code === 'ENOENT'\) return fallbackWhenAbsent;/.test(STRICT));
check('so a genuinely empty store is still allowed to be empty',
  /fallbackWhenAbsent/.test(STRICT));

/* ═══ TEST 2 — a read FAILURE is a failure ═══════════════════════════════ */

check('a rejected app_state read throws StorageReadError',
  /catch \(error\) \{[\s\S]{0,220}throw new StorageReadError/.test(STRICT));
check('a failing row-adapter throws too',
  (STRICT.match(/throw new StorageReadError/g) ?? []).length >= 3);
{
  const err = new StorageReadError('hiring-jobs.json', new Error('connection timed out'));
  check('the error names the store', err.path === 'hiring-jobs.json');
  check('and carries the underlying reason for logs',
    /connection timed out/.test(err.message));
  check('it is a real Error subclass, so instanceof works across the codebase',
    err instanceof Error && err.name === 'StorageReadError');
}

/* ═══ TEST 3 — failure NEVER becomes [] ══════════════════════════════════ */

check('readJsonFileStrict has no catch that returns a fallback on failure',
  !/catch[\s\S]{0,120}return fallbackWhenAbsent;[\s\S]{0,40}\}\s*catch/.test(STRICT));
check('the job corpus reads through the STRICT reader',
  /readJsonFileStrict<HiringJobPosting\[\]>\(hiringJobsPath, \[\]\)/.test(HIRING));
check('and the permissive reader still exists for the ~245 other stores',
  /export async function readJsonFile</.test(STORAGE));
check('the two are separate functions, so nothing else changed behaviour',
  /export async function readJsonFileStrict</.test(STORAGE));

/* ═══ TEST 4 — no successful empty board on storage failure ══════════════ */

const PUBLIC = read('app/api/jobs/public/route.ts');
check('/api/jobs/public answers a thrown read with 500, not an empty 200',
  /catch \{[\s\S]{0,140}status: 500/.test(PUBLIC));

const RECS = read('app/api/recommendations/jobs/route.ts');
check('recommendations no longer swallow a corpus failure into []',
  !/getPublishedHiringJobs\(\)\.catch/.test(RECS));
check('and its error path is no longer a 200 carrying an empty list',
  !/\{ jobs: \[\], total: 0 \}, \{ status: 200 \}/.test(RECS));
check('it returns 503 instead',
  /status: 503/.test(RECS));
check('while keeping the response SHAPE, so clients do not crash on it',
  /jobs: \[\], total: 0, error:/.test(RECS));

const EXPLORER = read('app/api/company-explorer/[companyId]/jobs/route.ts');
check('company-explorer does not swallow a corpus failure either',
  !/getPublishedHiringJobs\(\)\.catch/.test(EXPLORER));

/* The homepage warm is a deliberate exception and must stay one. */
const HOME = read('app/page.tsx');
check('the homepage cache-warm may still ignore failure — it serves no response',
  /void getPublishedHiringJobs\(\)\.catch\(\(\) => undefined\)/.test(HOME));

/* ═══ TEST 5 — the planner cannot mistake failure for deletion ═══════════ */

const MIGRATE = read('scripts/hiring-jobs-migrate.ts');
const DRYRUN = read('scripts/hiring-jobs-dryrun.ts');
check('the migrator aborts on a StorageReadError before planning',
  /error instanceof StorageReadError/.test(MIGRATE)
  && /SOURCE READ FAILED/.test(MIGRATE));
check('and says explicitly that it is not an empty corpus',
  /this is not an empty corpus/i.test(MIGRATE));
check('the dry-run does the same rather than printing a delete-everything plan',
  /error instanceof StorageReadError/.test(DRYRUN)
  && /NOT an empty corpus/.test(DRYRUN));
check('the migrator still refuses an empty source independently',
  /source corpus is EMPTY/.test(MIGRATE));

/* ═══ TEST 6 — isPlanSafe remains the second barrier ═════════════════════ */

{
  const target = new Map(Array.from({ length: 5276 }, (_, i) => [`j${i}`, { fp: 'f', order: i }] as const));
  const plan = planReconciliation([], target);
  const verdict = isPlanSafe(plan);
  check('an empty source against a populated target is STILL refused',
    verdict.safe === false);
  check('and it would have planned to remove everything, which is the point',
    plan.counts.removals === 5276);
  check('the refusal explains itself',
    /refusing to delete every job/.test(verdict.reason ?? ''));
}
check('isPlanSafe was not weakened',
  /maxRemovalRatio \?\? 0\.10/.test(read('lib/server/db/hiring-jobs-reconcile.ts')));

/* ═══ TEST 7 — successful reads are unchanged ════════════════════════════ */

{
  const target = new Map([['a', { fp: 'fa', order: 0 }]]);
  const plan = planReconciliation([{ id: 'a', order: 0, fp: 'fa' }], target);
  check('an unchanged corpus still plans nothing',
    plan.counts.unchanged === 1 && plan.counts.removals === 0);
  check('and is safe', isPlanSafe(plan).safe === true);
}
{
  /* A legitimately empty board on BOTH sides is not a failure. */
  const plan = planReconciliation([], new Map());
  check('an empty source against an empty target is allowed',
    isPlanSafe(plan).safe === true);
}
check('getHiringJobs still returns [] for an absent key, not an error',
  /readJsonFileStrict<HiringJobPosting\[\]>\(hiringJobsPath, \[\]\)/.test(HIRING));

/* ═══ Phase 2.7A — the same lesson, applied to the WRITE path ═════════════
   Phase 2.4 stopped a failed READ from becoming []. The write path inherits
   that guarantee only while the corpus it writes comes from a strict read: if
   getHiringJobs() ever degrades to [] again, saveHiringJobs would write an
   empty corpus and the mirror's $nin reconciliation would delete every job. */
{
  const HIRING = readFileSync('lib/server/hiring.ts', 'utf8');
  check('the write funnel builds its corpus from a STRICT read',
    /readJsonFileStrict<HiringJobPosting\[\]>\(hiringJobsPath/.test(HIRING));
  check('no non-strict readJsonFile supplies the job corpus',
    !/readJsonFile<HiringJobPosting\[\]>\(hiringJobsPath/.test(HIRING));

  const COLLECTION = readFileSync('lib/server/db/hiring-jobs-collection.ts', 'utf8');
  check('reconciliation is scoped to the corpus the funnel just wrote',
    /deleteMany\(\{ _id: \{ \$nin: ids as never\[\] \} \}\)/.test(COLLECTION));
  check('and a mirror failure marks the replica stale rather than reporting success',
    /markHiringJobsCollectionStale/.test(COLLECTION));
}

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
