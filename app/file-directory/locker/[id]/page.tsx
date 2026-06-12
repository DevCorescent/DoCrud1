import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';
import PublicFileLockerPage from '@/components/PublicFileLockerPage';

export default async function FileDirectoryLockerRoute() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicFileLockerPage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      settings={landingSettings}
    />
  );
}
