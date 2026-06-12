import PublicOfflineUnlockPage from '@/components/PublicOfflineUnlockPage';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export default async function OfflineUnlockPage() {
  const [settings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicOfflineUnlockPage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      settings={settings}
    />
  );
}
