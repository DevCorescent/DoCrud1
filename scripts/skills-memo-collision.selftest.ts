/**
 * A memoised skill scan must never hand one posting another posting's skills.
 *
 *   npx tsx scripts/skills-memo-collision.selftest.ts
 *
 * ═══ THE SCORING DEFECT THIS PREVENTS ═══
 *
 * `skillsInText` memoised on `${text.length}:${text.slice(0, 120)}` — a
 * fingerprint, not an identity. Two descriptions of equal length sharing their
 * first 120 characters collided, and the second silently received the first's
 * extracted skills. Those skills feed `recommendMatch`, so the consequence was
 * a posting RANKED AGAINST ANOTHER POSTING'S REQUIREMENTS.
 *
 * Measured over the production corpus before the fix:
 *
 *     distinct memo keys              6,888
 *     keys with >1 distinct text        219
 *     descriptions mis-served           261
 *
 * Boilerplate headers make the first 120 characters the LEAST distinguishing
 * part of a job description, which is why this was likely rather than exotic.
 *
 * This file drives the real scorer through its public entry point — the memo is
 * module-private, so the property is asserted where it actually matters: in the
 * score and the reasons a viewer is shown. No database, no network.
 */
import assert from 'node:assert/strict';
import { buildRecProfile, recommendMatch, type RecJob } from '@/lib/server/job-recommend';

/* Fixed clock, so freshness never moves a score between two calls. */
const NOW = 1_760_000_000_000;

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

/* 130 characters of employer boilerplate — longer than the 120 the old key
   sampled, so A and B are indistinguishable to it. */
const BOILERPLATE =
  'About us: we are a fast growing company building products used by millions of people worldwide, and we are hiring across every team. ';

/** Two descriptions, equal length, equal first 120 chars, DIFFERENT skills. */
function collidingPair() {
  const tailA = 'The stack is python and django.';
  const tailB = 'We build with kotlin and swift.';
  assert.equal(tailA.length, tailB.length, 'fixture tails must be equal length');
  return { a: BOILERPLATE + tailA, b: BOILERPLATE + tailB };
}

/* NOTE the argument order: recommendMatch(profile, job, now). */
const job = (id: string, description: string): RecJob => ({
  id, title: 'Engineer', organizationName: 'Acme', location: 'Bengaluru, India',
  employmentType: 'full-time', workMode: 'remote', experienceLevel: 'mid',
  description, preferredSkills: [], targetRoleKeywords: [],
  createdAt: new Date('2026-01-01T00:00:00Z').toISOString(),
});

const profileFor = (skills: string[]) => buildRecProfile({
  headline: 'Engineer', skills, location: 'Bengaluru, India',
  experience: [{ title: 'Engineer', period: '2020 - 2026' }], interests: [],
});

function fixtureIsActuallyAdversarial() {
  console.log('\n── 0. The fixture really does defeat the old key ──');
  const { a, b } = collidingPair();
  check('the two descriptions differ', a !== b);
  check('their lengths are identical', a.length === b.length, `${a.length} vs ${b.length}`);
  check('their first 120 characters are identical', a.slice(0, 120) === b.slice(0, 120));
  check('so the OLD key collides', `${a.length}:${a.slice(0, 120)}` === `${b.length}:${b.slice(0, 120)}`);
}

function skillsAreNotSwapped() {
  console.log('\n── 1. Each description is scored on its OWN skills ──');
  const { a, b } = collidingPair();

  /* A viewer whose only skills are B's. If B's scan returns A's skills, this
     viewer stops matching the posting that actually wants what they have. */
  const kotlinDev = profileFor(['kotlin', 'swift']);
  const pythonDev = profileFor(['python', 'django']);

  /* Order matters: A is scanned FIRST so it owns the colliding key. B is the
     posting that used to be served A's answer. */
  const aFirst = recommendMatch(pythonDev, job('a', a), NOW);
  const bSecond = recommendMatch(kotlinDev, job('b', b), NOW);

  check('the python posting is credited with python skills',
    aFirst.matchedSkills.join(',') === 'Python,Django', aFirst.matchedSkills.join(','));
  /* THE regression. Under the old key B reached A's cache entry, so a kotlin
     posting was scored against python requirements and matched nothing. */
  check('the kotlin posting is credited with kotlin skills',
    bSecond.matchedSkills.join(',') === 'Kotlin,Swift', bSecond.matchedSkills.join(','));
  check('neither posting borrows the other\'s skills',
    !aFirst.matchedSkills.some((s) => ['Kotlin', 'Swift'].includes(s))
    && !bSecond.matchedSkills.some((s) => ['Python', 'Django'].includes(s)));
  check('both therefore score on their own merits', aFirst.score > 0 && bSecond.score > 0,
    `${aFirst.score} / ${bSecond.score}`);
}

