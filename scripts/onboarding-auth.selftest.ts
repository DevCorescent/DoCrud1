/**
 * Onboarding — the Page 7 authentication gate.
 *
 * Run: npm run test:onboarding-auth
 *
 * The intent coercer is executed for real. The gate's behaviour and the
 * server's rules are asserted against source: they are security decisions that
 * must not regress quietly — whether a second auth system appears, whether a
 * client-supplied user id is trusted, whether a password is stored — and there
 * is no browser or DB here.
 */
import { readFileSync } from 'node:fs';
import { coerceOnboarding, coerceOAuthIntent } from '../lib/server/oauth-intent';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const GATE = src('components/onboarding/AuthGate.tsx');
const GATE_CODE = strip(GATE);
const HANDOFF = src('app/api/onboarding/handoff/route.ts');
const HANDOFF_CODE = strip(HANDOFF);
const SEND_OTP = strip(src('app/api/onboarding/send-otp/route.ts'));
const FLOW = src('app/onboarding/OnboardingClient.tsx');

/* ═══ 1–2. The challenge gates both paths ═══════════════════════════════ */
console.log('\n── 1. CAPTCHA gates Google ──');
check('the gate renders the existing verification component', /<SecurityVerification/.test(GATE));
check('a token is required before Google starts', /if \(!verified\) return needVerification\(\);/.test(GATE_CODE));
check('Google is only reached after that guard',
  GATE_CODE.indexOf('const startGoogle') < GATE_CODE.indexOf("signIn('google'"));
check('the gate stays usable where Turnstile is not configured',
  /!isTurnstileEnabled\(\) \|\| Boolean\(captcha\)/.test(GATE_CODE));

console.log('── 2. CAPTCHA gates email and OTP ──');
check('the email form refuses to submit unverified', /submitEmail[\s\S]{0,200}if \(!verified\)/.test(GATE_CODE));
check('the token is sent to signup', /captchaToken: captcha/.test(GATE_CODE));
/* The server is what actually judges it — the UI guard is convenience. */
check('signup enforces the challenge server-side',
  /enforceCaptcha/.test(strip(src('app/api/individual/signup/route.ts'))));
