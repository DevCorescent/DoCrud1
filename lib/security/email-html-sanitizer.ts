/**
 * Email HTML sanitizer — the single security boundary for admin-authored
 * campaign content.
 *
 * The Compose editor is contentEditable, so its output is untrusted: an
 * author can paste markup containing script, event handlers, `javascript:`
 * URLs, iframes or scriptable SVG. That HTML is then stored, rendered in the
 * admin preview with `dangerouslySetInnerHTML`, and mailed to thousands of
 * people. Sanitizing must therefore happen on the SERVER, on write and before
 * send — sanitizing only in the browser would be no boundary at all.
 *
 * This is a sibling of `sanitizeDocWordHtml`, not a copy of it, because email
 * is a different medium with a different allowlist:
 *
 *  - NO `data:` images. DocWord stores pasted images as base64 data URLs;
 *    email clients widely block them, and an email that renders in the admin
 *    preview but not in an inbox is worse than a rejected paste. Images must
 *    be uploaded and referenced by URL.
 *  - Inline `style` IS allowed, because email layout has no other mechanism —
 *    there are no stylesheets in most clients. It is filtered to a property
 *    allowlist so it cannot carry `expression()`, `url(javascript:...)` or
 *    positioning tricks.
 *  - Tables are allowed: they remain the only reliable email layout primitive.
 *
 * The same function feeds the preview, the test send and the real send, so
 * what an admin approves is byte-identical to what is delivered.
 */
import DOMPurify from 'isomorphic-dompurify';

/**
 * URL policy for href/src.
 *
 * Deliberately narrower than DOMPurify's default: no `data:` at all, and no
 * `tel:`/`ftp:` which have no place in a campaign. `javascript:`, `vbscript:`
 * and `file:` do not match and are dropped.
 */
const EMAIL_URI_REGEXP = /^(?:https?:|mailto:|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

/** Tags the email editor emits, plus the table primitives email layout needs. */
const ALLOWED_TAGS = [
  'p', 'div', 'span', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'code', 'pre',
  'ul', 'ol', 'li', 'blockquote',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'center', 'small',
];

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'title',
  'src', 'alt', 'width', 'height',
  'align', 'valign', 'colspan', 'rowspan',
  'cellpadding', 'cellspacing', 'border', 'bgcolor',
  'style', 'class', 'dir',
];

/**
 * CSS properties an email may carry inline.
 *
 * An allowlist rather than a denylist: the failure mode of a denylist is that
 * anything new is permitted by default, and `position`, `behavior` and
 * `expression()` are exactly the things that must never slip through.
 */
const ALLOWED_CSS = new Set([
  'color', 'background-color', 'background',
  'font-size', 'font-family', 'font-weight', 'font-style',
  'text-align', 'text-decoration', 'line-height', 'letter-spacing',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border', 'border-top', 'border-bottom', 'border-left', 'border-right',
  'border-radius', 'border-collapse', 'border-color', 'border-width', 'border-style',
  'width', 'max-width', 'min-width', 'height', 'display', 'vertical-align',
]);

/** Values that make a declaration unsafe regardless of the property. */
const UNSAFE_CSS_VALUE = /expression\s*\(|javascript:|vbscript:|url\s*\(\s*['"]?\s*(?:javascript|data|vbscript):/i;

/** Rebuild a style attribute from only the declarations we permit. */
function filterStyle(style: string): string {
  return style
    .split(';')
    .map((decl) => decl.trim())
    .filter(Boolean)
    .filter((decl) => {
      const idx = decl.indexOf(':');
      if (idx <= 0) return false;
      const prop = decl.slice(0, idx).trim().toLowerCase();
      const value = decl.slice(idx + 1).trim();
      if (!ALLOWED_CSS.has(prop)) return false;
      if (UNSAFE_CSS_VALUE.test(value)) return false;
      return true;
    })
    .join('; ');
}

let hooked = false;

function installHooks() {
  if (hooked) return;
  hooked = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as unknown as Element;
    if (typeof el.getAttribute !== 'function') return;

    /* Filter inline CSS to the property allowlist. DOMPurify keeps the
       attribute; deciding WHICH declarations survive is our job. */
    const style = el.getAttribute('style');
    if (style) {
      const safe = filterStyle(style);
      if (safe) el.setAttribute('style', safe);
      else el.removeAttribute('style');
    }

    /* DOMPurify allows `data:` on a handful of tags (its DATA_URI_TAGS set)
       regardless of ALLOWED_URI_REGEXP, so `<img src="data:...">` survives the
       regex. Email clients widely block data: images, so enforce the policy
       here rather than depending on a library default that has an exception
       for exactly this case. */
    for (const attr of ['src', 'href'] as const) {
      const url = el.getAttribute(attr);
      if (url && /^\s*(?:data|javascript|vbscript|file):/i.test(url)) {
        el.removeAttribute(attr);
      }
    }

    /* Every external link opens in a new tab and cannot reach back into the
       opener. `noopener` matters even in mail clients that render in a frame. */
    if (el.tagName === 'A' && el.getAttribute('href')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    }

    /* An image with no alt is an accessibility hole and looks broken in the
       many clients that block images by default. */
    if (el.tagName === 'IMG' && !el.getAttribute('alt')) {
      el.setAttribute('alt', '');
    }
  });
}

/**
 * Sanitize admin-authored email HTML.
 *
 * Safe to call repeatedly; the result of sanitizing sanitized HTML is itself.
 */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return '';
  installHooks();
  return DOMPurify.sanitize(String(html), {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: EMAIL_URI_REGEXP,
    /* Belt and braces: these are absent from ALLOWED_TAGS already, but naming
       them makes the intent unmissable to the next reader. */
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'svg', 'math', 'link', 'meta', 'base'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'formaction', 'srcset', 'ping'],
    ALLOW_DATA_ATTR: false,
    KEEP_CONTENT: true,
  });
}

/** Schemes an admin may link to. Anything else is rejected with an error. */
export function isSafeEmailUrl(value: string): boolean {
  const v = String(value ?? '').trim();
  if (!v) return false;
  if (/^(?:javascript|data|vbscript|file):/i.test(v)) return false;
  try {
    const url = new URL(v);
    return url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}
