/**
 * Onboarding signup — the pending-signup store, executed for real.
 *
 * Run: npm run test:onboarding-signup-otp
 *
 * scripts/onboarding-auth.selftest.ts asserts the SHAPE of the flow against
 * source. This one runs the store: it creates staged signups, gets codes wrong,
 * redeems them, replays them, and lets them expire, against the real JSON
 * storage path. The properties below are the ones that make "no account until
 * the code comes back" mean something, and none of them can be checked by
 * reading the file.
 *
 * MongoDB is explicitly disabled so this exercises the local JSON store; the
 * previous contents of data/pending-signups.json are restored at the end.
 */
delete process.env.MONGODB_URI;
delete process.env.MONGODB_DB;

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { verifyPassword } from '../lib/server/security';
import {
  createPendingSignup, consumePendingSignup, beginPendingSignupResend,
  commitPendingSignupOtp, discardPendingSignup, peekPendingSignup,
  PENDING_SIGNUP_MAX_ATTEMPTS,
} from '../lib/server/pending-signups';

let passed = 0, failed = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); return; }
  failed += 1;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const FILE = path.join(process.cwd(), 'data', 'pending-signups.json');
let backup: string | null = null;

const PASSWORD = 'correct horse battery';

function stage(email: string, over: Partial<Parameters<typeof createPendingSignup>[0]> = {}) {
  return createPendingSignup({
    email,
    name: 'Priya Sharma',
    password: PASSWORD,
    accountKind: 'individual',
    onboarding: { roles: ['software'], skills: ['React'] },
    ...over,
  });
}

/** The raw file, which is what an attacker who reached the disk would read. */
function rawStore(): string {
  return existsSync(FILE) ? readFileSync(FILE, 'utf8') : '';
}

