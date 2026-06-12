import PublicResumeAtsPage from '@/components/PublicResumeAtsPage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Resume ATS Checker | Score, Improve & Generate Better Resumes',
  description:
    'Check your resume ATS score, get AI-backed suggestions, generate a stronger version, compare before and after, and apply for matched jobs.',
  path: '/resume-ats',
  keywords: ['resume ats checker', 'resume score', 'resume builder ai', 'ats resume optimizer'],
});

export default async function ResumeAtsPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicResumeAtsPage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      settings={landingSettings}
    />
  );
}
