import PublicFormsBuilderPage from '@/components/PublicFormsBuilderPage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Forms Builder Workspace | Docrud',
  description:
    'Design responsive, secure, and branded forms in a dedicated full-page builder with live preview, QR publishing, and submission controls.',
  path: '/forms/builder',
  keywords: ['forms builder', 'form workspace', 'responsive form builder', 'secure form designer'],
});

export default async function FormsBuilderPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicFormsBuilderPage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      settings={landingSettings}
    />
  );
}
