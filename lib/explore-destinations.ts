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
 * the pattern that page already reads (see PublishedPage), and `/published`
 * with no query is its own "All" tab — not a new route.
 */
import {
  BookOpen, Briefcase, Building2, LayoutGrid, Rocket, TrendingUp, Users, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';

export interface ExploreDestination {
  label: string;
  href: string;
  Icon: LucideIcon;
}

const DESTINATIONS = {
  businesses: { label: 'Businesses', href: '/businesses',            Icon: Building2 },
  services:   { label: 'Services',   href: '/services',              Icon: Wrench },
  projects:   { label: 'Projects',   href: '/projects',              Icon: Rocket },
  jobs:       { label: 'Jobs',       href: '/jobs',                  Icon: Briefcase },
  gigs:       { label: 'Gigs',       href: '/published?tab=gig',     Icon: Zap },
  people:     { label: 'People',     href: '/people',                Icon: Users },
  trends:     { label: 'Trends',     href: '/trends',                Icon: TrendingUp },
  articles:   { label: 'Articles',   href: '/published?tab=article', Icon: BookOpen },
  /* The existing "All" destination: the Published feed with no tab filter,
     which is exactly what its own tab strip links to. LayoutGrid is the icon
     the app already uses for the `all` entry. */
  all:        { label: 'All',        href: '/published',             Icon: LayoutGrid },
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

/**
 * The bottom navigation's Explore panel — deliberately five, so the row stays
 * one compact line on desktop. People already has its own item in the bar, and
 * Gigs / Trends / Articles remain reachable from the homepage strip and their
 * own routes; they are only absent from this panel.
 */
export const BOTTOM_NAV_EXPLORE: ExploreDestination[] = [
  DESTINATIONS.businesses,
  DESTINATIONS.services,
  DESTINATIONS.projects,
  DESTINATIONS.jobs,
  DESTINATIONS.all,
];
