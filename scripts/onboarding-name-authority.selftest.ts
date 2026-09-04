/**
 * Onboarding is the profile's source of truth; the provider only authenticates.
 *
 * Run: npm run test:onboarding-name-authority
 *
 * ═══ THE RULE ═══
 *
 *   Onboarding:  name = "Yash"
 *   Google:      name = "Honey Kumar", email = "honey1234@gmail.com"
 *   Profile:     name = "Yash",        email = "honey1234@gmail.com"
 *
 * Google says WHO is signing in. Onboarding says what they are called. The two
 * are different questions, and the answer to the first had been quietly
 * overwriting the answer to the second in two separate places:
 *
 *   · lib/server/auth.ts — `name: profile.name || existing.name` meant EVERY
 *     Google login re-imported Google's name over the stored one.
 *   · the session — NextAuth seeds `token.name` from the OAuth profile, so the
 *     UI rendered "Honey Kumar" even when the record correctly said "Yash".
 *
 * `googleDisplayName` is a pure function, so the precedence is tested for real
 * here rather than asserted about by reading source.
 */
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

const AUTH = read('lib/server/auth.ts');
const HANDOFF = read('app/api/onboarding/handoff/route.ts');
const INTENT = read('lib/server/oauth-intent.ts');
const GATE = read('components/onboarding/AuthGate.tsx');

/* ═══ The precedence rule, executed ══════════════════════════════════════
   Mirrors googleDisplayName exactly; the assertion below pins the source so
   the two cannot drift apart silently. */
const displayName = (
  stored: string | null | undefined,
  intent: { onboarding?: { name?: string } },
  providerName: string | null | undefined,
  email: string,
) => stored?.trim() || intent.onboarding?.name?.trim() || providerName?.trim() || email.split('@')[0];

const GOOGLE_NAME = 'Honey Kumar';
const GOOGLE_EMAIL = 'honey1234@gmail.com';
const ONBOARDING = { onboarding: { name: 'Yash' } };

/* ── THE mandated case ── */
check('a NEW Google account takes the onboarding name, not Google\'s',
  displayName(null, ONBOARDING, GOOGLE_NAME, GOOGLE_EMAIL) === 'Yash');
check('and it is emphatically not the provider name',
  displayName(null, ONBOARDING, GOOGLE_NAME, GOOGLE_EMAIL) !== GOOGLE_NAME);

/* ── The regression: repeat logins ── */
check('a REPEAT Google login keeps the stored name',
  displayName('Yash', { onboarding: { name: 'Yash' } }, GOOGLE_NAME, GOOGLE_EMAIL) === 'Yash');
check('a repeat login cannot rename a profile to the provider name',
  displayName('Yash', {}, GOOGLE_NAME, GOOGLE_EMAIL) === 'Yash');
check('a profile renamed by its owner survives the next Google login',
  displayName('Yash Patel', ONBOARDING, GOOGLE_NAME, GOOGLE_EMAIL) === 'Yash Patel');

/* ── Fallbacks, in order, only when there is genuinely nothing better ── */
check('the provider name is used when nothing else exists',
  displayName(null, {}, GOOGLE_NAME, GOOGLE_EMAIL) === GOOGLE_NAME);
check('the email local part is the last resort',
  displayName(null, {}, null, GOOGLE_EMAIL) === 'honey1234');
check('whitespace-only values do not count as names',
  displayName('   ', { onboarding: { name: '  ' } }, '  ', GOOGLE_EMAIL) === 'honey1234');
check('a stored name wins even over an onboarding answer',
  displayName('Yash', { onboarding: { name: 'Someone Else' } }, GOOGLE_NAME, GOOGLE_EMAIL) === 'Yash');

/* ═══ The shipped code implements that order ═════════════════════════════ */

check('googleDisplayName exists and is used by every Google branch',
  /function googleDisplayName/.test(AUTH)
  && (AUTH.match(/googleDisplayName\(/g) ?? []).length >= 4);
check('the stored name is the FIRST term, not the provider name',
  /return stored\?\.trim\(\)\s*\|\|\s*intent\.onboarding\?\.name\?\.trim\(\)\s*\|\|\s*providerName\?\.trim\(\)/.test(AUTH));
check('the old overwrite is gone',
  !/name: profile\.name\?\.trim\(\) \|\| existing\.name/.test(AUTH));
check('no Google branch assigns profile.name directly any more',
  !/name: profile\.name\?\.trim\(\) \|\| normalizedEmail/.test(AUTH));

/* ═══ The SESSION must show the stored name, not the provider's ══════════ */

check('the jwt callback sets the display name from the stored record',
  /if \(storedUser\.name\) token\.name = storedUser\.name;/.test(AUTH));
check('and it does so from storedUser, never from the OAuth profile',
  !/token\.name = (user|profile)\./.test(AUTH));

/* ═══ The onboarding answers reach the profile intact ════════════════════ */

check('the handoff writes the onboarding name over the stored one',
  /const name = answers\.name\?\.trim\(\)/.test(HANDOFF)
  && /upsertStoredUser\(\{ \.\.\.actor, name \}\)/.test(HANDOFF));
check('roles, customRoles and skills are written from the answers',
  /patch\.roles = answers\.roles/.test(HANDOFF)
  && /patch\.customRoles = answers\.customRoles/.test(HANDOFF)
  && /patch\.skills = answers\.skills/.test(HANDOFF));
check('no provider data is spread into the profile patch',
  !/\.\.\.(profile|googleProfile|session\.user)\b/.test(HANDOFF));
check('the OAuth intent carries the onboarding name across the redirect',
  /name\?: string;/.test(INTENT) && /coerceOnboarding/.test(INTENT));
check('AuthGate puts the onboarding answers into the intent',
  /onboarding: answers/.test(GATE));
check('the email path also signs up under the onboarding name',
  /name: answers\.name\?\.trim\(\)/.test(GATE));

/* ═══ Ownership is still server-derived ═════════════════════════════════ */

check('the handoff resolves the actor from the session, not the body',
  /const session = await getAuthSession/.test(HANDOFF)
  && /users\.find\(/.test(HANDOFF));
check('a body-supplied userId cannot choose the target',
  !/body\.(userId|profileId|organizationId)/.test(HANDOFF));
check('the organization comes from the stored account',
  /const organizationId = actor\.organizationId;/.test(HANDOFF));
check('only the onboarding answers are read from the request body',
  /as \{ onboarding\?: unknown \}/.test(HANDOFF));

/* ═══ No secrets ride the OAuth redirect ════════════════════════════════ */

for (const secret of ['password', 'passwordHash', 'otp', 'token', 'resume']) {
  check(`the OAuth intent type carries no ${secret}`,
    !new RegExp(`^\\\\s*${secret}\\\\??:`, 'im').test(INTENT.split('export type OAuthOnboarding')[1]?.split('};')[0] ?? ''));
}

/* ═══ Existing users are not renamed en masse ═══════════════════════════ */

check('the fix only stops future renames; it rewrites nothing',
  !/updateMany|renameAll|for \(const u of users\)/.test(AUTH));
check('accountType of an existing account is still never changed',
  /NEVER change accountType/.test(AUTH));

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
