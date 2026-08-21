'use client';

/**
 * Renders content with its @mentions linked to the mentioned profiles.
 *
 * The text is never parsed for markup — only the names the server resolved
 * from the stored ids become links, so nothing an author types can turn itself
 * into a link, and the destination always comes from the stored id through the
 * app's existing /u/<id> profile route.
 */

import Link from 'next/link';
import { Fragment } from 'react';
import { mentionProfileHref, segmentMentions, type ResolvedMention } from '@/lib/mentions';

export default function MentionText({
  text,
  mentions,
  className,
  linkClassName = 'font-semibold text-sky-300/90 transition hover:text-sky-200 hover:underline',
}: {
  text: string;
  mentions?: ResolvedMention[] | null;
  className?: string;
  linkClassName?: string;
}) {
  const list = mentions ?? [];
  if (list.length === 0) return <>{text}</>;

  const segments = segmentMentions(text, list);
  const body = segments.map((seg, i) =>
    seg.type === 'mention' ? (
      <Link
        key={i}
        href={mentionProfileHref(seg.userId)}
        /* Comment and post bodies sit inside clickable cards in places. */
        onClick={(e) => e.stopPropagation()}
        className={linkClassName}
      >
        {seg.value}
      </Link>
    ) : (
      <Fragment key={i}>{seg.value}</Fragment>
    ),
  );

  return className ? <span className={className}>{body}</span> : <>{body}</>;
}
