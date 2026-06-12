import { Suspense } from 'react';
import PublicTalentDirectoryPage from '@/components/PublicTalentDirectoryPage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Talent Shortlists | Saved Candidates',
  description: 'Your saved shortlist of candidates in docrud Talent Directory.',
  path: '/talent/shortlists',
  keywords: ['talent shortlist', 'saved candidates', 'resume directory', 'docrud'],
});

export default async function TalentShortlistsPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-500">Loading Shortlists...</div>}>
      <PublicTalentDirectoryPage
        settings={landingSettings}
        softwareName={themeSettings.softwareName}
        accentLabel={themeSettings.accentLabel}
        mode="shortlists"
      />
    </Suspense>
  );
}

