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

function buildShareUrl(origin: string, entry: Pick<DocumentHistory, 'shareUrl' | 'shareId' | 'id'>) {
  const base = String(origin || '').trim().replace(/\/$/, '');
  if (entry.shareUrl) {
    if (entry.shareUrl.startsWith('http')) return entry.shareUrl;
    return `${base}${entry.shareUrl.startsWith('/') ? '' : '/'}${entry.shareUrl}`;
  }
  if (entry.shareId) return `${base}/documents/${entry.shareId}`;
  if (entry.id) return `${base}/documents/${entry.id}`;
  return base;
}

function buildExpiryLabel(entry: Pick<DocumentHistory, 'shareAccessPolicy' | 'shareExpiresAt' | 'maxAccessCount'>) {
  if (entry.shareAccessPolicy === 'expiring') {
    return entry.shareExpiresAt ? `Expires: ${formatLocalDate(entry.shareExpiresAt)}` : 'Expiring link';
  }
  if (entry.shareAccessPolicy === 'one_time') {
    return `One-time access (${Math.max(1, Number(entry.maxAccessCount || 1))} max)`;
  }
  return 'Standard link';
}

function buildAccessLabel(access?: string) {
  if (access === 'edit') return 'Edit, comment, and review';
  if (access === 'view') return 'View only';
  return 'Comment and review';
}

