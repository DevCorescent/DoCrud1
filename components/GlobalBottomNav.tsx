'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  Globe,
  Home,
  MessageSquare,
  Users,
} from 'lucide-react';
import TyraiMark from '@/components/ai-mode/TyraiMark';

/* Loaded when it is first opened, not with the bar. TYRAI brings the search
   surface, the result cards and the follow-up model with it, and the bar is
   on every page on a phone. */
const AiMode = dynamic(() => import('@/components/ai-mode/AiMode'), { ssr: false });

/* ── Pages where the nav is hidden ──────────────────────────────── */
const EXCLUDED = [
  '/workspace', '/documents', '/sign', '/pdf-studio',
  '/doc-word', '/form-builder', '/onboarding',
  /* The job-posting wizard, for the same reason as '/onboarding': it is a
     focused step-by-step flow whose own Back/Continue bar is pinned to the
     bottom of the viewport on phones. This bar is `bottom: 18px` at
     z-index 9995, so it sat on top of Continue and hid the only way forward.
     Note this is '/jobs/post', not '/jobs' — the Jobs feed keeps its nav. */
  '/jobs/post',
];
function shouldShow(path: string) {
  return !EXCLUDED.some(p => path.startsWith(p));
}

export default function GlobalBottomNav() {
  const pathname  = usePathname() ?? '/';
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(true);
  const [inChat,  setInChat]  = useState(false);
  /* Unread badge count, from the endpoint the app already exposes. */
  const [unread, setUnread] = useState(0);
  /* TYRAI, from the bar. The overlay is a portal of its own, so it can be
     opened from here on any page rather than only from the homepage nav. */
  const [tyraiOpen, setTyraiOpen] = useState(false);
  const lastY     = useRef(0);
  const ticking   = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  /* Navigating away closes TYRAI — otherwise it would still be over the page
     you arrived at. */
  useEffect(() => { setTyraiOpen(false); }, [pathname]);


  /* ── scroll-hide / scroll-show ──
     Works for the window scroller on normal pages and for internal scrollers
     (the /messages chat list, its conversation list, the mobile drawer).
     Each scroller keeps its own last position — a single shared value would
     mix the chat list's scrollTop with window.scrollY and flip the bar at
     random whenever focus moved between them. */
  useEffect(() => {
    const THRESHOLD = 6;                       // ignore sub-pixel / jitter scrolls
    const WINDOW_KEY = document.documentElement;
    const lastTops = new WeakMap<Element, number>();
    // Seed the window baseline now, so the very first page scroll is measured
    // rather than being spent establishing a baseline. Internal scrollers have
    // no knowable start position, so they baseline on their first event.
    lastTops.set(WINDOW_KEY, window.scrollY);
    let pending: { key: Element; top: number } | null = null;

    // Text fields scroll internally once their content overflows. Typing in
    // the composer must not read as list scrolling.
    const isTextField = (el: HTMLElement) =>
      el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable;

    const handleScroll = (event: Event) => {
      const target = event.target;
      let key: Element;
      let top: number;

      if (
        target === document ||
        target === document.documentElement ||
        target === document.body ||
        target === window ||
        !(target instanceof HTMLElement)
      ) {
        key = WINDOW_KEY;
        top = window.scrollY;
      } else {
        if (isTextField(target)) return;
        // Purely horizontal rails (and non-scrollable nodes) never move the bar.
        if (target.scrollHeight - target.clientHeight <= 0) return;
        key = target;
        top = target.scrollTop;
      }

      // Always keep the newest position; coalesce to one read per frame.
      pending = { key, top };
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        ticking.current = false;
        const p = pending;
        pending = null;
        if (!p) return;

        const prev = lastTops.get(p.key);
        if (prev === undefined) { lastTops.set(p.key, p.top); return; }  // first sample = baseline

        const diff = p.top - prev;
        if (Math.abs(diff) <= THRESHOLD) return;   // keep baseline so small moves accumulate

        lastTops.set(p.key, p.top);
        lastY.current = p.top;
        setVisible(diff < 0 || p.top <= 0);        // down → hide, up (or at top) → show
      });
    };

    // Capture phase catches nested scrollers, whose scroll events do not bubble.
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    // Belt-and-braces for the window scroller on normal pages.
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      document.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  /* Every route starts with the bar visible. */
  useEffect(() => { setVisible(true); }, [pathname]);

  /* Unread count, refreshed whenever the route changes — so opening a
     conversation and coming back reflects what was just read. Signed-out
     callers get 0 from the endpoint, so no auth branch is needed here. */
  useEffect(() => {
    let cancelled = false;
    fetch('/api/messages/unread', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { unread?: number } | null) => {
        if (!cancelled && typeof d?.unread === 'number') setUnread(d.unread);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);

  /* ── Hide entirely inside an open conversation ──
     The chat screen owns the bottom of the viewport with its own composer,
     so the floating bar would sit on top of it. The messages scroll area
     ([data-ns] inside .msgs-root) is rendered only while a conversation is
     open, which makes it an exact signal — and keeps this change confined to
     the nav, with no edits to the messages page. */
  useEffect(() => {
    if (!pathname.startsWith('/messages')) { setInChat(false); return; }

    let raf = 0;
    const check = () => {
      const open = !!document.querySelector('.msgs-root [data-ns]');
      setInChat(prev => (prev === open ? prev : open));
    };
    check();

    const observer = new MutationObserver(() => {
      if (raf) return;                       // one check per frame, at most
      raf = requestAnimationFrame(() => { raf = 0; check(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => { observer.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [pathname]);

  /* Leaving a conversation always restores the bar, whatever the scroll left it as. */
  useEffect(() => { if (!inChat) setVisible(true); }, [inChat]);

  if (!mounted || !shouldShow(pathname) || inChat) return null;

  const nav = (
    <>
      <style>{`
        @media (min-width: 640px) { .gnb-bar { display: none !important; } }

       
/* ── The bar ──
   Edge to edge along the bottom, not a pill floating above it. A floating
   capsule leaves a strip of page visible underneath and to either side, which
   on a phone reads as something that has come loose; a bar that meets the
   bezels reads as part of the device. It also gives the five items the whole
   width instead of 380px of it.

   The safe-area inset is padding rather than an offset, so on a phone with a
   home indicator the glass runs under it and the icons sit above it. */
.gnb-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  transform: translateY(0);
  z-index: 9995;
  /* TALLER THAN IT LOOKS, on purpose. The bar's controls still occupy 62px at
     the bottom; the extra 30px above them is a fade zone where the glass
     dissolves into the page, so there is no edge anywhere.

     It is part of the SAME element rather than a pseudo-element on top,
     because backdrop-filter does not nest: a filtered child inside a filtered
     parent renders as a grey rectangle in Chromium. One element means one
     filter, and the blur then covers the fade zone too — which is what makes
     the dissolve smoky rather than just transparent. */
  /* 14px, not 30. At 30 the ramp was long enough to lie over a whole card row
     — the dissolve stopped reading as the bar ending and started reading as
     fog on the page. This is enough to kill the edge and short enough that
     what is above the bar stays crisp. */
  --gnb-fade: 14px;
  /* 52px of controls, not 62.
     The height came out of the ITEM, not out of the type: the icon box went
     28px to 24px, the gaps and padding tightened, and the label stayed at
     10.5px because the file already records why — 9px was too small to read
     at arm's length and too small to pass AA, and it cost 2px of bar height to
     fix. Shaving the label would undo that for the sake of two pixels.
     52 + 14 = 66px total, against 92 before. The item is still 52px tall,
     which clears the 44px tap target. */
  height: calc(52px + var(--gnb-fade) + env(safe-area-inset-bottom, 0px));
  padding-top: var(--gnb-fade);
  padding-bottom: env(safe-area-inset-bottom, 0px);

  /* Thinner than the pill was: the pill sat on the page, this sits over the
     content scrolling beneath it and should show it. */
  --gnb-ink: rgba(255, 255, 255, .58);
  --gnb-hair: rgba(255, 255, 255, .09);

  /* Nothing at the very top, full strength by the time the icons begin. The
     stop at 34% is the fade zone's own height as a share of the box, so the
     ramp finishes exactly where the controls start. */
  background:
    linear-gradient(180deg,
      rgba(10, 10, 12, 0) 0%,
      rgba(10, 10, 12, .20) 11%,
      rgba(10, 10, 12, .38) 21%,
      rgba(10, 10, 12, .40) 100%),
    linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.05) 30%, rgba(255,255,255,0.015) 100%);
  /* 40px, not 28. A thin material works by blurring enough that the content
     behind it stops being legible as content and becomes a wash — which is what
     lets the glass be transparent without the labels having to fight a card
     scrolling underneath. See the light values below for the measurement that
     decides how far the transparency can go. */
  backdrop-filter: blur(40px) saturate(190%);
  -webkit-backdrop-filter: blur(40px) saturate(190%);

  /* NO BORDER AND NO SPECULAR LINE. Both were hard 1px edges across the full
     width — the two things that made this read as a slab bolted to the bottom
     of the screen. The fade above replaces them: the material simply stops
     being there. The drop shadow goes too, since a shadow cast upward from an
     edge that no longer exists just draws that edge back in. */
  border-top: 0;
  border-radius: 0;

  display: flex;
  align-items: stretch;
  /* The controls belong in the 62px below the fade, not spread over the whole
     taller box. */
  box-sizing: border-box;

  /* THE FADE ZONE MUST NOT SWALLOW TAPS. Growing the bar by 30px grew its hit
     area by 30px too, and a probe found elementFromPoint returning the bar
     across that whole band — a strip above the nav where the page could be
     seen but not touched. So the bar itself takes no pointer events and its
     items take them back; the items fill the lower 62px, which is exactly the
     part that should be tappable. */
  pointer-events: none;

  opacity: 1;

  transition:
    transform 360ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 260ms ease;

  will-change: transform, opacity;
}

.gnb-bar.gnb-hidden {
  opacity: 0;
  transform: translateY(100%);
  pointer-events: none;
}

/* ── LIGHT GLASS WHERE THE PAGE IS LIGHT ──
   The bar was a dark glass slab on every route. On the five pages built around
   DiscoverShell — home, jobs, talent, companies, feed — the ground is #f6f7fa,
   so a 62%-black panel blurred over it painted a grey slab with grey labels:
   the one piece of chrome on a phone that did not belong to the page under it.

   KEYED ON THE SHELL, NOT ON data-ui-mode. The obvious discriminator turns out
   to be the wrong one: the document runs with data-ui-mode="dark" while those
   pages paint light, so theming off it made the bar dark exactly where the
   problem was. ":root:has(.dh)" asks the question that actually matters — is
   the page under this bar the light shell — and it leaves every route I have
   not looked at exactly as it was.

   THE WHITE IS HIGH ENOUGH TO BE READ OVER ANYTHING IN THAT SHELL. A bar at
   74% white over a dark card composites to about #bdbdbd, and 10px text on
   that misses AA; at .93 → .87 the worst backdrop still leaves the ink above
   4.5:1, which is measured from real pixels in nav-bottom.js rather than
   assumed. */
:root:has(.dh) .gnb-bar {
  --gnb-ink: #3f3f45;
  --gnb-hair: rgba(20, 20, 28, .08);
  /* MEASURED, not chosen. At .93 white this was barely glass; the blur above
     now flattens the backdrop enough to come down to .78 → .66, and the real
     painted pixels behind every label were sampled at that value to confirm the
     10.5px text still clears 4.5:1 on each route the bar appears on
     (nav-bottom.js). Any lower and the ink is what has to change, not the
     assertion.

     THE PASTEL SITS OVER THE WHITE, NOT UNDER IT. The page's ground is a smoky
     white with a pastel wash drifting corner to corner, and the bar is the one
     piece of chrome laid across the bottom of it — so it carries the same three
     hues, in the same order left to right, and the page reads as continuing
     underneath rather than stopping at a white strip.

     Every centre is BELOW the bar (at 118%–140% of its height), for the same
     reason the page's are outside the frame: a 62px-tall bar is shorter than
     any gradient's centre needs, and a visible centre in it would read as a
     glow behind one tab. What shows is the tail. */
  background:
    /* THE FADE. A white ramp above everything else, opaque nowhere at the top
       and gone by the time the icons begin, so the whole stack below it is
       revealed gradually rather than starting at an edge. The alpha stops are
       what the labels depend on, so they are measured, not chosen: the ramp
       reaches full strength at 34% — the fade zone's share of the taller box —
       which is exactly where the controls start. */
    linear-gradient(180deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, .28) 10%,
      rgba(255, 255, 255, .60) 21%,
      rgba(255, 255, 255, .62) 46%,
      rgba(255, 255, 255, .56) 100%),
    radial-gradient(150% 320% at 6% 138%, rgba(206, 220, 255, .58) 0%, rgba(206, 220, 255, 0) 72%),
    radial-gradient(140% 300% at 52% 142%, rgba(255, 216, 231, .40) 0%, rgba(255, 216, 231, 0) 70%),
    radial-gradient(150% 320% at 97% 134%, rgba(201, 241, 227, .50) 0%, rgba(201, 241, 227, 0) 72%),
    linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.3) 21%, rgba(255,255,255,0.26) 100%);
  /* No shadow and no specular. Both drew the edge this change exists to
     remove — an upward shadow is a hard line's own halo. */
  box-shadow: none;
}

/* ── The cloud in the glass ──
   The wash above gives the bar its hue; this gives it its TEXTURE. Without it
   the bar is a clean gradient and the page behind it is weather, and the join
   between the two is visible as a straight edge of smoothness.

   The same three turbulence layers the page's ground uses, at the same
   frequencies — one stretched instance each, never tiled, because
   feTurbulence does not tile seamlessly and a 62px bar would show the wrap as
   a vertical seam between two tabs.

   NOT a nested backdrop-filter. The bar already has one, and a second one on
   a child inside it renders as a grey rectangle in Chromium; this is a plain
   background image over the bar's own surface, which composites normally.

   The cloud is at z-index 0 and the items at 1, so it is under the labels
   rather than over them. */
:root:has(.dh) .gnb-bar::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-radius: inherit;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='900'%3E%3Cfilter id='a'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.0019' numOctaves='5' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0.55 0 0 0 0 0.56 0 0 0 0 0.6 0 0 0 -1.05 0.74'/%3E%3C/filter%3E%3Crect width='900' height='900' filter='url(%23a)'/%3E%3C/svg%3E"),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='800'%3E%3Cfilter id='c'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.0031' numOctaves='5' seed='41'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -1.1 0.82'/%3E%3C/filter%3E%3Crect width='800' height='800' filter='url(%23c)'/%3E%3C/svg%3E");
  /* Lower than the page's .62: the bar is 62px tall, so the same turbulence is
     cropped to a sliver of itself and reads as noise rather than as cloud if
     it is allowed to be as strong. */
  /* .5, not .34. This is the layer the bar is supposed to read as — the flat
     white above it only exists to carry the labels — and at .34 the texture
     was faint enough that what showed was the white, which looks like milk
     rather than cloud. */
  opacity: .5;
  mix-blend-mode: normal;
  /* MASKED to match the fade. Without this the cloud kept its own straight top
     edge inside the fade zone — the texture stopped in a hard line exactly
     where the colour had been made to dissolve, which is worse than the border
     that was removed, because it looks like a rendering fault rather than a
     decision. */
  -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, .55) 12%, #000 22%);
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, .55) 12%, #000 22%);
}

/* The items have to be told they are above it. */
:root:has(.dh) .gnb-bar > * { position: relative; z-index: 1; }

/* ── One tint per destination, in the stylesheet ──
   These were five hardcoded hex values inside the component, set as an inline
   style attribute — which is why the bar could not be themed at all: an inline
   colour beats every rule a stylesheet can write. Now the item says WHICH tint
   it is and the theme says what that tint looks like.

   The light values are darker than the dark ones on purpose. #a78bfa on a
   near-white bar is 2.3:1, so the pastel that reads as "active" on black is
   illegible on white; each one is stepped down until it clears 4.5:1 against
   the bar's own painted surface. */
.gnb-item[data-key='home'],
.gnb-item[data-key='tyrai']    { --gnb-tint: #a78bfa; --gnb-wash: rgba(167, 139, 250, .18); }
.gnb-item[data-key='feed']     { --gnb-tint: #22d3ee; --gnb-wash: rgba(34, 211, 238, .16); }
.gnb-item[data-key='people']   { --gnb-tint: #4ade80; --gnb-wash: rgba(74, 222, 128, .16); }
.gnb-item[data-key='messages'] { --gnb-tint: #818cf8; --gnb-wash: rgba(129, 140, 248, .18); }

/* The light values are darker than the dark ones on purpose. #a78bfa on a
   near-white bar is 2.3:1, so the pastel that reads as "active" on black is
   illegible on white; each one is stepped down until it clears 4.5:1 against
   the bar's own painted surface.

   RE-MEASURED when the pastel wash and the cloud went into the bar, against
   the darkest pixel the bar now paints — rgb(208,210,228), sampled per route
   with the items hidden. Three of the four survived it unchanged (violet 4.74,
   green 4.76, indigo 5.28) and the cyan did not: #0e7490 came out at 3.58
   there and 4.32 behind its own label on /published, where Feed is the active
   item and sits in the periwinkle end of the wash. It is one step darker now,
   at 5.19 against that same worst pixel — margin, because which hue a given
   tab sits over depends on the width of the phone. */
:root:has(.dh) .gnb-item[data-key='home'],
:root:has(.dh) .gnb-item[data-key='tyrai']    { --gnb-tint: #6d28d9; --gnb-wash: rgba(109, 40, 217, .12); }
:root:has(.dh) .gnb-item[data-key='feed']     { --gnb-tint: #0b5a6e; --gnb-wash: rgba(11, 90, 110, .12); }
:root:has(.dh) .gnb-item[data-key='people']   { --gnb-tint: #166534; --gnb-wash: rgba(22, 101, 52, .12); }
:root:has(.dh) .gnb-item[data-key='messages'] { --gnb-tint: #4338ca; --gnb-wash: rgba(67, 56, 202, .12); }

        .gnb-item {
          /* Taken back from the bar, which disowns them so its fade zone does
             not intercept the page underneath. */
          pointer-events: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          flex: 1;
          height: 100%;
          padding: 6px 4px 5px;
          cursor: pointer;
          text-decoration: none;
          -webkit-tap-highlight-color: transparent;
          background: none;
          border: none;
          transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1), opacity 0.14s ease;
          outline: none;
          border-radius: 20px;
        }
        .gnb-item:active { transform: scale(0.84); opacity: 0.65; }
        .gnb-item:focus-visible { outline: 2px solid var(--gnb-tint); outline-offset: -2px; }

        /* The item owns its colour; the icon and the label inherit it. That is
           what makes one rule per theme enough. */
        .gnb-item { color: var(--gnb-ink); }
        .gnb-item[data-on='1'] { color: var(--gnb-tint); }

        .gnb-icon {
          position: relative;
          width: 24px; height: 24px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px;
          color: inherit;
          background: transparent;
          transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
        }
        .gnb-item[data-on='1'] .gnb-icon { background: var(--gnb-wash); }
        .gnb-item:active .gnb-icon { transform: scale(0.88); }

        .gnb-label {
          /* 9px was too small to be read at arm's length and too small to pass
             AA comfortably. 10.5px costs 2px of bar height and buys both. */
          font-size: 10.5px;
          font-weight: 550;
          letter-spacing: 0.005em;
          white-space: nowrap;
          line-height: 1;
          color: inherit;
          transition: color 0.14s ease;
        }

        /* Unread pill, pinned to the icon. The icon box is the positioning
           context, so the badge rides with it on every breakpoint. */
        .gnb-badge {
          position: absolute;
          top: -3px;
          left: 50%;
          transform: translateX(4px);
          min-width: 14px;
          height: 14px;
          padding: 0 3px;
          border-radius: 999px;
          background: #f43f5e;
          color: #fff;
          font-size: 9px;
          font-weight: 700;
          line-height: 14px;
          text-align: center;
          pointer-events: none;
        }
        /* The marker under the active item. A lozenge rather than a 3px dot:
           at 3px it was indistinguishable from a rendering artefact. */
        .gnb-dot {
          width: 14px; height: 2px;
          border-radius: 999px;
          margin-top: 1.5px;
          background: var(--gnb-tint);
          opacity: 0;
          transition: opacity 0.16s ease, width 0.16s ease;
        }
        .gnb-item[data-on='1'] .gnb-dot { opacity: 1; }

        /* ── TYRAI ────────────────────────────────────────────────────
           The centre control is distinguished by SHAPE, not colour: the same
           icon box the other items use, with a hairline border around it. It
           is the one item here that opens something rather than going
           somewhere, and the border is what says so. */
        .gnb-tyrai-icon {
          border: 1px solid var(--gnb-hair);
          background: rgba(255, 255, 255, .05);
          color: inherit;
        }
        .gnb-tyrai:active .gnb-tyrai-icon,
        .gnb-tyrai[aria-expanded="true"] .gnb-tyrai-icon {
          border-color: transparent;
          background: var(--gnb-wash);
          color: var(--gnb-tint);
        }
        :root:has(.dh) .gnb-tyrai-icon {
          background: linear-gradient(150deg, rgba(109, 40, 217, .09), rgba(14, 116, 144, .07));
        }
        .gnb-tyrai-mark { width: 18px; height: 18px; }

        /* The Explore panel that used to live here — a sheet of destination
           links above the bar — is gone with the button that opened it. The
           same destinations are still listed in lib/explore-destinations.ts
           and reachable from the pages that link to them. */

        @media (prefers-reduced-motion: reduce) {
          .gnb-tyrai-icon { transition: none; }
        }
      `}</style>

      <nav className={`gnb-bar${visible ? '' : ' gnb-hidden'}`} role="navigation" aria-label="Main navigation">

        {/* Home */}
        {(() => {
          const active = pathname === '/';
          return (
            <a href="/" className="gnb-item" data-key="home" data-on={active ? '1' : '0'} aria-label="Home" aria-current={active ? 'page' : undefined}>
              <span className="gnb-icon">
                <Home width={19} height={19} />
              </span>
              <span className="gnb-label">Home</span>
              <span className="gnb-dot" />
            </a>
          );
        })()}

        {/* Feed */}
        {(() => {
          const active = pathname.startsWith('/published');
          return (
            <a href="/published" className="gnb-item" data-key="feed" data-on={active ? '1' : '0'} aria-label="Feed" aria-current={active ? 'page' : undefined}>
              <span className="gnb-icon">
                <Globe width={19} height={19} />
              </span>
              <span className="gnb-label">Feed</span>
              <span className="gnb-dot" />
            </a>
          );
        })()}

        {/* TYRAI — a button, not a link: it opens the overlay over whatever
            page you are on rather than navigating away from it. In the centre,
            because it is the one thing here that is not a destination. */}
        <button
          type="button"
          className="gnb-item gnb-tyrai"
          data-key="tyrai"
          data-on={tyraiOpen ? '1' : '0'}
          onClick={() => setTyraiOpen(true)}
          aria-label="TYRAI — tell your requirements in a sentence"
          aria-expanded={tyraiOpen}
        >
          <span className={`gnb-icon gnb-tyrai-icon${tyraiOpen ? ' is-open' : ''}`}>
            <TyraiMark className="gnb-tyrai-mark" strokeWidth={1.8} />
          </span>
          <span className="gnb-label">TYRAI</span>
          <span className="gnb-dot" />
        </button>

        {/* People */}
        {(() => {
          const active = pathname.startsWith('/people');
          return (
            <a href="/people" className="gnb-item" data-key="people" data-on={active ? '1' : '0'} aria-label="People" aria-current={active ? 'page' : undefined}>
              <span className="gnb-icon">
                <Users width={19} height={19} />
              </span>
              <span className="gnb-label">People</span>
              <span className="gnb-dot" />
            </a>
          );
        })()}

        {/* Messages — the existing /messages chat list, with live unread count */}
        {(() => {
          const active = pathname.startsWith('/messages');
          const label  = unread > 0
            ? `Messages, ${unread} unread`
            : 'Messages';
          return (
            <a
              href="/messages"
              className="gnb-item"
              data-key="messages"
              data-on={active ? '1' : '0'}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              <span className="gnb-icon">
                <MessageSquare width={19} height={19} />
                {unread > 0 && (
                  <span className="gnb-badge" aria-hidden="true">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
              <span className="gnb-label">Messages</span>
              <span className="gnb-dot" />
            </a>
          );
        })()}

      </nav>

      {/* Only once it has been asked for. */}
      {tyraiOpen && <AiMode open onClose={() => setTyraiOpen(false)} />}
    </>
  );

  return createPortal(nav, document.body);
}