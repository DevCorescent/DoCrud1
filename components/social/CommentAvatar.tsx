'use client';

/**
 * Commenter avatar — the uploaded profile picture when there is one, the
 * existing initials-on-colour circle when there is not.
 *
 * A picture that fails to load falls back to the same initials circle rather
 * than leaving a broken-image glyph, and the failure resets when `src`
 * changes so a re-uploaded avatar recovers without a remount.
 */

import { useEffect, useState } from 'react';

export function CommentAvatar({
  src,
  initials,
  colorClass,
  className = '',
}: {
  src?: string | null;
  initials: string;
  /** Existing bg-* class used for the initials fallback. */
  colorClass: string;
  /** Size/spacing classes from the call site, e.g. "mt-0.5 h-8 w-8 text-[11px]". */
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);

  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white ${
        showImage ? 'bg-white/[0.06]' : colorClass
      } ${className}`}
    >
      {showImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src as string}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        initials
      )}
    </div>
  );
}

export default CommentAvatar;