async function main() {
  if (existsSync(FILE)) backup = readFileSync(FILE, 'utf8');
  writeFileSync(FILE, JSON.stringify({ pending: [] }));

  console.log('\n── 1. Staging creates a code, not an account ──');
  {
    const { pending, otp } = await stage('one@example.com');
    check('a handle is issued', pending.id.length >= 32);
    check('the code is six digits', /^\d{6}$/.test(otp));
    check('the record knows the address', pending.email === 'one@example.com');
    check('the answers are carried', pending.onboarding?.skills?.[0] === 'React');

    const raw = rawStore();
    check('the code is NOT in the store', !raw.includes(otp));
    check('the password is NOT in the store', !raw.includes(PASSWORD));
    check('the password is there as a scrypt hash that still verifies',
      verifyPassword(PASSWORD, pending.passwordHash, pending.passwordSalt));
    check('and a wrong password does not verify',
      !verifyPassword('something else', pending.passwordHash, pending.passwordSalt));
    await discardPendingSignup(pending.id);
  }

  console.log('\n── 2. A correct code is redeemed exactly once ──');
  {
    const { pending, otp } = await stage('two@example.com');
    const first = await consumePendingSignup(pending.id, 'two@example.com', otp);
    check('the right code is accepted', first.ok === true);
    check('and hands back what was staged',
      first.ok && first.pending.name === 'Priya Sharma');

    const replay = await consumePendingSignup(pending.id, 'two@example.com', otp);
    check('the same code cannot be used twice', replay.ok === false);
    check('a replay reads as expired, not as a wrong digit',
      !replay.ok && /start again/i.test(replay.error), !replay.ok ? replay.error : '');
  }

  console.log('\n── 3. The handle is bound to its address ──');
  {
    const { pending, otp } = await stage('three@example.com');
    const wrongAddress = await consumePendingSignup(pending.id, 'someone.else@example.com', otp);
    check('a code cannot be redeemed against another address', wrongAddress.ok === false);
    check('and the record survives that attempt, unspent',
      (await consumePendingSignup(pending.id, 'three@example.com', otp)).ok === true);
  }

  console.log('\n── 4. Guessing is bounded ──');
  {
    const { pending, otp } = await stage('four@example.com');
    const wrong = otp === '111111' ? '222222' : '111111';
    for (let i = 1; i < PENDING_SIGNUP_MAX_ATTEMPTS; i += 1) {
      const attempt = await consumePendingSignup(pending.id, 'four@example.com', wrong);
      check(`attempt ${i} is refused and counted`,
        !attempt.ok && attempt.attemptsLeft === PENDING_SIGNUP_MAX_ATTEMPTS - i,
        !attempt.ok ? String(attempt.attemptsLeft) : '');
    }
    const last = await consumePendingSignup(pending.id, 'four@example.com', wrong);
    check('the final wrong code destroys the record', !last.ok && last.attemptsLeft === 0);
    check('and the real code no longer works either',
      (await consumePendingSignup(pending.id, 'four@example.com', otp)).ok === false);
    check('the record is gone from the store', (await peekPendingSignup(pending.id)) === null);
  }

  console.log('\n── 5. A resend does not buy more guesses ──');
  {
    const { pending, otp } = await stage('five@example.com');
    const wrong = otp === '111111' ? '222222' : '111111';
    await consumePendingSignup(pending.id, 'five@example.com', wrong);
    await consumePendingSignup(pending.id, 'five@example.com', wrong);

    /* The cooldown is real, so wind the clock back rather than sleeping. */
    const store = JSON.parse(rawStore()) as { pending: Array<Record<string, unknown>> };
    store.pending[0].lastSentAt = new Date(Date.now() - 60_000).toISOString();
    writeFileSync(FILE, JSON.stringify(store));

    const again = await beginPendingSignupResend(pending.id);
    check('the guess count carries over a resend', again.pending.attempts === 2,
      String(again.pending.attempts));
    check('a new code is minted', again.otp !== otp || again.hashed.otpSalt !== pending.otpSalt);
    check('the old code still works until the new one is delivered',
      (await consumePendingSignup(pending.id, 'five@example.com', otp)).ok === true);
  }

  console.log('\n── 6. Delivery is what retires the previous code ──');
  {
    const { pending, otp } = await stage('six@example.com');
    const store = JSON.parse(rawStore()) as { pending: Array<Record<string, unknown>> };
    store.pending[0].lastSentAt = new Date(Date.now() - 60_000).toISOString();
    writeFileSync(FILE, JSON.stringify(store));

    const resend = await beginPendingSignupResend(pending.id);
    await commitPendingSignupOtp(pending.id, resend.hashed);
    check('once committed, the old code stops working',
      (await consumePendingSignup(pending.id, 'six@example.com', otp)).ok === false);
    check('and the new one works', (await consumePendingSignup(pending.id, 'six@example.com', resend.otp)).ok === true);
  }

  console.log('\n── 7. A resend is throttled ──');
  {
    const { pending } = await stage('seven@example.com');
    let refused = '';
    try { await beginPendingSignupResend(pending.id); } catch (e) { refused = (e as Error).message; }
    check('an immediate resend is refused', /just sent/i.test(refused), refused);
    await discardPendingSignup(pending.id);
  }

  console.log('\n── 8. Expiry leaves nothing behind ──');
  {
    const { pending, otp } = await stage('eight@example.com');
    const store = JSON.parse(rawStore()) as { pending: Array<Record<string, unknown>> };
    store.pending[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    writeFileSync(FILE, JSON.stringify(store));

    check('an expired record is invisible', (await peekPendingSignup(pending.id)) === null);
    const expired = await consumePendingSignup(pending.id, 'eight@example.com', otp);
    check('and its code is refused', !expired.ok && /start again/i.test(expired.error));
  }

  console.log('\n── 9. One live record per address ──');
  {
    const first = await stage('nine@example.com');
    const second = await stage('nine@example.com');
    check('starting again invalidates the first code',
      (await consumePendingSignup(first.pending.id, 'nine@example.com', first.otp)).ok === false);
    check('and the newest one works',
      (await consumePendingSignup(second.pending.id, 'nine@example.com', second.otp)).ok === true);
  }

  console.log('\n── 10. Malformed input is refused, not guessed at ──');
  {
    const { pending } = await stage('ten@example.com');
    check('a non-numeric code is refused',
      (await consumePendingSignup(pending.id, 'ten@example.com', 'abcdef')).ok === false);
    check('a short code is refused',
      (await consumePendingSignup(pending.id, 'ten@example.com', '123')).ok === false);
    check('an empty handle is refused',
      (await consumePendingSignup('', 'ten@example.com', '123456')).ok === false);
    check('an invalid address is refused at staging',
      await stage('not-an-address').then(() => false, () => true));
    check('a short password is refused at staging',
      await stage('eleven@example.com', { password: 'short' }).then(() => false, () => true));
    check('a business signup with no organization is refused at staging',
      await stage('twelve@example.com', { accountKind: 'business' }).then(() => false, () => true));
    await discardPendingSignup(pending.id);
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
}

main()
  .catch((error) => { console.error(error); failed += 1; })
  .finally(() => {
    if (backup !== null) writeFileSync(FILE, backup);
    else if (existsSync(FILE)) unlinkSync(FILE);
    if (failed > 0) { console.error('FAILED'); process.exit(1); }
  });
