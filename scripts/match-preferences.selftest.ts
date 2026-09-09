/**
 * Matching preferences — the model, the validation and the privacy boundary.
 *
 * Run: npm run test:match-preferences
 *
 * Everything here is EXECUTED. The privacy rules are the reason this file
 * exists: the public profile endpoint spreads the whole stored profile and
 * redacts a few fields afterwards, so a preference that is not deliberately
 * projected is world-readable the moment it is written. The projection is an
 * allow-list, and these checks are what keep it one.
 */
import {
  PREFERENCE_FIELDS, coerceMatchPreferences, coercePreferenceVisibility,
  publicMatchPreferences, hasPublicPreferences, describePublicPreferences,
  toEligibilityPreferences, missingMatchPreferences,
  type MatchPreferences, type PreferenceVisibility,
} from '../lib/server/match-preferences';
import { buildEligibilityProfile } from '../lib/server/job-sources/eligibility';
import {
  PROFILE_SCORE_TOTAL_WEIGHT, PREFERENCES_MIN_ANSWERS,
  calculateProfileScore, countStatedPreferences,
} from '../lib/profile-score';
import { countShown, summarisePreferences } from '../lib/match-preferences-ui';

let passed = 0, failed = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); return; }
  failed += 1;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const FULL: MatchPreferences = {
  preferredLocations: ['Bengaluru', 'Pune'],
  relocation: 'for_the_right_role',
  workAuthorization: ['IN'],
  workModes: ['remote', 'hybrid'],
  employmentTypes: ['full_time'],
  preferredDomains: ['software'],
  desiredTitles: ['Staff Engineer'],
  experienceYears: 7,
  minSalary: 4200000,
  salaryCurrency: 'INR',
  salaryPeriod: 'year',
  availability: 'within_30_days',
  noticePeriodDays: 60,
  willingToTravel: true,
  languages: ['English', 'Hindi'],
  companySizes: ['51-200'],
};

console.log('\n── 1. Private is the default, not a setting ──');
{
  check('nothing is public when nothing was marked',
    Object.keys(publicMatchPreferences(FULL, {})).length === 0);
  check('nor when the visibility record is missing entirely',
    Object.keys(publicMatchPreferences(FULL, undefined)).length === 0);
  check('nor when it is junk',
    Object.keys(publicMatchPreferences(FULL, 'nonsense' as unknown as PreferenceVisibility)).length === 0);
  check('a field marked private stays private',
    publicMatchPreferences(FULL, { workModes: 'private' }).workModes === undefined);
  check('hasPublicPreferences agrees', hasPublicPreferences(FULL, {}) === false);
}

console.log('\n── 2. Some answers can NEVER be published ──');
{
  /* Salary and notice period are used for matching and are never shown. A
     client asking for them to be public must not be able to make it so. */
  const shown = publicMatchPreferences(FULL, {
    minSalary: 'public', salaryCurrency: 'public', salaryPeriod: 'public', noticePeriodDays: 'public',
  } as PreferenceVisibility);
  check('a salary floor cannot be published, even on request', shown.minSalary === undefined);
  check('nor its currency or period', shown.salaryCurrency === undefined && shown.salaryPeriod === undefined);
  check('nor a notice period', shown.noticePeriodDays === undefined);
  check('and the visibility coercer records the refusal as private',
    coercePreferenceVisibility({ minSalary: 'public' }).minSalary === 'private');
  check('the registry marks them unpublishable',
    PREFERENCE_FIELDS.filter((f) => !f.publishable).map((f) => f.key).sort().join(',')
      === 'minSalary,noticePeriodDays,salaryCurrency,salaryPeriod');
}

console.log('\n── 3. What IS published is exactly what was chosen ──');
{
  const shown = publicMatchPreferences(FULL, { workModes: 'public', preferredLocations: 'public' });
  check('the chosen fields come through',
    JSON.stringify(shown.workModes) === JSON.stringify(['remote', 'hybrid'])
    && JSON.stringify(shown.preferredLocations) === JSON.stringify(['Bengaluru', 'Pune']));
  check('and nothing else does', Object.keys(shown).sort().join(',') === 'preferredLocations,workModes');
  check('an empty list is not published as an empty answer',
    publicMatchPreferences({ languages: [] }, { languages: 'public' }).languages === undefined);
}

