import PublicBlogPage from '@/components/PublicBlogPage';
import { buildPageMetadata } from '@/lib/seo';
import { getBlogCategories, getPublicBlogPosts } from '@/lib/server/blog';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export const metadata = buildPageMetadata({
  title: 'Docrud Blog | Product Notes, Workflow Ideas, AI Writing & Secure Collaboration',
  description:
    'Read premium product notes, workflow ideas, AI writing guides, secure sharing insights, and collaboration stories from docrud. Signed-in users can write and publish too.',
  path: '/blog',
  keywords: ['docrud blog', 'document workflow blog', 'ai writing blog', 'secure sharing blog', 'collaboration blog'],
  image: '/homepage/hero-workspace-meet.png',
});

export default async function BlogPage() {
  const [landingSettings, themeSettings, initialPosts, categories] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
    getPublicBlogPosts(),
    getBlogCategories(),
  ]);

  return (
    <PublicBlogPage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      initialPosts={initialPosts}
      categories={categories}
    />
  );
}
