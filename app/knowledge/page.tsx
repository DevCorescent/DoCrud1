import PublicKnowledgeBasePage from '@/components/PublicKnowledgeBasePage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Knowledge Base | Docrud',
  description: 'A public, curated knowledge base published from AI search summaries inside docrud.',
  path: '/knowledge',
  keywords: ['knowledge base', 'docrud', 'ai search', 'summaries'],
});

export default async function KnowledgeBasePage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicKnowledgeBasePage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
    />
  );
}

