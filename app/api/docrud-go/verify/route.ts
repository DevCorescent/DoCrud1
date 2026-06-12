import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getRazorpayConfig } from '@/lib/server/billing';
import { getProfileData, updateProfileData } from '@/lib/server/user-profiles';
import { sendTrackedMail } from '@/lib/server/mailer';
import { buildEmailChrome } from '@/lib/server/email-chrome';

export const dynamic = 'force-dynamic';

function verifySignature(orderId: string, paymentId: string, signature: string, secret: string) {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}

function buildDocrudGoWelcomeEmail(userName: string, origin: string): string {
  const firstName = (userName || 'there').split(' ')[0];
  const features = [
    { name: 'E-Sign Studio', desc: 'Sign and send documents', limit: '25 docs/month' },
    { name: 'Document AI', desc: 'Generate NDAs, contracts, invoices', limit: '50 generations/month' },
    { name: 'DocWord Studio', desc: 'Collaborative document editor', limit: '30 documents/month' },
    { name: 'PDF Studio', desc: 'Edit, annotate & share PDFs', limit: '30 PDFs/month' },
    { name: 'Smart Form Builder', desc: 'Forms with conditional logic', limit: '10 active forms' },
    { name: 'Compliance Vault', desc: 'Secure encrypted storage', limit: '2 GB storage' },
    { name: 'People Network', desc: 'Connect with professionals', limit: 'Unlimited connections' },
    { name: 'Gig Board', desc: 'Post & apply for opportunities', limit: '5 active gig posts' },
  ];

  const featureRows = features.map(f => `
    <tr>
      <td style="padding:10px 0; border-bottom:1px solid #f1f5f9;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="width:18px; vertical-align:top; padding-top:2px;">
              <div style="width:8px; height:8px; border-radius:50%; background:linear-gradient(135deg,#4f46e5,#818cf8); margin-top:3px;"></div>
            </td>
            <td style="padding-left:10px;">
              <span style="font-size:13.5px; font-weight:700; color:#0f172a;">${f.name}</span>
              <span style="font-size:12px; color:#64748b;"> — ${f.desc}</span>
              <div style="margin-top:2px; font-size:11.5px; color:#94a3b8; font-style:italic;">Limit: ${f.limit}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const badgeBenefits = [
    'Infinity verified badge on your profile and all posts',
    'Profile featured 3× more in search results',
    'Priority listing in the talent directory',
    'Access to verified-only premium gig listings',
    'Higher credibility with clients and collaborators',
    'Faster connection growth — verified users connect more',
  ].map(b => `
    <tr><td style="padding:6px 0; border-bottom:1px solid #eef2ff;">
      <span style="font-size:12.5px; color:#4338ca;">∞ ${b}</span>
    </td></tr>
  `).join('');

  const bodyHtml = `
    <div style="background:linear-gradient(135deg,#06060f 0%,#0f0e2e 50%,#06060f 100%); border-radius:16px; padding:28px 24px; margin-bottom:20px; text-align:center;">
      <div style="font-size:11px; font-weight:800; letter-spacing:.18em; text-transform:uppercase; color:rgba(165,180,252,0.7); margin-bottom:8px;">Welcome to</div>
      <div style="font-size:32px; font-weight:900; letter-spacing:-.03em; background:linear-gradient(90deg,#6366f1,#a5b4fc,#6366f1); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;">Docrud Infinity ∞</div>
      <div style="margin-top:10px; font-size:14px; color:rgba(255,255,255,0.55); max-width:360px; margin-left:auto; margin-right:auto; line-height:1.6;">
        You're now verified, ${firstName}. Your Infinity badge is live on your profile.
      </div>
    </div>

    <p style="font-size:14.5px; color:#334155; line-height:1.7; margin:0 0 20px;">
      Hi ${firstName}, your <strong style="color:#4338ca;">Docrud Infinity</strong> subscription is active. Here's everything you get access to — along with the monthly limits that apply to your plan.
    </p>

    <div style="background:#eef2ff; border:1px solid #c7d2fe; border-radius:12px; padding:18px 20px; margin-bottom:20px;">
      <div style="font-size:12px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:#4338ca; margin-bottom:12px;">∞ Infinity Badge Benefits</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${badgeBenefits}
      </table>
    </div>

    <div style="margin-bottom:20px;">
      <div style="font-size:12px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:#475569; margin-bottom:12px;">Your Features &amp; Limits</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${featureRows}
      </table>
    </div>

    <div style="background:#f8fafc; border-radius:10px; padding:16px 18px; margin-bottom:20px;">
      <div style="font-size:12px; font-weight:700; color:#64748b; margin-bottom:6px;">What happens when you hit a limit?</div>
      <p style="font-size:12.5px; color:#94a3b8; margin:0; line-height:1.65;">
        Your existing work is never deleted. You'll see a friendly notice and can either wait for the next month's reset or upgrade to a higher plan from your workspace settings.
      </p>
    </div>

    <div style="text-align:center; margin:28px 0;">
      <a href="${origin}" style="display:inline-block; background:linear-gradient(135deg,#4f46e5,#6366f1); color:#ffffff; font-size:14px; font-weight:900; letter-spacing:-.01em; text-decoration:none; padding:13px 36px; border-radius:12px; box-shadow:0 4px 18px rgba(99,102,241,0.35);">
        Open Docrud ∞
      </a>
    </div>

    <p style="font-size:12px; color:#94a3b8; text-align:center; line-height:1.6; margin:0;">
      Questions? Reply to this email or visit our Help Centre.<br/>
      <strong style="color:#64748b;">Docrud Platform</strong> · SOC 2 · GDPR · End-to-end encrypted
    </p>
  `;

  return buildEmailChrome({
    origin,
    subject: `Welcome to Docrud Infinity, ${firstName}! ∞`,
    preheader: `Your Infinity verified badge is live — here's everything included in your Docrud Infinity plan.`,
    bodyHtml,
  });
}

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const orderId   = typeof body?.razorpay_order_id   === 'string' ? body.razorpay_order_id   : '';
    const paymentId = typeof body?.razorpay_payment_id  === 'string' ? body.razorpay_payment_id  : '';
    const signature = typeof body?.razorpay_signature   === 'string' ? body.razorpay_signature   : '';

    if (!orderId || !paymentId || !signature) {
      return NextResponse.json({ error: 'Incomplete payment payload.' }, { status: 400 });
    }

    const { keySecret } = getRazorpayConfig();
    if (!keySecret) {
      return NextResponse.json({ error: 'Payment gateway not configured.' }, { status: 503 });
    }

    const isValid = verifySignature(orderId, paymentId, signature, keySecret);
    if (!isValid) {
      return NextResponse.json({ error: 'Payment signature verification failed.' }, { status: 400 });
    }

    const users = await getStoredUsers();
    const normalizedEmail = session.user.email.trim().toLowerCase();
    const user = users.find(u => u.email.trim().toLowerCase() === normalizedEmail);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const profile = await getProfileData(user.id);
    if (!profile.docrudGo) {
      await updateProfileData(user.id, {
        docrudGo: true,
        docrudGoPurchasedAt: new Date().toISOString(),
      });
    }

    const origin = new URL(request.url).origin;
    try {
      const html = buildDocrudGoWelcomeEmail(user.name || '', origin);
      await sendTrackedMail({
        policyKey: 'docrud_go_welcome',
        typeLabel: 'docrud_go_welcome',
        to: user.email,
        subject: `Welcome to Docrud Infinity, ${(user.name || 'there').split(' ')[0]}! ∞`,
        preheader: 'Your Infinity verified badge is live — here\'s everything included.',
        text: `Welcome to Docrud Infinity! Your verified badge is now live on your profile. Sign in at ${origin} to get started.`,
        html,
        sentBy: 'system',
        origin,
      });
    } catch {
      // Non-fatal — badge is already granted
    }

    return NextResponse.json({ success: true, docrudGo: true });
  } catch (err) {
    console.error('[docrud-go/verify]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
