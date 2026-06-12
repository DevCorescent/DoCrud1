import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAuthSession } from '@/lib/server/auth';
import { createEmailLogEntry, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { appendEmailOutboxEvent, buildTrackingPixel, createOutboundEmailId, rewriteLinksForTracking, updateEmailOutboxEvent } from '@/lib/server/email-outbox';
import { isValidEmail } from '@/lib/server/security';
import { getAutomationSettings, getMailSettings } from '@/lib/server/settings';
import { buildEmailChrome, escapeHtmlLite } from '@/lib/server/email-chrome';
import { buildDocumentDeliveryEmail } from '@/lib/server/document-delivery-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseRecipientList(value: string) {
  return String(value || '')
    .split(/[,;\n]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  let historyId: string | undefined;
  let to = '';
  let subject = '';
  let sessionUserEmail = 'unknown';
  const outboxId = createOutboundEmailId();

  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    sessionUserEmail = session.user.email || 'unknown';

    const {
      historyId: nextHistoryId,
      to: nextTo,
      subject: nextSubject,
      text: nextText,
      senderNote,
      attachment,
      emailType,
    }: {
      historyId?: string;
      to: string;
      subject: string;
      text?: string;
      senderNote?: string;
      attachment?: number[];
      emailType?: 'document_delivery' | 'collection_request';
    } = await request.json();
    historyId = nextHistoryId;
    to = nextTo;
    subject = nextSubject;

    const toList = parseRecipientList(to);
    const invalidRecipients = toList.filter((email) => !isValidEmail(email));
    if (toList.length === 0 || invalidRecipients.length > 0) {
      return NextResponse.json({
        error: invalidRecipients.length > 0
          ? `Invalid recipient email(s): ${invalidRecipients.join(', ')}`
          : 'Recipient email is required',
      }, { status: 400 });
    }
    to = toList.join(',');

    if (!subject?.trim()) {
      return NextResponse.json({ error: 'Email subject is required' }, { status: 400 });
    }

    const settings = await getMailSettings();
    if (!settings.host || !settings.fromEmail) {
      return NextResponse.json({ error: 'Mail settings are not configured' }, { status: 500 });
    }

    const automations = await getAutomationSettings();
    const ccList = automations.autoCcGenerator && session.user.email ? [session.user.email] : [];
    const bccList = automations.autoBccAuditMailbox && settings.fromEmail && automations.auditMailbox ? [automations.auditMailbox] : [];

    const origin = request.nextUrl.origin;
    const historyEntry = historyId
      ? await getHistoryEntryById(historyId)
      : null;
    const templateEmail = historyEntry
      ? buildDocumentDeliveryEmail({
          origin,
          entry: historyEntry,
          subject,
          senderEmail: session.user.email || undefined,
          senderNote,
        })
      : null;
    const baseText = (templateEmail?.text || nextText || '').trim();
    if (!baseText) {
      return NextResponse.json({ error: 'Email message is required' }, { status: 400 });
    }

    await appendEmailOutboxEvent({
      id: outboxId,
      createdAt: new Date().toISOString(),
      status: 'queued',
      type: emailType || 'system',
      to: toList.join(','),
      cc: ccList,
      bcc: bccList,
      subject,
      sentBy: sessionUserEmail,
      tracking: { opens: 0, clicks: 0 },
      metadata: historyId ? { historyId } : undefined,
    });

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

    const trackedText = rewriteLinksForTracking(origin, outboxId, baseText);
    const rawHtml = (templateEmail?.html || '').trim();
    const trackedHtml = rawHtml ? rewriteLinksForTracking(origin, outboxId, rawHtml) : '';
    const bodyHtml = trackedHtml
      ? trackedHtml
      : `<div style="font-size: 14px; white-space: pre-wrap; color:#0f172a;">${escapeHtmlLite(trackedText)}</div>`;

    const trackingPixel = buildTrackingPixel(origin, outboxId);
    const shouldSkipChrome = templateEmail?.chrome === 'none';

    const htmlBody = shouldSkipChrome
      ? bodyHtml
      : buildEmailChrome({ origin, subject, preheader: templateEmail?.preheader, bodyHtml });

    const htmlWithTracking = shouldSkipChrome
      ? (htmlBody.includes('</body>')
          ? htmlBody.replace(/<\/body>/i, `${trackingPixel}</body>`)
          : `${htmlBody}\n${trackingPixel}`)
      : `${htmlBody}\n${trackingPixel}`;

    const info = await transporter.sendMail({
      from: `"${settings.fromName}" <${settings.fromEmail}>`,
      to: toList.join(','),
      cc: ccList.length > 0 ? ccList.join(',') : undefined,
      bcc: bccList.length > 0 ? bccList.join(',') : undefined,
      replyTo: settings.replyTo || undefined,
      subject,
      text: trackedText,
      html: htmlWithTracking,
      attachments: attachment
        ? [
            {
              filename: 'document.pdf',
              content: Buffer.from(attachment),
            },
          ]
        : undefined,
    });

    await updateEmailOutboxEvent(outboxId, (ev) => ({
      ...ev,
      status: 'sent',
      messageId: info.messageId,
      sentAt: new Date().toISOString(),
      sentBy: sessionUserEmail,
    }));

    if (historyId) {
      await updateHistoryEntry(historyId, (entry) => {
        const deliveryEvent = createEmailLogEntry({
          to: toList.join(','),
          subject,
          status: 'sent',
          sentAt: new Date().toISOString(),
          sentBy: sessionUserEmail,
        });

        return {
          ...entry,
          emailSent: true,
          emailTo: toList.join(','),
          emailSubject: subject,
          emailSentAt: deliveryEvent.sentAt,
          emailStatus: 'sent',
          deliveryHistory: [...(entry.deliveryHistory || []), deliveryEvent],
          automationNotes: [
            ...(entry.automationNotes || []),
            ...(emailType === 'collection_request' ? ['Collection request email sent'] : ['Document delivery email sent']),
            ...(ccList.length > 0 ? ['Generator copied on email'] : []),
            ...(bccList.length > 0 ? [`Audit mailbox notified: ${automations.auditMailbox}`] : []),
          ],
        };
      });
    }

    return NextResponse.json({ message: 'Email sent successfully', messageId: info.messageId });
  } catch (error) {
    console.error(error);
    try {
      await updateEmailOutboxEvent(outboxId, (ev) => ({
        ...ev,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown delivery failure',
      }));
    } catch {
      // ignore
    }
    if (historyId) {
      await updateHistoryEntry(historyId, (entry) => {
        const failureEvent = createEmailLogEntry({
          to,
          subject,
          status: 'failed',
          sentAt: new Date().toISOString(),
          sentBy: sessionUserEmail,
          error: error instanceof Error ? error.message : 'Unknown delivery failure',
        });

        return {
          ...entry,
          emailSent: false,
          emailTo: to || entry.emailTo,
          emailSubject: subject || entry.emailSubject,
          emailStatus: 'failed',
          emailError: failureEvent.error,
          deliveryHistory: [...(entry.deliveryHistory || []), failureEvent],
        };
      });
    }
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
