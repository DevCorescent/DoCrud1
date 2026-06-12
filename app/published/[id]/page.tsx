import type { Metadata } from 'next';
import PublishedItemPage from '@/components/PublishedItemPage';
import { buildPageMetadata, buildArticleSchema, buildBreadcrumbSchema, jsonLd, metaDesc } from '@/lib/seo';
import { getPublishedItemById } from '@/lib/server/feed-moderation';
import { getPublicAppBaseUrl } from '@/lib/url';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const item = await getPublishedItemById(params.id);

  if (!item || item.directoryVisibility !== 'public') {
    return buildPageMetadata({
      title: 'Published Content | Docrud',
      description: 'View published documents, articles, portfolios and more on Docrud.',
      path: `/published/${params.id}`,
      noIndex: true,
    });
  }

  const title = item.title || item.fileName || 'Published Content';
  const description =
    metaDesc(item.notes, 160) ||
    `${title} — shared publicly on Docrud by ${item.uploadedBy}.`;
  const category = item.directoryCategory ?? 'Document';
  const tags = Array.isArray(item.directoryTags) ? item.directoryTags.map(String) : [];

  return buildPageMetadata({
    title: `${title} | Docrud`,
    description,
    path: `/published/${params.id}`,
    keywords: [title, category, item.uploadedBy, ...tags, 'published', 'docrud', 'document'].filter(Boolean) as string[],
    image: item.thumbnailUrl ?? undefined,
    ogType: 'article',
    publishedTime: item.createdAt ? new Date(item.createdAt).toISOString() : undefined,
    modifiedTime: item.updatedAt ? new Date(item.updatedAt).toISOString() : undefined,
    authors: [item.uploadedBy],
    section: category,
    tags,
  });
}

export default async function Page({ params }: { params: { id: string } }) {
  const baseUrl = getPublicAppBaseUrl();
  const item = await getPublishedItemById(params.id);

  const articleSchema =
    item && item.directoryVisibility === 'public'
      ? buildArticleSchema({
          headline: item.title || item.fileName || 'Published Content',
          description: metaDesc(item.notes, 300),
          authorName: item.uploadedBy,
          publishedAt: item.createdAt ? new Date(item.createdAt).toISOString() : undefined,
          modifiedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : undefined,
          imageUrl: item.thumbnailUrl ?? undefined,
          url: `${baseUrl}/published/${params.id}`,
          tags: Array.isArray(item.directoryTags) ? item.directoryTags.map(String) : [],
          section: item.directoryCategory ?? undefined,
          type: 'Article',
        })
      : null;

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Published', url: `${baseUrl}/published` },
    { name: item?.title || item?.fileName || 'Item', url: `${baseUrl}/published/${params.id}` },
  ]);

  return (
    <>
      {articleSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(articleSchema) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }}
      />
      <PublishedItemPage id={params.id} />
    </>
  );
}
