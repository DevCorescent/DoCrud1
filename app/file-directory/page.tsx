import PublicFileDirectoryPage from '@/components/PublicFileDirectoryPage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings, defaultLandingSettings, defaultThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'File Directory | Public Searchable Files & Private Lockers in Docrud',
  description:
    'Publish searchable public files or create private password-protected lockers with analytics, history, and secure access control in Docrud.',
  path: '/file-directory',
  keywords: ['file directory', 'private file locker', 'public file sharing', 'searchable files', 'docrud file directory'],
});

export default async function FileDirectoryPage() {
  let landingSettings = defaultLandingSettings;
  let themeSettings = defaultThemeSettings;
  try {
    const results = await Promise.all([getLandingSettings(), getThemeSettings()]);
    landingSettings = results[0];
    themeSettings = results[1];
  } catch {}

  return (
    <PublicFileDirectoryPage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
    />
  );
}
