'use client';

/**
 * The boot loader.
 *
 * The look, and why it is the page's own ground rather than a panel over it,
 * is documented in splash.css. What lives here is only the timing.
 *
 * ONE THING WORTH KNOWING ABOUT THAT TIMING: the hold is a fixed 1.7s and owes
 * nothing to whether the page is ready. It was that way before this restyle and
 * it is left alone — shortening it is a product decision, not a styling one —
 * but it is the reason nothing here draws a progress bar that fills. A loader
 * that cannot see the load has nothing to be a fraction of.
 */

import { useEffect, useState } from 'react';
import './splash.css';

const HOLD_MS = 1700;
/** Must outlast the longest fade in splash.css (.sp-out is 780ms). */
const FADE_MS = 850;

export default function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // next frame → fade in
    const raf = requestAnimationFrame(() => setVisible(true));
    const outTimer = setTimeout(() => setVisible(false), HOLD_MS);
    const doneTimer = setTimeout(() => setGone(true), HOLD_MS + FADE_MS);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(outTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (gone) return null;

  return (
    /* `aria-hidden`, deliberately. The page behind this is already rendered and
       already readable; announcing a decorative splash would put 1.7s of noise
       in front of a screen reader for nothing it can act on. */
    <div className={`sp ${visible ? 'sp-in' : 'sp-out'}`} aria-hidden="true">
      <div className="sp-in-box">
        <div className="sp-mark">
          <span className="sp-ring" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/logo-192.png"
            alt=""
            width={76}
            height={76}
            /* Not lazy and not deferred: this is the one image on the first
               frame of the load, and the whole loader is waiting for it. */
            fetchPriority="high"
            decoding="sync"
          />
        </div>
        {/* The wordmark only. The tagline that was here reads well, but it
            lives in `lib/server/seo-settings.ts` as a DEFAULT the SEO Manager
            can override — hardcoding it into the loader would show a stale
            line to any installation that edited it, and the loader cannot
            fetch it: it paints before anything else runs. */}
        <p className="sp-word">docrud</p>
        <span className="sp-track" />
      </div>
    </div>
  );
}
