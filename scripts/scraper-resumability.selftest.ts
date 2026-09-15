/**
 * The worker is bounded, and resumes.
 *
 *   npx tsx scripts/scraper-resumability.selftest.ts
 *
 * ═══ THE PRODUCTION FAILURE THIS PREVENTS ═══
 *
 * A full 87-source run was killed by `TimeoutStartSec=840` after ~14 minutes.
 * No `event=complete`. Nothing persisted — no jobs, no per-source state, no
 * cursors. The whole pass was lost, and the next invocation would have started
 * from the same place and lost it again.
 *
 * Three defects, all in the worker's call into the pipeline:
 *
 *   1. It passed NO `deadlineAt`, on the reasoning that "nothing kills this
 *      process". systemd does. Every write in a run happens AFTER the source
 *      loop, so a kill mid-loop discards everything.
 *   2. It called `runCanonicalIngestion` directly, bypassing the resume
 *      bookkeeping in `runCanonicalIngest` — the round-robin cursor and the
 *      per-source resume tokens were neither loaded nor saved.
 *   3. With 87 sources and a window that fits only some, (1)+(2) meant the
 *      head of the list was re-read forever and the tail was unreachable.
 *
 * The fix routes the worker through `runCanonicalIngest` with a budget SMALLER
 * than the unit's timeout, so a run that cannot fit every source covers what it
 * can, persists it, and the next run continues from there.
 *
 * Source-level assertions plus pure checks. No database, no network, no scrape.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { saveReserveMs, SAVE_RESERVE_MAX_SHARE } from '@/lib/server/scraper-client';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* Read from SOURCE, never imported. Importing the worker executes it — that is
   what the guard at the bottom of that file now prevents, and this test must
   not depend on the guard it is meant to be independent of. */
const DEFAULT_BUDGET_MS = Number(
  /export const DEFAULT_BUDGET_MS = ([\d_]+)/.exec(readFileSync(path.join(process.cwd(), 'scripts/run-job-scraper.ts'), 'utf8'))?.[1].replace(/_/g, '') ?? 0,
);

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const WORKER = 'scripts/run-job-scraper.ts';
const UNIT = 'ops/systemd/docrud-job-scraper.service';

