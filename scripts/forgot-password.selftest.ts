/**
 * Forgot password — the whole flow, without a server or a database.
 *
 *   A. OTP session: issue, resend throttle (no throw, no new code), replace,
 *      wrong-code attempts, lockout, expiry, email mismatch, single use.
 *   B. Password update: the hash written verifies with the new password and
 *      not the old one, nothing else on the account changes.
 *   C. Route contracts (source-pinned): no account enumeration, rate limits
 *      before lookup, password rules, single-use code, confirmation email,
 *      no session/auth required, and no extra route exports.
 *   D. UI wiring: the login "Forgot?" is a real link, the page exists, the
 *      middleware lets a signed-out visitor reach it, the login notice fires.
 */
delete process.env.MONGODB_URI;
delete process.env.MONGODB_DB;

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { createPasswordHash, verifyPassword } from '../lib/server/security';
import {
  createPasswordResetOtp, verifyPasswordResetOtp, consumePasswordResetOtp,
  PASSWORD_RESET_MAX_ATTEMPTS, PASSWORD_RESET_RESEND_MS,
} from '../lib/server/otp-sessions';

let passed = 0, failed = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}
const read = (p: string) => readFileSync(p, 'utf8');
async function throwsWith(fn: () => Promise<unknown>, re: RegExp): Promise<boolean> {
  try { await fn(); return false; } catch (e) { return re.test((e as Error).message); }
}

/* The OTP store is a JSON file when no database is configured. Back it up. */
const FILE = path.join(process.cwd(), 'data', 'otp-sessions.json');
const backup = existsSync(FILE) ? readFileSync(FILE, 'utf8') : null;
const restore = () => { if (backup === null) { if (existsSync(FILE)) unlinkSync(FILE); } else writeFileSync(FILE, backup); };
const readStore = () => JSON.parse(readFileSync(FILE, 'utf8')) as { sessions: Array<Record<string, unknown>> };
const setLastSent = (id: string, iso: string) => {
  const s = readStore(); for (const x of s.sessions) if (x.id === id) x.lastSentAt = iso; writeFileSync(FILE, JSON.stringify(s));
};
const setExpires = (id: string, iso: string) => {
  const s = readStore(); for (const x of s.sessions) if (x.id === id) x.expiresAt = iso; writeFileSync(FILE, JSON.stringify(s));
};

/* The other file stores the routes touch. Backed up and restored exactly. */
const DATA = (name: string) => path.join(process.cwd(), 'data', name);
const SIDE_FILES = ['users.json', 'mail-policies.json', 'email-outbox.json', 'auth-rate-limits.json'];
const sideBackup = new Map<string, string | null>();
function backupSide() { for (const f of SIDE_FILES) sideBackup.set(f, existsSync(DATA(f)) ? readFileSync(DATA(f), 'utf8') : null); }
function restoreSide() {
  for (const [f, content] of Array.from(sideBackup.entries())) {
    if (content === null) { if (existsSync(DATA(f))) unlinkSync(DATA(f)); } else writeFileSync(DATA(f), content);
  }
}

