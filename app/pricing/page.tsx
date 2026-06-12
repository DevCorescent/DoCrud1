import PublicSiteChrome from '@/components/PublicSiteChrome';
import PricingExperience from '@/components/PricingExperience';
import { buildPageMetadata } from '@/lib/seo';
import { getThemeSettings, getLandingSettings } from '@/lib/server/settings';
import { getPublicSaasPlansByAudience } from '@/lib/server/saas';
import { getAuthSession } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Pricing | docrud Workspace Trial, Pro & Build Your Own',
  description:
    'Explore the docrud Workspace Trial, the â‚¹299/month Pro plan, and a build-your-own recurring workspace for documents, AI tools, file sharing, and secure operations.',
  path: '/pricing',
  keywords: ['docrud pricing', 'docrud workspace pro', 'document workflow pricing', 'custom workspace plan'],
});

export default async function PricingPage() {
  const [settings, themeSettings, businessPlans, individualPlans, session] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
    getPublicSaasPlansByAudience('business'),
    getPublicSaasPlansByAudience('individual'),
    getAuthSession(),
  ]);

  return (
    <PublicSiteChrome softwareName={themeSettings.softwareName} accentLabel={themeSettings.accentLabel} settings={settings}>
      <PricingExperience
        businessPlans={businessPlans}
        individualPlans={individualPlans}
        isAuthenticated={Boolean(session?.user)}
        authenticatedAccountType={session?.user?.accountType === 'individual' ? 'individual' : (session?.user ? 'business' : null)}
        pricingPageTitle={settings.pricingPageTitle}
        pricingPageSubtitle={settings.pricingPageSubtitle}
      />
    </PublicSiteChrome>
  );
}
