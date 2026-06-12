import { NextRequest, NextResponse } from 'next/server';
import { createEarlyAccessOtp, verifyEarlyAccessOtp, addWaitlistEntry, getEarlyAccessFeatures } from '@/lib/server/early-access';
import { sendTrackedMail } from '@/lib/server/mailer';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    // ── Step 1: send OTP ────────────────────────────────────────────────────
    if (action === 'send_otp') {
      const { email, featureId, name } = body;
      if (!email || !isValidEmail(email)) return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
      if (!featureId) return NextResponse.json({ error: 'Feature ID is required.' }, { status: 400 });

      const features = await getEarlyAccessFeatures();
      const feature = features.find((f) => f.id === featureId);
      if (!feature) return NextResponse.json({ error: 'Feature not found.' }, { status: 404 });

      const { sessionId, otp, expiresAt } = await createEarlyAccessOtp(email.trim().toLowerCase(), featureId);

      await sendTrackedMail({
        policyKey: 'otp_verification',
        typeLabel: 'system',
        to: email.trim(),
        subject: `Your docrud Early Bird verification code: ${otp}`,
        text: `Hi ${name || 'there'},\n\nYour OTP to join the early bird waitlist for "${feature.title}" is:\n\n${otp}\n\nThis code expires in 10 minutes. If you didn't request this, ignore this email.\n\n— docrud Team`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#09090b;color:#fafafa;border-radius:16px;overflow:hidden;">
            <div style="padding:32px 32px 0;">
              <div style="font-size:11px;letter-spacing:0.12em;color:#78716c;text-transform:uppercase;margin-bottom:6px;">docrud · Early Bird Access</div>
              <h2 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#fafafa;">Verify your email</h2>
              <p style="margin:0 0 24px;font-size:14px;color:#a8a29e;">You're joining the early bird waitlist for <strong style="color:#fbbf24;">${feature.title}</strong>.</p>
            </div>
            <div style="margin:0 32px 24px;background:#18181b;border:1px solid #27272a;border-radius:12px;padding:28px;text-align:center;">
              <div style="font-size:12px;color:#78716c;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px;">Your verification code</div>
              <div style="font-size:42px;letter-spacing:0.28em;font-weight:800;color:#f59e0b;font-variant-numeric:tabular-nums;">${otp}</div>
              <div style="font-size:12px;color:#57534e;margin-top:12px;">Expires in 10 minutes</div>
            </div>
            <div style="padding:0 32px 32px;">
              <p style="font-size:13px;color:#78716c;margin:0;">If you didn't request this, you can safely ignore this email. Your email won't be added without verification.</p>
            </div>
            <div style="padding:16px 32px;border-top:1px solid #27272a;background:#0c0a09;">
              <p style="font-size:11px;color:#44403c;margin:0;">© 2026 docrud · Built In Bharat for the World</p>
            </div>
          </div>
        `,
        preheader: `Your early bird verification code: ${otp}`,
        origin: req.nextUrl.origin,
      }).catch(() => null);

      return NextResponse.json({ sessionId, expiresAt, message: 'OTP sent. Check your inbox.' });
    }

    // ── Step 2: verify OTP and enroll ───────────────────────────────────────
    if (action === 'verify_otp') {
      const { sessionId, otp, name } = body;
      if (!sessionId) return NextResponse.json({ error: 'Session ID is required.' }, { status: 400 });
      if (!otp) return NextResponse.json({ error: 'OTP is required.' }, { status: 400 });

      const { email, featureId } = await verifyEarlyAccessOtp(sessionId, String(otp));

      const features = await getEarlyAccessFeatures();
      const feature = features.find((f) => f.id === featureId);

      const { entry, isNew } = await addWaitlistEntry({
        featureId,
        email,
        name: String(name || '').trim().slice(0, 80) || email.split('@')[0],
        verified: true,
        verifiedAt: new Date().toISOString(),
      });

      if (isNew && feature) {
        await sendTrackedMail({
          policyKey: 'otp_verification',
          typeLabel: 'system',
          to: email,
          subject: `You're on the list! Early bird access to ${feature.title}`,
          text: `Hi ${entry.name},\n\nYou're officially on the early bird waitlist for "${feature.title}"!\n\nWe'll email you the moment it launches with exclusive early access. Thank you for being part of our journey.\n\n— docrud Team`,
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#09090b;color:#fafafa;border-radius:16px;overflow:hidden;">
              <div style="padding:32px 32px 0;">
                <div style="font-size:11px;letter-spacing:0.12em;color:#78716c;text-transform:uppercase;margin-bottom:6px;">docrud · Early Bird Access</div>
                <h2 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#fafafa;">You're on the list! 🎉</h2>
                <p style="margin:0 0 24px;font-size:15px;color:#a8a29e;">Hi <strong style="color:#fbbf24;">${entry.name}</strong>, you've secured your early bird spot for <strong style="color:#fafafa;">${feature.title}</strong>.</p>
              </div>
              <div style="margin:0 32px 24px;background:linear-gradient(135deg,#1c1917,#0c0a09);border:1px solid #292524;border-radius:12px;padding:24px;">
                <div style="font-size:13px;color:#78716c;margin-bottom:8px;">What happens next</div>
                <div style="display:flex;flex-direction:column;gap:12px;">
                  <div style="font-size:14px;color:#d6d3d1;">✅ &nbsp;You're verified and saved on the waitlist</div>
                  <div style="font-size:14px;color:#d6d3d1;">📬 &nbsp;We'll notify you first when this launches</div>
                  <div style="font-size:14px;color:#d6d3d1;">🎁 &nbsp;Early birds get special launch pricing</div>
                </div>
              </div>
              <div style="padding:0 32px 32px;">
                <p style="font-size:13px;color:#78716c;margin:0;">Thank you for being part of our journey. Your feedback shapes what we build.</p>
              </div>
              <div style="padding:16px 32px;border-top:1px solid #27272a;background:#0c0a09;">
                <p style="font-size:11px;color:#44403c;margin:0;">© 2026 docrud · Built In Bharat for the World</p>
              </div>
            </div>
          `,
          preheader: `You're on the early bird waitlist for ${feature.title}!`,
          origin: req.nextUrl.origin,
        }).catch(() => null);
      }

      return NextResponse.json({ success: true, isNew, position: feature ? feature.waitlistCount : 1 });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Something went wrong.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
