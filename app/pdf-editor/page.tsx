import PublicPdfEditorPage from '@/components/PublicPdfEditorPage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'PDF Editor | Edit, Convert, Clean & Export PDFs with Docrud',
  description:
    'Use Docrud PDF Editor to edit, convert, clean, and export PDFs with an easy full-page workflow for daily document operations.',
  path: '/pdf-editor',
  keywords: ['pdf editor', 'edit pdf', 'convert pdf', 'free pdf tools', 'docrud pdf editor'],
});

export default async function PdfEditorPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicPdfEditorPage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      settings={landingSettings}
    />
  );
}
