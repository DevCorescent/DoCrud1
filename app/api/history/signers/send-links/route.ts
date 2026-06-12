import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { getAuthSession } from '@/lib/server/auth';
import { createAccessEvent, getHistoryEntryById, updateHistoryEntry } from '@/lib/server/history';
import { getMailSettings } from '@/lib/server/settings';
import { isValidEmail } from '@/lib/server/security';
import { getDeviceLabel, getRequestIp, getRequestUserAgent } from '@/lib/server/public-documents';
import { hasInfinity } from '@/lib/server/infinity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function generateSigningToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function isExpired(expiresAt?: string) {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  return Number.isNaN(t) || t < Date.now();
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await request.json() as { historyId?: string; signerKey?: string };
    const historyId = String(payload.historyId || '').trim();
    if (!historyId) return NextResponse.json({ error: 'History ID is required' }, { status: 400 });

    const entry = await getHistoryEntryById(historyId);
    if (!entry) return NextResponse.json({ error: 'History entry not found' }, { status: 404 });

    const infinity = await hasInfinity(session.user.id!);
    if (!infinity) {
      return NextResponse.json({ error: 'Docrud Infinity required', code: 'INFINITY_REQUIRED', feature: 'esign' }, { status: 403 });
    }

    const allowed = session.user.role === 'admin'
      || entry.generatedBy === session.user.email
      || ((session.user.role === 'client' || session.user.role === 'individual') && entry.organizationId === session.user.id)
      || (session.user.role === 'employee' && entry.employeeEmail?.toLowerCase() === (session.user.email || '').toLowerCase());
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (entry.documentSourceType !== 'uploaded_pdf') {
      return NextResponse.json({ error: 'Multi-signer send links currently supports uploaded PDF signing.' }, { status: 400 });
    }

    const placements = entry.recipientSignaturePlacements;
    if (!placements || (placements as any).mode !== 'boxes' || !Array.isArray((placements as any).boxes) || !(placements as any).boxes.length) {
      return NextResponse.json({ error: 'Place signature boxes first before sending signing links.' }, { status: 400 });
    }
    const boxes = (placements as any).boxes as any[];
    const requiredBoxes = boxes.filter((b) => (b as any)?.required !== false);
    const missingAssignee = requiredBoxes.filter((b) => !String((b as any)?.signerKey || '').trim()).map((b) => String((b as any)?.id || ''));
    if (missingAssignee.length) {
      return NextResponse.json({ error: 'Assign a signer for every required signature box before sending.' }, { status: 400 });
    }

    const signerDirectory = entry.recipientSignerDirectory || {};
    const signerKeysWithRequiredBoxes = Array.from(new Set(requiredBoxes.map((b) => String((b as any)?.signerKey || 'recipient').trim() || 'recipient')));
    const targetKeys = payload.signerKey
      ? [String(payload.signerKey).slice(0, 64)]
      : signerKeysWithRequiredBoxes;

    if (!targetKeys.length) {
      return NextResponse.json({ error: 'No required signer assignments found.' }, { status: 400 });
    }

    for (const key of targetKeys) {
      const info = signerDirectory[key];
      const toEmail = String(info?.signerEmail || '').trim().toLowerCase();
      if (!isValidEmail(toEmail)) {
        return NextResponse.json({ error: `Signer email missing/invalid for signer key "${key}".` }, { status: 400 });
      }
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

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const results: Array<{ signerKey: string; toEmail: string; status: 'sent' | 'skipped' | 'failed'; error?: string }> = [];

    const updated = await updateHistoryEntry(entry.id, (current) => {
      const invites = { ...(current.recipientSignerInvitesByKey || {}) } as Record<string, any>;
      for (const key of targetKeys) {
        const info = signerDirectory[key];
        const toEmail = String(info?.signerEmail || '').trim().toLowerCase();
        const toName = String(info?.signerName || 'Signer').trim();
        const toRole = String(info?.signerRole || '').trim();
        if (!isValidEmail(toEmail)) continue;
        const existing = invites[key];
        if (existing?.token && !isExpired(existing.expiresAt)) {
          invites[key] = {
            ...existing,
            lastSentAt: nowIso,
            signerEmail: String(existing.signerEmail || toEmail).trim().toLowerCase(),
            signerName: String(existing.signerName || toName).trim(),
            signerRole: String(existing.signerRole || toRole).trim(),
            sendCount: Math.max(0, Number(existing.sendCount || 0)),
          };
          continue;
        }
        invites[key] = {
          token: generateSigningToken(),
          createdAt: nowIso,
          expiresAt,
          sentAt: existing?.sentAt || undefined,
          lastSentAt: nowIso,
          signerEmail: toEmail,
          signerName: toName,
          signerRole: toRole,
          sendCount: Math.max(0, Number(existing?.sendCount || 0)),
          lastReminderAt: existing?.lastReminderAt || undefined,
          reminderCount: Math.max(0, Number(existing?.reminderCount || 0)),
        };
      }
      return {
        ...current,
        recipientSignerInvitesByKey: invites,
      };
    });

    if (!updated) return NextResponse.json({ error: 'Failed to update history entry' }, { status: 500 });

    for (const key of targetKeys) {
      const info = signerDirectory[key];
      const toEmail = String(info?.signerEmail || '').trim().toLowerCase();
      const toName = String(info?.signerName || 'Signer').trim();
      const role = String(info?.signerRole || '').trim();
      if (!isValidEmail(toEmail)) {
        results.push({ signerKey: key, toEmail, status: 'skipped', error: 'Invalid email' });
        continue;
      }
      const invite = updated.recipientSignerInvitesByKey?.[key];
      if (!invite?.token) {
        results.push({ signerKey: key, toEmail, status: 'failed', error: 'Missing signing token' });
        continue;
      }
      const signingLink = `${origin}/documents/${encodeURIComponent(entry.shareId || entry.id)}?token=${encodeURIComponent(invite.token)}`;
      const subject = 'Action Required: Sign "' + (entry.templateName || 'Document') + '"';
      const preheader = `${toName}, your signature is requested on ${entry.templateName || 'a document'}. Secure link enclosed.`;
      const expiryDate = new Date(invite.expiresAt).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const stepsHtml = [
        ['1', 'Click the button below to open your personal secure signing link.'],
        ['2', 'Verify your identity via email OTP if required.'],
        ['3', 'Review the document carefully before signing.'],
        ['4', 'Complete all assigned signature fields to finish.'],
      ].map(([n, text]) =>
        '<tr>' +
        '<td style="padding:5px 14px 5px 0;vertical-align:top;width:24px;">' +
        '<div style="width:22px;height:22px;border-radius:50%;background:#f1f5f9;border:1px solid #e2e8f0;font-size:11px;font-weight:800;color:#475569;text-align:center;line-height:22px;">' + n + '</div>' +
        '</td>' +
        '<td style="padding:5px 0;font-size:13px;color:#475569;line-height:1.6;vertical-align:top;">' + text + '</td>' +
        '</tr>'
      ).join('');
      const refHtml = entry.referenceNumber ? '<div style="margin-top:6px;font-size:13px;color:#64748b;">Ref&nbsp;#' + entry.referenceNumber + '</div>' : '';
      const roleHtml = role ? '&nbsp;<span style="font-weight:400;color:#64748b;">(' + role + ')</span>' : '';

      const bodyHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 40px rgba(0,0,0,0.10);">

<!-- header -->
<tr>
  <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:28px 32px 26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="font-size:11px;font-weight:800;letter-spacing:0.20em;text-transform:uppercase;color:#64748b;margin-bottom:10px;">
            Secure E-Sign Platform
          </div>
          <div style="font-size:24px;font-weight:800;color:#f8fafc;letter-spacing:-0.03em;line-height:1.2;">
            Signature Requested
          </div>
          ${refHtml}
        </td>
        <td align="right" valign="top">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);">
            <span style="font-size:22px;">✍️</span>
          </div>
        </td>
      </tr>
    </table>
  </td>
</tr>

<!-- salutation -->
<tr>
  <td style="padding:28px 32px 0;">
    <p style="margin:0 0 6px;font-size:16px;color:#0f172a;font-weight:600;">Hi ${toName}${roleHtml},</p>
    <p style="margin:0;font-size:14px;color:#475569;line-height:1.7;">
      You have been invited to review and sign a document. Please complete your signature at your earliest convenience.
    </p>
  </td>
</tr>

<!-- document card -->
<tr>
  <td style="padding:20px 32px 0;">
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:8px;">Document</div>
      <div style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;line-height:1.3;">${entry.templateName || 'Signing Request'}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;width:100%;">
        <tr>
          <td style="padding-right:24px;">
            <div style="font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Envelope ID</div>
            <div style="font-size:12px;color:#334155;font-family:ui-monospace,monospace;margin-top:3px;word-break:break-all;">${entry.shareId || entry.id}</div>
          </td>
          <td>
            <div style="font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;">Expires</div>
            <div style="font-size:12px;color:#334155;margin-top:3px;">${expiryDate}</div>
          </td>
        </tr>
      </table>
    </div>
  </td>
</tr>

<!-- CTA -->
<tr>
  <td style="padding:24px 32px 0;text-align:center;">
    <a href="${signingLink}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:16px 36px;border-radius:999px;font-weight:800;font-size:15px;letter-spacing:-0.01em;box-shadow:0 4px 24px rgba(15,23,42,0.25);">
      Review &amp; Sign Document →
    </a>
    <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">This is a personal secure link. Do not share it.</p>
  </td>
</tr>

<!-- steps -->
<tr>
  <td style="padding:24px 32px 0;">
    <div style="border:1px solid #e2e8f0;border-radius:16px;padding:20px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:14px;">How to complete</div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${stepsHtml}
      </table>
    </div>
  </td>
</tr>

<!-- link fallback -->
<tr>
  <td style="padding:20px 32px 0;">
    <div style="background:#f8fafc;border-radius:12px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">
        If the button above doesn't work, open this link in your browser
      </div>
      <div style="font-size:12px;word-break:break-all;color:#0f172a;font-family:ui-monospace,monospace;">${signingLink}</div>
    </div>
  </td>
</tr>

<!-- footer -->
<tr>
  <td style="padding:24px 32px 28px;border-top:1px solid #f1f5f9;margin-top:24px;">
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.7;">
      This signing request was sent via a secure document platform on behalf of <strong style="color:#64748b;">${smtp.fromName || 'the sender'}</strong>.
      If you believe this was sent in error, please ignore this message -- your information will not be shared.
    </p>
    <p style="margin:10px 0 0;font-size:11px;color:#cbd5e1;">
      Secured with end-to-end audit trail &nbsp;·&nbsp; IP &amp; device logging &nbsp;·&nbsp; OTP identity verification
    </p>
  </td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>
      `;

      try {
        await transporter.sendMail({
          from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
          to: toEmail,
          replyTo: smtp.replyTo || undefined,
          subject,
          text: `Signature requested: ${entry.templateName || 'Document'}\n\nHi ${toName},\nPlease review and sign the document using the secure link below.\n\nSigning link: ${signingLink}\nExpires: ${expiryDate}\nEnvelope: ${entry.shareId || entry.id}\n\nThis is a personal secure link -- do not share it.`,
          html: bodyHtml,
        });
        results.push({ signerKey: key, toEmail, status: 'sent' });
      } catch (error) {
        results.push({ signerKey: key, toEmail, status: 'failed', error: error instanceof Error ? error.message : 'Failed' });
      }
    }

    await updateHistoryEntry(entry.id, (current) => ({
      ...current,
      accessEvents: [
        createAccessEvent({
          eventType: 'email',
          createdAt: new Date().toISOString(),
          ip: getRequestIp(request),
          userAgent: getRequestUserAgent(request),
          deviceLabel: getDeviceLabel(getRequestUserAgent(request)),
          actorName: `${session.user.email || 'sender'} (signing links)`,
        }),
        ...(current.accessEvents || []),
      ].slice(0, 50),
      automationNotes: [...(current.automationNotes || []), 'Signing links sent to recipients'],
    }));

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to send signing links' }, { status: 500 });
  }
}
