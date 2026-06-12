import { Suspense } from 'react';
import PublicTalentDirectoryPage from '@/components/PublicTalentDirectoryPage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Talent Directory | Publish Your Resume and Get Found',
  description:
    'Publish a premium resume card, add skills and categories, and let recruiters search and contact you through docrud.',
  path: '/talent',
  keywords: ['resume directory', 'publish resume', 'talent search', 'skills search', 'docrud talent'],
});

export default async function TalentDirectoryPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">Loading Talent Directory...</div>}>
      <PublicTalentDirectoryPage
        settings={landingSettings}
        softwareName={themeSettings.softwareName}
        accentLabel={themeSettings.accentLabel}
      />
    </Suspense>
  );
}
