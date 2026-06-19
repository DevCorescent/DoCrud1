import { NextRequest, NextResponse } from 'next/server';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { getAuthSession } from '@/lib/server/auth';
import { readJsonFile, businessPagesPath } from '@/lib/server/storage';
import { getProfileData } from '@/lib/server/user-profiles';

/* Build a lookup map: company name (lowercase) → { slug, id } */
async function buildBusinessLookup(): Promise<Map<string, { slug: string; id: string }>> {
  const map = new Map<string, { slug: string; id: string }>();
  try {
    const store = await readJsonFile<{ pages?: Array<{ id: string; slug: string; name: string; ownerUserId: string }> }>(businessPagesPath, {});
    for (const p of store.pages ?? []) {
      if (p.name && p.slug) map.set(p.name.toLowerCase(), { slug: p.slug, id: p.id });
    }
  } catch {}
  return map;
}

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, string> = {
  post: 'Post', poll: 'Poll', survey: 'Survey', article: 'Article',
  document: 'Document', job: 'Job', resume: 'Resume', product: 'Product',
  event: 'Event', hackathon: 'Hackathon', portfolio: 'Portfolio',
  news: 'News', video: 'Video', thread: 'Thread', milestone: 'Milestone',
  tutorial: 'Tutorial', announcement: 'Announcement', chart: 'Chart', gig: 'Gig',
};

const FILENAME_EXT_RE = /\.\w{2,5}$/;
const NOISE_WORD_RE = /^[a-z]{12,}$/;      // long concatenated lowercase words
const USERNAME_LIKE_RE = /^[a-z]+\d{5,}\w*$/i; // letters followed by 5+ digits

function isNoisyTag(tag: string): boolean {
  const t = tag.trim();
  return FILENAME_EXT_RE.test(t) || NOISE_WORD_RE.test(t) || USERNAME_LIKE_RE.test(t);
}

function cleanBadge(tags: string[] | undefined, cat: string): string {
  const first = (tags?.[0] ?? '').trim();
  if (first && !isNoisyTag(first) && first.length < 40) {
    return first;
  }
  return CATEGORY_LABELS[cat] ?? 'Published';
}

function cleanChips(tags: string[] | undefined): string[] | undefined {
  const rest = (tags ?? []).slice(1);
  const filtered = rest.filter(tag => tag.trim().length > 0 && !isNoisyTag(tag));
  return filtered.length > 0 ? filtered : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    const viewerIdentifier = session?.user?.id || session?.user?.email || '';
    const now = new Date();
    const { searchParams } = new URL(request.url);
    const filterSlug = searchParams.get('businessPageSlug') || '';
    const filterName = searchParams.get('businessPageName') || ''; // fallback for legacy items
    const limit  = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100);
    const page   = Math.max(parseInt(searchParams.get('page')  || '1',  10), 1);
    const offset = (page - 1) * limit;

    // Build business name → slug lookup for resolving legacy items
    const bizLookup = await buildBusinessLookup();

    const transfers = await getFileTransfers();
    const filtered = transfers
      .filter(
        (t) =>
          t.directoryVisibility === 'public' &&
          t.authMode === 'public' &&
          !t.revokedAt &&
          t.moderationStatus !== 'suspended' &&
          t.moderationStatus !== 'removed' &&
          // Filter by business: match slug (new) OR uploadedByName (legacy)
          (filterSlug
            ? (t.businessPageSlug === filterSlug ||
               (filterName && (t.uploadedByName === filterName || t.uploadedBy === filterName)))
            : true),
      )
      .sort((a, b) => {
        const aFeatured = a.featured && a.featuredUntil && new Date(a.featuredUntil) > now;
        const bFeatured = b.featured && b.featuredUntil && new Date(b.featuredUntil) > now;
        if (aFeatured && !bFeatured) return -1;
        if (!aFeatured && bFeatured) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const total   = filtered.length;
    const hasMore = offset + limit < total;
    const slice   = filtered.slice(offset, offset + limit);

    // Only enrich avatars for the items we're actually returning (not the full list)
    const missingIds = Array.from(new Set(slice.filter(t => !t.avatarUrl && t.uploadedByUserId).map(t => t.uploadedByUserId as string)));
    const profiles = await Promise.all(missingIds.map(id => getProfileData(id).catch(() => null)));
    const avatarMap = new Map(missingIds.map((id, i) => [id, profiles[i]?.avatarUrl ?? null]));

    const items = slice.map((t) => {
        const isFeaturedActive = t.featured && t.featuredUntil && new Date(t.featuredUntil) > now;
        const cat = t.directoryCategory?.toLowerCase() || 'document';
        const authorName = t.uploadedByName || t.uploadedBy?.split('@')[0] || 'Docrud User';
        return {
          id: t.id,
          shareId: t.shareId,
          category: cat,
          badge: cleanBadge(t.directoryTags, cat),
          title: t.title || t.fileName,
          byline: authorName,
          uploadedByName: authorName,
          body: t.notes || '',
          chips: cleanChips(t.directoryTags),
          postedAt: t.createdAt,
          featured: !!isFeaturedActive,
          featuredPlan: isFeaturedActive ? t.featuredPlan : undefined,
          isReal: true,
          likesCount: t.likesCount ?? 0,
          commentsCount: t.commentsCount ?? 0,
          viewCount: t.viewCount ?? t.openCount ?? 0,
          likedByViewer: viewerIdentifier ? (t.likedBy ?? []).includes(viewerIdentifier) : false,
          trendCount: t.trendCount ?? 0,
          trendedByViewer: viewerIdentifier ? (t.trendedBy ?? []).includes(viewerIdentifier) : false,
          interestedCount: t.interestedCount ?? 0,
          interestedByViewer: viewerIdentifier ? (t.interestedBy ?? []).includes(viewerIdentifier) : false,
          uploadedByUserId: t.uploadedByUserId,
          avatarUrl: t.avatarUrl || (t.uploadedByUserId ? avatarMap.get(t.uploadedByUserId) ?? undefined : undefined),
          // Resolve businessPageSlug: use stored value, or look up by company name for legacy items
          businessPageSlug: t.businessPageSlug ||
            (t.uploadedByName ? bizLookup.get(t.uploadedByName.toLowerCase())?.slug : undefined) ||
            (t.uploadedBy ? bizLookup.get(t.uploadedBy.toLowerCase())?.slug : undefined) ||
            undefined,
          videoUrl: t.videoUrl || undefined,
          mimeType: t.mimeType || null,
          thumbnailUrl: (() => {
            const u = t.thumbnailUrl;
            if (u && !u.startsWith('data:')) return u;
            if (t.mimeType?.startsWith('image/') && t.dataUrl?.startsWith('data:image/')) return `/api/public/thumbnail/${t.id}`;
            if (t.mimeType === 'text/html' && (t.directoryCategory === 'post' || t.directoryCategory === 'product') && t.dataUrl?.startsWith('data:text/html')) return `/api/public/thumbnail/${t.id}`;
            return undefined;
          })(),
          applicationUrl: t.applicationUrl || undefined,
          moderationStatus: t.moderationStatus || 'active',
          moderationNote: t.moderationNote,
          reportCount: t.reports?.length ?? 0,
        };
      });
    return NextResponse.json({ items, total, hasMore, page });
  } catch (err) {
    console.error('[/api/public/published] error:', err);
    return NextResponse.json({ items: [] });
  }
}
