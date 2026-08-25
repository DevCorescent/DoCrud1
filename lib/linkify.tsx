import React from 'react';

/**
 * Turn plain-text URLs inside post bodies into safe clickable links.
 *
 * This is deliberately NOT an HTML renderer: the input is untrusted user text
 * and is never passed to dangerouslySetInnerHTML. Instead the text is split into
 * an array of plain strings (which React escapes) and <a> elements whose href is
 * built only from a matched http(s)/www URL — no other scheme can be produced,
 * so `javascript:`/`data:` payloads in the body stay inert plain text.
 *
 * Surrounding text, whitespace, and newlines are preserved verbatim, so callers
 * that use `whitespace-pre-line` keep their line breaks. Returns the original
 * string when there is nothing to linkify.
 */

// Matches http://…, https://…, or www.…  up to the next whitespace or '<',
// trimming common trailing punctuation so "(see https://x.com)." links cleanly.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]}'"])/gi;

export function linkifyText(text: string | null | undefined): React.ReactNode {
  if (!text) return text ?? '';
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;

  while ((match = URL_RE.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));

    // href is only ever http(s); bare "www." is upgraded to https. The regex
    // cannot match any other scheme, so no unsafe href can be constructed.
    const href = /^www\./i.test(raw) ? `https://${raw}` : raw;
    nodes.push(
      <a
        key={`lnk-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow ugc"
        onClick={(e) => e.stopPropagation()}
        className="break-words text-sky-400/90 underline decoration-white/20 underline-offset-2 transition-colors hover:text-sky-300"
      >
        {raw}
      </a>,
    );
    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length ? nodes : text;
}
