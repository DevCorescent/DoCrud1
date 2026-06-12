import PublicFormsPage from '@/components/PublicFormsPage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Forms | Docrud Form Builder, QR Forms & Response Collection',
  description:
    'Build polished public or secure forms with QR sharing, live response collection, analytics, and customizable layouts inside Docrud.',
  path: '/forms',
  keywords: ['form builder', 'qr forms', 'secure forms', 'response collection', 'docrud forms'],
});

export default async function FormsPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicFormsPage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      settings={landingSettings}
    />
  );
}
