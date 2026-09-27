/**
 * Turning a profile into form answers.
 *
 * Run: npx tsx scripts/apply-answers.selftest.ts
 *
 * The property under test is mostly a negative one: that an answer which cannot
 * be derived from something the member actually entered comes back ABSENT. It
 * is worth testing hard because the failure is silent and it is not ours to
 * make — a guessed work authorisation or an inferred salary is a claim sent to
 * an employer over somebody else's name.
 */

import { buildAnswerSet, splitName, splitLocation, pickResume, missingForApply } from '../lib/server/apply-answers';

let pass = 0; let fail = 0;
const failures: string[] = [];
function check(name: string, got: unknown, want: unknown) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass += 1; return; }
  fail += 1;
  failures.push(`  ✗ ${name}\n      expected ${JSON.stringify(want)}\n      got      ${JSON.stringify(got)}`);
}

/* ══ Names ══ */
check('two parts', splitName('Aditi Rao'), { first: 'Aditi', last: 'Rao' });
check('three parts — the last is the surname', splitName('Aditi Lakshmi Rao'), { first: 'Aditi Lakshmi', last: 'Rao' });
check('one part has no surname', splitName('Prince'), { first: 'Prince', last: '' });
check('extra whitespace', splitName('  Aditi   Rao '), { first: 'Aditi', last: 'Rao' });
check('empty', splitName(''), { first: '', last: '' });

/* ══ Location ══ */
check('city only', splitLocation('Bengaluru'), { city: 'Bengaluru' });
check('city, country', splitLocation('Bengaluru, India'), { city: 'Bengaluru', country: 'India' });
check('city, state, country', splitLocation('Bengaluru, Karnataka, India'),
  { city: 'Bengaluru', state: 'Karnataka', country: 'India' });
check('nothing', splitLocation(undefined), {});

/* ══ The résumé is the newest one with a file ══ */
check('newest résumé wins', pickResume({
  resumeFiles: [
    { fileName: 'old.pdf', url: '/a.pdf', updatedAt: '2024-01-01T00:00:00Z' },
    { fileName: 'new.pdf', url: '/b.pdf', updatedAt: '2026-01-01T00:00:00Z' },
  ],
})?.fileName, 'new.pdf');
check('a résumé row with no file is not a résumé', pickResume({
  resumeFiles: [{ fileName: 'ghost.pdf' }],
}), undefined);
check('no résumés', pickResume({}), undefined);

/* ══ The full translation ══ */
const full = buildAnswerSet({
  name: 'Aditi Rao',
  email: 'aditi@example.com',
  phone: '+91 98200 12345',
  headline: 'Frontend engineer',
  location: 'Bengaluru, Karnataka, India',
  website: 'aditi.dev',
  socialLinks: { linkedin: 'https://linkedin.com/in/aditirao', github: 'github.com/aditi' },
  experience: [{ title: 'Senior Engineer', company: 'Arclight Systems' }],
  education: [{ school: 'IIT Madras', degree: 'B.Tech', field: 'Computer Science', year: '2018' }],
  resumeFiles: [{ fileName: 'CV.pdf', url: '/r.pdf', mimeType: 'application/pdf', updatedAt: '2026-01-01T00:00:00Z' }],
  matchPreferences: { experienceYears: 6, availability: 'within_30_days', relocation: 'yes' },
});

check('full name', full.fullName, 'Aditi Rao');
check('first name', full.firstName, 'Aditi');
check('last name', full.lastName, 'Rao');
check('email', full.email, 'aditi@example.com');
check('city from a three-part location', full.city, 'Bengaluru');
check('country from a three-part location', full.country, 'India');
check('a bare domain becomes a URL', full.website, 'https://aditi.dev');
check('github normalised', full.github, 'https://github.com/aditi');
check('current title from the newest role', full.currentTitle, 'Senior Engineer');
check('current company', full.currentCompany, 'Arclight Systems');
check('years come from what was stated', full.yearsExperience, '6');
check('notice period from availability', full.noticePeriod, '30 days');
check('relocation', full.willRelocate, 'Yes');
check('school', full.school, 'IIT Madras');
check('résumé attached', full.resume?.fileName, 'CV.pdf');

/* ══ Nothing is invented ══ */
check('no work authorisation is asserted', full.workAuthorization, undefined);
check('no sponsorship answer is asserted', full.requiresSponsorship, undefined);
check('no salary is invented', full.salaryExpectation, undefined);

const sparse = buildAnswerSet({ name: 'Sam' });
check('an empty profile yields almost nothing', Object.keys(sparse).sort(),
  ['firstName', 'fullName', 'howDidYouHear']);
check('a missing surname is absent, not empty', 'lastName' in sparse, false);
check('years are absent rather than zero', sparse.yearsExperience, undefined);

/* Years are never inferred from an experience list — the periods are free text
   and a wrong number in "total years of experience" is a lie with a decimal
   point on it. */
const noYears = buildAnswerSet({
  name: 'Sam Patel',
  experience: [{ title: 'Engineer', company: 'A', period: '2019 – present' }],
});
check('years are not guessed from a period', noYears.yearsExperience, undefined);

/* "Not looking" is a real answer meaning blank, and must not become the string
   "not_looking" in an employer's notice-period box. */
const notLooking = buildAnswerSet({ name: 'Sam', matchPreferences: { availability: 'not_looking' } });
check('not_looking leaves the notice period blank', notLooking.noticePeriod, undefined);

/* ══ What to ask the member for ══ */
check('gaps are named, not counted', missingForApply(sparse),
  ['an email address', 'a phone number', 'where you are based', 'your LinkedIn', 'a résumé to attach']);
check('a complete profile has no gaps', missingForApply(full), []);

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) { console.log('\n' + failures.join('\n')); process.exit(1); }
console.log('Profile → answers OK.\n');
