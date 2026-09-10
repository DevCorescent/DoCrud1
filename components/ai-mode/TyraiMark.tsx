/**
 * The TYRAI mark.
 *
 * ═══ WHY A DRAWN MARK AND NOT AN ICON FROM THE SET ═══
 *
 * TYRAI had been wearing `Sparkles` from lucide, which is the icon every
 * product in the world puts on anything with a model behind it. A name needs a
 * face of its own, or the name is the only thing distinguishing it — and the
 * name is the first thing that gets truncated on a phone.
 *
 * ═══ WHAT IT IS ═══
 *
 * A four-point star inside an open ring: the ring is the search — a field of
 * everything the product knows — and the star is the one answer taken out of
 * it. The ring is deliberately open at the top right so the mark still reads as
 * a mark rather than a loading spinner, which a closed thin circle at 14px
 * always does.
 *
 * Inline SVG rather than a file: it inherits `currentColor`, so it is white in
 * the nav, dark on the white pill, and coloured by whatever contains it —
 * without a second asset to keep in step. It carries no title and no role; the
 * control around it owns the accessible name, and a nested label would be read
 * out twice.
 */

export default function TyraiMark({
  className = '',
  strokeWidth = 1.6,
}: {
  className?: string;
  /** Thinner at large sizes, heavier at 14px where hairlines disappear. */
  strokeWidth?: number;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable="false"
    >
      {/* The open ring. */}
      <path
        d="M20.5 9.2A9 9 0 1 1 12 3"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* The answer: a four-point star, filled so it holds at small sizes where
          a stroked one turns to mush. */}
      <path
        d="M12 6.6c.55 2.9 1.9 4.25 4.8 4.8-2.9.55-4.25 1.9-4.8 4.8-.55-2.9-1.9-4.25-4.8-4.8 2.9-.55 4.25-1.9 4.8-4.8Z"
        fill="currentColor"
      />
      {/* The point the ring opens at, closing the composition. */}
      <circle cx="19.9" cy="5.4" r="1.7" fill="currentColor" />
    </svg>
  );
}
