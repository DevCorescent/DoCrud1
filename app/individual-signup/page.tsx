import PublicSiteChrome from '@/components/PublicSiteChrome';
import IndividualSignupForm from '@/components/IndividualSignupForm';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Individual Signup | Create Your Docrud Profile',
  description: 'Create your Docrud individual profile to access resume tools, AI features, secure sharing, and personal workflows.',
  path: '/individual-signup',
  keywords: ['individual signup', 'personal profile', 'docrud account'],
  noIndex: true,
});

export default async function IndividualSignupPage({
  searchParams,
}: {
  searchParams?: { plan?: string; config?: string; ref?: string };
}) {
  const [settings, themeSettings] = await Promise.all([getLandingSettings(), getThemeSettings()]);
  return (
    <PublicSiteChrome softwareName={themeSettings.softwareName} accentLabel={themeSettings.accentLabel} settings={settings}>
      <section className="overflow-x-hidden py-4 sm:py-6">
        <div className="mx-auto w-full max-w-5xl px-4">
          <IndividualSignupForm initialPlanId={searchParams?.plan} initialConfig={searchParams?.config} initialReferralCode={searchParams?.ref} />
        </div>
      </section>
    </PublicSiteChrome>
  );
}
