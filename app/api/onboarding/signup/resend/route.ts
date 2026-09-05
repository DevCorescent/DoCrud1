/**
 * Send another code for a signup that is already staged.
 *
 * ═══ THE HANDLE IS THE CREDENTIAL ═══
 *
 * The body carries the pending-signup handle and nothing else that matters: the
 * address mailed is the one stored against that handle, never one supplied
 * here. So this endpoint cannot be pointed at an arbitrary mailbox — the only
 * address it can reach is one that a captcha-cleared `start` call already
 * staged, and the handle is 32 random bytes.
 *
 * That is also why there is no captcha on this call: holding the handle IS the
 * proof that the challenge was solved, and the widget that produced the token
 * is long unmounted by the time somebody presses Resend. The rate limits below
 * are what bound the volume.
 *
 * ═══ A FAILED SEND DOES NOT INVALIDATE A WORKING CODE ═══
 *
 * The new code replaces the old one only once it has actually gone out. If
 * delivery fails, whatever the person may already be holding still works.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  enforceRateLimits, getClientIp, rateKeyEmail, RATE_POLICIES,
} from '@/lib/server/security/rate-limit';
import {
  beginPendingSignupResend, commitPendingSignupOtp, peekPendingSignup,
  PENDING_SIGNUP_RESEND_COOLDOWN_MS,
} from '@/lib/server/pending-signups';
import { sendOtpEmail } from '@/lib/server/otp-email';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { pendingId?: string };
    const pendingId = String(body.pendingId ?? '');
    if (!pendingId) {
      return NextResponse.json({ error: 'Start again — this signup session has expired.' }, { status: 400 });
    }

    const existing = await peekPendingSignup(pendingId);
    if (!existing) {
      return NextResponse.json({ error: 'Start again — this signup session has expired.' }, { status: 410 });
    }

    const limited = await enforceRateLimits([
      { key: `otp:send:signup:account:${rateKeyEmail(existing.email)}`, policy: RATE_POLICIES.otpSendAccount },
      { key: `otp:send:signup:ip:${getClientIp(req)}`, policy: RATE_POLICIES.otpSendIp },
    ]);
    if (limited) return limited;

    const { pending, otp, hashed } = await beginPendingSignupResend(pendingId);

    try {
      await sendOtpEmail({
        to: pending.email,
        otp,
        firstName: pending.name.split(' ')[0],
        purpose: 'signup_verification',
      });
    } catch (dispatchErr) {
      console.error('[onboarding/signup/resend] delivery failed', dispatchErr);
      return NextResponse.json(
        { error: 'We could not send a new code right now. Please try again in a moment.' },
        { status: 502 },
      );
    }

    /* Delivered — only now does the previous code stop working. */
    await commitPendingSignupOtp(pendingId, hashed);

    return NextResponse.json({
      sent: true,
      email: pending.email,
      expiresAt: pending.expiresAt,
      resendInSeconds: Math.ceil(PENDING_SIGNUP_RESEND_COOLDOWN_MS / 1000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    /* The store's refusals ("a code was just sent", "start again") describe the
       caller's own session and are safe, and useful, to pass back. */
    const isExpected = /(start again|just sent|too many)/i.test(message);
    if (!isExpected) console.error('[onboarding/signup/resend] POST error', error);
    return NextResponse.json(
      { error: isExpected ? message : 'We could not resend your code. Please try again.' },
      { status: isExpected ? 429 : 500 },
    );
  }
}
