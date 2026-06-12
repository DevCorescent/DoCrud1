import PublicDoxpertPage from '@/components/PublicDoxpertPage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'DoXpert AI | AI Document Review, Risk Flags & Smarter Replies',
  description:
    'Understand documents faster with AI review, clearer summaries, risk signals, missing points, and next-step guidance from DoXpert AI.',
  path: '/doxpert',
  keywords: ['ai document review', 'document risk analysis', 'contract summary ai', 'doxpert ai'],
});

export default async function DoxpertPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicDoxpertPage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
    />
  );
}
