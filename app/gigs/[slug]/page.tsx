import type { Metadata } from 'next';
import nextDynamic from 'next/dynamic';
import { buildPageMetadata, buildServiceSchema, buildBreadcrumbSchema, jsonLd, metaDesc } from '@/lib/seo';
import { getPublicGigBySlug } from '@/lib/server/gigs';
import { getPublicAppBaseUrl } from '@/lib/url';

export const dynamic = 'force-dynamic';

const GigDetailPage = nextDynamic(() => import('@/components/PublishedGigDetailPage'), { ssr: false });

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const gig = await getPublicGigBySlug(params.slug);
  const baseUrl = getPublicAppBaseUrl();

  if (!gig) {
    return buildPageMetadata({
      title: 'Gig | Docrud Gigs Marketplace',
      description: 'Find and connect with freelancers and service providers on Docrud.',
      path: `/gigs/${params.slug}`,
      noIndex: true,
    });
  }

  const title = `${gig.title} | ${gig.ownerName} | Docrud Gigs`;
  const description = metaDesc(gig.summary, 160);
  const keywords = [
    gig.title,
    gig.category,
    gig.ownerName,
    ...(gig.skills ?? []),
    ...(gig.interests ?? []),
    'freelance',
    'gig',
    'hire',
    'docrud gigs',
    gig.locationPreference,
  ].filter(Boolean) as string[];

  return buildPageMetadata({
    title,
    description,
    path: `/gigs/${gig.slug}`,
    keywords,
    ogType: 'product',
    modifiedTime: gig.updatedAt,
    publishedTime: gig.createdAt,
    tags: gig.skills ?? [],
    section: gig.category,
  });
}

export default async function GigDetailServerPage({ params }: { params: { slug: string } }) {
  const baseUrl = getPublicAppBaseUrl();
  const gig = await getPublicGigBySlug(params.slug);

  const serviceSchema = gig
    ? buildServiceSchema({
        name: gig.title,
        description: metaDesc(gig.summary, 500),
        category: gig.category,
        providerName: gig.ownerName,
        location: gig.locationPreference,
        areaServed: gig.locationPreference === 'remote' ? 'Worldwide' : 'India',
        url: `${baseUrl}/gigs/${gig.slug}`,
        skills: gig.skills,
        budget: gig.budgetLabel,
      })
    : null;

  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Gigs', url: `${baseUrl}/gigs` },
    ...(gig ? [{ name: gig.title, url: `${baseUrl}/gigs/${gig.slug}` }] : []),
  ]);

  return (
    <>
      {serviceSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(serviceSchema) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }}
      />
      <GigDetailPage />
    </>
  );
}
