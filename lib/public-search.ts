import { searchPublicDirectory } from '@/lib/server/file-directory';
import { getPublicBlogPosts } from '@/lib/server/blog';
import { getPublicGigListings } from '@/lib/server/gigs';
import { searchPublicResumes } from '@/lib/server/resume-directory';
import { FEED_ITEMS } from '@/lib/published-feed-data';

export interface PublicSearchMeta {
  skills?: string[];
  tags?: string[];
  budget?: string;
  timeline?: string;
  engagement?: string;
  location?: string;
  headline?: string;
  urgent?: boolean;
  viewCount?: number;
  updatedAt?: string;
  avatarUrl?: string;
}

export interface PublicSearchResult {
  id: string;
  title: string;
  description: string;
  href: string;
  type: 'feature' | 'page' | 'file' | 'article';
  category: string;
  badge?: string;
  meta?: PublicSearchMeta;
}

const STATIC_RESULTS: PublicSearchResult[] = [
  { id: 'feature-forms', title: 'Forms', description: 'Build polished forms with QR and response tracking.', href: '/forms', type: 'feature', category: 'Build', badge: 'FREE' },
  { id: 'feature-pdf-editor', title: 'PDF Editor', description: 'Edit, merge, split, and export PDFs.', href: '/pdf-editor', type: 'feature', category: 'Build', badge: 'FREE' },
  { id: 'feature-file-directory', title: 'File Directory', description: 'Publish public files or lock private ones.', href: '/file-directory', type: 'feature', category: 'Build', badge: 'FREE' },
  { id: 'feature-gigs', title: 'Gigs', description: 'Explore project gigs by interest and publish cleaner work briefs.', href: '/gigs', type: 'feature', category: 'Work', badge: 'NEW' },
  { id: 'feature-daily-tools', title: 'Daily Tools', description: 'Open converters and everyday utility tools.', href: '/daily-tools', type: 'feature', category: 'Build', badge: 'FREE' },
  { id: 'feature-docrudians', title: 'Docrudians', description: 'Create public and private rooms for sharing work.', href: '/docrudians', type: 'feature', category: 'Community', badge: 'NEW' },
  { id: 'feature-resume-ats', title: 'Resume ATS', description: 'Score resumes and improve faster.', href: '/resume-ats', type: 'feature', category: 'AI' },
  { id: 'feature-talent', title: 'Talent Directory', description: 'Publish your resume and get found by skills.', href: '/talent', type: 'feature', category: 'Work', badge: 'NEW' },
  { id: 'feature-doxpert', title: 'DoXpert AI', description: 'Review documents with AI.', href: '/doxpert', type: 'feature', category: 'AI' },
  { id: 'feature-visualizer', title: 'Visualizer AI', description: 'Turn dense data into visual insights.', href: '/visualizer', type: 'feature', category: 'AI' },
  { id: 'feature-file-transfers', title: 'File Transfers', description: 'Share files with control and tracking.', href: '/file-transfers', type: 'feature', category: 'Secure' },
  { id: 'feature-encrypter', title: 'Document Encrypter', description: 'Lock sensitive files before delivery.', href: '/document-encrypter', type: 'feature', category: 'Secure' },
  { id: 'page-pricing', title: 'Pricing', description: 'See plans, limits, and product access.', href: '/pricing', type: 'page', category: 'Business' },
  { id: 'page-blog', title: 'Blog', description: 'Read product notes, workflow ideas, and writing from docrud.', href: '/blog', type: 'page', category: 'Insights' },
  { id: 'page-template-marketplace', title: 'Template Marketplace', description: 'Buy templates and install them into your workspace.', href: '/template-marketplace', type: 'page', category: 'Build', badge: 'NEW' },
  { id: 'page-support', title: 'Support', description: 'Get help and product guidance.', href: '/support', type: 'page', category: 'Help' },
  { id: 'page-contact', title: 'Contact', description: 'Talk to the docrud team.', href: '/contact', type: 'page', category: 'Help' },
];

function normalize(value?: string) {
  return (value || '').trim().toLowerCase();
}

function tokenize(q: string): string[] {
  return q.split(/[\s\-_,./]+/).map((t) => t.trim()).filter((t) => t.length > 1).slice(0, 8);
}

// Multi-token weighted scorer — same strategy as global-search but inline here
function scoreMultiField(fields: Array<{ text: string; weight: number }>, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const tokens = tokenize(q);
  let total = 0;
  for (const { text, weight } of fields) {
    const t = normalize(text);
    if (!t) continue;
    if (t === q) { total += 40 * weight; continue; }
    if (t.startsWith(q)) { total += 22 * weight; }
    else if (t.includes(q)) { total += 14 * weight; }
    const words = t.split(/\s+/);
    for (const token of tokens) {
      if (words.includes(token)) total += (token.length >= 5 ? 12 : 8) * weight;
      else if (t.includes(token)) total += (token.length >= 4 ? 6 : 4) * weight;
    }
  }
  return total;
}

