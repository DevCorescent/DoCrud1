import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAuthSession } from '@/lib/server/auth';
import { createAccessEvent, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { getMailSettings } from '@/lib/server/settings';
import { buildEmailChrome } from '@/lib/server/email-chrome';
import { isValidEmail } from '@/lib/server/security';
import { getDeviceLabel, getRequestIp, getRequestUserAgent } from '@/lib/server/public-documents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOLDOWN_MS = 15 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await request.json() as { historyId?: string; signerKey?: string };
    const historyId = String(payload.historyId || '').trim();
    const signerKey = String(payload.signerKey || '').trim().slice(0, 64);
    if (!historyId || !signerKey) return NextResponse.json({ error: 'History ID and signerKey are required' }, { status: 400 });

    const entry = await getHistoryEntryById(historyId);
    if (!entry) return NextResponse.json({ error: 'History entry not found' }, { status: 404 });

    const allowed = session.user.role === 'admin'
      || entry.generatedBy === session.user.email
      || ((session.user.role === 'client' || session.user.role === 'individual') && entry.organizationId === session.user.id)
      || (session.user.role === 'employee' && entry.employeeEmail?.toLowerCase() === (session.user.email || '').toLowerCase());
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const signerDirectory = entry.recipientSignerDirectory || {};
    const info = signerDirectory[signerKey];
    const toEmail = String(info?.signerEmail || '').trim().toLowerCase();
    const toName = String(info?.signerName || 'Signer').trim();
    if (!isValidEmail(toEmail)) return NextResponse.json({ error: 'Signer email is missing or invalid.' }, { status: 400 });

    const signedAlready = (entry.recipientSigners || []).some((s: any) => s.signerKey === signerKey && s.signingStatus === 'signed');
    if (signedAlready) return NextResponse.json({ error: 'This signer has already signed.' }, { status: 409 });

    const invite = entry.recipientSignerInvitesByKey?.[signerKey];
    if (!invite?.token) return NextResponse.json({ error: 'Signing link is not available. Send signing links first.' }, { status: 409 });
    if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Signing link expired. Resend signing link to generate a new secure link.' }, { status: 410 });
    }

    const lastReminderAt = invite.lastReminderAt ? new Date(invite.lastReminderAt).getTime() : 0;
    if (lastReminderAt && Date.now() - lastReminderAt < COOLDOWN_MS) {
      return NextResponse.json({ error: 'Reminder recently sent. Please wait before sending another reminder.' }, { status: 429 });
    }

    const smtp = await getMailSettings();
    if (!smtp.host || !smtp.fromEmail) {
      return NextResponse.json({ error: 'Email is not configured for this workspace.' }, { status: 409 });
    }

    const origin = request.nextUrl.origin;
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port),
      secure: smtp.secure,
      auth: smtp.requireAuth ? { user: smtp.username, pass: smtp.password } : undefined,
    });

    const signingLink = `${origin}/documents/${encodeURIComponent(entry.shareId || entry.id)}?token=${encodeURIComponent(invite.token)}`;
    const subject = `${entry.templateName || 'Document'} — Reminder to Sign`;
    const preheader = `Reminder: please complete your assigned signing fields for ${entry.templateName || 'this document'}.`;
    const bodyHtml = `
      <div style="padding: 4px 0 18px 0;">
        <div style="font-size:12px; letter-spacing:0.18em; text-transform:uppercase; color:#64748b; font-weight:700;">DocRud • Reminder</div>
        <h1 style="margin:10px 0 0 0; font-size:20px; line-height:1.2; color:#0f172a;">Signature reminder</h1>
        <p style="margin:10px 0 0 0; color:#334155; font-size:14px; line-height:1.6;">
          Hi ${toName}, this is a friendly reminder to sign <strong>${entry.templateName || 'the document'}</strong>.
        </p>
        <div style="margin:18px 0 0 0;">
          <a href="${signingLink}" style="display:inline-block; background:#0f172a; color:white; text-decoration:none; padding:12px 16px; border-radius:999px; font-weight:700; font-size:14px;">Open Signing Link</a>
        </div>
        <p style="margin:14px 0 0 0; color:#64748b; font-size:12px; line-height:1.6;">
          Link expires on <strong>${new Date(invite.expiresAt).toLocaleString()}</strong>.<br/>
          <span style="word-break:break-all; color:#0f172a;">${signingLink}</span>
        </p>
      </div>
    `;

    const reminderId = `rem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sentAt = new Date().toISOString();
    try {
      const html = buildEmailChrome({ origin, subject, preheader, bodyHtml });
      await transporter.sendMail({
        from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
        to: toEmail,
        replyTo: smtp.replyTo || undefined,
        subject,
        text: `Reminder to sign ${entry.templateName || 'document'}.\n\nOpen: ${signingLink}\nExpires: ${invite.expiresAt}`,
        html,
      });
    } catch (error) {
      await updateHistoryEntry(entry.id, (current) => ({
        ...current,
        recipientReminderHistory: [
          {
            id: reminderId,
            sentAt,
            sentBy: session.user.email || 'sender',
            signerKey,
            toEmail,
            status: 'failed' as const,
            error: error instanceof Error ? error.message : 'Failed',
          },
          ...(current.recipientReminderHistory || []),
        ].slice(0, 200),
      }));
      return NextResponse.json({ error: 'Failed to send reminder email' }, { status: 500 });
    }

    await updateHistoryEntry(entry.id, (current) => ({
      ...current,
      recipientSignerInvitesByKey: {
        ...(current.recipientSignerInvitesByKey || {}),
        [signerKey]: {
          ...(current.recipientSignerInvitesByKey?.[signerKey] || invite),
          lastReminderAt: sentAt,
          reminderCount: Math.max(0, Number(current.recipientSignerInvitesByKey?.[signerKey]?.reminderCount || invite?.reminderCount || 0)) + 1,
        },
      },
      recipientReminderHistory: [
        {
          id: reminderId,
          sentAt,
          sentBy: session.user.email || 'sender',
          signerKey,
          toEmail,
          status: 'sent' as const,
        },
        ...(current.recipientReminderHistory || []),
      ].slice(0, 200),
      accessEvents: [
        createAccessEvent({
          eventType: 'email',
          createdAt: sentAt,
          ip: getRequestIp(request),
          userAgent: getRequestUserAgent(request),
          deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
          actorName: `${session.user.email || 'sender'} (reminder ${signerKey})`,
        }),
        ...(current.accessEvents || []),
      ].slice(0, 50),
      automationNotes: [...(current.automationNotes || []), `Reminder sent to signer ${signerKey}`],
    }));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to send reminder' }, { status: 500 });
  }
}
