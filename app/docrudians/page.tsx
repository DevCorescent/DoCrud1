import PublicDocrudiansPage from '@/components/PublicDocrudiansPage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Docrudians | Public & Private Rooms for Developers, Teams, Colleges & Events',
  description:
    'Create room-based communities for developers, students, colleges, events, and teams with public or private sharing, files, links, and activity tracking.',
  path: '/docrudians',
  keywords: ['professional rooms', 'private community rooms', 'developer rooms', 'college collaboration', 'docrudians'],
});

export default async function DocrudiansPage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <PublicDocrudiansPage
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      settings={landingSettings}
    />
  );
}
