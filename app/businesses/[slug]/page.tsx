import type { Metadata } from 'next';
import nextDynamic from 'next/dynamic';
import { buildPageMetadata, buildOrganizationSchema, buildBreadcrumbSchema, jsonLd, metaDesc } from '@/lib/seo';
import { getBusinessPageBySlug } from '@/lib/server/business-pages';
import { getPublicAppBaseUrl } from '@/lib/url';

export const dynamic = 'force-dynamic';

const BusinessPageView = nextDynamic(() => import('@/components/BusinessPageView'), { ssr: false });

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const business = await getBusinessPageBySlug(params.slug);
  const baseUrl = getPublicAppBaseUrl();

  if (!business) {
    return buildPageMetadata({
      title: 'Business | Docrud',
      description: 'View company profiles, job openings, services, and events on Docrud.',
      path: `/businesses/${params.slug}`,
      noIndex: true,
    });
  }

  const title = `${business.name} | ${business.industry ?? 'Business'} | Docrud`;
  const description = metaDesc(business.description || business.tagline, 160) ||
    `${business.name} — ${business.industry ?? 'business'} company on Docrud. View jobs, services, and company profile.`;

  return buildPageMetadata({
    title,
    description,
    path: `/businesses/${params.slug}`,
    keywords: [
      business.name,
      business.industry ?? '',
      business.location ?? business.city ?? '',
      business.tagline ?? '',
      'company profile',
      'business',
      'docrud businesses',
    ].filter(Boolean) as string[],
    image: business.logoUrl ?? undefined,
    imageWidth: 400,
    imageHeight: 400,
    ogType: 'profile',
  });
}

export default async function BusinessPageRoute({ params }: { params: { slug: string } }) {
  const baseUrl = getPublicAppBaseUrl();
  const business = await getBusinessPageBySlug(params.slug);

  const orgSchema = business
    ? buildOrganizationSchema({
        name: business.name,
        description: metaDesc(business.description, 500),
        tagline: business.tagline,
        url: business.website ?? `${baseUrl}/businesses/${params.slug}`,
        logoUrl: business.logoUrl,
        location: business.location ?? business.city,
        industry: business.industry,
        foundedYear: business.foundedYear,
      })
    : null;

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Businesses', url: `${baseUrl}/businesses` },
    { name: business?.name ?? params.slug, url: `${baseUrl}/businesses/${params.slug}` },
  ]);

  return (
    <>
      {orgSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(orgSchema) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }}
      />
      <BusinessPageView slug={params.slug} />
    </>
  );
}
