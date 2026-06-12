import { NextRequest, NextResponse } from 'next/server';
import { createBusinessSignupOtpSession } from '@/lib/server/otp-sessions';
import { sendTrackedMail } from '@/lib/server/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escapeHtmlLite(value: string) {
  return String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function POST(request: NextRequest) {
  try {
    const { email }: { email?: string } = await request.json();
    const origin = request.nextUrl.origin;

    const { sessionId, otp, expiresAt } = await createBusinessSignupOtpSession(String(email || ''));

    const subject = 'Your docrud verification code';
    const text = [
      `Your docrud verification code is: ${otp}`,
      '',
      `This code expires in 10 minutes.`,
      `If you did not request this code, you can ignore this email.`,
    ].join('\n');

    const html = `
      <div style="border-radius: 18px; border: 1px solid rgba(226,232,240,.9); background: #ffffff; padding: 16px;">
        <p style="margin: 0; font-size: 14px; color: rgba(15,23,42,.78);">
          Use the code below to verify your email and continue workspace setup.
        </p>
        <div style="margin-top: 14px; border-radius: 16px; border: 1px solid rgba(148,163,184,.55); background: linear-gradient(135deg, rgba(2,6,23,.96), rgba(15,23,42,.92), rgba(245,158,11,.22)); padding: 18px; color: #ffffff;">
          <div style="font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: rgba(255,255,255,.75);">
            One-time password
          </div>
          <div style="margin-top: 10px; font-size: 28px; font-weight: 900; letter-spacing: .22em; text-align: center;">
            ${escapeHtmlLite(otp)}
          </div>
          <div style="margin-top: 10px; font-size: 12px; color: rgba(255,255,255,.72); text-align: center;">
            Expires at ${escapeHtmlLite(new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(expiresAt)))}
          </div>
        </div>
        <div style="margin-top: 12px; font-size: 12px; color: rgba(15,23,42,.6);">
          If you did not request this code, you can ignore this email.
        </div>
      </div>
    `.trim();

    await sendTrackedMail({
      policyKey: 'otp_verification',
      typeLabel: 'system',
      to: String(email || ''),
      subject,
      text,
      html,
      preheader: `Your verification code is ${otp}`,
      origin,
      metadata: { purpose: 'business_signup_otp' },
    });

    return NextResponse.json({ success: true, sessionId, expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send OTP';
    const status = message.toLowerCase().includes('configured') ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
