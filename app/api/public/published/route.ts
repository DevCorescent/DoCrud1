import { NextRequest, NextResponse } from 'next/server';
import { getFileTransfers } from '@/lib/server/file-transfers';
import { selectPublicFileTransfersForFeed } from '@/lib/server/db/file-transfers-rows';
import { getMongoDb } from '@/lib/server/database';
import { getAuthSession } from '@/lib/server/auth';
import { readJsonFile, businessPagesPath } from '@/lib/server/storage';
import { getProfileAvatars } from '@/lib/server/user-profiles';
import { getUserNames } from '@/lib/server/users';
import { summarizeReactions } from '@/lib/reactions';
import { summarizePollVotes } from '@/lib/polls';
import { feedChips, isNoisyFeedTag } from '@/lib/feed-tags';
import { createSocialProofBuilder } from '@/lib/server/social-proof';
import { resolveMentions } from '@/lib/server/mentions';

/* The payload is personalised — it carries the viewer's own reactions, poll
   choice and social proof. The no-store header on the response below keeps a
   heuristic browser cache from replaying a stale copy (which made a
   just-cast vote appear to vanish on refresh). */
export const dynamic = 'force-dynamic';

/* ── tiny in-process cache (avoids re-reading large JSON on every request) ── */
interface DataCache {
  transfers: Awaited<ReturnType<typeof getFileTransfers>>;
  bizLookup: Map<string, { slug: string; id: string }>;
  ts: number;
}
let _cache: DataCache | null = null;
const CACHE_TTL = 15_000; // 15 s — stale data acceptable for feed

async function getTransfersLean(): Promise<(Awaited<ReturnType<typeof getFileTransfers>>[number] & { hasDataUrl?: boolean })[]> {
  try {
    const db = await getMongoDb();
    if (db) {
      return selectPublicFileTransfersForFeed();
    }
  } catch { /* fall through */ }
  return getFileTransfers();
}

/** In-flight refresh, so N concurrent misses cost ONE database round trip. */
let _inFlight: Promise<DataCache> | null = null;

async function refreshCache(): Promise<DataCache> {
  if (_inFlight) return _inFlight;
  _inFlight = (async () => {
    const [transfers, bizStore] = await Promise.all([
      getTransfersLean(),
      readJsonFile<{ pages?: Array<{ id: string; slug: string; name: string; ownerUserId: string }> }>(businessPagesPath, {}).catch(() => ({})),
    ]);
    const bizLookup = new Map<string, { slug: string; id: string }>();
    for (const p of (bizStore as { pages?: Array<{ id: string; slug: string; name: string }> }).pages ?? []) {
      if (p.name && p.slug) bizLookup.set(p.name.toLowerCase(), { slug: p.slug, id: p.id });
    }
    _cache = { transfers, bizLookup, ts: Date.now() };
    return _cache;
  })();
  try {
    return await _inFlight;
  } finally {
    _inFlight = null;
  }
}

/**
 * Stale-while-revalidate.
 *
 * The database is a remote Atlas cluster, so a cache miss is dominated by
 * network round trips, not by query work (the feed match examines 71 documents
 * and executes in 0 ms server-side). Measured on the real deployment: a cache
 * hit served in ~0.25 s while a miss took 2.5-13.5 s — and with a 15 s TTL a
 * steady trickle of visitors means somebody eats that miss constantly.
 *
 * So: once we have data, always answer from it immediately and refresh in the
 * background. Only the very first request after boot waits on the database.
 * Worst-case staleness goes from "always under 15 s" to "usually under 15 s,
 * occasionally ~30 s", which the feed already tolerates — it polls for new
 * posts every 60 s and surfaces them behind a "new posts" control.
 */
async function getCachedData(): Promise<Pick<DataCache, 'transfers' | 'bizLookup'>> {
  if (_cache) {
    if (Date.now() - _cache.ts >= CACHE_TTL) {
      // Stale: kick off a refresh but do not make this request wait for it.
      void refreshCache().catch(() => { /* keep serving the previous snapshot */ });
    }
    return _cache;
  }
  return refreshCache();
}

const CATEGORY_LABELS: Record<string, string> = {
  post: 'Post', poll: 'Poll', survey: 'Survey', article: 'Article',
  document: 'Document', job: 'Job', resume: 'Resume', product: 'Product',
  event: 'Event', hackathon: 'Hackathon', portfolio: 'Portfolio',
  news: 'News', video: 'Video', thread: 'Thread', milestone: 'Milestone',
  tutorial: 'Tutorial', announcement: 'Announcement', chart: 'Chart', gig: 'Gig',
};

