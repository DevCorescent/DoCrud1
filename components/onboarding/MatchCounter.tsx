'use client';

/**
 * The job-match figure on the onboarding jobs step, counted up in fives.
 *
 * ═══ EVERY FRAME IS TRUE ═══
 *
 * The only values this ever renders are the elements of `countUpSteps(bucket)`
 * — 0, 5, 10, … up to the bucket, which is itself the real count floored to a
 * multiple of five. So at no instant does the screen show a number the engine
 * did not reach: the climb is driven by the real count, not by a timer that
 * happens to stop somewhere.
 *
 * ═══ THE MOTION ═══
 *
 * ~1.4 s, requestAnimationFrame, ease-out so the last steps slow down. It
 * starts at 0 on mount and again whenever the bucket changes. The frame loop is
 * cancelled on unmount, and `prefers-reduced-motion` skips straight to the
 * final value.
 */

import { useEffect, useRef, useState } from 'react';
import { countUpSteps } from '@/lib/onboarding-jobs';

const DURATION_MS = 1400;

/** Decelerating ease, so the count slows into its final value. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export default function MatchCounter({ bucket }: { bucket: number }) {
  const [shown, setShown] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const steps = countUpSteps(bucket);
    const last = steps[steps.length - 1];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(last);
      return;
    }
    setShown(0);
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / DURATION_MS);
      const index = Math.min(steps.length - 1, Math.floor(easeOut(progress) * (steps.length - 1)));
      setShown(steps[index]);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else setShown(last);
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [bucket]);

  return (
    <div className="match-card-number" aria-live="polite">
      {shown > 0 ? `${shown.toLocaleString('en-US')}+` : '0'}
    </div>
  );
}
