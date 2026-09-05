/**
 * Step two: the code comes back, and ONLY NOW does an account exist.
 *
 * ═══ THE INVARIANT ═══
 *
 * Every account this endpoint creates has a proven address, because the code
 * was mailed to that address and had to be typed back within ten minutes. There
 * is no branch through this file that reaches account creation without a
 * correct code, and the staged record is consumed in the same locked section
 * that accepts it — so one code creates at most one account even if two
 * requests arrive together.
 *
 * ═══ EVERYTHING FINISHES HERE ═══
 *
 * Account, verified flag, and the onboarding answers are written on the server
 * in one place, from the record staged at `start`. The browser supplies the
 * code and nothing else that is trusted: not the name, not the account kind,
 * not the answers, not the password — those were fixed when the code was sent
 * and cannot be swapped afterwards.
 *
 * The response carries a one-shot login grant so the browser can establish its
 * session through the existing NextAuth credentials provider. It is not a
 * password bypass: the correct password is still required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers } from '@/lib/server/auth';
import { normalizeEmail } from '@/lib/server/security';
import {
  enforceRateLimits, refundRateLimit, getClientIp, rateKeyEmail, RATE_POLICIES,
} from '@/lib/server/security/rate-limit';
import { issueLoginGrant } from '@/lib/server/security/login-grant';
import { consumePendingSignup } from '@/lib/server/pending-signups';
import { provisionIndividualAccount } from '@/lib/server/individual-provisioning';
import { provisionBusinessAccount } from '@/lib/server/business-provisioning';
import { updateProfileData, type UserProfileData } from '@/lib/server/user-profiles';
import { getBusinessSettings, saveBusinessSettings } from '@/lib/server/business';
import { processProfileActivation, markInviteSignedUp } from '@/lib/server/referrals';
import { queueIndividualWelcomeEmail } from '@/lib/server/onboarding-welcome-email';
import { queueBusinessWelcomeEmail } from '@/lib/server/business-welcome-email';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      pendingId?: string;
      email?: string;
      otp?: string;
    };
    const pendingId = String(body.pendingId ?? '');
    const email = normalizeEmail(String(body.email ?? ''));
    const code = String(body.otp ?? '').trim();

    /* Throttled per address and per IP on top of the five-attempt cap the
       record itself carries, so guessing cannot be spread across fresh
       sessions. Keyed on the address rather than the handle for exactly that
       reason — a new handle must not reset the budget. */
    const accountKey = `otp:verify:signup:account:${rateKeyEmail(email)}`;
    const limited = await enforceRateLimits([
      { key: accountKey, policy: RATE_POLICIES.otpVerifyAccount },
      { key: `otp:verify:signup:ip:${getClientIp(req)}`, policy: RATE_POLICIES.otpVerifyIp },
    ]);
    if (limited) return limited;

    const result = await consumePendingSignup(pendingId, email, code);
    if (!result.ok) {
      /* An expired or exhausted session is worth distinguishing from a wrong
         digit: one means "type it again", the other "start over". */
      const restart = /start again/i.test(result.error);
      return NextResponse.json(
        { error: result.error, code: restart ? 'restart' : 'incorrect_code', attemptsLeft: result.attemptsLeft },
        { status: restart ? 410 : 400 },
      );
    }

    const pending = result.pending;

    /* Success spends no budget — only wrong codes accumulate. */
    await refundRateLimit(accountKey, RATE_POLICIES.otpVerifyAccount);

    /* Checked again here, not only at `start`: ten minutes is long enough for
       the same address to be registered by another route in between. */
    const users = await getStoredUsers();
    if (users.some((user) => user.email.toLowerCase() === pending.email)) {
      return NextResponse.json(
        { error: 'An account already exists for this email. Sign in instead.', code: 'account_exists' },
        { status: 409 },
      );
    }

    const credentials = { passwordHash: pending.passwordHash, passwordSalt: pending.passwordSalt };
    const answers = pending.onboarding;
    const verifiedAt = new Date().toISOString();

    let userId: string;

    if (pending.accountKind === 'business') {
      const organizationName = pending.organizationName?.trim() || pending.name;
      const provisioned = await provisionBusinessAccount({
        name: pending.name,
        email: pending.email,
        organizationName,
        industry: answers?.businessSpace || pending.industry,
        credentials,
        referralCode: pending.referralCode,
        policyContext: 'business_signup',
        policyIp: pending.policyIp,
      });
      userId = provisioned.userId;

      /* The workspace owns the business answers — the same split the handoff
         endpoint makes, so a workspace outlives whoever signed it up. */
      if (answers?.businessSkills?.length) {
        const current = await getBusinessSettings(userId, organizationName);
        if (current) {
          await saveBusinessSettings({ ...current, talentSkills: answers.businessSkills });
        }
      }

      queueBusinessWelcomeEmail({
        to: pending.email,
        name: pending.name,
        organizationName,
        userId,
        origin: req.nextUrl.origin,
      });
    } else {
      const provisioned = await provisionIndividualAccount({
        name: pending.name,
        email: pending.email,
        credentials,
        referralCode: pending.referralCode,
        policyContext: 'individual_signup',
        policyIp: pending.policyIp,
      });
      userId = provisioned.userId;

      queueIndividualWelcomeEmail({
        to: pending.email,
        name: pending.name,
        origin: req.nextUrl.origin,
      });
    }

    /* The verified flag is written from the server's own knowledge that the
       code just matched — it is never something a request can assert. */
    const patch: Partial<UserProfileData> = {
      emailVerified: true,
      emailVerifiedAt: verifiedAt,
      profileSetupDone: true,
    };
    if (answers?.roles) patch.roles = answers.roles;
    if (answers?.customRoles) patch.customRoles = answers.customRoles;
    if (answers?.skills) patch.skills = answers.skills;
    try {
      await updateProfileData(userId, patch);
    } catch (profileError) {
      /* The account exists by now, so a lost profile write would strand a
         verified person behind the unverified-email gate. One retry, because
         the realistic cause is a momentary store failure; a second failure is
         logged loudly and reported, and the older send-otp / verify-otp pair
         can still verify the account that was created. */
      console.error('[onboarding/signup/verify] profile write failed, retrying', profileError);
      await updateProfileData(userId, patch);
    }

    /* Referrals are a bonus, never a gate. */
    if (pending.referralCode) {
      try {
        await Promise.all([
          processProfileActivation({
            refereeUserId: userId,
            refereeEmail: pending.email,
            referralCode: pending.referralCode,
            origin: req.nextUrl.origin,
          }),
          markInviteSignedUp(pending.email, userId),
        ]);
      } catch (referralError) {
        console.error('[onboarding/signup/verify] referral activation non-fatal error:', referralError);
      }
    }

    return NextResponse.json({
      verified: true,
      email: pending.email,
      accountKind: pending.accountKind,
      /* One-shot, HMAC-signed and email-bound, so the sign-in that follows
         passes the credentials CAPTCHA gate without a fresh widget token. */
      loginGrant: issueLoginGrant(pending.email),
    }, { status: 201 });
  } catch (error) {
    console.error('[onboarding/signup/verify] POST error', error);
    return NextResponse.json(
      { error: 'We could not finish creating your account. Please try again.' },
      { status: 500 },
    );
  }
}
