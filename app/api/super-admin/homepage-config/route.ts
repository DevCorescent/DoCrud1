export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { readJsonFile, writeJsonFile, homepageConfigPath } from '@/lib/server/storage';

type SectionVisibility = {
  recentsBar: boolean; heroBanner: boolean; featureCards: boolean;
  publishHeading: boolean; contentDiscovery: boolean; adBanners: boolean;
  gigsGrid: boolean; leaderboards: boolean; builtInIndia: boolean; footer: boolean;
};
type SlotWord = { word: string; subtitle: string; color: string };
type NavLink = { id: string; label: string; href: string; visible: boolean; order: number };
type ContentTab = { id: string; label: string; visible: boolean; order: number };
type FooterLink = { label: string; href: string; visible: boolean };
type FooterColumn = { id: string; title: string; links: FooterLink[] };
type AnnouncementBanner = { id: string; text: string; ctaLabel: string; ctaHref: string; style: 'info' | 'warning' | 'success' | 'promo'; active: boolean };
export type HomepageConfig = {
  sections: SectionVisibility;
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

const DEFAULT_CONFIG: HomepageConfig = {
  sections: { recentsBar: true, heroBanner: true, featureCards: true, publishHeading: true, contentDiscovery: true, adBanners: true, gigsGrid: false, leaderboards: false, builtInIndia: true, footer: true },
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

function mergeConfig(stored: Partial<HomepageConfig> | null): HomepageConfig {
  if (!stored) return { ...DEFAULT_CONFIG };
  return {
    ...DEFAULT_CONFIG,
    ...stored,
    sections: { ...DEFAULT_CONFIG.sections, ...(stored.sections ?? {}) },
    hero:     { ...DEFAULT_CONFIG.hero,     ...(stored.hero     ?? {}) },
    nav:      { ...DEFAULT_CONFIG.nav,      ...(stored.nav      ?? {}) },
    featureCards:     { ...DEFAULT_CONFIG.featureCards,     ...(stored.featureCards     ?? {}) },
    contentDiscovery: { ...DEFAULT_CONFIG.contentDiscovery, ...(stored.contentDiscovery ?? {}) },
    footer:           { ...DEFAULT_CONFIG.footer,           ...(stored.footer           ?? {}) },
  };
}

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const stored = await readJsonFile<Partial<HomepageConfig> | null>(homepageConfigPath, null);
    return NextResponse.json({ config: mergeConfig(stored) });
  } catch (err) {
    console.error('[super-admin/homepage-config GET]', err);
    return NextResponse.json({ error: 'Failed to load config' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await guard(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({})) as { config?: Partial<HomepageConfig> };
    const incoming = body.config ?? {};
    const stored = await readJsonFile<Partial<HomepageConfig> | null>(homepageConfigPath, null);
    const current = mergeConfig(stored);
    const updated: HomepageConfig = {
      ...current,
      ...incoming,
      sections: { ...current.sections, ...(incoming.sections ?? {}) },
      hero:     { ...current.hero,     ...(incoming.hero     ?? {}) },
      nav:      { ...current.nav,      ...(incoming.nav      ?? {}) },
      featureCards:     { ...current.featureCards,     ...(incoming.featureCards     ?? {}) },
      contentDiscovery: { ...current.contentDiscovery, ...(incoming.contentDiscovery ?? {}) },
      footer:           { ...current.footer,           ...(incoming.footer           ?? {}) },
      updatedAt: new Date().toISOString(),
    };
    await writeJsonFile(homepageConfigPath, updated);
    return NextResponse.json({ ok: true, config: updated });
  } catch (err) {
    console.error('[super-admin/homepage-config POST]', err);
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
  }
}
