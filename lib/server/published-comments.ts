/**
 * Comment payloads for the published-post APIs.
 *
 * Every endpoint that returns a post's comments (the detail route, the
 * comments collection route and the single-comment route) shapes them here, so
 * the client receives one consistent record instead of three near-copies.
 *
 * Avatars are the reason this is shared rather than inlined: engagement is
 * stored under `session.user.id || session.user.email`, so a comment's
 * `userId` can be either form, while `getProfileAvatars` is keyed by canonical
 * user id. This module is the single place the two are reconciled — the same
 * reconciliation lib/server/social-proof.ts performs for reactors.
 */

import { normalizeEmail } from '@/lib/server/security';
import { getStoredUsers, type StoredUser } from '@/lib/server/users';
import { getProfileAvatars } from '@/lib/server/user-profiles';
import { resolveMentions } from '@/lib/server/mentions';
import type { ResolvedMention } from '@/lib/mentions';

/** A comment exactly as persisted on the file-transfer row. */
export type StoredComment = {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
  parentId?: string;
  likedBy?: string[];
  mentionedUserIds?: string[];
};

/** The wire shape consumed by the comment UI. */
export type PublishedComment = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  userId: string;
  /** null — never undefined — so the UI can tell "no avatar" from "not loaded". */
  avatarUrl: string | null;
  parentId: string | null;
  likesCount: number;
  likedByViewer: boolean;
  /** The people @mentioned, resolved to what the renderer links. Empty when
      the comment mentions nobody. */
  mentions: ResolvedMention[];
};

/**
 * Resolve stored engagement identifiers (user id *or* email) to avatar URLs.
 * The returned map is keyed by the identifier that was passed in, so callers
 * can look up straight from the comment row without re-resolving.
 */
export async function getAvatarsForIdentifiers(
  identifiers: string[],
): Promise<Map<string, string | null>> {
  const unique = Array.from(new Set(identifiers.filter(Boolean)));
  if (unique.length === 0) return new Map();

  const users = await getStoredUsers().catch(() => [] as StoredUser[]);
  const byId = new Set<string>();
  const byEmail = new Map<string, string>();
  for (const u of users) {
    if (!u?.id) continue;
    const id = String(u.id);
    byId.add(id);
    if (u.email) byEmail.set(normalizeEmail(u.email), id);
  }

  /* identifier → canonical user id; identifiers we cannot resolve (anonymous
     commenters, deleted accounts) simply stay out and fall back to null. */
  const canonical = new Map<string, string>();
  for (const identifier of unique) {
    if (byId.has(identifier)) { canonical.set(identifier, identifier); continue; }
    if (identifier.includes('@')) {
      const viaEmail = byEmail.get(normalizeEmail(identifier));
      if (viaEmail) canonical.set(identifier, viaEmail);
    }
  }
  if (canonical.size === 0) return new Map(unique.map((i) => [i, null]));

  const avatars = await getProfileAvatars(Array.from(new Set(canonical.values())))
    .catch(() => new Map<string, string | null>());

  return new Map(unique.map((identifier) => {
    const id = canonical.get(identifier);
    return [identifier, id ? avatars.get(id) ?? null : null];
  }));
}

/**
 * Map persisted comments to the wire shape, resolving each author's avatar.
 * One batched avatar lookup per request regardless of comment count.
 */
export async function mapPublishedComments(
  comments: StoredComment[] | undefined,
  viewerIdentifier: string,
): Promise<PublishedComment[]> {
  const list = comments ?? [];
  if (list.length === 0) return [];

  /* One avatar batch for the commenters, one for everyone they mentioned —
     two bulk lookups per request regardless of how many comments there are. */
  const [avatars, mentioned] = await Promise.all([
    getAvatarsForIdentifiers(list.map((c) => c.userId)).catch(() => new Map<string, string | null>()),
    resolveMentions(list.flatMap((c) => c.mentionedUserIds ?? [])).catch(() => [] as ResolvedMention[]),
  ]);
  const mentionById = new Map(mentioned.map((m) => [m.userId, m]));

  return list.map((c) => ({
    id: c.id,
    author: c.userName,
    text: c.text,
    createdAt: c.createdAt,
    userId: c.userId,
    avatarUrl: avatars.get(c.userId) ?? null,
    parentId: c.parentId ?? null,
    likesCount: (c.likedBy ?? []).length,
    likedByViewer: viewerIdentifier ? (c.likedBy ?? []).includes(viewerIdentifier) : false,
    mentions: (c.mentionedUserIds ?? [])
      .map((id) => mentionById.get(id))
      .filter((m): m is ResolvedMention => Boolean(m)),
  }));
}