check('send-otp enforces it for anonymous callers', /enforceCaptcha\(body\.captchaToken/.test(SEND_OTP));
check('and that anonymous enforcement is still keyed on having no session',
  /if \(!session\?\.user\)/.test(SEND_OTP));
check('a spent token is not reused', /resetCaptcha/.test(GATE_CODE));

/* ═══ 3–5. Existing systems, not new ones ═══════════════════════════════ */
console.log('── 3. No second auth system ──');
check('signup goes to the existing endpoint', /'\/api\/individual\/signup'/.test(GATE));
check('sign-in goes through NextAuth credentials', /signIn\('credentials'/.test(GATE));
check('Google goes through NextAuth', /signIn\('google'/.test(GATE));
check('the OAuth intent endpoint is reused', /'\/api\/auth\/oauth-intent'/.test(GATE));
check('OTP uses the existing send endpoint', /'\/api\/onboarding\/send-otp'/.test(GATE));
check('OTP uses the existing verify endpoint', /'\/api\/onboarding\/verify-otp'/.test(GATE));
check('no password hashing happens in the browser',
  !/(bcrypt|scrypt|createHash|sha256)/i.test(GATE_CODE));
check('the password is never stored anywhere client-side',
  !/(localStorage|sessionStorage|document\.cookie)/.test(GATE_CODE));
check('and never rides the OAuth intent',
  !/password/.test(strip(src('lib/server/oauth-intent.ts'))));

console.log('── 4. OTP is sent only after signup and sign-in ──');
check('the order is signup → signIn → send-otp',
  GATE_CODE.indexOf('individual/signup') < GATE_CODE.indexOf("signIn('credentials'")
  && GATE_CODE.indexOf("signIn('credentials'") < GATE_CODE.indexOf('onboarding/send-otp'));
check('a failed sign-in stops before the code is sent',
  /if \(!result\?\.ok\) throw new Error/.test(GATE_CODE));

console.log('── 5. Verification completes the flow ──');
check('the OTP screen only appears once a code was sent', /setMode\('otp'\)/.test(GATE_CODE));
check('a failed verification does not continue', /if \(!res\.ok\) throw new Error/.test(GATE_CODE));
check('persistence runs before leaving', GATE_CODE.indexOf('await persist()') < GATE_CODE.indexOf('onDone()'));
check('Home is only reached from onDone', /onDone=\{\(\) => router\.push\('\/'\)\}/.test(FLOW));

/* ═══ 6–10. The handoff ═════════════════════════════════════════════════ */
console.log('── 6. The answers survive the trip ──');
check('they ride the httpOnly intent cookie for Google', /onboarding: answers/.test(GATE_CODE));
check('the cookie is httpOnly', /httpOnly: true/.test(src('lib/server/oauth-intent.ts')));
check('the return leg finishes the write', /'\/api\/onboarding\/handoff', \{ method: 'POST' \}/.test(FLOW));
check('and only then goes Home', /if \(live && res\.ok\) router\.replace\('\/'\)/.test(FLOW));

/* Executed for real. */
const coerced = coerceOnboarding({ name: ' Priya ', roles: ['software', ''], skills: ['React'] });
check('the coercer trims and drops blanks', coerced?.name === 'Priya' && coerced?.roles?.length === 1);
check('a non-object is ignored', coerceOnboarding('nope') === undefined);
check('an empty answer set is ignored', coerceOnboarding({}) === undefined);
check('lists are capped',
  (coerceOnboarding({ roles: Array.from({ length: 50 }, (_, i) => `r${i}`) })?.roles?.length ?? 0) === 20);
check('entries are length-capped',
  (coerceOnboarding({ roles: ['x'.repeat(500)] })?.roles?.[0].length ?? 0) === 80);
check('the intent still carries its account type', coerceOAuthIntent({ accountType: 'business' }).accountType === 'business');
check('a tampered account type falls back to individual',
  coerceOAuthIntent({ accountType: 'admin' }).accountType === 'individual');

console.log('── 7. Roles and skills are persisted ──');
check('roles are written', /patch\.roles = answers\.roles/.test(HANDOFF_CODE));
check('custom roles are written', /patch\.customRoles = answers\.customRoles/.test(HANDOFF_CODE));
check('skills are written', /patch\.skills = answers\.skills/.test(HANDOFF_CODE));
check('through the existing profile store', /updateProfileData\(actor\.id, patch\)/.test(HANDOFF_CODE));
check('the name goes to the user record, not the profile', /upsertStoredUser\(\{ \.\.\.actor, name \}\)/.test(HANDOFF_CODE));

console.log('── 8. The person\'s edits are what travel ──');
check('the gate is handed the flow\'s edited state',
  /roles: roleLabels/.test(FLOW) && /customRoles: \[\.\.\.customRoles\]/.test(FLOW)
  && /skills: \[\.\.\.skills\]/.test(FLOW));
check('and the flow never re-seeds a touched field',
  /if \(suggestedRoles\.length && !touched\.roles\)/.test(FLOW));
/* An empty list is an answer, not a missing value. */
check('an emptied list stays empty — it is not replaced by a suggestion',
  coerceOnboarding({ name: 'Priya', roles: [] })?.roles === undefined
  && /if \(answers\.roles\) patch\.roles/.test(HANDOFF_CODE));

console.log('── 9. Authorization ──');
check('the handoff refuses an unauthenticated caller', /status: 401/.test(HANDOFF_CODE));
check('the user comes from the session', /getAuthSession\(\)/.test(HANDOFF_CODE));
check('no user id is read from the body', !/body\.(userId|id)\b/.test(HANDOFF_CODE));
check('the write target is the session-derived actor', /updateProfileData\(actor\.id/.test(HANDOFF_CODE));
check('the cookie is cleared once its contents are stored',
  HANDOFF_CODE.indexOf('updateProfileData') < HANDOFF_CODE.lastIndexOf('clearOAuthIntentCookie'));

console.log('── 10. Failure never costs the answers ──');
check('errors are shown, not swallowed', /setError\(/.test(GATE_CODE));
check('a failure leaves the gate mounted, so state survives',
  !/router\.push\('\/'\)/.test(GATE_CODE));
check('the flow keeps its state across the whole gate',
  /const \[roles, setRoles\]/.test(FLOW) && /const \[skills, setSkills\]/.test(FLOW));
/* Résumé staging stays out of this phase — no File, no upload, no storage key
   anywhere near the handoff. */
check('the résumé is still out of scope',
  !/(File|upload|storageKey|resumeFiles)/.test(HANDOFF_CODE));

/* ═══ 11. The business branch ═══════════════════════════════════════════ */
console.log('── 11. Business reaches the same gate ──');
check('Talent Preview continues into the gate', /onLogin=\{\(\) => toAuth\('talent'\)\}/.test(FLOW));
check('the gate is told which kind of account this is',
  /accountKind=\{accountKind \?\? 'individual'\}/.test(FLOW));
check('and is given the business answers', /businessSpace: space \?\? undefined/.test(FLOW)
  && /businessSkills: \[\.\.\.businessSkills\]/.test(FLOW));

console.log('── 12. Business auth uses the existing endpoints ──');
check('business signs up through the existing SaaS endpoint', /'\/api\/saas\/signup'/.test(GATE));
check('individual still uses its own endpoint', /'\/api\/individual\/signup'/.test(GATE));
check('the endpoint is chosen by account kind, not by the request',
  /isBusiness \? '\/api\/saas\/signup' : '\/api\/individual\/signup'/.test(GATE_CODE));
check('the SaaS endpoint enforces the challenge too',
  /enforceCaptcha/.test(strip(src('app/api/saas/signup/route.ts'))));
check('the same captcha gate covers business', /if \(!verified\) return needVerification\(\);/.test(GATE_CODE));
check('a workspace name is required before business signup',
  /isBusiness && !organization\.trim\(\)/.test(GATE_CODE));
check('the OAuth intent carries the real account kind', /accountType: accountKind/.test(GATE_CODE));

console.log('── 13. Business answers are owned by the workspace ──');
check('the owner is chosen from the stored account type',
  /actor\.accountType === 'business'/.test(HANDOFF_CODE));
check('the workspace comes from the stored user record',
  /const organizationId = actor\.organizationId/.test(HANDOFF_CODE));
check('an organization id in the body is never read',
  !/body\.(organizationId|companyId)/.test(HANDOFF_CODE));
check('the space is stored as the workspace industry', /industry: answers\.businessSpace/.test(HANDOFF_CODE));
check('the hiring skills get their own field', /talentSkills: answers\.businessSkills/.test(HANDOFF_CODE));
check('written through the existing business store', /saveBusinessSettings\(\{/.test(HANDOFF_CODE));
check('an account with no workspace is refused, not silently dropped',
  /status: 409/.test(HANDOFF_CODE));
/* The business branch returns before the profile write is ever reached — so
   a workspace answer can never land on the individual's profile. */
check('a business write returns before the profile path',
  HANDOFF_CODE.indexOf("actor.accountType === 'business'")
    < HANDOFF_CODE.indexOf('updateProfileData(actor.id, patch)'));
check('and the individual path is still the default',
  /owner: 'individual'/.test(HANDOFF_CODE) && /owner: 'business'/.test(HANDOFF_CODE));

console.log('── 14. Business coercion ──');
const biz = coerceOnboarding({ businessSpace: ' technology ', businessSkills: ['React', ''] });
check('the space is trimmed', biz?.businessSpace === 'technology');
check('blank skills are dropped', biz?.businessSkills?.length === 1);
check('an emptied business skill list is treated as absent, not as junk',
  coerceOnboarding({ businessSpace: 'technology', businessSkills: [] })?.businessSkills === undefined);
check('business skills are capped',
  (coerceOnboarding({ businessSkills: Array.from({ length: 60 }, (_, i) => `s${i}`) })?.businessSkills?.length ?? 0) === 20);

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
