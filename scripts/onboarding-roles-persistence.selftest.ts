/**
 * Onboarding — persisting the chosen roles onto the profile.
 *
 * Run: npm run test:onboarding-roles
 *
 * `profileRoles` is executed for real. The storage, endpoint and authorization
 * rules are asserted against source: they are decisions that must not regress
 * quietly — whether a second profile store appears, whether an endpoint starts
 * trusting a client-supplied user id — and there is no DB here.
 */
import { readFileSync } from 'node:fs';
import { profileRoles, type UserProfileData } from '../lib/server/user-profiles';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const PROFILES = src('lib/server/user-profiles.ts');
const ME = src('app/api/profile/me/route.ts');
const COMPLETE = src('app/api/onboarding/complete/route.ts');

/* ═══ 1–3. Defaults, and old records still load ═════════════════════════ */
console.log('\n── 1. Defaults for profiles that predate the fields ──');
check('a brand-new profile has no roles', profileRoles({}).roles.length === 0);
check('and no custom roles', profileRoles({}).customRoles.length === 0);
/* The real case: every profile stored before today has no key at all. */
const legacy: UserProfileData = { headline: 'Engineer', skills: ['React'] };
check('an existing profile without the fields loads safely',
  profileRoles(legacy).roles.length === 0 && profileRoles(legacy).customRoles.length === 0);
check('null loads safely', profileRoles(null).roles.length === 0);
check('undefined loads safely', profileRoles(undefined).customRoles.length === 0);
check('the result is always an array, never null',
  Array.isArray(profileRoles({}).roles) && Array.isArray(profileRoles({}).customRoles));

console.log('── 2. Stored values are returned ──');
check('stored roles come back', profileRoles({ roles: ['software', 'design'] }).roles.length === 2);
check('stored custom roles come back',
  profileRoles({ customRoles: ['AI Platform Engineer'] }).customRoles[0] === 'AI Platform Engineer');
check('the two are kept apart',
  profileRoles({ roles: ['software'], customRoles: ['Chief Remote Officer'] }).roles.length === 1);
/* Junk in a stored row must not become junk on screen. */
check('blank entries are dropped', profileRoles({ roles: ['software', '', '  '] }).roles.length === 1);
check('a non-array is treated as absent',
  profileRoles({ roles: 'software' as unknown as string[] }).roles.length === 0);
check('entries are trimmed', profileRoles({ roles: ['  software  '] }).roles[0] === 'software');

/* ═══ 4–5. The write path ═══════════════════════════════════════════════ */
console.log('── 3. Persisting through the existing profile store ──');
check('the fields live on UserProfileData, not a new model',
  /^\s{2}roles\?: string\[\];/m.test(PROFILES) && /^\s{2}customRoles\?: string\[\];/m.test(PROFILES));
check('no second profile store was introduced',
  !/new Collection|createProfileStore|profiles_v2/i.test(strip(PROFILES)));
check('writes still go through updateProfileData\'s merge',
  /export async function updateProfileData/.test(PROFILES) && /\.\.\.data,/.test(PROFILES));
/* A merge, not a replace: writing roles must not clear a bio. */
check('the merge preserves fields the caller did not send',
  /\.\.\.current,\s*\n\s*\.\.\.data,/.test(PROFILES) || /\.\.\.\(profiles\[userId\] \?\? \{\}\),\s*\n\s*\.\.\.data,/.test(PROFILES));

console.log('── 4. PATCH /api/profile/me ──');
check('roles are accepted (the body is Partial<UserProfileData>)',
  /Partial<UserProfileData>/.test(ME));
check('roles are capped', /body\.roles && body\.roles\.length > 20/.test(ME));
check('custom roles are capped', /body\.customRoles && body\.customRoles\.length > 20/.test(ME));

console.log('── 5. Authorization is unchanged ──');
check('the endpoint refuses an unauthenticated caller', /status: 401/.test(ME));
check('the target is the session\'s own user, never a client id',
  /updateProfileData\(actor\.id, safeBody\)/.test(ME));
check('no user id is read from the request body',
  !/body\.(userId|id)\b/.test(strip(ME)));
check('the actor comes from the session', /getAuthSession\(\)/.test(ME));

console.log('── 6. Onboarding completion ──');
check('it persists whatever profile fields it is given', /\.\.\.profilePayload/.test(COMPLETE));
check('so roles ride the existing patch', /Partial<UserProfileData>/.test(COMPLETE));
check('it still requires authentication', /status: 401/.test(COMPLETE));
check('it still derives the user from the session', /getAuthSession\(\)/.test(COMPLETE));
check('email verification is still enforced for individuals',
  /accountType === 'individual'/.test(COMPLETE) && /emailVerified !== true/.test(COMPLETE));
check('idempotency is untouched — onboardingDone is never cleared',
  /delete patch\.onboardingDone/.test(COMPLETE));

/* ═══ 7. Corrections win ════════════════════════════════════════════════ */
console.log('── 7. The user\'s edit is what gets stored ──');
/* The flow sends its edited state, and the store replaces the array wholesale,
   so a correction cannot be merged back into an extraction. */
const extracted: UserProfileData = { roles: ['software', 'design'] };
const afterEdit: UserProfileData = { ...extracted, roles: ['data'], customRoles: ['AI Platform Engineer'] };
check('an edited role list replaces the extracted one',
  profileRoles(afterEdit).roles.length === 1 && profileRoles(afterEdit).roles[0] === 'data');
check('and the extracted values are gone, not merged',
  !profileRoles(afterEdit).roles.includes('software'));
check('a typed role survives alongside', profileRoles(afterEdit).customRoles[0] === 'AI Platform Engineer');
check('clearing roles is possible — an empty array is respected',
  profileRoles({ ...extracted, roles: [] }).roles.length === 0);
/* The flow marks a field touched on edit and never re-seeds it. */
const FLOW = src('app/onboarding/OnboardingClient.tsx');
check('the flow only seeds roles it has not been told to leave alone',
  /if \(suggestedRoles\.length && !touched\.roles\)/.test(FLOW));

/* ═══ 8. Nothing else moved ═════════════════════════════════════════════ */
console.log('── 8. Out of scope, and left alone ──');
check('the profile score was not changed',
  !/roles/.test(strip(src('lib/profile-score.ts'))));
check('the recommendation scorer was not changed',
  !/customRoles/.test(strip(src('lib/server/job-recommend.ts'))));

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
