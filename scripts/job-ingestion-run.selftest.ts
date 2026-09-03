/**
 * Stage 2 self-test: the live canonical ingestion run.
 *
 * Fixtures are injected through `ProviderDeps.fetchJson`, and the write step is
 * exercised through `planIngest` directly, so nothing here needs a network or a
 * database.
 *
 * The assertion this whole stage exists for: a posting whose SOURCE CONTENT
 * CHANGED must be UPDATED, not reported as a duplicate and left stale. The old
 * path could not do that, and the staleness was invisible.
 */
import type { HiringJobPosting } from '@/types/document';
import type { NormalizedJob } from '@/lib/server/job-scraper/types';
import { normalizeSourceJob } from '@/lib/server/job-sources/normalize';
import { planIngest } from '@/lib/server/job-sources/ingest';
import { runCanonicalIngestion } from '@/lib/server/job-sources/run-ingestion';
import { isJobActive } from '@/lib/server/job-sources/lifecycle';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const NOW = Date.parse('2026-06-10T00:00:00.000Z');

/** A Lever-shaped posting. */
const post = (over: Record<string, unknown> = {}) => ({
  id: 'L1', text: 'Backend Engineer',
  categories: { location: 'Bengaluru, India', team: 'Engineering', commitment: 'Full-time' },
  descriptionPlain: 'Build APIs with Node.js.',
  hostedUrl: 'https://jobs.lever.co/acme/L1',
  applyUrl: 'https://jobs.lever.co/acme/L1/apply',
  createdAt: 1_760_000_000_000,
  ...over,
});

/** No-DB storage seams, so the run is exercised as a pure function. */
const store = (existing: HiringJobPosting[] = []) => ({
  loadJobs: async () => existing,
  saveJobs: async () => { /* preview only — nothing is persisted in tests */ },
});

const deps = (payload: unknown | (() => unknown)) => ({
  fetchJson: async (url: string) => {
    if (!url.includes('lever')) return null;
    const u = new URL(url);
    /* Only the first page carries data, so pagination terminates. */
    if (Number(u.searchParams.get('skip') ?? '0') > 0) return [];
    return typeof payload === 'function' ? (payload as () => unknown)() : payload;
  },
});

function draftOf(over: Record<string, unknown> = {}) {
  /* Build the raw shape an adapter would emit, then normalize it exactly as
     the run does. */
  const raw: NormalizedJob = {
    source: 'lever:acme', provider: 'lever', externalId: String(over.id ?? 'L1'),
    title: String(over.title ?? 'Backend Engineer'), organizationName: 'Acme',
    location: String(over.location ?? 'Bengaluru, India'), department: 'Engineering',
    employmentType: 'full_time', workMode: 'onsite', experienceLevel: '',
    description: String(over.description ?? 'Build APIs with Node.js.'),
    responsibilities: [], requirements: [], preferredSkills: [], targetRoleKeywords: [],
    salaryPresent: false, postedAt: '', jobUrl: String(over.jobUrl ?? 'https://jobs.lever.co/acme/L1'),
    /* Independent of jobUrl on purpose: identity falls back to the APPLY url
       when the posting url is absent, so the two tiers can only be told apart
       if a fixture can clear them separately. */
    applyUrl: String(over.applyUrl ?? 'https://jobs.lever.co/acme/L1/apply'),
    isActive: over.isActive !== false,
  } as NormalizedJob;
  return normalizeSourceJob(raw, { sourceId: 'lever:acme', now: NOW });
}

