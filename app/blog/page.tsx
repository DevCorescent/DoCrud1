import PublicBlogPage from '@/components/PublicBlogPage';
import { buildPageMetadata } from '@/lib/seo';
import { getBlogCategories, getPublicBlogPosts } from '@/lib/server/blog';
import { getLandingSettings, getThemeSettings, defaultLandingSettings, defaultThemeSettings } from '@/lib/server/settings';

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
  let landingSettings = defaultLandingSettings;
  let themeSettings = defaultThemeSettings;
  let initialPosts: Awaited<ReturnType<typeof getPublicBlogPosts>> = [];
  let categories: string[] = [];
  try {
    const results = await Promise.all([getLandingSettings(), getThemeSettings(), getPublicBlogPosts(), getBlogCategories()]);
    landingSettings = results[0];
    themeSettings = results[1];
    initialPosts = results[2];
    categories = results[3];
  } catch {}

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
