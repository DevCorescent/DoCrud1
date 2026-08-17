/**
 * Social-proof aggregation.
 *
 * Cost model — this is the whole point of the module:
 *
 *   per REQUEST (not per post):  1 cached user-table read (already warm; the
 *                                feed reads it anyway for canonical names)
 *                              + 2 follow-graph queries (followers, following)
 *   per POST:                    zero I/O — pure set intersection over data
 *                                already on the row (`likedBy`, `reactions`,
 *                                `comments`)
 *   avatars:                     none of its own; the builder hands its preview
 *                                ids back so the caller folds them into the
 *                                batched getProfileAvatars() it already issues
 *
 * So a 20-post feed costs 2 extra queries in total, and a viewer who follows
 * nobody and is followed by nobody costs zero — createSocialProofBuilder()
 * returns null and every caller skips the work entirely.
 *
 * Callers MUST only pass posts the viewer is already allowed to see; this
 * module reports on engagement, it does not re-authorise the post.
 */

import { getStoredUsers, type StoredUser } from '@/lib/server/users';
import { getFollowers, getFollowing } from '@/lib/server/user-profiles';
import { normalizeEmail } from '@/lib/server/security';
import { coerceReactionType, type ReactionType } from '@/lib/reactions';
import {
  compareRelationship,
  SOCIAL_PROOF_PREVIEW_LIMIT,
  type PostSocialProof,
  type SocialProofActor,
  type SocialRelationship,
} from '@/lib/social-proof';

/** The subset of a post row social proof reads. */
export interface SocialProofPostInput {
  likedBy?: string[];
  reactions?: Record<string, string>;
  comments?: Array<{ userId: string }>;
}

/** Preview actor before name/avatar hydration. */
interface DraftActor {
  id: string;
  relationship: SocialRelationship;
  reactionType?: ReactionType;
}

export interface SocialProofDraft {
  reactors: DraftActor[];
  commenters: DraftActor[];
  reactionCount: number;
  commentCount: number;
  topReaction: ReactionType | null;
  followingReactionCount: number;
  followerReactionCount: number;
  mutualReactionCount: number;
  followingCommentCount: number;
  followerCommentCount: number;
  mutualCommentCount: number;
}

export interface SocialProofBuilder {
  /** Pure + synchronous. Returns null when nobody in the graph engaged. */
  draft(post: SocialProofPostInput): SocialProofDraft | null;
  /** Every user id the drafts will need a photo for — feed these to the
      caller's existing bulk getProfileAvatars() call. */
  previewIds(drafts: Array<SocialProofDraft | null>): string[];
  /** Attach canonical names (held in memory already) and batched avatars. */
  hydrate(draft: SocialProofDraft | null, avatars: Map<string, string | null>): PostSocialProof | null;
}

/**
 * A person is only surfaced while their account is live. Deactivated, pending
 * deletion or disabled accounts are dropped server-side, so social proof can
 * never reintroduce an identity the rest of the product has withdrawn.
 */
function isVisibleActor(user: StoredUser | undefined): user is StoredUser {
  if (!user) return false;
  if (user.isActive === false) return false;
  if (user.deactivatedAt) return false;
  if (user.pendingDeletion) return false;
  if (user.inviteStatus === 'disabled') return false;
  return true;
}

/**
 * Build the per-request aggregator.
 *
 * Returns null — meaning "skip social proof entirely" — when there is no
 * viewer, the viewer cannot be resolved to an account, or the viewer's social
 * graph is empty. That null is the fast path for logged-out traffic.
 */
