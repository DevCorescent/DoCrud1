import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { otpSessionsPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';
import { updateProfileData } from '@/lib/server/user-profiles';
import { queueIndividualWelcomeEmail } from '@/lib/server/onboarding-welcome-email';
import { enforceRateLimits, refundRateLimit, getClientIp, RATE_POLICIES } from '@/lib/server/security/rate-limit';

export const dynamic = 'force-dynamic';

type EmailVerificationOtpSession = {
  id: string;
  purpose: 'email_verification';
  email: string;
  userId: string;
  otpHash: string;
  otpSalt: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
  verifiedAt?: string;
};

type OtpStore = {
  sessions: Array<Record<string, unknown>>;
};

function sha256Hex(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEq(a: string, b: string) {
  const ab = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

async function getActor(emailFallback?: string) {
  // Primary: session-based lookup
  const session = await getAuthSession();
  if (session?.user?.email) {
    const users = await getStoredUsers();
    const found = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
    if (found) return found;
  }
  // Fallback: email in request body — used immediately after signup when the
  // NextAuth client session hasn't propagated yet. The OTP code itself is the
  // security mechanism, so no session is required for this step.
  if (emailFallback) {
    const users = await getStoredUsers();
    return users.find((u) => u.email.toLowerCase() === emailFallback.toLowerCase()) ?? null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { otp?: string; email?: string };
    const emailFallback = String(body.email || '').toLowerCase().trim();

    const actor = await getActor(emailFallback || undefined);
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Throttle OTP-verify by account + IP, on top of the existing per-session
    // 5-attempt cap, so an attacker cannot brute-force across many sessions.
    const acctKey = `otp:verify:emailverify:account:${actor.id}`;
    const otpLimited = await enforceRateLimits([
      { key: acctKey, policy: RATE_POLICIES.otpVerifyAccount },
      { key: `otp:verify:emailverify:ip:${getClientIp(req)}`, policy: RATE_POLICIES.otpVerifyIp },
    ]);
    if (otpLimited) return otpLimited;

    const code = String(body.otp || '').trim();
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Enter the 6-digit OTP.' }, { status: 400 });
    }

    const store = await readJsonFile<OtpStore>(otpSessionsPath, { sessions: [] });
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];

    const now = Date.now();
    const idx = sessions.findIndex((s) => {
      const rec = s as Record<string, unknown>;
      if (rec['purpose'] !== 'email_verification') return false;
      if (rec['userId'] !== actor.id) return false;
      const expiresAt = new Date(String(rec['expiresAt'] || '')).getTime();
      return Number.isFinite(expiresAt) && expiresAt > now;
    });

    if (idx < 0) {
      return NextResponse.json({ error: 'OTP session expired or not found. Please request a new code.' }, { status: 400 });
    }

    const raw = sessions[idx] as unknown as EmailVerificationOtpSession;

    if (raw.attempts >= 5) {
      return NextResponse.json({ error: 'Too many attempts. Please request a new OTP.' }, { status: 400 });
    }

    const attemptHash = sha256Hex(`${raw.otpSalt}:${code}`);
    raw.attempts += 1;

    if (!safeEq(attemptHash, raw.otpHash)) {
      sessions[idx] = raw as unknown as Record<string, unknown>;
      await writeJsonFile(otpSessionsPath, { sessions });
      return NextResponse.json({ error: 'Incorrect OTP. Please try again.' }, { status: 400 });
    }

    // Mark verified and delete session
    raw.verifiedAt = new Date().toISOString();
    sessions.splice(idx, 1);
    await writeJsonFile(otpSessionsPath, { sessions });

    // Success → refund the account verify counter (only failures accumulate).
    await refundRateLimit(acctKey, RATE_POLICIES.otpVerifyAccount);

    // Update user profile
    await updateProfileData(actor.id, {
      emailVerified: true,
      emailVerifiedAt: raw.verifiedAt,
    });

    /* Best-effort welcome, shared with the onboarding signup flow so both
       paths send the same message. Never blocks the response. */
    queueIndividualWelcomeEmail({ to: actor.email, name: actor.name });

    return NextResponse.json({ verified: true });
  } catch (error) {
    console.error('[onboarding/verify-otp] POST error', error);
    return NextResponse.json({ error: 'Failed to verify OTP.' }, { status: 500 });
  }
}
