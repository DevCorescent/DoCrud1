/**
 * Phase 8 self-test: the seven-day job lifecycle.
 *
 * Behaviour only, through the public functions. `now` is injected everywhere,
 * so nothing here depends on the wall clock or on a timezone.
 *
 * The assertions that matter most are the ones about what must NOT happen: an
 * employer's job auto-expiring, a failed scraper run wiping a board, an
 * admin's decision being overruled by a timer, or an application vanishing
 * with its posting. Each of those is silent in production and expensive.
 */
import type { HiringJobPosting, HiringJobApplication } from '@/types/document';
import {
  LIFECYCLE_MS, applyLifecycleUpdates, evaluateLifecycle, hasManualState,
  isJobActive, isSourcedJob, jobAgeMs, markSeen, sourceRunIsTrustworthy,
  sweepLifecycle,
} from '@/lib/server/job-sources/lifecycle';
import { buildRecProfile } from '@/lib/server/job-recommend';
import { buildRecommendations, scoreJobForUser } from '@/lib/server/job-sources/recommendation';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const NOW = Date.parse('2026-06-08T12:00:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

/** A sourced, published, one-day-old posting. */
function job(over: Partial<HiringJobPosting> = {}): HiringJobPosting {
  return {
    id: 'job-a', organizationId: 'scraper-import', organizationName: 'Acme',
    createdByUserId: 'scraper-system', createdByEmail: 's@x.c',
    title: 'Frontend Engineer', description: 'Build React interfaces.',
    responsibilities: [], requirements: ['React'], preferredSkills: ['React'],
    targetRoleKeywords: ['frontend'], minimumAtsScore: 0,
    status: 'published', source: 'scraper', sourceId: 'lever:acme',
    sourceJobId: 'ext-1',
    createdAt: ago(DAY), updatedAt: ago(DAY), ingestedAt: ago(DAY),
    ...over,
  } as HiringJobPosting;
}

const state = (o: Partial<HiringJobPosting>, now = NOW, opts = {}) =>
  evaluateLifecycle(job(o), now, opts).state;

function main() {
  console.log('\n── 1. The seven-day boundary ──');

  check('the window is exactly 7 x 24 hours', LIFECYCLE_MS === 7 * 24 * 60 * 60 * 1000);
  check('a job seen 0 hours ago is active', state({ ingestedAt: ago(0) }) === 'active');
  check('a 1-day-old job is active', state({ ingestedAt: ago(DAY) }) === 'active');
  check('a 5-day-old job is active', state({ ingestedAt: ago(5 * DAY) }) === 'active');
  check('a 6-day-old job is still live (flagged as expiring)',
    ['active', 'expiring'].includes(state({ ingestedAt: ago(6 * DAY) })));
  check('a 6-day job is NOT expired', state({ ingestedAt: ago(6 * DAY) }) !== 'expired');
  check('6 days 23:59:59 is not yet expired',
    state({ ingestedAt: ago(7 * DAY - 1000) }) !== 'expired');
  check('exactly 7 days expires (>= is the rule)',
    state({ ingestedAt: ago(7 * DAY) }) === 'expired');
  check('7 days + 1 second expires',
    state({ ingestedAt: ago(7 * DAY + 1000) }) === 'expired');
  check('8 days expires', state({ ingestedAt: ago(8 * DAY) }) === 'expired');
  check('30 days expires', state({ ingestedAt: ago(30 * DAY) }) === 'expired');
  check('a job at 6 days is reported as "expiring" for a bounded re-check',
    state({ ingestedAt: ago(6 * DAY + HOUR) }) === 'expiring');

  console.log('\n── 2. Age is read from the right field ──');

  check('age comes from ingestedAt', jobAgeMs({ ingestedAt: ago(3 * DAY) }, NOW) === 3 * DAY);
  /* The central trap: a refresh must not make an old job young. */
  check('a content refresh does NOT reset the age',
    state({ ingestedAt: ago(8 * DAY), updatedAt: ago(0) }) === 'expired');
  check('updatedAt alone never keeps a job alive',
    evaluateLifecycle(job({ ingestedAt: ago(9 * DAY), updatedAt: ago(0) }), NOW).reason === 'aged_out');
  check('a stale updatedAt does not expire a young job',
    state({ ingestedAt: ago(HOUR), updatedAt: ago(60 * DAY) }) === 'active');
  check('createdAt is the fallback when ingestedAt is absent',
    jobAgeMs({ createdAt: ago(2 * DAY) }, NOW) === 2 * DAY);
  check('ingestedAt wins over createdAt',
    jobAgeMs({ ingestedAt: ago(DAY), createdAt: ago(50 * DAY) }, NOW) === DAY);
  /* postedAt is the SOURCE's claim and must not drive expiry. */
  check('a six-month-old postedAt does not expire a freshly ingested job',
    state({ ingestedAt: ago(HOUR), postedAt: ago(180 * DAY) }) === 'active');
  check('a job with no usable timestamp is never expired on a guess',
    state({ ingestedAt: undefined, createdAt: undefined }) === 'active');
  check('and that case is reported as age_unknown',
    evaluateLifecycle({ source: 'scraper', status: 'published' }, NOW).reason === 'age_unknown');
  check('an unparseable timestamp yields unknown age, not zero',
    jobAgeMs({ ingestedAt: 'not a date' }, NOW) === null);
  check('a FUTURE timestamp is age zero, never negative',
    jobAgeMs({ ingestedAt: new Date(NOW + 5 * DAY).toISOString() }, NOW) === 0);
  check('a future-dated job stays active', state({ ingestedAt: new Date(NOW + DAY).toISOString() }) === 'active');

  console.log('\n── 3. Timezone independence ──');

  const utc = evaluateLifecycle(job({ ingestedAt: '2026-06-01T12:00:00.000Z' }), NOW);
  const offset = evaluateLifecycle(job({ ingestedAt: '2026-06-01T17:30:00.000+05:30' }), NOW);
  check('the same instant written in two zones gives the same age',
    utc.ageMs === offset.ageMs, `${utc.ageMs} vs ${offset.ageMs}`);
  check('and therefore the same state', utc.state === offset.state);
  check('no date-string comparison is used — an offset date parses correctly',
    jobAgeMs({ ingestedAt: '2026-06-07T12:00:00.000+00:00' }, NOW) === DAY);

  console.log('\n── 4. Employer-posted jobs are protected ──');

  const employer: Partial<HiringJobPosting> = {
    id: 'job-emp', status: 'published', organizationId: 'u-1',
    createdByUserId: 'u-1', ingestedAt: ago(400 * DAY), createdAt: ago(400 * DAY),
  };
  check('a job with no source is not a sourced job', !isSourcedJob(employer));
  check('a 400-day-old EMPLOYER job is never auto-expired',
    evaluateLifecycle(employer, NOW).state === 'protected');
  check('and the reason says why', evaluateLifecycle(employer, NOW).reason === 'employer_owned');
  check('no changes are written for it', evaluateLifecycle(employer, NOW).changed === false);
  check('source="scraper" marks a sourced job', isSourcedJob({ source: 'scraper' }));
  check('a sourceId marks a sourced job', isSourcedJob({ sourceId: 'lever:acme' }));
  check('a business-page job is not treated as scraped', !isSourcedJob({ source: 'business_page' }));
  check('an employer job is untouched even by a source-absence signal',
    evaluateLifecycle(employer, NOW, { absentFromSource: true }).changed === false);

  console.log('\n── 5. Human decisions outrank the timer ──');

  check('a draft (unpublished) job is protected',
    state({ status: 'draft', ingestedAt: ago(30 * DAY) }) === 'protected');
  check('an unpublished job is NEVER republished',
    evaluateLifecycle(job({ status: 'draft' }), NOW).changes.status === undefined);
  check('a closed job is protected',
    state({ status: 'closed', ingestedAt: ago(30 * DAY) }) === 'protected');
  check('the reason names the manual state',
    evaluateLifecycle(job({ status: 'draft', ingestedAt: ago(30 * DAY) }), NOW).reason === 'manual_state');
  check('hasManualState identifies draft and closed',
    hasManualState({ status: 'draft' }) && hasManualState({ status: 'closed' }));
  check('a published job is not a manual state', !hasManualState({ status: 'published' }));
  check('a manually-unpublished job is not expired even when absent from source',
    evaluateLifecycle(job({ status: 'draft' }), NOW, { absentFromSource: true }).changed === false);

  console.log('\n── 6. Absence requires evidence ──');

  const good = { sourceId: 'lever:acme', ok: true, jobsFound: 25 };
  check('a successful, non-empty run is trustworthy', sourceRunIsTrustworthy(good));
  check('a FAILED run is not evidence',
    !sourceRunIsTrustworthy({ ...good, ok: false }));
  check('a SKIPPED source is not evidence',
    !sourceRunIsTrustworthy({ ...good, skipped: true }));
  check('a successful but EMPTY run is not evidence',
    !sourceRunIsTrustworthy({ ...good, jobsFound: 0 }));
  check('a job absent from a trustworthy run expires',
    evaluateLifecycle(job(), NOW, { absentFromSource: true }).state === 'expired');
  check('and the reason is source_absent',
    evaluateLifecycle(job(), NOW, { absentFromSource: true }).reason === 'source_absent');
  check('absence expires a job even when it is young',
    evaluateLifecycle(job({ ingestedAt: ago(HOUR) }), NOW, { absentFromSource: true }).changed);
  check('by default, silence expires nothing',
    evaluateLifecycle(job(), NOW).changed === false);

  /* The catastrophic case: a failed run must not wipe a board. */
  const board = Array.from({ length: 50 }, (_, i) => job({ id: `j-${i}`, sourceId: 'lever:acme' }));
  check('a FAILED run expires nothing across 50 postings',
    sweepLifecycle(board, {
      now: NOW,
      presence: { run: { sourceId: 'lever:acme', ok: false, jobsFound: 0 }, seenJobIds: new Set() },
    }).expired === 0);
  check('a SKIPPED run expires nothing',
    sweepLifecycle(board, {
      now: NOW,
      presence: { run: { sourceId: 'lever:acme', ok: true, skipped: true, jobsFound: 0 }, seenJobIds: new Set() },
    }).expired === 0);
  check('an EMPTY successful run expires nothing',
    sweepLifecycle(board, {
      now: NOW,
      presence: { run: { sourceId: 'lever:acme', ok: true, jobsFound: 0 }, seenJobIds: new Set() },
    }).expired === 0);
  check('a trustworthy run expires only the postings it did not return', (() => {
    const seen = new Set(board.slice(0, 45).map((j) => j.id));
    const out = sweepLifecycle(board, {
      now: NOW, presence: { run: good, seenJobIds: seen },
    });
    return out.expired === 5;
  })());
  /* A run of one source says nothing about another. */
  check("one source's run never expires another source's jobs", (() => {
    const mixed = [job({ id: 'a', sourceId: 'lever:acme' }), job({ id: 'b', sourceId: 'greenhouse:beta' })];
    const out = sweepLifecycle(mixed, {
      now: NOW, presence: { run: good, seenJobIds: new Set(['a']) },
    });
    return out.expired === 0;
  })());

  console.log('\n── 7. What expiry writes ──');

  const v = evaluateLifecycle(job({ ingestedAt: ago(8 * DAY) }), NOW);
  check('expiry sets status to closed', v.changes.status === 'closed');
  check('expiry sets isActive false', v.changes.isActive === false);
  check('expiry records expiresAt', typeof v.changes.expiresAt === 'string');
  check('expiry touches updatedAt', typeof v.changes.updatedAt === 'string');
  check('expiry writes ONLY those four fields',
    Object.keys(v.changes).sort().join(',') === 'expiresAt,isActive,status,updatedAt');
  check('expiry never writes an id, owner or content field',
    !('id' in v.changes) && !('title' in v.changes) && !('organizationId' in v.changes)
    && !('description' in v.changes) && !('createdByUserId' in v.changes));
  check('nothing is deleted — changes is a patch, not a removal', typeof v.changes === 'object');

  console.log('\n── 8. Unrelated fields survive expiry ──');

  const rich = job({
    ingestedAt: ago(9 * DAY),
    domain: 'software', subDomain: 'Frontend', domainConfidence: 0.9,
    city: 'Bengaluru', country: 'IN', contentHash: 'abc123',
    sourceJobId: 'ext-1', canonicalUrl: 'https://jobs.lever.co/acme/1',
    salaryMin: 100, salaryMax: 200,
  });
  const after = applyLifecycleUpdates([rich], sweepLifecycle([rich], { now: NOW }).updates)[0];
  check('the job id survives', after.id === rich.id);
  check('source identity survives', after.sourceId === 'lever:acme' && after.sourceJobId === 'ext-1');
  check('the dedup content hash survives', after.contentHash === 'abc123');
  check('Phase 4 classification survives',
    after.domain === 'software' && after.city === 'Bengaluru' && after.country === 'IN');
  check('salary survives', after.salaryMin === 100 && after.salaryMax === 200);
  check('the canonical URL survives', after.canonicalUrl === rich.canonicalUrl);
  check('createdAt and ingestedAt survive',
    after.createdAt === rich.createdAt && after.ingestedAt === rich.ingestedAt);
  check('title and description survive',
    after.title === rich.title && after.description === rich.description);
  check('the record is now expired', !isJobActive(after));

  console.log('\n── 9. Applications survive ──');

  const apps: HiringJobApplication[] = [
    { id: 'app-1', jobId: 'job-a', candidateUserId: 'u-9', jobTitle: 'Frontend Engineer' } as HiringJobApplication,
  ];
  const expiredJob = applyLifecycleUpdates([job({ ingestedAt: ago(9 * DAY) })],
    sweepLifecycle([job({ ingestedAt: ago(9 * DAY) })], { now: NOW }).updates)[0];
  check('expiry returns no instruction to touch applications',
    !('applications' in (evaluateLifecycle(job({ ingestedAt: ago(9 * DAY) }), NOW).changes as object)));
  check('the application still points at a job that still exists',
    apps[0].jobId === expiredJob.id);
  check('the expired job still carries the title the application recorded',
    expiredJob.title === apps[0].jobTitle);
  check('an application list is untouched by a sweep', (() => {
    const before = JSON.stringify(apps);
    sweepLifecycle([job({ ingestedAt: ago(9 * DAY) })], { now: NOW });
    return JSON.stringify(apps) === before;
  })());

  console.log('\n── 10. Recommendations ──');

  const profile = buildRecProfile({
    headline: 'Frontend Engineer', skills: ['React'], location: 'Bengaluru',
    experience: [{ title: 'Frontend Engineer' }],
  });
  const recInput = { userId: 'u-1', profile, now: NOW };
  check('an ACTIVE job is recommendable',
    scoreJobForUser(job({ location: 'Bengaluru' }), recInput).excluded === null);
  check('an EXPIRED job is not newly recommended',
    scoreJobForUser(expiredJob, recInput).excluded === 'expired');
  check('an expired job never enters a built recommendation set',
    buildRecommendations([expiredJob], recInput).length === 0);
  check('a closed job is not newly recommended',
    scoreJobForUser(job({ status: 'closed' }), recInput).excluded === 'expired');
  check('a draft job is not newly recommended',
    scoreJobForUser(job({ status: 'draft' }), recInput).excluded === 'expired');
  /* History is not touched — Phase 8 only stops NEW recommendations. */
  check('nothing in the lifecycle deletes recommendation history',
    Object.keys(evaluateLifecycle(job({ ingestedAt: ago(9 * DAY) }), NOW).changes)
      .every((k) => ['status', 'isActive', 'expiresAt', 'updatedAt'].includes(k)));

  console.log('\n── 11. isJobActive is one definition ──');

  check('published and unmarked is active', isJobActive({ status: 'published' }));
  check('published with isActive true is active',
    isJobActive({ status: 'published', isActive: true }));
  check('isActive undefined is NOT read as false',
    isJobActive({ status: 'published', isActive: undefined }));
  check('isActive false is inactive', !isJobActive({ status: 'published', isActive: false }));
  check('an expiresAt stamp makes it inactive',
    !isJobActive({ status: 'published', expiresAt: ago(0) }));
  check('a draft is inactive', !isJobActive({ status: 'draft' }));
  check('a closed job is inactive', !isJobActive({ status: 'closed' }));

  console.log('\n── 12. Idempotency ──');

  const aged = [job({ id: 'a', ingestedAt: ago(9 * DAY) }), job({ id: 'b', ingestedAt: ago(DAY) })];
  const first = sweepLifecycle(aged, { now: NOW });
  check('the first sweep expires the aged job', first.expired === 1);
  const applied = applyLifecycleUpdates(aged, first.updates);
  const second = sweepLifecycle(applied, { now: NOW + 5 * 60_000 });
  check('a second sweep expires nothing', second.expired === 0);
  const third = sweepLifecycle(applied, { now: NOW + 10 * 60_000 });
  check('a third sweep expires nothing', third.expired === 0);
  check('an already-expired job is a strict no-op',
    evaluateLifecycle(applied[0], NOW + DAY).changed === false);
  check('and is reported as already_expired',
    evaluateLifecycle(applied[0], NOW + DAY).reason === 'already_expired');
  check('repeated sweeps never change expiresAt', (() => {
    let list = aged;
    let stamp = '';
    for (let i = 0; i < 5; i += 1) {
      const s = sweepLifecycle(list, { now: NOW + i * HOUR });
      list = applyLifecycleUpdates(list, s.updates);
      if (i === 0) stamp = String(list[0].expiresAt);
    }
    return list[0].expiresAt === stamp;
  })());
  check('applying an empty update list returns the SAME array reference',
    applyLifecycleUpdates(aged, []) === aged);
  check('no duplicate records are ever produced', applied.length === aged.length);
  check('the untouched job is returned by reference', applied[1] === aged[1]);

  console.log('\n── 13. Determinism and purity ──');

  const setA = [job({ id: 'c', ingestedAt: ago(9 * DAY) }), job({ id: 'a', ingestedAt: ago(9 * DAY) }),
    job({ id: 'b', ingestedAt: ago(9 * DAY) })];
  const s1 = sweepLifecycle(setA, { now: NOW });
  const s2 = sweepLifecycle(setA.slice().reverse(), { now: NOW });
  check('sweep output is order-independent',
    JSON.stringify(s1.updates.map((u) => u.job.id)) === JSON.stringify(s2.updates.map((u) => u.job.id)));
  check('updates come back sorted by id',
    s1.updates.map((u) => u.job.id).join(',') === 'a,b,c');
  check('ten evaluations agree', (() => {
    const one = JSON.stringify(evaluateLifecycle(job({ ingestedAt: ago(3 * DAY) }), NOW));
    for (let i = 0; i < 10; i += 1) {
      if (JSON.stringify(evaluateLifecycle(job({ ingestedAt: ago(3 * DAY) }), NOW)) !== one) return false;
    }
    return true;
  })());
  check('the input job is not mutated', (() => {
    const j = job({ ingestedAt: ago(9 * DAY) });
    const before = JSON.stringify(j);
    evaluateLifecycle(j, NOW);
    sweepLifecycle([j], { now: NOW });
    return JSON.stringify(j) === before;
  })());
  check('the input array is not mutated', (() => {
    const arr = [job({ id: 'b' }), job({ id: 'a' })];
    const before = arr.map((x) => x.id).join(',');
    sweepLifecycle(arr, { now: NOW });
    applyLifecycleUpdates(arr, []);
    return arr.map((x) => x.id).join(',') === before;
  })());

  console.log('\n── 14. Bounded batch ──');

  const huge = Array.from({ length: 900 }, (_, i) => job({ id: `h-${i}`, ingestedAt: ago(9 * DAY) }));
  const capped = sweepLifecycle(huge, { now: NOW, maxUpdates: 100 });
  check('a sweep respects its update ceiling', capped.updates.length === 100);
  check('it still reports how many it examined', capped.examined === 900);
  check('an explicit ceiling of zero writes nothing',
    sweepLifecycle(huge, { now: NOW, maxUpdates: 0 }).updates.length === 0);
  check('jobs below the threshold are not written at all', (() => {
    const young = Array.from({ length: 100 }, (_, i) => job({ id: `y-${i}`, ingestedAt: ago(DAY) }));
    return sweepLifecycle(young, { now: NOW }).updates.length === 0;
  })());
  check('protected jobs are counted, not written', (() => {
    const out = sweepLifecycle([job({ status: 'draft', ingestedAt: ago(30 * DAY) })], { now: NOW });
    return out.skippedProtected === 1 && out.updates.length === 0;
  })());
  check('expiring-soon ids are surfaced for a bounded re-check', (() => {
    const out = sweepLifecycle([job({ id: 'soon', ingestedAt: ago(6 * DAY + HOUR) })], { now: NOW });
    return out.expiringSoon.includes('soon');
  })());
  check('a job without an id is skipped safely',
    sweepLifecycle([{ ...job(), id: '' } as HiringJobPosting], { now: NOW }).examined === 0);

  console.log('\n── 15. Reappearance ──');

  /* One source identity must never yield two active postings. The Phase 3
     identity is unchanged by expiry, so re-ingestion matches the SAME record
     rather than inserting a second one. */
  const gone = applyLifecycleUpdates([job({ ingestedAt: ago(9 * DAY) })],
    sweepLifecycle([job({ ingestedAt: ago(9 * DAY) })], { now: NOW }).updates)[0];
  check('an expired job keeps the identity fields Phase 3 dedups on',
    gone.sourceId === 'lever:acme' && gone.sourceJobId === 'ext-1');
  check('so re-ingestion can match it instead of creating a duplicate',
    Boolean(gone.sourceId && gone.sourceJobId));
  check('the expired record is still present, not removed', Boolean(gone.id));
  check('an expired job stays expired unless something explicitly revives it',
    evaluateLifecycle(gone, NOW + 30 * DAY).changed === false);

  console.log('\n── 16. Last-seen stamping ──');

  const seen = new Set(['job-a']);
  check('a job confirmed present gets a stamp',
    markSeen([job({ lastSeenAt: undefined })], seen, NOW).length === 1);
  check('a job seen minutes ago is NOT rewritten',
    markSeen([job({ lastSeenAt: ago(10 * 60_000) })], seen, NOW).length === 0);
  check('a job last seen yesterday IS rewritten',
    markSeen([job({ lastSeenAt: ago(DAY) })], seen, NOW).length === 1);
  check('a job not in the seen set is never stamped',
    markSeen([job({ id: 'other' })], seen, NOW).length === 0);
  check('stamps come back sorted for a deterministic write', (() => {
    const list = [job({ id: 'z' }), job({ id: 'a' })];
    const out = markSeen(list, new Set(['z', 'a']), NOW);
    return out.map((o) => o.id).join(',') === 'a,z';
  })());
  check('an unparseable stored stamp is replaced rather than trusted',
    markSeen([job({ lastSeenAt: 'garbage' })], seen, NOW).length === 1);
  check('markSeen does not mutate its input', (() => {
    const list = [job()];
    const before = JSON.stringify(list);
    markSeen(list, seen, NOW);
    return JSON.stringify(list) === before;
  })());

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
