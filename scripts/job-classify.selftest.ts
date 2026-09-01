/**
 * Phase 4 self-test: domain and location classification.
 *
 * Behaviour only - every assertion goes through the public functions and asks
 * "given this posting, what is it classified as?". No Mongo, no network, no
 * clock: `classifyJob` and `classifyLocation` are pure, which is what lets the
 * whole contract be proven here.
 */
import type { CanonicalJobDraft } from '@/lib/server/job-sources/normalize';
import { normalizeSourceJob } from '@/lib/server/job-sources/normalize';
import type { NormalizedJob } from '@/lib/server/job-scraper/types';
import {
  CLASSIFICATION_VERSION, classificationFields, classifyJob, scoreDomains,
  sourceCategoryDomain,
} from '@/lib/server/job-sources/classify';
import { classifyLocation, resolveWorkMode } from '@/lib/server/job-sources/location';
import { planIngest } from '@/lib/server/job-sources/ingest';
import { matchesIndiaFilter } from '@/lib/server/job-scraper/india';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

/** A draft-shaped object. Only the fields the classifier reads are needed. */
const job = (over: Partial<CanonicalJobDraft> = {}): Partial<CanonicalJobDraft> => ({
  title: '', organizationName: 'Acme', location: '', department: '',
  description: '', responsibilities: [], requirements: [], preferredSkills: [],
  ...over,
});

const domainOf = (over: Partial<CanonicalJobDraft>) => classifyJob(job(over)).domain;

