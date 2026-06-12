import DailyToolsCenter from '@/components/DailyToolsCenter';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Daily Tools | Free Everyday Document & Utility Tools | Docrud',
  description:
    'Use Docrud Daily Tools for QR generation, password helpers, PDF cleanup, quick formatting, and everyday file workflows with no login required.',
  path: '/daily-tools',
  keywords: ['daily tools', 'free utility tools', 'qr generator', 'pdf cleanup', 'document utilities'],
});

export default async function PublicDailyToolsPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicSiteChrome
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      settings={landingSettings}
    >
      <section>
        <DailyToolsCenter />
      </section>
    </PublicSiteChrome>
  );
}
