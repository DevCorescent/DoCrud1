/**
 * SVG sanitisation for uploaded company logos.
 *
 * ═══ WHY SVG NEEDS THIS AND PNG DOES NOT ═══
 *
 * An SVG is a document, not a picture. It can carry <script>, event-handler
 * attributes, `javascript:` URLs, <foreignObject> containing arbitrary HTML,
 * and external references that fetch on render. Storing an uploaded SVG
 * verbatim and serving it from our own origin would hand an attacker
 * same-origin script execution.
 *
 * ═══ DOMPURIFY, NOT A HAND-ROLLED REGEX ═══
 *
 * `isomorphic-dompurify` is already a dependency (lib/security/html-sanitizer
 * uses it for DocWord). It is a real parser-based sanitiser; a regex over
 * markup is not, and every hand-rolled one eventually loses to a namespace
 * trick or an entity-encoded payload. `USE_PROFILES: { svg: true, svgFilters:
 * true }` is DOMPurify's own SVG mode.
 *
 * ═══ REJECT, THEN SANITISE ═══
 *
 * The dangerous constructs are DETECTED and the upload REFUSED, rather than
 * silently cleaned and accepted. An admin who uploads a logo containing a
 * script should be told, not handed a quietly-rewritten file. Sanitisation
 * still runs afterwards as defence in depth, so what is stored is clean even
 * if a future construct slips past detection.
 *
 * Note that the served logo is additionally rendered through <img src>, which
 * does not execute script even for an SVG. This module is the first of those
 * two independent defences, not the only one.
 */

import DOMPurify from 'isomorphic-dompurify';

export type SvgRejection =
  | 'NOT_SVG'
  | 'SCRIPT'
  | 'EVENT_HANDLER'
  | 'JAVASCRIPT_URL'
  | 'FOREIGN_OBJECT'
  | 'EXTERNAL_REFERENCE'
  | 'EMBEDDED_HTML'
  | 'EMPTY_AFTER_SANITIZE';

export interface SvgResult {
  ok: boolean;
  /** The cleaned markup. Only present when ok. */
  svg?: string;
  reason?: SvgRejection;
  message?: string;
}

const MESSAGES: Record<SvgRejection, string> = {
  NOT_SVG: 'That file is not a valid SVG.',
  SCRIPT: 'That SVG contains a script and was rejected.',
  EVENT_HANDLER: 'That SVG contains event handlers and was rejected.',
  JAVASCRIPT_URL: 'That SVG contains a javascript: URL and was rejected.',
  FOREIGN_OBJECT: 'That SVG contains <foreignObject> and was rejected.',
  EXTERNAL_REFERENCE: 'That SVG loads external resources and was rejected.',
  EMBEDDED_HTML: 'That SVG embeds HTML and was rejected.',
  EMPTY_AFTER_SANITIZE: 'Nothing renderable remained after that SVG was cleaned.',
};

/* Detection runs on the RAW text, before any parsing, so a payload that a
   parser might normalise away is still reported rather than silently dropped. */
const DANGER: Array<[RegExp, SvgRejection]> = [
  [/<\s*script/i, 'SCRIPT'],
  [/<\s*foreignObject/i, 'FOREIGN_OBJECT'],
  [/<\s*(iframe|embed|object|html|body|link|meta|base)\b/i, 'EMBEDDED_HTML'],
  /* on… handlers. Requires the `=` so a legitimate word like "only" in text
     content is not mistaken for a handler. */
  [/\son[a-z]+\s*=/i, 'EVENT_HANDLER'],
  [/javascript\s*:/i, 'JAVASCRIPT_URL'],
  [/data\s*:\s*text\/html/i, 'EMBEDDED_HTML'],
  /* Anything that reaches the network when the logo renders: a tracking pixel,
     a beacon, or a font that leaks the viewer's IP to a third party. */
  [/<\s*(image|use)\b[^>]*\b(href|xlink:href)\s*=\s*["']?\s*(https?:)?\/\//i, 'EXTERNAL_REFERENCE'],
  [/url\s*\(\s*["']?\s*(https?:)?\/\//i, 'EXTERNAL_REFERENCE'],
  [/<\s*(set|animate)[a-z]*\b[^>]*attributeName\s*=\s*["']?\s*(href|xlink:href)/i, 'EXTERNAL_REFERENCE'],
];

/** Entity-encoded payloads, decoded once so `&#106;avascript:` is still seen. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&colon;/gi, ':')
    .replace(/&NewLine;/gi, '\n')
    .replace(/&Tab;/gi, '\t');
}

/**
 * Validate and clean SVG markup.
 *
 * Returns `ok: false` with a reason for anything dangerous, and the cleaned
 * document otherwise.
 */
export function sanitizeCompanyLogoSvg(raw: string | null | undefined): SvgResult {
  const text = String(raw ?? '');
  if (!text.trim()) return { ok: false, reason: 'NOT_SVG', message: MESSAGES.NOT_SVG };
  if (!/<\s*svg[\s>]/i.test(text)) {
    return { ok: false, reason: 'NOT_SVG', message: MESSAGES.NOT_SVG };
  }

  /* Both the literal text and its decoded form are inspected: an attacker
     hides `javascript:` as entities, and a legitimate logo never does. */
  const decoded = decodeEntities(text);
  for (const [pattern, reason] of DANGER) {
    if (pattern.test(text) || pattern.test(decoded)) {
      return { ok: false, reason, message: MESSAGES[reason] };
    }
  }

  /* Defence in depth: even having found nothing, what gets STORED is the
     sanitiser's output, never the uploaded bytes. */
  let clean: string;
  try {
    clean = DOMPurify.sanitize(text, {
      USE_PROFILES: { svg: true, svgFilters: true },
      /* Belt and braces — these are already impossible above. */
      FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'embed', 'object'],
      FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover', 'onfocus', 'onbegin'],
    }) as unknown as string;
  } catch {
    return { ok: false, reason: 'NOT_SVG', message: MESSAGES.NOT_SVG };
  }

  if (!clean || !/<\s*svg[\s>]/i.test(clean)) {
    return { ok: false, reason: 'EMPTY_AFTER_SANITIZE', message: MESSAGES.EMPTY_AFTER_SANITIZE };
  }
  /* A cleaned file that is nothing but an empty wrapper is not a logo. */
  if (!/<\s*(path|circle|rect|polygon|polyline|ellipse|line|g|text|image|use|defs)\b/i.test(clean)) {
    return { ok: false, reason: 'EMPTY_AFTER_SANITIZE', message: MESSAGES.EMPTY_AFTER_SANITIZE };
  }

  return { ok: true, svg: clean };
}
