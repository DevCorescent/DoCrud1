import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserById, getStoredUserByEmail } from '@/lib/server/users';
import { setPostReaction, getFileTransferById } from '@/lib/server/file-transfers';
import { coerceReactionType, isReactionType, summarizeReactions, REACTION_META } from '@/lib/reactions';
import { earnCredits } from '@/lib/server/credits';
import { addSocialEvent } from '@/lib/server/social-events';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    const identifier = session?.user?.id || session?.user?.email || '';
    if (!identifier) {
      return NextResponse.json({ error: 'Sign in to like posts.' }, { status: 401 });
    }

    /* Backward compatible: no body → the original toggle. A body with
       { type } sets/changes that reaction; { type: null } removes it.
       The identifier always comes from the session — never from the client. */
    const body = await request.json().catch(() => null) as { type?: unknown } | null;
    let requested: string | null | undefined;
    if (body && 'type' in body) {
      requested = body.type === null ? null : coerceReactionType(body.type);
      if (body.type !== null && !isReactionType(body.type)) {
        return NextResponse.json({ error: 'Unknown reaction type.' }, { status: 400 });
      }
    }

    const post = await getFileTransferById(id);
    if (!post) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });

    const result = requested === undefined
      ? await (async () => {
          // legacy toggle
          const already = (post.likedBy ?? []).includes(identifier);
          return setPostReaction(id, identifier, already ? null : 'like');
        })()
      : await setPostReaction(id, identifier, requested);

    const summary = summarizeReactions(
      result.liked
        ? Array.from(new Set([...(post.likedBy ?? []), identifier]))
        : (post.likedBy ?? []).filter((x) => x !== identifier),
      result.reactions,
      identifier,
    );

    // Award credits and fire social event when liked (not when unliked)
    if (result.liked) {
      if (post?.uploadedByUserId && post.uploadedByUserId !== identifier) {
        void earnCredits(post.uploadedByUserId, 'post_like', 1, `Your post "${post.title || post.fileName}" received a like`).catch(() => {});

        // Look up actor name/avatar
        // Targeted lookup instead of loading the whole users table to find one actor.
        const actor = identifier.includes('@')
          ? await getStoredUserByEmail(identifier).catch(() => null)
          : await getStoredUserById(identifier).catch(() => null);
        /* Still a 'like' social event: the notification type, its id scheme,
           polling, read-state and redaction all stay exactly as they are. The
           reaction is carried in `excerpt`, which the notification builder
           already renders as the body, so a Celebrate reads "Reacted 👏
           Celebrate" without touching notification infrastructure. */
        const reacted = result.reactionType ?? 'like';
        void addSocialEvent({
          type: 'like',
          excerpt: reacted === 'like'
            ? undefined
            : `Reacted ${REACTION_META[reacted as keyof typeof REACTION_META]?.emoji ?? ''} ${REACTION_META[reacted as keyof typeof REACTION_META]?.label ?? ''}`.trim(),
          actorId: actor?.id ?? identifier,
          actorName: actor?.name || session?.user?.name || 'Someone',
          targetUserId: post.uploadedByUserId,
          resourceId: post.id,
          resourceTitle: post.title || post.fileName,
          href: `/published/${post.shareId || post.id}`,
        }).catch(() => {});
      }
    }

    // Shape is additive: `liked` and `likesCount` are unchanged for existing
    // callers; `reactionType` and `reactions` are new.
    return NextResponse.json({
      liked: result.liked,
      likesCount: result.likesCount,
      reactionType: result.reactionType,
      reactions: summary,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
