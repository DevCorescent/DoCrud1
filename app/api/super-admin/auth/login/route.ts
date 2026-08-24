import { NextRequest, NextResponse } from 'next/server';
import { appendSuperAdminAudit, createSuperAdminSession, verifySuperAdminPassword } from '@/lib/server/super-admin-auth';
import { enforceRateLimits, refundRateLimit, getClientIp, rateKeyEmail, RATE_POLICIES } from '@/lib/server/security/rate-limit';
import { enforceCaptcha } from '@/lib/server/security/captcha';

export async function POST(req: NextRequest) {
  try {
    const { email, password, captchaToken } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    /* Rate-limit super-admin login by account and by IP. Fail CLOSED if the
       store is unavailable — this is the most sensitive login and has tiny
       legitimate volume, so availability is worth trading for strictness. */
    const acctKey = `superadmin:login:account:${rateKeyEmail(email)}`;
    const ipKey = `superadmin:login:ip:${getClientIp(req)}`;
    const limited = await enforceRateLimits(
      [
        { key: acctKey, policy: RATE_POLICIES.superadminLoginAccount },
        { key: ipKey, policy: RATE_POLICIES.superadminLoginIp },
      ],
      { failClosedOnDegraded: true },
    );
    if (limited) return limited;

    // Bot protection (verified server-side) — after rate limiting, before verify.
    const captchaFail = await enforceCaptcha(captchaToken, { remoteIp: getClientIp(req), label: 'superadmin-login' });
    if (captchaFail) return captchaFail;

    const result = await verifySuperAdminPassword(String(email), String(password));
    if (!result.valid || !result.email) {
      return NextResponse.json({ error: result.error || 'Invalid email or password' }, { status: 401 });
    }

    // Success → refund the account counter so only FAILED attempts accumulate.
    await refundRateLimit(acctKey, RATE_POLICIES.superadminLoginAccount);

    const token = await createSuperAdminSession(result.email, req);

    await appendSuperAdminAudit({
      action: 'super_admin_login',
      details: { email: result.email, method: 'password' },
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
    });

    const res = NextResponse.json({ success: true });
    res.cookies.set('sa_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 4 * 60 * 60,
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (err) {
    console.error('[super-admin/auth/login]', err);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
