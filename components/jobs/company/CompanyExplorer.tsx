'use client';

/**
 * Company Explorer — the homepage strip.
 *
 * Replaces the old Explore row. Same glass language as the rest of the
 * homepage: the surface, hairline border and hover are copied from the Jobs /
 * Connections cards so this cannot drift away from them.
 *
 * ═══ SCROLLING ═══
 *
 * Horizontal ONLY, and driven by the CURSOR — there are no arrow buttons. A
 * wheel or trackpad gesture while the pointer is over the rail moves it
 * sideways, end to end. The listener lives on the rail itself, so it can only
 * fire while the pointer is on it; the rest of the page scrolls normally.
 *
 * NO LATENCY BY CONSTRUCTION. `scrollLeft` is assigned directly — no
 * `behavior: 'smooth'`, no rAF, no easing, no transition. One wheel event is
 * one frame of movement, so the rail tracks the gesture exactly.
 *
 * IT NEVER TRAPS THE PAGE. `preventDefault()` is called only when the rail can
 * still move the way the gesture is pushing. At either end the event is left
 * alone and the page scrolls, which is why the listener must be non-passive
 * (`{ passive: false }`) — a passive listener cannot make that choice.
 *
 * `overflow-y: hidden` and `touch-action: pan-x` mean a vertical swipe that
 * starts on the rail still scrolls the PAGE, and `overscroll-behavior-x:
 * contain` stops a horizontal fling at either end from turning into a browser
 * back-gesture or a page pan.
 *
 * The rail is the only thing on the page allowed to overflow sideways: it is
 * `min-width: 0` inside a `min-width: 0` parent, which is what stops a flex
 * child from forcing the body wider than the viewport.
 *
 * A mouse may also DRAG it, past a 5px threshold so a click on a tile is still
 * a click. Touch is left to the browser's own panning.
 *
 * ═══ IT NEVER MOVES BY ITSELF ═══
 *
 * There is no marquee here. No keyframes, no transform animation, no interval,
 * no timeout, no requestAnimationFrame, and nothing that assigns `scrollLeft`
 * except the two user-driven handlers. Left alone, the rail stays exactly where
 * it is, indefinitely. The only automatic work is READING `scrollLeft` to size
 * the edge fades.
 *
 * ═══ THE EDGES FADE, THEY DO NOT BLUR ═══
 *
 * A `mask-image` on the rail itself, the same technique the projects, people
 * and onboarding strips use. Not `filter: blur()` — that would smear the very
 * logos this component exists to show — and not an overlay div, which would
 * need a background colour matching whatever sits behind it and could swallow
 * a click. Each side's width comes from the scroll position, so an edge with
 * nothing beyond it shows no fade.
 *
 * ═══ LOGOS KEEP THEIR OWN COLOURS ═══
 *
 * Every mark sits on a permanently white plate in BOTH themes, with no filter,
 * no grayscale, no invert and no opacity dimming. A brand mark recoloured by a
 * page theme is no longer that brand's mark.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { companyJobsHref, formatCompanyJobCount, type CompanyExplorerTile } from '@/lib/company-explorer';
import CompanyExplorerManageModal from './CompanyExplorerManageModal';
import CompanyLogo from './CompanyLogo';
import './company-explorer.css';

/** How far a fade reaches in from an edge. Tuned to about one tile's margin. */
const FADE = '34px';
/** Under this, the gesture was a click on a tile, not a drag of the rail. */
const DRAG_THRESHOLD_PX = 5;

