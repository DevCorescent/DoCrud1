/**
 * Plain-text generation from sanitized email HTML.
 *
 * Every email needs a text/plain alternative: some clients render it, some
 * recipients prefer it, and spam filters treat an HTML-only message as a
 * signal. Requiring an admin to write and maintain two versions guarantees the
 * text one rots, so it is derived.
 *
 * Input is expected to be the output of `sanitizeEmailHtml` — this is a
 * formatter, not a security boundary, and must never be the only thing
 * standing between authored HTML and a recipient.
 */

const BLOCK_TAGS = 'p|div|h1|h2|h3|h4|h5|h6|tr|table|ul|ol|blockquote|section|article|header|footer';

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    /* Ampersand last, so "&amp;lt;" does not become "<". */
    .replace(/&amp;/gi, '&');
}

export function emailHtmlToText(html: string | null | undefined): string {
  if (!html) return '';
  let text = String(html);

  /* Order matters: structural markers are inserted before tags are stripped. */
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<hr\s*\/?>/gi, '\n----------\n');

  /* A link becomes "label (url)" so the destination survives in plain text —
     a bare label would leave the reader with nothing to act on. */
  text = text.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href: string, label: string) => {
      const clean = decodeEntities(label.replace(/<[^>]+>/g, '')).trim();
      if (!clean) return href;
      return clean === href ? clean : `${clean} (${href})`;
    },
  );

  /* An image contributes its alt text, or nothing. */
  text = text.replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi,
    (_m, alt: string) => (alt.trim() ? `[${alt.trim()}]` : ''));
  text = text.replace(/<img\b[^>]*>/gi, '');

  text = text.replace(/<li\b[^>]*>/gi, '\n• ');
  text = text.replace(/<\/li>/gi, '');
  text = text.replace(new RegExp(`</(?:${BLOCK_TAGS})>`, 'gi'), '\n\n');
  text = text.replace(new RegExp(`<(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi'), '');
  text = text.replace(/<td\b[^>]*>/gi, '');
  text = text.replace(/<\/td>/gi, '\t');

  /* Anything left is inline formatting; drop the tags, keep the words. */
  text = text.replace(/<[^>]+>/g, '');
  text = decodeEntities(text);

  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
