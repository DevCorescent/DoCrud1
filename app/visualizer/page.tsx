import PublicVisualizerPage from '@/components/PublicVisualizerPage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Visualizer | Turn Data Into Clear Charts & Insights with Docrud',
  description:
    'Upload or paste data and turn it into simple charts, trends, and readable insights with the Docrud Visualizer.',
  path: '/visualizer',
  keywords: ['data visualizer', 'chart builder', 'visual insights', 'docrud visualizer'],
});

export default async function VisualizerPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicVisualizerPage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
    />
  );
}
