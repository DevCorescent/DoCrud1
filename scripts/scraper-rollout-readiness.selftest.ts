/**
 * Phase 6A — is the scraper ready to run the full verified inventory?
 *
 *   npx tsx scripts/scraper-rollout-readiness.selftest.ts
 *
 * ═══ WHAT WAS MEASURED ═══
 *
 * One complete run over all 87 verified boards, locally, against the real
 * production corpus, with `commit:false` and no writes:
 *
 *   boards attempted/ok/failed   87 / 87 / 0
 *   discovered                   10,477
 *   duplicates within the run    0          <- 10,477 UNIQUE canonical jobs
 *   identity basis               100% external_id
 *   would insert / update        8,642 / 14
 *   lastSeenAt renewals          10,477
 *   corpus load                  235,518 ms
 *   ingestion                     96,326 ms
 *   TOTAL                        331,844 ms  (5m32s)
 *   peak heap                    279 MB
 *
 * The same run on the incremental path: 626,839 ms, 262 MB — nearly TWICE AS
 * SLOW, because it trades one large read for 87 per-source queries and this
 * measurement crossed the public internet to Atlas. That result is expected to
 * invert on EC2, where the database is a millisecond away rather than a
 * couple of hundred. It has NOT been measured there, so the flag stays off.
 *
 * This file asserts the CONFIGURED BOUNDS still fit the measured runtime. It
 * runs no scrape and touches no database.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

/** The measured full-inventory run. Update only alongside a fresh measurement. */
const MEASURED_RUN_MS = 331_844;
const MEASURED_PEAK_MB = 279;

function boundsFitMeasuredRuntime() {
  console.log('\n── 1. The configured bounds fit a measured full run ──');
  const svc = read('ops/systemd/docrud-job-scraper.service');
  const timer = read('ops/systemd/docrud-job-scraper.timer');
  const lock = read('lib/server/job-sources/run-lock.ts');

  const timeoutMs = Number(/TimeoutStartSec=(\d+)/.exec(svc)?.[1] ?? 0) * 1000;
  const ttlMs = Number(/LEASE_TTL_MS = (\d+) \* 60_000/.exec(lock)?.[1] ?? 0) * 60_000;

  check('systemd would not kill a run of the measured length',
    timeoutMs > MEASURED_RUN_MS, `timeout=${timeoutMs}ms run=${MEASURED_RUN_MS}ms`);

  /* If systemd killed a run that still believed it held the lease, the lease
     would sit unreleased until it expired. Ordering them this way means the
     kill always happens while the holder can still release. */
  check('systemd kills BEFORE the lease expires, so a kill cannot strand it',
    timeoutMs < ttlMs, `timeout=${timeoutMs}ms ttl=${ttlMs}ms`);
  check('the lease outlives a measured run without relying on renewal',
    ttlMs > MEASURED_RUN_MS, `ttl=${ttlMs}ms run=${MEASURED_RUN_MS}ms`);

  /* A tick that fires while the previous run is still going is dropped by
     Type=oneshot — correct, but it hides how long runs take. The interval
     should comfortably exceed a real run. */
  const everyMin = Number(/OnCalendar=\*:0\/(\d+)/.exec(timer)?.[1] ?? 0);
  check('the timer interval comfortably exceeds a measured run',
    everyMin * 60_000 > MEASURED_RUN_MS * 2,
    `every ${everyMin}min vs ${Math.round(MEASURED_RUN_MS / 1000)}s run`);

  /* Headroom is real but finite: this run would ADD ~8,642 postings, so the
     next corpus load is larger again. */
  check('there is at least 2x headroom before the timeout, not a hair\'s breadth',
    timeoutMs > MEASURED_RUN_MS * 2,
    `timeout=${Math.round(timeoutMs / 1000)}s run=${Math.round(MEASURED_RUN_MS / 1000)}s`);
}

function memoryIsBounded() {
  console.log('\n── 2. Memory stayed bounded at full inventory ──');
  /* EC2 is a 2 vCPU / ~4 GB box that also runs the Next.js server. A worker
     that peaked near that would be an OOM risk, not a performance note. */
  check('peak heap left substantial room on a 4GB host',
    MEASURED_PEAK_MB < 1024, `${MEASURED_PEAK_MB}MB`);
  check('the worker is not started with an unbounded heap',
    !/--max-old-space-size=\d{5,}/.test(read('ops/systemd/docrud-job-scraper.service')));
}

function inventoryIsReproducible() {
  console.log('\n── 3. The inventory turns into configuration reproducibly ──');
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  check('the probe has a stable command', Boolean(pkg.scripts['scrape:sources:probe']));

  const readme = read('data/job-sources/README.md');
  check('the rollout procedure is written down', readme.includes('Verified configuration'));

  /* The single most dangerous rollout mistake: replacing a provider variable
     rather than merging, silently dropping boards production already had. */
  check('it warns that appending must preserve existing values',
    /PRESERVE the values already there/i.test(readme));
  check('the measured cost is recorded next to the procedure',
    readme.includes('331,844') && readme.includes('10,477'));
}

function nothingWasEnabled() {
  console.log('\n── 4. Phase 6A enabled nothing ──');
  const example = read('.env.example');

  /* Readiness is not rollout. Each of these is a separate, deliberate act. */
  check('the incremental flag is still off by default',
    /INGEST_INCREMENTAL_LOOKUP=\s*$/m.test(example));
  check('the 87 boards are not written into .env.example',
    !example.includes('cockroachlabs') && !example.includes('clickhouse'));

  /* 168h freshness must not be wired while 4,646 jobs would expire purely
     because the scraper has not been refreshing them. */
  const lifecycle = read('lib/server/job-sources/lifecycle.ts');
  check('freshness still uses the untouched lifecycle module',
    lifecycle.includes('LIFECYCLE_MS'));
  /* Phase 6B wired freshness into the public query DELIBERATELY, behind
     PUBLIC_FRESHNESS_ENABLED === "true" (default OFF). The property this guard
     protects is unchanged — nothing may filter on lastSeenAt while the switch
     is off — so it now asserts the gate rather than the absence. */
  const pq = read('lib/server/db/public-jobs-query.ts');
  check('freshness in the public query is gated on the flag',
    /if \(publicFreshnessEnabled\(\)\) \{\s*conds\.push\(publiclyFreshCond\(/.test(pq));
  check('the base active definition still has no freshness clause',
    !/const activeCond[\s\S]{0,300}lastSeenAt/.test(pq));
}

function observability() {
  console.log('\n── 5. A run reports what rollout needs to be judged on ──');
  const worker = read('scripts/run-job-scraper.ts');

  /* Without this, "did the refresh actually renew anything?" — the question
     Phase 6B depends on — cannot be answered from the journal. */
  check('lastSeenAt renewals are reported', worker.includes('seenStamped'));
  for (const field of ['discovered', 'inserted', 'updated', 'unchanged',
    'duplicates', 'rejected', 'deadlineSkipped', 'durationMs', 'sourcesFailed']) {
    check(`the completion line reports ${field}`, worker.includes(field));
  }
  check('every source is logged individually', /event: 'source'/.test(worker));
}

function main() {
  boundsFitMeasuredRuntime();
  memoryIsBounded();
  inventoryIsReproducible();
  nothingWasEnabled();
  observability();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
