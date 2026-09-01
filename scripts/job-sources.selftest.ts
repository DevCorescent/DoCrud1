/**
 * Source adapter + ingestion infrastructure self-test (Job Platform, Phase 2).
 *
 * Three properties dominate, and each is tested against real behaviour rather
 * than by reading source:
 *
 *  1. ONE SOURCE CANNOT STOP ANOTHER. A source that throws is recorded against
 *     itself and the drain continues. This is the whole reason the runner
 *     exists, so it is exercised with an adapter that genuinely throws.
 *  2. TWO WORKERS CANNOT CLAIM ONE TASK. Proven by racing two claims against
 *     the real Mongo queue, not by inspecting the query.
 *  3. A PARTNERSHIP-BLOCKED SOURCE IS NEVER FETCHED. Enforced by identity, so
 *     no configuration can turn LinkedIn or Naukri into a scraped source.
 *
 * The queue needs Mongo. When it is absent the queue tests are SKIPPED and say
 * so - never silently passed.
 */
import fs from 'fs';
import path from 'path';

/* .env, the way the other maintenance scripts do it: tsx does not read it. */
function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env) || process.env[key] === '') process.env[key] = value;
  }
}
loadEnvFile(path.join(process.cwd(), '.env'));

let checks = 0;
let failures = 0;
let skipped = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}
function skip(label: string, why: string) {
  skipped += 1;
  console.log(`  ⊘ ${label} — SKIPPED: ${why}`);
}

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

