import type { Metadata } from 'next';
import { getPublicAppBaseUrl } from '@/lib/url';

/* ── Types ──────────────────────────────────────────────────────── */

type OgType = 'website' | 'article' | 'profile' | 'product';

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  image?: string;
  imageWidth?: number;
  imageHeight?: number;
  noIndex?: boolean;
  ogType?: OgType;
  publishedTime?: string;   // ISO 8601
  modifiedTime?: string;    // ISO 8601
  authors?: string[];
  section?: string;         // article:section
  tags?: string[];          // article:tag
  locale?: string;
};

const defaultOgImage = '/docrud-favicon.png';
const SITE_NAME = 'Docrud';

/* ── Core metadata builder ──────────────────────────────────────── */

export function buildPageMetadata({
  title,
  description,
  path,
  keywords = [],
  image = defaultOgImage,
  imageWidth = 1200,
  imageHeight = 630,
  noIndex = false,
  ogType = 'website',
  publishedTime,
  modifiedTime,
  authors = [],
  section,
  tags = [],
  locale = 'en_IN',
}: PageMetadataOptions): Metadata {
  const baseUrl = getPublicAppBaseUrl();
  const url = new URL(path, baseUrl).toString();
  const imageUrl = image.startsWith('http') ? image : new URL(image, baseUrl).toString();

  const allKeywords = Array.from(new Set([...keywords, ...tags]));

  return {
    title,
    description,
    keywords: allKeywords.length > 0 ? allKeywords : undefined,
    alternates: { canonical: url },
    openGraph: ogType === 'article'
      ? {
          type: 'article' as const,
          title,
          description,
          url,
          siteName: SITE_NAME,
          locale,
          images: [{ url: imageUrl, width: imageWidth, height: imageHeight, alt: title }],
          publishedTime,
          modifiedTime,
          authors,
          section,
          tags,
        }
      : {
          type: (ogType === 'profile' ? 'profile' : ogType === 'product' ? 'website' : 'website') as 'website' | 'profile',
          title,
          description,
          url,
          siteName: SITE_NAME,
          locale,
          images: [{ url: imageUrl, width: imageWidth, height: imageHeight, alt: title }],
        },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
      site: '@docrud',
      creator: '@docrud',
    },
    robots: noIndex
      ? { index: false, follow: false, googleBot: { index: false, follow: false } }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            'max-image-preview': 'large',
            'max-snippet': -1,
            'max-video-preview': -1,
          },
        },
  };
}

/* ── JSON-LD schema builders ────────────────────────────────────── */

export function buildBreadcrumbSchema(
  items: Array<{ name: string; url: string }>,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function buildJobPostingSchema(opts: {
  title: string;
  description: string;
  organizationName: string;
  location?: string;
  remoteAllowed?: boolean;
  employmentType?: string;
  salary?: string;
  postedAt?: string;
  validThrough?: string;
  url: string;
  logoUrl?: string;
}): Record<string, unknown> {
  const baseUrl = getPublicAppBaseUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: opts.title,
    description: opts.description,
    datePosted: opts.postedAt ?? new Date().toISOString(),
    ...(opts.validThrough && { validThrough: opts.validThrough }),
    employmentType: opts.employmentType ?? 'FULL_TIME',
    hiringOrganization: {
      '@type': 'Organization',
      name: opts.organizationName,
      ...(opts.logoUrl && { logo: opts.logoUrl }),
      sameAs: baseUrl,
    },
    jobLocation: opts.remoteAllowed
      ? { '@type': 'Place', address: opts.location ?? 'India' }
      : { '@type': 'Place', address: { '@type': 'PostalAddress', addressCountry: 'IN', addressLocality: opts.location ?? 'India' } },
    ...(opts.remoteAllowed && { jobLocationType: 'TELECOMMUTE' }),
    ...(opts.salary && { baseSalary: { '@type': 'MonetaryAmount', currency: 'INR', value: { '@type': 'QuantitativeValue', description: opts.salary } } }),
    url: opts.url,
  };
}

export function buildPersonSchema(opts: {
  name: string;
  headline?: string;
  description?: string;
  location?: string;
  skills?: string[];
  url: string;
  imageUrl?: string;
  sameAs?: string[];
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: opts.name,
    ...(opts.headline && { jobTitle: opts.headline }),
    ...(opts.description && { description: opts.description }),
    ...(opts.location && { address: { '@type': 'PostalAddress', addressLocality: opts.location, addressCountry: 'IN' } }),
    ...(opts.skills?.length && { knowsAbout: opts.skills }),
    url: opts.url,
    ...(opts.imageUrl && { image: opts.imageUrl }),
    ...(opts.sameAs?.length && { sameAs: opts.sameAs }),
    worksFor: { '@type': 'Organization', name: 'Docrud Platform' },
  };
}

