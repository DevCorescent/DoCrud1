import { NextRequest, NextResponse } from 'next/server';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { getAuthSession } from '@/lib/server/auth';
import { readJsonFile, businessPagesPath } from '@/lib/server/storage';
import { getProfileData } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

/* ── tiny in-process cache (avoids re-reading large JSON on every request) ── */
interface DataCache {
  transfers: Awaited<ReturnType<typeof getFileTransfers>>;
  bizLookup: Map<string, { slug: string; id: string }>;
  ts: number;
}
let _cache: DataCache | null = null;
const CACHE_TTL = 15_000; // 15 s — stale data acceptable for feed

async function getCachedData(): Promise<Pick<DataCache, 'transfers' | 'bizLookup'>> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    console.log('[published] cache HIT');
    return _cache;
  }
  console.log('[published] cache MISS — reading files');
  const ct = Date.now();
  const [transfers, bizStore] = await Promise.all([
    getFileTransfers(),
    readJsonFile<{ pages?: Array<{ id: string; slug: string; name: string; ownerUserId: string }> }>(businessPagesPath, {}).catch(() => ({})),
  ]);
  console.log(`[published] files read in ${Date.now() - ct}ms — transfers: ${transfers.length}`);
  const bizLookup = new Map<string, { slug: string; id: string }>();
  for (const p of (bizStore as { pages?: Array<{ id: string; slug: string; name: string }> }).pages ?? []) {
    if (p.name && p.slug) bizLookup.set(p.name.toLowerCase(), { slug: p.slug, id: p.id });
  }
  _cache = { transfers, bizLookup, ts: Date.now() };
  return _cache;
}

const CATEGORY_LABELS: Record<string, string> = {
  post: 'Post', poll: 'Poll', survey: 'Survey', article: 'Article',
  document: 'Document', job: 'Job', resume: 'Resume', product: 'Product',
  event: 'Event', hackathon: 'Hackathon', portfolio: 'Portfolio',
  news: 'News', video: 'Video', thread: 'Thread', milestone: 'Milestone',
  tutorial: 'Tutorial', announcement: 'Announcement', chart: 'Chart', gig: 'Gig',
};

const FILENAME_EXT_RE   = /\.\w{2,5}$/;
const NOISE_WORD_RE     = /^[a-z]{12,}$/;
const USERNAME_LIKE_RE  = /^[a-z]+\d{5,}\w*$/i;

function isNoisyTag(tag: string) {
  const t = tag.trim();
  return FILENAME_EXT_RE.test(t) || NOISE_WORD_RE.test(t) || USERNAME_LIKE_RE.test(t);
}
function cleanBadge(tags: string[] | undefined, cat: string) {
  const first = (tags?.[0] ?? '').trim();
  return (first && !isNoisyTag(first) && first.length < 40) ? first : (CATEGORY_LABELS[cat] ?? 'Published');
}
function cleanChips(tags: string[] | undefined) {
  const rest = (tags ?? []).slice(1).filter(t => t.trim().length > 0 && !isNoisyTag(t));
  return rest.length > 0 ? rest : undefined;
}

export async function GET(request: NextRequest) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const filterSlug = searchParams.get('businessPageSlug') || '';
    const filterName = searchParams.get('businessPageName') || '';
    const limit    = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 100);
    const page     = Math.max(parseInt(searchParams.get('page')  || '1', 10), 1);
    const offset   = (page - 1) * limit;
    const noAvatar = searchParams.get('noAvatar') === '1';
    const cacheHit = _cache && Date.now() - _cache.ts < CACHE_TTL;
    console.log(`[published] GET limit=${limit} page=${page} noAvatar=${noAvatar} cacheHit=${!!cacheHit}`);

    /* run auth + file reads in parallel */
    const [session, { transfers, bizLookup }] = await Promise.all([
      getAuthSession(),
      getCachedData(),
    ]);
    console.log(`[published] data loaded in ${Date.now() - t0}ms — transfers: ${transfers.length}`);

    const viewerIdentifier = session?.user?.id || session?.user?.email || '';
    const now = new Date();

    const filtered = transfers
      .filter(t =>
        t.directoryVisibility === 'public' &&
        t.authMode === 'public' &&
        !t.revokedAt &&
        t.moderationStatus !== 'suspended' &&
        t.moderationStatus !== 'removed' &&
        (filterSlug
          ? (t.businessPageSlug === filterSlug ||
             (filterName && (t.uploadedByName === filterName || t.uploadedBy === filterName)))
          : true),
      )
      .sort((a, b) => {
        const aF = a.featured && a.featuredUntil && new Date(a.featuredUntil) > now;
        const bF = b.featured && b.featuredUntil && new Date(b.featuredUntil) > now;
        if (aF && !bF) return -1;
        if (!aF && bF) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

    const total   = filtered.length;
    const hasMore = offset + limit < total;
    const slice   = filtered.slice(offset, offset + limit);
    console.log(`[published] filtered ${total} → slice ${slice.length} in ${Date.now() - t0}ms`);

    /* avatar enrichment — skip when caller passes ?noAvatar=1 (e.g. home feed) */
    let avatarMap = new Map<string, string | null>();
    if (!noAvatar) {
      const missingIds = Array.from(new Set(
        slice.filter(t => !t.avatarUrl && t.uploadedByUserId).map(t => t.uploadedByUserId as string)
      ));
      console.log(`[published] enriching ${missingIds.length} avatars`);
      const profiles = await Promise.all(missingIds.map(id => getProfileData(id).catch(() => null)));
      avatarMap = new Map(missingIds.map((id, i) => [id, profiles[i]?.avatarUrl ?? null]));
      console.log(`[published] avatars done in ${Date.now() - t0}ms`);
    }

    const items = slice.map(t => {
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
        businessPageSlug: t.businessPageSlug ||
          (t.uploadedByName ? bizLookup.get(t.uploadedByName.toLowerCase())?.slug : undefined) ||
          (t.uploadedBy    ? bizLookup.get(t.uploadedBy.toLowerCase())?.slug    : undefined) ||
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

    console.log(`[published] DONE in ${Date.now() - t0}ms — returning ${items.length} items`);
    return NextResponse.json({ items, total, hasMore, page });
  } catch (err) {
    console.error(`[/api/public/published] ERROR after ${Date.now() - t0}ms:`, err);
    return NextResponse.json({ items: [] });
  }
}
