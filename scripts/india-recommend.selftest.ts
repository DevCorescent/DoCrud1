/**
 * Self-test for the India-focused discovery + recommendation layer.
 *
 * Pure, deterministic assertions over the isolated modules — no network, no DB,
 * no env leakage between cases. Run with:  npx tsx scripts/india-recommend.selftest.ts
 *
 * Covers: India normalization/filtering, source allowlist + invalid rejection,
 * Greenhouse normalization, dedup/idempotency, recommendation scoring
 * (skill/title/location/work-mode/experience), determinism, no-profile / empty
 * fallback, and "no invented data".
 */
import assert from 'node:assert/strict';

import {
  isIndiaRelevant, indiaCity, normalizeIndiaLocation, indiaBucket, matchesIndiaFilter,
} from '../lib/server/job-scraper/india';
import { normalizeGreenhouse } from '../lib/server/job-scraper/providers/greenhouse';
import { scoreJob } from '../lib/server/job-scraper/score';
import { jobFingerprint } from '../lib/server/job-import';
import { allSources } from '../lib/server/job-scraper/sources';
import type { NormalizedJob, ScrapeSource } from '../lib/server/job-scraper/types';
import {
  buildRecProfile, hasProfileSignals, recommendMatch, deriveExperienceLevel, type RecJob,
} from '../lib/server/job-recommend';
import { jobSourceLabel, formatJobLocation, isValidApplyUrl } from '../lib/jobs-ui';

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { console.error(`  ✗ ${name}\n    ${(err as Error).message}`); process.exitCode = 1; }
}

// ── India location normalization / filtering ────────────────────────────────
test('isIndiaRelevant recognizes cities, aliases and the word India', () => {
  assert.equal(isIndiaRelevant('Bengaluru, India'), true);
  assert.equal(isIndiaRelevant('Bangalore'), true);      // alias
  assert.equal(isIndiaRelevant('Gurgaon'), true);        // alias
  assert.equal(isIndiaRelevant('Remote - India'), true);
  assert.equal(isIndiaRelevant('Berlin, Germany'), false);
  assert.equal(isIndiaRelevant(''), false);
  assert.equal(isIndiaRelevant('Indiana, USA'), false);  // must not false-match "India"
});

test('normalizeIndiaLocation canonicalizes without inventing data', () => {
  assert.equal(normalizeIndiaLocation('bangalore'), 'Bengaluru');
  assert.equal(normalizeIndiaLocation('Gurgaon'), 'Gurugram');
  assert.equal(indiaCity('Bombay'), 'Mumbai');
  assert.equal(normalizeIndiaLocation('London'), 'London');   // untouched, not fabricated
  assert.equal(normalizeIndiaLocation(''), '');
});

test('indiaBucket + matchesIndiaFilter route locations correctly', () => {
  assert.equal(indiaBucket('Bengaluru, India'), 'bengaluru');
  assert.equal(indiaBucket('Noida'), 'delhi-ncr');
  assert.equal(indiaBucket('Remote - India'), 'remote-india');
  assert.equal(indiaBucket('Paris'), '');

  assert.equal(matchesIndiaFilter('Pune', 'onsite', 'pune'), true);
  assert.equal(matchesIndiaFilter('Pune', 'onsite', 'mumbai'), false);
  assert.equal(matchesIndiaFilter('Hyderabad, India', undefined, 'india'), true);
  assert.equal(matchesIndiaFilter('Remote, India', 'remote', 'remote-india'), true);
  assert.equal(matchesIndiaFilter('Berlin', undefined, 'india'), false);
  assert.equal(matchesIndiaFilter('anywhere', undefined, ''), true); // empty filter = pass-through
});

// ── Source allowlist + invalid-source rejection ─────────────────────────────
test('registry builds only allowlisted provider hosts and rejects junk slugs', () => {
  const prev = { g: process.env.GREENHOUSE_BOARDS, l: process.env.LEVER_COMPANIES, a: process.env.ASHBY_JOB_BOARDS, e: process.env.JOB_SCRAPER_ENABLED };
  process.env.JOB_SCRAPER_ENABLED = 'true';
  process.env.ASHBY_JOB_BOARDS = 'razorpay|Razorpay|IN';
  process.env.LEVER_COMPANIES = 'https://evil.com/steal, ok-company';   // first is invalid → dropped
  process.env.GREENHOUSE_BOARDS = 'zerodha';
  const sources = allSources();
  const hosts = new Set(sources.map((s) => s.host));
  // only the three fixed provider hosts are ever produced — never a browser-supplied host
  assert.deepEqual(Array.from(hosts).sort(), ['api.ashbyhq.com', 'api.lever.co', 'boards-api.greenhouse.io']);
  // the malformed lever entry was rejected; the clean one survived
  assert.equal(sources.some((s) => s.name === 'lever:ok-company'), true);
  assert.equal(sources.some((s) => /evil/.test(s.name)), false);
  assert.equal(sources.find((s) => s.provider === 'ashby')?.country, 'IN');
  Object.assign(process.env, { GREENHOUSE_BOARDS: prev.g, LEVER_COMPANIES: prev.l, ASHBY_JOB_BOARDS: prev.a, JOB_SCRAPER_ENABLED: prev.e });
});

