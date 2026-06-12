import type { DocumentHistory } from '@/types/document';
import { escapeHtmlLite } from '@/lib/server/email-chrome';

function stripHtml(value: string) {
  return String(value || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatLocalDate(iso?: string) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function buildPublicLink(origin: string, entry: Pick<DocumentHistory, 'shareId' | 'shareUrl' | 'id'>) {
  const base = String(origin || '').trim().replace(/\/$/, '');
  if (entry.shareUrl) {
    if (entry.shareUrl.startsWith('http')) return entry.shareUrl;
    return `${base}${entry.shareUrl.startsWith('/') ? '' : '/'}${entry.shareUrl}`;
  }
  if (entry.shareId) return `${base}/documents/${entry.shareId}`;
  if (entry.id) return `${base}/documents/${entry.id}`;
  return base;
}

function buildPolicyLabel(entry: Pick<DocumentHistory, 'shareAccessPolicy' | 'shareExpiresAt' | 'maxAccessCount'>) {
  if (entry.shareAccessPolicy === 'expiring') {
    return entry.shareExpiresAt ? `Expiring (expires ${formatLocalDate(entry.shareExpiresAt)})` : 'Expiring';
  }
  if (entry.shareAccessPolicy === 'one_time') {
    return `One-time (${Math.max(1, Number(entry.maxAccessCount || 1))} max)`;
  }
  return 'Standard';
}

export function buildSignedReceiptEmail(input: {
  origin: string;
  entry: DocumentHistory;
  recipientType: 'signer' | 'sender';
  signerEmail?: string;
  senderEmail?: string;
  senderNote?: string;
}) {
  const origin = String(input.origin || '').trim().replace(/\/$/, '');
  const entry = input.entry;
  const publicLink = buildPublicLink(origin, entry);
  const signerName = entry.recipientSignerName || 'Signer';
  const signedAt = entry.recipientSignedAt ? formatLocalDate(entry.recipientSignedAt) : '';
  const signedIp = entry.recipientSignedIp || '';
  const policyLabel = buildPolicyLabel(entry);
  const docLabel = entry.documentSourceType === 'uploaded_pdf'
    ? (entry.uploadedPdfFileName || entry.templateName || 'Uploaded PDF')
    : (entry.templateName || 'Document');

  const title = input.recipientType === 'signer' ? 'Signing receipt' : 'Document signed: receipt';
  const preheader = entry.referenceNumber
    ? `${docLabel} (${entry.referenceNumber}) signed by ${signerName}.`
    : `${docLabel} signed by ${signerName}.`;

  const senderNoteText = stripHtml(input.senderNote || '');

  const termsLinks = [
    { label: 'Terms', url: `${origin}/terms-and-conditions` },
    { label: 'Privacy', url: `${origin}/privacy-policy` },
    { label: 'Signed document policy', url: `${origin}/signed-document-policy` },
  ];

  const detailsRows = [
    { label: 'Document', value: docLabel },
    ...(entry.referenceNumber ? [{ label: 'Reference', value: entry.referenceNumber }] : []),
    ...(entry.generatedAt ? [{ label: 'Generated', value: formatLocalDate(entry.generatedAt) }] : []),
    { label: 'Signed by', value: signerName },
    ...(input.signerEmail ? [{ label: 'Signer email', value: input.signerEmail }] : []),
    ...(signedAt ? [{ label: 'Signed at', value: signedAt }] : []),
    ...(signedIp ? [{ label: 'Signer IP', value: signedIp }] : []),
    ...(entry.recipientSignedLocationLabel ? [{ label: 'Signer location', value: entry.recipientSignedLocationLabel }] : []),
    ...(entry.recipientAadhaarMaskedId ? [{ label: 'Aadhaar', value: entry.recipientAadhaarMaskedId }] : []),
    { label: 'Execution record', value: entry.shareId || entry.id },
    { label: 'Link policy', value: policyLabel },
  ];

  const messageLead = input.recipientType === 'signer'
    ? 'Thanks for signing. Your receipt is below and the signed PDF is attached for your records.'
    : 'This document has been signed. Receipt details are below and the signed PDF is attached.';

  const isSignerType = input.recipientType === 'signer';
  const html = `<!DOCTYPE html>
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
  <td style="background:linear-gradient(135deg,#052e16 0%,#166534 100%);padding:28px 32px 26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="font-size:11px;font-weight:800;letter-spacing:0.20em;text-transform:uppercase;color:#86efac;margin-bottom:10px;">
            Signing Receipt &nbsp;·&nbsp; Secure E-Sign
          </div>
          <div style="font-size:22px;font-weight:800;color:#f0fdf4;letter-spacing:-0.03em;line-height:1.25;">
            ${escapeHtmlLite(isSignerType ? 'Document Signed ✓' : 'Signing Complete ✓')}
          </div>
          ${entry.referenceNumber ? `<div style="margin-top:6px;font-size:13px;color:#86efac;">Ref&nbsp;#${escapeHtmlLite(entry.referenceNumber)}</div>` : ''}
        </td>
        <td align="right" valign="top">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.15);">
            <span style="font-size:22px;">✅</span>
          </div>
        </td>
      </tr>
    </table>
  </td>
</tr>

<!-- body -->
<tr>
  <td style="padding:28px 32px 0;">
    <p style="margin:0 0 6px;font-size:15px;color:#0f172a;line-height:1.6;">${escapeHtmlLite(messageLead)}</p>
    ${senderNoteText ? `
    <div style="margin-top:16px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 16px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;color:#92400e;margin-bottom:6px;">Note from sender</div>
      <p style="margin:0;font-size:13px;color:#78350f;line-height:1.6;">${escapeHtmlLite(senderNoteText)}</p>
    </div>` : ''}
  </td>
</tr>

<!-- document card -->
<tr>
  <td style="padding:20px 32px 0;">
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:8px;">Document</div>
      <div style="font-size:18px;font-weight:800;color:#0f172a;letter-spacing:-0.02em;line-height:1.3;">${escapeHtmlLite(docLabel)}</div>
      <div style="margin-top:14px;">
        <a href="${escapeHtmlLite(publicLink)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:800;font-size:13px;">
          Open Execution Record →
        </a>
      </div>
    </div>
  </td>
</tr>

<!-- receipt details -->
<tr>
  <td style="padding:20px 32px 0;">
    <div style="border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <div style="background:#f8fafc;padding:12px 18px;border-bottom:1px solid #e2e8f0;">
        <span style="font-size:10px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;">Receipt Details</span>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
        ${detailsRows.map((row, i) => `
        <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
          <td style="padding:10px 18px;font-size:12px;color:#64748b;width:44%;border-bottom:1px solid #f1f5f9;">${escapeHtmlLite(row.label)}</td>
          <td style="padding:10px 18px;font-size:12px;color:#0f172a;font-weight:700;border-bottom:1px solid #f1f5f9;">${escapeHtmlLite(row.value)}</td>
        </tr>`).join('')}
      </table>
    </div>
  </td>
</tr>

<!-- guidelines -->
<tr>
  <td style="padding:20px 32px 0;">
    <div style="border:1px solid #e2e8f0;border-radius:16px;padding:18px 20px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#94a3b8;margin-bottom:12px;">Important Guidelines</div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
        ${[
          'Retain this receipt and the signed PDF in a secure location for your records.',
          'Do not share your signing password. All access is cryptographically logged for compliance.',
          'This receipt constitutes an official audit record of the signing event.',
          'If you believe this email was sent in error, contact the document sender immediately.',
        ].map((line) => `
        <tr>
          <td style="padding:4px 12px 4px 0;vertical-align:top;width:16px;font-size:13px;color:#10b981;">·</td>
          <td style="padding:4px 0;font-size:12px;color:#475569;line-height:1.6;">${escapeHtmlLite(line)}</td>
        </tr>`).join('')}
      </table>
      <div style="margin-top:14px;padding-top:12px;border-top:1px solid #f1f5f9;">
        ${termsLinks.map((item) => `<a href="${escapeHtmlLite(item.url)}" style="font-size:11px;color:#64748b;text-decoration:underline;margin-right:14px;">${escapeHtmlLite(item.label)}</a>`).join('')}
      </div>
    </div>
  </td>
</tr>

<!-- footer -->
<tr>
  <td style="padding:24px 32px 28px;">
    <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.7;">
      ${input.senderEmail ? `Sent by <strong style="color:#64748b;">${escapeHtmlLite(input.senderEmail)}</strong> via secure e-sign platform.` : 'Sent via secure e-sign platform.'}
      All signing events are immutably recorded with IP, timestamp, and device data.
    </p>
    <p style="margin:8px 0 0;font-size:11px;color:#cbd5e1;">
      End-to-end audit trail &nbsp;·&nbsp; OTP identity verification &nbsp;·&nbsp; Tamper-evident receipt
    </p>
  </td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>`.trim();

  const text = [
    `Receipt: ${docLabel}`,
    entry.referenceNumber ? `Reference: ${entry.referenceNumber}` : '',
    entry.generatedAt ? `Generated: ${formatLocalDate(entry.generatedAt)}` : '',
    `Signed by: ${signerName}`,
    input.signerEmail ? `Signer email: ${input.signerEmail}` : '',
    signedAt ? `Signed at: ${signedAt}` : '',
    signedIp ? `Signer IP: ${signedIp}` : '',
    entry.recipientSignedLocationLabel ? `Signer location: ${entry.recipientSignedLocationLabel}` : '',
    entry.recipientAadhaarMaskedId ? `Aadhaar: ${entry.recipientAadhaarMaskedId}` : '',
    `Execution record: ${entry.shareId || entry.id}`,
    `Link policy: ${policyLabel}`,
    '',
    `Open execution record: ${publicLink}`,
    '',
    'Guidelines:',
    '- Keep this receipt and signed PDF for your records.',
    '- Do not share your password publicly; access is logged.',
    '- If this was sent in error, contact the sender.',
    '',
    `Terms: ${origin}/terms-and-conditions`,
    `Privacy: ${origin}/privacy-policy`,
    `Signed document policy: ${origin}/signed-document-policy`,
  ]
    .filter(Boolean)
    .join('\n');

  return { subject: title === 'Signing receipt' ? `Receipt: ${docLabel}${entry.referenceNumber ? ` · ${entry.referenceNumber}` : ''}` : `Signed: ${docLabel}${entry.referenceNumber ? ` · ${entry.referenceNumber}` : ''}`, preheader, html, text };
}