function entrypointIsGuarded() {
  console.log('\n── 0. Importing the worker does not run it ──');
  const w = code(read(WORKER));
  /* An import used to start a real scrape: production env, Mongo lease, live
     board fetches. A module that self-executes cannot be safely referenced. */
  check('main() runs only when invoked directly', /if \(invokedDirectly\) \{/.test(w));
  check('the entrypoint is decided from argv[1]', w.includes('process.argv[1]'));
  check('the constant is readable without importing the module',
    Number.isFinite(DEFAULT_BUDGET_MS) && DEFAULT_BUDGET_MS > 0, String(DEFAULT_BUDGET_MS));
}

function boundedByBudget() {
  console.log('\n── 1. The worker knows it is bounded ──');
  const w = code(read(WORKER));

  /* THE regression: a worker that runs without a deadline cannot stop in time
     to persist, and everything it did is discarded at the kill. */
  check('a budget is passed to the run', /runCanonicalIngest\(\{\s*budgetMs,/.test(w));
  check('the budget is logged, so a wrong one is visible', w.includes("event: 'budget'"));
  check('it is overridable per run', w.includes("'--budget-ms'"));
  check('and by environment', w.includes('SCRAPER_BUDGET_MS'));
  check('a malformed env budget falls back to the default, not to 0',
    /Number\.isFinite\(envBudget\) && envBudget > 0 \? envBudget : DEFAULT_BUDGET_MS/.test(w));
}

function budgetFitsTheUnit() {
  console.log('\n── 2. The budget fits inside the systemd window ──');
  const unit = read(UNIT);
  const timeoutMs = Number(/TimeoutStartSec=(\d+)/.exec(unit)?.[1] ?? 0) * 1000;

  check('the unit declares a start timeout', timeoutMs > 0, `${timeoutMs}ms`);
  /* The run must finish AND persist while the process is still alive. A budget
     at or above the timeout reintroduces the exact failure. */
  check('the default budget is strictly below the systemd timeout',
    DEFAULT_BUDGET_MS < timeoutMs, `budget=${DEFAULT_BUDGET_MS}ms timeout=${timeoutMs}ms`);
  check('with at least 30s of headroom for the final writes',
    timeoutMs - DEFAULT_BUDGET_MS >= 30_000, `${timeoutMs - DEFAULT_BUDGET_MS}ms headroom`);

  /* The lease must outlive the run, or a second worker could start while the
     first is still writing. */
  const ttlMs = Number(/LEASE_TTL_MS = (\d+) \* 60_000/
    .exec(read('lib/server/job-sources/run-lock.ts'))?.[1] ?? 0) * 60_000;
  check('the lease outlives a full-budget run', ttlMs > DEFAULT_BUDGET_MS,
    `ttl=${ttlMs}ms budget=${DEFAULT_BUDGET_MS}ms`);
}

function reserveProtectsTheWrite() {
  console.log('\n── 3. Part of the window is reserved for persisting ──');

  /* The reserve is what makes a bounded run SAFE rather than merely shorter:
     the loop stops early enough that the writes after it still fit. */
  const small = saveReserveMs(0, DEFAULT_BUDGET_MS);
  const large = saveReserveMs(100_000, DEFAULT_BUDGET_MS);
  check('a reserve is always held back', small > 0, `${small}ms`);
  check('it grows with the corpus that must be written', large > small, `${small} -> ${large}`);
  check('it never eats the whole window',
    large <= Math.floor(DEFAULT_BUDGET_MS * SAVE_RESERVE_MAX_SHARE),
    `${large}ms of ${DEFAULT_BUDGET_MS}ms`);
  check('a run always gets some time to read sources',
    DEFAULT_BUDGET_MS - large > 0);
}

function resumes() {
  console.log('\n── 4. Progress survives, and the tail is reachable ──');
  const w = code(read(WORKER));
  const client = code(read('lib/server/scraper-client.ts'));

  /* Calling the pipeline directly is what skipped the bookkeeping. */
  check('the worker no longer calls the pipeline directly',
    !w.includes("import('@/lib/server/job-sources/run-ingestion')"));
  check('it goes through the resumable client', w.includes('runCanonicalIngest('));

  /* What that client does, and must keep doing. */
  check('the previous state is loaded', client.includes('getScraperState()'));
  check('the run resumes AFTER the last attempted source',
    client.includes('startAfterSourceId'));
  check('each source resumes from its own cursor', client.includes('sourceCursors'));
  check('the state is written back', client.includes('saveScraperState('));
  check('a source not read this run keeps the cursor it had',
    /merged = \{ \.\.\.\(\(prevState as \{ sourceCursors/.test(client));
  check('an exhausted source is restarted from the top next run',
    /if \(next === null\) delete merged\[sourceId\]/.test(client));
  check('a run that attempted nothing does not advance the rotation',
    /out\.nextStartAfterSourceId\s*\?\s*\{ cursor: out\.nextStartAfterSourceId \}/.test(client));
}

function failureIsolationHeld() {
  console.log('\n── 5. Failure semantics are unchanged ──');
  const client = code(read('lib/server/scraper-client.ts'));
  const run = code(read('lib/server/job-sources/run-ingestion.ts'));

  /* A failed source must not be recorded as a successful sync, and must not
     lose the last real one. */
  check('a failed source keeps its previous lastSyncAt',
    /jobs: before\?\.jobs \?\? 0,\s*failed: true/.test(client));
  check('a skipped source is left entirely untouched',
    /if \(s\.skipped\) continue;/.test(client));
  check('a successful empty board is a real zero, not a failure',
    /jobs: s\.discovered,\s*failed: false/.test(client));

  /* The deadline must skip sources, never fail or expire them. */
  check('sources not reached are skipped, not failed',
    /skipped: true, skipReason: 'deadline'/.test(run));
  check('the run still writes after the loop, which is why the reserve exists',
    run.indexOf('for (const config of configs)') < run.indexOf('await save('));
  check('a failed source cannot renew freshness',
    run.includes('markSeen(jobs, matchedIds, now)'));
}

function observability() {
  console.log('\n── 6. A partial run says so ──');
  const w = code(read(WORKER));

  /* The operator question this run failed to answer: which boards were not
     reached, and did anything actually get renewed. */
  check('the detailed summary is used, not the flattened one', w.includes('summary.raw'));
  check('a missing detailed summary is an error, not silent zeros',
    /if \(!out\) throw new Error/.test(w));
  for (const field of ['deadlineSkipped', 'seenStamped', 'sourcesFailed', 'durationMs']) {
    check(`the completion line reports ${field}`, w.includes(field));
  }
  check('sources not reached raise an explicit warning',
    w.includes("issue: 'deadline_skipped'"));
  check('every source is still logged individually', /event: 'source'/.test(w));
}

function noShortcuts() {
  console.log('\n── 7. None of the forbidden shortcuts were taken ──');
  const unit = read(UNIT);
  const example = read('.env.example');

  /* Raising the timeout hides the problem instead of fixing it, and the run
     would still lose everything at whatever the new number is. */
  check('TimeoutStartSec was not raised', /TimeoutStartSec=840\b/.test(unit));
  check('incremental lookup was not switched on',
    /INGEST_INCREMENTAL_LOOKUP=\s*$/m.test(example));
  check('freshness was not switched on',
    /PUBLIC_FRESHNESS_ENABLED=\s*$/m.test(example));
  check('the timer is unchanged',
    /OnCalendar=\*:0\/30/.test(read('ops/systemd/docrud-job-scraper.timer')));

  /* Sources are still read one at a time — no blind parallelism across 87
     boards and no extra concurrent load on Atlas. */
  const run = code(read('lib/server/job-sources/run-ingestion.ts'));
  check('sources are still processed sequentially',
    /for \(const config of configs\) \{/.test(run) && !/Promise\.all\(configs/.test(run));
  check('the canonical writer is still the only write path',
    run.includes('writeHiringJobs('));
}

function main() {
  entrypointIsGuarded();
  boundedByBudget();
  budgetFitsTheUnit();
  reserveProtectsTheWrite();
  resumes();
  failureIsolationHeld();
  observability();
  noShortcuts();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
