import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { defaultLandingSettings, getLandingSettings, saveLandingSettings } from '@/lib/server/settings';
import { HomepageSectionToggles, LandingAudienceCard, LandingFeatureCard, LandingGettingStartedStep, LandingHeroBanner, LandingPricingPlan, LandingScreenshotCard, LandingSettings, LandingSoftwareModule, LandingStat } from '@/types/document';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

function normalizePlan(plan: Partial<LandingPricingPlan>, fallbackIndex: number): LandingPricingPlan {
  return {
    id: plan.id?.trim() || `plan-${fallbackIndex + 1}`,
    name: plan.name?.trim() || `Plan ${fallbackIndex + 1}`,
    priceLabel: plan.priceLabel?.trim() || 'Custom pricing',
    description: plan.description?.trim() || 'Tailored setup and customization.',
    highlights: Array.isArray(plan.highlights) ? plan.highlights.map((item) => String(item).trim()).filter(Boolean) : [],
  };
}

function normalizeFeatureCard(card: Partial<LandingFeatureCard>, fallbackIndex: number): LandingFeatureCard {
  return {
    id: card.id?.trim() || `feature-${fallbackIndex + 1}`,
    title: card.title?.trim() || `Feature ${fallbackIndex + 1}`,
    description: card.description?.trim() || 'Describe this feature area.',
  };
}

function normalizeStat(stat: Partial<LandingStat>, fallbackIndex: number): LandingStat {
  return {
    id: stat.id?.trim() || `stat-${fallbackIndex + 1}`,
    value: stat.value?.trim() || '0',
    label: stat.label?.trim() || `Metric ${fallbackIndex + 1}`,
  };
}

function normalizeSoftwareModule(module: Partial<LandingSoftwareModule>, fallbackIndex: number): LandingSoftwareModule {
  return {
    id: module.id?.trim() || `module-${fallbackIndex + 1}`,
    title: module.title?.trim() || `Module ${fallbackIndex + 1}`,
    description: module.description?.trim() || 'Describe how this module helps the organization.',
    capabilities: Array.isArray(module.capabilities) ? module.capabilities.map((item) => String(item).trim()).filter(Boolean) : [],
  };
}

function normalizeScreenshotCard(card: Partial<LandingScreenshotCard>, fallbackIndex: number): LandingScreenshotCard {
  return {
    id: card.id?.trim() || `screenshot-${fallbackIndex + 1}`,
    title: card.title?.trim() || `Screenshot ${fallbackIndex + 1}`,
    description: card.description?.trim() || 'Describe what this product view demonstrates.',
    imagePath: card.imagePath?.trim() || '',
  };
}

function normalizeHeroBanner(card: Partial<LandingHeroBanner>, fallbackIndex: number): LandingHeroBanner {
  return {
    id: card.id?.trim() || `hero-banner-${fallbackIndex + 1}`,
    eyebrow: card.eyebrow?.trim() || `Banner ${fallbackIndex + 1}`,
    title: card.title?.trim() || `Hero banner ${fallbackIndex + 1}`,
    description: card.description?.trim() || 'Describe the banner story for this hero slide.',
    imagePath: card.imagePath?.trim() || '',
  };
}

function normalizeAudienceCard(card: Partial<LandingAudienceCard>, fallbackIndex: number): LandingAudienceCard {
  return {
    id: card.id?.trim() || `audience-${fallbackIndex + 1}`,
    businessType: card.businessType?.trim() || `Business ${fallbackIndex + 1}`,
    usage: card.usage?.trim() || 'Describe how this business would use docrud.',
    benefit: card.benefit?.trim() || 'Describe the outcome or benefit for this business.',
  };
}

function normalizeGettingStartedStep(step: Partial<LandingGettingStartedStep>, fallbackIndex: number): LandingGettingStartedStep {
  return {
    id: step.id?.trim() || `getting-started-${fallbackIndex + 1}`,
    title: step.title?.trim() || `Step ${fallbackIndex + 1}`,
    description: step.description?.trim() || 'Describe what the buyer should do at this step.',
  };
}

function normalizeSectionToggles(toggles: Partial<HomepageSectionToggles> | undefined, current: HomepageSectionToggles): HomepageSectionToggles {
  return {
    hero: typeof toggles?.hero === 'boolean' ? toggles.hero : current.hero,
    audiences: typeof toggles?.audiences === 'boolean' ? toggles.audiences : current.audiences,
    snapshot: typeof toggles?.snapshot === 'boolean' ? toggles.snapshot : current.snapshot,
    softwareModules: typeof toggles?.softwareModules === 'boolean' ? toggles.softwareModules : current.softwareModules,
    screenshots: typeof toggles?.screenshots === 'boolean' ? toggles.screenshots : current.screenshots,
    pricing: typeof toggles?.pricing === 'boolean' ? toggles.pricing : current.pricing,
    demo: typeof toggles?.demo === 'boolean' ? toggles.demo : current.demo,
    contact: typeof toggles?.contact === 'boolean' ? toggles.contact : current.contact,
  };
}