/* Shared with the poll vote route so chip indices cannot drift apart. */
const isNoisyTag = isNoisyFeedTag;
function cleanBadge(tags: string[] | undefined, cat: string) {
  const first = (tags?.[0] ?? '').trim();
  return (first && !isNoisyTag(first) && first.length < 40) ? first : (CATEGORY_LABELS[cat] ?? 'Published');
}
function cleanChips(tags: string[] | undefined) {
  const rest = feedChips(tags);
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

    /* run auth + file reads in parallel */
    const [session, { transfers, bizLookup }] = await Promise.all([
      getAuthSession(),
      getCachedData(),
    ]);

    const viewerIdentifier = session?.user?.id || session?.user?.email || '';
    const now = new Date();

    // lean query already pre-filters public/authMode/revokedAt/moderationStatus at DB level
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

    /* Social proof — "people you follow reacted to this".
       ONE builder for the whole page: two follow-graph queries up front, then a
       pure set intersection per post over `likedBy` / `reactions` / `comments`
       that are already on the row. Null for logged-out viewers and for anyone
       with an empty graph, which skips the work outright. Every post here has
       already passed the public-visibility filter above. */
    const proofBuilder = await createSocialProofBuilder(viewerIdentifier).catch(() => null);
    const proofDrafts = proofBuilder ? slice.map(t => proofBuilder.draft(t)) : [];

    /* avatar enrichment — skip when caller passes ?noAvatar=1 (e.g. home feed)
       ONE batched, field-projected query. Previously this was a per-author
       getProfileData() call, i.e. N round trips each pulling a whole profile
       document; it accounted for ~2.15 s of a ~2.15 s response. */
    let avatarMap = new Map<string, string | null>();
    if (!noAvatar) {
      const missingIds = Array.from(new Set(
        slice.filter(t => !t.avatarUrl && t.uploadedByUserId).map(t => t.uploadedByUserId as string)
      ));
      /* Reactor preview avatars ride along in the SAME batched query as the
         author avatars — at most 3 ids per post, and no extra round trip. */
      const reactorIds = slice.flatMap(t => (t.likedBy ?? []).slice(-3));
      /* Social-proof faces ride along too — at most 3 reactors + 3 commenters
         per post, deduped across the page, still ONE round trip. */
      const proofIds = proofBuilder ? proofBuilder.previewIds(proofDrafts) : [];
      avatarMap = await getProfileAvatars(
        Array.from(new Set([...missingIds, ...reactorIds, ...proofIds])),
      ).catch(() => new Map());
    }

    /* `uploadedByName` is snapshotted when the item is published, so it shows a
       stale name after the publisher renames their account. Resolve the current
       canonical StoredUser.name for every publisher we can identify.

       ONE bulk lookup over the already-cached user list — no per-item query —
       and it runs even when ?noAvatar=1 skips the avatar batch, because the
       byline is shown either way. Only the public display name is read; no
       other user data enters the response. */
    const publisherIds = Array.from(new Set(
      slice.map(t => t.uploadedByUserId).filter((id): id is string => Boolean(id))
    ));
    const nameMap = await getUserNames(publisherIds).catch(() => new Map<string, string>());

    /* One resolve for every @mention on the page, so feed cards can render
       their mentions as links without a request per card. */
    const mentionList = await resolveMentions(
      slice.flatMap((t) => t.mentionedUserIds ?? []),
    ).catch(() => [] as Awaited<ReturnType<typeof resolveMentions>>);
    const mentionById = new Map(mentionList.map((m) => [m.userId, m]));

    const items = slice.map((t, i) => {
      const isFeaturedActive = t.featured && t.featuredUntil && new Date(t.featuredUntil) > now;
      const cat = t.directoryCategory?.toLowerCase() || 'document';
      // Canonical name first; legacy records with no resolvable user id keep
      // their original snapshot behaviour untouched.
      const authorName =
        (t.uploadedByUserId ? nameMap.get(t.uploadedByUserId) : undefined)
        || t.uploadedByName || t.uploadedBy?.split('@')[0] || 'Docrud User';
      return {
        id: t.id,
        shareId: t.shareId,
        category: cat,
        badge: cleanBadge(t.directoryTags, cat),
        title: t.title || t.fileName,
        byline: authorName,
        uploadedByName: authorName,
        cta: t.cta,
        body: t.notes || '',
        mentions: (t.mentionedUserIds ?? [])
          .map((mid) => mentionById.get(mid))
          .filter(Boolean),
        chips: cleanChips(t.directoryTags),
        postedAt: t.createdAt,
        featured: !!isFeaturedActive,
        featuredPlan: isFeaturedActive ? t.featuredPlan : undefined,
        isReal: true,
        likesCount: t.likesCount ?? 0,
        /* Reaction summary rides along with the post — the feed never issues a
           per-post reactions request. Computed from data already on the row. */
        reactions: (() => {
          const sum = summarizeReactions(t.likedBy, t.reactions, viewerIdentifier);
          return {
            ...sum,
            // Resolved from the batch above; ids that have no photo are dropped
            // so the client renders initials instead of empty circles.
            previewAvatars: sum.previewIds
              .map(pid => avatarMap.get(pid) || null)
              .filter((u): u is string => Boolean(u)),
          };
        })(),
        /* Omitted (undefined) rather than sent empty when nobody the viewer
           knows engaged, so the client renders no row at all. */
        socialProof: proofBuilder ? proofBuilder.hydrate(proofDrafts[i], avatarMap) ?? undefined : undefined,
        /* Real vote counts ride along on poll rows, so the card renders
           server-side results without a per-poll request. Omitted entirely for
           every other category. */
        poll: cat === 'poll'
          ? (() => {
              const p = summarizePollVotes(cleanChips(t.directoryTags), t.pollVotes, viewerIdentifier);
              return { counts: p.counts, total: p.total, viewerChoice: p.viewerChoice };
            })()
          : undefined,
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
          // hasDataUrl is set by the lean aggregation query (dataUrl field is excluded for perf)
          const canThumb = (t as { hasDataUrl?: boolean }).hasDataUrl ?? !!t.dataUrl;
          if (canThumb && t.mimeType?.startsWith('image/')) return `/api/public/thumbnail/${t.id}`;
          if (canThumb && t.mimeType === 'text/html' && (t.directoryCategory === 'post' || t.directoryCategory === 'product')) return `/api/public/thumbnail/${t.id}`;
          return undefined;
        })(),
        applicationUrl: t.applicationUrl || undefined,
        moderationStatus: t.moderationStatus || 'active',
        moderationNote: t.moderationNote,
        reportCount: t.reports?.length ?? 0,
      };
    });

    return NextResponse.json(
      { items, total, hasMore, page },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error(`[/api/public/published] ERROR after ${Date.now() - t0}ms:`, err);
    return NextResponse.json({ items: [] });
  }
}
