import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { getAuthSession } from '@/lib/server/auth';
import { getMailSettings } from '@/lib/server/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function esc(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function kindIcon(kind?: string): string {
  const map: Record<string, string> = {
    pdf: '📄', image: '🖼️', video: '🎬', audio: '🎵',
    doc: '📝', sheet: '📊', archive: '🗜️',
  };
  return map[kind ?? ''] ?? '📁';
}

function kindLabel(kind?: string): string {
  if (!kind) return 'File';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function privacyColor(p?: string) {
  if (p === 'public')   return { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', label: 'Public' };
  if (p === 'password') return { bg: '#fffbeb', border: '#fde68a', text: '#92400e', label: 'Password Protected' };
  return { bg: '#f8fafc', border: '#e2e8f0', text: '#64748b', label: 'Private' };
}

/* ─── Email HTML builder ─────────────────────────────────────────────────── */

function buildHtml(opts: {
  origin:      string;
  senderName:  string;
  senderEmail: string;
  fileName:    string;
  fileSize?:   string;
  fileKind?:   string;
  fileId:      string;
  filePrivacy?: string;
  senderNote?: string;
  to:          string;
}): string {
  const {
    origin, senderName, senderEmail,
    fileName, fileSize, fileKind, fileId, filePrivacy, senderNote, to,
  } = opts;

  const openLink     = `${origin}?drive-open=${fileId}`;
  const downloadLink = `${origin}/api/drive/public-download?id=${fileId}`;
  const importLink   = `${origin}?drive-import=${fileId}`;
  const unsub        = `${origin}/unsubscribe?email=${encodeURIComponent(to)}&type=drive-share`;
  const privacy      = privacyColor(filePrivacy);
  const icon         = kindIcon(fileKind);
  const kLabel       = kindLabel(fileKind);

  /* Sender initials avatar */
  const initials = senderName
    .split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('');

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <title>${esc(fileName)} — shared via DocRud Drive</title>
  <style>
    @media only screen and (max-width:600px){
      .email-container{width:100%!important}
      .btn-row td{display:block!important;width:100%!important;padding-bottom:8px!important}
      .btn-link{width:100%!important;box-sizing:border-box!important}
      .hide-mobile{display:none!important}
      .full-mobile{width:100%!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!-- Preview text (hidden, shown in inbox preview) -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${esc(senderName)} shared "${esc(fileName)}" with you · Open in DocRud Drive
    &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:32px 16px 24px;">

        <!-- ═══ Email container ═══ -->
        <table class="email-container" role="presentation" width="600" cellpadding="0" cellspacing="0"
          style="border-collapse:collapse;width:600px;max-width:600px;">

          <!-- ── Top logo bar ── -->
          <tr>
            <td style="background-color:#ffffff;border-radius:16px 16px 0 0;border:1px solid #e2e8f0;border-bottom:0;padding:20px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                      <tr>
                        <td style="width:36px;height:36px;background-color:#7c3aed;border-radius:10px;text-align:center;vertical-align:middle;">
                          <span style="font-size:18px;line-height:36px;display:block;">🗂️</span>
                        </td>
                        <td style="padding-left:10px;vertical-align:middle;">
                          <span style="font-size:15px;font-weight:800;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:-0.01em;">DocRud</span>
                          <span style="font-size:15px;font-weight:800;color:#7c3aed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;"> Drive</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:11px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-weight:600;letter-spacing:.04em;text-transform:uppercase;">File Sharing</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Purple accent bar ── -->
          <tr>
            <td style="background-color:#7c3aed;height:4px;border-left:1px solid #7c3aed;border-right:1px solid #7c3aed;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- ── Main body ── -->
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e2e8f0;border-top:0;border-bottom:0;padding:32px 32px 28px;">

              <!-- Sender info -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
                <tr>
                  <td style="width:48px;height:48px;border-radius:50%;background-color:#ede9fe;text-align:center;vertical-align:middle;">
                    <span style="font-size:18px;font-weight:800;color:#7c3aed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:48px;display:block;">${esc(initials)}</span>
                  </td>
                  <td style="padding-left:14px;vertical-align:middle;">
                    <p style="margin:0;font-size:17px;font-weight:800;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.3;">${esc(senderName)} shared a file with you</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${esc(senderEmail)} · via DocRud Drive</p>
                  </td>
                </tr>
              </table>

              <!-- File info card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="border-collapse:collapse;border:1.5px solid #ddd6fe;border-radius:12px;background-color:#faf5ff;margin-bottom:${senderNote ? 20 : 28}px;overflow:hidden;">
                <tr>
                  <td style="padding:18px 20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                      <tr>
                        <td style="width:46px;height:46px;border-radius:12px;background-color:#ede9fe;border:1px solid #ddd6fe;text-align:center;vertical-align:middle;">
                          <span style="font-size:22px;line-height:46px;display:block;">${icon}</span>
                        </td>
                        <td style="padding-left:14px;vertical-align:top;">
                          <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#1e293b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;word-break:break-word;">${esc(fileName)}</p>
                          <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                            <tr>
                              ${fileSize ? `<td style="padding-right:6px;"><span style="display:inline-block;padding:2px 9px;border-radius:20px;background-color:#f1f5f9;border:1px solid #e2e8f0;font-size:10px;font-weight:700;color:#64748b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${esc(fileSize)}</span></td>` : ''}
                              <td style="padding-right:6px;"><span style="display:inline-block;padding:2px 9px;border-radius:20px;background-color:#ede9fe;border:1px solid #ddd6fe;font-size:10px;font-weight:700;color:#7c3aed;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${esc(kLabel)}</span></td>
                              <td><span style="display:inline-block;padding:2px 9px;border-radius:20px;background-color:${privacy.bg};border:1px solid ${privacy.border};font-size:10px;font-weight:700;color:${privacy.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${privacy.label}</span></td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              ${senderNote ? `
              <!-- Sender note -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                style="border-collapse:collapse;margin-bottom:28px;border-left:3px solid #7c3aed;background-color:#faf5ff;">
                <tr>
                  <td style="padding:12px 16px;">
                    <p style="margin:0 0 4px;font-size:10.5px;font-weight:700;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;text-transform:uppercase;letter-spacing:.06em;">Personal Note from ${esc(senderName.split(' ')[0])}</p>
                    <p style="margin:0;font-size:13.5px;color:#475569;font-style:italic;line-height:1.65;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">&ldquo;${esc(senderNote)}&rdquo;</p>
                  </td>
                </tr>
              </table>
              ` : ''}

              <!-- Action buttons -->
              <table class="btn-row" role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
                <tr>
                  <!-- Open File button (primary, filled) -->
                  <td class="btn-row-cell" style="padding-right:10px;padding-bottom:0;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                      href="${openLink}" style="height:42px;v-text-anchor:middle;width:148px;" arcsize="23%"
                      fillcolor="#7c3aed" strokecolor="#7c3aed">
                      <w:anchorlock/><center style="color:#ffffff;font-family:sans-serif;font-size:13px;font-weight:700;">Open File ↗</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${openLink}" class="btn-link"
                      style="display:inline-block;padding:11px 22px;border-radius:10px;background-color:#7c3aed;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.01em;white-space:nowrap;border:1px solid #6d28d9;">
                      Open File ↗
                    </a>
                    <!--<![endif]-->
                  </td>

                  <!-- Download button (secondary, outline) -->
                  <td class="btn-row-cell" style="padding-right:10px;padding-bottom:0;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                      href="${downloadLink}" style="height:42px;v-text-anchor:middle;width:130px;" arcsize="23%"
                      fillcolor="#f8fafc" strokecolor="#7c3aed">
                      <w:anchorlock/><center style="color:#7c3aed;font-family:sans-serif;font-size:13px;font-weight:700;">↓ Download</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${downloadLink}" class="btn-link"
                      style="display:inline-block;padding:11px 22px;border-radius:10px;background-color:#ffffff;color:#7c3aed;font-size:13px;font-weight:700;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.01em;white-space:nowrap;border:1.5px solid #7c3aed;">
                      ↓ Download
                    </a>
                    <!--<![endif]-->
                  </td>

                  <!-- Add to Drive button (tertiary, light fill) -->
                  <td class="btn-row-cell" style="padding-bottom:0;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
                      href="${importLink}" style="height:42px;v-text-anchor:middle;width:148px;" arcsize="23%"
                      fillcolor="#faf5ff" strokecolor="#ddd6fe">
                      <w:anchorlock/><center style="color:#7c3aed;font-family:sans-serif;font-size:13px;font-weight:700;">+ Add to My Drive</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${importLink}" class="btn-link"
                      style="display:inline-block;padding:11px 22px;border-radius:10px;background-color:#faf5ff;color:#7c3aed;font-size:13px;font-weight:700;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.01em;white-space:nowrap;border:1.5px solid #ddd6fe;">
                      + Add to My Drive
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

              <!-- Fallback link -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-top:1px solid #f1f5f9;padding-top:16px;margin-top:4px;">
                <tr>
                  <td style="padding-top:16px;">
                    <p style="margin:0;font-size:11.5px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;">
                      Button not working? Copy and paste this link into your browser:<br/>
                      <a href="${openLink}" style="color:#7c3aed;text-decoration:underline;word-break:break-all;font-size:11px;">${openLink}</a>
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- ── Security notice ── -->
          <tr>
            <td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-top:1px solid #f1f5f9;border-bottom:0;padding:14px 32px;">
              <p style="margin:0;font-size:11.5px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.6;">
                🔒 <strong style="color:#64748b;">Security tip:</strong> DocRud will never ask for your password via email.
                If you weren&rsquo;t expecting this file, you can safely ignore this message.
              </p>
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="background-color:#f1f5f9;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;border-top:0;padding:16px 32px 18px;text-align:center;">
              <p style="margin:0 0 6px;font-size:11px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                This notification was sent to <strong style="color:#64748b;">${esc(to)}</strong> because a DocRud Drive user shared a file with you.
              </p>
              <p style="margin:0;font-size:11px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
                <a href="https://docrud.in" style="color:#7c3aed;text-decoration:none;">docrud.in</a>
                &nbsp;&middot;&nbsp;
                <a href="${unsub}" style="color:#94a3b8;text-decoration:underline;">Unsubscribe</a>
                &nbsp;&middot;&nbsp;
                <a href="https://docrud.in/privacy" style="color:#94a3b8;text-decoration:underline;">Privacy Policy</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- ═══ End container ═══ -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/* ─── Plain-text fallback ────────────────────────────────────────────────── */

function buildPlainText(opts: {
  senderName: string;
  senderEmail: string;
  fileName: string;
  fileSize?: string;
  fileKind?: string;
  filePrivacy?: string;
  senderNote?: string;
  openLink: string;
  downloadLink: string;
  importLink: string;
  to: string;
  unsubLink: string;
}): string {
  const { senderName, senderEmail, fileName, fileSize, fileKind, senderNote, openLink, downloadLink, importLink, to, unsubLink } = opts;
  const kLabel = kindLabel(fileKind);
  const meta   = [fileSize, kLabel].filter(Boolean).join(' · ');

  return [
    `${senderName} shared a file with you via DocRud Drive`,
    '='.repeat(56),
    '',
    `File: ${fileName}`,
    meta ? `Info: ${meta}` : '',
    senderNote ? `\nPersonal note from ${senderName.split(' ')[0]}:\n"${senderNote}"` : '',
    '',
    '─'.repeat(56),
    '',
    `Open File:      ${openLink}`,
    `Download:       ${downloadLink}`,
    `Add to Drive:   ${importLink}`,
    '',
    '─'.repeat(56),
    '',
    `This notification was sent to ${to}`,
    `To stop receiving these emails: ${unsubLink}`,
    '',
    '© DocRud · docrud.in · Secure File Sharing',
  ].filter(l => l !== '').join('\n');
}

/* ─── Route handler ─────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: {
      to: string;
      subject?: string;
      senderNote?: string;
      fileName: string;
      fileSize?: string;
      fileKind?: string;
      fileId: string;
      filePrivacy?: string;
      attachment?: number[];
      attachmentMime?: string;
      attachmentName?: string;
    } = await req.json();

    const {
      to, senderNote, fileName, fileSize, fileKind,
      fileId, filePrivacy, attachment, attachmentMime, attachmentName,
    } = body;

    /* ── Validation ── */
    if (!to?.trim()) {
      return NextResponse.json({ error: 'Recipient email is required' }, { status: 400 });
    }
    if (!fileName?.trim()) {
      return NextResponse.json({ error: 'File name is required' }, { status: 400 });
    }

    /* ── SMTP settings ── */
    const settings = await getMailSettings();
    if (!settings.host || !settings.fromEmail) {
      return NextResponse.json({ error: 'SMTP mail settings are not configured. Please configure them in Admin → Settings → Mail.' }, { status: 500 });
    }

    /* ── Sender identity ── */
    const senderName  = session.user.name  || 'A DocRud user';
    const senderEmail = session.user.email || settings.fromEmail;
    const origin      = req.nextUrl.origin;

    /* ── Links ── */
    const openLink     = `${origin}?drive-open=${fileId}`;
    const downloadLink = `${origin}/api/drive/public-download?id=${fileId}`;
    const importLink   = `${origin}?drive-import=${fileId}`;
    const unsubLink    = `${origin}/unsubscribe?email=${encodeURIComponent(to.trim())}&type=drive-share`;

    /* ── Derived subject ── */
    const subject = body.subject?.trim()
      || `${senderName} shared "${fileName}" with you`;

    /* ── Build email content ── */
    const html      = buildHtml({ origin, senderName, senderEmail: senderEmail ?? settings.fromEmail, fileName, fileSize, fileKind, fileId, filePrivacy, senderNote, to: to.trim() });
    const plainText = buildPlainText({ senderName, senderEmail: senderEmail ?? settings.fromEmail, fileName, fileSize, fileKind, filePrivacy, senderNote, openLink, downloadLink, importLink, to: to.trim(), unsubLink });

    /* ── Build transporter ── */
    const transporter = nodemailer.createTransport({
      host:   settings.host,
      port:   Number(settings.port),
      secure: settings.secure,
      auth:   settings.requireAuth
        ? { user: settings.username, pass: settings.password }
        : undefined,
      /* Certificate verification stays ON, matching lib/server/mailer.ts.
         The "self-signed for dev" exemption also applied in production, where
         it silently accepted any certificate. */
    });

    /* ── Mail options (anti-spam best practices) ── */
    const mailOptions: nodemailer.SendMailOptions = {
      /* Sender */
      from:    `"${senderName} via DocRud Drive" <${settings.fromEmail}>`,
      replyTo: senderEmail || settings.replyTo || undefined,
      to:      to.trim(),

      /* Content */
      subject,
      html,
      text: plainText,    // ← plain-text alternative: CRITICAL for spam score

      /* Anti-spam / RFC compliance headers */
      headers: {
        /* One-click unsubscribe — Google/Yahoo require this from Feb 2024 */
        'List-Unsubscribe':      `<${unsubLink}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        /* Standard transactional signal */
        'X-Mailer':              'DocRud Drive Mailer',
        'Importance':            'Normal',
        'X-Priority':            '3',
        /* Identify as transactional (not marketing bulk) */
        'X-Entity-Ref-ID':       `drive-share-${fileId}-${Date.now()}`,
      },
    };

    /* ── Attachment ── */
    if (attachment && attachment.length > 0 && attachmentMime && attachmentName) {
      mailOptions.attachments = [{
        filename:    attachmentName,
        content:     Buffer.from(attachment),
        contentType: attachmentMime,
      }];
    }

    /* ── Send ── */
    const info = await transporter.sendMail(mailOptions);

    return NextResponse.json({ ok: true, messageId: info.messageId });

  } catch (err) {
    console.error('[drive/send-email]', err);
    const message = err instanceof Error ? err.message : 'Failed to send email';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
