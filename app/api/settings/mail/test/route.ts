import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAuthSession } from '@/lib/server/auth';
import { appendEmailOutboxEvent, createOutboundEmailId } from '@/lib/server/email-outbox';
import { isValidEmail } from '@/lib/server/security';
import { getMailSettings } from '@/lib/server/settings';
import { buildEmailChrome, escapeHtmlLite } from '@/lib/server/email-chrome';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { testRecipient } = await request.json() as { testRecipient?: string };
    const settings = await getMailSettings();
    if (!settings.host || !settings.fromEmail) {
      return NextResponse.json({ error: 'SMTP settings are incomplete' }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: settings.host,
      port: Number(settings.port),
      secure: settings.secure,
      auth: settings.requireAuth
        ? {
            user: settings.username,
            pass: settings.password,
          }
        : undefined,
    });

    await transporter.verify();

    if (testRecipient) {
      if (!isValidEmail(testRecipient)) {
        return NextResponse.json({ error: 'Valid test recipient required' }, { status: 400 });
      }

      await transporter.sendMail({
        from: `"${settings.fromName}" <${settings.fromEmail}>`,
        to: testRecipient,
        subject: 'Corescent Technologies SMTP Test',
        text: 'This is a successful SMTP connectivity test from the Corescent document platform.',
        html: buildEmailChrome({
          origin: request.nextUrl.origin,
          subject: 'Corescent Technologies SMTP Test',
          bodyHtml: `<div style="font-size:14px; color:#0f172a;">${escapeHtmlLite('This is a successful SMTP connectivity test from the Corescent document platform.')}</div>`,
        }),
      });
    }

    try {
      const id = createOutboundEmailId('test');
      await appendEmailOutboxEvent({
        id,
        createdAt: new Date().toISOString(),
        status: 'tested',
        type: 'test',
        to: testRecipient || '(verify only)',
        subject: testRecipient ? 'SMTP Test Email' : 'SMTP Verify',
        sentAt: new Date().toISOString(),
        sentBy: session.user.email || 'admin',
        tracking: { opens: 0, clicks: 0 },
      });
    } catch {
      // ignore logging errors
    }

    return NextResponse.json({ message: testRecipient ? 'SMTP test mail sent successfully' : 'SMTP connection verified successfully' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'SMTP test failed' }, { status: 500 });
  }
}
