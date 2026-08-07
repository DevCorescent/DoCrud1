import PublicKnowledgeBasePage from '@/components/PublicKnowledgeBasePage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings, defaultLandingSettings, defaultThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Knowledge Base | Docrud',
  description: 'A public, curated knowledge base published from AI search summaries inside docrud.',
  path: '/knowledge',
  keywords: ['knowledge base', 'docrud', 'ai search', 'summaries'],
});

export default async function KnowledgeBasePage() {
  let landingSettings = defaultLandingSettings;
  let themeSettings = defaultThemeSettings;
  try {
    const results = await Promise.all([getLandingSettings(), getThemeSettings()]);
    landingSettings = results[0];
    themeSettings = results[1];
  } catch {}

  return (
    <PublicKnowledgeBasePage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
    />
  );
}

