import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { OutboundEmailEvent } from '@/lib/server/email-outbox';
import {
  appendEmailOutboxEvent,
  buildTrackingPixel,
  createOutboundEmailId,
  rewriteLinksForTracking,
  updateEmailOutboxEvent,
} from '@/lib/server/email-outbox';
import { isValidEmail } from '@/lib/server/security';
import { getMailSettings } from '@/lib/server/settings';
import { getMailPolicies, type MailPolicyKey } from '@/lib/server/mail-policies';
import { buildEmailChrome, escapeHtmlLite } from '@/lib/server/email-chrome';

/* ─── Persistent pooled SMTP transporter ─────────────────────────────────────
   Creating a new transporter on every send triggers a fresh TCP + TLS
   handshake (~200–800 ms). With pool:true the connections stay alive and
   are reused, cutting per-email overhead to ~5–30 ms.
   The cache is keyed on the SMTP config hash; changing settings in admin
   automatically rotates to a fresh pool.
────────────────────────────────────────────────────────────────────────────── */
let _cachedTransporter: Transporter | null = null;
let _cachedConfigKey = '';

export async function getCachedTransporter(): Promise<Transporter> {
  const smtp = await getMailSettings();
  const configKey = `${smtp.host}|${smtp.port}|${smtp.secure}|${smtp.username}`;

  if (_cachedTransporter && _cachedConfigKey === configKey) {
    return _cachedTransporter;
  }

  // Close the old pool before replacing it
  if (_cachedTransporter) {
    try { (_cachedTransporter as Transporter & { close?: () => void }).close?.(); } catch { /* ignore */ }
  }

  _cachedTransporter = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 465,
    secure: Boolean(smtp.secure),
    auth: smtp.requireAuth ? { user: smtp.username, pass: smtp.password } : undefined,
    pool: true,           // keep TCP connections alive between sends
    maxConnections: 5,
    maxMessages: 200,
    connectionTimeout: 30_000,  // GoDaddy cold-start can take 10-15 s
    greetingTimeout:   20_000,
    socketTimeout:     30_000,
    tls: { rejectUnauthorized: false },
  });

  _cachedConfigKey = configKey;
  return _cachedTransporter;
}

type SendTrackedMailInput = {
  policyKey: MailPolicyKey;
  typeLabel: OutboundEmailEvent['type'];
  to: string;
  subject: string;
  text: string;
  html?: string;
  preheader?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  sentBy?: string;
  metadata?: Record<string, string>;
  attachment?: { filename: string; content: Buffer; contentType?: string };
  origin: string;
};

export async function sendTrackedMail(input: SendTrackedMailInput) {
  const to = String(input.to || '').trim();
  const subject = String(input.subject || '').trim();
  const text = String(input.text || '').trim();
  if (!isValidEmail(to) || !subject || !text) {
    throw new Error('Recipient email, subject, and message are required.');
  }

  const policies = await getMailPolicies();
  if (!policies[input.policyKey]) {
    const outboxId = createOutboundEmailId('skip');
    await appendEmailOutboxEvent({
      id: outboxId,
      createdAt: new Date().toISOString(),
      status: 'failed',
      type: input.typeLabel,
      to,
      cc: input.cc,
      bcc: input.bcc,
      subject,
      sentBy: input.sentBy || 'system',
      error: `Mail disabled by admin policy (${input.policyKey}).`,
      tracking: { opens: 0, clicks: 0 },
      metadata: input.metadata,
    });
    return { skipped: true, messageId: undefined, outboxId };
  }

  const smtp = await getMailSettings();
  if (!smtp.host || !smtp.fromEmail) {
    throw new Error('Mail settings are not configured.');
  }

  const outboxId = createOutboundEmailId('mail');
  await appendEmailOutboxEvent({
    id: outboxId,
    createdAt: new Date().toISOString(),
    status: 'queued',
    type: input.typeLabel,
    to,
    cc: input.cc,
    bcc: input.bcc,
    subject,
    sentBy: input.sentBy || 'system',
    tracking: { opens: 0, clicks: 0 },
    metadata: input.metadata,
  });

  const transporter = await getCachedTransporter();

  const trackedText = rewriteLinksForTracking(input.origin, outboxId, text);
  const baseBody = (input.html && input.html.trim())
    ? input.html.trim()
    : `<div style="font-size: 14px; white-space: pre-wrap;">${escapeHtmlLite(trackedText)}</div>`;
  const htmlBody = buildEmailChrome({
    origin: input.origin,
    subject,
    preheader: input.preheader,
    bodyHtml: baseBody,
  });

  try {
    const info = await transporter.sendMail({
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to,
      cc: input.cc?.length ? input.cc.join(',') : undefined,
      bcc: input.bcc?.length ? input.bcc.join(',') : undefined,
      replyTo: input.replyTo || smtp.replyTo || undefined,
      subject,
      text: trackedText,
      html: `${htmlBody}\n${buildTrackingPixel(input.origin, outboxId)}`,
      attachments: input.attachment
        ? [{ filename: input.attachment.filename, content: input.attachment.content, contentType: input.attachment.contentType }]
        : undefined,
    });

    await updateEmailOutboxEvent(outboxId, (ev) => ({
      ...ev,
      status: 'sent',
      messageId: info.messageId,
      sentAt: new Date().toISOString(),
      sentBy: input.sentBy || ev.sentBy,
    }));

    return { skipped: false, messageId: info.messageId, outboxId };
  } catch (err) {
    await updateEmailOutboxEvent(outboxId, (ev) => ({
      ...ev,
      status: 'failed',
      error: err instanceof Error ? err.message : 'Mail send failed',
    }));
    throw err;
  }
}
