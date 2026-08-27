export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { readJsonFile, homepageConfigPath } from '@/lib/server/storage';

type SectionVisibility = {
  trustedCompanies: boolean; homeHighlights: boolean; trendsBoard: boolean;
  heroBanner: boolean; featureCards: boolean;
  publishHeading: boolean; contentDiscovery: boolean; adBanners: boolean;
  gigsGrid: boolean; leaderboards: boolean; builtInIndia: boolean; footer: boolean;
};
type TrustedCompany = { id: string; name: string; logoUrl: string; href: string; visible: boolean };
/** The "Top companies trust docrud" marquee — Super Admin owns the list AND the logos. */
type TrustedCompanies = { label: string; items: TrustedCompany[]; autoFromJobs: boolean };
/** Copy + artwork for the signed-in greeting card. The name comes from the session. */
type HomeGreeting = { subtitle: string; cadenceLabel: string; illustrationUrl: string };
type HomepageConfig = {
  sections: SectionVisibility;
  trustedCompanies: TrustedCompanies;
  greeting: HomeGreeting;
  hero: { slotWords: {word:string;subtitle:string;color:string}[]; backgroundImage:string; guestCtaPrimary:string; guestCtaSecondary:string; authCtaPrimary:string; authCtaSecondary:string };
  nav: { logoText:string; logoUrl:string; links:{id:string;label:string;href:string;visible:boolean;order:number}[]; showSignIn:boolean; showSignUp:boolean };
  featureCards: { guestFeatureIds:string[]; defaultFeatureIds:string[] };
  contentDiscovery: { tabs:{id:string;label:string;visible:boolean;order:number}[] };
  footer: { columns:{id:string;title:string;links:{label:string;href:string;visible:boolean}[]}[]; securityBadges:{label:string;visible:boolean}[]; tagline:string; madeIn:string; copyrightEntity:string };
  announcementBanner: {id:string;text:string;ctaLabel:string;ctaHref:string;style:'info'|'warning'|'success'|'promo';active:boolean} | null;
  seoTitle: string;
  seoDescription: string;
  updatedAt: string;
};

const DEFAULT_CONFIG: HomepageConfig = {
  sections: { trustedCompanies:true, homeHighlights:true, trendsBoard:true, heroBanner:true, featureCards:true, publishHeading:true, contentDiscovery:true, adBanners:true, gigsGrid:false, leaderboards:false, builtInIndia:true, footer:true },
  trustedCompanies: {
    label: 'Top companies trust docrud',
    /* Empty by default: the row is filled from the employers actually posting
       jobs (/api/public/hiring-companies). Items added here are PINNED and
       lead the row — use them for partners with no live posting. */
    items: [],
    autoFromJobs: true,
  },
  greeting: {
    subtitle: "We've found some jobs and connections for you.",
    cadenceLabel: 'Updated everyday',
    illustrationUrl: '',
  },
  hero: { slotWords:[], backgroundImage:'', guestCtaPrimary:'', guestCtaSecondary:'', authCtaPrimary:'', authCtaSecondary:'' },
  nav: { logoText:'', logoUrl:'', links:[], showSignIn:true, showSignUp:true },
  featureCards: { guestFeatureIds:[], defaultFeatureIds:[] },
  contentDiscovery: { tabs:[] },
  footer: { columns:[], securityBadges:[], tagline:'', madeIn:'', copyrightEntity:'' },
  announcementBanner: null,
  seoTitle: '',
  seoDescription: '',
  updatedAt: '',
};

export async function GET() {
  try {
    const stored = await readJsonFile<Partial<HomepageConfig> | null>(homepageConfigPath, null);
    if (!stored) return NextResponse.json({ config: DEFAULT_CONFIG });
    const config: HomepageConfig = {
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
    return NextResponse.json({ config });
  } catch (err) {
    console.error('[public/homepage-config GET]', err);
    return NextResponse.json({ config: DEFAULT_CONFIG });
  }
}
