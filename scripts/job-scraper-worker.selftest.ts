/**
 * The scraper worker, its single-flight lease, and the failure that made a
 * starved run look like an empty one.
 *
 *   npx tsx scripts/job-scraper-worker.selftest.ts
 *
 * No database and no network: the lease is exercised against an in-memory
 * stand-in for the one collection it uses, and the orchestrator runs through
 * its injectable storage seam with stub adapters. Every assertion is about
 * behaviour that was observed to be wrong in production.
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

/* ── 1. The regression: a starved run is not an empty one ─────────────────*/

async function deadlineStarvation() {
  console.log('\n── 1. A run starved by its deadline reports zero, not failure ──');

  process.env.JOB_SCRAPER_ENABLED = 'true';
  process.env.GREENHOUSE_BOARDS = 'acme|Acme';
  process.env.LEVER_COMPANIES = 'beta|Beta';
  process.env.ASHBY_JOB_BOARDS = '';
  process.env.SMARTRECRUITERS_COMPANIES = '';
  process.env.WORKDAY_BOARDS = '';
  process.env.MICROSOFT_CAREERS = '';

  const { runCanonicalIngestion } = await import('@/lib/server/job-sources/run-ingestion');

  /* Time-compressed model of production: the whole-corpus load simply outlasts
     the window left for reading sources. The RATIO is what reproduces the bug;
     the real numbers were a ~108 s reserve against a 300 s budget. */
  const WINDOW = 150, LOAD = 400;
  const out = await runCanonicalIngestion({
    commit: false,
    deadlineAt: Date.now() + WINDOW,
    loadJobs: async () => { await new Promise((r) => setTimeout(r, LOAD)); return []; },
    saveJobs: async () => {},
  });

  /* This is precisely what the production dashboard displayed. */
  check('a starved run discovers nothing', out.discovered === 0);
  check('and reports NO failed sources', out.failed === 0);
  check('so "0 discovered, 0 failed" cannot be read as "the boards were empty"',
    out.deadlineSkipped > 0, `deadlineSkipped=${out.deadlineSkipped}`);
  check('every skipped source names the deadline as the reason',
    out.perSource.filter((s) => s.skipped && s.skipReason !== 'requires_partnership')
      .every((s) => s.skipReason === 'deadline'));

  /* The worker's whole purpose. */
  const worker = read('scripts/run-job-scraper.ts');
  check('the worker passes NO deadlineAt, so the loop cannot be starved',
    !/deadlineAt/.test(worker.replace(/\/\*[\s\S]*?\*\//g, '')));

  /* The number has to survive into the persisted run, or an operator still
     cannot tell the two cases apart on the dashboard. */
  check('deadlineSkipped is persisted onto the run summary',
    /deadlineSkipped\?: number/.test(read('lib/server/job-scraper/state.ts'))
    && /deadlineSkipped: out\.deadlineSkipped/.test(read('lib/server/scraper-client.ts')));
  check('and the dashboard says sources were not reached',
    /deadlineSkipped/.test(read('components/superadmin/JobsTab.tsx')));
}

/* ── 2. The lease ─────────────────────────────────────────────────────────*/

/** The two operations run-lock uses, over a single in-memory document. */
function fakeLockCollection() {
  let doc: Record<string, unknown> | null = null;
  const matches = (filter: Record<string, unknown>) => {
    if (!doc) return false;
    for (const [k, v] of Object.entries(filter)) {
      if (k === 'expiresAt') {
        const lte = (v as { $lte?: Date }).$lte;
        if (lte && !((doc.expiresAt as Date) <= lte)) return false;
      } else if (doc[k] !== v) return false;
    }
    return true;
  };
  return {
    doc: () => doc,
    async findOneAndUpdate(filter: Record<string, unknown>, update: { $set: Record<string, unknown> }, opts: { upsert?: boolean }) {
      if (matches(filter)) { doc = { ...doc, ...update.$set }; return { value: doc }; }
      if (doc) { if (opts.upsert) { const e: Error & { code?: number } = new Error('dup'); e.code = 11000; throw e; } return { value: null }; }
      doc = { _id: filter._id, ...update.$set };
      return { value: doc };
    },
    async updateOne(filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) {
      if (!matches(filter)) return { matchedCount: 0 };
      doc = { ...doc, ...update.$set };
      return { matchedCount: 1 };
    },
    async findOne() { return doc; },
  };
}

async function lease() {
  console.log('\n── 2. Single-flight lease ──');

  const col = fakeLockCollection();
  const lock = await import('@/lib/server/job-sources/run-lock');
  lock.setLockCollectionForTests(col);

  try {
    const t0 = new Date('2026-09-14T12:00:00Z');

    const a = await lock.acquireScraperLease('run-a', 'host:1', t0);
    check('the first run takes the lease', a.ok === true);

    const b = await lock.acquireScraperLease('run-b', 'host:2', t0);
    check('a second concurrent run is refused', b.ok === false);
    check('and is told which run holds it',
      b.ok === false && b.heldBy.runId === 'run-a');

    check('the holder can renew', await lock.renewScraperLease('run-a', t0) === true);
    check('a non-holder cannot renew someone else\'s lease',
      await lock.renewScraperLease('run-b', t0) === false);

    /* The crash case: nobody releases, and the scraper must still recover. */
    const afterExpiry = new Date(t0.getTime() + lock.LEASE_TTL_MS + 1_000);
    const c = await lock.acquireScraperLease('run-c', 'host:3', afterExpiry);
    check('an expired lease is reclaimable, so a crashed worker cannot wedge the scraper',
      c.ok === true);

    check('a superseded run cannot release its successor\'s lease',
      (await lock.releaseScraperLease('run-a', afterExpiry), (col.doc()!.runId === 'run-c')));

    await lock.releaseScraperLease('run-c', afterExpiry);
    check('after release the lease is free', (await lock.readScraperLease(afterExpiry)) === null);

    check('renewal is well inside the TTL, so one missed tick is harmless',
      lock.LEASE_RENEW_MS * 3 <= lock.LEASE_TTL_MS);
  } finally {
    lock.setLockCollectionForTests(null);
  }
}

/* ── 3. The worker and its unit ───────────────────────────────────────────*/

function workerContract() {
  console.log('\n── 3. Worker and systemd unit ──');

  const worker = read('scripts/run-job-scraper.ts');
  check('the worker reuses the canonical pipeline rather than reimplementing it',
    worker.includes('runCanonicalIngestion'));
  check('it takes the lease before contacting any provider',
    worker.indexOf('acquireScraperLease') < worker.indexOf('runCanonicalIngestion'));
  check('losing the race exits 4 rather than failing', worker.includes('return 4'));
  check('it releases the lease in a finally', /finally\s*\{[\s\S]*releaseScraperLease/.test(worker));
  check('it logs no secret',
    !/CRON_SECRET|MONGODB_URI|SMTP_PASSWORD|R2_SECRET|GROQ_API_KEY/.test(worker));

  const svc = read('ops/systemd/docrud-job-scraper.service');
  const timer = read('ops/systemd/docrud-job-scraper.timer');
  check('the service is oneshot, so systemd will not overlap it', svc.includes('Type=oneshot'));
  check('exit 4 is a success, not an alert', /SuccessExitStatus=[^\n]*\b4\b/.test(svc));
  check('it does not run as root', svc.includes('User=ubuntu'));
  check('the unit contains no secret value',
    !/(SECRET|PASSWORD|_KEY|URI)\s*=\s*\S+/.test(svc.replace(/EnvironmentFile=\S+/g, '')));
  check('the timer points at the service', timer.includes('Unit=docrud-job-scraper.service'));

  /* systemd kills at TimeoutStartSec. If that outlived the lease, a killed run
     would leave a lease nobody is renewing and the next tick would wait it out
     for no reason. */
  const timeout = Number(/TimeoutStartSec=(\d+)/.exec(svc)?.[1] ?? 0);
  check('the service timeout is shorter than the lease TTL',
    timeout > 0 && timeout * 1000 < 15 * 60_000, `TimeoutStartSec=${timeout}s`);
}

/* ── 4. The UI no longer hides a real HTTP status ─────────────────────────*/

function uiErrors() {
  console.log('\n── 4. The dashboard reports what actually happened ──');
  const ui = read('components/superadmin/JobsTab.tsx');
  check('a non-JSON gateway page is reported by status, not as "Network error"',
    ui.includes('from the proxy') && ui.includes('r.status'));
  check('the response body is read as text before being parsed',
    ui.includes('r.text()'));
  check('a failed request does not clear the previous run\'s figures',
    /Deliberately NOT clearing/.test(ui));
}

async function main() {
  await deadlineStarvation();
  await lease();
  workerContract();
  uiErrors();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

main().catch((error) => {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
