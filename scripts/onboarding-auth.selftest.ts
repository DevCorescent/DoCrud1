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
 *
 * THE INVARIANT THIS FILE EXISTS FOR: no account is created until the code
 * mailed to the address has come back. The flow used to create the account,
 * sign in, and only then try to send a code — so a delivery failure left a
 * real, signed-in, unverified account behind, and the business branch mailed
 * nothing at all because the endpoint it called demanded a verified-OTP session
 * it was never given. Sections 4, 5 and 12 are where that must not come back.
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
const START = strip(src('app/api/onboarding/signup/start/route.ts'));
const VERIFY = strip(src('app/api/onboarding/signup/verify/route.ts'));
const RESEND = strip(src('app/api/onboarding/signup/resend/route.ts'));
const PENDING = strip(src('lib/server/pending-signups.ts'));
const SENDER = strip(src('lib/server/otp-email.ts'));
const FLOW = src('app/onboarding/OnboardingClient.tsx');
const MIDDLEWARE = strip(src('middleware.ts'));
const SECRET = strip(src('lib/auth-secret.ts'));

/* ═══ 1–2. The challenge gates both paths ═══════════════════════════════ */
console.log('\n── 1. CAPTCHA gates Google ──');
check('the gate renders the existing verification component', /<SecurityVerification/.test(GATE));
check('a token is required before Google starts', /if \(!verified\) return needVerification\(\);/.test(GATE_CODE));
check('Google is only reached after that guard',
  GATE_CODE.indexOf('const startGoogle') < GATE_CODE.indexOf("signIn('google'"));
check('the gate stays usable where Turnstile is not configured',
  /!isTurnstileEnabled\(\) \|\| Boolean\(captcha\)/.test(GATE_CODE));

console.log('── 2. CAPTCHA gates email and OTP ──');
check('the email form refuses to submit unverified', /submitEmail[\s\S]{0,300}if \(!verified\)/.test(GATE_CODE));
check('the token is sent to the endpoint that stages the signup',
  /captchaToken: captcha \|\| captchaSnapshotRef\.current/.test(GATE_CODE));
/* The server is what actually judges it — the UI guard is convenience. */
check('the staging endpoint enforces the challenge server-side', /enforceCaptcha/.test(START));
check('it does so before anything is staged or mailed',
  START.indexOf('enforceCaptcha') < START.indexOf('createPendingSignup'));
check('a spent token is not reused', /resetCaptcha/.test(GATE_CODE));
/* THE RETRY TRAP. The widget used to live inside the `choose` block, so it
   unmounted the moment the person moved to the email form. `startSignup` spends
   the token there; any failure then called resetCaptcha() against a widget that
   was no longer on screen, so no replacement token could ever be produced and
   every retry sent a spent one for enforceCaptcha to refuse — a person who
   failed once could not get a code at all. The widget must therefore be
   rendered OUTSIDE the mode blocks, live on every screen that spends a token. */
check('the widget is rendered once, outside the mode blocks',
  (GATE.match(/<SecurityVerification/g) ?? []).length === 1);
