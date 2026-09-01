/**
 * Phase 5 self-test: user eligibility.
 *
 * Behaviour only — every assertion asks "given this job and this user, is the
 * job gated?" through the public evaluator. No Mongo, no network, no clock:
 * `evaluateJobEligibility` is pure, which is what lets the whole gate be
 * proven here.
 *
 * The assertions that matter most are the NEGATIVE ones: that missing
 * information never becomes a rejection. Those are the failures nobody would
 * notice in production, because a wrongly hidden job leaves no trace.
 */
import type { HiringJobPosting } from '@/types/document';
import {
  ELIGIBILITY_RULES, buildEligibilityProfile, evaluateJobEligibility,
  type EligibilityProfile,
} from '@/lib/server/job-sources/eligibility';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

/** A job with nothing stated. Each test adds only the facts it is about. */
function job(over: Partial<HiringJobPosting> = {}): HiringJobPosting {
  return {
    id: 'job-1', organizationId: 'o1', organizationName: 'Acme',
    createdByUserId: 'u1', createdByEmail: 'a@b.c',
    title: 'Software Engineer', description: 'Build things.',
    responsibilities: [], requirements: [], preferredSkills: [],
    targetRoleKeywords: [], minimumAtsScore: 0, status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as HiringJobPosting;
}

const evalJob = (j: Partial<HiringJobPosting>, u: EligibilityProfile) =>
  evaluateJobEligibility(job(j), u);
const status = (j: Partial<HiringJobPosting>, u: EligibilityProfile) => evalJob(j, u).status;

function main() {
  console.log('\n── 1. Location ──');

  check('a user with no location requirement is never gated by location',
    status({ location: 'Berlin, Germany', country: 'DE' }, {}) === 'eligible');
  check('a matching city is eligible',
    status({ location: 'Bengaluru', city: 'Bengaluru', country: 'IN' },
      { cities: ['bengaluru'] }) === 'eligible');
  check('a different city in a required list is ineligible',
    evalJob({ location: 'Chennai', city: 'Chennai', country: 'IN' }, { cities: ['bengaluru'] })
      .reasons.includes('LOCATION_MISMATCH'));
  check('a different COUNTRY is ineligible',
    evalJob({ location: 'Berlin, Germany', country: 'DE' }, { countries: ['in'] })
      .reasons.includes('LOCATION_MISMATCH'));
  /* The core rule: silence is not a mismatch. */
  check('a job with NO location is unknown, not a mismatch',
    status({}, { cities: ['bengaluru'] }) === 'unknown');
  check('a job with no location produces NO reason at all',
    evalJob({}, { cities: ['bengaluru'] }).reasons.length === 0);
  check('an unrecognised location is unknown, not a mismatch',
    status({ location: 'Some Office Park, Floor 3' }, { cities: ['bengaluru'] }) === 'unknown');
  check('a city alias resolves through the shared vocabulary',
    status({ location: 'Bangalore, Karnataka, India' }, { cities: ['bengaluru'] }) === 'eligible');
  /* Multi-location must not be reduced to one arbitrary city. */
  check('a multi-location job matches ANY of its cities',
    status({ location: 'Bengaluru / Hyderabad / Pune' }, { cities: ['pune'] }) === 'eligible');
  check('a multi-location job none of which match is ineligible',
    status({ location: 'Bengaluru / Hyderabad' }, { cities: ['kolkata'] }) === 'ineligible');

  console.log('\n── 2. Remote and region eligibility ──');

  check('a remote job is not gated by a city requirement',
    status({ workMode: 'remote', location: 'Remote' },
      { cities: ['bengaluru'], workModes: ['remote'] }) === 'eligible');
  check('a remote job LIMITED to another region is ineligible',
    evalJob({ workMode: 'remote', remoteEligibleRegions: ['US'] },
      { countries: ['in'], workModes: ['remote'] }).reasons.includes('LOCATION_MISMATCH'));
  check('a remote job limited to the user’s own region is eligible',
    status({ workMode: 'remote', remoteEligibleRegions: ['IN'] },
      { countries: ['in'], workModes: ['remote'] }) === 'eligible');
  check('a remote job with NO stated region is not assumed closed',
    status({ workMode: 'remote' }, { countries: ['in'], workModes: ['remote'] }) === 'eligible');
  /* The explicit prohibition in the brief. */
  check('a job with no location is NEVER treated as remote',
    status({}, { workModes: ['remote'] }) === 'unknown');

  console.log('\n── 3. Work mode ──');

  check('a user with no work-mode preference is never gated',
    status({ workMode: 'onsite' }, {}) === 'eligible');
  check('remote user + onsite job is ineligible',
    evalJob({ workMode: 'onsite' }, { workModes: ['remote'] }).reasons.includes('WORK_MODE_MISMATCH'));
  check('onsite user + remote job is ineligible',
    evalJob({ workMode: 'remote' }, { workModes: ['onsite'] }).reasons.includes('WORK_MODE_MISMATCH'));
  check('hybrid preference matches a hybrid job',
    status({ workMode: 'hybrid' }, { workModes: ['hybrid'] }) === 'eligible');
  check('a user accepting several modes passes on any of them',
    status({ workMode: 'hybrid' }, { workModes: ['remote', 'hybrid'] }) === 'eligible');
  check('a job with no work mode is unknown, not a mismatch',
    status({}, { workModes: ['remote'] }) === 'unknown');
  check('an unrecognised work mode is unknown, not a mismatch',
    status({ workMode: 'flexible-ish' as never }, { workModes: ['remote'] }) === 'unknown');

  console.log('\n── 4. Employment type ──');

  check('no preference is never gated', status({ employmentType: 'contract' }, {}) === 'eligible');
  check('a matching type is eligible',
    status({ employmentType: 'full_time' }, { employmentTypes: ['full_time'] }) === 'eligible');
  check('an incompatible type is ineligible',
    evalJob({ employmentType: 'internship' }, { employmentTypes: ['full_time'] })
      .reasons.includes('EMPLOYMENT_TYPE_MISMATCH'));
  check('a job with no employment type is unknown',
    status({}, { employmentTypes: ['full_time'] }) === 'unknown');
  check('the canonical Phase 3 enum values are what is compared',
    status({ employmentType: 'part_time' }, { employmentTypes: ['part_time', 'contract'] }) === 'eligible');

  console.log('\n── 5. Experience ──');

  check('no user experience stated is never gated',
    status({ minExperienceYears: 10 }, {}) === 'eligible');
  check('sufficient experience is eligible',
    status({ minExperienceYears: 3 }, { experienceYears: 5 }) === 'eligible');
  check('exactly meeting the requirement is eligible',
    status({ minExperienceYears: 5 }, { experienceYears: 5 }) === 'eligible');
  check('insufficient experience is ineligible',
    evalJob({ minExperienceYears: 8 }, { experienceYears: 2 }).reasons.includes('EXPERIENCE_MISMATCH'));
  check('a job that states no requirement is unknown, not a rejection',
    status({}, { experienceYears: 2 }) === 'unknown');
  check('a zero-experience user is still gated only on stated requirements',
    status({}, { experienceYears: 0 }) === 'unknown');
  check('a fresher meeting a zero requirement is eligible',
    status({ minExperienceYears: 0 }, { experienceYears: 0 }) === 'eligible');
  /* The explicit prohibition: seniority words must not become a requirement. */
  check('a "Senior" job title alone NEVER creates an experience requirement',
    status({ title: 'Senior Staff Engineer', experienceLevel: 'lead' },
      { experienceYears: 1 }) === 'unknown');
  check('experienceLevel alone is not used as a hard gate',
    evalJob({ experienceLevel: 'lead' }, { experienceYears: 0 }).reasons.length === 0);

  console.log('\n── 6. Domain ──');

  check('no domain preference is never gated',
    status({ domain: 'finance', domainConfidence: 0.9 }, {}) === 'eligible');
  check('a matching domain is eligible',
    status({ domain: 'software', domainConfidence: 0.8 }, { domains: ['software'] }) === 'eligible');
  check('a conflicting domain is ineligible',
    evalJob({ domain: 'finance', domainConfidence: 0.8 }, { domains: ['software'] })
      .reasons.includes('DOMAIN_MISMATCH'));
  check('an unclassified job is unknown, not a mismatch',
    status({}, { domains: ['software'] }) === 'unknown');
  /* A classifier that is unsure must not close a door. */
  check('a LOW-confidence classification is unknown, not a mismatch',
    status({ domain: 'finance', domainConfidence: 0.2 }, { domains: ['software'] }) === 'unknown');
  check('a low-confidence classification produces no reason',
    evalJob({ domain: 'finance', domainConfidence: 0.2 }, { domains: ['software'] }).reasons.length === 0);
  check('a high-confidence match still passes',
    status({ domain: 'data', domainConfidence: 0.95 }, { domains: ['data', 'ai'] }) === 'eligible');

  console.log('\n── 7. Salary ──');

  /* `as const` so salaryPeriod keeps its literal type and matches the model's
     union — widening it to `string` would need a cast, and a cast here would
     be hiding a type error rather than satisfying one. */
  const pay = { salaryCurrency: 'INR', salaryPeriod: 'year' } as const;
  check('no user salary preference is never gated',
    status({ ...pay, salaryMin: 100, salaryMax: 200 }, {}) === 'eligible');
  check('a job paying at least the minimum is eligible',
    status({ ...pay, salaryMin: 800000, salaryMax: 1400000 },
      { minSalary: 1000000, ...pay }) === 'eligible');
  check('a job whose ceiling is below the minimum is ineligible',
    evalJob({ ...pay, salaryMin: 300000, salaryMax: 500000 }, { minSalary: 1000000, ...pay })
      .reasons.includes('SALARY_MISMATCH'));
  /* The brief's worked example. */
  check('a job with NO salary is unknown, never SALARY_MISMATCH',
    status({}, { minSalary: 1000000, ...pay }) === 'unknown');
  check('a job with no salary produces no reason',
    evalJob({}, { minSalary: 1000000, ...pay }).reasons.length === 0);
  check('a lone minimum is used when no maximum is stated',
    status({ ...pay, salaryMin: 1200000 }, { minSalary: 1000000, ...pay }) === 'eligible');
  /* Never guess a conversion. */
  check('a different CURRENCY is incomparable, not a mismatch',
    status({ salaryCurrency: 'USD', salaryPeriod: 'year', salaryMax: 50000 },
      { minSalary: 1000000, ...pay }) === 'unknown');
  check('a different PERIOD is incomparable, not a mismatch',
    status({ salaryCurrency: 'INR', salaryPeriod: 'month', salaryMax: 90000 },
      { minSalary: 1000000, ...pay }) === 'unknown');
  check('a zero salary on the job is treated as unstated',
    status({ ...pay, salaryMin: 0, salaryMax: 0 }, { minSalary: 1000000, ...pay }) === 'unknown');

  console.log('\n── 8. Multiple conflicts, and realistic combinations ──');

  const multi = evalJob(
    { workMode: 'onsite', location: 'Chennai', city: 'Chennai', country: 'IN',
      employmentType: 'internship', domain: 'finance', domainConfidence: 0.9 },
    { cities: ['bengaluru'], workModes: ['remote'], employmentTypes: ['full_time'],
      domains: ['software'] },
  );
  check('every applicable conflict is reported, not just the first',
    multi.reasons.length === 4, JSON.stringify(multi.reasons));
  check('the reasons are the expected four',
    ['LOCATION_MISMATCH', 'WORK_MODE_MISMATCH', 'EMPLOYMENT_TYPE_MISMATCH', 'DOMAIN_MISMATCH']
      .every((r) => multi.reasons.includes(r as never)));
  check('reason order is deterministic',
    JSON.stringify(multi.reasons) === JSON.stringify(evalJob(
      { workMode: 'onsite', location: 'Chennai', city: 'Chennai', country: 'IN',
        employmentType: 'internship', domain: 'finance', domainConfidence: 0.9 },
      { cities: ['bengaluru'], workModes: ['remote'], employmentTypes: ['full_time'],
        domains: ['software'] },
    ).reasons));

  /* One hard failure alongside several unknowns must still be ineligible: a
     proven conflict is not softened by uncertainty elsewhere. */
  const mixed = evalJob({ workMode: 'onsite' },
    { workModes: ['remote'], minSalary: 100, salaryCurrency: 'INR', salaryPeriod: 'year',
      employmentTypes: ['full_time'] });
  check('a proven conflict outranks unrelated unknowns', mixed.status === 'ineligible');
  check('the unknowns are still reported alongside it', mixed.unknownRules.length === 2);

  /* A realistic eligible case: a Bengaluru hybrid full-time software role for
     someone who wants exactly that. */
  const good = evalJob(
    { location: 'Bengaluru, Karnataka, India', city: 'Bengaluru', country: 'IN',
      workMode: 'hybrid', employmentType: 'full_time', domain: 'software',
      domainConfidence: 0.82, minExperienceYears: 3,
      salaryCurrency: 'INR', salaryPeriod: 'year', salaryMin: 1800000, salaryMax: 2600000 },
    { cities: ['bengaluru'], countries: ['in'], workModes: ['hybrid', 'remote'],
      employmentTypes: ['full_time'], domains: ['software'], experienceYears: 6,
      minSalary: 2000000, salaryCurrency: 'INR', salaryPeriod: 'year' },
  );
  check('a fully compatible job is eligible on every rule', good.status === 'eligible');
  check('all six rules were actually evaluated',
    good.evaluatedRules.length === ELIGIBILITY_RULES.length, JSON.stringify(good.evaluatedRules));
  check('nothing was left unknown in that case', good.unknownRules.length === 0);

  console.log('\n── 9. Missing profile information ──');

  const empty = evalJob({ location: 'Chennai', workMode: 'onsite', employmentType: 'contract' }, {});
  check('a user with NO requirements is eligible, not unknown', empty.status === 'eligible');
  check('and no rules were evaluated, because none applied', empty.evaluatedRules.length === 0);
  check('an empty job and an empty user is eligible', status({}, {}) === 'eligible');
  check('negative or nonsense user values do not gate',
    status({ minExperienceYears: 5 }, { experienceYears: -3 }) === 'eligible');
  check('an empty preference array is treated as no preference',
    status({ workMode: 'onsite' }, { workModes: [] }) === 'eligible');
  check('a preference list of blanks is treated as no preference',
    status({ workMode: 'onsite' }, { workModes: ['', '  '] as never }) === 'eligible');
  check('case does not matter on either side',
    status({ workMode: 'REMOTE' as never }, { workModes: ['remote'] }) === 'eligible');

  console.log('\n── 10. Determinism and purity ──');

  const j = job({ location: 'Bengaluru', workMode: 'onsite', domain: 'finance', domainConfidence: 0.9 });
  const u: EligibilityProfile = { cities: ['bengaluru'], workModes: ['remote'], domains: ['software'] };
  const first = JSON.stringify(evaluateJobEligibility(j, u));
  let stable = true;
  for (let i = 0; i < 20; i += 1) {
    if (JSON.stringify(evaluateJobEligibility(j, u)) !== first) stable = false;
  }
  check('twenty evaluations produce an identical result', stable);

  const jBefore = JSON.stringify(j);
  const uBefore = JSON.stringify(u);
  evaluateJobEligibility(j, u);
  check('the job object is not mutated', JSON.stringify(j) === jBefore);
  check('the user profile is not mutated', JSON.stringify(u) === uBefore);
  check('the result carries no score or percentage', (() => {
    const r = evaluateJobEligibility(j, u) as unknown as Record<string, unknown>;
    return !('score' in r) && !('match' in r) && !('percentage' in r) && !('rank' in r);
  })());

  console.log('\n── 11. Adapter over the EXISTING profile ──');

  const built = buildEligibilityProfile({ location: 'Bangalore', domain: 'software' });
  check('the profile location becomes a country requirement', built.countries?.[0] === 'IN');
  check('and a canonical city requirement', built.cities?.[0] === 'Bengaluru');
  check('the profile domain becomes a domain requirement', built.domains?.[0] === 'software');
  check('fields the profile does not store are left ABSENT, not invented',
    built.workModes === undefined && built.employmentTypes === undefined
    && built.minSalary === undefined && built.experienceYears === undefined);
  check('an empty profile yields no requirements at all',
    Object.keys(buildEligibilityProfile({})).length === 0);
  check('explicit preferences override what was read from free text',
    buildEligibilityProfile({ location: 'Bangalore', preferences: { cities: ['pune'] } })
      .cities?.[0] === 'pune');
  check('a profile with no location does not fabricate one',
    buildEligibilityProfile({ domain: 'design' }).cities === undefined);
  check('the adapter is pure — the input profile is unchanged', (() => {
    const p = { location: 'Bangalore', domain: 'software' };
    const before = JSON.stringify(p);
    buildEligibilityProfile(p);
    return JSON.stringify(p) === before;
  })());
  /* End to end through the adapter, which is how a caller will use it. */
  check('adapter output gates a foreign job for an India-based member',
    evalJob({ location: 'Berlin, Germany', country: 'DE' },
      buildEligibilityProfile({ location: 'Bengaluru' })).reasons.includes('LOCATION_MISMATCH'));
  check('adapter output does NOT gate a job with no location',
    status({}, buildEligibilityProfile({ location: 'Bengaluru' })) === 'unknown');

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
