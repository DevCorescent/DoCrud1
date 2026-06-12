export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import { readJsonFile, homepageConfigPath } from '@/lib/server/storage';

type SectionVisibility = {
  recentsBar: boolean; heroBanner: boolean; featureCards: boolean;
  publishHeading: boolean; contentDiscovery: boolean; adBanners: boolean;
  gigsGrid: boolean; leaderboards: boolean; builtInIndia: boolean; footer: boolean;
};
type HomepageConfig = {
  sections: SectionVisibility;
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
  sections: { recentsBar:true, heroBanner:true, featureCards:true, publishHeading:true, contentDiscovery:true, adBanners:true, gigsGrid:false, leaderboards:false, builtInIndia:true, footer:true },
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
