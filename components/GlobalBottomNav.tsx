'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import {
  Building2,
  Globe,
  Home,
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
  const lastY     = useRef(0);
  const ticking   = useRef(false);

  useEffect(() => { setMounted(true); }, []);

  /* scroll-hide / scroll-show */
  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y    = window.scrollY;
        const diff = y - lastY.current;
        if (Math.abs(diff) > 4) {
          setVisible(diff < 0 || y < 60); // show on scroll-up or near top
          lastY.current = y;
        }
        ticking.current = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!mounted || !shouldShow(pathname)) return null;

  const nav = (
    <>
      <style>{`
        @media (min-width: 640px) { .gnb-bar { display: none !important; } }

        @keyframes gnb-in {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        .gnb-bar {
          position: fixed;
          bottom: 18px;
          left: 50%;
          transform: translateX(-50%);
          width: calc(100% - 32px);
          max-width: 380px;
          z-index: 9995;
          height: 62px;
          background: rgba(0, 0, 0, 0.82);
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 24px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.07);
          display: flex;
          align-items: center;
          animation: gnb-in 0.36s cubic-bezier(0.22,1,0.36,1) 0.05s both;
          transition: opacity 0.28s cubic-bezier(0.4,0,0.2,1), transform 0.28s cubic-bezier(0.4,0,0.2,1);
          will-change: transform, opacity;
        }

        .gnb-bar.gnb-hidden {
          opacity: 0;
          transform: translateX(-50%) translateY(16px);
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

        {/* Businesses */}
        {(() => {
          const active = pathname.startsWith('/businesses');
          const color  = active ? '#818cf8' : 'rgba(255,255,255,0.50)';
          return (
            <a href="/businesses" className="gnb-item" aria-label="Businesses" aria-current={active ? 'page' : undefined}>
              <span className="gnb-icon" style={{ color, background: active ? 'rgba(129,140,248,0.18)' : 'transparent' }}>
                <Building2 width={19} height={19} />
              </span>
              <span className="gnb-label" style={{ color }}>Businesses</span>
              <span className="gnb-dot" style={{ opacity: active ? 1 : 0, background: '#818cf8' }} />
            </a>
          );
        })()}

      </nav>
    </>
  );

  return createPortal(nav, document.body);
}
