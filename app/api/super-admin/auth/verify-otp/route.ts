import { NextRequest, NextResponse } from 'next/server';
import { appendSuperAdminAudit, createSuperAdminSession, getSuperAdminEmail, verifySuperAdminOtp } from '@/lib/server/super-admin-auth';
import { enforceRateLimits, refundRateLimit, getClientIp, RATE_POLICIES } from '@/lib/server/security/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, otp } = await req.json();
    if (!sessionId || !otp) {
      return NextResponse.json({ error: 'sessionId and otp are required' }, { status: 400 });
    }

    /* Throttle OTP-verify by session and by IP so the 6-digit code cannot be
       brute-forced across many attempts. */
    const sessKey = `otp:verify:superadmin:session:${String(sessionId)}`;
    const ipKey = `otp:verify:superadmin:ip:${getClientIp(req)}`;
    const limited = await enforceRateLimits([
      { key: sessKey, policy: RATE_POLICIES.otpVerifyAccount },
      { key: ipKey, policy: RATE_POLICIES.otpVerifyIp },
    ]);
    if (limited) return limited;

    const result = await verifySuperAdminOtp(String(sessionId), String(otp));
    if (!result.valid) {
      return NextResponse.json({ error: result.error || 'Invalid OTP' }, { status: 401 });
    }

    // Success → refund the per-session verify counter.
    await refundRateLimit(sessKey, RATE_POLICIES.otpVerifyAccount);

    const email = result.email || await getSuperAdminEmail();
    const token = await createSuperAdminSession(email, req);

    await appendSuperAdminAudit({
      action: 'super_admin_login',
      details: { email },
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
    });

    const res = NextResponse.json({ success: true });
    res.cookies.set('sa_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 4 * 60 * 60, // 4 hours
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (err) {
    console.error('[super-admin/auth/verify-otp]', err);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
