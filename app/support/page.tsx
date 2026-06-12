import PublicSupportPage from '@/components/PublicSupportPage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Support | Docrud Help, Contact & Product Guidance',
  description:
    'Get support for Docrud features, workflows, billing, secure sharing, and setup with guided help and contact options.',
  path: '/support',
  keywords: ['docrud support', 'help center', 'product support', 'workflow help'],
});

export default async function SupportPage() {
  const [settings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicSupportPage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      settings={settings}
    />
  );
}
