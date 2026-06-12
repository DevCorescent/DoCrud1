import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';
import { buildPageMetadata } from '@/lib/seo';
import PublicEncrypterPage from '@/components/PublicEncrypterPage';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Document Encrypter | Protect Sensitive Files with Docrud',
  description:
    'Encrypt sensitive documents, add passwords, and protect file access with the Docrud document encrypter.',
  path: '/document-encrypter',
  keywords: ['document encrypter', 'encrypt files', 'protect documents', 'secure document tool'],
});

export default async function DocumentEncrypterPublicPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicEncrypterPage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
    />
  );
}