export default function CompanyExplorer() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyExplorerTile[] | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  /* Whether to DRAW the Manage control. The server re-checks on every write. */
  const [canManage, setCanManage] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);

  /**
   * How wide each edge fade should be, from where the rail actually is.
   *
   * Written straight onto the element as custom properties rather than held in
   * React state: this runs on every scroll frame, and a setState per frame
   * would re-render the whole strip for a purely visual change. Nothing here
   * moves the rail — it only reads `scrollLeft`.
   */
  const syncEdges = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    /* Nothing overflows: no fade at all, or the rail would look scrollable
       when it is not. */
    const room = max > 1;
    const left = room && el.scrollLeft > 1;
    const right = room && el.scrollLeft < max - 1;
    el.style.setProperty('--ce-fade-l', left ? FADE : '0px');
    el.style.setProperty('--ce-fade-r', right ? FADE : '0px');
  }, []);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    syncEdges();
    /* Passive: this listener only measures, so it must never delay a scroll. */
    el.addEventListener('scroll', syncEdges, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncEdges) : null;
    ro?.observe(el);
    window.addEventListener('resize', syncEdges);
    return () => {
      el.removeEventListener('scroll', syncEdges);
      ro?.disconnect();
      window.removeEventListener('resize', syncEdges);
    };
  }, [syncEdges, companies]);

  /**
   * Click-and-drag, MOUSE ONLY.
   *
   * Touch is deliberately left to the browser: the rail already has
   * `touch-action: pan-x`, and native panning is smoother than anything
   * reproduced from pointermove — and it keeps a vertical swipe scrolling the
   * page, which a JS drag would have to re-implement and would get wrong.
   *
   * A drag is not a click. Movement under the threshold stays a click and the
   * tile navigates as before; past it, the pointer is captured, the rail
   * follows, and the click that the browser fires afterwards is swallowed once
   * so a drag that happens to end over a tile does not navigate.
   */
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: false });

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = railRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    drag.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const el = railRef.current;
    if (!el) return;
    const dx = e.clientX - d.startX;
    if (!d.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      d.moved = true;
      el.classList.add('ce-dragging');
      /* Capture only once it IS a drag, so a plain click is never stolen. */
      try { el.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
    }
    /* Assigned directly — same no-latency rule as the wheel handler. */
    el.scrollLeft = d.startLeft - dx;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const el = railRef.current;
    if (el) {
      el.classList.remove('ce-dragging');
      try { el.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    }
    d.active = false;
    /* `moved` is intentionally left set — the click handler below reads it. */
  };

  /* Fires before the tile's own onClick, in the capture phase. */
  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drag.current.moved) return;
    drag.current.moved = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/company-explorer', { cache: 'no-store' });
      if (!res.ok) { setCompanies([]); return; }
      const body = await res.json().catch(() => null);
      setCompanies(Array.isArray(body?.companies) ? body.companies : []);
      setCanManage(body?.canManage === true);
    } catch { setCompanies([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* The cursor IS the control. A wheel gesture over the rail scrolls it
     sideways; anywhere else on the page it does nothing here.

     Registered by hand rather than with onWheel because React attaches wheel
     listeners as PASSIVE, and a passive listener may not call preventDefault —
     without which the page would scroll vertically at the same time as the rail
     moved sideways. */
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      /* A genuinely horizontal gesture (trackpad swipe, tilt wheel) is already
         doing the right thing natively. Leave it entirely alone. */
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;

      /* deltaMode 1 is lines and 2 is pages; both need converting to pixels or
         a line-reporting mouse would crawl. */
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1;
      const delta = e.deltaY * unit;
      if (!delta) return;

      /* Can the rail still move the way the gesture is pushing? The 1px
         tolerance is because fractional device-pixel widths never land exactly
         on scrollWidth. */
      const max = el.scrollWidth - el.clientWidth;
      const room = delta > 0 ? el.scrollLeft < max - 1 : el.scrollLeft > 1;
      /* At the end, the gesture belongs to the page. Not preventing here is what
         stops the rail from swallowing the scroll and trapping the reader. */
      if (!room) return;

      e.preventDefault();
      /* Assigned, not animated — this is the whole of the "no latency" claim. */
      el.scrollLeft = Math.max(0, Math.min(max, el.scrollLeft + delta));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [companies]);

  /* Nothing configured and nothing live — render nothing rather than an empty
     rail. */
  if (companies !== null && companies.length === 0) return null;

  return (
    <div className="w-full min-w-0">
      <div className="mb-1 flex items-center justify-between gap-3 px-2 sm:px-3">
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            {/* 0.28 measured 2.4:1 against the page — a heading nobody could
                read, over a strip whose whole job is to be noticed. This is
                still quiet; it is just above the floor rather than below it. */}
            <span className="hp-sec text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: 'rgba(255,255,255,0.52)' }}>
              Top Company
            </span>
          </div>
        </div>

        {canManage && (
          <button type="button" onClick={() => setManageOpen(true)}
            className="shrink-0 rounded-full px-3 text-[11.5px] font-bold transition"
            style={{ height: 30, color: 'rgba(255,255,255,0.62)',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            Manage
          </button>
        )}
      </div>
<div className="ce-rail-wrap relative left-1/2 w-screen min-w-0 -translate-x-1/2">
        {/* No arrow buttons. The rail is scrolled by the cursor — see the
            wheel handler above — so there is no control to render, and none to
            leave present-but-dead at either end.

            The rail carries the SAME px-2 sm:px-3 inset as the header row, so
            the first tile starts on the same vertical line as the "Company
            Explorer" label instead of 12px to its left. It is padding on the
            scroll container rather than a margin on the first tile: padding
            belongs to the scrollable box, so tiles still travel edge to edge
            and pass under the fade, whereas a margin would leave a permanent
            gap that scrolls away with the content. */}
        <div
          ref={railRef}
          className="ce-rail flex w-full min-w-0 items-stretch gap-2 px-2 sm:gap-2.5 sm:px-3"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={onClickCapture}
        >
          {companies === null
            ? Array.from({ length: 7 }).map((_, i) => (
                <div key={i} aria-hidden
                  className="h-[64px] w-[224px] shrink-0 animate-pulse rounded-[16px] sm:w-[248px]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} />
              ))
            : companies.map((c) => (
                /* ── Horizontal ──
                   The mark on the left, the name and the count stacked beside
                   it. The tile used to be a 92px column with the name wrapped
                   to two lines under the logo, which truncated most real
                   company names and made every tile the same shape regardless
                   of what was in it. Reading left to right gives the name most
                   of the width, so it fits on one line, and the whole strip
                   scans as a list rather than as a row of stamps. */
                <button
                  key={c.id}
                  type="button"
                  onClick={() => router.push(companyJobsHref(c.id))}
                  aria-label={`${c.name}, ${formatCompanyJobCount(c.jobCount)}`}
                  className="ce-tile group flex w-[224px] shrink-0 items-center gap-2.5 rounded-[16px] px-2.5 py-2.5 text-left transition sm:w-[248px]"
                >
                  {/* One component everywhere: white plate, no filter, and a
                      broken URL degrades to initials instead of a broken icon. */}
                  <CompanyLogo name={c.name} logoUrl={c.logoUrl} size={40} rounded={12} />
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                    <span className="ce-name w-full truncate text-[12.5px] font-semibold leading-tight">
                      {c.name}
                    </span>
                    {/* The count is the reason to click a tile, so it is the
                        brightest thing on it after the mark itself. Same violet
                        the header's BETA badge uses — an accent already in this
                        strip, not a new colour. */}
                    <span className="ce-count rounded-full px-1.5 py-[1px] text-[9.5px] font-extrabold tabular-nums">
                      {formatCompanyJobCount(c.jobCount)}
                    </span>
                  </span>
                </button>
              ))}
        </div>
      </div>

      {canManage && manageOpen && (
        <CompanyExplorerManageModal onClose={() => setManageOpen(false)} onSaved={load} />
      )}
    </div>
  );
}

/** The strip's empty-state icon, exported so the admin screen can reuse it. */
export { Building2 as CompanyExplorerIcon };