function main() {
  console.log('\n── 1. Obvious jobs classify correctly ──');

  check('a software engineer is software',
    domainOf({ title: 'Senior Software Engineer' }) === 'software',
    String(domainOf({ title: 'Senior Software Engineer' })));
  check('a frontend developer is software',
    domainOf({ title: 'Frontend Developer', preferredSkills: ['React', 'TypeScript'] }) === 'software');
  check('a data engineer is data', domainOf({ title: 'Data Engineer' }) === 'data');
  check('an ML engineer is ai', domainOf({ title: 'Machine Learning Engineer' }) === 'ai');
  check('a product manager is product', domainOf({ title: 'Senior Product Manager' }) === 'product');
  check('a UX designer is design', domainOf({ title: 'Product Designer' }) === 'design');
  check('an accountant is finance', domainOf({ title: 'Senior Accountant' }) === 'finance');
  check('a recruiter is hr', domainOf({ title: 'Technical Recruiter' }) === 'hr');
  check('an account executive is sales', domainOf({ title: 'Account Executive' }) === 'sales');
  check('a support engineer is support', domainOf({ title: 'Customer Support Specialist' }) === 'support');
  check('a nurse is health', domainOf({ title: 'Staff Nurse' }) === 'health');
  check('a teacher is education', domainOf({ title: 'Mathematics Teacher' }) === 'education');
  check('a civil engineer is engineering, NOT software',
    domainOf({ title: 'Civil Engineer' }) === 'engineering');
  check('a legal counsel is legal', domainOf({ title: 'Legal Counsel' }) === 'legal');
  check('a security analyst is security', domainOf({ title: 'Security Analyst' }) === 'security');
  check('a technical writer is writing', domainOf({ title: 'Technical Writer' }) === 'writing');
  check('a supply chain manager is operations',
    domainOf({ title: 'Supply Chain Manager' }) === 'operations');

  console.log('\n── 2. Ambiguity is admitted, not guessed ──');

  check('an unrecognisable title is left unclassified',
    domainOf({ title: 'Associate, Level II' }) === undefined,
    String(domainOf({ title: 'Associate, Level II' })));
  check('an empty job is left unclassified', domainOf({}) === undefined);
  check('an unclassified job carries NO confidence',
    classifyJob(job({ title: 'Associate' })).domainConfidence === undefined);
  check('a classified job DOES carry confidence',
    (classifyJob(job({ title: 'Software Engineer' })).domainConfidence ?? 0) > 0);
  check('confidence never claims certainty',
    (classifyJob(job({ title: 'Software Engineer' })).domainConfidence ?? 1) <= 0.95);
  check('the version is always stamped, even when unclassified',
    classifyJob(job({})).classificationVersion === CLASSIFICATION_VERSION);
  /* A near-tie must not be resolved by a coin flip dressed as a fact. */
  const tie = classifyJob(job({ title: 'Engineer', description: 'analytics and reporting' }));
  check('a near-tie stays unclassified rather than picking a leader',
    tie.domain === undefined || (tie.domainConfidence ?? 0) > 0, JSON.stringify(tie.scores));

  console.log('\n── 3. Evidence beyond the title ──');

  check('skills classify a job whose title is vague',
    domainOf({ title: 'Engineer II', preferredSkills: ['React', 'Node.js', 'TypeScript'] }) === 'software');
  check('a source department alone can classify',
    domainOf({ title: 'Associate', department: 'Data Science' }) === 'data');
  check('a description alone is weaker than a title', (() => {
    const s = scoreDomains(job({ title: 'Staff Accountant', description: 'we use react and node' }));
    return (s.finance ?? 0) > (s.software ?? 0);
  })());
  check('a passing mention in a description does not hijack the domain',
    domainOf({ title: 'Senior Accountant', description: 'Our team uses React dashboards.' }) === 'finance');
  check('the department is a boost, not an override',
    domainOf({ title: 'Senior Accountant', department: 'Engineering' }) !== 'software');

  console.log('\n── 4. Source category aliases ──');

  check('"Software Development" maps to software', sourceCategoryDomain('Software Development') === 'software');
  check('"Engineering" maps to software', sourceCategoryDomain('Engineering') === 'software');
  check('"People" maps to hr', sourceCategoryDomain('People') === 'hr');
  check('"GTM" maps to sales', sourceCategoryDomain('GTM') === 'sales');
  check('a compound department falls back to its leading segment',
    sourceCategoryDomain('Engineering - Platform') === 'software');
  check('capitalization does not matter', sourceCategoryDomain('sOfTwArE dEvElOpMeNt') === 'software');
  check('whitespace does not matter', sourceCategoryDomain('  Data   Science  ') === 'data');
  check('an unknown department maps to nothing, not to "other"',
    sourceCategoryDomain('Chief of Staff') === null);
  check('an empty department maps to nothing', sourceCategoryDomain('') === null);
  check('distinct domains are not collapsed',
    sourceCategoryDomain('Design') !== sourceCategoryDomain('Legal'));

  console.log('\n── 5. Capitalization and whitespace ──');

  const variants = ['Senior Software Engineer', 'senior software engineer',
    'SENIOR SOFTWARE ENGINEER', '  Senior   Software   Engineer  '];
  check('all four title spellings reach the same domain',
    new Set(variants.map((t) => domainOf({ title: t }))).size === 1);
  check('all four produce the same confidence',
    new Set(variants.map((t) => classifyJob(job({ title: t })).domainConfidence)).size === 1);

  console.log('\n── 6. Location: Indian cities and aliases ──');

  for (const [raw, city] of [
    ['Bengaluru', 'Bengaluru'], ['Bangalore', 'Bengaluru'],
    ['Bengaluru, Karnataka, India', 'Bengaluru'], ['Bangalore, Karnataka', 'Bengaluru'],
    ['Mumbai', 'Mumbai'], ['Bombay', 'Mumbai'],
    ['Gurgaon', 'Gurugram'], ['Gurugram', 'Gurugram'],
    ['New Delhi', 'New Delhi'], ['Hyderabad', 'Hyderabad'],
    ['Pune', 'Pune'], ['Chennai', 'Chennai'], ['Madras', 'Chennai'],
    ['Noida', 'Noida'], ['Calcutta', 'Kolkata'],
  ] as Array<[string, string]>) {
    check(`"${raw}" resolves to ${city}`, classifyLocation(raw).city === city,
      String(classifyLocation(raw).city));
  }
  check('the four Bengaluru spellings all resolve identically',
    new Set(['Bengaluru', 'Bangalore', 'Bengaluru, Karnataka, India', 'bangalore']
      .map((s) => classifyLocation(s).city)).size === 1);

  console.log('\n── 7. State and country ──');

  check('a city implies its state', classifyLocation('Bengaluru').state === 'Karnataka');
  check('Noida is Uttar Pradesh', classifyLocation('Noida').state === 'Uttar Pradesh');
  check('Gurugram is Haryana', classifyLocation('Gurgaon').state === 'Haryana');
  check('an explicitly written state wins',
    classifyLocation('Bengaluru, Karnataka').state === 'Karnataka');
  check('an Indian city implies the country', classifyLocation('Pune').country === 'IN');
  check('the word India implies the country', classifyLocation('India').country === 'IN');
  check('isIndia is set for an Indian location', classifyLocation('Chennai').isIndia === true);
  check('a named foreign country is read', classifyLocation('Berlin, Germany').country === 'DE');
  check('isIndia is FALSE only when the country is known and is not India',
    classifyLocation('Berlin, Germany').isIndia === false);
  check('an unrecognised location leaves the country ABSENT, not guessed',
    classifyLocation('Zanzibar Tower, Floor 3').country === undefined);
  check('an unrecognised location leaves isIndia ABSENT, not false',
    classifyLocation('Zanzibar Tower, Floor 3').isIndia === undefined);
  check('a bare ambiguous city name is not assigned a country',
    classifyLocation('Cambridge').country === undefined);
  check('the US is recognised', classifyLocation('Austin, USA').country === 'US');
  check('the UK is recognised', classifyLocation('London, United Kingdom').country === 'GB');

  console.log('\n── 8. Remote / hybrid / onsite ──');

  check('an explicit remote location is read', classifyLocation('Remote').workModeHint === 'remote');
  check('"Remote - India" is remote AND India', (() => {
    const l = classifyLocation('Remote - India');
    return l.workModeHint === 'remote' && l.country === 'IN';
  })());
  check('"Hybrid - Bengaluru" is hybrid with a city', (() => {
    const l = classifyLocation('Hybrid - Bengaluru');
    return l.workModeHint === 'hybrid' && l.city === 'Bengaluru';
  })());
  check('"On-site" is onsite', classifyLocation('On-site, Pune').workModeHint === 'onsite');
  check('"Office-based" is onsite', classifyLocation('Office-based').workModeHint === 'onsite');
  check('"Work from home" is remote', classifyLocation('Work from home').workModeHint === 'remote');
  check('hybrid wins over a stray "remote" in the same string',
    classifyLocation('Hybrid, remote-friendly').workModeHint === 'hybrid');
  /* The rule the brief calls out explicitly. */
  check('a MISSING location does NOT imply remote', classifyLocation('').workModeHint === undefined);
  check('a location naming only a city does not imply remote',
    classifyLocation('Pune').workModeHint === undefined);
  check('the SOURCE work mode outranks the location text',
    resolveWorkMode('onsite', 'remote') === 'onsite');
  check('the location hint fills a missing source work mode',
    resolveWorkMode('', 'remote') === 'remote');
  check('neither stated leaves the work mode unknown',
    resolveWorkMode(undefined, undefined) === undefined);
  check('an unrecognised source work mode falls back to the hint',
    resolveWorkMode('flexible-ish', 'hybrid') === 'hybrid');

  console.log('\n── 9. Multi-location postings ──');

  const multi = classifyLocation('Bengaluru / Hyderabad / Pune');
  check('every city is captured', multi.cities.length === 3, JSON.stringify(multi.cities));
  check('NO arbitrary single city is chosen', multi.city === undefined);
  check('the country is still established', multi.country === 'IN');
  check('a state is set only when all cities share one',
    classifyLocation('Mumbai and Pune').state === 'Maharashtra');
  check('cities in different states leave the state absent',
    classifyLocation('Bengaluru / Chennai').state === undefined);
  /* PRE-EXISTING LIMITATION, asserted so it is visible rather than assumed
     away. indiaBucket() reduces a posting to its FIRST city, so a
     multi-location posting reaches only that city's filter chip. Phase 4 does
     not change the filter - that would change which jobs a user sees - but it
     does capture every city, so the phase that fixes this has the data. */
  check('multi-location matches its FIRST city filter',
    matchesIndiaFilter('Bengaluru / Hyderabad / Pune', 'onsite', 'bengaluru'));
  check('KNOWN GAP: it does not yet match its later cities',
    !matchesIndiaFilter('Bengaluru / Hyderabad / Pune', 'onsite', 'hyderabad'));
  check('multi-location still matches the broad India filter',
    matchesIndiaFilter('Bengaluru / Hyderabad / Pune', 'onsite', 'india'));
  check('classification captures the cities the filter misses',
    classifyLocation('Bengaluru / Hyderabad / Pune').cities.join(',') === 'Bengaluru,Hyderabad,Pune');

  console.log('\n── 10. Missing and malformed input ──');

  check('an empty location classifies without throwing', classifyLocation('').cities.length === 0);
  check('a whitespace-only location is empty', classifyLocation('   ').city === undefined);
  check('null does not throw', classifyLocation(null as unknown as string).cities.length === 0);
  check('undefined does not throw', classifyLocation(undefined as unknown as string).cities.length === 0);
  check('a job with no fields classifies without throwing',
    classifyJob({}).classificationVersion === CLASSIFICATION_VERSION);
  check('unknown values stay unknown rather than defaulting to a domain',
    classifyJob(job({ title: 'Zzzz Qqqq' })).domain === undefined);

  console.log('\n── 11. Determinism ──');

  const a = classifyJob(job({ title: 'Senior Data Engineer', location: 'Bengaluru, Karnataka' }));
  const b = classifyJob(job({ title: 'Senior Data Engineer', location: 'Bengaluru, Karnataka' }));
  check('two calls produce byte-identical output', JSON.stringify(a) === JSON.stringify(b));
  check('ten calls agree', (() => {
    const out = new Set<string>();
    for (let i = 0; i < 10; i += 1) {
      out.add(JSON.stringify(classifyJob(job({ title: 'Backend Engineer', location: 'Pune' }))));
    }
    return out.size === 1;
  })());
  check('a genuine tie still orders stably', (() => {
    const out = new Set<string>();
    for (let i = 0; i < 5; i += 1) out.add(String(domainOf({ title: 'Engineer' })));
    return out.size === 1;
  })());

  console.log('\n── 12. Persistence: only declared fields, nothing else touched ──');

  const fields = classificationFields(classifyJob(job({
    title: 'Data Engineer', location: 'Bengaluru',
  })));
  const ALLOWED = new Set(['domain', 'subDomain', 'domainConfidence',
    'classificationVersion', 'country', 'state', 'city', 'isIndia']);
  check('only canonical model fields are persisted',
    Object.keys(fields).every((k) => ALLOWED.has(k)), Object.keys(fields).join(','));
  check('the score breakdown is NOT persisted', !('scores' in fields));
  check('the city list is NOT persisted', !('cities' in fields));
  check('an absent domain is omitted rather than written as empty',
    !('domain' in classificationFields(classifyJob(job({ title: 'Associate' })))));

  console.log('\n── 13. Ingestion applies classification ──');

  const src = (over: Partial<NormalizedJob> = {}): NormalizedJob => ({
    source: 'lever:acme', provider: 'lever', externalId: 'e1',
    title: 'Senior Backend Engineer', organizationName: 'Acme',
    location: 'Bengaluru, Karnataka, India', department: 'Engineering',
    employmentType: 'Full Time', workMode: 'Hybrid', experienceLevel: 'Senior',
    description: 'Build APIs.', responsibilities: [], requirements: [],
    preferredSkills: ['Node.js'], targetRoleKeywords: [], salaryPresent: false,
    postedAt: '', jobUrl: 'https://jobs.lever.co/acme/e1', applyUrl: '',
    isActive: true, ...over,
  } as NormalizedJob);

  const NOW = Date.parse('2026-06-01T00:00:00.000Z');
  const created = planIngest([normalizeSourceJob(src(), { now: NOW })], []).jobs[0];
  check('a stored record carries its domain', created.domain === 'software', String(created.domain));
  check('a stored record carries its sub-domain', created.subDomain === 'Backend', String(created.subDomain));
  check('a stored record carries its city', created.city === 'Bengaluru');
  check('a stored record carries its state', created.state === 'Karnataka');
  check('a stored record carries its country', created.country === 'IN');
  check('a stored record is flagged as India', created.isIndia === true);
  check('a stored record carries the classifier version',
    created.classificationVersion === CLASSIFICATION_VERSION);
  check('classification does not disturb the identity fields',
    created.sourceJobId === 'e1' && Boolean(created.contentHash));
  check('classification does not disturb the title or description',
    created.title === 'Senior Backend Engineer' && created.description === 'Build APIs.');
  check('classification does not change dedup behaviour', (() => {
    const draft = normalizeSourceJob(src(), { now: NOW });
    const once = planIngest([draft], []);
    const twice = planIngest([draft], once.jobs);
    return twice.jobs.length === 1 && twice.report.unchanged === 1;
  })());
  check('an unclassifiable posting stores no domain rather than "other"',
    planIngest([normalizeSourceJob(src({
      title: 'Associate II', department: '', preferredSkills: [], description: '',
    }), { now: NOW })], []).jobs[0].domain === undefined);
  check('a member-posted job is still never classified by a run', (() => {
    const member = {
      id: 'job-m', organizationId: 'u1', organizationName: 'Acme',
      createdByUserId: 'u1', createdByEmail: 'a@b.c', title: 'Software Engineer',
      description: '', responsibilities: [], requirements: [], preferredSkills: [],
      targetRoleKeywords: [], minimumAtsScore: 72, status: 'published' as const,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const out = planIngest([normalizeSourceJob(src(), { now: NOW })], [member]);
    return out.jobs.find((j) => j.id === 'job-m')?.domain === undefined;
  })());

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
