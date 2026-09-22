/**
 * Forgot password — step 2: verify the emailed code and set a new password.
 *
 * The code proves control of the account's email; the session it belongs to
 * names the account, so the client can never choose WHICH account is reset.
 * The new password goes through the same scrypt hashing every signup uses,
 * the code is single-use, and the account owner is told by email afterwards.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getStoredUserById, upsertStoredUser } from '@/lib/server/users';
import { createPasswordHash, isValidEmail, normalizeEmail } from '@/lib/server/security';
import { consumePasswordResetOtp, verifyPasswordResetOtp } from '@/lib/server/otp-sessions';
import { sendPasswordChangedEmail } from '@/lib/server/account-emails';
import { enforceRateLimits, getClientIp, rateKeyEmail, RATE_POLICIES } from '@/lib/server/security/rate-limit';

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest) {
  let body: { sessionId?: unknown; email?: unknown; otp?: unknown; password?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : '';
  const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!sessionId || !isValidEmail(email) || !otp) {
    return NextResponse.json({ error: 'Enter the email address and the 6-digit code from the email.' }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, { status: 400 });
  }
  if (password.length > 256) {
    return NextResponse.json({ error: 'Password is too long.' }, { status: 400 });
  }

  const limited = await enforceRateLimits([
    { key: `otp:verify:reset:email:${rateKeyEmail(email)}`, policy: RATE_POLICIES.otpVerifyAccount },
    { key: `otp:verify:reset:ip:${getClientIp(req)}`, policy: RATE_POLICIES.otpVerifyIp },
  ]);
  if (limited) return limited;

  let userId: string;
  try {
    ({ userId } = await verifyPasswordResetOtp({ sessionId, email, otp }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Could not verify the code.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    const user = await getStoredUserById(userId);
    if (!user || user.pendingDeletion || normalizeEmail(user.email) !== email) {
      await consumePasswordResetOtp(sessionId);
      return NextResponse.json({ error: 'This reset code has expired. Request a new one.' }, { status: 400 });
    }

    /* Same hash every signup writes, fresh salt. Nothing else on the account
       changes here — a reset is not a login, so deactivation state, last-login
       and presence stay exactly as they were. */
    await upsertStoredUser({ ...user, ...createPasswordHash(password) });
    await consumePasswordResetOtp(sessionId);

    /* Told after the fact, never blocking the reset itself. */
    void sendPasswordChangedEmail({ to: user.email, name: user.name }).catch((error) => {
      console.error('[account/reset-password] confirmation email failed', error);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[account/reset-password] failed', error);
    return NextResponse.json({ error: 'We could not update your password right now. Please try again.' }, { status: 500 });
  }
}
