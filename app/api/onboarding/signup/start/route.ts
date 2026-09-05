/**
 * Step one of creating an account from onboarding: STAGE it and mail a code.
 *
 * ═══ NOTHING IS CREATED HERE ═══
 *
 * No user row, no profile, no workspace, no session. What the person typed is
 * held in the pending-signup store — password already hashed — behind an
 * unguessable handle, and it expires in ten minutes if the code never comes
 * back. `/api/onboarding/signup/verify` is the only place an account is made.
 *
 * The flow used to run the other way round: create the account, sign in, then
 * try to mail a code. A delivery failure therefore left a real, signed-in,
 * unverified account owning an address nobody had proven they controlled. The
 * order is now the safe one, and a delivery failure leaves nothing behind at
 * all — the staged record is discarded before this responds.
 *
 * ═══ WHAT GUARDS IT ═══
 *
 * · Rate limits per IP and per address, applied before any work.
 * · The CAPTCHA, judged on this server. This is the only call in the flow that
 *   spends the token, so the widget's single-use token is enough for it.
 * · An address that already has an account is refused here rather than being
 *   mailed a code that could never be redeemed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers } from '@/lib/server/auth';
import { isValidEmail, normalizeEmail } from '@/lib/server/security';
import { enforceCaptcha } from '@/lib/server/security/captcha';
import {
  enforceRateLimits, getClientIp, rateKeyEmail, RATE_POLICIES,
} from '@/lib/server/security/rate-limit';
import { coerceOnboarding } from '@/lib/server/oauth-intent';
import {
  createPendingSignup, discardPendingSignup,
  PENDING_SIGNUP_RESEND_COOLDOWN_MS,
} from '@/lib/server/pending-signups';
import { sendOtpEmail } from '@/lib/server/otp-email';

export const dynamic = 'force-dynamic';
/* Delivery walks a short list of transports before giving up. The budget has to
   cover the slowest acceptable case — the configured relay's documented 10–15 s
   cold start — or a working relay looks like a broken one. */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    const ipLimited = await enforceRateLimits([
      { key: `signup:onboarding:ip:${ip}`, policy: RATE_POLICIES.signupIp },
    ]);
    if (ipLimited) return ipLimited;

    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      password?: string;
      name?: string;
      accountKind?: string;
      organizationName?: string;
      industry?: string;
      onboarding?: unknown;
      captchaToken?: string;
      referralCode?: string;
      policyAccepted?: boolean;
    };

    const email = normalizeEmail(String(body.email ?? ''));
    const password = String(body.password ?? '');
    /* Anything not exactly 'business' is an individual — the same rule the
       OAuth intent uses, so a tampered value cannot select a richer account. */
    const accountKind = body.accountKind === 'business' ? 'business' : 'individual';
    const name = String(body.name ?? '').trim() || email.split('@')[0];
    const organizationName = String(body.organizationName ?? '').trim();

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Use a password of at least 8 characters.' }, { status: 400 });
    }
    if (!body.policyAccepted) {
      return NextResponse.json(
        { error: 'You must accept the required policies before creating a profile.' },
        { status: 400 },
      );
    }
    if (accountKind === 'business' && !organizationName) {
      return NextResponse.json({ error: 'Tell us your organization name.' }, { status: 400 });
    }

    /* Second dimension: per-address, so a flood spread across rotating IPs still
       hits a ceiling on the one mailbox it is aimed at. */
    const emailLimited = await enforceRateLimits([
      { key: `signup:onboarding:email:${rateKeyEmail(email)}`, policy: RATE_POLICIES.signupEmail },
      { key: `otp:send:signup:account:${rateKeyEmail(email)}`, policy: RATE_POLICIES.otpSendAccount },
      { key: `otp:send:signup:ip:${ip}`, policy: RATE_POLICIES.otpSendIp },
    ]);
    if (emailLimited) return emailLimited;

    const captchaFail = await enforceCaptcha(body.captchaToken, { remoteIp: ip, label: 'onboarding-signup-start' });
    if (captchaFail) return captchaFail;

    /* An existing account is told so plainly. Staying silent here would mail a
       code that verify could only ever refuse, and leave the person guessing on
       a screen that cannot succeed. The address is already discoverable through
       the sign-in form, so nothing is disclosed that was not already. */
    const users = await getStoredUsers();
    if (users.some((user) => user.email.toLowerCase() === email)) {
      return NextResponse.json(
        { error: 'An account already exists for this email. Sign in instead.', code: 'account_exists' },
        { status: 409 },
      );
    }

    const { pending, otp } = await createPendingSignup({
      email,
      name,
      password,
      accountKind,
      organizationName: organizationName || undefined,
      industry: String(body.industry ?? '').trim() || undefined,
      onboarding: coerceOnboarding(body.onboarding),
      policyIp: req.headers.get('x-forwarded-for') || undefined,
      referralCode: typeof body.referralCode === 'string' ? body.referralCode.trim() : undefined,
    });

    try {
      await sendOtpEmail({
        to: email,
        otp,
        firstName: name.split(' ')[0],
        purpose: 'signup_verification',
      });
    } catch (dispatchErr) {
      /* Undeliverable means the signup does not exist. Leaving the record would
         leave a code nobody can ever produce, and a handle that outlives its
         purpose. */
      await discardPendingSignup(pending.id).catch(() => { /* expiry will finish the job */ });
      /* The DETAIL stays on the server: it names the relay and the recipient,
         which is an infrastructure disclosure in a response body. The outbox
         row written by the sender already carries the real cause for an
         administrator. */
      console.error('[onboarding/signup/start] delivery failed', dispatchErr);
      return NextResponse.json(
        { error: 'We could not send your code right now. Please check the address and try again in a moment.' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      sent: true,
      pendingId: pending.id,
      email,
      expiresAt: pending.expiresAt,
      resendInSeconds: Math.ceil(PENDING_SIGNUP_RESEND_COOLDOWN_MS / 1000),
    });
  } catch (error) {
    /* A validation message from the store is safe to pass on — it describes
       what the caller sent. Anything else is generic. */
    const message = error instanceof Error ? error.message : '';
    const isValidation = /^(Enter|Use|Tell)\b/.test(message);
    if (!isValidation) console.error('[onboarding/signup/start] POST error', error);
    return NextResponse.json(
      { error: isValidation ? message : 'We could not start your signup. Please try again.' },
      { status: isValidation ? 400 : 500 },
    );
  }
}
