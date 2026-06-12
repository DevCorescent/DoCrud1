import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';
import PublicUpcomingFeaturesPage from '@/components/PublicUpcomingFeaturesPage';

export const dynamic = 'force-dynamic';

export default async function UpcomingFeaturesPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicUpcomingFeaturesPage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
    />
  );
}