async function endToEnd() {
  backupSide();
  try {
    const { POST: start } = await import('../app/api/account/forgot-password/route');
    const { POST: reset } = await import('../app/api/account/reset-password/route');
    const { NextRequest } = await import('next/server');
    const post = (url: string, body: unknown, ip = '203.0.113.7') => new NextRequest(`http://localhost${url}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body),
    });

    /* A member with a known password and a login ID, in the file store. */
    const OLD = 'old-password-1';
    const user = {
      id: 'fp-e2e-user', email: 'fp.e2e@example.com', name: 'E2E Person', role: 'user', accountType: 'individual',
      loginId: 'E2E-Login', permissions: [], isActive: true, emailVerified: true,
      createdAt: '2026-01-01T00:00:00.000Z', ...createPasswordHash(OLD),
    };
    writeFileSync(DATA('users.json'), JSON.stringify([user]));
    /* Mail policy OFF for OTPs: sendTrackedMail then records a skipped outbox
       event (whose subject carries the code) instead of needing SMTP. */
    writeFileSync(DATA('mail-policies.json'), JSON.stringify({ otp_verification: false }));
    writeFileSync(DATA('auth-rate-limits.json'), '{}');
    if (existsSync(DATA('email-outbox.json'))) unlinkSync(DATA('email-outbox.json'));
    writeFileSync(FILE, JSON.stringify({ sessions: [] }));

    /* unknown identifier → same shape, nothing stored, nothing mailed */
    const unknown = await start(post('/api/account/forgot-password', { identifier: 'nobody@example.com' }));
    const unknownBody = await unknown.json();
    check('unknown email → 200 with a session id and a hint (indistinguishable)', unknown.status === 200 && unknownBody.ok === true
      && typeof unknownBody.sessionId === 'string' && unknownBody.sessionId.length >= 20 && unknownBody.emailHint === 'n*****@example.com');
    check('…but no session and no mail', readStore().sessions.length === 0 && !existsSync(DATA('email-outbox.json')));

    /* by LOGIN ID → real session, code "mailed" (outbox), hint empty */
    const byLogin = await start(post('/api/account/forgot-password', { identifier: '  e2e-login ' }));
    const byLoginBody = await byLogin.json();
    check('login ID → 200, session created for the account, no email hint', byLogin.status === 200 && byLoginBody.ok === true
      && readStore().sessions.length === 1 && readStore().sessions[0].userId === user.id && byLoginBody.emailHint === '');
    /* The file outbox is `{ events: [...] }`, newest first; a policy-skipped
       send is recorded with its subject, which carries the code. */
    const outboxEvents = () => (JSON.parse(readFileSync(DATA('email-outbox.json'), 'utf8')) as { events: Array<{ to: string; subject: string; status: string }> }).events;
    const outbox = outboxEvents();
    const mail = outbox[0];
    const code = (mail?.subject.match(/^(\d{6}) — /) ?? [])[1];
    check('the code went to the ACCOUNT email, not the identifier', mail?.to === user.email && !!code, JSON.stringify(mail));

    /* wrong password length / wrong code / wrong email */
    const short = await reset(post('/api/account/reset-password', { sessionId: byLoginBody.sessionId, email: user.email, otp: code, password: 'short' }));
    check('reset: short password → 400 before the code is spent', short.status === 400 && readStore().sessions[0].attempts === 0);
    const wrong = await reset(post('/api/account/reset-password', { sessionId: byLoginBody.sessionId, email: user.email, otp: '000000', password: 'new-password-2' }));
    check('reset: wrong code → 400 and one attempt spent', wrong.status === 400 && /Incorrect code/.test((await wrong.json()).error) && readStore().sessions[0].attempts === 1);
    const other = await reset(post('/api/account/reset-password', { sessionId: byLoginBody.sessionId, email: 'nobody@example.com', otp: code, password: 'new-password-2' }));
    check('reset: another email with the right code → 400', other.status === 400);
    check('…and the old password still works meanwhile', verifyPassword(OLD, JSON.parse(readFileSync(DATA('users.json'), 'utf8'))[0].passwordHash, JSON.parse(readFileSync(DATA('users.json'), 'utf8'))[0].passwordSalt));

    /* the real thing */
    const ok = await reset(post('/api/account/reset-password', { sessionId: byLoginBody.sessionId, email: 'FP.E2E@example.com', otp: code, password: 'new-password-2' }));
    check('reset: right code + email → 200 ok', ok.status === 200 && (await ok.json()).ok === true);
    const stored = JSON.parse(readFileSync(DATA('users.json'), 'utf8'))[0];
    check('the stored hash now verifies the NEW password and rejects the old',
      verifyPassword('new-password-2', stored.passwordHash, stored.passwordSalt) && !verifyPassword(OLD, stored.passwordHash, stored.passwordSalt));
    check('every other field on the account is untouched',
      stored.id === user.id && stored.email === user.email && stored.name === user.name && stored.loginId === user.loginId
      && stored.isActive === true && stored.emailVerified === true && stored.createdAt === user.createdAt);
    check('the code is consumed', readStore().sessions.length === 0);
    const replay = await reset(post('/api/account/reset-password', { sessionId: byLoginBody.sessionId, email: user.email, otp: code, password: 'new-password-3' }));
    check('replaying the same code → 400, password unchanged', replay.status === 400
      && verifyPassword('new-password-2', JSON.parse(readFileSync(DATA('users.json'), 'utf8'))[0].passwordHash, JSON.parse(readFileSync(DATA('users.json'), 'utf8'))[0].passwordSalt));

    /* resend inside the window: same session, no second mail */
    const r1 = await start(post('/api/account/forgot-password', { identifier: user.email }));
    const r1b = await r1.json();
    const r2 = await start(post('/api/account/forgot-password', { identifier: user.email }));
    const r2b = await r2.json();
    const outbox2 = outboxEvents();
    const codeMails = (evs: typeof outbox2) => evs.filter((e) => /password reset code/.test(e.subject)).length;
    check('the owner was told the password changed', outbox2.some((e) => e.to === user.email && /password was changed/.test(e.subject)));
    check('resend inside 45 s → same session id, one code mail only, still 200', r1.status === 200 && r2.status === 200 && r1b.sessionId === r2b.sessionId
      && codeMails(outbox2) === codeMails(outbox) + 1, `${codeMails(outbox2)} vs ${codeMails(outbox)}`);
    check('email identifier → masked hint of what was typed', r1b.emailHint === 'f*****@example.com', r1b.emailHint);

    /* abuse: per-identifier limit (3 per 10 min) then per-IP */
    let limited: number | null = null;
    for (let i = 0; i < 4; i += 1) {
      const res = await start(post('/api/account/forgot-password', { identifier: 'someone@example.com' }));
      if (res.status === 429) { limited = i; break; }
    }
    check('per-identifier rate limit kicks in for an UNKNOWN identifier too (no enumeration by throttle)', limited === 3);
    const bad = await start(post('/api/account/forgot-password', { identifier: '' }));
    check('empty identifier → 400', bad.status === 400);
    const malformed = await start(new NextRequest('http://localhost/api/account/forgot-password', { method: 'POST', body: '{nope' }));
    check('malformed JSON → 400', malformed.status === 400);
  } finally {
    restoreSide();
  }
}

(async () => {
  writeFileSync(FILE, JSON.stringify({ sessions: [] }));
  try {
    /* ═══ A. session lifecycle ═════════════════════════════════════════════ */
    console.log('A. reset-code session');
    const EMAIL = 'Person@Example.com';
    const first = await createPasswordResetOtp({ email: EMAIL, userId: 'u1' });
    check('issues a 6-digit code and a session', !!first.otp && /^\d{6}$/.test(first.otp!) && first.sessionId.length >= 20 && first.resent);
    check('the code is stored only as a salted hash', !JSON.stringify(readStore()).includes(first.otp!));
    check('the session is bound to the account and the normalised email',
      readStore().sessions[0].userId === 'u1' && readStore().sessions[0].email === 'person@example.com' && readStore().sessions[0].purpose === 'password_reset');

    const again = await createPasswordResetOtp({ email: EMAIL, userId: 'u1' });
    check('a resend inside the window returns the SAME session, no new code, no throw',
      again.sessionId === first.sessionId && again.otp === null && again.resent === false);

    setLastSent(first.sessionId, new Date(Date.now() - PASSWORD_RESET_RESEND_MS - 1000).toISOString());
    const third = await createPasswordResetOtp({ email: EMAIL, userId: 'u1' });
    check('after the window a NEW session replaces the old one', third.sessionId !== first.sessionId && !!third.otp);
    check('…and the old code no longer works',
      await throwsWith(() => verifyPasswordResetOtp({ sessionId: first.sessionId, email: EMAIL, otp: first.otp! }), /expired/));
    check('one live reset session per account', readStore().sessions.filter((s) => s.userId === 'u1').length === 1);

    check('wrong code is rejected and counts an attempt',
      await throwsWith(() => verifyPasswordResetOtp({ sessionId: third.sessionId, email: EMAIL, otp: '000000' }), /Incorrect code\. 4 attempts remaining/)
      && readStore().sessions[0].attempts === 1);
    check('malformed code is rejected before touching the session',
      await throwsWith(() => verifyPasswordResetOtp({ sessionId: third.sessionId, email: EMAIL, otp: '12ab' }), /6-digit/)
      && readStore().sessions[0].attempts === 1);
    check('a different email is rejected',
      await throwsWith(() => verifyPasswordResetOtp({ sessionId: third.sessionId, email: 'other@example.com', otp: third.otp! }), /different email/));
    check('an unknown session is "expired" (no distinct not-found message to probe)',
      await throwsWith(() => verifyPasswordResetOtp({ sessionId: 'nope-nope-nope-nope', email: EMAIL, otp: third.otp! }), /expired/));

    const ok = await verifyPasswordResetOtp({ sessionId: third.sessionId, email: EMAIL, otp: third.otp! });
    check('the right code verifies and names the account', ok.userId === 'u1' && ok.email === 'person@example.com');
    await consumePasswordResetOtp(third.sessionId);
    check('consumed: the same code cannot be used twice',
      await throwsWith(() => verifyPasswordResetOtp({ sessionId: third.sessionId, email: EMAIL, otp: third.otp! }), /expired/)
      && readStore().sessions.length === 0);

    /* lockout */
    const lock = await createPasswordResetOtp({ email: EMAIL, userId: 'u1' });
    for (let i = 0; i < PASSWORD_RESET_MAX_ATTEMPTS; i += 1) {
      await verifyPasswordResetOtp({ sessionId: lock.sessionId, email: EMAIL, otp: '999999' }).catch(() => undefined);
    }
    check(`locked after ${PASSWORD_RESET_MAX_ATTEMPTS} wrong codes, even with the right one`,
      await throwsWith(() => verifyPasswordResetOtp({ sessionId: lock.sessionId, email: EMAIL, otp: lock.otp! }), /Too many/));

    /* expiry */
    setLastSent(lock.sessionId, '2000-01-01T00:00:00.000Z');
    const exp = await createPasswordResetOtp({ email: EMAIL, userId: 'u1' });
    setExpires(exp.sessionId, new Date(Date.now() - 1000).toISOString());
    check('an expired session is pruned and reported as expired',
      await throwsWith(() => verifyPasswordResetOtp({ sessionId: exp.sessionId, email: EMAIL, otp: exp.otp! }), /expired/));

    check('invalid inputs are refused', await throwsWith(() => createPasswordResetOtp({ email: 'not-an-email', userId: 'u1' }), /Invalid email/)
      && await throwsWith(() => createPasswordResetOtp({ email: EMAIL, userId: '' }), /Invalid account/));

    /* ═══ B. password update ═══════════════════════════════════════════════ */
    console.log('B. password hash');
    const before = { id: 'u1', email: 'person@example.com', name: 'P', ...createPasswordHash('old-password-1') } as Record<string, unknown>;
    const after = { ...before, ...createPasswordHash('new-password-2') } as Record<string, unknown>;
    check('the new hash verifies the new password only',
      verifyPassword('new-password-2', after.passwordHash as string, after.passwordSalt as string)
      && !verifyPassword('old-password-1', after.passwordHash as string, after.passwordSalt as string));
    check('a fresh salt is issued', after.passwordSalt !== before.passwordSalt);
    check('nothing else on the account changes', after.id === before.id && after.email === before.email && after.name === before.name
      && Object.keys(after).sort().join() === Object.keys(before).sort().join());

    /* ═══ C. route contracts ═══════════════════════════════════════════════ */
    console.log('C. routes (source-pinned)');
    const START = read('app/api/account/forgot-password/route.ts');
    const RESET = read('app/api/account/reset-password/route.ts');
    check('start: signed-out — no session is required', !/getAuthSession|Unauthorized/.test(START));
    check('start: rate-limited per identifier and per IP BEFORE the lookup',
      START.indexOf('enforceRateLimits(') < START.indexOf('findAccount(identifier)') && /otpSendAccount/.test(START) && /otpSendIp/.test(START));
    check('start: unknown account answers the SAME 200 shape with a random session id',
      /ok: true,\s*sessionId: crypto\.randomBytes\(18\)\.toString\('base64url'\)/.test(START));
    check('start: an existing account is never confirmed in the body (no "not found", no 404)',
      !/status: 404/.test(START) && !/not found|No account/i.test(START.replace(/\/\*[\s\S]*?\*\//g, '')));
    check('start: the email hint is derived only from what was typed', (START.match(/maskEmail\(normalizeEmail\(identifier\)\)/g) ?? []).length === 2 && !/maskEmail\(user\.email\)/.test(START));
    check('start: mail is sent only when a NEW code was issued', /if \(otp\) \{\s*await sendPasswordResetOtpEmail/.test(START));
    check('start: accounts pending deletion are skipped', (START.match(/pendingDeletion/g) ?? []).length >= 2);
    check('start: captcha is judged server-side when a token is present', /verifyCaptcha\(body\.captchaToken\)/.test(START));

    check('reset: signed-out — the SESSION names the account, never the client', !/getAuthSession/.test(RESET) && /\(\{ userId \} = await verifyPasswordResetOtp/.test(RESET) && !/body\.userId/.test(RESET));
    check('reset: password must be at least 8 characters', /MIN_PASSWORD_LENGTH = 8/.test(RESET) && /password\.length < MIN_PASSWORD_LENGTH/.test(RESET));
    check('reset: rate-limited per email and per IP before verifying', RESET.indexOf('enforceRateLimits(') < RESET.indexOf('verifyPasswordResetOtp(') && /otpVerifyAccount/.test(RESET) && /otpVerifyIp/.test(RESET));
    check('reset: the account email must still match the code\'s email', /normalizeEmail\(user\.email\) !== email/.test(RESET));
    check('reset: hashed with createPasswordHash, saved with upsertStoredUser', /upsertStoredUser\(\{ \.\.\.user, \.\.\.createPasswordHash\(password\) \}\)/.test(RESET));
    check('reset: the code is consumed after use', RESET.indexOf('createPasswordHash(password)') < RESET.indexOf('await consumePasswordResetOtp(sessionId);\n\n'));
    check('reset: the owner is emailed, without blocking the response', /void sendPasswordChangedEmail\(/.test(RESET));
    check('reset: no verified-but-unconsumed shortcut (verifiedAt is not an accepted state)', !/verifiedAt\) return/.test(read('lib/server/otp-sessions.ts').split('Password reset OTP')[1] ?? ''));
    for (const [name, src] of [['start', START], ['reset', RESET]] as const) {
      const exportsFound = Array.from(src.matchAll(/^export (?:const|function|async function) (\w+)/gm)).map((m) => m[1]);
      check(`${name}: only App Router exports (${exportsFound.join(', ')})`, exportsFound.every((e) => ['dynamic', 'POST', 'runtime', 'maxDuration'].includes(e)));
    }

    /* ═══ D. UI wiring ═════════════════════════════════════════════════════ */
    console.log('D. UI wiring');
    const LOGIN = read('app/login/page.tsx');
    check('login: "Forgot?" is a real link to /forgot-password', /<Link href="\/forgot-password"[^>]*>Forgot\?<\/Link>/.test(LOGIN));
    check('login: no dead "Forgot?" span remains', !/<span[^>]*>Forgot\?<\/span>/.test(LOGIN));
    check('login: shows the post-reset notice and clears the flag', /params\.get\('reset'\) !== 'done'/.test(LOGIN) && /params\.delete\('reset'\)/.test(LOGIN));
    check('page: exists as a client component with the three steps', existsSync('app/forgot-password/page.tsx')
      && /'use client'/.test(read('app/forgot-password/page.tsx')) && /'request' \| 'reset' \| 'done'/.test(read('app/forgot-password/page.tsx')));
    const PAGE = read('app/forgot-password/page.tsx');
    check('page: posts to both routes and never reads the code from the URL', /\/api\/account\/forgot-password/.test(PAGE) && /\/api\/account\/reset-password/.test(PAGE) && !/searchParams|location\.search/.test(PAGE));
    check('page: confirms the password and enforces the same minimum', /password !== confirm/.test(PAGE) && /MIN_PASSWORD_LENGTH = 8/.test(PAGE));
    check('page: resend waits out the same window the server enforces', /RESEND_SECONDS = 45/.test(PAGE) && PASSWORD_RESET_RESEND_MS === 45_000);
    check('page: returns to login with the notice flag', /\/login\?reset=done/.test(PAGE));
    check('page: noindex', /noindex/.test(read('app/forgot-password/head.tsx')));
    check('middleware: an unverified signed-in individual can still reach the page', /'\/forgot-password',/.test(read('middleware.ts')));
    check('emails: reset code and changed-password confirmation exist', /export async function sendPasswordResetOtpEmail/.test(read('lib/server/account-emails.ts'))
      && /export async function sendPasswordChangedEmail/.test(read('lib/server/account-emails.ts')));

    /* ═══ E. end to end through the route handlers (file stores, no SMTP) ══ */
    console.log('E. end to end: request → code → reset → login hash');
    await endToEnd();
  } finally {
    restore();
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => { restore(); console.error(error); process.exit(1); });
