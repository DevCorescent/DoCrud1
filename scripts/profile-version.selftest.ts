/**
 * Phase 3.4 — `profileVersion` is server-owned and moves only when it must.
 *
 * Run: npm run test:profile-version
 *
 * The rules are executed against real values, not asserted about by reading
 * source. The audit behind them: `buildRecProfile()` reads five profile fields
 * and the route adds `resumeFiles` — six in total. Nothing else a profile
 * stores can change a ranking, so nothing else may invalidate one.
 */
import { readFileSync } from 'node:fs';
import {
  RECOMMENDATION_INPUT_FIELDS, touchesRecommendationInputs, nextProfileVersion,
  type UserProfileData,
} from '../lib/server/user-profiles';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');
const p = (o: Record<string, unknown>) => o as Partial<UserProfileData>;

/* ═══ 1. The six fields, and only those ═════════════════════════════════ */

/* SEVEN, not six. `matchPreferences` is passed into buildRecProfile by BOTH
   scopes and demonstrably changes scores: desiredTitles feed roleTokens, and
   preferredLocations/workModes/employmentTypes become scoring sets. Counting
   six means a member can state exactly the work they want and never have their
   recommendations recomputed. */
check('exactly seven recommendation inputs', RECOMMENDATION_INPUT_FIELDS.length === 7);
check('matchPreferences bumps the version',
  touchesRecommendationInputs(p({ matchPreferences: { desiredTitles: ['staff engineer'] } as never })));
check('and so does an empty preferences object — the key is what matters',
  touchesRecommendationInputs(p({ matchPreferences: {} as never })));
for (const f of ['headline', 'skills', 'location', 'experience', 'interests', 'resumeFiles', 'matchPreferences']) {
  check(`${f} is a recommendation input`, (RECOMMENDATION_INPUT_FIELDS as readonly string[]).includes(f));
  check(`a patch touching ${f} is detected`, touchesRecommendationInputs(p({ [f]: 'x' })));
}
/* The scorer cannot see these, so they must not invalidate a ranking. */
for (const f of ['profileSetupDone', 'onboardingDone', 'emailVerified', 'emailVerifiedAt',
  'bio', 'avatarUrl', 'docrudInfinity', 'roles', 'customRoles',
  /* Read by the personalized scope but never passed to the scorer, and a
     visibility toggle changes who can see preferences, not what they score. */
  'matchPreferenceVisibility']) {
  check(`${f} is NOT treated as a recommendation input`, !touchesRecommendationInputs(p({ [f]: 'x' })));
}
check('an empty patch touches nothing', !touchesRecommendationInputs(p({})));
check('a mixed patch is detected via its relevant key',
  touchesRecommendationInputs(p({ profileSetupDone: true, skills: ['go'] })));
/* An explicitly-cleared field still changes the ranking. */
check('clearing skills counts as a change', touchesRecommendationInputs(p({ skills: [] })));
check('setting a field to undefined still counts — the key is present',
  touchesRecommendationInputs(p({ headline: undefined })));

/* ═══ 2. Monotonic version arithmetic ═══════════════════════════════════ */

check('a profile with no version starts at 0 and a relevant write makes it 1',
  nextProfileVersion(null, p({ skills: ['go'] })) === 1);
check('an existing profile without the field behaves the same',
  nextProfileVersion(p({ headline: 'x' }), p({ skills: ['go'] })) === 1);
check('a relevant write increments', nextProfileVersion(p({ profileVersion: 7 }), p({ skills: [] })) === 8);
check('an IRRELEVANT write carries the version forward unchanged',
  nextProfileVersion(p({ profileVersion: 7 }), p({ profileSetupDone: true })) === 7);
check('an irrelevant write on a versionless profile stays 0',
  nextProfileVersion(p({}), p({ onboardingDone: true })) === 0);
check('repeated relevant writes increment monotonically',
  nextProfileVersion(p({ profileVersion: 1 }), p({ skills: [] })) === 2
  && nextProfileVersion(p({ profileVersion: 2 }), p({ location: 'x' })) === 3);
check('the version never decreases',
  nextProfileVersion(p({ profileVersion: 9 }), p({ bio: 'x' })) >= 9);

/* Corrupt or hostile stored values cannot move it backwards or sideways. */
for (const bad of [-5, 0, NaN, Infinity, 'abc', null, undefined, {}, 1.7]) {
  const out = nextProfileVersion(p({ profileVersion: bad as never }), p({ skills: [] }));
  check(`a stored version of ${JSON.stringify(bad)} yields a sane increment`,
    Number.isInteger(out) && out >= 1);
}
check('a fractional stored version floors rather than propagating',
  nextProfileVersion(p({ profileVersion: 3.9 as never }), p({ skills: [] })) === 4);

/* ═══ 3. The client cannot control it ═══════════════════════════════════ */

const PROFILES = read('lib/server/user-profiles.ts');
check('a client-supplied profileVersion is stripped at the funnel',
  /const \{ profileVersion: _clientSupplied, \.\.\.patch \}/.test(PROFILES));
check('and the stripped patch — not the raw body — is what gets written',
  (PROFILES.match(/\.\.\.patch,/g) ?? []).length >= 2);
check('the version written is always computed server-side',
  (PROFILES.match(/profileVersion: nextProfileVersion\(/g) ?? []).length === 2);
check('both persistence branches are covered (row store and JSON store)',
  /selectUserProfileRow/.test(PROFILES) && /serializeProfilesWrite/.test(PROFILES));

/* ═══ 4. The audit's conclusions are pinned ═════════════════════════════ */

const RECOMMEND = read('lib/server/job-recommend.ts');
check('buildRecProfile still reads exactly the five profile fields',
  ['headline', 'skills', 'location', 'experience', 'interests']
    .every((f) => new RegExp(`${f}\\?:`).test(RECOMMEND.slice(RECOMMEND.indexOf('export function buildRecProfile')))));
check('and the route still widens it with resumeFiles',
  /resumeFiles/.test(read('app/api/recommendations/jobs/route.ts')));
/* The one writer that bypasses updateProfileData must stay irrelevant. */
const INFINITY = read('lib/server/infinity.ts');
check('the direct user_profiles write touches no recommendation input',
  !/\$set:\s*\{[^}]*\b(headline|skills|location|experience|interests|resumeFiles)\b/.test(INFINITY));

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
