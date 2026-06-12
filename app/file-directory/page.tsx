import PublicFileDirectoryPage from '@/components/PublicFileDirectoryPage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'File Directory | Public Searchable Files & Private Lockers in Docrud',
  description:
    'Publish searchable public files or create private password-protected lockers with analytics, history, and secure access control in Docrud.',
  path: '/file-directory',
  keywords: ['file directory', 'private file locker', 'public file sharing', 'searchable files', 'docrud file directory'],
});

export default async function FileDirectoryPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicFileDirectoryPage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
    />
  );
}
