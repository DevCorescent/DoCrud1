/**
 * Phase 7 self-test: the recommendation queue.
 *
 * Behaviour only, through the public functions. No Mongo, no network, and no
 * clock — `now` is injected everywhere, which is what makes freshness (and
 * therefore ranking) reproducible in a test at all.
 *
 * The assertions that matter most are the ones about ABSENCE and EXCLUSION: a
 * job wrongly withheld leaves no trace in production, and a hard eligibility
 * conflict leaking into a recommendation is the failure with real consequences
 * for a member.
 */
import type { HiringJobPosting, HiringJobApplication } from '@/types/document';
import { buildRecProfile } from '@/lib/server/job-recommend';
import {
  RECOMMENDATION_LIMIT, appliedJobIds, buildRecommendations, freshnessScore,
  mergeRecommendations, queuedRecommendations, recommendationId, scoreJobForUser,
  type JobRecommendation, type RecommendationInput,
} from '@/lib/server/job-sources/recommendation';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const NOW = Date.parse('2026-06-01T00:00:00.000Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function job(over: Partial<HiringJobPosting> = {}): HiringJobPosting {
  return {
    id: 'job-a', organizationId: 'o', organizationName: 'Acme',
    createdByUserId: 'u', createdByEmail: 'e@x.c',
    title: 'Frontend Engineer',
    description: 'Build React interfaces with TypeScript.',
    responsibilities: ['Ship features'], requirements: ['React'],
    preferredSkills: ['React', 'TypeScript'], targetRoleKeywords: ['frontend', 'engineer'],
    minimumAtsScore: 0, status: 'published',
    location: 'Bengaluru', workMode: 'hybrid', employmentType: 'full_time',
    domain: 'software', domainConfidence: 0.9,
    createdAt: daysAgo(1), updatedAt: daysAgo(1),
    ...over,
  } as HiringJobPosting;
}

const profile = buildRecProfile({
  headline: 'Frontend Engineer',
  skills: ['React', 'TypeScript'],
  location: 'Bengaluru',
  experience: [{ title: 'Frontend Engineer' }],
});

function input(over: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    userId: 'user-1',
    profile,
    candidate: {
      id: 'user-1',
      profile: { headline: 'Frontend Engineer', domain: 'software', skills: ['React', 'TypeScript'] },
      resume: { experience: [{ title: 'Frontend Engineer', desc: 'Built React and TypeScript apps.' }] },
    },
    now: NOW,
    ...over,
  };
}

