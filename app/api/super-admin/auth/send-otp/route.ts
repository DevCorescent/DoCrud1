import { NextRequest, NextResponse } from 'next/server';
import { createSuperAdminOtpSession, getSuperAdminEmail } from '@/lib/server/super-admin-auth';
import { sendTrackedMail } from '@/lib/server/mailer';
import { enforceRateLimits, getClientIp, rateKeyEmail, RATE_POLICIES } from '@/lib/server/security/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    /* Throttle OTP sends by account and IP to prevent email/OTP flooding. This
       runs before any account lookup, so it never reveals whether the email is
       the super admin. */
    const limited = await enforceRateLimits([
      { key: `otp:send:superadmin:account:${rateKeyEmail(email)}`, policy: RATE_POLICIES.otpSendAccount },
      { key: `otp:send:superadmin:ip:${getClientIp(req)}`, policy: RATE_POLICIES.otpSendIp },
    ]);
    if (limited) return limited;

    const saEmail = await getSuperAdminEmail();
    if (!saEmail) {
      return NextResponse.json({ error: 'Super admin not configured. Set SUPER_ADMIN_EMAIL env or use /api/super-admin/setup.' }, { status: 503 });
    }

    if (email.trim().toLowerCase() !== saEmail) {
      // Return generic message to avoid email enumeration
      return NextResponse.json({ sessionId: 'noop', message: 'If that email is registered, an OTP has been sent.' });
    }

    const { sessionId, otp } = await createSuperAdminOtpSession(email.trim().toLowerCase());

    await sendTrackedMail({
      policyKey: 'otp_verification',
      typeLabel: 'system',
      to: email.trim(),
      subject: `[docrud] Super Admin OTP: ${otp}`,
      text: `Your super admin OTP is: ${otp}\n\nThis OTP expires in 10 minutes. Do not share this code with anyone.`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#09090b;color:#fafafa;border-radius:12px;padding:32px;">
          <div style="font-size:13px;letter-spacing:0.08em;color:#71717a;text-transform:uppercase;margin-bottom:8px;">docrud super admin</div>
          <h2 style="margin:0 0 24px;font-size:22px;color:#fafafa;">Sign-in OTP</h2>
          <div style="background:#18181b;border:1px solid #27272a;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px;">
            <div style="font-size:36px;letter-spacing:0.3em;font-weight:700;color:#f59e0b;font-variant-numeric:tabular-nums;">${otp}</div>
          </div>
          <p style="color:#a1a1aa;font-size:14px;margin:0 0 8px;">This OTP expires in <strong style="color:#fafafa;">10 minutes</strong>.</p>
          <p style="color:#a1a1aa;font-size:14px;margin:0;">If you did not request this, ignore this email and secure your account immediately.</p>
        </div>
      `,
      preheader: `Your super admin OTP: ${otp}`,
      origin: req.nextUrl.origin,
    }).catch(() => null);

    return NextResponse.json({ sessionId, message: 'If that email is registered, an OTP has been sent.' });
  } catch (err) {
    console.error('[super-admin/auth/send-otp]', err);
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 });
  }
}
