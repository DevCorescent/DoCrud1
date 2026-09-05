import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers } from '@/lib/server/auth';
import { isValidEmail, normalizeEmail } from '@/lib/server/security';
import { getDefaultPublicPlan } from '@/lib/server/saas';
import { provisionIndividualAccount } from '@/lib/server/individual-provisioning';
import { processProfileActivation, markInviteSignedUp } from '@/lib/server/referrals';
import { enforceRateLimits, getClientIp, RATE_POLICIES } from '@/lib/server/security/rate-limit';
import { enforceCaptcha } from '@/lib/server/security/captcha';
import { issueLoginGrant } from '@/lib/server/security/login-grant';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Throttle account creation per IP to blunt mass fake-signup floods.
    const limited = await enforceRateLimits([
      { key: `signup:individual:ip:${getClientIp(request)}`, policy: RATE_POLICIES.signupIp },
    ]);
    if (limited) return limited;

    const payload = await request.json() as {
      name?: string;
      email?: string;
      password?: string;
      profession?: string;
      primaryUseCase?: string;
      policyAccepted?: boolean;
      referralCode?: string;
      captchaToken?: string;
    };

    if (!payload.name?.trim() || !isValidEmail(payload.email || '') || !payload.password || payload.password.length < 8) {
      return NextResponse.json({ error: 'Name, valid email, and password with at least 8 characters are required.' }, { status: 400 });
    }

    if (!payload.policyAccepted) {
      return NextResponse.json({ error: 'You must accept the required policies before creating a profile.' }, { status: 400 });
    }

    // Second rate-limit dimension: per-email (blunts distributed/rotating-IP
    // floods against a single address). Generic 429 — no account-existence leak.
    const emailForLimit = normalizeEmail(payload.email || '');
    const emailLimited = await enforceRateLimits([
      { key: `signup:individual:email:${emailForLimit}`, policy: RATE_POLICIES.signupEmail },
    ]);
    if (emailLimited) return emailLimited;

    // Bot protection (verified server-side) — after rate limiting, before any work.
    const captchaFail = await enforceCaptcha(payload.captchaToken, { remoteIp: getClientIp(request), label: 'individual-signup' });
    if (captchaFail) return captchaFail;

    const users = await getStoredUsers();
    const normalizedEmail = normalizeEmail(payload.email || '');
    if (users.some((user) => user.email === normalizedEmail)) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }

    const selectedPlan = await getDefaultPublicPlan('business');
    const referralCode = typeof payload.referralCode === 'string' ? payload.referralCode.trim() : '';

    /* Account creation is shared with the onboarding flow, which creates one
       only after the emailed verification code comes back, so the two entry
       points cannot produce different accounts. */
    const { userId } = await provisionIndividualAccount({
      name: payload.name.trim(),
      email: normalizedEmail,
      password: payload.password,
      profession: payload.profession,
      referralCode,
      policyContext: 'individual_signup',
      policyIp: request.headers.get('x-forwarded-for') || undefined,
    });

    // Process referral activation (non-fatal — never block signup)
    if (referralCode) {
      const origin = new URL(request.url).origin;
      try {
        await Promise.all([
          processProfileActivation({
            refereeUserId: userId,
            refereeEmail: normalizedEmail,
            referralCode,
            origin,
          }),
          markInviteSignedUp(normalizedEmail, userId),
        ]);
      } catch (refErr) {
        console.error('[individual/signup] referral activation non-fatal error:', refErr);
      }
    }

    return NextResponse.json({
      success: true,
      email: normalizedEmail,
      planName: selectedPlan.name,
      referralActivated: !!referralCode,
      message: 'Your docrud workspace trial is ready.',
      // One-shot grant so the immediate post-signup auto-login passes the
      // credentials CAPTCHA gate (it has no fresh Turnstile token).
      loginGrant: issueLoginGrant(normalizedEmail),
    }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create individual profile' }, { status: 500 });
  }
}
