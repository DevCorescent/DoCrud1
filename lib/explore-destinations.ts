/**
 * Explore destinations — one definition, composed into each surface.
 *
 * Two places show Explore links and they do NOT show the same set:
 *   · the homepage Explore strip — the seven it has always had;
 *   · the bottom navigation's Explore panel — five compact shortcuts.
 *
 * Both are composed from the keyed map below, so a route or icon is written
 * once. Adding a destination to a surface is a one-word change to its list, and
 * the two can differ without either drifting from the real route.
 *
 * Every href points at a route that already exists. `/published?tab=<id>` is
 * the pattern that page already reads (see PublishedPage), not a new one.
 */
import {
  BookOpen, Briefcase, Building2, Rocket, TrendingUp, Users, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';

export interface ExploreDestination {
  label: string;
  href: string;
  Icon: LucideIcon;
  /** One-line explanation, shown in the bottom-nav panel. */
  desc: string;
  /** Icon tint in the bottom-nav Explore panel. Reuses the palette
      ALL_QUICK_FEATURES already uses, so the panel reads as the same product
      rather than a new colour system. */
  ic: string;
  /** Icon tint in the homepage Explore strip. A separate field because the two
      surfaces were tuned independently — four destinations differ — and
      changing one must not silently restyle the other. */
  homeIc: string;
}

const DESTINATIONS = {
  businesses: { label: 'Businesses', href: '/businesses',            Icon: Building2,  desc: 'Discover companies',     ic: '#60a5fa', homeIc: '#34d399' },
  services:   { label: 'Services',   href: '/services',              Icon: Wrench,     desc: 'Find expert services',   ic: '#4ade80', homeIc: '#60a5fa' },
  projects:   { label: 'Projects',   href: '/projects',              Icon: Rocket,     desc: 'Explore projects',       ic: '#a78bfa', homeIc: '#a78bfa' },
  jobs:       { label: 'Jobs',       href: '/jobs',                  Icon: Briefcase,  desc: 'Find job opportunities', ic: '#fb923c', homeIc: '#f59e0b' },
  gigs:       { label: 'Gigs',       href: '/published?tab=gig',     Icon: Zap,        desc: 'Find freelance gigs',    ic: '#facc15', homeIc: '#facc15' },
  people:     { label: 'People',     href: '/people',                Icon: Users,      desc: 'Connect with people',    ic: '#f472b6', homeIc: '#fb7185' },
  trends:     { label: 'Trends',     href: '/trends',                Icon: TrendingUp, desc: 'Explore trends',         ic: '#22d3ee', homeIc: '#22d3ee' },
  articles:   { label: 'Articles',   href: '/published?tab=article', Icon: BookOpen,   desc: 'Read insights',          ic: '#93c5fd', homeIc: '#93c5fd' },
} satisfies Record<string, ExploreDestination>;

/** The homepage Explore strip. */
export const EXPLORE_DESTINATIONS: ExploreDestination[] = [
  DESTINATIONS.businesses,
  DESTINATIONS.services,
  DESTINATIONS.projects,
  DESTINATIONS.jobs,
  DESTINATIONS.gigs,
  DESTINATIONS.people,
  DESTINATIONS.trends,
];

/** The bottom navigation's Explore panel — every destination, with its blurb. */
export const BOTTOM_NAV_EXPLORE: ExploreDestination[] = [
  DESTINATIONS.businesses,
  DESTINATIONS.services,
  DESTINATIONS.projects,
  DESTINATIONS.jobs,
  DESTINATIONS.gigs,
  DESTINATIONS.people,
  DESTINATIONS.trends,
  DESTINATIONS.articles,
];

/**
 * The accent wash behind one Explore tile.
 *
 * Same stop profile and alphas as the Jobs / Connections cards, so the strip
 * reads as the same surface family. The RADIUS is the one thing adapted: those
 * cards are ~124px tall and use an 84px radial, which on a 40px pill would
 * cover the whole button — the opposite of subtle. Scaled to the pill, the wash
 * stays a corner hint and the dark surface stays clearly visible.
 *
 * Derived from `homeIc` so the tile's icon and its wash can never drift apart —
 * one colour per destination, written once.
 */
export function exploreWash(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 'none';
  const n = parseInt(m[1], 16);
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  return `radial-gradient(44px 44px at calc(100% - 16px) calc(100% - 8px),`
    + ` rgba(${rgb},0.13) 0%, rgba(${rgb},0.106) 38%,`
    + ` rgba(${rgb},0.043) 62%, transparent 78%)`;
}
