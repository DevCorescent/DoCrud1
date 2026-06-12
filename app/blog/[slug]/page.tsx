import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicBlogArticlePage from '@/components/PublicBlogArticlePage';
import { buildPageMetadata } from '@/lib/seo';
import { getBlogPostBySlug, getPublicBlogPosts } from '@/lib/server/blog';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getBlogPostBySlug(params.slug);
  if (!post || post.status !== 'published') {
    return buildPageMetadata({
      title: 'Blog Post | Docrud',
      description: 'Read the latest product and workflow writing from docrud.',
      path: `/blog/${params.slug}`,
      noIndex: true,
    });
  }

  return buildPageMetadata({
    title: post.seoTitle || `${post.title} | Docrud Blog`,
    description: post.seoDescription || post.excerpt,
    path: `/blog/${post.slug}`,
    keywords: [...(post.tags || []), post.category, 'docrud blog'],
    image: post.coverImageUrl || '/homepage/hero-workspace-meet.png',
  });
}

export default async function BlogArticlePage({ params }: { params: { slug: string } }) {
  const [landingSettings, themeSettings, post, publicPosts] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
    getBlogPostBySlug(params.slug),
    getPublicBlogPosts(),
  ]);

  if (!post || post.status !== 'published') {
    notFound();
  }

  const relatedPosts = publicPosts
    .filter((entry) => entry.id !== post.id)
    .slice(0, 3);

  return (
    <PublicBlogArticlePage
      settings={landingSettings}
      softwareName={themeSettings.softwareName}
      accentLabel={themeSettings.accentLabel}
      post={post}
      relatedPosts={relatedPosts}
    />
  );
}
