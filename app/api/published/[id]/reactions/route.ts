/**
 * Who reacted to a post — bounded, filterable listing.
 *
 * Identities are resolved with the SAME bulk helpers the rest of the app uses
 * (getUserNames + getProfileAvatars): two lookups for the whole page, never one
 * per reactor. Results are always paginated, so a post with thousands of
 * reactions can never be loaded at once.
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getFileTransferById } from '@/lib/server/file-transfers';
import { getUserNames } from '@/lib/server/users';
import { getProfileAvatars } from '@/lib/server/user-profiles';
import { coerceReactionType, isReactionType, summarizeReactions } from '@/lib/reactions';

const MAX_PAGE = 30;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    const viewer = session?.user?.id || session?.user?.email || null;

    const post = await getFileTransferById(id);
    if (!post) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });

    // Same visibility rule the post itself uses: a private post's reactor list
    // is only visible to its owner.
    const isPublic = post.directoryVisibility === 'public';
    const isOwner = Boolean(viewer && post.uploadedByUserId && post.uploadedByUserId === viewer);
    if (!isPublic && !isOwner) {
      return NextResponse.json({ error: 'Not available.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const rawType = searchParams.get('type');
    const filter = rawType && rawType !== 'all'
      ? (isReactionType(rawType) ? rawType : null)
      : null;
    if (rawType && rawType !== 'all' && !filter) {
      return NextResponse.json({ error: 'Unknown reaction type.' }, { status: 400 });
    }

    const limit = Math.min(MAX_PAGE, Math.max(1, Number(searchParams.get('limit') ?? MAX_PAGE)));
    const offset = Math.max(0, Number(searchParams.get('offset') ?? 0));

    const likedBy = post.likedBy ?? [];
    const reactions = post.reactions ?? {};
    const summary = summarizeReactions(likedBy, reactions, viewer);

    // Newest first, then filter, then slice — the page is bounded before any
    // identity lookup happens.
    const ordered = [...likedBy].reverse()
      .filter((identifier) => !filter || coerceReactionType(reactions[identifier]) === filter);
    const page = ordered.slice(offset, offset + limit);

    const [names, avatars] = await Promise.all([
      getUserNames(page).catch(() => new Map<string, string>()),
      getProfileAvatars(page).catch(() => new Map<string, string | null>()),
    ]);

    return NextResponse.json({
      summary,
      total: ordered.length,
      hasMore: offset + page.length < ordered.length,
      reactors: page.map((identifier) => ({
        id: identifier,
        // Email-based legacy identifiers have no profile; show a neutral label
        // rather than leaking the address.
        name: names.get(identifier) ?? (identifier.includes('@') ? 'Docrud member' : 'Docrud member'),
        avatarUrl: avatars.get(identifier) ?? null,
        type: coerceReactionType(reactions[identifier]),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
