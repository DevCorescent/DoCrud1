'use client';

/**
 * The app shell — a navbar across the top and the glass panel beneath it.
 *
 * ═══ WHY A BAR AND NOT A RAIL ═══
 *
 * The sidebar spent between 72 and 270 horizontal pixels on five links. On a
 * laptop that is a column of the window given over permanently to navigation;
 * on a phone it was a drawer, which is navigation you cannot see. A bar costs
 * one row of height, shows every destination at once at every width, and hands
 * the whole width back to the content.
 *
 * ═══ ONE TAB LIST, NOT TWO ═══
 *
 * `.dh-tabs` is a single DOM node. Below 860px the CSS gives it
 * `flex-basis: 100%` inside a wrapping flex row, so it moves onto a line of its
 * own and scrolls. Rendering a separate mobile copy would duplicate every link
 * in the accessibility tree and give the page two navigation landmarks that say
 * the same thing.
 *
 * ═══ SEARCH BELONGS TO THE BAR ═══
 *
 * Not a slot any more. Search is the same thing on every page — one field that
 * answers across roles, people and companies — so the shell owns it rather
 * than each page passing its own. A page that wants to narrow its OWN list
 * does that in its own controls, where it is unambiguous which list is being
 * narrowed.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import {
  Home, Newspaper, Users, Building2, ScanLine, Info,
} from 'lucide-react';
import TyraiMark from '@/components/ai-mode/TyraiMark';
import NavSearch from '@/components/home/discover/NavSearch';
import PostMenu from '@/components/home/discover/PostMenu';
import './discover.css';

const AiMode = dynamic(() => import('@/components/ai-mode/AiMode'), { ssr: false });

/* Flat. Every href is a route that exists; a navbar with a dead tab in it is
   worse than a shorter navbar. */
export interface Leaf { label: string; href: string; Icon: typeof Home }

export const NAV: Leaf[] = [
  { label: 'Home', href: '/', Icon: Home },
  { label: 'Feed', href: '/published', Icon: Newspaper },
  { label: 'Jobs', href: '/jobs', Icon: ScanLine },
  { label: 'Talent', href: '/people', Icon: Users },
  { label: 'Companies', href: '/businesses', Icon: Building2 },
];

export interface DiscoverShellProps {
  softwareName: string;
  guestMode?: boolean;
  viewer: { name: string | null; email: string | null } | null;
  /**
   * A strip pinned directly under the bar, above everything else in the
   * scroller — including the incognito banner.
   *
   * A slot rather than something the page renders itself: the banner is the
   * shell's and comes before `children`, so a "sticky under the navbar" strip
   * passed in as a child sat 65px below the bar at rest and only met it once
   * the banner had scrolled away. Measured, not assumed.
   */
  topStrip?: React.ReactNode;
  /** Placeholder override, for pages where the wording should be narrower. */
  searchPlaceholder?: string;
  /** Replaces the default scroll region, for pages that scroll their own panes. */
  bare?: boolean;
  /**
   * Drops the top bar, keeping the shell's ground and frame.
   *
   * For a page that carries its own header and does not want two stacked: the
   * profile page has a back control and the person's name across the top, and
   * the shell's navbar above that was a second row of chrome saying where you
   * already are. The bottom nav is unaffected — it is portalled globally, not
   * rendered here — so the page keeps its navigation.
   */
  hideBar?: boolean;
  children: ReactNode;
}

export default function DiscoverShell({
  softwareName, guestMode = false, viewer, searchPlaceholder, bare = false, hideBar = false,
  topStrip, children,
}: DiscoverShellProps) {
  const pathname = usePathname();
  const [tyraiOpen, setTyraiOpen] = useState(false);
  const tabsRef = useRef<HTMLElement | null>(null);

  /* Navigating away closes TYRAI. Without this it stays over whatever page you
     land on, because the overlay is a portal on `document.body` and nothing
     about a route change unmounts it. */
  useEffect(() => { setTyraiOpen(false); }, [pathname]);

  const isOn = (leaf: Leaf) =>
    pathname === leaf.href || (leaf.href !== '/' && !!pathname?.startsWith(`${leaf.href}/`));

  /* The active tab scrolls itself into view. Below 860px the tab list is a
     scroller, and landing on /businesses with "Companies" off the right edge
     reads as the page not knowing where you are. */
  useEffect(() => {
    const el = tabsRef.current?.querySelector<HTMLElement>('[data-on="1"]');
    if (!el || !tabsRef.current) return;
    const strip = tabsRef.current;
    if (strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({
      left: el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2,
      behavior: 'smooth',
    });
  }, [pathname]);

  const initial = (viewer?.name || viewer?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="dh">
      {tyraiOpen && <AiMode open onClose={() => setTyraiOpen(false)} />}

      {/* ══ Navbar ══ */}
      {!hideBar && (
      <header className="dh-bar">
        <div className="dh-bar-in">
          <Link href="/" className="dh-logo" aria-label={`${softwareName} home`}>
            <span className="dh-logo-mark" aria-hidden>d</span>
            <span className="dh-logo-word">{softwareName}</span>
          </Link>

          <nav className="dh-tabs" aria-label="Main navigation" ref={tabsRef}>
            {NAV.map((leaf) => {
              const on = isOn(leaf);
              const tab = (
                <Link
                  href={leaf.href}
                  className="dh-tab"
                  data-on={on ? '1' : '0'}
                  aria-current={on ? 'page' : undefined}
                >
                  <leaf.Icon size={15} strokeWidth={on ? 2.2 : 1.85} />
                  <span>{leaf.label}</span>
                </Link>
              );
              /* Jobs carries the post menu. The tab itself is untouched — it
                 still goes to the board — and the chevron is a sibling inside
                 one pill, so nothing that worked before needs a second click. */
              if (leaf.href !== '/jobs') return <div key={leaf.href} className="dh-tab-w">{tab}</div>;
              return (
                <div key={leaf.href} className="dh-tab-w has-more" data-on={on ? '1' : '0'}>
                  {tab}
                  <PostMenu />
                </div>
              );
            })}
          </nav>

          <div className="dh-bar-search">
            <NavSearch placeholder={searchPlaceholder} />
          </div>

          <div className="dh-bar-acts">
            <button
              type="button"
              className="dh-tyrai"
              onClick={() => setTyraiOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={tyraiOpen}
              title="Ask TYRAI"
            >
              <TyraiMark className="dh-tyrai-mark" strokeWidth={1.7} />
              <span>TYRAI</span>
            </button>

            <Link href="/businesses" className="dh-btn dh-btn-ghost">
              <Building2 size={15} /> For <b>Business</b>
            </Link>

            {viewer ? (
              <Link href="/profile" className="dh-avatar" aria-label="Your profile" title={viewer.name || viewer.email || 'Profile'}>
                {initial}
              </Link>
            ) : (
              <Link href="/login" className="dh-btn dh-btn-solid">Login</Link>
            )}
          </div>
        </div>
      </header>
      )}

      {/* ══ Panel ══ */}
      <div className="dh-panel">
        {bare ? children : (
          <div className="dh-scroll">
            {topStrip}
            {guestMode && (
              <div className="dh-guest">
                <Info size={15} />
                <span>
                  You are browsing in incognito mode. <Link href="/login">Sign in</Link> to save work, post opportunities and apply.
                </span>
              </div>
            )}
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
