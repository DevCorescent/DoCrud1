/**
 * Server-side reading of mentions inside comment text.
 *
 * Shared by the comment create and edit routes so both apply the same rule:
 * the display name is never taken from the client, and an id matching no
 * visible user is not a mention at all.
 */
import { getStoredUsers } from '@/lib/server/users';

/**
 * Mentions travel inside the comment text as @[Name](userId).
 *
 * The display name is never taken from the client: every id is looked up and
 * rewritten with the stored name, so a comment cannot be crafted that shows
 * one person's name while linking to another. Ids that match no visible user
 * collapse to plain text.
 */
export const MENTION_RE = /@\[([^\]]{1,80})\]\(([A-Za-z0-9_-]{1,64})\)/g;

export async function normalizeMentions(text: string): Promise<{ text: string; mentionedIds: string[] }> {
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
export function mentionsToPlainText(text: string): string {
  MENTION_RE.lastIndex = 0;
  return text.replace(MENTION_RE, (_w, label: string) => `@${label}`);
}

