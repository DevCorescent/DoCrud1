/**
 * Forgot password — step 1: send a reset code to the account's email.
 *
 * Signed-out by design. The response is IDENTICAL whether or not an account
 * exists for the identifier — same status, same shape, a session id either
 * way — so this endpoint cannot be used to discover which emails or login IDs
 * are registered. Only a real account receives mail. Throttled per identifier
 * and per IP, and a resend inside the 45 s window reuses the live session
 * without sending again (still a 200).
 */
export const dynamic = 'force-dynamic';

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers, getStoredUserByEmail, type StoredUser } from '@/lib/server/users';
import { isValidEmail, normalizeEmail } from '@/lib/server/security';
import { createPasswordResetOtp } from '@/lib/server/otp-sessions';
import { sendPasswordResetOtpEmail } from '@/lib/server/account-emails';
import { enforceRateLimits, getClientIp, rateKeyEmail, RATE_POLICIES } from '@/lib/server/security/rate-limit';
import { isCaptchaConfigured, verifyCaptcha } from '@/lib/server/security/captcha';

/** Same normalisation the credentials login applies to a login ID. */
function normalizeLoginId(value: string) {
  return value.trim().toLowerCase();
}

/** The account for an email OR a login ID, never one pending deletion. */
async function findAccount(identifier: string): Promise<StoredUser | null> {
  const email = normalizeEmail(identifier);
  if (isValidEmail(email)) {
    const byEmail = await getStoredUserByEmail(email).catch(() => null);
    if (byEmail && !byEmail.pendingDeletion) return byEmail;
  }
  const loginId = normalizeLoginId(identifier);
  if (!loginId) return null;
  const users = await getStoredUsers();
  return users.find((u) => !u.pendingDeletion && u.loginId && normalizeLoginId(u.loginId) === loginId) ?? null;
}

/** `j***@example.com` — enough to confirm which inbox to check, no more. */
function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return '';
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
}

export async function POST(req: NextRequest) {
  let body: { identifier?: unknown; captchaToken?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
  if (!identifier || identifier.length > 254) {
    return NextResponse.json({ error: 'Enter the email or login ID of your account.' }, { status: 400 });
  }

  /* Per identifier AND per IP, applied BEFORE the account lookup so the limit
     behaves the same for registered and unregistered identifiers. */
  const limited = await enforceRateLimits([
    { key: `otp:send:reset:id:${rateKeyEmail(identifier.toLowerCase())}`, policy: RATE_POLICIES.otpSendAccount },
    { key: `otp:send:reset:ip:${getClientIp(req)}`, policy: RATE_POLICIES.otpSendIp },
  ]);
  if (limited) return limited;

  /* Same CAPTCHA stance as the login form: judged server-side when a token is
     present; a widget that never loaded does not block the person, because
     the rate limits above already bound abuse. */
  if (isCaptchaConfigured() && typeof body.captchaToken === 'string' && body.captchaToken.trim()) {
    const captcha = await verifyCaptcha(body.captchaToken);
    if (!captcha.ok) return NextResponse.json({ error: 'Security verification failed. Please try again.' }, { status: 400 });
  }

  try {
    const user = await findAccount(identifier);
    if (!user || !isValidEmail(normalizeEmail(user.email))) {
      /* Indistinguishable from success. The session id is random and matches
         nothing, so a later verify fails as "expired" — exactly what a real
         but expired session says. */
      return NextResponse.json({
        ok: true,
        sessionId: crypto.randomBytes(18).toString('base64url'),
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        emailHint: isValidEmail(normalizeEmail(identifier)) ? maskEmail(normalizeEmail(identifier)) : '',
      });
    }

    const { sessionId, otp, expiresAt } = await createPasswordResetOtp({ email: user.email, userId: user.id });
    if (otp) {
      await sendPasswordResetOtpEmail({ to: user.email, name: user.name, otp, expiresAt });
    }
    return NextResponse.json({
      ok: true,
      sessionId,
      expiresAt,
      /* The hint is derived from what the person TYPED when it was an email
         (nothing new is revealed); a login ID reveals nothing about the inbox. */
      emailHint: isValidEmail(normalizeEmail(identifier)) ? maskEmail(normalizeEmail(identifier)) : '',
    });
  } catch (error) {
    console.error('[account/forgot-password] failed', error);
    return NextResponse.json({ error: 'We could not send a reset code right now. Please try again.' }, { status: 500 });
  }
}
