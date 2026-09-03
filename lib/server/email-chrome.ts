type EmailChromeInput = {
  origin: string;
  subject: string;
  preheader?: string;
  bodyHtml: string;
  /**
   * A header image, rendered ONLY when one is explicitly supplied.
   *
   * ═══ THERE IS NO DEFAULT, DELIBERATELY ═══
   *
   * This chrome used to hard-code `${origin}/email/header.png` — a 1.5 MB
   * "Explore gigs. Find talent. Get it done." advert — onto EVERY email it
   * wrapped, including the ones whose only job is to deliver six digits. No
   * caller asked for it and no caller could decline it.
   *
   * So the default is now nothing at all. Absent, null and empty all render no
   * image, and there is no `||` or `??` anywhere in this file falling back to
   * an asset: a new email type added next year gets no advert by accident,
   * which is the property a per-email opt-out could never give.
   *
   * A Super Admin who wants an image puts an `<img>` in the template HTML
   * through the existing system-email editor. That HTML goes through
   * `sanitizeEmailHtml`, which already allows `img` with `src`/`alt`/`width`/
   * `height` and strips `onerror`/`onload`/`srcset`. That capability is
   * untouched by this change, and this parameter is the same idea for a caller
   * that has an explicit URL rather than explicit markup.
   */
  headerImageUrl?: string | null;
};

export function escapeHtmlLite(value: string) {
  return String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * An email header image, or empty.
 *
 * A same-origin path or an https URL. `javascript:`, `data:`, `file:` and a
 * protocol-relative `//host` are refused, so this cannot become a way to make
 * every recipient's mail client fetch an arbitrary URL.
 */
export function safeEmailImageUrl(raw: unknown): string {
  const v = String(raw ?? '').trim();
  if (!v) return '';
  if (v.startsWith('/') && !v.startsWith('//')) {
    return /["'<>\\\s]/.test(v) ? '' : v.slice(0, 512);
  }
  try {
    const u = new URL(v);
    return u.protocol === 'https:' ? u.toString().slice(0, 512) : '';
  } catch { return ''; }
}

export function buildEmailChrome(input: EmailChromeInput) {
  const origin = String(input.origin || '').trim().replace(/\/$/, '');
  /* Explicit or nothing. Same-origin paths and https only, so supplying one
     can never turn an email into a request to an arbitrary host. */
  const headerImageUrl = safeEmailImageUrl(input.headerImageUrl);
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
              ${headerImageUrl ? `<tr>
                <td style="padding: 0;">
                  <a href="${escapeHtmlLite(homeUrl)}" style="text-decoration:none; display:block;">
                    <img src="${escapeHtmlLite(headerImageUrl)}" alt="docrud" width="680" style="width:100%; max-width:680px; height:auto; border:0; display:block; border-radius:18px;" />
                  </a>
                </td>
              </tr>` : ''}
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