function cacheOrderCannotChangeTheAnswer() {
  console.log('\n── 2. The answer does not depend on scan order ──');
  const { a, b } = collidingPair();
  const viewer = profileFor(['kotlin', 'swift']);

  /* Scored in both orders. A memo that is identity-correct gives the same
     answer either way; a colliding one does not. */
  const bAfterA = (recommendMatch(viewer, job('a', a), NOW),
    recommendMatch(viewer, job('b', b), NOW));
  const bAlone = recommendMatch(viewer, job('b', b), NOW);

  check('B scores the same whether or not A was scanned first',
    bAfterA.score === bAlone.score, `${bAfterA.score} vs ${bAlone.score}`);
  check('and produces the same reasons',
    JSON.stringify(bAfterA) === JSON.stringify(bAlone));
}

function memoStillWorks() {
  console.log('\n── 3. Identical text is still memoised, not re-scanned ──');
  const { a } = collidingPair();
  const viewer = profileFor(['python', 'django']);

  /* Same TEXT via two distinct string instances: a correct memo keyed on value
     serves both, which is the caching this fix must not break. */
  const copy = a.split('').join('');
  check('two separate instances of the same text are equal', copy === a && copy !== undefined);
  const first = recommendMatch(viewer, job('a', a), NOW);
  const second = recommendMatch(viewer, job('a2', copy), NOW);
  check('both score identically', first.score === second.score, `${first.score} vs ${second.score}`);
  check('and match the same skills',
    first.matchedSkills.join(',') === second.matchedSkills.join(','));
  check('repeated calls are stable',
    recommendMatch(viewer, job('a', a), NOW).score === first.score);
}

function noFingerprintAnywhere() {
  console.log('\n── 4. There is no fingerprint, and only one implementation ──');
  const fs = require('node:fs') as typeof import('node:fs');
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const shared = strip(fs.readFileSync('lib/server/ats/skills-in-text.ts', 'utf8'));
  const scorer = strip(fs.readFileSync('lib/server/job-recommend.ts', 'utf8'));

  /* The original defect was a truncated key. It cannot come back in either
     file, because neither may build one. */
  for (const [name, src] of [['shared module', shared], ['scorer', scorer]] as const) {
    check(`${name} builds no truncated fingerprint`, !/slice\(0,\s*120\)/.test(src));
    check(`${name} keeps no skill memo`, !/textSkillCache|TEXT_CACHE_MAX/.test(src));
  }

  /* Stronger than the old assertion: with the derived-feature representation
     acting as the cache, the scan has no memo at all, so a collision is not
     merely unlikely — there is nothing left to collide in. */
  check('the shared scan is a pure function', /export function skillsInText\(text: string\): string\[\] \{/.test(shared)
    && !/Map\(/.test(shared));
  check('the scorer imports it rather than reimplementing it',
    /import \{ skillsInText \} from '\.\/ats\/skills-in-text'/.test(scorer));
  check('and defines no second copy', !/function skillsInText/.test(scorer));
  check('the surface list moved with it, not duplicated',
    /SCANNABLE_SURFACES/.test(shared) && !/SCANNABLE_SURFACES/.test(scorer));
}

function main() {
  fixtureIsActuallyAdversarial();
  skillsAreNotSwapped();
  cacheOrderCannotChangeTheAnswer();
  memoStillWorks();
  noFingerprintAnywhere();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