// ── Greenhouse normalization (no invented fields) ───────────────────────────
test('normalizeGreenhouse maps only real fields', () => {
  const source = { name: 'greenhouse:zerodha', label: 'Zerodha', provider: 'greenhouse', board: 'zerodha', host: 'boards-api.greenhouse.io', enabled: true } as ScrapeSource;
  const raw = { jobs: [{
    id: 42, title: 'Backend Engineer',
    location: { name: 'Bangalore, India' },
    departments: [{ name: 'Engineering' }],
    content: 'Build APIs.', updated_at: '2026-08-01T00:00:00Z',
    absolute_url: 'https://boards.greenhouse.io/zerodha/jobs/42',
  }] };
  const [j] = normalizeGreenhouse(source, raw);
  assert.equal(j.title, 'Backend Engineer');
  assert.equal(j.organizationName, 'Zerodha');
  assert.equal(j.location, 'Bengaluru');           // canonicalized
  assert.equal(j.employmentType, '');              // GH exposes none — left blank, not guessed
  assert.equal(j.salaryPresent, false);
  assert.equal(j.applyUrl, 'https://boards.greenhouse.io/zerodha/jobs/42');
  assert.equal(j.isActive, true);
  assert.deepEqual(normalizeGreenhouse(source, { jobs: [] }), []);
  assert.deepEqual(normalizeGreenhouse(source, null), []);
});

// ── Dedup / idempotency ─────────────────────────────────────────────────────
test('jobFingerprint is stable and case/location-normalized', () => {
  const a = jobFingerprint('Zerodha', 'Backend Engineer', 'Bengaluru');
  const b = jobFingerprint('  zerodha ', 'backend engineer', 'bengaluru');
  assert.equal(a, b);                              // idempotent across runs / casing
  assert.notEqual(a, jobFingerprint('Zerodha', 'Frontend Engineer', 'Bengaluru'));
});

// ── Deterministic quality score ─────────────────────────────────────────────
test('scoreJob is deterministic and clamped, India adds a real bonus', () => {
  const base: NormalizedJob = {
    source: 's', provider: 'greenhouse', externalId: '1', title: 'Senior Software Engineer',
    organizationName: 'Acme', location: 'Bengaluru, India', department: 'Eng',
    employmentType: 'Full-time', workMode: 'onsite', experienceLevel: 'senior',
    description: 'x'.repeat(250), responsibilities: [], requirements: [], preferredSkills: ['react'],
    targetRoleKeywords: [], salaryPresent: false, postedAt: '2026-08-20T00:00:00Z',
    jobUrl: 'https://x.co/1', applyUrl: 'https://x.co/1', isActive: true,
  };
  const now = Date.parse('2026-08-26T00:00:00Z');
  const s1 = scoreJob(base, now);                  // < 100, so the India delta is observable
  const s2 = scoreJob(base, now);
  assert.equal(s1, s2);                            // deterministic
  assert.ok(s1 <= 100);                            // clamped
  const nonIndia = scoreJob({ ...base, location: 'Berlin' }, now);
  assert.equal(s1 - nonIndia, 10);                 // India location = +10, nothing else
});

// ── Experience level derivation ─────────────────────────────────────────────
test('deriveExperienceLevel reads titles then falls back to count', () => {
  assert.equal(deriveExperienceLevel([{ title: 'Lead Engineer' }]), 'lead');
  assert.equal(deriveExperienceLevel([{ title: 'Senior Dev' }]), 'senior');
  assert.equal(deriveExperienceLevel([{ title: 'Engineer' }, { title: 'Engineer' }, { title: 'Engineer' }]), 'senior');
  assert.equal(deriveExperienceLevel([{ title: 'Engineer' }]), 'associate');
  assert.equal(deriveExperienceLevel([]), '');
});

// ── Recommendation scoring ──────────────────────────────────────────────────
const NOW = Date.parse('2026-08-26T00:00:00Z');
const job: RecJob = {
  id: 'j1', title: 'Frontend Engineer', organizationName: 'Acme', location: 'Bengaluru, India',
  employmentType: 'full_time', workMode: 'remote', experienceLevel: 'senior',
  description: 'React and TypeScript role. '.repeat(20),
  preferredSkills: ['react', 'typescript'], targetRoleKeywords: ['frontend'], createdAt: '2026-08-20T00:00:00Z',
};

