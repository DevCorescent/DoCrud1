import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers } from '@/lib/server/auth';
import { isValidEmail, normalizeEmail } from '@/lib/server/security';
import { getDefaultPublicPlan } from '@/lib/server/saas';
import { provisionBusinessAccount } from '@/lib/server/business-provisioning';
import { assertBusinessSignupOtpVerified } from '@/lib/server/otp-sessions';
import { sendBusinessWelcomeEmail } from '@/lib/server/business-welcome-email';
import { processProfileActivation } from '@/lib/server/referrals';
import { enforceRateLimits, getClientIp, RATE_POLICIES } from '@/lib/server/security/rate-limit';
import { enforceCaptcha } from '@/lib/server/security/captcha';
import { issueLoginGrant } from '@/lib/server/security/login-grant';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Throttle workspace creation per IP to blunt mass fake-signup floods.
    const limited = await enforceRateLimits([
      { key: `signup:business:ip:${getClientIp(request)}`, policy: RATE_POLICIES.signupIp },
    ]);
    if (limited) return limited;

    const payload = await request.json() as {
      name?: string;
      email?: string;
      password?: string;
      organizationName?: string;
      organizationDomain?: string;
      industry?: string;
      companySize?: string;
      primaryUseCase?: string;
      workspacePreset?: string;
      policyAccepted?: boolean;
      otpSessionId?: string;
      referralCode?: string;
      captchaToken?: string;
    };

    if (!payload.name?.trim() || !payload.organizationName?.trim() || !isValidEmail(payload.email || '') || !payload.password || payload.password.length < 8) {
      return NextResponse.json({ error: 'Name, organization, valid email, and password with at least 8 characters are required' }, { status: 400 });
    }

    // Bot protection (verified server-side) — after rate limiting, before any work.
    const captchaFail = await enforceCaptcha(payload.captchaToken, { remoteIp: getClientIp(request), label: 'business-signup' });
    if (captchaFail) return captchaFail;

    if (!payload.policyAccepted) {
      return NextResponse.json({ error: 'You must accept the required policies before creating a workspace.' }, { status: 400 });
    }

    const users = await getStoredUsers();
    const normalizedEmail = normalizeEmail(payload.email || '');

    await assertBusinessSignupOtpVerified(String(payload.otpSessionId || ''), normalizedEmail);

    if (users.some((user) => user.email === normalizedEmail)) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 });
    }

    const organizationName = payload.organizationName.trim();
    const referralCode = typeof payload.referralCode === 'string' ? payload.referralCode.trim() : '';

    /* Business account + workspace creation is shared with the Google OAuth
       business flow so the two cannot drift. */
    const { userId } = await provisionBusinessAccount({
      name: payload.name.trim(),
      email: normalizedEmail,
      organizationName,
      organizationDomain: payload.organizationDomain,
      industry: payload.industry,
      companySize: payload.companySize,
      primaryUseCase: payload.primaryUseCase,
      workspacePreset: payload.workspacePreset,
      referralCode,
      password: payload.password,
      policyContext: 'business_signup',
      policyIp: request.headers.get('x-forwarded-for') || undefined,
    });
    const defaultPlan = await getDefaultPublicPlan('business');

    // ── Referral activation ──────────────────────────────────────────────────
    // If a valid referral code was supplied, process the activation.
    // This grants docrud Go (free, one-time) to the referrer.
    let referralResult: { bonusGranted: boolean } | null = null;
    if (referralCode) {
      try {
        const origin = request.nextUrl.origin;
        const result = await processProfileActivation({
          refereeUserId: userId,
          refereeEmail: normalizedEmail,
          referralCode,
          origin,
        });
        if (result) {
          referralResult = { bonusGranted: result.bonusGranted };
        }
      } catch (referralError) {
        console.error('[signup] referral activation failed (non-fatal):', referralError);
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    try {
      await sendBusinessWelcomeEmail({
        to: normalizedEmail,
        name: payload.name?.trim() || '',
        organizationName,
        userId,
        origin: request.nextUrl.origin,
      });
    } catch (mailError) {
      console.error('Failed to send business welcome email', mailError);
    }

    return NextResponse.json({
      success: true,
      email: normalizedEmail,
      planName: defaultPlan?.name,
      referralActivated: referralResult?.bonusGranted ?? false,
      message: 'docrud workspace created successfully. Your trial is active, non-AI features are ready immediately, and a few AI tries are waiting once you log in.',
      // One-shot grant so the immediate post-signup auto-login passes the
      // credentials CAPTCHA gate (it has no fresh Turnstile token).
      loginGrant: issueLoginGrant(normalizedEmail),
    }, { status: 201 });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : 'Failed to create business profile';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
