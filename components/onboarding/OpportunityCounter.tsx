'use client';

/**
 * The opportunity count in the onboarding footer, counted up on first paint.
 *
 * ═══ THE NUMBER IS REAL ═══
 *
 * The brief named 4,000 as a presentation target, with the caveat: do not
 * claim a real count unless a verified source already exists. One does —
 * /api/jobs/public, the public feed this flow already reads on the jobs step —
 * so this animates to THAT total rather than to a chosen figure. Writing
 * "4,000+ opportunities available on Docrud" beside a corpus that holds a
 * different number would be a claim on the screen that the data does not
 * support, and it would drift the moment the corpus changed.
 *
 * The displayed figure is rounded DOWN to the nearest five by Docrud's
 * existing rule, the same one the jobs and talent screens use, so the footer
 * can never promise more than exists.
 *
 * If the feed cannot be reached, this renders NOTHING and the caller drops the
 * line entirely — an absent count is honest; an invented one is not.
 *
 * ═══ THE ANIMATION ═══
 *
 * ~1.6s, requestAnimationFrame, ease-out so it decelerates into the final
 * value. It starts only once the real total has arrived, so the number never
 * counts up to a placeholder. The frame loop is cancelled on unmount, and
 * `prefers-reduced-motion` skips straight to the value.
 */

import { useEffect, useRef, useState } from 'react';
import { getCompanyJobDisplayCount } from '@/lib/company-explorer';

const DURATION_MS = 1600;

/** Decelerating ease, so the count slows into its final value. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export default function OpportunityCounter({
  onResolved,
}: {
  /** Told whether a real total arrived, so the caller can hide its own text. */
  onResolved?: (found: boolean) => void;
}) {
  const [target, setTarget] = useState<number | null>(null);
  const [shown, setShown] = useState(0);
  const frame = useRef<number | null>(null);

  /* The real total, from the feed the flow already uses.

     Via the COUNT route, not the feed itself: `?pageSize=1` still loaded the
     whole ~12 MB corpus (~136 s cold) to answer with one integer, and it did
     that on the very first onboarding paint. Same source, same active
     predicate, one number. */
  useEffect(() => {
    let live = true;
    fetch('/api/jobs/public/count')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!live) return;
        const total = Number(data?.total);
        const usable = Number.isFinite(total) && total > 0 ? getCompanyJobDisplayCount(total) : 0;
        setTarget(usable > 0 ? usable : null);
        onResolved?.(usable > 0);
      })
      .catch(() => { if (live) { setTarget(null); onResolved?.(false); } });
    return () => { live = false; };
    // `onResolved` is a callback the caller re-creates each render; re-running
    // this on it would refetch the feed on every paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (target === null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(target);
      return;
    }
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / DURATION_MS);
      setShown(Math.floor(easeOut(progress) * target));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else setShown(target);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [target]);

  /* Nothing verified, nothing shown. */
  if (target === null) return null;

  return (
    <strong className="opportunity-count">
      {shown.toLocaleString('en-US')}+
    </strong>
  );
}
