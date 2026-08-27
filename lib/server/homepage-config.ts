/**
 * The homepage configuration Super Admin owns — one definition, one merge.
 *
 * This type, its defaults and the merge that fills in fields an older stored
 * record predates were COPIED between the public route and the Super Admin
 * route. Two copies of the same contract drift; when the marquee gained
 * `autoFromJobs` both had to be edited in lockstep. They now import from here.
 *
 * The read is cached briefly: every homepage load asks for it, only an admin
 * save changes it, and the document is under a kilobyte. Saving clears the
 * cache, so an admin sees their own change immediately.
 */
import { readJsonFile, writeJsonFile, homepageConfigPath } from '@/lib/server/storage';

type SectionVisibility = {
  trustedCompanies: boolean; homeHighlights: boolean;
  heroBanner: boolean; featureCards: boolean;
  publishHeading: boolean; contentDiscovery: boolean; adBanners: boolean;
  gigsGrid: boolean; leaderboards: boolean; builtInIndia: boolean; footer: boolean;
};
export type TrustedCompany = { id: string; name: string; logoUrl: string; href: string; visible: boolean };
/** The "Top companies trust docrud" marquee — Super Admin owns the list AND the logos. */
type TrustedCompanies = { label: string; items: TrustedCompany[]; autoFromJobs: boolean };
/** Copy + artwork for the signed-in greeting card. The name comes from the session. */
type HomeGreeting = { subtitle: string; illustrationUrl: string };
type SlotWord = { word: string; subtitle: string; color: string };
type NavLink = { id: string; label: string; href: string; visible: boolean; order: number };
type ContentTab = { id: string; label: string; visible: boolean; order: number };
type FooterLink = { label: string; href: string; visible: boolean };
type FooterColumn = { id: string; title: string; links: FooterLink[] };
type AnnouncementBanner = { id: string; text: string; ctaLabel: string; ctaHref: string; style: 'info' | 'warning' | 'success' | 'promo'; active: boolean };
export type HomepageConfig = {
  sections: SectionVisibility;
  trustedCompanies: TrustedCompanies;
  greeting: HomeGreeting;
  hero: { slotWords: SlotWord[]; backgroundImage: string; guestCtaPrimary: string; guestCtaSecondary: string; authCtaPrimary: string; authCtaSecondary: string };
  nav: { logoText: string; logoUrl: string; links: NavLink[]; showSignIn: boolean; showSignUp: boolean };
  featureCards: { guestFeatureIds: string[]; defaultFeatureIds: string[] };
  contentDiscovery: { tabs: ContentTab[] };
  footer: { columns: FooterColumn[]; securityBadges: Array<{ label: string; visible: boolean }>; tagline: string; madeIn: string; copyrightEntity: string };
  announcementBanner: AnnouncementBanner | null;
  seoTitle: string;
  seoDescription: string;
  updatedAt: string;
};

export const DEFAULT_CONFIG: HomepageConfig = {
  sections: { trustedCompanies: true, homeHighlights: true, heroBanner: true, featureCards: true, publishHeading: true, contentDiscovery: true, adBanners: true, gigsGrid: false, leaderboards: false, builtInIndia: true, footer: true },
  trustedCompanies: {
    /* No caption by default — the logos speak for themselves. Super Admin can
       still type one here and it renders above the row. */
    label: '',
    /* Empty by default: the row is filled from the employers actually posting
       jobs (/api/public/hiring-companies). Items added here are PINNED and
       lead the row — use them for partners with no live posting. */
    items: [],
    autoFromJobs: true,
  },
  greeting: {
    subtitle: "We've found some jobs and connections for you.",
    illustrationUrl: '',
  },
  hero: { slotWords: [], backgroundImage: '', guestCtaPrimary: '', guestCtaSecondary: '', authCtaPrimary: '', authCtaSecondary: '' },
  nav: { logoText: '', logoUrl: '', links: [], showSignIn: true, showSignUp: true },
  featureCards: { guestFeatureIds: [], defaultFeatureIds: [] },
  contentDiscovery: { tabs: [] },
  footer: { columns: [], securityBadges: [], tagline: '', madeIn: '', copyrightEntity: '' },
  announcementBanner: null,
  seoTitle: '',
  seoDescription: '',
  updatedAt: '',
};

export function mergeConfig(stored: Partial<HomepageConfig> | null): HomepageConfig {
  if (!stored) return { ...DEFAULT_CONFIG };
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    sections: { ...DEFAULT_CONFIG.sections, ...(stored.sections ?? {}) },
    trustedCompanies: { ...DEFAULT_CONFIG.trustedCompanies, ...(stored.trustedCompanies ?? {}) },
    greeting: { ...DEFAULT_CONFIG.greeting, ...(stored.greeting ?? {}) },
    hero:     { ...DEFAULT_CONFIG.hero,     ...(stored.hero     ?? {}) },
    nav:      { ...DEFAULT_CONFIG.nav,      ...(stored.nav      ?? {}) },
    featureCards:     { ...DEFAULT_CONFIG.featureCards,     ...(stored.featureCards     ?? {}) },
    contentDiscovery: { ...DEFAULT_CONFIG.contentDiscovery, ...(stored.contentDiscovery ?? {}) },
    footer:           { ...DEFAULT_CONFIG.footer,           ...(stored.footer           ?? {}) },
  };
}

/* ─── cached read ─────────────────────────────────────────────────────────
   Public, identical for every visitor, and written only from Super Admin. */
let cache: { value: HomepageConfig; ts: number } | null = null;
const CACHE_TTL = 30_000;

/** Clears the cache — called on every save so an admin never sees stale copy. */
export function invalidateHomepageConfig() {
  cache = null;
}

/** The merged, ready-to-use configuration. */
export async function getHomepageConfig(): Promise<HomepageConfig> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.value;
  const stored = await readJsonFile<Partial<HomepageConfig> | null>(homepageConfigPath, null);
  const value = mergeConfig(stored);
  cache = { value, ts: Date.now() };
  return value;
}

/** Persists a partial update and returns the merged result. */
export async function saveHomepageConfig(incoming: Partial<HomepageConfig>): Promise<HomepageConfig> {
  const current = await getHomepageConfig();
  const updated: HomepageConfig = {
    ...current,
    ...incoming,
    sections: { ...current.sections, ...(incoming.sections ?? {}) },
    trustedCompanies: { ...current.trustedCompanies, ...(incoming.trustedCompanies ?? {}) },
    greeting: { ...current.greeting, ...(incoming.greeting ?? {}) },
    hero: { ...current.hero, ...(incoming.hero ?? {}) },
    nav: { ...current.nav, ...(incoming.nav ?? {}) },
    featureCards: { ...current.featureCards, ...(incoming.featureCards ?? {}) },
    contentDiscovery: { ...current.contentDiscovery, ...(incoming.contentDiscovery ?? {}) },
    footer: { ...current.footer, ...(incoming.footer ?? {}) },
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(homepageConfigPath, updated);
  invalidateHomepageConfig();
  return updated;
}

/**
 * The marquee's PINNED companies, already filtered to the active ones and in
 * the order Super Admin arranged them. Filtering here rather than in the
 * browser means hidden entries never leave the server.
 */
export function activeTrustedCompanies(config: HomepageConfig): TrustedCompany[] {
  return (config.trustedCompanies.items ?? []).filter((c) => c && c.visible !== false && (c.name || c.logoUrl));
}
