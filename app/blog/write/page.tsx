import BlogEditorPage from '@/components/BlogEditorPage';
import { buildPageMetadata } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Write on Docrud Blog | Draft, Edit & Publish Posts',
  description:
    'Open the docrud blog editor to draft, improve, and publish blog posts with a cleaner writing flow and built-in AI help.',
  path: '/blog/write',
  keywords: ['docrud blog editor', 'write blog', 'publish blog post', 'ai blog writing'],
  noIndex: true,
});

export default async function BlogWritePage() {
  const [landingSettings, themeSettings] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
  ]);

  return (
    <BlogEditorPage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
    />
  );
}
