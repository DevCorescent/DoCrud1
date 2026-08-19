'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import {
  Globe,
  Home,
  MessageSquare,
  Users,
} from 'lucide-react';

/* ── Recents icon ────────────────────────────────────────────────── */
function RecentsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <rect x="2"  y="4"    width="6" height="9"   rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="10" y="2"    width="6" height="11"  rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="2"  y="14.5" width="6" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.5"/>
      <rect x="10" y="14.5" width="6" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.5"/>
    </svg>
  );
}

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
  const lastY     = useRef(0);
  const ticking   = useRef(false);

  useEffect(() => { setMounted(true); }, []);


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

        .gnb-dot {
          width: 3px; height: 3px;
          border-radius: 50%;
          margin-top: 1px;
          transition: opacity 0.14s ease, background 0.14s ease;
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

        {/* Recents */}
        {(() => {
          const active = pathname.startsWith('/recents');
          const color  = active ? '#a78bfa' : 'rgba(255,255,255,0.50)';
          return (
            <a href="/recents" className="gnb-item" aria-label="Recents" aria-current={active ? 'page' : undefined}>
              <span className="gnb-icon" style={{ color, background: active ? 'rgba(167,139,250,0.18)' : 'transparent' }}>
                <RecentsIcon size={19} />
              </span>
              <span className="gnb-label" style={{ color }}>Recents</span>
              <span className="gnb-dot" style={{ opacity: active ? 1 : 0, background: '#a78bfa' }} />
            </a>
          );
        })()}

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

        {/* Messages */}
        {(() => {
          const active = pathname.startsWith('/messages');
          const color  = active ? '#818cf8' : 'rgba(255,255,255,0.50)';
          return (
            <a href="/messages" className="gnb-item" aria-label="Messages" aria-current={active ? 'page' : undefined}>
              <span className="gnb-icon" style={{ color, background: active ? 'rgba(129,140,248,0.18)' : 'transparent' }}>
                <MessageSquare width={19} height={19} />
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