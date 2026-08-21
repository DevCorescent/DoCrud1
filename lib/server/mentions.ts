/**
 * Server side of @mentions — validation, resolution and notification.
 *
 * The client is never trusted with mention references. Whatever ids a composer
 * sends are checked against the real user table here, and only ids that belong
 * to an existing active account survive to be stored. That is what stops a
 * hand-rolled request from persisting a fake reference, and it is why the
 * renderer can build profile links from stored ids without re-checking them.
 */

import { getStoredUsers, type StoredUser } from '@/lib/server/users';
import { getProfileAvatars } from '@/lib/server/user-profiles';
import { addSocialEvent } from '@/lib/server/social-events';
import {
  MAX_MENTIONS_PER_CONTENT,
  normaliseMentionIds,
  mentionToken,
  type ResolvedMention,
} from '@/lib/mentions';

const isMentionable = (u: StoredUser | undefined): u is StoredUser =>
  Boolean(u && u.id && typeof u.name === 'string' && u.name.trim() && u.isActive !== false);

/**
 * The ids worth storing: real, active accounts, de-duplicated, capped, and —
 * because a reference nobody can see is just stale metadata — actually named
 * in the content. Anything else is dropped rather than rejected, matching how
 * the publish route already treats unsafe CTAs.
 */
export async function validateMentionIds(input: unknown, content: string): Promise<string[]> {
  const ids = normaliseMentionIds(input);
  if (ids.length === 0) return [];

  const users = await getStoredUsers().catch(() => [] as StoredUser[]);
  const byId = new Map(users.filter(isMentionable).map((u) => [String(u.id), u]));

  const kept: string[] = [];
  for (const id of ids) {
    const user = byId.get(id);
    if (!user) continue;
    if (content && !content.includes(mentionToken(user.name.trim()))) continue;
    kept.push(id);
    if (kept.length >= MAX_MENTIONS_PER_CONTENT) break;
  }
  return kept;
}

/** Stored ids → the name and photo a renderer needs to draw the links. */
export async function resolveMentions(ids: string[] | undefined | null): Promise<ResolvedMention[]> {
  const wanted = normaliseMentionIds(ids);
  if (wanted.length === 0) return [];

  const users = await getStoredUsers().catch(() => [] as StoredUser[]);
  const byId = new Map(users.filter(isMentionable).map((u) => [String(u.id), u]));
  const present = wanted.filter((id) => byId.has(id));
  if (present.length === 0) return [];

  const avatars = await getProfileAvatars(present).catch(() => new Map<string, string | null>());
  return present.map((id) => ({
    userId: id,
    name: byId.get(id)!.name.trim(),
    avatarUrl: avatars.get(id) ?? null,
  }));
}

/**
 * Raise a mention notification for each person named, on the social-event
 * stream the rest of the product already uses for follows, likes and comments.
 * Mentioning yourself is allowed but never notifies you.
 */
export async function notifyMentions(opts: {
  mentionedUserIds: string[];
  actorId: string;
  actorName: string;
  actorAvatar?: string | null;
  resourceId?: string;
  resourceTitle?: string;
  excerpt?: string;
  href: string;
}): Promise<void> {
  const targets = opts.mentionedUserIds.filter((id) => id && id !== opts.actorId);
  if (targets.length === 0) return;

  await Promise.all(targets.map((targetUserId) =>
    addSocialEvent({
      type: 'mention',
      actorId: opts.actorId,
      actorName: opts.actorName,
      actorAvatar: opts.actorAvatar ?? undefined,
      targetUserId,
      resourceId: opts.resourceId,
      resourceTitle: opts.resourceTitle,
      excerpt: opts.excerpt?.slice(0, 120),
      href: opts.href,
    }).catch(() => { /* a missed notification must not fail the write */ }),
  ));
}
