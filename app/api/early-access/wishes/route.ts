import { NextRequest, NextResponse } from 'next/server';
import { addFeatureWish, getEarlyAccessFeatures } from '@/lib/server/early-access';
import { sendTrackedMail } from '@/lib/server/mailer';

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { featureId, email, name, currentSoftware, painPoints, expectedFeatures, excitement } = body;

    if (!featureId) return NextResponse.json({ error: 'Feature ID is required.' }, { status: 400 });
    if (!email || !isValidEmail(email)) return NextResponse.json({ error: 'Valid email is required.' }, { status: 400 });
    if (!painPoints || String(painPoints).trim().length < 10) return NextResponse.json({ error: 'Please describe your pain points (min 10 chars).' }, { status: 400 });
    if (!expectedFeatures || String(expectedFeatures).trim().length < 10) return NextResponse.json({ error: 'Please describe what you expect (min 10 chars).' }, { status: 400 });

    const features = await getEarlyAccessFeatures();
    const feature = features.find((f) => f.id === featureId);
    if (!feature) return NextResponse.json({ error: 'Feature not found.' }, { status: 404 });

    const wish = await addFeatureWish({
      featureId,
      email: email.trim().toLowerCase(),
      name: String(name || '').trim().slice(0, 80) || email.split('@')[0],
      currentSoftware: String(currentSoftware || '').trim().slice(0, 200),
      painPoints: String(painPoints).trim().slice(0, 1000),
      expectedFeatures: String(expectedFeatures).trim().slice(0, 1000),
      excitement: Math.min(5, Math.max(1, Number(excitement) || 3)),
    });

    await sendTrackedMail({
      policyKey: 'otp_verification',
      typeLabel: 'system',
      to: email.trim(),
      subject: `Your wish for ${feature.title} has been received — docrud`,
      text: `Hi ${wish.name},\n\nThank you for sharing your thoughts on "${feature.title}"! Your feedback directly influences what we build and how we prioritize.\n\nWe'll keep you updated as this feature takes shape.\n\n— docrud Team`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;background:#09090b;color:#fafafa;border-radius:16px;overflow:hidden;">
          <div style="padding:32px 32px 0;">
            <div style="font-size:11px;letter-spacing:0.12em;color:#78716c;text-transform:uppercase;margin-bottom:6px;">docrud · Make a Wish</div>
            <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fafafa;">Wish received! ✨</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#a8a29e;">Hi <strong style="color:#fbbf24;">${wish.name}</strong>, your thoughts on <strong style="color:#fafafa;">${feature.title}</strong> are noted.</p>
          </div>
          <div style="margin:0 32px 24px;background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px;">
            <p style="font-size:13px;color:#78716c;margin:0 0 6px;">Your feedback shapes what we build. Our product team reviews every single wish submitted.</p>
            <p style="font-size:13px;color:#a8a29e;margin:0;">We'll reach out if we need more details from you.</p>
          </div>
          <div style="padding:0 32px 32px;">
            <p style="font-size:13px;color:#78716c;margin:0;">Thank you for being an early believer in docrud.</p>
          </div>
          <div style="padding:16px 32px;border-top:1px solid #27272a;background:#0c0a09;">
            <p style="font-size:11px;color:#44403c;margin:0;">© 2026 docrud · Built In Bharat for the World</p>
          </div>
        </div>
      `,
      preheader: `Your wish for ${feature.title} is noted — thank you!`,
      origin: req.nextUrl.origin,
    }).catch(() => null);

    return NextResponse.json({ success: true, id: wish.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Something went wrong.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