export function buildOrganizationSchema(opts: {
  name: string;
  description?: string;
  tagline?: string;
  url?: string;
  logoUrl?: string;
  location?: string;
  industry?: string;
  foundedYear?: number;
  sameAs?: string[];
}): Record<string, unknown> {
  const baseUrl = getPublicAppBaseUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: opts.name,
    ...(opts.description && { description: opts.description }),
    ...(opts.tagline && { slogan: opts.tagline }),
    url: opts.url ?? baseUrl,
    ...(opts.logoUrl && { logo: { '@type': 'ImageObject', url: opts.logoUrl } }),
    ...(opts.location && { address: { '@type': 'PostalAddress', addressLocality: opts.location, addressCountry: 'IN' } }),
    ...(opts.industry && { industry: opts.industry }),
    ...(opts.foundedYear && { foundingDate: String(opts.foundedYear) }),
    ...(opts.sameAs?.length && { sameAs: opts.sameAs }),
    memberOf: { '@type': 'Organization', name: 'Docrud', url: baseUrl },
  };
}

export function buildServiceSchema(opts: {
  name: string;
  description: string;
  category?: string;
  providerName: string;
  location?: string;
  areaServed?: string;
  url: string;
  imageUrl?: string;
  skills?: string[];
  budget?: string;
}): Record<string, unknown> {
  const baseUrl = getPublicAppBaseUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: opts.name,
    description: opts.description,
    ...(opts.category && { serviceType: opts.category }),
    provider: {
      '@type': 'Person',
      name: opts.providerName,
    },
    areaServed: opts.areaServed ?? opts.location ?? 'India',
    ...(opts.location === 'remote' || opts.areaServed === 'remote'
      ? { availableChannel: { '@type': 'ServiceChannel', serviceType: 'Online' } }
      : {}),
    url: opts.url,
    ...(opts.imageUrl && { image: opts.imageUrl }),
    ...(opts.skills?.length && { hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Skills', itemListElement: opts.skills.map(s => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s } })) } }),
    ...(opts.budget && { offers: { '@type': 'Offer', priceCurrency: 'INR', description: opts.budget, seller: { '@type': 'Person', name: opts.providerName } } }),
    isRelatedTo: { '@type': 'WebSite', name: 'Docrud', url: baseUrl },
  };
}

export function buildArticleSchema(opts: {
  headline: string;
  description?: string;
  authorName: string;
  publishedAt?: string;
  modifiedAt?: string;
  imageUrl?: string;
  url: string;
  tags?: string[];
  section?: string;
  publisherName?: string;
  type?: 'Article' | 'NewsArticle' | 'BlogPosting' | 'TechArticle';
}): Record<string, unknown> {
  const baseUrl = getPublicAppBaseUrl();
  return {
    '@context': 'https://schema.org',
    '@type': opts.type ?? 'Article',
    headline: opts.headline,
    ...(opts.description && { description: opts.description }),
    author: { '@type': 'Person', name: opts.authorName },
    publisher: {
      '@type': 'Organization',
      name: opts.publisherName ?? 'Docrud',
      url: baseUrl,
      logo: { '@type': 'ImageObject', url: `${baseUrl}/docrud-favicon.png` },
    },
    ...(opts.publishedAt && { datePublished: opts.publishedAt }),
    ...(opts.modifiedAt && { dateModified: opts.modifiedAt }),
    ...(opts.imageUrl && { image: [opts.imageUrl] }),
    ...(opts.tags?.length && { keywords: opts.tags.join(', ') }),
    ...(opts.section && { articleSection: opts.section }),
    url: opts.url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': opts.url },
  };
}

export function buildProductSchema(opts: {
  name: string;
  description: string;
  url: string;
  imageUrl?: string;
  category?: string;
  sellerName: string;
  price?: number;
  currency?: string;
  rating?: number;
  reviewCount?: number;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    ...(opts.imageUrl && { image: opts.imageUrl }),
    ...(opts.category && { category: opts.category }),
    brand: { '@type': 'Brand', name: opts.sellerName },
    offers: {
      '@type': 'Offer',
      priceCurrency: opts.currency ?? 'INR',
      ...(opts.price != null ? { price: opts.price } : { price: '0', priceValidUntil: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0] }),
      availability: 'https://schema.org/InStock',
      seller: { '@type': 'Person', name: opts.sellerName },
    },
    ...(opts.rating != null && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: opts.rating,
        reviewCount: opts.reviewCount ?? 1,
        bestRating: 5,
        worstRating: 1,
      },
    }),
  };
}

export function buildWebPageSchema(opts: {
  name: string;
  description: string;
  url: string;
  breadcrumb?: Array<{ name: string; url: string }>;
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    ...(opts.breadcrumb?.length && {
      breadcrumb: buildBreadcrumbSchema(opts.breadcrumb),
    }),
  };
}

/* ── Convenience ────────────────────────────────────────────────── */

/** Renders a JSON-LD schema as a <script> tag string for use in JSX.
 *  Usage: <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
 */
export function jsonLd(schema: Record<string, unknown>): string {
  return JSON.stringify(schema);
}

/** Cleans a string for safe use in meta descriptions (removes HTML, collapses whitespace) */
export function metaDesc(raw: string | undefined | null, maxLen = 160): string {
  if (!raw) return '';
  const cleaned = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen - 1) + '…' : cleaned;
}
