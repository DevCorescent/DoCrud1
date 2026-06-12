import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';
import PublicTemplateMarketplacePage from '@/components/PublicTemplateMarketplacePage';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Template Marketplace | Buy and Install Templates | docrud',
  description: 'Browse templates, purchase with Razorpay, and install into your docrud workspace.',
  path: '/template-marketplace',
  keywords: ['template marketplace', 'document templates', 'docrud', 'html templates', 'buy templates'],
});

export default async function TemplateMarketplacePage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicTemplateMarketplacePage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
    />
  );
}