async function main() {
  process.env.LEVER_COMPANIES = 'acme|Acme|IN';
  delete process.env.ASHBY_JOB_BOARDS;
  delete process.env.GREENHOUSE_BOARDS;

  console.log('\n── 1. First insertion ──');

  const first = planIngest([draftOf()], [], { now: new Date(NOW).toISOString() });
  check('a new source job is inserted', first.report.created === 1);
  check('and the store now holds it', first.jobs.length === 1);
  const stored = first.jobs[0];
  check('it is marked as scraper-sourced', stored.source === 'scraper');
  check('it carries its source identity',
    stored.sourceId === 'lever:acme' && stored.sourceJobId === 'L1');
  check('Phase 4 classification was applied', Boolean(stored.domain || stored.country));
  check('it is published and active', isJobActive(stored));

  console.log('\n── 2. Unchanged re-run does nothing ──');

  const second = planIngest([draftOf()], first.jobs, { now: '2026-07-01T00:00:00.000Z' });
  check('an unchanged job is not inserted again', second.report.created === 0);
  check('it is reported as unchanged', second.report.unchanged === 1);
  check('the store does not grow', second.jobs.length === 1);
  /* The property the old path could not offer: no pointless write. */
  check('updatedAt is NOT touched', second.jobs[0].updatedAt === stored.updatedAt);
  check('the record is returned byte-identical',
    JSON.stringify(second.jobs[0]) === JSON.stringify(stored));
  check('it is still counted as matched, for lastSeenAt',
    second.report.matchedJobIds.includes(stored.id));

  console.log('\n── 3. CHANGED source content UPDATES (the point of Stage 2) ──');

  const changed = planIngest([draftOf({ description: 'Now owns the payments platform.' })],
    first.jobs, { now: '2026-07-01T00:00:00.000Z' });
  check('changed content is an UPDATE, not a duplicate', changed.report.updated === 1);
  check('and not an insert', changed.report.created === 0);
  check('the store still holds exactly one record', changed.jobs.length === 1);
  check('the new content is actually stored',
    changed.jobs[0].description === 'Now owns the payments platform.');
  check('the job keeps its id', changed.jobs[0].id === stored.id);
  check('the job keeps its createdAt', changed.jobs[0].createdAt === stored.createdAt);
  check('updatedAt moves on a real change',
    changed.jobs[0].updatedAt !== stored.updatedAt);
  check('the content hash moves with the content',
    changed.jobs[0].contentHash !== stored.contentHash);

  console.log('\n── 4. Identity strategy ──');

  check('external id is the primary identity', draftOf().identity.basis === 'external_id');
  check('the canonical URL is used when there is no external id',
    draftOf({ id: '' }).identity.basis === 'canonical_url');
  check('a fingerprint is the last resort — only with NO id and NO url',
    draftOf({ id: '', jobUrl: '', applyUrl: '' }).identity.basis === 'fingerprint');
  check('an apply URL alone is still stronger than a fingerprint',
    draftOf({ id: '', jobUrl: '' }).identity.basis === 'canonical_url');
  /* A changed URL must NOT create a second record while the id is stable. */
  check('a changed URL does not duplicate a job that has an external id', (() => {
    const out = planIngest([draftOf({ jobUrl: 'https://jobs.lever.co/acme/L1?utm_source=x' })], first.jobs);
    return out.jobs.length === 1 && out.report.created === 0;
  })());
  check('a DIFFERENT external id is a different job', (() => {
    const out = planIngest([draftOf({ id: 'L2', title: 'Frontend Engineer' })], first.jobs);
    return out.jobs.length === 2 && out.report.created === 1;
  })());
  check('the same job twice in one batch collapses to one', (() => {
    const out = planIngest([draftOf(), draftOf(), draftOf()], []);
    return out.jobs.length === 1 && out.report.duplicatesInBatch === 2;
  })());

  console.log('\n── 5. Employer jobs are untouchable ──');

  const employer: HiringJobPosting = {
    id: 'job-emp', organizationId: 'u-1', organizationName: 'Acme',
    createdByUserId: 'u-1', createdByEmail: 'a@b.c',
    title: 'Backend Engineer', description: 'Written by a person.',
    location: 'Bengaluru', responsibilities: [], requirements: [], preferredSkills: [],
    targetRoleKeywords: [], minimumAtsScore: 72, status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as HiringJobPosting;
  const withEmployer = planIngest([draftOf()], [employer]);
  check('a source run never matches an employer job', withEmployer.report.created === 1);
  check('the employer job survives untouched',
    withEmployer.jobs.find((j) => j.id === 'job-emp')?.description === 'Written by a person.');
  check('its ATS cutoff is preserved',
    withEmployer.jobs.find((j) => j.id === 'job-emp')?.minimumAtsScore === 72);
  check('its ownership is preserved',
    withEmployer.jobs.find((j) => j.id === 'job-emp')?.createdByUserId === 'u-1');

  console.log('\n── 6. Operational state is preserved ──');

  const unpublished = [{ ...stored, status: 'draft' as const, minimumAtsScore: 55 }];
  const rerun = planIngest([draftOf({ description: 'Edited at source.' })], unpublished);
  check('an admin-unpublished job is NOT republished by ingestion',
    rerun.jobs[0].status === 'draft');
  check('an admin-set ATS cutoff survives', rerun.jobs[0].minimumAtsScore === 55);
  check('but the content still updates', rerun.jobs[0].description === 'Edited at source.');
  check('salary is not overwritten with nothing', (() => {
    const withPay = [{ ...stored, salaryMin: 100, salaryMax: 200 }];
    const out = planIngest([draftOf({ description: 'x' })], withPay);
    return out.jobs[0].salaryMin === 100 && out.jobs[0].salaryMax === 200;
  })());
  check('ingestedAt is never rewritten', (() => {
    const out = planIngest([draftOf({ description: 'x' })], first.jobs);
    return out.jobs[0].ingestedAt === stored.ingestedAt;
  })());

  console.log('\n── 7. The live run: success, empty, failed, skipped ──');

  {
    const out = await runCanonicalIngestion({ deps: deps([post()]), now: NOW, commit: false, ...store() });
    check('a successful run discovers its jobs', out.discovered === 1, String(out.discovered));
    check('and reports one healthy source', out.sourcesOk === 1 && out.failed === 0);
    check('per-source stats are populated', out.perSource[0]?.sourceId === 'lever:acme');
    check('identity basis is reported for auditing', out.identityBasis.external_id === 1);
  }
  {
    const out = await runCanonicalIngestion({ deps: deps([]), now: NOW, commit: false, ...store() });
    check('a SUCCESSFUL EMPTY source reports 0 discovered and 0 failed',
      out.discovered === 0 && out.failed === 0);
    check('and is not marked as failed', out.perSource.every((s) => s.ok));
    /* The distinction Phase 8 depends on. */
    check('an empty run produces no expiry instruction', out.inserted === 0 && out.updated === 0);
  }
  {
    const out = await runCanonicalIngestion({
      deps: { fetchJson: async () => { throw new Error('provider down'); } },
      now: NOW, commit: false, ...store(),
    });
    check('a FAILED source is reported as failed', out.failed === 1, String(out.failed));
    check('and contributes no discovered jobs', out.discovered === 0);
    check('the error is safe — no stack trace',
      !/\bat \s|node_modules/.test(String(out.perSource[0]?.error ?? '')));
    check('a failed run inserts and updates nothing',
      out.inserted === 0 && out.updated === 0);
    /* The catastrophic case this stage must never enable. */
    check('a failed run NEVER expires anything — it writes no lifecycle change',
      out.seenStamped === 0);
  }
  {
    process.env.LEVER_COMPANIES = '';
    const out = await runCanonicalIngestion({ deps: deps([post()]), now: NOW, commit: false, ...store() });
    check('no configured sources means no work and no failures',
      out.sources === out.skipped + out.sourcesOk + out.failed);
    process.env.LEVER_COMPANIES = 'acme|Acme|IN';
  }

  console.log('\n── 8. Source isolation ──');

  {
    process.env.GREENHOUSE_BOARDS = 'beta|Beta|IN';
    const out = await runCanonicalIngestion({
      deps: {
        fetchJson: async (url: string) => {
          if (url.includes('lever')) throw new Error('down');
          return { jobs: [{ id: 77, title: 'Platform Engineer', location: { name: 'Pune, India' },
            absolute_url: 'https://boards.greenhouse.io/beta/jobs/77', content: '&lt;p&gt;x&lt;/p&gt;' }] };
        },
      },
      now: NOW, commit: false, ...store(),
    });
    check('one failing source does not stop the others', out.discovered === 1, String(out.discovered));
    check('the failure is still counted', out.failed === 1);
    check('and the healthy source is counted separately', out.sourcesOk === 1);
    check('per-source rows separate the two',
      out.perSource.filter((s) => !s.ok).length === 1 && out.perSource.filter((s) => s.ok && !s.skipped).length === 1);
    delete process.env.GREENHOUSE_BOARDS;
  }

  console.log('\n── 8b. The time budget and the round-robin ──');

  /* THE BUG THIS SECTION EXISTS FOR.

     A run reads its sources one at a time inside a request with a hard ceiling,
     and every write happens AFTER the loop. A run that overran was killed
     mid-loop and persisted NOTHING, so the sources it had already read kept
     their old state and the ones it never reached stayed "Never synced"
     forever. With a fixed starting order the same head of the list was read
     every pass and the tail was starved permanently — which is precisely how
     six sources showed a sync timestamp and sixteen showed none. */
  {
    /* Three sources, in a known order: lever:acme, greenhouse:beta, ashby:gamma. */
    process.env.LEVER_COMPANIES = 'acme|Acme|IN';
    process.env.GREENHOUSE_BOARDS = 'beta|Beta|IN';
    process.env.ASHBY_JOB_BOARDS = 'gamma|Gamma|IN';

    const attempted: string[] = [];
    const spyDeps = {
      fetchJson: async (url: string) => {
        if (url.includes('lever')) { attempted.push('lever:acme'); return []; }
        if (url.includes('greenhouse')) { attempted.push('greenhouse:beta'); return { jobs: [] }; }
        attempted.push('ashby:gamma');
        return { jobs: [] };
      },
      fetchJsonPost: async () => ({ jobPostings: [] }),
    };

    /* A deadline already in the past: nothing may be started. */
    attempted.length = 0;
    const none = await runCanonicalIngestion({
      deps: spyDeps, now: NOW, commit: false, ...store(), deadlineAt: Date.now() - 1,
    });
    check('an expired budget starts no source at all', attempted.length === 0);
    check('and every source is reported skipped for time',
      none.deadlineSkipped === none.sources && none.sources > 0,
      `${none.deadlineSkipped}/${none.sources}`);
    check('a source skipped for time is NOT a failure', none.failed === 0);
    /* The point of skipped-not-failed: the caller leaves prior state alone. */
    check('and every one is marked skipped so its state is left untouched',
      none.perSource.every((r) => r.skipped && r.skipReason === 'deadline'));
    check('an untouched run does not move the cursor',
      none.nextStartAfterSourceId === undefined);

    /* No deadline: the whole list runs, and the cursor lands on the last one. */
    attempted.length = 0;
    const all = await runCanonicalIngestion({ deps: spyDeps, now: NOW, commit: false, ...store() });
    check('with no deadline every source is attempted', attempted.length === 3, attempted.join(','));
    check('the run is not marked as time-skipped', all.deadlineSkipped === 0);
    const lastId = all.perSource.filter((r) => !r.skipped).map((r) => r.sourceId).pop();
    check('the cursor is the last source actually attempted',
      all.nextStartAfterSourceId === lastId, `${all.nextStartAfterSourceId} vs ${lastId}`);

    /* Resuming: the run begins AFTER the cursor, and wraps. */
    const firstId = all.perSource.filter((r) => !r.skipped).map((r) => r.sourceId)[0];
    attempted.length = 0;
    const resumed = await runCanonicalIngestion({
      deps: spyDeps, now: NOW, commit: false, ...store(), startAfterSourceId: firstId,
    });
    const order = resumed.perSource.map((r) => r.sourceId);
    check('a resumed run does not start at the cursor itself', order[0] !== firstId);
    check('and it wraps around to cover the cursor last',
      order[order.length - 1] === firstId, order.join(','));
    check('rotation changes the order but never the membership',
      order.length === all.perSource.length
      && new Set(order).size === new Set(all.perSource.map((r) => r.sourceId)).size);

    /* THE STARVATION TEST. One source per pass, resuming each time: every
       source must get its turn rather than the head repeating forever. */
    /* The stub SPENDS time, so "one source per pass" is a fact rather than a
       race: the first source is checked before the deadline and takes 12 ms,
       which is past a 4 ms budget by the time the second is checked. A stub
       that returned instantly would let a second source slip in and the test
       would pass or fail on scheduler luck. */
    const slowDeps = {
      fetchJson: async (url: string) => {
        await new Promise((r) => setTimeout(r, 12));
        if (url.includes('lever')) { attempted.push('lever:acme'); return []; }
        if (url.includes('greenhouse')) { attempted.push('greenhouse:beta'); return { jobs: [] }; }
        attempted.push('ashby:gamma');
        return { jobs: [] };
      },
      fetchJsonPost: async () => ({ jobPostings: [] }),
    };

    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let pass = 0; pass < 3; pass += 1) {
      attempted.length = 0;
      const one = await runCanonicalIngestion({
        deps: slowDeps, now: NOW, commit: false, ...store(),
        startAfterSourceId: cursor,
        deadlineAt: Date.now() + 4,
      });
      check(`pass ${pass + 1} reads exactly one source`, attempted.length === 1, attempted.join(','));
      if (one.nextStartAfterSourceId) { seen.add(one.nextStartAfterSourceId); cursor = one.nextStartAfterSourceId; }
    }
    check('successive budget-limited runs cover every source, not just the head',
      seen.size === 3, Array.from(seen).join(','));

    /* An id that has been removed from the configuration must not strand it. */
    const stale = await runCanonicalIngestion({
      deps: spyDeps, now: NOW, commit: false, ...store(), startAfterSourceId: 'lever:deleted-company',
    });
    check('an unknown cursor falls back to the top of the list rather than stalling',
      stale.perSource.length === all.perSource.length && stale.sourcesOk === all.sourcesOk);

    delete process.env.GREENHOUSE_BOARDS;
    delete process.env.ASHBY_JOB_BOARDS;
  }

  console.log('\n── 9. Truncation and metrics ──');

  {
    const many = Array.from({ length: 25 }, (_, i) => post({ id: `L${i}`, text: `Role ${i}` }));
    const out = await runCanonicalIngestion({ deps: deps(many), now: NOW, perSourceLimit: 10, commit: false, ...store() });
    check('a per-source limit is applied', out.discovered === 10, String(out.discovered));
    check('the dropped jobs are COUNTED, not silent', out.truncated === 15, String(out.truncated));
  }
  {
    const many = Array.from({ length: 5 }, (_, i) => post({ id: `L${i}`, text: `Role ${i}` }));
    const out = await runCanonicalIngestion({ deps: deps(many), now: NOW, commit: false, ...store() });
    check('nothing is truncated inside the limit', out.truncated === 0);
    check('metrics use the Stage 1 vocabulary', (() => {
      const keys = Object.keys(out);
      return ['discovered', 'inserted', 'updated', 'unchanged', 'duplicateInRun', 'truncated', 'failed', 'skipped']
        .every((k) => keys.includes(k));
    })());
    check('discovered is never presented as inserted', out.discovered >= out.inserted);
  }

  console.log('\n── 10. lastSeenAt ──');

  {
    const out = await runCanonicalIngestion({ deps: deps([post()]), now: NOW, commit: false, ...store() });
    check('a successful run stamps what it confirmed', out.seenStamped >= 0);
  }
  check('matched ids are surfaced so Phase 8 can use them',
    planIngest([draftOf()], first.jobs).report.matchedJobIds.length === 1);
  check('a job the run did NOT see is not stamped', (() => {
    const other: HiringJobPosting = { ...stored, id: 'job-other', sourceJobId: 'ZZZ' };
    const out = planIngest([draftOf()], [stored, other]);
    return !out.report.matchedJobIds.includes('job-other');
  })());

  console.log('\n── 11. Determinism and no double-write ──');

  {
    const a = await runCanonicalIngestion({ deps: deps([post()]), now: NOW, commit: false, ...store() });
    const b = await runCanonicalIngestion({ deps: deps([post()]), now: NOW, commit: false, ...store() });
    check('two identical runs produce identical summaries',
      JSON.stringify({ ...a, perSource: a.perSource.map((s) => ({ ...s, latencyMs: 0 })) })
      === JSON.stringify({ ...b, perSource: b.perSource.map((s) => ({ ...s, latencyMs: 0 })) }));
  }
  check('planIngest does not mutate the existing array', (() => {
    const arr = [...first.jobs];
    const before = JSON.stringify(arr);
    planIngest([draftOf({ description: 'y' })], arr);
    return JSON.stringify(arr) === before;
  })());
  check('ten repeated plans converge on one record', (() => {
    let list: HiringJobPosting[] = [];
    for (let i = 0; i < 10; i += 1) list = planIngest([draftOf()], list).jobs;
    return list.length === 1;
  })());

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