function scoreStaticResult(entry: PublicSearchResult, query: string) {
  return scoreMultiField([
    { text: entry.title,       weight: 3 },
    { text: entry.description, weight: 2 },
    { text: entry.category,    weight: 1 },
  ], query);
}

export async function runPublicSearch(query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const staticMatches = STATIC_RESULTS
    .map((entry) => ({ entry, score: scoreStaticResult(entry, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ entry }) => entry);

  const [fileMatches, blogPosts, gigs, resumes] = await Promise.all([
    searchPublicDirectory({ query: normalizedQuery, limit: 4 }),
    getPublicBlogPosts(),
    getPublicGigListings(),
    searchPublicResumes(normalizedQuery, 4),
  ]);

  // ── Blog posts — multi-token scored ──────────────────────────────────────
  const blogResults: PublicSearchResult[] = blogPosts
    .map((post) => ({
      entry: {
        id: `blog-${post.id}`,
        title: post.title,
        description: post.excerpt,
        href: `/blog/${post.slug}`,
        type: 'article' as const,
        category: post.category || 'Blog',
        badge: 'BLOG',
        meta: { tags: (post.tags ?? []).slice(0, 6) },
      },
      score: scoreMultiField([
        { text: post.title,                        weight: 3 },
        { text: post.excerpt,                      weight: 2 },
        { text: post.category ?? '',               weight: 1.5 },
        { text: (post.tags ?? []).join(' '),        weight: 2 },
      ], normalizedQuery),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ entry }) => entry);

  // ── Published feed items — multi-token scored ─────────────────────────────
  const feedResults: PublicSearchResult[] = FEED_ITEMS
    .map((item) => ({
      entry: {
        id: `feed-${item.id}`,
        title: item.title,
        description: item.body.slice(0, 120),
        href: `/published/${item.id}`,
        type: 'article' as const,
        category: item.category.charAt(0).toUpperCase() + item.category.slice(1),
        badge: 'BLOG',
        meta: { tags: (item.chips ?? []).slice(0, 6) },
      },
      score: scoreMultiField([
        { text: item.title,                       weight: 3 },
        { text: item.body,                        weight: 2 },
        { text: item.category,                    weight: 1.5 },
        { text: item.badge,                       weight: 1 },
        { text: item.byline,                      weight: 1 },
        { text: (item.chips ?? []).join(' '),      weight: 2.5 },
      ], normalizedQuery),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ entry }) => entry);

  // ── Gigs — multi-token scored ─────────────────────────────────────────────
  const gigResults: PublicSearchResult[] = gigs
    .map((gig) => ({
      entry: {
        id: `gig-${gig.id}`,
        title: gig.title,
        description: gig.summary,
        href: `/gigs/${gig.slug}`,
        type: 'page' as const,
        category: gig.category || 'Gig',
        badge: 'GIG',
        meta: {
          skills: gig.skills.slice(0, 6),
          budget: gig.budgetLabel,
          timeline: gig.timelineLabel,
          engagement: gig.engagementType,
          location: gig.locationPreference,
          urgent: gig.urgent,
          updatedAt: gig.updatedAt,
        },
      },
      score: scoreMultiField([
        { text: gig.title,                         weight: 3 },
        { text: gig.summary,                       weight: 2 },
        { text: gig.category,                      weight: 1.5 },
        { text: gig.interests.join(' '),            weight: 2 },
        { text: gig.skills.join(' '),               weight: 2.5 },
      ], normalizedQuery),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ entry }) => entry);

  const resumeResults: PublicSearchResult[] = resumes.map((resume) => ({
    id: `resume-${resume.id}`,
    title: resume.title,
    description: resume.description,
    href: resume.href,
    type: 'page' as const,
    category: resume.category || 'Talent',
    badge: 'RESUME',
    meta: {
      skills: resume.skills.slice(0, 6),
      tags: resume.tags.slice(0, 4),
      headline: resume.description,
      updatedAt: resume.updatedAt,
    },
  }));

  const fileResults: PublicSearchResult[] = fileMatches.map((item) => ({
    id: `file-${item.id}`,
    title: item.title,
    description: item.notes || `${item.fileName}${item.category ? ` · ${item.category}` : ''}`,
    href: item.linkHref,
    type: 'file' as const,
    category: item.category || 'Public file',
    badge: 'FILE',
  }));

  // Merge all, dedupe by href, return generous limit for global-search to re-rank
  const seen = new Set<string>();
  const all: PublicSearchResult[] = [];
  for (const r of [...staticMatches, ...blogResults, ...feedResults, ...gigResults, ...resumeResults, ...fileResults]) {
    if (!seen.has(r.href)) { seen.add(r.href); all.push(r); }
  }
  return all.slice(0, 30);
}
