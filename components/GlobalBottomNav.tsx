'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import {
  Building2,
  Globe,
  Home,
  Sparkles,
} from 'lucide-react';

/* ── Recents icon (same SVG used in PublicHomepage) ─────────────── */
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

/* ── Nav item colours ────────────────────────────────────────────── */
const ACCENT: Record<string, string> = {
  '/':            '#a78bfa',
  '/published':   '#22d3ee',
  '/recents':     '#a78bfa',
  '/businesses':  '#818cf8',
};

function accent(path: string, current: string) {
  const match = Object.keys(ACCENT).find(k =>
    k === '/' ? current === '/' : current.startsWith(k)
  );
  return match === path ? ACCENT[path] ?? '#a78bfa' : null;
}

/* ── Pages where we DON'T want to show the global bottom nav ─────── */
const EXCLUDED = [
  '/workspace',
  '/documents',
  '/sign',
  '/pdf-studio',
  '/doc-word',
  '/form-builder',
  '/onboarding',
];

function shouldShow(path: string) {
  return !EXCLUDED.some(p => path.startsWith(p));
}

export default function GlobalBottomNav() {
  const pathname = usePathname() ?? '/';
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !shouldShow(pathname)) return null;

  const nav = (
    <>
      <style>{`
        /* Only show on mobile — sm (640px) and above it's hidden */
        @media (min-width: 640px) { .gnb-bar { display: none !important; } }

        @keyframes gnb-in {
          from { opacity: 0; transform: translateY(100%); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .gnb-bar {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          z-index: 9995;
          height: calc(62px + env(safe-area-inset-bottom, 0px));
          padding-bottom: env(safe-area-inset-bottom, 0px);
          background: rgba(4,4,8,0.72);
          backdrop-filter: blur(48px) saturate(200%) brightness(0.85);
          -webkit-backdrop-filter: blur(48px) saturate(200%) brightness(0.85);
          border-top: 1px solid rgba(255,255,255,0.08);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 -8px 32px rgba(0,0,0,0.28);
          display: flex;
          align-items: stretch;
          animation: gnb-in 0.32s cubic-bezier(0.22,1,0.36,1) 0.06s both;
        }

        .gnb-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          flex: 1;
          padding: 10px 4px 8px;
          cursor: pointer;
          text-decoration: none;
          -webkit-tap-highlight-color: transparent;
          background: none;
          border: none;
          transition: transform 0.16s cubic-bezier(0.34,1.56,0.64,1), opacity 0.14s ease;
          outline: none;
        }
        .gnb-item:active { transform: scale(0.88); opacity: 0.70; }

        .gnb-icon {
          width: 24px; height: 24px;
          display: flex; align-items: center; justify-content: center;
          border-radius: 8px;
          transition: background 0.14s ease, color 0.14s ease;
        }

        .gnb-label {
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.01em;
          white-space: nowrap;
          line-height: 1;
          transition: color 0.14s ease;
        }
      `}</style>

      <nav className="gnb-bar" role="navigation" aria-label="Main navigation">

        {/* Home */}
        {(() => {
          const active = pathname === '/';
          const color = active ? '#a78bfa' : 'rgba(255,255,255,0.45)';
          return (
            <a href="/" className="gnb-item" aria-label="Home" aria-current={active ? 'page' : undefined}>
              <span className="gnb-icon" style={{ color, background: active ? 'rgba(167,139,250,0.15)' : 'transparent' }}>
                <Home width={20} height={20} />
              </span>
              <span className="gnb-label" style={{ color }}>Home</span>
            </a>
          );
        })()}

        {/* Feed */}
        {(() => {
          const active = pathname.startsWith('/published');
          const color = active ? '#22d3ee' : 'rgba(255,255,255,0.45)';
          return (
            <a href="/published" className="gnb-item" aria-label="Feed" aria-current={active ? 'page' : undefined}>
              <span className="gnb-icon" style={{ color, background: active ? 'rgba(34,211,238,0.14)' : 'transparent' }}>
                <Globe width={20} height={20} />
              </span>
              <span className="gnb-label" style={{ color }}>Feed</span>
            </a>
          );
        })()}

        {/* Recents */}
        {(() => {
          const active = pathname.startsWith('/recents');
          const color = active ? '#a78bfa' : 'rgba(255,255,255,0.45)';
          return (
            <a href="/recents" className="gnb-item" aria-label="Recents" aria-current={active ? 'page' : undefined}>
              <span className="gnb-icon" style={{ color, background: active ? 'rgba(167,139,250,0.15)' : 'transparent' }}>
                <RecentsIcon size={20} />
              </span>
              <span className="gnb-label" style={{ color }}>Recents</span>
            </a>
          );
        })()}

        {/* Tools — dispatches the same event PublicHomepage listens to */}
        {(() => {
          const color = 'rgba(255,255,255,0.45)';
          return (
            <button
              type="button"
              className="gnb-item"
              aria-label="Tools"
              onClick={() => window.dispatchEvent(new CustomEvent('open-mobile-tools-drawer'))}
            >
              <span className="gnb-icon" style={{ color }}>
                <Sparkles width={20} height={20} />
              </span>
              <span className="gnb-label" style={{ color }}>Tools</span>
            </button>
          );
        })()}

        {/* Businesses */}
        {(() => {
          const active = pathname.startsWith('/businesses');
          const color = active ? '#818cf8' : 'rgba(255,255,255,0.45)';
          return (
            <a href="/businesses" className="gnb-item" aria-label="Businesses" aria-current={active ? 'page' : undefined}>
              <span className="gnb-icon" style={{ color, background: active ? 'rgba(129,140,248,0.15)' : 'transparent' }}>
                <Building2 width={20} height={20} />
              </span>
              <span className="gnb-label" style={{ color }}>Businesses</span>
            </a>
          );
        })()}

      </nav>
    </>
  );

  return createPortal(nav, document.body);
}