test('recommendMatch rewards skill/title/location/work-mode/experience overlap', () => {
  const profile = buildRecProfile({
    headline: 'Frontend Engineer', skills: ['React', 'TypeScript'],
    location: 'Bengaluru', experience: [{ title: 'Senior Frontend Engineer' }, { title: 'Frontend Engineer' }, { title: 'Web Developer' }],
    interests: [],
  });
  const m = recommendMatch(profile, job, NOW);
  assert.ok(m.score >= 80, `expected strong match, got ${m.score}`);
  assert.ok(m.reasons.some((r) => /skill/i.test(r)));
  assert.ok(m.reasons.some((r) => /role/i.test(r)));
  assert.ok(m.reasons.some((r) => /location/i.test(r)));
});

test('recommendMatch is deterministic and never claims qualification', () => {
  const profile = buildRecProfile({ skills: ['react'], headline: 'Frontend Engineer' });
  const a = recommendMatch(profile, job, NOW);
  const b = recommendMatch(profile, job, NOW);
  assert.equal(a.score, b.score);
  assert.ok(a.score >= 0 && a.score <= 100);
  // reasons describe the match, never assert the user is "qualified"
  assert.equal(a.reasons.some((r) => /qualified/i.test(r)), false);
});

test('a mismatched profile scores low', () => {
  const profile = buildRecProfile({ skills: ['welding', 'plumbing'], headline: 'Plumber', location: 'Berlin' });
  const m = recommendMatch(profile, job, NOW);
  assert.ok(m.score < 45, `expected weak match, got ${m.score}`);
});

// ── No-profile / empty-profile fallback ─────────────────────────────────────
test('empty profile has no signals and yields a zeroed skill/role match', () => {
  const empty = buildRecProfile({});
  assert.equal(hasProfileSignals(empty), false);
  const m = recommendMatch(empty, job, NOW);
  // no profile skills/role → those buckets contribute 0; only work-mode/recency remain
  assert.ok(m.score <= 30, `expected low no-profile score, got ${m.score}`);
});

test('no invented data: a job with no skills/desc/date contributes nothing beyond what exists', () => {
  const bare: RecJob = { id: 'b', title: 'Frontend Engineer', createdAt: '', description: '', preferredSkills: [], targetRoleKeywords: [] };
  const profile = buildRecProfile({ skills: ['react'], headline: 'Designer', location: 'Bengaluru' });
  const m = recommendMatch(profile, bare, NOW);
  assert.ok(m.score >= 0 && m.score <= 100);
  assert.equal(m.reasons.some((r) => /location/i.test(r)), false);   // job has no location → no location reason invented
});

// ── Jobs UI helpers (card source attribution, India location, apply URL) ────
test('jobSourceLabel derives the real ATS from the apply URL host', () => {
  assert.equal(jobSourceLabel('https://jobs.ashbyhq.com/atlan/abc/application'), 'Ashby');
  assert.equal(jobSourceLabel('https://jobs.lever.co/mindtickle/xyz'), 'Lever');
  assert.equal(jobSourceLabel('https://job-boards.greenhouse.io/postman/jobs/123'), 'Greenhouse');
  assert.equal(jobSourceLabel('https://careers.acme.com/apply/9'), 'Acme');   // unknown host → domain
  assert.equal(jobSourceLabel(''), '');
  assert.equal(jobSourceLabel('not-a-url'), '');
});

test('isValidApplyUrl only accepts http(s) URLs', () => {
  assert.equal(isValidApplyUrl('https://jobs.lever.co/x'), true);
  assert.equal(isValidApplyUrl('http://x.co/y'), true);
  assert.equal(isValidApplyUrl(''), false);
  assert.equal(isValidApplyUrl('javascript:alert(1)'), false);
  assert.equal(isValidApplyUrl('/jobs/123'), false);
});

test('formatJobLocation is India-aware and never fabricates India', () => {
  assert.equal(formatJobLocation('Bengaluru', 'hybrid'), 'Bengaluru · India · Hybrid');
  assert.equal(formatJobLocation('Bengaluru, Karnataka', 'remote'), 'Bengaluru · India · Remote');
  assert.equal(formatJobLocation('India', 'remote'), 'India · Remote');
  assert.equal(formatJobLocation('Remote, India', undefined), 'Remote, India');   // no duplicate "India"
  assert.equal(formatJobLocation('Remote, Canada', 'remote'), 'Remote, Canada');  // no duplicate "Remote"
  assert.equal(formatJobLocation('Remote, US', 'hybrid'), 'Remote, US · Hybrid'); // distinct mode still shown
  assert.equal(formatJobLocation('Berlin', 'onsite'), 'Berlin · On-site');        // global untouched
  assert.equal(formatJobLocation('', 'remote'), 'Remote');
  assert.equal(formatJobLocation('', ''), '');
});

console.log(`\n${passed} checks passed.`);
if (process.exitCode) console.error('\nSELF-TEST FAILED');
else console.log('SELF-TEST OK');
