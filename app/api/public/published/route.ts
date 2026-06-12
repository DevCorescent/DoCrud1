import { NextRequest, NextResponse } from 'next/server';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { getAuthSession } from '@/lib/server/auth';
import { readJsonFile, businessPagesPath } from '@/lib/server/storage';

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

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    const viewerIdentifier = session?.user?.id || session?.user?.email || '';
    const now = new Date();
    const { searchParams } = new URL(request.url);
    const filterSlug = searchParams.get('businessPageSlug') || '';
    const filterName = searchParams.get('businessPageName') || ''; // fallback for legacy items

    // Build business name → slug lookup for resolving legacy items
    const bizLookup = await buildBusinessLookup();

    const transfers = await getFileTransfers();
    const items = transfers
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
      })
      .map((t) => {
        const isFeaturedActive = t.featured && t.featuredUntil && new Date(t.featuredUntil) > now;
        return {
          id: t.id,
          shareId: t.shareId,
          category: t.directoryCategory?.toLowerCase() || 'document',
          badge: t.directoryTags?.[0] || 'Published',
          title: t.title || t.fileName,
          byline: `${t.uploadedByName || t.uploadedBy?.split('@')[0] || 'Docrud User'} · ${t.fileName}`,
          uploadedByName: t.uploadedByName || t.uploadedBy?.split('@')[0] || 'Docrud User',
          body: t.notes || '',
          chips: (t.directoryTags ?? []).slice(1).length > 0 ? (t.directoryTags ?? []).slice(1) : undefined,
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
          avatarUrl: t.avatarUrl || undefined,
          // Resolve businessPageSlug: use stored value, or look up by company name for legacy items
          businessPageSlug: t.businessPageSlug ||
            (t.uploadedByName ? bizLookup.get(t.uploadedByName.toLowerCase())?.slug : undefined) ||
            (t.uploadedBy ? bizLookup.get(t.uploadedBy.toLowerCase())?.slug : undefined) ||
            undefined,
          videoUrl: t.videoUrl || undefined,
          mimeType: t.mimeType || null,
          thumbnailUrl: t.thumbnailUrl || undefined,
          applicationUrl: t.applicationUrl || undefined,
          moderationStatus: t.moderationStatus || 'active',
          moderationNote: t.moderationNote,
          reportCount: t.reports?.length ?? 0,
        };
      });
    return NextResponse.json({ items });
  } catch (err) {
    console.error('[/api/public/published] error:', err);
    return NextResponse.json({ items: [] });
  }
}
