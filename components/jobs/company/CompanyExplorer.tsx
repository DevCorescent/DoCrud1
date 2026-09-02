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

export default function CompanyExplorer() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyExplorerTile[] | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  /* Whether to DRAW the Manage control. The server re-checks on every write. */
  const [canManage, setCanManage] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);

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
    <div className="w-full min-w-0 px-2 sm:px-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2">
            <span className="hp-sec text-[11px] font-semibold tracking-[0.10em]"
              style={{ color: 'rgba(255,255,255,0.28)' }}>
              Company Explorer
            </span>
            <span className="rounded-full px-1.5 py-[2px] text-[8.5px] font-extrabold tracking-[0.10em]"
              style={{ color: 'rgb(167,139,250)', background: 'rgba(167,139,250,0.13)',
                border: '1px solid rgba(167,139,250,0.28)' }}>
              BETA
            </span>
          </div>
          <span className="mt-0.5 text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.30)' }}>
            Top companies hiring now on DoCrud
          </span>
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

      <div className="relative min-w-0">
        {/* No arrow buttons. The rail is scrolled by the cursor — see the
            wheel handler above — so there is no control to render, and none to
            leave present-but-dead at either end. */}
        <div
          ref={railRef}
          className="ce-rail flex min-w-0 items-stretch gap-2 sm:gap-2.5"
        >
          <style>{`
            .ce-rail{
              overflow-x:auto; overflow-y:hidden;
              touch-action:pan-x; overscroll-behavior-x:contain;
              -webkit-overflow-scrolling:touch;
              max-width:100%; padding-bottom:2px;
              /* Explicitly instant: an inherited scroll-behavior:smooth from a
                 global stylesheet would add exactly the lag this rail must not
                 have. */
              scroll-behavior:auto;
              scrollbar-width:none; -ms-overflow-style:none;
            }
            .ce-rail::-webkit-scrollbar{display:none}
          `}</style>

          {companies === null
            ? Array.from({ length: 7 }).map((_, i) => (
                <div key={i} aria-hidden
                  className="h-[86px] w-[92px] shrink-0 animate-pulse rounded-2xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }} />
              ))
            : companies.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => router.push(companyJobsHref(c.id))}
                  aria-label={`${c.name}, ${formatCompanyJobCount(c.jobCount)}`}
                  className="ce-tile flex w-[92px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2 py-2.5 text-center transition sm:w-[100px]"
                  style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  {/* One component everywhere: white plate, no filter, and a
                      broken URL degrades to initials instead of a broken icon. */}
                  <CompanyLogo name={c.name} logoUrl={c.logoUrl} size={38} rounded={11} />
                  <span className="line-clamp-2 text-[10.5px] font-semibold leading-tight"
                    style={{ color: 'rgba(255,255,255,0.70)' }}>
                    {c.name}
                  </span>
                  {/* The count is the reason to click a tile, so it is the
                      brightest thing on it after the mark itself. Same violet
                      the header's BETA badge uses — an accent already in this
                      strip, not a new colour. */}
                  <span className="rounded-full px-1.5 py-[1px] text-[9.5px] font-extrabold tabular-nums"
                    style={{ color: 'rgb(196,181,253)', background: 'rgba(167,139,250,0.14)',
                      border: '1px solid rgba(167,139,250,0.24)' }}>
                    {formatCompanyJobCount(c.jobCount)}
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
