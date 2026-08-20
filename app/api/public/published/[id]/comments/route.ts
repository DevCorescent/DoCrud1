import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { addComment, getFileTransferById } from '@/lib/server/file-transfers';
import { mapPublishedComments } from '@/lib/server/published-comments';
import { addSocialEvent } from '@/lib/server/social-events';
import { getStoredUsers } from '@/lib/server/users';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await getAuthSession();
    const viewerIdentifier = session?.user?.id || session?.user?.email || '';
    const found = await getFileTransferById(id);
    const t =
      found && found.directoryVisibility === 'public' && !found.revokedAt ? found : null;
    if (!t) return NextResponse.json({ comments: [] });
    return NextResponse.json({
      comments: await mapPublishedComments(t.comments, viewerIdentifier),
    });
  } catch {
    return NextResponse.json({ comments: [] });
  }
}

/**
 * Mentions travel inside the comment text as @[Name](userId).
 *
 * The display name is never taken from the client: every id is looked up and
 * rewritten with the stored name, so a comment cannot be crafted that shows
 * one person's name while linking to another. Ids that match no visible user
 * collapse to plain text.
 */
const MENTION_RE = /@\[([^\]]{1,80})\]\(([A-Za-z0-9_-]{1,64})\)/g;

async function normalizeMentions(text: string): Promise<{ text: string; mentionedIds: string[] }> {
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  MENTION_RE.lastIndex = 0;
  while ((m = MENTION_RE.exec(text))) ids.add(m[2]);
  if (ids.size === 0) return { text, mentionedIds: [] };

  const users = await getStoredUsers();
  const byId = new Map(
    users
      .filter((u) => u.isActive !== false && !u.deactivatedAt && !u.pendingDeletion && u.inviteStatus !== 'disabled')
      .map((u) => [u.id, (u.name ?? '').trim()]),
  );

  const hit = new Set<string>();
  MENTION_RE.lastIndex = 0;
  const next = text.replace(MENTION_RE, (whole, _label: string, id: string) => {
    const realName = byId.get(id);
    if (!realName) return String(whole).replace(/^@\[|\]\([^)]*\)$/g, '');
    hit.add(id);
    return `@[${realName}](${id})`;
  });

  const mentionedIds: string[] = [];
  hit.forEach((id) => mentionedIds.push(id));
  return { text: next, mentionedIds };
}

/** What a mention looks like once the markup is stripped, for plain-text uses. */
function mentionsToPlainText(text: string): string {
  MENTION_RE.lastIndex = 0;
  return text.replace(MENTION_RE, (_w, label: string) => `@${label}`);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    /* Commenting is a write, so identity is established before anything else
       is read. resolveSessionUserId is the same helper the rest of the app
       uses; it returns null when there is no usable session, which is the
       only signal this route trusts. Author identity is never taken from the
       request body — only text and parentId are read from it. */
    const session = await getAuthSession();
    const userId = session?.user ? await resolveSessionUserId(session) : null;
    if (!userId) {
      return NextResponse.json({ error: 'Sign in to comment.' }, { status: 401 });
    }
    const userName = session?.user?.name || 'Anonymous';

    const body = await request.json() as { text?: string; parentId?: string };
    if (!body.text?.trim()) return NextResponse.json({ error: 'Comment text required' }, { status: 400 });

    const { text: normalizedText, mentionedIds } = await normalizeMentions(body.text.trim());
    const updated = await addComment(id, userId, userName, normalizedText, body.parentId ?? undefined);
    const comments = await mapPublishedComments(updated.comments, userId);

    // Fire social event if the commenter is not the post author
    if (updated.uploadedByUserId && updated.uploadedByUserId !== userId) {
      void addSocialEvent({
        type: 'comment',
        actorId: userId,
        actorName: userName,
        targetUserId: updated.uploadedByUserId,
        resourceId: updated.id,
        resourceTitle: updated.title || updated.fileName,
        excerpt: mentionsToPlainText(body.text.trim()).slice(0, 120),
        href: `/published/${updated.shareId || id}`,
      }).catch(() => {});
    }

    /* The mention event type already exists; the post author is skipped when
       they are also the commenter, and nobody is notified about themselves. */
    for (const mentionedId of mentionedIds) {
      if (mentionedId === userId) continue;
      void addSocialEvent({
        type: 'mention',
        actorId: userId,
        actorName: userName,
        targetUserId: mentionedId,
        resourceId: updated.id,
        resourceTitle: updated.title || updated.fileName,
        excerpt: mentionsToPlainText(normalizedText).slice(0, 120),
        href: `/published/${updated.shareId || id}`,
      }).catch(() => {});
    }

    return NextResponse.json({ comments });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