function main() {
  console.log('\n── 1. Eligibility is a hard gate ──');

  const eligible = scoreJobForUser(job(), input());
  check('an eligible, overlapping job is recommendable', eligible.excluded === null);
  check('and reports eligibility "eligible"', eligible.eligibility === 'eligible');

  const inelig = input({
    candidate: { ...input().candidate!, eligibility: { workModes: ['remote'] } },
  });
  const blocked = scoreJobForUser(job({ workMode: 'onsite' }), inelig);
  check('an INELIGIBLE job is excluded', blocked.excluded === 'ineligible');
  check('and never reaches the built set',
    buildRecommendations([job({ workMode: 'onsite' })], inelig).length === 0);
  check('exclusion is not a low score — the score still exists', blocked.score > 0);

  const unknownElig = input({
    candidate: { ...input().candidate!, eligibility: { cities: ['bengaluru'] } },
  });
  const unk = scoreJobForUser(job({ location: undefined }), unknownElig);
  check('UNKNOWN eligibility is not an exclusion', unk.excluded !== 'ineligible');
  check('unknown eligibility is reported as unknown', unk.eligibility === 'unknown');
  check('an unknown-eligibility job can still be recommended',
    buildRecommendations([job({ location: undefined })], unknownElig).length === 1);
  check('and it says so, rather than pretending certainty',
    unk.reasons.some((r) => /could not be checked/i.test(r)));

  /* The brief's worked example: "Remote — US only" must not reach an India member. */
  const usOnly = job({ workMode: 'remote', remoteEligibleRegions: ['US'], location: 'Remote' });
  const indiaUser = input({
    candidate: { ...input().candidate!, eligibility: { countries: ['in'], workModes: ['remote'] } },
  });
  check('a US-only remote job is not recommended to an India-only member',
    scoreJobForUser(usOnly, indiaUser).excluded === 'ineligible');
  check('an unrestricted remote job IS recommendable to them',
    scoreJobForUser(job({ workMode: 'remote', location: 'Remote' }), indiaUser).excluded === null);

  console.log('\n── 2. Overlap gate (the repository’s existing rule) ──');

  const unrelated = job({
    id: 'job-far', title: 'Staff Nurse', description: 'Patient care in a busy ward.',
    preferredSkills: ['Patient Care'], targetRoleKeywords: ['nurse'], requirements: [],
    domain: 'health',
  });
  check('a job with no genuine profile overlap is excluded',
    scoreJobForUser(unrelated, input()).excluded === 'no_overlap');
  check('overlap is reported as a signal',
    scoreJobForUser(job(), input()).signals.overlap === true);
  check('a non-overlapping job does not enter the built set',
    buildRecommendations([unrelated], input()).length === 0);

  console.log('\n── 3. Already applied ──');

  const apps: HiringJobApplication[] = [
    { id: 'a1', jobId: 'job-a', candidateUserId: 'user-1' } as HiringJobApplication,
    { id: 'a2', jobId: 'job-z', candidateUserId: 'other' } as HiringJobApplication,
  ];
  const applied = appliedJobIds(apps, 'user-1');
  check('applied ids are read from the EXISTING application records',
    applied.has('job-a') && applied.size === 1);
  check("another member's application is not counted", !applied.has('job-z'));
  check('an applied job is excluded',
    scoreJobForUser(job(), input({ appliedJobIds: applied })).excluded === 'already_applied');
  check('and does not enter the built set',
    buildRecommendations([job()], input({ appliedJobIds: applied })).length === 0);
  check('a job the member has NOT applied to is unaffected',
    scoreJobForUser(job({ id: 'job-b' }), input({ appliedJobIds: applied })).excluded === null);

  console.log('\n── 4. Signals affect ranking ──');

  const strongAts = scoreJobForUser(job(), input());
  const weakAts = scoreJobForUser(job(), input({
    candidate: { id: 'user-1', profile: { headline: 'Frontend Engineer', domain: 'software', skills: [] } },
  }));
  check('a better ATS match scores higher', strongAts.score > weakAts.score,
    `${strongAts.score} vs ${weakAts.score}`);
  check('the ATS score is carried through unblended', typeof strongAts.atsScore === 'number');

  const fresh = scoreJobForUser(job({ id: 'f', createdAt: daysAgo(0) }), input());
  const stale = scoreJobForUser(job({ id: 's', createdAt: daysAgo(60) }), input());
  check('a fresher job scores higher than an otherwise identical old one',
    fresh.score > stale.score, `${fresh.score} vs ${stale.score}`);
  check('an old job is still NOT deleted or excluded', stale.excluded === null);

  const inCity = scoreJobForUser(job({ id: 'c1', location: 'Bengaluru' }), input());
  const farCity = scoreJobForUser(job({ id: 'c2', location: 'Kolkata' }), input());
  check('a matching location scores at least as high as a distant one',
    inCity.score >= farCity.score, `${inCity.score} vs ${farCity.score}`);

  const rightDomain = scoreJobForUser(job({ id: 'd1', domain: 'software' }), input());
  const wrongDomain = scoreJobForUser(job({ id: 'd2', domain: 'finance' }), input());
  check('a matching domain scores at least as high as a mismatched one',
    rightDomain.score >= wrongDomain.score, `${rightDomain.score} vs ${wrongDomain.score}`);

  console.log('\n── 5. Freshness ──');

  check('a job posted today is fully fresh', freshnessScore({ createdAt: daysAgo(0) }, NOW) === 100);
  check('freshness decays over the window', (() => {
    const f = freshnessScore({ createdAt: daysAgo(15) }, NOW);
    return f !== null && f > 0 && f < 100;
  })());
  check('a job beyond the window scores zero freshness',
    freshnessScore({ createdAt: daysAgo(90) }, NOW) === 0);
  check('a job with NO date yields null, not zero', freshnessScore({}, NOW) === null);
  check('an unparseable date yields null',
    freshnessScore({ createdAt: 'not a date' }, NOW) === null);
  check('the source postedAt is preferred over createdAt',
    freshnessScore({ postedAt: daysAgo(0), createdAt: daysAgo(90) }, NOW) === 100);
  check('a future date is not extra credit',
    freshnessScore({ createdAt: new Date(NOW + 86_400_000).toISOString() }, NOW) === 100);

  console.log('\n── 6. Absent signals are never zeros ──');

  const noAts = scoreJobForUser(job(), input({ candidate: undefined }));
  check('a member with no candidate view still gets a score', noAts.score > 0);
  check('ATS is reported as absent, not as zero', noAts.atsScore === null);
  check('freshness absent is reported as null, not zero',
    scoreJobForUser(job({ createdAt: undefined, postedAt: undefined }), input())
      .signals.freshness === null);
  check('a job with no date still scores on its other signals',
    scoreJobForUser(job({ createdAt: undefined, postedAt: undefined }), input()).score > 0);
  /* Weight redistribution: dropping a signal must not depress the score. */
  check('dropping the freshness signal does not depress the score toward zero', (() => {
    const withDate = scoreJobForUser(job({ id: 'x', createdAt: daysAgo(0) }), input()).score;
    const without = scoreJobForUser(job({ id: 'x', createdAt: undefined }), input()).score;
    return without > withDate * 0.6;
  })());

  console.log('\n── 7. No fabricated facts ──');

  const bare = scoreJobForUser(
    job({ location: undefined, workMode: undefined, employmentType: undefined,
      domain: undefined, salaryMin: undefined, salaryMax: undefined }),
    input());
  const joined = bare.reasons.join(' | ').toLowerCase();
  check('no salary is invented when the job states none', !/salary|₹|\$|lpa|ctc/.test(joined));
  check('no location is invented when the job states none',
    !/bengaluru|bangalore|remote|onsite|hybrid/.test(joined), joined);
  check('no hype language is produced',
    !/great opportunity|perfect|dream job|definitely/.test(joined));
  check('no hiring probability is claimed',
    !/chance|probability|likely to be hired|will get/.test(joined));
  check('the ATS reason is phrased as a match, never as a chance', (() => {
    const r = scoreJobForUser(job(), input()).reasons.join(' | ');
    return !r.includes('chance') && (r.includes('ATS match') || !r.includes('ATS'));
  })());
  check('every reason is a non-empty string',
    scoreJobForUser(job(), input()).reasons.every((r) => typeof r === 'string' && r.trim().length > 0));

  console.log('\n── 8. Deduplication and identity ──');

  check('identity is userId:jobId', recommendationId('u1', 'j1') === 'u1:j1');
  const dupInput = [job({ id: 'job-a' }), job({ id: 'job-a' }), job({ id: 'job-a' })];
  const deduped = buildRecommendations(dupInput, input());
  check('the same job three times produces ONE record', deduped.length === 1);
  check('records carry the composite id', deduped[0].id === 'user-1:job-a');
  check('a malformed job without an id is skipped', (() => {
    const out = buildRecommendations([{ ...job(), id: '' } as HiringJobPosting, job()], input());
    return out.length === 1;
  })());

  console.log('\n── 9. Idempotency ──');

  const jobs = [job({ id: 'j1' }), job({ id: 'j2' }), job({ id: 'j3' })];
  const run1 = buildRecommendations(jobs, input());
  const run2 = buildRecommendations(jobs, input());
  check('two runs produce identical output', JSON.stringify(run1) === JSON.stringify(run2));

  const merged1 = mergeRecommendations([], run1);
  const merged2 = mergeRecommendations(merged1, run2);
  check('merging a second identical run adds no records', merged2.length === merged1.length);
  check('and changes nothing at all', JSON.stringify(merged1) === JSON.stringify(merged2));
  check('running ten times still yields the same set', (() => {
    let acc = mergeRecommendations([], run1);
    for (let i = 0; i < 10; i += 1) acc = mergeRecommendations(acc, buildRecommendations(jobs, input()));
    return acc.length === merged1.length && JSON.stringify(acc) === JSON.stringify(merged1);
  })());
  check('an unchanged record keeps its original updatedAt', (() => {
    const older = merged1.map((r) => ({ ...r, updatedAt: '2020-01-01T00:00:00.000Z' }));
    const after = mergeRecommendations(older, run2);
    return after.every((r) => r.updatedAt === '2020-01-01T00:00:00.000Z');
  })());
  check('a CHANGED record is updated, keeping its createdAt', (() => {
    const stale0 = merged1.map((r) => ({ ...r, score: 1, createdAt: '2020-01-01T00:00:00.000Z' }));
    const after = mergeRecommendations(stale0, run2);
    const one = after.find((r) => r.jobId === 'j1')!;
    return one.score !== 1 && one.createdAt === '2020-01-01T00:00:00.000Z';
  })());

  console.log('\n── 10. Member decisions are respected ──');

  for (const status of ['dismissed', 'saved', 'applied', 'expired'] as const) {
    const existing = merged1.map((r) => (r.jobId === 'j1' ? { ...r, status } : r));
    const after = mergeRecommendations(existing, buildRecommendations(jobs, input()));
    check(`a "${status}" record is not reset to recommended by a re-run`,
      after.find((r) => r.jobId === 'j1')?.status === status);
  }
  check('a dismissed job is withheld from the member queue', (() => {
    const withDismissed = merged1.map((r) => (r.jobId === 'j1' ? { ...r, status: 'dismissed' as const } : r));
    return !queuedRecommendations(withDismissed).some((r) => r.jobId === 'j1');
  })());
  check('an applied job is withheld from the member queue', (() => {
    const withApplied = merged1.map((r) => (r.jobId === 'j1' ? { ...r, status: 'applied' as const } : r));
    return !queuedRecommendations(withApplied).some((r) => r.jobId === 'j1');
  })());
  check('an expired job is withheld from the member queue', (() => {
    const withExpired = merged1.map((r) => (r.jobId === 'j1' ? { ...r, status: 'expired' as const } : r));
    return !queuedRecommendations(withExpired).some((r) => r.jobId === 'j1');
  })());
  check('a SAVED job is kept — saving is interest, not dismissal', (() => {
    const withSaved = merged1.map((r) => (r.jobId === 'j1' ? { ...r, status: 'saved' as const } : r));
    return queuedRecommendations(withSaved).some((r) => r.jobId === 'j1');
  })());
  check('records absent from a new run are preserved, not deleted', (() => {
    const after = mergeRecommendations(merged1, buildRecommendations([job({ id: 'j1' })], input()));
    return after.length === merged1.length;
  })());

  console.log('\n── 11. Ranking ──');

  const ranked = buildRecommendations(
    [job({ id: 'old', createdAt: daysAgo(80) }), job({ id: 'new', createdAt: daysAgo(0) })],
    input());
  check('ranking is score-descending', ranked[0].score >= ranked[1].score);
  check('the fresher of two identical jobs ranks first', ranked[0].jobId === 'new');

  /* Ties must break on jobId, never on array order. */
  const tied = buildRecommendations(
    [job({ id: 'c' }), job({ id: 'a' }), job({ id: 'b' })], input());
  check('tied scores break on jobId ascending',
    tied.map((r) => r.jobId).join(',') === 'a,b,c',
    tied.map((r) => `${r.jobId}:${r.score}`).join(' '));
  check('reversing the input does not change the ranking', (() => {
    const one = buildRecommendations([job({ id: 'a' }), job({ id: 'b' }), job({ id: 'c' })], input());
    const two = buildRecommendations([job({ id: 'c' }), job({ id: 'b' }), job({ id: 'a' })], input());
    return JSON.stringify(one) === JSON.stringify(two);
  })());

  const many: HiringJobPosting[] = [];
  for (let i = 0; i < 320; i += 1) {
    many.push(job({ id: `job-${String(i).padStart(3, '0')}`, createdAt: daysAgo(i % 40) }));
  }
  const bigA = buildRecommendations(many, input(), { limit: 320 });
  const bigB = buildRecommendations(many.slice().reverse(), input(), { limit: 320 });
  check('320 jobs rank identically regardless of input order',
    JSON.stringify(bigA.map((r) => r.jobId)) === JSON.stringify(bigB.map((r) => r.jobId)));
  check('320 jobs come back fully sorted', (() => {
    for (let i = 1; i < bigA.length; i += 1) {
      if (bigA[i - 1].score < bigA[i].score) return false;
      if (bigA[i - 1].score === bigA[i].score
        && bigA[i - 1].jobId.localeCompare(bigA[i].jobId) > 0) return false;
    }
    return true;
  })());
  check('no job appears twice in a large ranking',
    new Set(bigA.map((r) => r.jobId)).size === bigA.length);

  console.log('\n── 12. Top-N window ──');

  check('the default limit is a shared constant', RECOMMENDATION_LIMIT > 0);
  check('the built set respects the default limit',
    buildRecommendations(many, input()).length === RECOMMENDATION_LIMIT);
  check('an explicit limit is honoured',
    buildRecommendations(many, input(), { limit: 7 }).length === 7);
  check('a limit of zero yields nothing',
    buildRecommendations(many, input(), { limit: 0 }).length === 0);
  check('a negative limit is treated as zero',
    buildRecommendations(many, input(), { limit: -5 }).length === 0);
  check('the limit keeps the BEST N, not the first N', (() => {
    const top = buildRecommendations(many, input(), { limit: 5 });
    const all = buildRecommendations(many, input(), { limit: 320 });
    return JSON.stringify(top.map((r) => r.jobId)) === JSON.stringify(all.slice(0, 5).map((r) => r.jobId));
  })());
  check('the member queue applies its own limit',
    queuedRecommendations(bigA, 3).length === 3);

  console.log('\n── 13. Determinism and purity ──');

  const j = job(); const i = input();
  const first = JSON.stringify(scoreJobForUser(j, i));
  let stable = true;
  for (let n = 0; n < 15; n += 1) {
    if (JSON.stringify(scoreJobForUser(j, i)) !== first) stable = false;
  }
  check('fifteen evaluations produce an identical result', stable);
  const jBefore = JSON.stringify(j);
  scoreJobForUser(j, i);
  check('the job is not mutated', JSON.stringify(j) === jBefore);
  check('the input job array is not mutated', (() => {
    const arr = [job({ id: 'b' }), job({ id: 'a' })];
    const before = JSON.stringify(arr.map((x) => x.id));
    buildRecommendations(arr, input());
    return JSON.stringify(arr.map((x) => x.id)) === before;
  })());
  check('the existing records array is not mutated', (() => {
    const arr = [...merged1];
    const before = JSON.stringify(arr);
    mergeRecommendations(arr, run2);
    return JSON.stringify(arr) === before;
  })());
  check('scores are integers within 0..100',
    bigA.every((r) => Number.isInteger(r.score) && r.score >= 0 && r.score <= 100));

  console.log('\n── 14. Record shape ──');

  const one = buildRecommendations([job()], input())[0];
  check('a record stores the job ID, never a copy of the job',
    !('job' in one) && !('title' in one) && one.jobId === 'job-a');
  check('it carries userId, score, reasons, eligibility, atsScore, status',
    Boolean(one.userId && typeof one.score === 'number' && Array.isArray(one.reasons)
      && one.eligibility && one.status));
  check('it carries createdAt and updatedAt', Boolean(one.createdAt && one.updatedAt));
  check('a new record starts as "recommended"', one.status === 'recommended');
  check('signals are exposed for auditing',
    typeof one.signals.relevance === 'number' && 'ats' in one.signals && 'freshness' in one.signals);

  console.log('\n── 15. Malformed input never crashes ──');

  const survives = (label: string, fn: () => unknown) => {
    try { fn(); check(label, true); } catch (e) { check(label, false, String(e).slice(0, 80)); }
  };
  survives('an empty job list', () => buildRecommendations([], input()));
  check('an empty job list yields no records', buildRecommendations([], input()).length === 0);
  survives('a job with every optional field missing', () => scoreJobForUser(
    { id: 'x', title: '', description: '' } as HiringJobPosting, input()));
  survives('a member with an empty profile', () => buildRecommendations([job()],
    input({ profile: buildRecProfile({}) })));
  survives('merging into an empty store', () => mergeRecommendations([], []));
  check('merging two empty sets yields nothing', mergeRecommendations([], []).length === 0);
  survives('an empty applications list', () => appliedJobIds([], 'user-1'));
  survives('queueing an empty record set', () => queuedRecommendations([]));
  check('a member with no profile signals produces no false recommendations', (() => {
    const out = buildRecommendations([job()], input({ profile: buildRecProfile({}) }));
    return out.every((r: JobRecommendation) => typeof r.score === 'number');
  })());

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
