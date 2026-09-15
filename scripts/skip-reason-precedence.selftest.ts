/**
 * A skip reason must describe the SOURCE before it describes the clock.
 *
 *   npx tsx scripts/skip-reason-precedence.selftest.ts
 *
 * ═══ THE MISDIAGNOSIS THIS PREVENTS ═══
 *
 * Production run run-mu2l3k07-829c9e58 (2026-09-15T11:24:10Z) reported all 93
 * sources as `skipped (deadline)`, every one with `latencyMs: 0`. Six of them —
 * LinkedIn, Naukri, Indeed, Glassdoor, Internshala, Instahyre — are
 * PARTNERSHIP_ONLY: their adapters throw by design and no budget on any clock
 * would have fetched them. They were labelled `deadline` only because
 * `outOfTime` was already set when the loop reached them.
 *
 * Read literally, the console said "these sources ran out of time", so the
 * indicated fix was "give the scraper more time" — the one conclusion that is
 * certainly false. The real cause was a 809 s whole-corpus load in front of a
 * 583 s source window.
 *
 * `requires_partnership` and `disabled` are properties of the SOURCE: they hold
 * whatever the budget is. `deadline` is a property of the RUN. The source
 * properties are therefore evaluated first, and this file holds that order.
 *
 * Behavioural, through the real orchestrator. No database, no network: the
 * corpus and the writer are injected, and every configured source here is
 * either blocked or disabled, so no adapter is ever called.
 */
import assert from 'node:assert/strict';

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

/* A board that is configured but switched OFF via the documented per-source
   override, so `disabled` is reachable without reaching any network. */
const FIXTURE_BOARD = 'skiptest';
const FIXTURE_ID = `greenhouse:${FIXTURE_BOARD}`;

async function run(opts: { deadlinePassed: boolean }) {
  const { runCanonicalIngestion } = await import('@/lib/server/job-sources/run-ingestion');
  return runCanonicalIngestion({
    /* Injected, so the whole-corpus load never happens and no writer runs. */
    loadJobs: async () => [],
    saveJobs: async () => {},
    ...(opts.deadlinePassed ? { deadlineAt: Date.now() - 60_000 } : {}),
  });
}

function reasonsOf(out: { perSource: Array<{ sourceId: string; skipReason?: string }> }) {
  return new Map(out.perSource.map((s) => [s.sourceId, s.skipReason]));
}

const PARTNERSHIP = ['linkedin', 'naukri', 'indeed', 'glassdoor', 'internshala', 'instahyre'];

async function main() {
  assert.notEqual(process.env.NODE_ENV, 'production',
    'injection is refused in production; this test must not run there');

  /* One configured-but-disabled board, so `disabled` is exercised alongside the
     blocked six. Set before the registry is first imported. */
  process.env.GREENHOUSE_BOARDS = `${FIXTURE_BOARD}|Skiptest Inc|IN`;
  process.env.JOB_SOURCE_CONFIG = `${FIXTURE_ID}=enabled:false`;
  const { listSourceConfigs } = await import('@/lib/server/job-sources/registry');
  const disabledIds = listSourceConfigs().filter((c) => !c.enabled)
    .map((c) => c.sourceId).filter((id) => !PARTNERSHIP.includes(id));
  assert.ok(disabledIds.includes(FIXTURE_ID),
    `fixture board did not register as disabled — got [${disabledIds.join(', ')}]`);

  console.log('\n── 1. The blocked six are never reported as a timing problem ──');
  const late = reasonsOf(await run({ deadlinePassed: true }));

  /* THE regression. Before the fix every one of these read `deadline`. */
  for (const id of PARTNERSHIP) {
    check(`${id} reports requires_partnership even past the deadline`,
      late.get(id) === 'requires_partnership', `got ${late.get(id)}`);
  }

  console.log('\n── 2. A disabled source is not a timing problem either ──');
  for (const id of disabledIds) {
    check(`${id} reports disabled even past the deadline`,
      late.get(id) === 'disabled', `got ${late.get(id)}`);
  }

  console.log('\n── 3. The deadline reason still exists for sources it describes ──');
  /* The fix must not delete `deadline`; it must stop it from swallowing the
     others. A source that is enabled and fetchable, reached with the clock
     already blown, is a genuine deadline skip. */
  const src = await import('node:fs').then((fs) =>
    fs.readFileSync('lib/server/job-sources/run-ingestion.ts', 'utf8'));
  check('the deadline branch is still present',
    src.includes("skipReason: 'deadline'"));
  check('and it is still evaluated before any fetch',
    src.indexOf("skipReason: 'deadline'") < src.indexOf('adapter.fetch('));

  console.log('\n── 4. The order is structural, not incidental ──');
  const body = src.slice(src.indexOf('for (const config of configs)'),
    src.indexOf('adapter.fetch('));
  const iPartner = body.indexOf("skipReason: 'requires_partnership'");
  const iDisabled = body.indexOf("skipReason: 'disabled'");
  const iDeadline = body.indexOf("skipReason: 'deadline'");
  check('requires_partnership is evaluated before deadline',
    iPartner >= 0 && iDeadline >= 0 && iPartner < iDeadline, `${iPartner} < ${iDeadline}`);
  check('disabled is evaluated before deadline',
    iDisabled >= 0 && iDisabled < iDeadline, `${iDisabled} < ${iDeadline}`);

  console.log('\n── 5. Nothing was fetched, and no totals moved ──');
  const out = await run({ deadlinePassed: true });
  check('every source was skipped', out.perSource.every((s) => s.skipped));
  check('no source recorded latency', out.perSource.every((s) => s.latencyMs === 0));
  check('nothing was discovered', out.perSource.every((s) => s.discovered === 0));
  check('no source was recorded as failed', out.perSource.every((s) => s.ok));

  /* The count that drives the console warning must now mean what it says. */
  const deadlineCount = out.perSource.filter((s) => s.skipReason === 'deadline').length;
  check('deadlineSkipped counts only genuine deadline skips',
    out.deadlineSkipped === deadlineCount, `${out.deadlineSkipped} vs ${deadlineCount}`);
  check('structurally unavailable sources are excluded from that count',
    !PARTNERSHIP.some((id) => reasonsOf(out).get(id) === 'deadline'));

  console.log('\n── 6. With time on the clock the reasons are unchanged ──');
  const early = reasonsOf(await run({ deadlinePassed: false }));
  for (const id of PARTNERSHIP) {
    check(`${id} still reports requires_partnership`,
      early.get(id) === 'requires_partnership', `got ${early.get(id)}`);
  }

  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

main().catch((error) => {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
