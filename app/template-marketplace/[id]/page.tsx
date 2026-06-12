import type { Metadata } from 'next';
import { buildPageMetadata, buildProductSchema, buildBreadcrumbSchema, jsonLd, metaDesc } from '@/lib/seo';
import { getLandingSettings, getThemeSettings } from '@/lib/server/settings';
import { getMarketplaceItem } from '@/lib/server/template-marketplace';
import PublicTemplateMarketplaceItemPage from '@/components/PublicTemplateMarketplaceItemPage';
import { getPublicAppBaseUrl } from '@/lib/url';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const item = await getMarketplaceItem(params.id);

  if (!item || item.status !== 'published') {
    return buildPageMetadata({
      title: 'Template | Docrud Marketplace',
      description: 'Preview this template, read reviews, and install it into your workspace.',
      path: `/template-marketplace/${params.id}`,
      noIndex: true,
    });
  }

  const tplName = item.templateSnapshot?.name ?? 'Template';
  const tplDesc = item.templateSnapshot?.description ?? '';
  const tplCategory = item.templateSnapshot?.category ?? '';
  const tplTags = item.tags ?? [];

  const description =
    metaDesc(tplDesc, 160) ||
    `${tplName} — ${tplCategory} template on Docrud Marketplace.`;

  return buildPageMetadata({
    title: `${tplName} | ${tplCategory || 'Template'} | Docrud Marketplace`,
    description,
    path: `/template-marketplace/${params.id}`,
    keywords: [
      tplName,
      tplCategory,
      ...tplTags,
      'template',
      'document template',
      'docrud marketplace',
    ].filter(Boolean) as string[],
    ogType: 'product',
    tags: tplTags,
    section: tplCategory || undefined,
  });
}

export default async function TemplateMarketplaceItemPage({ params }: { params: { id: string } }) {
  const baseUrl = getPublicAppBaseUrl();
  const [landingSettings, themeSettings, item] = await Promise.all([
    getLandingSettings(),
    getThemeSettings(),
    getMarketplaceItem(params.id),
  ]);

  const productSchema =
    item && item.status === 'published'
      ? buildProductSchema({
          name: item.templateSnapshot?.name ?? 'Template',
          description: metaDesc(item.templateSnapshot?.description, 500),
          url: `${baseUrl}/template-marketplace/${params.id}`,
          category: item.templateSnapshot?.category,
          sellerName: item.sellerName ?? 'Docrud',
          price: item.priceInPaise != null ? item.priceInPaise / 100 : 0,
          currency: 'INR',
        })
      : null;

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Template Marketplace', url: `${baseUrl}/template-marketplace` },
    { name: item?.templateSnapshot?.name ?? 'Template', url: `${baseUrl}/template-marketplace/${params.id}` },
  ]);

  return (
    <>
      {productSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(productSchema) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }}
      />
      <PublicTemplateMarketplaceItemPage
        settings={landingSettings}
        softwareName={themeSettings.softwareName}
        accentLabel={themeSettings.accentLabel}
        itemId={params.id}
      />
    </>
  );
}
