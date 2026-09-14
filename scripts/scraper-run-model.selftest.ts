/**
 * Phase A — the async run model.
 *
 *   npx tsx scripts/scraper-run-model.selftest.ts
 *
 * The behaviours asserted here are the ones the old synchronous path could not
 * express: a run that exists before a worker does, a run whose worker died, and
 * a run where some sources failed and some did not.
 *
 * No process is ever spawned and no scrape is ever performed.
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

async function outcomeRules() {
  console.log('\n── 1. A run is labelled by what its sources actually did ──');
  const { runOutcome } = await import('@/lib/server/job-sources/runs');

  check('all sources succeeded -> completed',
    runOutcome([{ ok: true }, { ok: true }]) === 'completed');

  /* The distinction the old model could not make. A run that lost one board
     was recorded as `completed` — the same word as a run where nothing broke. */
  check('some succeeded, some failed -> partial',
    runOutcome([{ ok: true }, { ok: false }]) === 'partial');

  /* Every attempted source failed. Calling that "partial" would overstate it. */
  check('every attempted source failed -> failed',
    runOutcome([{ ok: false }, { ok: false }]) === 'failed');

  /* Skipped sources are not evidence either way — they were never asked. */
  check('skipped sources do not make a clean run partial',
    runOutcome([{ ok: true }, { ok: true, skipped: true }]) === 'completed');
  check('a failure among skips is still partial',
    runOutcome([{ ok: true }, { ok: false }, { ok: true, skipped: true }]) === 'partial');
  check('a run that attempted nothing is not a failure',
    runOutcome([{ ok: true, skipped: true }]) === 'completed');
}

async function dispatchContract() {
  console.log('\n── 2. Dispatch accepts work; it does not perform it ──');
  const dispatch = read('lib/server/job-sources/dispatch.ts');

  check('the request never runs the ingestion itself',
    !dispatch.includes('runCanonicalIngestion'));
  check('it hands work to the same worker systemd runs',
    dispatch.includes('scripts/run-job-scraper.ts'));
  check('the child is detached, so a PM2 restart cannot kill a running scrape',
    /detached:\s*true/.test(dispatch));
  check('the child inherits no pipes that could block it',
    /stdio:\s*'ignore'/.test(dispatch));
  check('the run is opened BEFORE the spawn, so the returned id is pollable at once',
    dispatch.indexOf('startIngestionRun') < dispatch.indexOf('spawn('));
  check('a spawn failure closes the run instead of leaving it queued forever',
    /catch[\s\S]{0,300}finishIngestionRun\(runId, 'failed'/.test(dispatch));
  check('a live lease is reported as already_running, not as a second run',
    dispatch.includes("reason: 'already_running'"));
}

function routeContract() {
  console.log('\n── 3. The route answers immediately ──');
  const route = read('app/api/super-admin/jobs/scraper/run/route.ts');
  const status = read('app/api/super-admin/jobs/scraper/runs/[runId]/route.ts');

  check('authorization is still checked first',
    route.indexOf('getSuperAdminSessionFromRequest') < route.indexOf('dispatchScraperRun'));
  check('the accepted response is 202', /status:\s*202/.test(route));
  check('a run already in progress is 409, not 500', /status:\s*409/.test(route));
  check('the route no longer runs the scrape inline',
    !route.includes('runCanonicalIngest'));

  /* The old 300 s ceiling existed only because the scrape was inline. Leaving
     it would keep this route capable of outliving nginx's 60 s read timeout —
     the exact failure that produced "Network error". */
  const maxDur = Number(/export const maxDuration = (\d+)/.exec(route)?.[1] ?? 0);
  check('its window is now well under nginx\'s 60s proxy_read_timeout',
    maxDur > 0 && maxDur < 60, `maxDuration=${maxDur}`);

  check('the status route requires Super Admin too',
    status.includes('getSuperAdminSessionFromRequest'));
  check('the run id from the URL is validated before it reaches storage',
    /\[A-Za-z0-9_-\]\{1,64\}/.test(status));
  check('a read endpoint does not mutate run state',
    !/finishIngestionRun|claimIngestionRun|recordSourceResult/.test(status));
}

async function staleness() {
  console.log('\n── 4. A dead worker is distinguishable from a slow one ──');
  const { HEARTBEAT_STALE_MS, isTerminalRunStatus } =
    await import('@/lib/server/job-sources/run-progress');
  const { LEASE_RENEW_MS } = await import('@/lib/server/job-sources/run-lock');

  /* One missed beat is a slow write; three is a process that is gone. */
  check('the stale threshold is several heartbeats, not one',
    HEARTBEAT_STALE_MS >= LEASE_RENEW_MS * 2,
    `stale=${HEARTBEAT_STALE_MS}ms renew=${LEASE_RENEW_MS}ms`);
  check('it is shorter than the lease TTL, so a crash surfaces before it clears',
    HEARTBEAT_STALE_MS < 15 * 60_000);

  for (const s of ['completed', 'partial', 'failed', 'cancelled']) {
    check(`${s} stops polling`, isTerminalRunStatus(s));
  }
  for (const s of ['queued', 'running']) {
    check(`${s} keeps polling`, !isTerminalRunStatus(s));
  }
}

function workerWiring() {
  console.log('\n── 5. The worker is what writes the run record ──');
  const worker = read('scripts/run-job-scraper.ts');

  check('it reuses an API-supplied run id rather than minting a second one',
    worker.includes('providedRunId ??'));
  check('the supplied run id is validated, not trusted',
    /\[A-Za-z0-9_-\]\{1,64\}/.test(worker));
  check('it claims a queued run instead of reopening it',
    worker.includes('claimIngestionRun'));
  check('it heartbeats', worker.includes('heartbeatIngestionRun'));
  check('it records every source as it finishes', worker.includes('recordSourceResult'));
  check('it finalises with the computed outcome, so partial is reachable',
    worker.includes('runOutcome(attempted)'));
  check('a thrown run is recorded as failed',
    /finishIngestionRun\(runId, 'failed'/.test(worker));

  /* Progress reporting must never be able to break the scrape it describes. */
  check('progress writes are best-effort and cannot abort a working scrape',
    /const record = async[\s\S]{0,200}catch/.test(worker));
}

function uiWiring() {
  console.log('\n── 6. The dashboard polls instead of holding a connection ──');
  const ui = read('components/superadmin/JobsTab.tsx');

  check('it polls the run status endpoint', ui.includes('/scraper/runs/'));
  check('polling is bounded, so a stuck run cannot leave a timer running forever',
    ui.includes('MAX_POLLS'));
  check('a 409 follows the existing run rather than starting a second',
    /r\.status === 409/.test(ui));
  check('a stale worker is surfaced, not spun on', ui.includes('d.stale'));
  check('a dropped poll does not fail the run', /continue;/.test(ui));
  check('sourcesTotal renders as unknown rather than zero before a worker claims it',
    ui.includes("sourcesTotal ?? '—'"));
}

async function main() {
  await outcomeRules();
  await dispatchContract();
  routeContract();
  await staleness();
  workerWiring();
  uiWiring();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

main().catch((error) => {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
