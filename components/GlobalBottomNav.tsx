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
  height: calc(60px + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);

  /* Thinner than the pill was: the pill sat on the page, this sits over the
     content scrolling beneath it and should show it. */
  background:
    linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.012) 100%),
    rgba(10, 10, 12, 0.62);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);

  border-top: 1px solid rgba(255,255,255,0.09);
  border-radius: 0;

  box-shadow:
    0 -8px 32px rgba(0,0,0,0.45),
    inset 0 1px 0 rgba(255,255,255,0.07);

  display: flex;
  align-items: stretch;

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

        .gnb-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          flex: 1;
          height: 100%;
          padding: 9px 4px 7px;
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
        .gnb-item:focus-visible { outline: 2px solid #a78bfa; outline-offset: -2px; }

        .gnb-icon {
          position: relative;
          width: 26px; height: 26px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 10px;
          transition: background 0.16s ease, color 0.16s ease, transform 0.16s ease;
        }
        .gnb-item:active .gnb-icon { transform: scale(0.88); }

        .gnb-label {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.01em;
          white-space: nowrap;
          line-height: 1;
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
        .gnb-dot {
          width: 3px; height: 3px;
          border-radius: 50%;
          margin-top: 1px;
          transition: opacity 0.14s ease, background 0.14s ease;
        }

        /* ── TYRAI ────────────────────────────────────────────────────
           The centre control is distinguished by SHAPE, not colour: the same
           icon box the other items use, with a hairline border around it. It
           is the one item here that opens something rather than going
           somewhere, and the border is what says so. */
        .gnb-tyrai-icon {
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.62);
        }
        .gnb-tyrai:active .gnb-tyrai-icon,
        .gnb-tyrai[aria-expanded="true"] .gnb-tyrai-icon {
          border-color: rgba(167,139,250,0.40);
          background: rgba(167,139,250,0.16);
          color: #a78bfa;
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
          const color  = active ? '#a78bfa' : 'rgba(255,255,255,0.50)';
          return (
            <a href="/" className="gnb-item" aria-label="Home" aria-current={active ? 'page' : undefined}>
              <span className="gnb-icon" style={{ color, background: active ? 'rgba(167,139,250,0.18)' : 'transparent' }}>
                <Home width={19} height={19} />
              </span>
              <span className="gnb-label" style={{ color }}>Home</span>
              <span className="gnb-dot" style={{ opacity: active ? 1 : 0, background: '#a78bfa' }} />
            </a>
          );
        })()}

        {/* Feed */}
        {(() => {
          const active = pathname.startsWith('/published');
          const color  = active ? '#22d3ee' : 'rgba(255,255,255,0.50)';
          return (
            <a href="/published" className="gnb-item" aria-label="Feed" aria-current={active ? 'page' : undefined}>
              <span className="gnb-icon" style={{ color, background: active ? 'rgba(34,211,238,0.16)' : 'transparent' }}>
                <Globe width={19} height={19} />
              </span>
              <span className="gnb-label" style={{ color }}>Feed</span>
              <span className="gnb-dot" style={{ opacity: active ? 1 : 0, background: '#22d3ee' }} />
            </a>
          );
        })()}

        {/* TYRAI — a button, not a link: it opens the overlay over whatever
            page you are on rather than navigating away from it. In the centre,
            because it is the one thing here that is not a destination. */}
        <button
          type="button"
          className="gnb-item gnb-tyrai"
          onClick={() => setTyraiOpen(true)}
          aria-label="TYRAI — tell your requirements in a sentence"
          aria-expanded={tyraiOpen}
        >
          <span className={`gnb-icon gnb-tyrai-icon${tyraiOpen ? ' is-open' : ''}`}>
            <TyraiMark className="gnb-tyrai-mark" strokeWidth={1.8} />
          </span>
          <span className="gnb-label" style={{ color: tyraiOpen ? '#a78bfa' : 'rgba(255,255,255,0.50)' }}>
            TYRAI
          </span>
          <span className="gnb-dot" style={{ opacity: tyraiOpen ? 1 : 0, background: '#a78bfa' }} />
        </button>

        {/* People */}
        {(() => {
          const active = pathname.startsWith('/people');
          const color  = active ? '#4ade80' : 'rgba(255,255,255,0.50)';
          return (
            <a href="/people" className="gnb-item" aria-label="People" aria-current={active ? 'page' : undefined}>
              <span className="gnb-icon" style={{ color, background: active ? 'rgba(74,222,128,0.16)' : 'transparent' }}>
                <Users width={19} height={19} />
              </span>
              <span className="gnb-label" style={{ color }}>People</span>
              <span className="gnb-dot" style={{ opacity: active ? 1 : 0, background: '#4ade80' }} />
            </a>
          );
        })()}

        {/* Messages — the existing /messages chat list, with live unread count */}
        {(() => {
          const active = pathname.startsWith('/messages');
          const color  = active ? '#818cf8' : 'rgba(255,255,255,0.50)';
          const label  = unread > 0
            ? `Messages, ${unread} unread`
            : 'Messages';
          return (
            <a
              href="/messages"
              className="gnb-item"
              aria-label={label}
              aria-current={active ? 'page' : undefined}
            >
              <span className="gnb-icon" style={{ color, background: active ? 'rgba(129,140,248,0.18)' : 'transparent' }}>
                <MessageSquare width={19} height={19} />
                {unread > 0 && (
                  <span className="gnb-badge" aria-hidden="true">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
              <span className="gnb-label" style={{ color }}>Messages</span>
              <span className="gnb-dot" style={{ opacity: active ? 1 : 0, background: '#818cf8' }} />
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