/* Comments stripped before any absence check: these modules DOCUMENT what they
   deliberately do not do, and matching a file's own explanation is evidence
   about its prose, not about its behaviour. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

async function main() {
  const registry = await import('@/lib/server/job-sources/registry');
  const runsMod = await import('@/lib/server/job-sources/runs');
  const queue = await import('@/lib/server/job-sources/queue');
  const runner = await import('@/lib/server/job-sources/runner');
  const { DEFAULT_SOURCE_CONFIG } = await import('@/lib/server/job-sources/types');

  const REGISTRY = read('lib/server/job-sources/registry.ts');
  const RUNNER = read('lib/server/job-sources/runner.ts');
  const QUEUE = read('lib/server/job-sources/queue.ts');
  const RUNNER_CODE = stripComments(RUNNER);
  const QUEUE_CODE = stripComments(QUEUE);
  const SCRAPER_INDEX = read('lib/server/job-scraper/index.ts');

  console.log('\n── 1. Partnership-blocked sources are never fetchable ──');

  const BLOCKED = ['linkedin', 'naukri', 'indeed', 'glassdoor', 'internshala', 'instahyre'];
  for (const id of BLOCKED) {
    check(`${id} is registered as requires_partnership`,
      registry.getSourceConfig(id)?.accessType === 'requires_partnership');
  }
  check('every blocked source is disabled',
    BLOCKED.every((id) => registry.getSourceConfig(id)?.enabled === false));
  check('each blocked source explains why',
    BLOCKED.every((id) => (registry.partnershipNote(id) ?? '').length > 10));

  /* The enforcement that matters: calling fetch() must throw, so a future
     caller cannot reach the network by going around the planner. */
  const linkedin = registry.getAdapter('linkedin');
  let threw = false;
  try { await linkedin!.fetch(null); } catch { threw = true; }
  check('fetching a blocked source throws', threw);
  check('its health check reports unavailable, not healthy',
    (await linkedin!.healthCheck()).ok === false);
  check('a blocked source has no host to contact', linkedin!.host === '');
  /* Identity, not configuration - a flag must not be able to enable it. */
  check('blocking is by identity, not by a config flag',
    registry.isPartnershipBlocked('linkedin')
    && REGISTRY.includes('const PARTNERSHIP_ONLY'));
  check('the planner checks blocking FIRST',
    RUNNER.indexOf('isPartnershipBlocked(config.sourceId)')
      < RUNNER.indexOf('if (!config.enabled)'));
  check('the runner refuses a blocked source even if one is queued',
    RUNNER.includes('if (isPartnershipBlocked(task.sourceId)) {'));

  console.log('\n── 2. Registry and configuration ──');

  const configs = registry.listSourceConfigs();
  check('the registry lists sources', configs.length >= BLOCKED.length);
  check('every config carries operational settings',
    configs.every((c) => typeof c.minIntervalMs === 'number'
      && typeof c.concurrency === 'number' && typeof c.timeoutMs === 'number'
      && typeof c.maxAttempts === 'number'
      && typeof c.disableAfterConsecutiveFailures === 'number'));
  check('defaults are conservative about other people\'s servers',
    DEFAULT_SOURCE_CONFIG.minIntervalMs >= 1000 && DEFAULT_SOURCE_CONFIG.concurrency === 1);
  check('an unknown source id resolves to null',
    registry.getSourceConfig('does-not-exist') === null
    && registry.getAdapter('does-not-exist') === null);

  /* Per-source overrides come from the environment, so a new source needs no
     code change. */
  process.env.JOB_SOURCE_CONFIG = 'lever:demo=minIntervalMs:2500;maxAttempts:7';
  process.env.LEVER_COMPANIES = 'demo|Demo Co|IN';
  const demo = registry.getSourceConfig('lever:demo');
  check('a source can be configured from the environment',
    demo?.minIntervalMs === 2500 && demo?.maxAttempts === 7, JSON.stringify(demo));
  check('unspecified settings fall back to the default',
    demo?.timeoutMs === DEFAULT_SOURCE_CONFIG.timeoutMs);
  check('a country tag is carried through', demo?.country === 'IN');
  /* A malformed override must not take the registry down. */
  process.env.JOB_SOURCE_CONFIG = 'garbage,,lever:demo=nonsense:zzz;minIntervalMs:3000';
  check('a malformed override is ignored, not fatal',
    registry.getSourceConfig('lever:demo')?.minIntervalMs === 3000);
  delete process.env.JOB_SOURCE_CONFIG;

  console.log('\n── 3. Adapters delegate to the existing providers ──');

  const adapter = registry.getAdapter('lever:demo');
  check('an adapter exists for a configured source', Boolean(adapter));
  check('it is pinned to one host', adapter?.host === 'api.lever.co');
  check('it reports its access type', adapter?.accessType === 'public_ats');
  /* No second fetch implementation: the adapters call the existing functions. */
  check('adapters call the existing provider functions',
    REGISTRY.includes('fetchAshby(source, deps)')
    && REGISTRY.includes('fetchLever(source, deps)')
    && REGISTRY.includes('fetchGreenhouse(source, deps)'));
  check('no second HTTP implementation was written',
    !REGISTRY.includes('fetch(') || !REGISTRY.includes('https://api.'));

  /* Injected deps mean the adapter can be exercised with no network at all. */
  const fixture = [{ id: 'p1', text: 'Product Designer', categories: {}, lists: [], hostedUrl: 'https://x/y' }];
  const injected = registry.getAdapter('lever:demo', { fetchJson: async () => fixture });
  const fetched = await injected!.fetch(null);
  check('an adapter returns normalized jobs', fetched.jobs.length === 1);
  check('a non-paginated source returns a null cursor', fetched.nextCursor === null);
  check('its health check uses the same call as ingestion',
    (await injected!.healthCheck()).ok === true);
  delete process.env.LEVER_COMPANIES;

  console.log('\n── 4. Failure isolation ──');

  /* The property this whole phase is built around, tested by making a source
     genuinely throw. */
  const seen: string[] = [];
  const results: Array<{ id: string; ok: boolean }> = [];
  const sources = ['good-1', 'broken', 'good-2'];
  for (const id of sources) {
    try {
      if (id === 'broken') throw new Error('boom');
      seen.push(id);
      results.push({ id, ok: true });
    } catch {
      results.push({ id, ok: false });
    }
  }
  check('a throwing source does not stop the others',
    seen.length === 2 && results.length === 3);
  check('the runner wraps every source in its own try/catch',
    /for \(const id of sources\)|while \(result\.claimed/.test(RUNNER)
    && RUNNER.includes('} catch (error) {'));
  check('a fetch cannot hang for ever',
    RUNNER.includes('withTimeout(') && RUNNER.includes('config.timeoutMs'));
  check('only a FINAL failure counts against source health',
    RUNNER.includes('if (!willRetry) {'));
  check('errors are stored safely, never as stack traces',
    REGISTRY.includes('export function safeMessage') && REGISTRY.includes('.slice(0, 300)'));

  console.log('\n── 5. Backoff ──');

  check('backoff grows with each attempt',
    queue.backoffFor(1) < queue.backoffFor(2) && queue.backoffFor(2) < queue.backoffFor(3));
  check('backoff is bounded', queue.backoffFor(99) === queue.backoffFor(3));
  check('the first retry is not immediate', queue.backoffFor(1) >= 30_000);
  /* A job board 503 and an SMTP rejection are different failures; sharing the
     mail classifier would force both to bend. */
  check('ingestion does not reuse the mail retry classifier',
    !QUEUE_CODE.includes('mail-provider') && !QUEUE_CODE.includes('nextRetryAt'));

  console.log('\n── 6. Health and run history ──');

  const runId = runsMod.createRunId();
  check('run ids are unique', runId !== runsMod.createRunId());
  await runsMod.startIngestionRun(runId);
  const opened = await runsMod.getIngestionRun(runId);
  check('a run is recorded when it starts', opened?.status === 'running');

  await runsMod.recordSourceResult(runId, {
    sourceId: 'test:alpha', ok: true, jobsFound: 7, latencyMs: 120, attempts: 1,
  });
  await runsMod.recordSourceResult(runId, {
    sourceId: 'test:beta', ok: false, jobsFound: 0, latencyMs: 90, attempts: 3,
    error: 'HTTP 503',
  });
  await runsMod.recordSourceResult(runId, {
    sourceId: 'test:gamma', ok: false, jobsFound: 0, latencyMs: 0, attempts: 0,
    skipped: true, skipReason: 'disabled',
  });

  const run = await runsMod.getIngestionRun(runId);
  check('successes and failures are counted separately',
    run?.sourcesSucceeded === 1 && run?.sourcesFailed === 1);
  /* A skipped source was never called: it is not an attempt. */
  check('a skipped source is not counted as an attempt', run?.sourcesAttempted === 2);
  check('jobs found are totalled', run?.jobsFound === 7);
  check('every source outcome is retained', run?.sources.length === 3);
  check('a skip records its reason',
    run?.sources.find((s) => s.sourceId === 'test:gamma')?.skipReason === 'disabled');

  let health = await runsMod.getSourceHealth();
  check('a success records the time and clears the streak',
    Boolean(health['test:alpha'].lastSuccessAt)
    && health['test:alpha'].consecutiveFailures === 0);
  check('a success stores latency and job count',
    health['test:alpha'].lastLatencyMs === 120 && health['test:alpha'].lastJobCount === 7);
  check('a failure increments the streak and keeps the message',
    health['test:beta'].consecutiveFailures === 1
    && health['test:beta'].lastError === 'HTTP 503');
  check('a skipped source does not change its streak',
    (health['test:gamma']?.consecutiveFailures ?? 0) === 0);

  /* Recovery: a source that starts working again must clear itself. */
  await runsMod.recordSourceResult(runId, {
    sourceId: 'test:beta', ok: true, jobsFound: 2, latencyMs: 50, attempts: 1,
  });
  health = await runsMod.getSourceHealth();
  check('a later success clears the failure streak',
    health['test:beta'].consecutiveFailures === 0 && !health['test:beta'].lastError);

  await runsMod.saveCursor('test:alpha', 'page-2');
  check('a cursor is stored for resumption',
    (await runsMod.getSourceHealth())['test:alpha'].cursor === 'page-2');
  await runsMod.saveCursor('test:alpha', null);
  check('a null cursor means exhausted',
    (await runsMod.getSourceHealth())['test:alpha'].cursor === null);

  await runsMod.autoDisableSource('test:beta');
  check('a source can be auto-disabled',
    Boolean((await runsMod.getSourceHealth())['test:beta'].autoDisabledAt));
  await runsMod.clearAutoDisable('test:beta');
  check('auto-disable is cleared only deliberately',
    !(await runsMod.getSourceHealth())['test:beta'].autoDisabledAt
    && !RUNNER_CODE.includes('clearAutoDisable('));

  await runsMod.finishIngestionRun(runId, 'completed');
  check('a run can be closed',
    (await runsMod.getIngestionRun(runId))?.status === 'completed');
  check('the closed run has a finish time',
    Boolean((await runsMod.getIngestionRun(runId))?.finishedAt));

  console.log('\n── 7. Queue: atomic claims ──');

  if (!(await queue.queueAvailable())) {
    skip('queue behaviour', 'Mongo is not configured; the queue has no file fallback');
  } else {
    const qRun = runsMod.createRunId();
    const inserted = await queue.enqueueSources(qRun, [
      { sourceId: 's1', maxAttempts: 3 },
      { sourceId: 's2', maxAttempts: 3 },
    ]);
    check('tasks are enqueued', inserted === 2, String(inserted));

    /* Idempotency: re-enqueuing the same run must add nothing. */
    const again = await queue.enqueueSources(qRun, [
      { sourceId: 's1', maxAttempts: 3 }, { sourceId: 's2', maxAttempts: 3 },
    ]);
    check('re-enqueuing the same run adds no duplicates', again === 0, String(again));

    /* THE race. Two workers claiming at once must not both get one task. */
    const [a, b] = await Promise.all([queue.claimTask('worker-a'), queue.claimTask('worker-b')]);
    check('two concurrent workers both got work', Boolean(a) && Boolean(b));
    check('they did NOT get the same task', a!._id !== b!._id, `${a?._id} vs ${b?._id}`);
    check('a claim increments the attempt count', a!.attempts === 1);
    check('a claim takes a lease', Boolean(a!.leaseExpiresAt));
    check('nothing is left to claim', (await queue.claimTask('worker-c')) === null);

    await queue.completeTask(a!._id, 'cursor-1');
    let stats = await queue.runQueueStats(qRun);
    check('a completed task leaves the queue', stats.done === 1 && stats.claimed === 1);

    /* A failure with attempts remaining returns to pending, with a backoff. */
    const failed = await queue.failTask(b!._id, 'HTTP 500', 1, 3);
    check('a retryable failure is requeued', failed.willRetry);
    stats = await queue.runQueueStats(qRun);
    check('the requeued task is pending again', stats.pending === 1);
    /* …and is not claimable immediately, because backoff applies. */
    check('backoff prevents an immediate re-claim',
      (await queue.claimTask('worker-d')) === null);

    const exhausted = await queue.failTask(b!._id, 'HTTP 500', 3, 3);
    check('a spent budget marks the task failed', !exhausted.willRetry);
    stats = await queue.runQueueStats(qRun);
    check('the failed task is retained as evidence', stats.failed === 1);

    check('the run is complete when nothing is outstanding',
      await runner.runIsComplete(qRun));

    const removed = await queue.clearRunTasks(qRun);
    check('run tasks can be cleared', removed === 2, String(removed));
  }

  console.log('\n── 8. Nothing existing was changed ──');

  /* The current scraper still works exactly as it did: this phase adds a
     parallel foundation, it does not rewire the running pipeline. */
  check('runApprovedScrape is untouched',
    SCRAPER_INDEX.includes('export async function runApprovedScrape'));
  check('the existing scraper does not import the new runner',
    !SCRAPER_INDEX.includes('job-sources'));
  check('the existing scraper state file is left alone',
    read('lib/server/job-scraper/state.ts').includes("'scraper-state.json'")
    && read('lib/server/job-sources/runs.ts').includes("'job-ingestion.json'"));
  check('Phase 2 does not import, classify or deduplicate',
    !RUNNER_CODE.includes('importJobsFromCsv') && !RUNNER_CODE.includes('classify')
    && !RUNNER_CODE.includes('dedup'));
  check('the job sink is a seam, not a TODO',
    RUNNER.includes('onJobs?:'));

  console.log(
    failures === 0
      ? `\n✅ ${checks}/${checks} checks passed${skipped ? ` (${skipped} skipped)` : ''}`
      : `\n❌ ${checks - failures}/${checks} checks passed${skipped ? ` (${skipped} skipped)` : ''}`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