export function buildDocumentDeliveryEmail(input: {
  origin: string;
  entry: DocumentHistory;
  subject: string;
  senderEmail?: string;
  senderNote?: string;
}) {
  const origin = String(input.origin || '').trim().replace(/\/$/, '');
  const entry = input.entry;
  const shareUrl = buildShareUrl(origin, entry);
  const passwordLabel = entry.sharePassword ? entry.sharePassword : '';
  const accessLabel = buildAccessLabel(entry.recipientAccess);
  const expiryLabel = buildExpiryLabel(entry);
  const noteText = stripHtml(input.senderNote || '');
  const templateLabel = entry.documentSourceType === 'uploaded_pdf'
    ? (entry.uploadedPdfFileName || entry.templateName || 'Uploaded PDF')
    : (entry.templateName || 'Document');

  const signingRequested = Boolean(entry.recipientSignatureRequired);

  const supportUrl = `${origin}/support`;

  const preheader = signingRequested
    ? `Signature requested for ${templateLabel}${entry.referenceNumber ? ` (${entry.referenceNumber})` : ''}.`
    : `New document shared: ${templateLabel}${entry.referenceNumber ? ` (${entry.referenceNumber})` : ''}.`;

  const steps = signingRequested
    ? [
        'Open the secure link.',
        'Enter the password to unlock the document.',
        'Review details carefully.',
        'Sign when prompted to complete the request.',
      ]
    : [
        'Open the secure link.',
        'Enter the password to unlock the document.',
        'Review and download if needed.',
      ];

  const detailsRows = [
    { label: 'Document', value: templateLabel },
    ...(entry.referenceNumber ? [{ label: 'Reference', value: entry.referenceNumber }] : []),
    ...(entry.generatedAt ? [{ label: 'Generated', value: formatLocalDate(entry.generatedAt) }] : []),
    { label: 'Recipient access', value: accessLabel },
    { label: 'Signature requested', value: signingRequested ? 'Yes' : 'No' },
    { label: 'Link policy', value: expiryLabel },
  ];

  const buildSecureRequestFullHtml = () => {
    const safeShareUrl = escapeHtmlLite(shareUrl);
    const safeSenderEmail = escapeHtmlLite(input.senderEmail || 'admin@company.com');
    const safeTemplateLabel = escapeHtmlLite(templateLabel);
    const safeAccessLabel = escapeHtmlLite(accessLabel);
    const safeSigningLabel = signingRequested ? 'Yes' : 'No';

    const safePassword = escapeHtmlLite(passwordLabel || '');
    const safeNoteText = escapeHtmlLite(noteText);
    const safePreheader = escapeHtmlLite(preheader);

    const detailsHtml = detailsRows
      .map((row) => `
        <tr>
          <td class="detail-label" style="padding: 7px 10px; font-size: 8px; line-height: 1.45; color: var(--muted2); width: 42%; vertical-align: top;">${escapeHtmlLite(row.label)}</td>
          <td class="detail-value" style="padding: 7px 10px; font-size: 8px; line-height: 1.45; color: var(--text); font-weight: 650; text-align: right; vertical-align: top;">${escapeHtmlLite(row.value)}</td>
        </tr>
      `)
      .join('');

    return `
      <!doctype html>
      <html lang="en" data-force-theme="light">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="light dark" />
          <meta name="supported-color-schemes" content="light dark" />
          <title>${escapeHtmlLite(input.subject)}</title>
          <style>
            :root {
              color-scheme: light dark;
              supported-color-schemes: light dark;
            }

            html,
            body {
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              min-width: 100% !important;
            }

            body {
              font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              background: transparent !important;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
              text-size-adjust: 100%;
              -webkit-text-size-adjust: 100%;
            }

            .email-root {
              --text: #111827;
              --strong: #030712;
              --muted: rgba(17, 24, 39, 0.60);
              --muted2: rgba(17, 24, 39, 0.44);
              --soft: rgba(17, 24, 39, 0.045);
              --soft-strong: rgba(37, 99, 235, 0.075);
              --button: #2563eb;
              --button-dark: #1d4ed8;
              --link: #2563eb;
            }

            @media (prefers-color-scheme: dark) {
              .email-root {
                --text: rgba(249, 250, 251, 0.92);
                --strong: #ffffff;
                --muted: rgba(229, 231, 235, 0.68);
                --muted2: rgba(229, 231, 235, 0.52);
                --soft: rgba(255, 255, 255, 0.06);
                --soft-strong: rgba(96, 165, 250, 0.13);
                --button: #3b82f6;
                --button-dark: #2563eb;
                --link: #60a5fa;
              }
            }

            html[data-force-theme="dark"] .email-root {
              --text: rgba(249, 250, 251, 0.92);
              --strong: #ffffff;
              --muted: rgba(229, 231, 235, 0.68);
              --muted2: rgba(229, 231, 235, 0.52);
              --soft: rgba(255, 255, 255, 0.06);
              --soft-strong: rgba(96, 165, 250, 0.13);
              --button: #3b82f6;
              --button-dark: #2563eb;
              --link: #60a5fa;
            }

            a { color: inherit; }
            img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
            table { border-collapse: collapse; border-spacing: 0; }

            .container {
              width: 620px;
              max-width: 620px;
            }

            .wrap-pad {
              padding: 24px 14px;
            }

            .brand {
              font-size: 18px;
              line-height: 1;
              font-weight: 760;
              letter-spacing: -0.025em;
              color: var(--strong);
            }

            .topmeta {
              font-size: 10px;
              line-height: 1.3;
              font-weight: 650;
              color: var(--muted2);
              letter-spacing: 0.08em;
              text-transform: uppercase;
              white-space: nowrap;
            }

            .card {
              background: transparent !important;
              border: 0 !important;
              box-shadow: none !important;
              overflow: hidden;
            }

            .card-inner {
              padding: 26px 24px 24px;
            }

            .icon {
              font-size: 30px;
              line-height: 1;
              margin: 0;
              color: var(--strong);
            }

            .eyebrow {
              display: inline-block;
              font-size: 9.5px;
              line-height: 1;
              font-weight: 760;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: var(--muted2);
            }

            .h1 {
              font-size: 26px;
              line-height: 1.12;
              letter-spacing: -0.04em;
              font-weight: 780;
              color: var(--strong);
              margin: 13px 0 0;
            }

            .sender-box {
              display: inline-block;
              margin-top: 14px;
              padding: 10px 14px;
              border-radius: 16px;
              background: var(--soft-strong);
              color: var(--text);
              font-size: 12px;
              line-height: 1.45;
              font-weight: 600;
            }

            .sender-label {
              display: block;
              font-size: 9px;
              line-height: 1;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: var(--muted2);
              font-weight: 760;
              margin-bottom: 5px;
            }

            .sender-box a {
              color: var(--link);
              text-decoration: none;
              font-weight: 760;
            }

            .btn {
              display: inline-block;
              text-decoration: none;
              background: linear-gradient(135deg, var(--button), var(--button-dark));
              color: #ffffff !important;
              padding: 12px 18px;
              border-radius: 999px;
              font-weight: 750;
              font-size: 13px;
              line-height: 1.2;
              letter-spacing: -0.005em;
            }

            .hint {
              margin-top: 10px;
              font-size: 10.5px;
              line-height: 1.5;
              color: var(--muted2);
              font-weight: 500;
            }

            .section {
              margin-top: 22px;
            }

            .section-title {
              font-size: 9.5px;
              line-height: 1;
              font-weight: 760;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: var(--muted2);
              margin: 0 0 9px;
            }

            .password-section {
              margin-top: 22px;
              text-align: center;
            }

            .password-box {
              display: inline-block;
              padding: 10px 14px;
              border-radius: 14px;
              background: var(--soft-strong);
            }

            .password {
              font-size: 20px;
              line-height: 1.15;
              letter-spacing: 0.12em;
              font-weight: 780;
              color: var(--strong);
              user-select: all;
              -webkit-user-select: all;
            }

            .copy-label {
              display: inline-block;
              margin-left: 10px;
              color: var(--link);
              font-size: 11px;
              font-weight: 700;
              vertical-align: 4px;
            }

            .mini-k {
              font-size: 9.5px;
              line-height: 1.35;
              color: var(--muted2);
              font-weight: 650;
              margin: 0;
              letter-spacing: 0.08em;
              text-transform: uppercase;
            }

            .mini-v {
              font-size: 11.5px;
              line-height: 1.45;
              color: var(--text);
              font-weight: 650;
              margin: 5px 0 0;
            }

            .step {
              font-size: 11.5px;
              line-height: 1.65;
              color: var(--muted);
              font-weight: 500;
              margin: 8px 0 0;
            }

            .badge {
              display: inline-block;
              width: 18px;
              height: 18px;
              border-radius: 999px;
              background: var(--button);
              color: #fff;
              text-align: center;
              line-height: 18px;
              font-size: 9.5px;
              font-weight: 750;
              margin-right: 8px;
            }

            .note-wrap {
              padding: 14px 16px;
              border-radius: 16px;
              background: var(--soft-strong);
            }

            .note-title {
              font-size: 9.5px;
              line-height: 1;
              font-weight: 760;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: var(--link);
              margin: 0 0 9px;
            }

            .note-body {
              margin: 0;
              font-size: 11.5px;
              line-height: 1.65;
              color: var(--text);
              font-weight: 550;
            }

            .details-table-wrap {
              width: 100%;
              max-width: 500px;
              margin: 0 auto;
              border-radius: 14px;
              overflow: hidden;
              background: var(--soft);
            }

            .details-table {
              width: 100%;
              margin: 0 auto;
            }

            .details-head {
              font-size: 8px;
              line-height: 1;
              font-weight: 760;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              color: var(--muted2);
              padding: 8px 10px;
              text-align: left;
              background: var(--soft);
            }

            .details-head-right {
              text-align: right;
            }

            .footer {
              padding: 18px 24px 22px;
              color: var(--muted2);
              font-size: 10.5px;
              line-height: 1.55;
              font-weight: 500;
            }

            .footer a {
              color: var(--link);
              text-decoration: none;
              font-weight: 700;
            }

            @media only screen and (max-width: 680px) {
              .wrap-pad {
                padding: 14px 8px !important;
              }

              .container {
                width: 100% !important;
                max-width: 100% !important;
              }

              .card-inner {
                padding: 24px 14px 20px !important;
              }

              .h1 {
                font-size: 23px !important;
              }

              .btn {
                width: 100% !important;
                box-sizing: border-box !important;
                text-align: center !important;
              }

              .sender-box {
                width: 100% !important;
                box-sizing: border-box !important;
              }

              .brand {
                font-size: 17px !important;
              }

              .topmeta {
                font-size: 9px !important;
              }

              .mini-cell {
                display: block !important;
                width: 100% !important;
                padding: 0 0 12px 0 !important;
              }

              .footer-left,
              .footer-right {
                display: block !important;
                width: 100% !important;
                text-align: left !important;
                padding: 0 !important;
              }

              .footer-right {
                margin-top: 10px !important;
              }

              .detail-label,
              .detail-value {
                font-size: 8px !important;
                padding: 6px 8px !important;
              }
            }

            @media only screen and (max-width: 420px) {
              .h1 {
                font-size: 21px !important;
              }

              .icon {
                font-size: 28px !important;
              }

              .password {
                font-size: 18px !important;
                letter-spacing: 0.09em !important;
              }

              .password-box {
                width: 100% !important;
                box-sizing: border-box !important;
              }

              .copy-label {
                display: block !important;
                margin-left: 0 !important;
                margin-top: 8px !important;
              }
            }

            [data-ogsc] .email-root {
              --text: rgba(249, 250, 251, 0.92);
              --strong: #ffffff;
              --muted: rgba(229, 231, 235, 0.68);
              --muted2: rgba(229, 231, 235, 0.52);
              --soft: rgba(255, 255, 255, 0.06);
              --soft-strong: rgba(96, 165, 250, 0.13);
              --button: #3b82f6;
              --button-dark: #2563eb;
              --link: #60a5fa;
            }
          </style>
        </head>

        <body style="margin:0; padding:0; background:transparent;">
          <div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;">
            ${safePreheader}
          </div>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; background:transparent;">
            <tr>
              <td align="center" class="wrap-pad" style="padding: 24px 14px;">
                <table role="presentation" class="container" width="620" cellpadding="0" cellspacing="0" style="width:620px; max-width:620px;">
                  <tr>
                    <td class="email-root">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 18px;">
                        <tr>
                          <td align="left" style="vertical-align: middle;">
                            <div class="brand" style="font-size: 18px; line-height: 1; font-weight: 760; letter-spacing: -0.025em; color: var(--strong);">
                              docrud
                            </div>
                          </td>
                         
                        </tr>
                      </table>

                      <div class="card" style="background: transparent !important; border: 0 !important; box-shadow: none !important; overflow: hidden;">
                        <div class="card-inner" style="padding: 26px 24px 24px;">
                          <div align="center" style="text-align:center;">
                            <div class="icon" style="font-size: 30px; line-height: 1; margin: 0; color: var(--strong);">▢</div>

                            <div style="height: 13px; line-height: 13px;">&nbsp;</div>

                           

                            <div class="h1" style="font-size: 26px; line-height: 1.12; letter-spacing: -0.04em; font-weight: 780; color: var(--strong); margin: 13px 0 0;">
                              Document ready for<br/>review &amp; signature
                            </div>

                            <div class="sender-box" style="display: inline-block; margin-top: 14px; padding: 10px 14px; border-radius: 16px; background: var(--soft-strong); color: var(--text); font-size: 12px; line-height: 1.45; font-weight: 600;">
                              <span class="sender-label" style="display: block; font-size: 9px; line-height: 1; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted2); font-weight: 760; margin-bottom: 5px;">From sender</span>
                              <a href="mailto:${safeSenderEmail}" style="color: var(--link); text-decoration: none; font-weight: 760;">${safeSenderEmail}</a>
                            </div>

                            <div style="margin-top: 20px;">
                              <a class="btn" href="${safeShareUrl}" style="display: inline-block; text-decoration: none; background: linear-gradient(135deg, var(--button), var(--button-dark)); color: #ffffff !important; padding: 12px 18px; border-radius: 999px; font-weight: 750; font-size: 13px; line-height: 1.2; letter-spacing: -0.005em;">
                                Open document →
                              </a>
                            </div>

                            <div class="hint" style="margin-top: 10px; font-size: 10.5px; line-height: 1.5; color: var(--muted2); font-weight: 500;">
                              This secure link is unique to you.
                            </div>
                          </div>

                          ${safePassword ? `
                            <div class="password-section" style="margin-top: 22px; text-align: center;">
                              <div class="section-title" style="font-size: 9.5px; line-height: 1; font-weight: 760; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted2); margin: 0 0 9px;">Password to access</div>
                              <div class="password-box" style="display: inline-block; padding: 10px 14px; border-radius: 14px; background: var(--soft-strong);">
                                <span id="docrud-password" class="password" style="font-size: 20px; line-height: 1.15; letter-spacing: 0.12em; font-weight: 780; color: var(--strong); user-select: all; -webkit-user-select: all;">${safePassword}</span>
                              
                              </div>
                              <div class="hint" style="margin-top: 7px; font-size: 10.5px; line-height: 1.5; color: var(--muted2); font-weight: 500;">Tap and hold to copy.</div>
                            </div>
                          ` : ''}

                          ${safeNoteText ? `
                            <div class="section" style="margin-top: 22px;">
                              <div class="note-wrap" style="padding: 14px 16px; border-radius: 16px; background: var(--soft-strong);">
                                <div class="note-title" style="font-size: 9.5px; line-height: 1; font-weight: 760; letter-spacing: 0.12em; text-transform: uppercase; color: var(--link); margin: 0 0 9px;">Note from sender</div>
                                <div class="note-body" style="margin: 0; font-size: 11.5px; line-height: 1.65; color: var(--text); font-weight: 550;">${safeNoteText}</div>
                              </div>
                            </div>
                          ` : ''}

                          <div class="section" style="margin-top: 22px;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                              <tr>
                                <td class="mini-cell" width="33.33%" style="padding-right: 10px; vertical-align: top;">
                                  <div class="mini-k" style="font-size: 9.5px; line-height: 1.35; color: var(--muted2); font-weight: 650; margin: 0; letter-spacing: 0.08em; text-transform: uppercase;">Document</div>
                                  <div class="mini-v" style="font-size: 11.5px; line-height: 1.45; color: var(--text); font-weight: 650; margin: 5px 0 0;">${safeTemplateLabel}</div>
                                </td>
                                <td class="mini-cell" width="33.33%" style="padding-left: 5px; padding-right: 5px; vertical-align: top;">
                                  <div class="mini-k" style="font-size: 9.5px; line-height: 1.35; color: var(--muted2); font-weight: 650; margin: 0; letter-spacing: 0.08em; text-transform: uppercase;">Access</div>
                                  <div class="mini-v" style="font-size: 11.5px; line-height: 1.45; color: var(--text); font-weight: 650; margin: 5px 0 0;">${safeAccessLabel}</div>
                                </td>
                                <td class="mini-cell" width="33.33%" style="padding-left: 10px; vertical-align: top;">
                                  <div class="mini-k" style="font-size: 9.5px; line-height: 1.35; color: var(--muted2); font-weight: 650; margin: 0; letter-spacing: 0.08em; text-transform: uppercase;">Signature</div>
                                  <div class="mini-v" style="font-size: 11.5px; line-height: 1.45; color: var(--text); font-weight: 650; margin: 5px 0 0;">${escapeHtmlLite(safeSigningLabel)}</div>
                                </td>
                              </tr>
                            </table>
                          </div>

                          <div class="section" style="margin-top: 24px;">
                            <div class="section-title" style="font-size: 9.5px; line-height: 1; font-weight: 760; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted2); margin: 0 0 9px;">Next steps</div>
                            <div class="step" style="font-size: 11.5px; line-height: 1.65; color: var(--muted); font-weight: 500; margin: 8px 0 0;">
                              <span class="badge" style="display:inline-block; width: 18px; height: 18px; border-radius: 999px; background: var(--button); color:#fff; text-align:center; line-height: 18px; font-size: 9.5px; font-weight: 750; margin-right: 8px;">1</span>
                              Click the <span style="color: var(--link); font-weight: 700;">Open document</span> button above.
                            </div>
                            <div class="step" style="font-size: 11.5px; line-height: 1.65; color: var(--muted); font-weight: 500; margin: 8px 0 0;">
                              <span class="badge" style="display:inline-block; width: 18px; height: 18px; border-radius: 999px; background: var(--button); color:#fff; text-align:center; line-height: 18px; font-size: 9.5px; font-weight: 750; margin-right: 8px;">2</span>
                              Enter the password when prompted and review the document. Add your signature to complete the request.
                            </div>
                          </div>

                          <div class="section" style="margin-top: 24px;">
                            <div class="section-title" style="font-size: 9.5px; line-height: 1; font-weight: 760; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted2); margin: 0 0 9px;">Document details</div>
                            <div class="details-table-wrap" style="width:100%; max-width: 500px; margin: 0 auto; border-radius: 14px; overflow: hidden; background: var(--soft);">
                              <table class="details-table" role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%; margin: 0 auto;">
                                <tr>
                                  <th class="details-head" align="left" style="font-size: 8px; line-height: 1; font-weight: 760; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted2); padding: 8px 10px; text-align: left; background: var(--soft);">Field</th>
                                  <th class="details-head details-head-right" align="right" style="font-size: 8px; line-height: 1; font-weight: 760; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted2); padding: 8px 10px; text-align: right; background: var(--soft);">Value</th>
                                </tr>
                                ${detailsHtml}
                              </table>
                            </div>
                          </div>
                        </div>

                        <div class="footer" style="padding: 18px 24px 22px; color: var(--muted2); font-size: 10.5px; line-height: 1.55; font-weight: 500;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td class="footer-left" align="left" style="vertical-align: top; padding-right: 10px;">
                                <div style="font-weight: 700; color: var(--text);">Sent via docrud</div>
                                <div style="margin-top: 5px;">If you weren’t expecting this email, you can safely ignore it.</div>
                              </td>
                              <td class="footer-right" align="right" style="vertical-align: top;">
                                <div style="font-weight: 700; color: var(--text);">Need help?</div>
                                <div style="margin-top: 5px;"><a href="${escapeHtmlLite(supportUrl)}" style="color: var(--link); text-decoration: none; font-weight: 700;">Contact support</a></div>
                              </td>
                            </tr>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `.trim();
  };

  const html = signingRequested
    ? buildSecureRequestFullHtml()
    : `
        <div style="padding: 18px 16px 2px; background: transparent; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
          ${noteText ? `
            <div style="margin-bottom: 18px;">
              <div style="padding:14px 16px; border-radius:16px; background:rgba(37,99,235,.075);">
                <div style="font-size:9.5px; letter-spacing:.12em; text-transform:uppercase; font-weight:760; color:#2563eb; margin-bottom:9px;">Note from sender</div>
                <div style="font-size:11.5px; line-height:1.65; color:#111827; font-weight:550;">${escapeHtmlLite(noteText)}</div>
              </div>
            </div>
          ` : ''}

          <div>
            <div style="font-size:9.5px; letter-spacing:.12em; text-transform:uppercase; font-weight:760; color: rgba(17,24,39,.46);">Secure document</div>
            <div style="margin-top:9px; font-size:19px; line-height:1.25; font-weight:780; letter-spacing:-.035em; color:#111827;">${escapeHtmlLite(templateLabel)}</div>
            ${entry.referenceNumber ? `<div style="margin-top:5px; font-size:11.5px; color: rgba(17,24,39,.58);">Reference: <strong style="color:#111827;">${escapeHtmlLite(entry.referenceNumber)}</strong></div>` : ''}

            ${input.senderEmail ? `
              <div style="display:inline-block; margin-top: 12px; padding: 9px 12px; border-radius: 14px; background: rgba(37,99,235,.08); color:#111827; font-size:11.5px; line-height:1.45; font-weight:600;">
                <span style="display:block; font-size:9px; line-height:1; letter-spacing:.12em; text-transform:uppercase; color:rgba(17,24,39,.46); font-weight:760; margin-bottom:5px;">From sender</span>
                ${escapeHtmlLite(input.senderEmail)}
              </div>
            ` : ''}

            <div style="margin-top: 16px;">
              <a href="${escapeHtmlLite(shareUrl)}" style="display:inline-block; text-decoration:none; background:linear-gradient(135deg,#2563eb,#1d4ed8); color:#ffffff; padding: 12px 18px; border-radius: 999px; font-weight:750; font-size:13px;">
                Open document →
              </a>
            </div>

            ${passwordLabel ? `
              <div style="margin-top: 18px; text-align:center;">
                <div style="font-size:9.5px; letter-spacing:.12em; text-transform:uppercase; font-weight:760; color: rgba(17,24,39,.46);">Password to access</div>
                <div style="display:inline-block; margin-top:8px; padding:10px 14px; border-radius:14px; background:rgba(37,99,235,.075);">
                  <span style="font-size:19px; letter-spacing:.10em; font-weight:780; color:#111827; user-select:all; -webkit-user-select:all;">${escapeHtmlLite(passwordLabel)}</span>
                  <span style="display:inline-block; margin-left:10px; color:#2563eb; font-size:11px; font-weight:700;">Copy</span>
                </div>
                <div style="margin-top:7px; font-size:10.5px; line-height:1.5; color:rgba(17,24,39,.46);">Tap and hold, or select the password to copy it.</div>
              </div>
            ` : ''}
          </div>

          <div style="margin-top: 22px;">
            <div style="font-size:9.5px; letter-spacing:.12em; text-transform:uppercase; font-weight:760; color: rgba(17,24,39,.46);">Next steps</div>
            <ol style="margin: 10px 0 0; padding: 0 0 0 18px; color:rgba(17,24,39,.68); font-size:11.5px; line-height:1.65; font-weight:500;">
              ${steps.map((step) => `<li style="margin: 5px 0;">${escapeHtmlLite(step)}</li>`).join('')}
            </ol>
          </div>

          <div style="margin-top: 22px;">
            <div style="font-size:9.5px; letter-spacing:.12em; text-transform:uppercase; font-weight:760; color: rgba(17,24,39,.46);">Document details</div>
            <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse: collapse; width:100%; margin-top:9px; background:rgba(17,24,39,.045); border-radius:14px; overflow:hidden;">
              <tr>
                <th align="left" style="padding:8px 10px; font-size:8px; letter-spacing:.12em; text-transform:uppercase; color:rgba(17,24,39,.46); font-weight:760;">Field</th>
                <th align="right" style="padding:8px 10px; font-size:8px; letter-spacing:.12em; text-transform:uppercase; color:rgba(17,24,39,.46); font-weight:760;">Value</th>
              </tr>
              ${detailsRows.map((row) => `
                <tr>
                  <td style="padding: 7px 10px; font-size:8px; color: rgba(17,24,39,.52); width: 42%;">${escapeHtmlLite(row.label)}</td>
                  <td style="padding: 7px 10px; font-size:8px; color: #111827; font-weight:650; text-align:right;">${escapeHtmlLite(row.value)}</td>
                </tr>
              `).join('')}
            </table>
          </div>

          <div style="margin-top: 18px; font-size: 10.5px; line-height:1.5; color: rgba(17,24,39,.46); font-weight:500;">
            ${input.senderEmail ? `Sent by ${escapeHtmlLite(input.senderEmail)} via docrud.` : 'Sent via docrud.'}
          </div>
        </div>
      `.trim();

  const text = [
    input.senderEmail ? `From: ${input.senderEmail}` : '',
    noteText ? `Note from sender:\n${noteText}` : '',
    `Document: ${templateLabel}`,
    entry.referenceNumber ? `Reference: ${entry.referenceNumber}` : '',
    entry.generatedAt ? `Generated: ${formatLocalDate(entry.generatedAt)}` : '',
    `Recipient access: ${accessLabel}`,
    `Signature requested: ${signingRequested ? 'Yes' : 'No'}`,
    `Link policy: ${expiryLabel}`,
    passwordLabel ? `Password: ${passwordLabel}` : '',
    '',
    'Open link:',
    shareUrl,
    '',
    signingRequested ? 'Signing steps:' : 'Next steps:',
    ...steps.map((step, idx) => `${idx + 1}. ${step}`),
  ]
    .filter(Boolean)
    .join('\n');

  return {
    preheader,
    html,
    text,
    chrome: signingRequested ? 'none' : 'default',
  };
}