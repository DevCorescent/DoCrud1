import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { getMailSettings } from '@/lib/server/settings';
import { appendEmailOutboxEvent, createOutboundEmailId } from '@/lib/server/email-outbox';
import { isValidEmail } from '@/lib/server/security';
import { buildEmailChrome, escapeHtmlLite } from '@/lib/server/email-chrome';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let recipient: string | undefined;
  let verifyOnly = false;

  try {
    const body = await req.json().catch(() => ({}));
    recipient = body.recipient?.trim() || undefined;
    verifyOnly = !recipient;
  } catch {
    verifyOnly = true;
  }

  if (recipient && !isValidEmail(recipient)) {
    return NextResponse.json({ error: 'Invalid recipient email address.' }, { status: 400 });
  }

  const settings = await getMailSettings().catch(() => null);
  if (!settings) {
    return NextResponse.json({ error: 'Could not load SMTP settings.' }, { status: 500 });
  }
  if (!settings.host) {
    return NextResponse.json({ error: 'SMTP host is not configured.' }, { status: 400 });
  }
  if (!settings.fromEmail) {
    return NextResponse.json({ error: 'From email is not configured.' }, { status: 400 });
  }
  if (settings.requireAuth && (!settings.username || !settings.password)) {
    return NextResponse.json({ error: 'SMTP auth is required but username/password are missing.' }, { status: 400 });
  }

  const transporter = nodemailer.createTransport({
    host: settings.host,
    port: Number(settings.port),
    secure: settings.secure,
    auth: settings.requireAuth ? { user: settings.username, pass: settings.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  } as Parameters<typeof nodemailer.createTransport>[0]);
  const startedAt = Date.now();

  // Step 1: verify connectivity
  try {
    await transporter.verify();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SMTP connection failed';
    const hint = buildHint(message, settings.host, settings.port, settings.secure);
    await appendSuperAdminAudit({
      action: 'smtp_test_failed',
      details: { error: message, host: settings.host, port: settings.port },
      ip: req.headers.get('x-forwarded-for') || undefined,
    });
    return NextResponse.json({
      ok: false,
      stage: 'verify',
      error: message,
      hint,
      config: { host: settings.host, port: settings.port, secure: settings.secure, requireAuth: settings.requireAuth },
      elapsedMs: Date.now() - startedAt,
    }, { status: 502 });
  }

  const verifyMs = Date.now() - startedAt;

  if (verifyOnly) {
    await appendSuperAdminAudit({
      action: 'smtp_test_verify_ok',
      details: { host: settings.host, port: settings.port, elapsedMs: verifyMs },
      ip: req.headers.get('x-forwarded-for') || undefined,
    });

    try {
      const id = createOutboundEmailId('test');
      await appendEmailOutboxEvent({
        id,
        createdAt: new Date().toISOString(),
        status: 'tested',
        type: 'test',
        to: '(verify only)',
        subject: 'SMTP Verify',
        sentAt: new Date().toISOString(),
        sentBy: session.email || 'super-admin',
        tracking: { opens: 0, clicks: 0 },
      });
    } catch { /* ignore outbox errors */ }

    return NextResponse.json({
      ok: true,
      stage: 'verify',
      message: `SMTP connection verified in ${verifyMs}ms. Server at ${settings.host}:${settings.port} is reachable and auth accepted.`,
      config: { host: settings.host, port: settings.port, secure: settings.secure, requireAuth: settings.requireAuth, fromEmail: settings.fromEmail, fromName: settings.fromName },
      elapsedMs: verifyMs,
    });
  }

  // Step 2: send test mail
  const subject = 'Docrud SMTP Test — Connection Verified';
  const bodyText = `This is a test email sent from the Docrud super admin panel.\n\nSMTP server: ${settings.host}:${settings.port}\nFrom: ${settings.fromName} <${settings.fromEmail}>\nSent at: ${new Date().toUTCString()}\n\nIf you received this, your SMTP configuration is working correctly.`;
  const bodyHtml = buildEmailChrome({
    origin: req.nextUrl.origin,
    subject,
    preheader: 'Your Docrud SMTP configuration is working correctly.',
    bodyHtml: `
      <div style="font-size:14px;color:#0f172a;line-height:1.7;">
        <p style="margin:0 0 16px;">This is a test email sent from the <strong>Docrud super admin panel</strong>.</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:16px;">
          <tr><td style="padding:6px 12px;background:#f1f5f9;border-radius:4px;font-weight:600;color:#475569;width:160px;">SMTP host</td><td style="padding:6px 12px;">${escapeHtmlLite(settings.host)}:${settings.port}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;color:#475569;">Encryption</td><td style="padding:6px 12px;">${settings.secure ? 'SSL/TLS' : 'STARTTLS / None'}</td></tr>
          <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600;color:#475569;">From</td><td style="padding:6px 12px;">${escapeHtmlLite(settings.fromName)} &lt;${escapeHtmlLite(settings.fromEmail)}&gt;</td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;color:#475569;">Sent at</td><td style="padding:6px 12px;">${new Date().toUTCString()}</td></tr>
        </table>
        <p style="margin:0;color:#64748b;font-size:13px;">If you received this email, your SMTP configuration is working correctly.</p>
      </div>
    `,
  });

  let messageId: string | undefined;
  try {
    const info = await transporter.sendMail({
      from: `"${settings.fromName}" <${settings.fromEmail}>`,
      to: recipient,
      replyTo: settings.replyTo || undefined,
      subject,
      text: bodyText,
      html: bodyHtml,
    });
    messageId = info.messageId;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Send failed';
    const hint = buildHint(message, settings.host, settings.port, settings.secure);
    await appendSuperAdminAudit({
      action: 'smtp_test_send_failed',
      details: { error: message, recipient, host: settings.host },
      ip: req.headers.get('x-forwarded-for') || undefined,
    });
    return NextResponse.json({
      ok: false,
      stage: 'send',
      error: message,
      hint,
      config: { host: settings.host, port: settings.port, secure: settings.secure },
      elapsedMs: Date.now() - startedAt,
    }, { status: 502 });
  }

  const totalMs = Date.now() - startedAt;

  await appendSuperAdminAudit({
    action: 'smtp_test_sent',
    details: { recipient, host: settings.host, port: settings.port, messageId, elapsedMs: totalMs },
    ip: req.headers.get('x-forwarded-for') || undefined,
  });

  try {
    const id = createOutboundEmailId('test');
    await appendEmailOutboxEvent({
      id,
      createdAt: new Date().toISOString(),
      status: 'tested',
      type: 'test',
      to: recipient!,
      subject,
      messageId,
      sentAt: new Date().toISOString(),
      sentBy: session.email || 'super-admin',
      tracking: { opens: 0, clicks: 0 },
    });
  } catch { /* ignore outbox errors */ }

  return NextResponse.json({
    ok: true,
    stage: 'sent',
    message: `Test email delivered to ${recipient} in ${totalMs}ms.`,
    messageId,
    config: { host: settings.host, port: settings.port, secure: settings.secure, fromEmail: settings.fromEmail, fromName: settings.fromName },
    elapsedMs: totalMs,
  });
}