export async function GET() {
  try {
    return NextResponse.json(await getLandingSettings());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load landing settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as Partial<LandingSettings>;
    const current = await getLandingSettings();
    const next: LandingSettings = {
      heroBadge: payload.heroBadge?.trim() || current.heroBadge,
      heroTitle: payload.heroTitle?.trim() || current.heroTitle,
      heroSubtitle: payload.heroSubtitle?.trim() || current.heroSubtitle,
      primaryCtaLabel: payload.primaryCtaLabel?.trim() || current.primaryCtaLabel,
      primaryCtaHref: payload.primaryCtaHref?.trim() || current.primaryCtaHref,
      secondaryCtaLabel: payload.secondaryCtaLabel?.trim() || current.secondaryCtaLabel,
      secondaryCtaHref: payload.secondaryCtaHref?.trim() || current.secondaryCtaHref,
      socialProofLabel: payload.socialProofLabel?.trim() || current.socialProofLabel,
      gettingStartedTitle: payload.gettingStartedTitle?.trim() || current.gettingStartedTitle,
      gettingStartedSubtitle: payload.gettingStartedSubtitle?.trim() || current.gettingStartedSubtitle,
      audienceSectionTitle: payload.audienceSectionTitle?.trim() || current.audienceSectionTitle,
      audienceSectionSubtitle: payload.audienceSectionSubtitle?.trim() || current.audienceSectionSubtitle,
      socialProofItems: Array.isArray(payload.socialProofItems)
        ? payload.socialProofItems.map((item) => String(item).trim()).filter(Boolean)
        : current.socialProofItems,
      gettingStartedSteps: Array.isArray(payload.gettingStartedSteps) && payload.gettingStartedSteps.length
        ? payload.gettingStartedSteps.map((step, index) => normalizeGettingStartedStep(step, index))
        : current.gettingStartedSteps,
      featureSectionTitle: payload.featureSectionTitle?.trim() || current.featureSectionTitle,
      softwareModulesTitle: payload.softwareModulesTitle?.trim() || current.softwareModulesTitle,
      softwareModulesSubtitle: payload.softwareModulesSubtitle?.trim() || current.softwareModulesSubtitle,
      pricingSectionTitle: payload.pricingSectionTitle?.trim() || current.pricingSectionTitle,
      pricingSectionSubtitle: payload.pricingSectionSubtitle?.trim() || current.pricingSectionSubtitle,
      pricingPageTitle: payload.pricingPageTitle?.trim() || current.pricingPageTitle,
      pricingPageSubtitle: payload.pricingPageSubtitle?.trim() || current.pricingPageSubtitle,
      contactEmail: payload.contactEmail?.trim() || current.contactEmail,
      contactPhone: payload.contactPhone?.trim() || current.contactPhone,
      contactHeading: payload.contactHeading?.trim() || current.contactHeading,
      contactSubtitle: payload.contactSubtitle?.trim() || current.contactSubtitle,
      contactPageTitle: payload.contactPageTitle?.trim() || current.contactPageTitle,
      contactPageSubtitle: payload.contactPageSubtitle?.trim() || current.contactPageSubtitle,
      demoPageTitle: payload.demoPageTitle?.trim() || current.demoPageTitle,
      demoPageSubtitle: payload.demoPageSubtitle?.trim() || current.demoPageSubtitle,
      demoBenefits: Array.isArray(payload.demoBenefits)
        ? payload.demoBenefits.map((item) => String(item).trim()).filter(Boolean)
        : current.demoBenefits,
      screenshotsSectionTitle: payload.screenshotsSectionTitle?.trim() || current.screenshotsSectionTitle,
      screenshotsSectionSubtitle: payload.screenshotsSectionSubtitle?.trim() || current.screenshotsSectionSubtitle,
      featureHighlights: Array.isArray(payload.featureHighlights)
        ? payload.featureHighlights.map((item) => String(item).trim()).filter(Boolean)
        : current.featureHighlights,
      featureCards: Array.isArray(payload.featureCards) && payload.featureCards.length
        ? payload.featureCards.map((card, index) => normalizeFeatureCard(card, index))
        : current.featureCards,
      stats: Array.isArray(payload.stats) && payload.stats.length
        ? payload.stats.map((stat, index) => normalizeStat(stat, index))
        : current.stats,
      softwareModules: Array.isArray(payload.softwareModules) && payload.softwareModules.length
        ? payload.softwareModules.map((module, index) => normalizeSoftwareModule(module, index))
        : current.softwareModules,
      heroBanners: Array.isArray(payload.heroBanners) && payload.heroBanners.length
        ? payload.heroBanners.map((card, index) => normalizeHeroBanner(card, index))
        : current.heroBanners,
      audienceProfiles: Array.isArray(payload.audienceProfiles) && payload.audienceProfiles.length
        ? payload.audienceProfiles.map((card, index) => normalizeAudienceCard(card, index))
        : current.audienceProfiles,
      featureScreenshots: Array.isArray(payload.featureScreenshots) && payload.featureScreenshots.length
        ? payload.featureScreenshots.map((card, index) => normalizeScreenshotCard(card, index))
        : current.featureScreenshots,
      pricingPlans: Array.isArray(payload.pricingPlans) && payload.pricingPlans.length
        ? payload.pricingPlans.map((plan, index) => normalizePlan(plan, index))
        : current.pricingPlans,
      enabledSections: normalizeSectionToggles(payload.enabledSections, current.enabledSections),
    };

    await saveLandingSettings({
      ...defaultLandingSettings,
      ...next,
    });
    return NextResponse.json(await getLandingSettings());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save landing settings' }, { status: 500 });
  }
}
