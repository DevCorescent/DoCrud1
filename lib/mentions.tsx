import React from 'react';
import Link from 'next/link';

/**
 * Mentions are stored inside comment text as @[Name](userId).
 *
 * The server rewrites the label from its own user records before saving and
 * drops ids that match no visible user, so anything still in this form is a
 * real person under the name Docrud holds for them.
 *
 * Every surface that prints comment text must go through one of these two
 * helpers, otherwise the raw markup leaks to readers.
 */
const MENTION_RE = /@\[([^\]]{1,80})\]\(([A-Za-z0-9_-]{1,64})\)/g;

/** Comment text with each mention as a link to the person's profile. */
export function renderWithMentions(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <Link
        key={`${m.index}-${m[2]}`}
        href={`/u/${m[2]}`}
        className="dc-mention"
        onClick={(e) => e.stopPropagation()}
      >
        @{m[1]}
      </Link>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The same text for places that cannot hold a link (previews, excerpts). */
export function mentionsToPlainText(text: string): string {
  MENTION_RE.lastIndex = 0;
  return text.replace(MENTION_RE, (_whole, label: string) => `@${label}`);
}
