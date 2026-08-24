/**
 * DocWord HTML sanitizer — the single security boundary for rendering
 * user-authored DocWord content.
 *
 * DocWord stores per-block HTML authored in a contentEditable editor. That HTML
 * is untrusted: a document author can embed script, event handlers, javascript:
 * URLs, <iframe>/<object>, <svg onload>, etc. When another user opens a shared
 * document those payloads would execute in the viewer's browser (stored,
 * cross-account XSS). This module runs the content through DOMPurify (a real
 * HTML-parser-based sanitizer, not regex) with an explicit allowlist derived
 * from what the DocWord editor actually produces.
 *
 * It uses isomorphic-dompurify so the SAME sanitization runs during SSR (jsdom)
 * and in the browser (native DOM) — identical output, no hydration mismatch,
 * no browser-only API on the server.
 *
 * Every DocWord rendering path (shared/public view AND editor preview/print)
 * MUST pass user HTML through sanitizeDocWordHtml() before it reaches
 * dangerouslySetInnerHTML / element.innerHTML, because malicious documents may
 * already be stored — sanitizing on write alone is not enough.
 */

import DOMPurify from 'isomorphic-dompurify';

/*
 * URL policy. Extends DOMPurify's default safe-URI matcher with RASTER data:
 * image URIs only (DocWord stores pasted/uploaded images as base64 data URLs).
 * javascript:, vbscript:, data:text/html and data:image/svg+xml (scriptable)
 * do NOT match and are dropped from href/src.
 */
const DOCWORD_URI_REGEXP =
  /^(?:(?:https?|mailto|tel|ftp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$)|data:image\/(?:png|jpe?g|gif|webp|bmp)(?:;[a-z0-9\-]+=[a-z0-9\-]+)*;base64,)/i;

/* Tags the DocWord editor actually emits: block structure from buildHtml()
   (headings, quote→blockquote, callout→aside, figure/img/figcaption, tables)
   plus inline formatting from the toolbar (bold/italic/underline, lists, links,
   font/color spans). No scripting/embedding tags. */
const ALLOWED_TAGS = [
  'p', 'div', 'span', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4',
  'blockquote', 'aside', 'figure', 'figcaption',
  'ul', 'ol', 'li',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'mark', 'small', 'code', 'pre',
  'a', 'img', 'font',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
];

/* Only attributes the editor needs. `style` is allowed but its CSS is sanitized
   by DOMPurify (drops expression(), javascript:, unsafe url(), bindings). Event
   handlers (on*) are never listed and are stripped. */
const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'title',
  'src', 'alt', 'width', 'height',
  'class', 'style', 'align',
  'colspan', 'rowspan',
  'color', 'face',
];

/* Explicit belt-and-suspenders — these are already excluded by the allowlist,
   but forbidding them makes the policy self-documenting and future-proof. */
const FORBID_TAGS = [
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'svg', 'math',
  'link', 'meta', 'base', 'applet', 'noscript', 'template', 'frame', 'frameset',
];
const FORBID_ATTR = ['srcset', 'formaction', 'xlink:href', 'ping'];

const CONFIG = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  FORBID_TAGS,
  FORBID_ATTR,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  ALLOWED_URI_REGEXP: DOCWORD_URI_REGEXP,
  KEEP_CONTENT: true,
  USE_PROFILES: { html: true },
} as const;

/*
 * Defense-in-depth hooks (added once). DOMPurify still does all HTML parsing;
 * these only clean specific ATTRIBUTE VALUES that DOMPurify's cross-environment
 * (jsdom vs browser) behaviour handles inconsistently:
 *
 *  - `style`: the editor only ever produces colour/font declarations. If a style
 *    contains a scriptable/loading construct (url(), expression(), @import,
 *    javascript:/vbscript:, -moz-binding, behavior), the whole style attribute
 *    is dropped — legitimate colour/font styles never contain those.
 *  - data: URIs on src/href are restricted to RASTER images only, so a
 *    data:image/svg+xml (scriptable) or data:text/html cannot pass.
 *
 * This is not "regex HTML sanitization" — the HTML tree is sanitized by
 * DOMPurify's parser; these regexes only inspect one already-isolated value.
 */
const DANGEROUS_CSS = /url\s*\(|expression\s*\(|@import|javascript:|vbscript:|-moz-binding|behavior\s*:/i;
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i;

let hooksInstalled = false;
function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
    if (!data || typeof data.attrValue !== 'string') return;
    if (data.attrName === 'style' && DANGEROUS_CSS.test(data.attrValue)) {
      data.keepAttr = false;
      return;
    }
    if ((data.attrName === 'src' || data.attrName === 'href') && /^\s*data:/i.test(data.attrValue)) {
      if (!SAFE_DATA_IMAGE.test(data.attrValue.trim())) {
        data.keepAttr = false;
      }
    }
  });
}
installHooks();

/** Sanitize untrusted DocWord block/header/footer HTML. Returns safe HTML. */
export function sanitizeDocWordHtml(html: string | null | undefined): string {
  if (!html) return '';
  installHooks();
  return DOMPurify.sanitize(String(html), CONFIG as unknown as Parameters<typeof DOMPurify.sanitize>[1]) as string;
}