console.log('\n── 4. The projection is an ALLOW-LIST, so a new field is private ──');
{
  /* The property that matters: a field the model has never heard of cannot
     escape, however it got into the stored object. */
  const withFuture = { ...FULL, secretFutureAnswer: 'do not publish me' } as unknown as MatchPreferences;
  const shown = publicMatchPreferences(withFuture, {
    secretFutureAnswer: 'public', workModes: 'public',
  } as unknown as PreferenceVisibility);
  check('an unknown key is never copied out',
    !Object.prototype.hasOwnProperty.call(shown, 'secretFutureAnswer'));
  check('while the known one still works', Boolean(shown.workModes));
  check('every published key is a registry key',
    Object.keys(publicMatchPreferences(FULL, Object.fromEntries(
      PREFERENCE_FIELDS.map((f) => [f.key, 'public']),
    ) as PreferenceVisibility)).every((k) => PREFERENCE_FIELDS.some((f) => f.key === k && f.publishable)));
}

console.log('\n── 5. A client cannot write whatever it likes ──');
{
  const dirty = coerceMatchPreferences({
    preferredLocations: Array.from({ length: 200 }, (_, i) => `City ${i}`),
    workModes: ['remote', 'teleport', 'HYBRID'],
    employmentTypes: ['full_time', 'slavery'],
    experienceYears: -4,
    minSalary: -1,
    salaryCurrency: 'rupees',
    salaryPeriod: 'fortnight',
    relocation: 'maybe',
    availability: 'whenever',
    workAuthorization: ['IN', 'INDIA', 'us'],
    unknownField: 'dropped',
  });
  check('lists are capped', (dirty.preferredLocations ?? []).length === 12,
    String((dirty.preferredLocations ?? []).length));
  check('an unknown enum value is dropped, the known ones kept',
    JSON.stringify(dirty.workModes) === JSON.stringify(['remote', 'hybrid']),
    JSON.stringify(dirty.workModes));
  check('an invented employment type is dropped',
    JSON.stringify(dirty.employmentTypes) === JSON.stringify(['full_time']));
  check('a negative number is not a preference', dirty.experienceYears === undefined && dirty.minSalary === undefined);
  check('a currency that is not a code is dropped', dirty.salaryCurrency === undefined);
  check('an unknown period, relocation or availability is dropped',
    dirty.salaryPeriod === undefined && dirty.relocation === undefined && dirty.availability === undefined);
  check('work authorisation keeps only ISO codes',
    JSON.stringify(dirty.workAuthorization) === JSON.stringify(['IN', 'US']),
    JSON.stringify(dirty.workAuthorization));
  check('unknown keys never reach storage',
    !Object.prototype.hasOwnProperty.call(dirty, 'unknownField'));
  check('a valid set survives intact',
    JSON.stringify(coerceMatchPreferences(FULL)) === JSON.stringify(FULL));
}

console.log('\n── 6. The dormant eligibility rules now have something to read ──');
{
  const before = buildEligibilityProfile({ location: 'Bengaluru' });
  check('without preferences only location is known',
    Object.keys(before).sort().join(',') === 'cities,countries', Object.keys(before).join(','));

  const after = buildEligibilityProfile({
    location: 'Bengaluru', preferences: toEligibilityPreferences(FULL),
  });
  check('work mode now reaches the evaluator', JSON.stringify(after.workModes) === JSON.stringify(['remote', 'hybrid']));
  check('employment type too', JSON.stringify(after.employmentTypes) === JSON.stringify(['full_time']));
  check('domain too', JSON.stringify(after.domains) === JSON.stringify(['software']));
  check('experience is the STATED number, never a derived one', after.experienceYears === 7);
  check('work authorisation becomes the country rule', JSON.stringify(after.countries) === JSON.stringify(['IN']));
  check('a salary floor carries its units', after.minSalary === 4200000 && after.salaryCurrency === 'INR' && after.salaryPeriod === 'year');
}

console.log('\n── 7. A floor with no units is not a floor ──');
{
  const partial = toEligibilityPreferences({ minSalary: 100000 });
  check('a bare number is not sent for comparison', partial.minSalary === undefined);
  const complete = toEligibilityPreferences({ minSalary: 100000, salaryCurrency: 'INR', salaryPeriod: 'month' });
  check('with a currency and a period it is', complete.minSalary === 100000);
}

console.log('\n── 8. "I will go anywhere" is not a city filter ──');
{
  const willMove = toEligibilityPreferences({ preferredLocations: ['Pune'], relocation: 'yes' });
  check('somebody open to relocating is not pinned to their list', willMove.cities === undefined);
  const wontMove = toEligibilityPreferences({ preferredLocations: ['Pune'], relocation: 'no' });
  check('somebody who will not relocate is', JSON.stringify(wontMove.cities) === JSON.stringify(['pune']));
}

