/**
 * Cast or clear a poll vote on a publication.
 *
 * Mirrors the reaction route: the voter identity always comes from the
 * session, never from the client, and the vote rides along on the publication
 * document so there is no second store to keep in sync.
 *
 * The response carries the recomputed counts, so the card renders real
 * server-side results rather than an optimistic local guess.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { setPollVote, getFileTransferById } from '@/lib/server/file-transfers';
import { summarizePollVotes } from '@/lib/polls';
import { feedChips } from '@/lib/feed-tags';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    const identifier = session?.user?.id || session?.user?.email || '';
    if (!identifier) {
      return NextResponse.json({ error: 'Sign in to vote.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { option?: unknown } | null;
    const raw = body?.option;
    const option = raw === null ? null : typeof raw === 'number' && Number.isInteger(raw) ? raw : undefined;
    if (option === undefined) {
      return NextResponse.json({ error: 'A whole-number option index is required.' }, { status: 400 });
    }

    const post = await getFileTransferById(id);
    if (!post) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    if ((post.directoryCategory || '').toLowerCase() !== 'poll') {
      return NextResponse.json({ error: 'This publication is not a poll.' }, { status: 400 });
    }

    /* Range-check against the SAME chip list the card renders. Deriving this
       from raw directoryTags would be off by one (the first tag is the badge)
       and would record the vote against the wrong option. */
    const optionCount = feedChips(post.directoryTags).length;
    if (option !== null && (option < 0 || option >= optionCount)) {
      return NextResponse.json({ error: 'That option does not exist on this poll.' }, { status: 400 });
    }

    const votes = await setPollVote(id, identifier, option);
    const summary = summarizePollVotes(feedChips(post.directoryTags), votes, identifier);

    return NextResponse.json({
      counts: summary.counts,
      total: summary.total,
      viewerChoice: summary.viewerChoice,
    });
  } catch (error) {
    console.error('[published/poll] POST error', error);
    return NextResponse.json({ error: 'Failed to record vote.' }, { status: 500 });
  }
}