export async function createSocialProofBuilder(
  viewerIdentifier: string | null | undefined,
): Promise<SocialProofBuilder | null> {
  if (!viewerIdentifier) return null;

  const users = await getStoredUsers().catch(() => [] as StoredUser[]);
  if (users.length === 0) return null;

  const byId = new Map<string, StoredUser>();
  const byEmail = new Map<string, StoredUser>();
  for (const u of users) {
    if (u?.id) byId.set(String(u.id), u);
    if (u?.email) byEmail.set(normalizeEmail(u.email), u);
  }

  /* Engagement is stored under `session.user.id || session.user.email`, so a
     row can hold either form. Everything downstream works in canonical user
     ids; this is the single place the two are reconciled. */
  const resolve = (identifier: string): StoredUser | undefined => {
    if (!identifier) return undefined;
    const direct = byId.get(identifier);
    if (direct) return direct;
    return identifier.includes('@') ? byEmail.get(normalizeEmail(identifier)) : undefined;
  };

  const viewer = resolve(viewerIdentifier);
  if (!viewer?.id) return null;
  const viewerId = String(viewer.id);

  const [followerIds, followingIds] = await Promise.all([
    getFollowers(viewerId).catch(() => [] as string[]),
    getFollowing(viewerId).catch(() => [] as string[]),
  ]);

  const followerSet = new Set(followerIds.map(String));
  const followingSet = new Set(followingIds.map(String));
  // One membership test instead of two on the hot path.
  const socialIds = new Set(Array.from(followingSet).concat(Array.from(followerSet)));
  socialIds.delete(viewerId);
  if (socialIds.size === 0) return null;

  const relationshipOf = (id: string): SocialRelationship => {
    const follows = followingSet.has(id);
    const followedBy = followerSet.has(id);
    if (follows && followedBy) return 'mutual';
    return follows ? 'following' : 'follower';
  };

  /**
   * Walk identifiers newest-first, keeping the first hit per person.
   * `seen` spans the whole walk so someone who reacted twice under two
   * identifier forms is still one person.
   */
  const collect = (
    identifiers: string[],
    onHit?: (identifier: string, actor: DraftActor) => void,
  ): DraftActor[] => {
    const seen = new Set<string>();
    const out: DraftActor[] = [];
    for (let i = identifiers.length - 1; i >= 0; i--) {
      const identifier = identifiers[i];
      const user = resolve(identifier);
      if (!isVisibleActor(user)) continue;
      const id = String(user.id);
      // The viewer is never their own social proof — see requirement 8.
      if (id === viewerId || seen.has(id)) continue;
      if (!socialIds.has(id)) continue;
      seen.add(id);
      const actor: DraftActor = { id, relationship: relationshipOf(id) };
      onHit?.(identifier, actor);
      out.push(actor);
    }
    return out;
  };

  const tally = (actors: DraftActor[]) => ({
    mutual: actors.filter((a) => a.relationship === 'mutual').length,
    following: actors.filter((a) => a.relationship === 'following').length,
    follower: actors.filter((a) => a.relationship === 'follower').length,
  });

  /* Stable sort on relationship rank alone — the input is already newest-first,
     so equal ranks keep recency order. */
  const rank = (actors: DraftActor[]) =>
    [...actors].sort((a, b) => compareRelationship(a.relationship, b.relationship));

  return {
    draft(post) {
      const reactionMap = post.reactions ?? {};
      const reactors = collect(post.likedBy ?? [], (identifier, actor) => {
        actor.reactionType = coerceReactionType(reactionMap[identifier]);
      });
      const commenters = collect((post.comments ?? []).map((c) => c.userId));

      if (reactors.length === 0 && commenters.length === 0) return null;

      // Dominant reaction across the graph reactors picks the row's glyph.
      const counts = new Map<ReactionType, number>();
      for (const r of reactors) {
        if (!r.reactionType) continue;
        counts.set(r.reactionType, (counts.get(r.reactionType) ?? 0) + 1);
      }
      let topReaction: ReactionType | null = null;
      let best = 0;
      counts.forEach((n, type) => {
        if (n > best) { best = n; topReaction = type; }
      });

      const rt = tally(reactors);
      const ct = tally(commenters);

      return {
        reactors: rank(reactors).slice(0, SOCIAL_PROOF_PREVIEW_LIMIT),
        commenters: rank(commenters).slice(0, SOCIAL_PROOF_PREVIEW_LIMIT),
        reactionCount: reactors.length,
        commentCount: commenters.length,
        topReaction,
        mutualReactionCount: rt.mutual,
        followingReactionCount: rt.following,
        followerReactionCount: rt.follower,
        mutualCommentCount: ct.mutual,
        followingCommentCount: ct.following,
        followerCommentCount: ct.follower,
      };
    },

    previewIds(drafts) {
      const ids = new Set<string>();
      for (const d of drafts) {
        if (!d) continue;
        for (const a of d.reactors) ids.add(a.id);
        for (const a of d.commenters) ids.add(a.id);
      }
      return Array.from(ids);
    },

    hydrate(draft, avatars) {
      if (!draft) return null;
      const dress = (a: DraftActor): SocialProofActor => {
        const user = byId.get(a.id);
        return {
          id: a.id,
          // Canonical StoredUser.name, so a rename shows through immediately.
          name: user?.name?.trim() || 'Docrud member',
          avatarUrl: avatars.get(a.id) ?? null,
          relationship: a.relationship,
          ...(a.reactionType ? { reactionType: a.reactionType } : {}),
        };
      };
      return {
        ...draft,
        reactors: draft.reactors.map(dress),
        commenters: draft.commenters.map(dress),
      };
    },
  };
}