function buildHint(error: string, host: string, port: number, secure: boolean): string {
  const e = error.toLowerCase();
  if (e.includes('econnrefused') || e.includes('connect')) {
    return `Connection refused on ${host}:${port}. Check that the host and port are correct, and that no firewall is blocking outbound connections.`;
  }
  if (e.includes('self signed') || e.includes('certificate')) {
    return 'TLS certificate error. The server may be using a self-signed certificate. Verify the host name matches the certificate.';
  }
  if (e.includes('authentication') || e.includes('auth') || e.includes('credentials') || e.includes('535') || e.includes('530')) {
    return 'Authentication failed. Double-check your username and password. For Titan Mail, the username must be the full email address (e.g. support@docrud.com).';
  }
  if (e.includes('timeout') || e.includes('etimedout')) {
    return `Connection timed out reaching ${host}:${port}. The server may be unreachable or slow. Try port 587 if 465 fails.`;
  }
  if (e.includes('ssl') || e.includes('tls') || e.includes('wrong version')) {
    return `TLS negotiation failed on port ${port}. ${secure ? 'Port 465 requires SSL. Try disabling "Secure" and using port 587 with STARTTLS.' : 'Try enabling "Secure (SSL/TLS)" with port 465.'}`;
  }
  if (e.includes('getaddrinfo') || e.includes('dns') || e.includes('enotfound')) {
    return `DNS lookup failed for "${host}". Verify the SMTP hostname is correct.`;
  }
  return 'Check your SMTP host, port, and credentials. For Titan Mail: host=smtp.titan.email, port=465, secure=true.';
}
