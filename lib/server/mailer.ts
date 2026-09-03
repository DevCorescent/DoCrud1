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
/* Re-exported so existing importers of `getCachedTransporter` keep working. */
export { getCachedTransporter } from '@/lib/server/smtp-transport';
import { getMailProvider, classifyMailError } from '@/lib/server/mail-provider';

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
  /**
   * An explicit header image, passed through to the chrome. There is no
   * default: omit it and the email carries no image, which is what every
   * caller does today.
   */
  headerImageUrl?: string | null;
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

  const trackedText = rewriteLinksForTracking(input.origin, outboxId, text);
  const baseBody = (input.html && input.html.trim())
    ? input.html.trim()
    : `<div style="font-size: 14px; white-space: pre-wrap;">${escapeHtmlLite(trackedText)}</div>`;
  const htmlBody = buildEmailChrome({
    origin: input.origin,
    subject,
    preheader: input.preheader,
    bodyHtml: baseBody,
    headerImageUrl: input.headerImageUrl,
  });

  try {
    /* Delivery now goes through the provider seam rather than straight to a
       transporter. The message is identical; what changes is that a second
       provider could be introduced later without touching this function or
       any of its callers. */
    const info = await getMailProvider().send({
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
      updatedAt: new Date().toISOString(),
      attempts: Number(ev.attempts || 0) + 1,
      sentBy: input.sentBy || ev.sentBy,
    }));

    return { skipped: false, messageId: info.messageId, outboxId };
  } catch (err) {
    /* The classifier runs here anyway - every caller of this function
       classifies the error it rethrows. Recording the result on the outbox row
       means the operational console can answer "is this retryable?" without
       re-parsing an SMTP string in the browser, and without a second copy of
       the classification rules. */
    const failure = classifyMailError(err);
    const now = new Date().toISOString();
    await updateEmailOutboxEvent(outboxId, (ev) => ({
      ...ev,
      status: 'failed',
      error: failure.message,
      failureKind: failure.kind,
      providerCode: failure.code,
      retryable: failure.retryable,
      attempts: Number(ev.attempts || 0) + 1,
      failedAt: now,
      updatedAt: now,
    }));
    throw err;
  }
}
