'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import {
  ArrowUp,
  Globe,
  Home,
  MessageSquare,
  Users,
} from 'lucide-react';
import { BOTTOM_NAV_EXPLORE } from '@/lib/explore-destinations';

/* ── Pages where the nav is hidden ──────────────────────────────── */
const EXCLUDED = [
  '/workspace', '/documents', '/sign', '/pdf-studio',
  '/doc-word', '/form-builder', '/onboarding',
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
  /* Explore panel. Purely local UI state — opening it fetches nothing and
     renders nothing but the static destination list. */
  const [exploreOpen, setExploreOpen] = useState(false);
  const lastY     = useRef(0);
  const ticking   = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  /* Escape closes the panel. Bound only while it is open, so the app carries no
     idle key listener. */
  useEffect(() => {
    if (!exploreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExploreOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [exploreOpen]);

  /* Navigating away closes it — otherwise it would still be open on arrival. */
  useEffect(() => { setExploreOpen(false); }, [pathname]);


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

       
.gnb-bar {
  position: fixed;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%) translateY(0);
  width: calc(100% - 32px);
  max-width: 380px;
  z-index: 9995;
  height: 62px;

  background: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);

  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 24px;

  box-shadow:
    0 8px 32px rgba(0,0,0,0.55),
    0 2px 8px rgba(0,0,0,0.30),
    inset 0 1px 0 rgba(255,255,255,0.07);

  display: flex;
  align-items: center;

  opacity: 1;

  transition:
    transform 360ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 260ms ease;

  will-change: transform, opacity;
}

.gnb-bar.gnb-hidden {
  opacity: 0;
  transform: translateX(-50%) translateY(calc(100% + 24px));
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
          padding: 10px 4px 8px;
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

        /* ── Explore ──────────────────────────────────────────────────
           The centre control is distinguished by SHAPE, not colour: the same
           icon box the other items use, with a hairline border. */
        .gnb-explore-icon {
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.62);
        }
        .gnb-explore[aria-expanded="true"] .gnb-explore-icon {
          border-color: rgba(167,139,250,0.40);
          background: rgba(167,139,250,0.16);
          color: #a78bfa;
        }
        /* The arrow turns to point back down when the panel is open. */
        .gnb-explore-icon svg { transition: transform 0.22s cubic-bezier(0.22,1,0.36,1); }
        .gnb-explore-icon.is-open svg { transform: rotate(180deg); }

        /* Backdrop sits BELOW the bar and the panel, so both stay interactive.
           Opacity only — no blur, which would cost a full-screen filter pass. */
        .gnb-scrim {
          position: fixed;
          inset: 0;
          z-index: 998;
          background: rgba(0,0,0,0.42);
          opacity: 0;
          pointer-events: none;
          transition: opacity 220ms ease;
        }
        .gnb-scrim.is-open { opacity: 1; pointer-events: auto; }

        /* Panel: fixed, so opening it cannot reflow or shift the page. Height
           is capped at ~25vh and it animates on transform/opacity only. */
        .gnb-explore-panel {
          position: fixed;
          left: 50%;
          /* The bar is bottom:18px, height:62px — its top edge is at 80px.
             92px leaves a consistent 12px gap, and matching the bar's own
             (inset-free) positioning keeps the two aligned on every device. */
          bottom: 92px;
          z-index: 999;
          width: min(680px, calc(100vw - 24px));
          max-height: 25vh;
          overflow-y: auto;
          overscroll-behavior: contain;

          background: rgba(0,0,0,0.86);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 24px;
          box-shadow:
            0 8px 32px rgba(0,0,0,0.55),
            0 2px 8px rgba(0,0,0,0.30),
            inset 0 1px 0 rgba(255,255,255,0.07);

          padding: 12px;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transform: translateX(-50%) translateY(14px) scale(0.98);
          transition:
            transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 180ms ease,
            visibility 0s linear 260ms;
          will-change: transform, opacity;
        }
        .gnb-explore-panel.is-open {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          transform: translateX(-50%) translateY(0) scale(1);
          transition:
            transform 300ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 200ms ease,
            visibility 0s;
        }

        .gnb-explore-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 2px 6px 10px;
        }
        .gnb-explore-title {
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.16em; text-transform: uppercase;
          color: rgba(255,255,255,0.35);
        }
        .gnb-explore-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
        }
        /* Two columns only where three would squeeze the labels. */
        @media (max-width: 359px) { .gnb-explore-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        /* One compact row when the width genuinely allows it. */
        @media (min-width: 560px) { .gnb-explore-grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }

        .gnb-explore-link {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 6px;
          min-height: 62px;                 /* comfortably past a 44px target */
          padding: 8px 4px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.025);
          color: rgba(255,255,255,0.62);
          text-decoration: none;
          -webkit-tap-highlight-color: transparent;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .gnb-explore-link:hover {
          background: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.12);
          color: rgba(255,255,255,0.92);
        }
        .gnb-explore-link:focus-visible { outline: 2px solid #a78bfa; outline-offset: 2px; }
        .gnb-explore-label {
          font-size: 10px; font-weight: 600; line-height: 1;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          max-width: 100%;
        }

        @media (prefers-reduced-motion: reduce) {
          .gnb-explore-panel, .gnb-scrim, .gnb-explore-icon svg { transition: none; }
        }
      `}</style>

      {/* Clicking anywhere outside closes. Sits under the bar and the panel so
          both remain clickable while it is up. */}
      <div
        className={`gnb-scrim${exploreOpen ? ' is-open' : ''}`}
        onClick={() => setExploreOpen(false)}
        aria-hidden="true"
      />

      {/* Explore panel — static links only. Opening it makes no request and
          mounts no data component. It stays in the DOM so the open/close
          animation runs on transform and opacity rather than on mount. */}
      <div
        id="gnb-explore-panel"
        className={`gnb-explore-panel${exploreOpen ? ' is-open' : ''}`}
        role="group"
        aria-label="Explore Docrud"
        aria-hidden={!exploreOpen}
      >
        <div className="gnb-explore-head">
          <span className="gnb-explore-title">Explore Docrud</span>
        </div>
        <div className="gnb-explore-grid">
          {BOTTOM_NAV_EXPLORE.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="gnb-explore-link"
              /* Not focusable while closed, so keyboard order is unaffected. */
              tabIndex={exploreOpen ? 0 : -1}
              onClick={() => setExploreOpen(false)}
            >
              <item.Icon width={18} height={18} aria-hidden />
              <span className="gnb-explore-label">{item.label}</span>
            </a>
          ))}
        </div>
      </div>

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

        {/* Explore — replaces Recents. A button, not a link: it toggles the
            panel above rather than navigating anywhere. */}
        <button
          type="button"
          className="gnb-item gnb-explore"
          onClick={() => setExploreOpen((open) => !open)}
          aria-label={exploreOpen ? 'Close Explore' : 'Open Explore'}
          aria-expanded={exploreOpen}
          aria-controls="gnb-explore-panel"
        >
          <span className={`gnb-icon gnb-explore-icon${exploreOpen ? ' is-open' : ''}`}>
            <ArrowUp width={19} height={19} />
          </span>
          <span className="gnb-label" style={{ color: exploreOpen ? '#a78bfa' : 'rgba(255,255,255,0.50)' }}>
            Explore
          </span>
          <span className="gnb-dot" style={{ opacity: exploreOpen ? 1 : 0, background: '#a78bfa' }} />
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
    </>
  );

  return createPortal(nav, document.body);
}