console.log('\n── 9. Nothing is stated where nothing was answered ──');
{
  check('an empty object produces an empty preference set',
    Object.keys(coerceMatchPreferences({})).length === 0);
  check('and an empty preference set gates nothing',
    Object.keys(toEligibilityPreferences({})).length === 0);
  check('null and rubbish are handled without throwing',
    Object.keys(coerceMatchPreferences(null)).length === 0
    && Object.keys(coerceMatchPreferences('nope')).length === 0);
  check('every field is reported as unanswered', missingMatchPreferences({}).length === PREFERENCE_FIELDS.length);
  check('and none is once they are all answered', missingMatchPreferences(FULL).length === 0);
}

console.log('\n── 10. Work preferences count towards profile completion ──');
{
  const base = {
    avatarUrl: 'a', headline: 'Senior Engineer', bio: 'x'.repeat(50),
    skills: ['a', 'b', 'c'], experience: [{ title: 't' }], education: [{ degree: 'd' }],
    location: 'Bengaluru', interests: ['a', 'b'], achievements: [{ title: 'p' }],
    website: 'https://x.com',
  };
  check('the weights still total exactly 100', PROFILE_SCORE_TOTAL_WEIGHT === 100,
    String(PROFILE_SCORE_TOTAL_WEIGHT));

  const without = calculateProfileScore({ ...base, matchPreferences: {} });
  check('a profile with everything BUT preferences is not complete',
    without.score < 100 && without.missingSections.includes('preferences'),
    `${without.score}% missing=${without.missingSections.join(',')}`);

  const one = calculateProfileScore({ ...base, matchPreferences: { workModes: ['remote'] } });
  check('one answer is not a preference set',
    one.missingSections.includes('preferences'), `${one.score}%`);

  const enough = calculateProfileScore({
    ...base,
    matchPreferences: { workModes: ['remote'], employmentTypes: ['full_time'], availability: 'immediately' },
  });
  check(`${PREFERENCES_MIN_ANSWERS} answers complete the section`,
    enough.score === 100 && enough.missingSections.length === 0,
    `${enough.score}% missing=${enough.missingSections.join(',')}`);

  check('empty and absent preferences are both unanswered',
    countStatedPreferences({}) === 0 && countStatedPreferences(undefined) === 0
    && countStatedPreferences({ languages: [], relocation: '' }) === 0);
  check('the section is labelled for the checklist',
    enough.sections.some((s) => s.id === 'preferences' && s.label === 'Work Preferences'));
}

console.log('\n── 10. The About section says only what was published ──');
{
  const lines = describePublicPreferences(FULL, {
    workModes: 'public', employmentTypes: 'public', availability: 'public', minSalary: 'public',
  } as PreferenceVisibility);
  const keys = lines.map((l) => l.key);
  check('published answers are described', keys.includes('workModes') && keys.includes('availability'));
  check('and the salary never appears', !keys.includes('minSalary'));
  check('every line is human wording, not a raw key',
    lines.every((l) => l.label && l.value && !l.value.includes('_')),
    JSON.stringify(lines));
  check('nothing is described when nothing is published',
    describePublicPreferences(FULL, {}).length === 0);
}

console.log('\n── 11. Every surface counts "shown" the way the server projects ──');
{
  /* The summary line appears in three places. It said "11 shown on your
     profile" for a profile with eleven marks and three answers, while a
     visitor saw three — a number about privacy that was not true. */
  const prefs = { workModes: ['remote'], employmentTypes: ['full_time'], minSalary: 4200000 };
  const marks = {
    workModes: 'public', employmentTypes: 'public',
    languages: 'public', companySizes: 'public',  // marked, but empty
    minSalary: 'public',                          // marked, but never publishable
  };
  check('an empty field marked public is not counted as shown',
    countShown(prefs, marks) === 2, String(countShown(prefs, marks)));
  check('and neither is one that can never be published',
    countShown({ minSalary: 1 }, { minSalary: 'public' }) === 0);
  check('the count agrees with what the server actually projects',
    countShown(prefs, marks)
      === Object.keys(publicMatchPreferences(prefs as MatchPreferences, marks as PreferenceVisibility)).length);
  check('answers and shown are different numbers, and both are stated',
    summarisePreferences(prefs, marks) === '3 answers set · 2 shown on your profile',
    summarisePreferences(prefs, marks));
  check('a profile with answers but nothing published says so',
    summarisePreferences({ workModes: ['remote'] }, {}) === '1 answer set · none shown on your profile');
  check('and an untouched one invites rather than reporting zero',
    /Not set up yet/.test(summarisePreferences({}, {})));
}

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
