type EmailChromeInput = {
  origin: string;
  subject: string;
  preheader?: string;
  bodyHtml: string;
};

export function escapeHtmlLite(value: string) {
  return String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildEmailChrome(input: EmailChromeInput) {
  const origin = String(input.origin || '').trim().replace(/\/$/, '');
  const headerImgUrl = `${origin}/email/header.png`;
  const homeUrl = origin;
  const preheader = String(input.preheader || '').trim();
  const safeSubject = escapeHtmlLite(input.subject);

  return `
    <div style="display:none; font-size:1px; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; mso-hide:all;">
      ${escapeHtmlLite(preheader || `Updates from docrud: ${safeSubject}`)}
    </div>
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color: #0f172a; line-height: 1.6; background:#ffffff;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td align="center" style="padding: 18px 12px;">
            <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:680px; max-width:680px;">
              <tr>
                <td style="padding: 0;">
                  <a href="${escapeHtmlLite(homeUrl)}" style="text-decoration:none; display:block;">
                    <img src="${escapeHtmlLite(headerImgUrl)}" alt="docrud" width="680" style="width:100%; max-width:680px; height:auto; border:0; display:block; border-radius:18px;" />
                  </a>
                </td>
              </tr>
              <tr>
                <td style="padding: 14px 6px 0;">
                  <div style="font-size: 12px; color: rgba(15,23,42,.55); font-weight: 800; letter-spacing: .12em; text-transform: uppercase;">
                    docrud
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 6px 0;">
                  <div style="font-size: 18px; font-weight: 800; letter-spacing: -.02em; color:#0f172a;">
                    ${safeSubject}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 14px 6px 0;">
                  ${input.bodyHtml}
                </td>
              </tr>
              <tr>
                <td style="padding: 18px 6px 0;">
                  <div style="font-size: 12px; color: rgba(15,23,42,.55);">
                    You’re receiving this email because you used docrud. If you weren’t expecting it, you can ignore it.
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding: 12px 6px 18px;">
                  <div style="font-size: 12px; color: rgba(15,23,42,.55);">
                    <a href="${escapeHtmlLite(homeUrl)}" style="color: rgba(15,23,42,.75); text-decoration: underline;">Open docrud</a>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `.trim();
}

