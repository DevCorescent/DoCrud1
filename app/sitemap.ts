import type { MetadataRoute } from 'next';
import { getCertificates } from '@/lib/server/certificates';
import { getPublicBlogPosts } from '@/lib/server/blog';
import { getPublicDocrudiansData } from '@/lib/server/docrudians';
import { getPublicGigListings } from '@/lib/server/gigs';
import { getPublishedHiringJobs } from '@/lib/server/hiring';
import { getVirtualIdCards } from '@/lib/server/virtual-ids';
import { listBusinessPages, type BusinessPage } from '@/lib/server/business-pages';
import { listResumeDirectory } from '@/lib/server/resume-directory';
import { listMarketplaceItems } from '@/lib/server/template-marketplace';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { getPublicAppBaseUrl } from '@/lib/url';
import type { HiringJobPosting, SecureFileTransfer, TemplateMarketplaceItem } from '@/types/document';
import type { ResumeDirectoryEntry } from '@/lib/server/resume-directory';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getPublicAppBaseUrl();
  const now = new Date();

  const [
    jobs,
    certificates,
    virtualIds,
    docrudians,
    blogPosts,
    gigs,
    businesses,
    resumeDir,
    templates,
    fileTransfers,
  ] = await Promise.all([
    getPublishedHiringJobs(),
    getCertificates(),
    getVirtualIdCards(),
    getPublicDocrudiansData(),
    getPublicBlogPosts(),
    getPublicGigListings(),
    listBusinessPages({ limit: 2000 }).then((r) => r.pages).catch(() => []),
    listResumeDirectory({ limit: 2000 }).then((r) => r.entries).catch(() => []),
    listMarketplaceItems({ limit: 2000, sort: 'popular' }).then((r) => r.items).catch(() => []),
    getFileTransfers().catch(() => []),
  ]);

  /* ── Core platform pages ─────────────────────────────────────── */
  const coreRoutes: Array<{ path: string; freq: MetadataRoute.Sitemap[0]['changeFrequency']; priority: number }> = [
    { path: '',                       freq: 'daily',   priority: 1.00 },
    { path: '/people',                freq: 'daily',   priority: 0.95 },
    { path: '/gigs',                  freq: 'daily',   priority: 0.95 },
    { path: '/blog',                  freq: 'daily',   priority: 0.85 },
    { path: '/docrudians',            freq: 'daily',   priority: 0.82 },
    { path: '/published',             freq: 'daily',   priority: 0.88 },
    { path: '/businesses',            freq: 'daily',   priority: 0.88 },
    { path: '/talent',                freq: 'daily',   priority: 0.85 },
    { path: '/template-marketplace',  freq: 'daily',   priority: 0.83 },
  ];

  /* ── Product / feature pages ─────────────────────────────────── */
  const productRoutes: Array<{ path: string; freq: MetadataRoute.Sitemap[0]['changeFrequency']; priority: number }> = [
    { path: '/pricing',               freq: 'weekly',  priority: 0.90 },
    { path: '/forms',                 freq: 'weekly',  priority: 0.88 },
    { path: '/forms/builder',         freq: 'weekly',  priority: 0.82 },
    { path: '/pdf-editor',            freq: 'weekly',  priority: 0.88 },
    { path: '/pdf-editor/workspace',  freq: 'weekly',  priority: 0.78 },
    { path: '/resume-ats',            freq: 'weekly',  priority: 0.88 },
    { path: '/doxpert',               freq: 'weekly',  priority: 0.85 },
    { path: '/docword',               freq: 'weekly',  priority: 0.80 },
    { path: '/file-directory',        freq: 'weekly',  priority: 0.75 },
    { path: '/file-transfers',        freq: 'weekly',  priority: 0.72 },
    { path: '/visualizer',            freq: 'weekly',  priority: 0.72 },
    { path: '/document-encrypter',    freq: 'weekly',  priority: 0.72 },
    { path: '/daily-tools',           freq: 'weekly',  priority: 0.75 },
    { path: '/jobs',                  freq: 'daily',   priority: 0.88 },
  ];

  /* ── Info / support pages ────────────────────────────────────── */
  const infoRoutes: Array<{ path: string; freq: MetadataRoute.Sitemap[0]['changeFrequency']; priority: number }> = [
    { path: '/support',               freq: 'monthly', priority: 0.65 },
    { path: '/contact',               freq: 'monthly', priority: 0.65 },
    { path: '/schedule-demo',         freq: 'monthly', priority: 0.70 },
  ];

  const staticEntries: MetadataRoute.Sitemap = [
    ...coreRoutes,
    ...productRoutes,
    ...infoRoutes,
  ].map((r) => ({
    url: `${baseUrl}${r.path}`,
    lastModified: now,
    changeFrequency: r.freq,
    priority: r.priority,
  }));

  /* ── Dynamic entries ─────────────────────────────────────────── */

  const jobEntries: MetadataRoute.Sitemap = (jobs as HiringJobPosting[]).map((job) => ({
    url: `${baseUrl}/jobs/${job.id}`,
    lastModified: new Date(job.updatedAt || job.createdAt || now),
    changeFrequency: 'weekly' as const,
    priority: 0.82,
  }));

  const certificateEntries: MetadataRoute.Sitemap = certificates
    .filter((c) => (c as { status?: string }).status === 'published')
    .map((c) => ({
      url: `${baseUrl}/certificate/${(c as { slug: string }).slug}`,
      lastModified: new Date((c as { updatedAt?: string; createdAt?: string }).updatedAt || (c as { createdAt?: string }).createdAt || now),
      changeFrequency: 'monthly' as const,
      priority: 0.62,
    }));

  const virtualIdEntries: MetadataRoute.Sitemap = virtualIds
    .filter((card) => (card as { visibility?: string }).visibility === 'public')
    .map((card) => ({
      url: `${baseUrl}/id/${(card as { slug: string }).slug}`,
      lastModified: new Date((card as { updatedAt?: string; createdAt?: string }).updatedAt || (card as { createdAt?: string }).createdAt || now),
      changeFrequency: 'weekly' as const,
      priority: 0.70,
    }));

  const roomEntries: MetadataRoute.Sitemap = docrudians.circles.map((room) => ({
    url: `${baseUrl}/docrudians/room/${(room as { slug?: string; id: string }).slug || (room as { id: string }).id}`,
    lastModified: new Date((room as { updatedAt?: string; createdAt?: string }).updatedAt || (room as { createdAt?: string }).createdAt || now),
    changeFrequency: 'weekly' as const,
    priority: 0.70,
  }));

  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${(post as { slug: string }).slug}`,
    lastModified: new Date((post as { updatedAt?: string; publishedAt?: string }).updatedAt || (post as { publishedAt?: string }).publishedAt || now),
    changeFrequency: 'weekly' as const,
    priority: 0.78,
  }));

  const gigEntries: MetadataRoute.Sitemap = gigs.map((gig) => ({
    url: `${baseUrl}/gigs/${gig.slug}`,
    lastModified: new Date(gig.updatedAt || gig.createdAt || now),
    changeFrequency: 'daily' as const,
    priority: 0.82,
  }));

  const businessEntries: MetadataRoute.Sitemap = businesses
    .filter((b) => b.slug)
    .map((b) => ({
      url: `${baseUrl}/businesses/${b.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.80,
    }));

  const talentEntries: MetadataRoute.Sitemap = resumeDir
    .filter((e: ResumeDirectoryEntry) => e.visibility === 'public' && e.slug)
    .map((e: ResumeDirectoryEntry) => ({
      url: `${baseUrl}/talent/${e.slug}`,
      lastModified: new Date((e as { updatedAt?: string }).updatedAt || now),
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    }));

  const templateEntries: MetadataRoute.Sitemap = (templates as TemplateMarketplaceItem[])
    .filter((t) => t.status === 'published' && t.id)
    .map((t) => ({
      url: `${baseUrl}/template-marketplace/${t.id}`,
      lastModified: new Date(t.updatedAt || t.createdAt || now),
      changeFrequency: 'weekly' as const,
      priority: 0.72,
    }));

  const publishedItemEntries: MetadataRoute.Sitemap = (fileTransfers as SecureFileTransfer[])
    .filter((ft) => ft.directoryVisibility === 'public' && ft.id && !ft.revokedAt)
    .slice(0, 5000)   // cap to avoid huge sitemaps
    .map((ft) => ({
      url: `${baseUrl}/published/${ft.id}`,
      lastModified: new Date(ft.updatedAt || ft.createdAt || now),
      changeFrequency: 'weekly' as const,
      priority: 0.68,
    }));

  return [
    ...staticEntries,
    ...jobEntries,
    ...certificateEntries,
    ...virtualIdEntries,
    ...roomEntries,
    ...blogEntries,
    ...gigEntries,
    ...businessEntries,
    ...talentEntries,
    ...templateEntries,
    ...publishedItemEntries,
  ];
}
