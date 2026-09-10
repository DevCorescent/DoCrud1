/**
 * The stated-preference signals say only what the person said.
 *
 * Run: npx tsx scripts/people-match.selftest.ts
 */
import { completenessFactor, preferenceSignals } from '../lib/server/people-match';
import { PROFILE_INDEX_THRESHOLD } from '../lib/profile-score';
import type { QueryUnderstanding } from '../lib/search-understanding';

let passed = 0; let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
}

/** A query understanding with only the fields these signals read. */
function q(partial: Partial<QueryUnderstanding>): QueryUnderstanding {
  return {
    raw: '', cleaned: '', intent: 'find_provider', entityTypes: [],
    roles: [], skills: [], domains: [], locations: [], locationConstraint: false,
    nearMe: false, experience: null, terms: [], expanded: [], source: 'rules',
    ...partial,
  } as QueryUnderstanding;
}

console.log('\n── silence costs nothing ──');
check('no preferences at all is neutral', preferenceSignals(undefined, q({})).factor === 1);
check('an empty preference object is neutral', preferenceSignals({}, q({ roles: ['developer'] })).points === 0);
check('nothing is claimed for an unanswered form',
  preferenceSignals({}, q({ locations: ['bengaluru'] })).reasons.length === 0);
check('an unanswered form never accepts a location',
  preferenceSignals({}, q({ locations: ['bengaluru'] })).locationAccepted === false);

console.log('\n── the role they are aiming for ──');
{
  const s = preferenceSignals(
    { desiredTitles: ['React Developer'] },
    q({ roles: ['developer'], skills: ['react'], cleaned: 'react developer' }),
  );
  check('a stated title matches the role asked for', s.points >= 8);
  check('and quotes the title as they wrote it, not lower-cased',
    s.reasons.some((r) => r === 'wants React Developer work'));
}
check('a stated title unrelated to the query scores nothing',
  preferenceSignals({ desiredTitles: ['Pastry Chef'] }, q({ roles: ['developer'], cleaned: 'developer' })).points === 0);

console.log('\n── where they will work ──');
{
  const s = preferenceSignals({ preferredLocations: ['Bengaluru'] }, q({ locations: ['bengaluru'] }));
  check('a stated city answers a city query', s.locationAccepted);
  check('and is worth more than a maybe', s.points === 6);
  check('and the city is shown the way they wrote it',
    s.reasons.includes('open to Bengaluru'));
}
{
  const s = preferenceSignals({ relocation: 'for_the_right_role' }, q({ locations: ['bengaluru'] }));
  check('"for the right role" lifts the exclusion', s.locationAccepted);
  check('but scores below naming the city', s.points === 3);
  check('and is worded as the maybe it is', s.reasons.includes('may relocate'));
}
check('relocation without a location in the query is not a match',
  preferenceSignals({ relocation: 'yes' }, q({})).points === 0);
check('refusing to relocate accepts nothing',
  preferenceSignals({ relocation: 'no' }, q({ locations: ['pune'] })).locationAccepted === false);
check('naming the city beats relocation, and is not double counted',
  preferenceSignals({ preferredLocations: ['Pune'], relocation: 'yes' }, q({ locations: ['pune'] })).points === 6);

console.log('\n── mode, type, domain, years ──');
check('remote in the query meets a remote preference',
  preferenceSignals({ workModes: ['remote'] }, q({ cleaned: 'remote react developer' })).points === 4);
check('a mode the person did not pick scores nothing',
  preferenceSignals({ workModes: ['onsite'] }, q({ cleaned: 'remote react developer' })).points === 0);
check('"work from home" reads as remote',
  preferenceSignals({ workModes: ['remote'] }, q({ cleaned: 'developer to work from home' })).points === 4);
check('a contract query meets a contract preference',
  preferenceSignals({ employmentTypes: ['contract'] }, q({ cleaned: 'contract designer' })).points === 3);
check('domains are compared as ids',
  preferenceSignals({ preferredDomains: ['fintech'] }, q({ domains: ['fintech'] })).points === 3);
check('years inside the band the query implies count',
  preferenceSignals({ experienceYears: 6 }, q({ experience: 'senior' })).points === 3);
check('years outside it do not',
  preferenceSignals({ experienceYears: 1 }, q({ experience: 'senior' })).points === 0);
check('years count for nothing when no level was asked for',
  preferenceSignals({ experienceYears: 6 }, q({})).points === 0);

console.log('\n── availability ──');
check('available now counts for someone hiring',
  preferenceSignals({ availability: 'immediately' }, q({ intent: 'find_provider' })).points === 3);
check('availability is irrelevant to someone looking for work',
  preferenceSignals({ availability: 'immediately' }, q({ intent: 'find_work' })).points === 0);
{
  const s = preferenceSignals({ availability: 'not_looking' }, q({ intent: 'find_provider' }));
  check('"not looking" lowers the score for a hiring query', s.factor < 1);
  check('but is never an exclusion — the caller still gets a result', s.notLooking && s.points === 0);
}
check('"not looking" costs nothing when the searcher is not hiring',
  preferenceSignals({ availability: 'not_looking' }, q({ intent: 'find_content' })).factor === 1);

console.log('\n── the multiplier ──');
{
  const full = preferenceSignals({
    desiredTitles: ['React Developer'], preferredLocations: ['Bengaluru'],
    workModes: ['remote'], employmentTypes: ['contract'], preferredDomains: ['fintech'],
    experienceYears: 6, availability: 'immediately',
  }, q({
    roles: ['developer'], skills: ['react'], domains: ['fintech'], locations: ['bengaluru'],
    experience: 'senior', cleaned: 'remote contract react developer in bengaluru',
  }));
  check('every answer matching is capped', full.points === 24);
  check('and the cap is a 24% lift, not more', Math.abs(full.factor - 1.24) < 1e-9);
  check('reasons stay short enough to read', full.reasons.length >= 2);
}

console.log('\n── completeness ──');
check('at the stated threshold a profile gets the full lift',
  completenessFactor(PROFILE_INDEX_THRESHOLD) === 1.12);
check('one point below it does not', completenessFactor(PROFILE_INDEX_THRESHOLD - 1) < 1.12);
check('a nearly empty profile ranks below neutral', completenessFactor(10) < 1);
check('but is never zeroed out of the index', completenessFactor(0) > 0);
check('the scale is monotonic', [0, 30, 60, 80, 95, 100]
  .map(completenessFactor).every((v, i, a) => i === 0 || v >= a[i - 1]));

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed) { console.log('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