check('and it is live on every screen that spends a token',
  /\{mode !== 'otp' && \(\s*<SecurityVerification/.test(GATE));
check('the token sent is the LIVE one, not a snapshot of a spent screen',
  /captchaToken: captcha \|\| captchaSnapshotRef\.current/.test(GATE_CODE));
check('a reset clears the fallback too, so a spent token cannot be resent',
  /captchaSnapshotRef\.current = ''/.test(GATE_CODE));
/* Resend cannot carry a token — the widget is unmounted by then — so it is
   bound to the server-issued handle instead, and mails only the address that
   handle was staged with. */
check('resend takes no address from the caller', !/body\.email/.test(RESEND));
check('resend mails the address stored against the handle', /to: pending\.email/.test(RESEND));
check('resend is rate limited per account and per IP',
  /otpSendAccount/.test(RESEND) && /otpSendIp/.test(RESEND));

/* ═══ 3–5. Existing systems, not new ones ═══════════════════════════════ */
console.log('── 3. No second auth system ──');
check('the signup is staged through the onboarding endpoint', /'\/api\/onboarding\/signup\/start'/.test(GATE));
check('sign-in goes through NextAuth credentials', /signIn\('credentials'/.test(GATE));
check('Google goes through NextAuth', /signIn\('google'/.test(GATE));
check('the OAuth intent endpoint is reused', /'\/api\/auth\/oauth-intent'/.test(GATE));
check('the code is verified by the onboarding endpoint', /'\/api\/onboarding\/signup\/verify'/.test(GATE));
check('resend has its own endpoint, not a second sender', /'\/api\/onboarding\/signup\/resend'/.test(GATE));
check('account creation reuses the shared provisioning modules',
  /provisionIndividualAccount/.test(VERIFY) && /provisionBusinessAccount/.test(VERIFY));
check('and the standalone signup route uses the same one',
  /provisionIndividualAccount/.test(strip(src('app/api/individual/signup/route.ts'))));
check('no password hashing happens in the browser',
  !/(bcrypt|scrypt|createHash|sha256)/i.test(GATE_CODE));
check('the password is never stored anywhere client-side',
  !/(localStorage|sessionStorage|document\.cookie)/.test(GATE_CODE));
check('and never rides the OAuth intent',
  !/password/.test(strip(src('lib/server/oauth-intent.ts'))));

console.log('── 4. NOTHING is created before the code comes back ──');
/* The reported bug and the security hole were the same thing: the gate created
   the account, signed in, and only then tried to mail a code — so a delivery
   failure left a real, signed-in, unverified account behind. The order is now
   reversed, and this is where that must not regress. */
const SUBMIT_EMAIL = GATE_CODE.slice(
  GATE_CODE.indexOf('const submitEmail'),
  GATE_CODE.indexOf('const submitOtp'),
);
check('the email step only stages and mails',
  /await startSignup\(\)/.test(SUBMIT_EMAIL));
check('the code screen is reached only after a code was sent',
  /await startSignup\(\);\s*\n[\s\S]{0,200}setMode\('otp'\)/.test(SUBMIT_EMAIL));
check('the gate never calls a signup endpoint that creates an account',
  !/api\/individual\/signup/.test(GATE_CODE) && !/api\/saas\/signup/.test(GATE_CODE));
check('nothing is signed in before the code is verified',
  SUBMIT_EMAIL.indexOf("signIn('credentials'") === -1);
check('the staging endpoint creates no account',
  !/provisionIndividualAccount|provisionBusinessAccount|saveStoredUsers/.test(START));
check('a code that could not be delivered leaves nothing behind',
  /discardPendingSignup/.test(START)
  && START.lastIndexOf('sendOtpEmail') < START.lastIndexOf('discardPendingSignup'));
check('an address that already has an account is refused, not mailed',
  /account_exists/.test(START) && START.indexOf('account_exists') < START.lastIndexOf('createPendingSignup'));

console.log('── 5. The code is what creates the account ──');
check('the account is created only after the code is consumed',
  VERIFY.indexOf('consumePendingSignup') < VERIFY.indexOf('provisionIndividualAccount')
  && VERIFY.indexOf('consumePendingSignup') < VERIFY.indexOf('provisionBusinessAccount'));
check('a rejected code returns before any account work',
  /if \(!result\.ok\)[\s\S]{0,400}return NextResponse\.json/.test(VERIFY));
check('the verified flag is set by the server, from the code it just checked',
  /emailVerified: true/.test(VERIFY) && !/body\.emailVerified/.test(VERIFY));
check('the answers are written server-side from the staged record, not from the request',
  /answers\?\.roles/.test(VERIFY) && /const answers = pending\.onboarding/.test(VERIFY));
check('the account kind comes from the staged record too',
  /pending\.accountKind === 'business'/.test(VERIFY) && !/body\.accountKind/.test(VERIFY));
check('the browser signs in only after verification succeeded',
  GATE_CODE.indexOf('signup/verify') < GATE_CODE.indexOf("signIn('credentials'"));
check('Home is only reached from onDone', /onDone=\{\(\) => router\.push\('\/'\)\}/.test(FLOW));

console.log('── 5c. The session the flow ends with actually exists server-side ──');
/* Signing in is not the end of the flow — landing on the homepage is. With no
   NEXTAUTH_SECRET, NextAuth's route handler derived a fallback of its own and
   happily returned a session to the browser, while `authOptions.secret` stayed
   undefined — so getServerSession() could not decrypt the cookie the route
   handler had just issued, and the homepage bounced the freshly verified person
   straight back to /onboarding. The signer and every reader must resolve the
   secret through ONE function. */
check('there is a single resolver for the auth secret',
  /export function getAuthSecret/.test(SECRET));
check('the auth options read it from there',
  /from '@\/lib\/auth-secret'/.test(strip(src('lib/server/auth.ts'))));
check('and the middleware passes it explicitly rather than reading the env itself',
  /getToken\(\{ req: request, secret: getAuthSecret\(\) \}\)/.test(MIDDLEWARE));
check('the development fallback never applies in production',
  /NODE_ENV === 'production'[\s\S]{0,200}return undefined/.test(SECRET));
check('so a production deployment with no secret fails loudly instead of logging everyone out',
  !/DEVELOPMENT_FALLBACK_SECRET;\s*\n\}/.test(
    SECRET.slice(0, SECRET.indexOf("NODE_ENV === 'production'"))));

console.log('── 5b. The staged signup is worth nothing to a reader ──');
check('the password is hashed before it is ever stored',
  /createPasswordHash/.test(PENDING) && !/password: input\.password/.test(PENDING));
check('the code is stored as a salted hash, never in the clear',
  /otpHash/.test(PENDING) && !/\botp: otp\b/.test(PENDING));
check('codes are compared in constant time', /timingSafeEqual/.test(PENDING));
check('codes come from the CSPRNG', /crypto\.randomInt/.test(PENDING));
check('the handle is unguessable', /randomBytes\(32\)/.test(PENDING));
check('a record expires', /expiresAt/.test(PENDING) && /PENDING_SIGNUP_TTL_MS/.test(PENDING));
check('guesses are capped', /PENDING_SIGNUP_MAX_ATTEMPTS/.test(PENDING));
check('a resend does not reset the guess budget',
  /attempts >= PENDING_SIGNUP_MAX_ATTEMPTS/.test(
    PENDING.slice(PENDING.indexOf('beginPendingSignupResend'))));
check('a correct code is single-use — consumed under the storage lock',
  /withStorageLock/.test(PENDING)
  && /records\.splice\(index, 1\)[\s\S]{0,120}return \{ ok: true/.test(PENDING));
check('the handle is bound to its address', /record\.email !== normalizedEmail/.test(PENDING));

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

console.log('── 12. Business takes the same code-first path ──');
/* The business branch used to post to /api/saas/signup, which refuses to create
   a workspace without a verified-OTP session — one it was never given. So the
   call always failed, the flow never reached the send, and no code was ever
   mailed to a business signup at all. Both kinds now go through the one
   endpoint that mails first and creates afterwards. */
check('business and individual use the SAME staging endpoint',
  (GATE_CODE.match(/\/api\/onboarding\/signup\/start/g) ?? []).length === 1);
check('the gate no longer posts to a route that creates before verifying',
  !/api\/saas\/signup/.test(GATE_CODE) && !/api\/individual\/signup/.test(GATE_CODE));
check('the account kind is sent as itself, not as a choice of endpoint',
  /accountKind,/.test(GATE_CODE));
check('and the server, not the request, decides what that kind may be',
  /body\.accountKind === 'business' \? 'business' : 'individual'/.test(START));
check('the workspace is created by the same verified step as an individual',
  /provisionBusinessAccount/.test(VERIFY)
  && VERIFY.indexOf('consumePendingSignup') < VERIFY.indexOf('provisionBusinessAccount'));
check('the business answers land on the workspace, not the person',
  /saveBusinessSettings/.test(VERIFY) && /talentSkills: answers\.businessSkills/.test(VERIFY));
check('the same captcha gate covers business', /if \(!verified\) return needVerification\(\);/.test(GATE_CODE));
check('a workspace name is required before business signup',
  /isBusiness && !organization\.trim\(\)/.test(GATE_CODE));
check('and required again on the server', /Tell us your organization name/.test(START));
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

/* ═══ OTP: the first code is SENT, not requested by the person ═══════════
   The reported bug was reaching the email form and going no further: no code,
   no OTP screen. The sequence itself was correct — signup → credentials →
   send-otp → setMode('otp') — so a send failure threw before the transition
   and left the person on the form. What was genuinely missing was any way to
   ask again, and the delivery failure itself proved to be environmental (the
   configured relay host is unreachable), not a code defect. */

check('the first code is sent automatically, inside the email submit',
  /await startSignup\(\);\s*\n[\s\S]{0,200}setMode\('otp'\)/.test(GATE_CODE));
check('reaching the OTP screen never depends on pressing Resend',
  !/resendOtp\(\)[\s\S]{0,80}setMode\('otp'\)/.test(GATE_CODE));
check('resend is never called on mount',
  !/useEffect\([^)]*\)[\s\S]{0,200}resendOtp\(\)/.test(GATE_CODE));
check('the first send and the resend are distinct server operations',
  (GATE_CODE.match(/\/api\/onboarding\/signup\/start/g) ?? []).length === 1
  && (GATE_CODE.match(/\/api\/onboarding\/signup\/resend/g) ?? []).length === 1);
check('and both build their message through the one shared sender',
  /sendOtpEmail/.test(START) && /sendOtpEmail/.test(RESEND)
  && /sendOtpEmail/.test(strip(src('app/api/onboarding/send-otp/route.ts'))));

/* ── The OTP screen has everything it needs ── */
check('the OTP screen takes a six-digit code', /maxLength=\{6\}/.test(GATE_CODE));
check('the OTP screen has a Verify action', /Verifying…' : 'Verify'/.test(GATE_CODE));
check('the OTP screen offers a resend', /auth-resend-button/.test(GATE_CODE) && /resendOtp/.test(GATE_CODE));
check('the OTP screen names the address being verified',
  /We sent a 6-digit code to \$\{email\}/.test(GATE_CODE));
check('verification posts to the code-first verify endpoint',
  /\/api\/onboarding\/signup\/verify/.test(GATE_CODE));
check('the handle, not the answers, is what the second step carries',
  /pendingId: pendingIdRef\.current/.test(GATE_CODE));

/* ── The code screen says what happened to the code ── */
check('the outcome lives next to the box the code was typed into',
  /auth-verify-status/.test(GATE_CODE) && /id="onboarding-otp-status"/.test(GATE_CODE));
check('all three outcomes are stated in words',
  /Checking your code/.test(GATE_CODE) && /OTP verified/.test(GATE_CODE)
  && /Verification failed/.test(GATE_CODE));
check('colour is never the only signal — each state carries its own icon',
  /CheckCircle2/.test(GATE_CODE) && /AlertCircle/.test(GATE_CODE));
check('and it is announced to assistive technology',
  /role=\{verify\.kind === 'failed' \? 'alert' : 'status'\}/.test(GATE_CODE)
  && /aria-live=/.test(GATE_CODE));
check('the remaining guesses come from the server, not a browser tally',
  /attemptsLeft: typeof body\?\.attemptsLeft === 'number'/.test(GATE_CODE));
check('the refusal clears as soon as a different code is typed',
  /if \(verify\.kind === 'failed'\) setVerify\(\{ kind: 'idle' \}\)/.test(GATE_CODE));
check('success is confirmed BEFORE the sign-in it triggers, since the code really did work',
  GATE_CODE.indexOf("setVerify({ kind: 'verified', detail: 'Signing you in…' })")
    < GATE_CODE.indexOf("signIn('credentials'"));
check('a sign-in failure does not retract a verification that genuinely happened',
  /setVerify\(\{ kind: 'verified', detail: 'Your account is ready\.' \}\)/.test(GATE_CODE));
check('the confirmation is held long enough to read, without delaying the sign-in',
  /VERIFIED_HOLD_MS = \d+/.test(GATE_CODE) && /Promise\.all\(\[/.test(GATE_CODE));
check('nothing offers to resend a code that has already been accepted',
  /verify\.kind !== 'verified' && \(/.test(GATE_CODE));

/* ── The cooldown belongs to the server ── */
check('a refused resend reads the server\'s Retry-After',
  /res\.status === 429/.test(GATE_CODE) && /headers\.get\('Retry-After'\)/.test(GATE_CODE));
check('and the wait shown is the one the server gave',
  /setCooldown\(wait\)/.test(GATE_CODE));
check('resend is blocked while a cooldown is running',
  /if \(cooldown > 0 \|\| resending \|\| !pendingIdRef\.current\) return;/.test(GATE_CODE));
check('the server enforces the same wait rather than trusting the button',
  /PENDING_SIGNUP_RESEND_COOLDOWN_MS/.test(PENDING) && /just sent/i.test(PENDING));
check('the remaining wait is stated, not merely implied by a disabled button',
  /Resend code in \{cooldown\}s/.test(GATE_CODE));
check('the courtesy cooldown is a named constant, not a magic number',
  /RESEND_COOLDOWN_SECONDS = \d+/.test(GATE_CODE));
check('a failed resend does not destroy a code the person may already hold',
  RESEND.lastIndexOf('sendOtpEmail') < RESEND.lastIndexOf('commitPendingSignupOtp'));

/* ── Failure keeps the person where they are ── */
/* A wrong code is now REPORTED rather than thrown: the screen stays, the status
   line says why, and the person can simply retype. */
check('a wrong code leaves the OTP screen up',
  /const submitOtp[\s\S]*?catch \(e\) \{[\s\S]{0,200}setVerify\(\{\s*\n?\s*kind: 'failed'/.test(GATE_CODE));
check('a wrong code never advances to Home',
  /kind: 'failed',[\s\S]{0,500}\}\);\s*\n\s*return;/.test(GATE_CODE)
  && GATE_CODE.indexOf("kind: 'failed',") < GATE_CODE.indexOf('onDone();'));
check('a spent session sends the person back to the form, not to a dead end',
  /body\?\.code === 'restart'[\s\S]{0,200}setMode\('email'\)/.test(GATE_CODE));
check('the answers reach the profile only through the verified server step',
  !/handoff/.test(GATE_CODE) && /updateProfileData/.test(VERIFY));

/* ── The sender ── */
check('the staged code is a HASH, never the code itself',
  /otpHash/.test(PENDING) && !/\botp: otp\b/.test(PENDING));
check('the code is never put in a cookie',
  !/cookies\(\)/.test(START) && !/cookies\(\)/.test(VERIFY) && !/cookies\(\)/.test(SENDER));
check('a delivery failure is a real failure, not a 200',
  /status: 502/.test(START) && /throw new Error\(summary\)/.test(SENDER));
check('the re-verification route still answers 500 rather than a false success',
  /status: 500/.test(strip(src('app/api/onboarding/send-otp/route.ts'))));
check('the internal SMTP error is NOT returned to the caller',
  !/error: summary/.test(START) && !/dispatchErr/.test(
    strip(src('app/api/onboarding/send-otp/route.ts')).split('catch (dispatchErr)')[1] ?? ''));
check('the caller gets a safe, generic message instead',
  /We could not send your code right now/.test(strip(src('app/api/onboarding/send-otp/route.ts')))
  && /We could not send your code right now/.test(START));
check('the real cause is still recorded server-side',
  /console\.error\('\[onboarding\/signup\/start\] delivery failed'/.test(START)
  && /status: 'failed'/.test(SENDER));
check('anonymous senders still face the captcha',
  /enforceCaptcha\(body\.captchaToken/.test(strip(src('app/api/onboarding/send-otp/route.ts')))
  && /enforceCaptcha\(body\.captchaToken/.test(START));
check('send is still rate limited per account and per IP',
  /otpSendAccount/.test(START) && /otpSendIp/.test(START));
check('verification is rate limited per account and per IP',
  /otpVerifyAccount/.test(VERIFY) && /otpVerifyIp/.test(VERIFY));

/* The delivery budget is what actually broke the send: a 6-second connect
   against a relay documented at a 10–15 second cold start. It must not be
   quietly tightened back below what the relay needs. */
check('the code goes out over the application\'s one pooled transport',
  /getMailProvider\(\)\.send/.test(SENDER));
check('a blocked submission port is not the end of the attempt',
  /altPort/.test(SENDER) && /direct-mx-587/.test(SENDER));
check('no fallback connects on a budget shorter than the relay\'s cold start',
  (SENDER.match(/connectionTimeout: (\d+)_000/g) ?? [])
    .every((m) => Number(/\d+/.exec(m)![0]) >= 10));
check('and the route allows time for the whole walk',
  /maxDuration = 60/.test(START) && /maxDuration = 60/.test(RESEND));

/* Speed. The budget above is what a SLOW relay is allowed; none of it may be
   spent on work whose outcome is already known. */
check('a relay with no credentials to authenticate with is not dialled at all',
  /const relayUsable = Boolean\(smtp\.host\)/.test(SENDER)
  && /!smtp\.requireAuth \|\| Boolean\(smtp\.username && smtp\.password\)/.test(SENDER));
check('rejected credentials are not re-offered on the other port',
  /credentialsRejected/.test(SENDER) && /result\.kind === 'auth'/.test(SENDER));
check('the MX lookup is paid only when the direct fallback is reached',
  SENDER.indexOf('resolveTopMx(recipientDomain)') > SENDER.indexOf('run: async () =>'));
check('the two configuration reads go together, not one after the other',
  /const \[smtp, configured\] = await Promise\.all\(\[/.test(SENDER));
check('recording the outbox row does not stand in front of the send',
  /const recorded = appendEmailOutboxEvent/.test(SENDER)
  && SENDER.indexOf('const recorded = appendEmailOutboxEvent') < SENDER.indexOf('runAttempt(attempt)'));
check('but the row is always inserted before it is updated',
  (SENDER.match(/await recorded;/g) ?? []).length === 2);

/* The concern is a VALUE reaching a log, not the word "otp" appearing in a
   route label. So this looks for the actual variables being interpolated or
   passed into a console call. */
const LOGGED = [START, VERIFY, RESEND, PENDING, SENDER, strip(src('app/api/onboarding/send-otp/route.ts'))].join('\n');
const CONSOLE_ARGS = (LOGGED.match(/console\.(?:log|error|warn)\(([\s\S]*?)\);/g) ?? []).join('\n');
check('the OTP value is never logged',
  !/\$\{\s*otp\s*\}/.test(CONSOLE_ARGS) && !/[(,]\s*otp\s*[,)]/.test(CONSOLE_ARGS));
check('no password or SMTP credential is logged',
  !/\$\{[^}]*\b(password|pass|smtp\.password|smtp\.username)\b[^}]*\}/.test(CONSOLE_ARGS)
  && !/[(,]\s*(password|smtp)\s*[,)]/.test(CONSOLE_ARGS));
check('and no password is written to the staged record in the clear',
  !/password: input\.password/.test(PENDING) && !/plaintext/i.test(PENDING));

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
