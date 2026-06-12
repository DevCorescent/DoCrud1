import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';
import PublicDocSheetPage from '@/components/PublicDocSheetPage';

export const dynamic = 'force-dynamic';

export default async function DocSheetStudioPublicPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicDocSheetPage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
    />
  );
}
