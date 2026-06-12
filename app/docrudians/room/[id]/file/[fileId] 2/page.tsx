import PublicDocrudiansFilePage from '@/components/PublicDocrudiansFilePage';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export default async function DocrudiansRoomFilePage({ params }: { params: Promise<{ id: string; fileId: string }> }) {
  const [{ id, fileId }, landingSettings, themeSettings] = await Promise.all([
    params,
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicDocrudiansFilePage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      settings={landingSettings}
      roomId={id}
      fileId={fileId}
    />
  );
}
