import { NextRequest, NextResponse } from 'next/server';
import { getUserNames } from '@/lib/server/users';
import { getFileTransferById, updateFileTransfer } from '@/lib/server/file-transfers';
import { getAuthSession } from '@/lib/server/auth';
import { getProfileAvatars } from '@/lib/server/user-profiles';
import { mapPublishedComments } from '@/lib/server/published-comments';
import { createSocialProofBuilder } from '@/lib/server/social-proof';
import { resolveMentions } from '@/lib/server/mentions';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, string> = {
  post: 'Post', poll: 'Poll', survey: 'Survey', article: 'Article',
  document: 'Document', job: 'Job', resume: 'Resume', product: 'Product',
  event: 'Event', hackathon: 'Hackathon', portfolio: 'Portfolio',
  news: 'News', video: 'Video', thread: 'Thread', milestone: 'Milestone',
  tutorial: 'Tutorial', announcement: 'Announcement', chart: 'Chart', gig: 'Gig',
};

const FILENAME_EXT_RE = /\.\w{2,5}$/;
const NOISE_WORD_RE = /^[a-z]{12,}$/;
const USERNAME_LIKE_RE = /^[a-z]+\d{5,}\w*$/i;

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

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [session, found] = await Promise.all([getAuthSession(), getFileTransferById(id)]);
    const viewerIdentifier = session?.user?.id || session?.user?.email || '';
    const viewerUserId = session?.user?.id || '';
    const t =
      found &&
      found.directoryVisibility === 'public' &&
      found.authMode === 'public' &&
      !found.revokedAt &&
      found.moderationStatus !== 'removed'
        ? found
        : null;
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const cat = t.directoryCategory?.toLowerCase() || 'document';
    /* Same canonical-name resolution as the feed, so opening an item never
       shows a different byline than the list it was opened from. Single id →
       one lookup against the cached user list. */
    const canonicalName = t.uploadedByUserId
      ? (await getUserNames([t.uploadedByUserId]).catch(() => new Map<string, string>())).get(t.uploadedByUserId)
      : undefined;
    const authorName = canonicalName || t.uploadedByName || t.uploadedBy?.split('@')[0] || 'Docrud User';

    /* Social proof for this one post. Reached only after the public-visibility
       gate above, so a private/revoked/removed post never reports who engaged.
       Cost: two follow-graph queries plus one bounded avatar batch (≤6 ids),
       and nothing at all for logged-out viewers or an empty graph. */
    const proofBuilder = await createSocialProofBuilder(viewerIdentifier).catch(() => null);
    const proofDraft = proofBuilder ? proofBuilder.draft(t) : null;

    /* One avatar batch for the whole response: the publisher plus the
       social-proof faces. The publisher rides along here rather than in a
       second query, the same way the feed list route batches them. */
    const avatarIds = Array.from(new Set([
      ...(t.avatarUrl ? [] : [t.uploadedByUserId].filter((id): id is string => Boolean(id))),
      ...(proofBuilder && proofDraft ? proofBuilder.previewIds([proofDraft]) : []),
    ]));
    const avatarMap = avatarIds.length
      ? await getProfileAvatars(avatarIds).catch(() => new Map<string, string | null>())
      : new Map<string, string | null>();
    const proofAvatars = avatarMap;

    /* The author's photo, resolved exactly as the feed list route resolves it:
       the avatar snapshotted on the row first (business pages publish with
       their logo), then the publisher's current profile picture. Without this
       the detail view had no avatar to render and fell back to initials for
       everyone. */
    const authorAvatarUrl = t.avatarUrl
      || (t.uploadedByUserId ? avatarMap.get(t.uploadedByUserId) ?? undefined : undefined);

    return NextResponse.json({
      id: t.id,
      shareId: t.shareId,
      category: cat,
      badge: cleanBadge(t.directoryTags, cat),
      title: t.title || t.fileName,
      byline: authorName,
      uploadedByName: authorName,
      avatarUrl: authorAvatarUrl,
      cta: t.cta,
      body: t.notes || '',
      /* Names and photos for the @mentions in the body, resolved from the
         stored ids so the client links profiles without a second request. */
      mentions: await resolveMentions(t.mentionedUserIds).catch(() => []),
      chips: cleanChips(t.directoryTags),
      postedAt: t.createdAt,
      featured: !!t.featured,
      isReal: true,
      likesCount: t.likesCount ?? 0,
      likedByViewer: viewerIdentifier ? (t.likedBy ?? []).includes(viewerIdentifier) : false,
      trendCount: t.trendCount ?? 0,
      viewCount: t.viewCount ?? t.openCount ?? 0,
      trendedByViewer: viewerIdentifier ? (t.trendedBy ?? []).includes(viewerIdentifier) : false,
      interestedCount: t.interestedCount ?? 0,
      interestedByViewer: viewerIdentifier ? (t.interestedBy ?? []).includes(viewerIdentifier) : false,
      socialProof: proofBuilder ? proofBuilder.hydrate(proofDraft, proofAvatars) ?? undefined : undefined,
      commentsCount: t.commentsCount ?? 0,
      comments: await mapPublishedComments(t.comments, viewerIdentifier),
      dataUrl: t.dataUrl || null,
      mimeType: t.mimeType || null,
      videoUrl: t.videoUrl || null,
      thumbnailUrl: (() => {
        const u = t.thumbnailUrl;
        if (u && !u.startsWith('data:')) return u;
        if (t.mimeType?.startsWith('image/') && t.dataUrl?.startsWith('data:image/')) {
          return `/api/public/thumbnail/${t.id}`;
        }
        if (
          t.mimeType === 'text/html' &&
          (t.directoryCategory === 'post' || t.directoryCategory === 'product') &&
          t.dataUrl?.startsWith('data:text/html')
        ) {
          return `/api/public/thumbnail/${t.id}`;
        }
        return null;
      })(),
      uploadedByUserId: t.uploadedByUserId,
      canDelete: viewerUserId ? t.uploadedByUserId === viewerUserId : false,
      interestedUsers: viewerUserId && t.uploadedByUserId === viewerUserId
        ? ((t as unknown as { interestedUsers?: Array<{ id: string; name: string; markedAt: string }> }).interestedUsers ?? [])
        : undefined,
    });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    const viewerUserId = session?.user?.id;
    if (!viewerUserId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const found = await getFileTransferById(id);
    const t = found && !found.revokedAt ? found : null;
    if (!t) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    if (t.uploadedByUserId !== viewerUserId) return NextResponse.json({ error: 'You can only delete your own posts.' }, { status: 403 });

    await updateFileTransfer(t.id, { revokedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete.' }, { status: 500 });
  }
}
