import PublicPdfEditorWorkspacePage from '@/components/PublicPdfEditorWorkspacePage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'PDF Editor Workspace | Docrud',
  description:
    'Upload a PDF, convert it into an editable document, apply AI refinements, and export it back to PDF in the Docrud editor workspace.',
  path: '/pdf-editor/workspace',
  keywords: ['pdf workspace', 'editable pdf', 'ai pdf editor', 'pdf export'],
});

export default async function PdfEditorWorkspacePage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicPdfEditorWorkspacePage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      settings={landingSettings}
    />
  );
}
