/**
 * Social proof — "people you know engaged with this post".
 *
 * Shape + copy only; this module is imported by both the server aggregator and
 * the client row, so it must stay free of any server import.
 *
 * It describes the EXISTING engagement data from a second angle. There is no
 * new reaction field, no new comment store and no new relationship model: the
 * server intersects `likedBy` / `comments[].userId` with the viewer's existing
 * follower + following lists and returns a bounded preview plus counts.
 */

import { REACTION_META, type ReactionType } from './reactions';

/** How the actor is connected to the viewer. Irrelevant actors are dropped
    server-side, so 'none' is never transported. */
export type SocialRelationship = 'mutual' | 'following' | 'follower';

/** Preview order: someone you both follow and who follows you reads strongest. */
const RELATIONSHIP_RANK: Record<SocialRelationship, number> = {
  mutual: 0,
  following: 1,
  follower: 2,
};

export function compareRelationship(a: SocialRelationship, b: SocialRelationship): number {
  return RELATIONSHIP_RANK[a] - RELATIONSHIP_RANK[b];
}

export interface SocialProofActor {
  /** Canonical user id — never an email, even when the engagement was stored
      under a legacy email identifier. */
  id: string;
  name: string;
  avatarUrl: string | null;
  relationship: SocialRelationship;
  /** Present on reactors only. */
  reactionType?: ReactionType;
}

/**
 * What ships with a post. Previews are capped at 3 per bucket; everything else
 * is a number, so a post with a thousand reactions transports the same payload
 * as one with four.
 */
export interface PostSocialProof {
  reactors: SocialProofActor[];
  commenters: SocialProofActor[];
  /** Distinct people from the viewer's graph who reacted / commented. */
  reactionCount: number;
  commentCount: number;
  /** Dominant reaction among those people — picks the glyph for the row. */
  topReaction: ReactionType | null;
  followingReactionCount: number;
  followerReactionCount: number;
  mutualReactionCount: number;
  followingCommentCount: number;
  followerCommentCount: number;
  mutualCommentCount: number;
}

export const SOCIAL_PROOF_PREVIEW_LIMIT = 3;

/* ─── Copy ───────────────────────────────────────────────────────────────── */

/**
 * Names are only claimed as "you follow" when the viewer actually follows
 * someone in that bucket; a bucket made purely of the viewer's own followers
 * says so instead. Getting this backwards would state a relationship that does
 * not exist, which is worse than being vague.
 */
function connectionPhrase(followsAny: boolean): string {
  return followsAny ? 'you follow' : 'who follow you';
}

/**
 * "Priya", "Priya and Abhay", "Priya and 3 people you follow",
 * "Priya, Abhay and 2 others you follow", or a bare "3 people you follow" when
 * no name could be resolved.
 */
function joinActors(actors: SocialProofActor[], total: number, followsAny: boolean): string {
  const connection = connectionPhrase(followsAny);
  const names = actors.slice(0, total === 1 ? 1 : 2).map((a) => a.name).filter(Boolean);
  const rest = total - names.length;

  if (names.length === 0) {
    return `${total} ${total === 1 ? 'person' : 'people'} ${connection}`;
  }
  if (rest <= 0) {
    return names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`;
  }
  if (names.length === 1) {
    return `${names[0]} and ${rest} ${rest === 1 ? 'person' : 'people'} ${connection}`;
  }
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? 'other' : 'others'} ${connection}`;
}

export interface SocialProofSegment {
  emoji: string;
  /** Visible text, without the emoji. */
  text: string;
  /** Full sentence for assistive tech, emoji excluded. */
  aria: string;
}

export interface SocialProofCopy {
  reaction: SocialProofSegment | null;
  comment: SocialProofSegment | null;
  /** Faces to stack, reactors first — at most SOCIAL_PROOF_PREVIEW_LIMIT. */
  avatars: SocialProofActor[];
}

/**
 * Turn a proof payload into the row's text.
 *
 * When both buckets are present the comment half collapses to a count
 * ("❤️ Priya and 2 people you follow liked this · 💬 2 commented") so the row
 * stays one compact line instead of two competing sentences.
 */
export function describeSocialProof(proof: PostSocialProof | null | undefined): SocialProofCopy | null {
  if (!proof) return null;
  const { reactionCount, commentCount } = proof;
  if (reactionCount <= 0 && commentCount <= 0) return null;

  const followsReactors = proof.mutualReactionCount + proof.followingReactionCount > 0;
  const followsCommenters = proof.mutualCommentCount + proof.followingCommentCount > 0;

  let reaction: SocialProofSegment | null = null;
  if (reactionCount > 0) {
    const type = proof.topReaction ?? 'like';
    // "liked this" only reads right for a heart; everything else is "reacted".
    const verb = type === 'like' ? 'liked this' : 'reacted';
    const who = joinActors(proof.reactors, reactionCount, followsReactors);
    reaction = {
      emoji: REACTION_META[type].emoji,
      text: `${who} ${verb}`,
      aria: `${who} ${type === 'like' ? 'liked this post' : `reacted ${REACTION_META[type].label} to this post`}`,
    };
  }

  let comment: SocialProofSegment | null = null;
  if (commentCount > 0) {
    const who = joinActors(proof.commenters, commentCount, followsCommenters);
    const full = commentCount === 1 && proof.commenters.length === 1
      ? `${who} commented on this`
      : `${who} commented`;
    comment = {
      emoji: '💬',
      // Collapsed when it shares the row with the reaction half.
      text: reaction ? `${commentCount} commented` : full,
      aria: `${who} commented on this post`,
    };
  }

  const avatars = [...proof.reactors, ...proof.commenters.filter(
    (c) => !proof.reactors.some((r) => r.id === c.id),
  )].slice(0, SOCIAL_PROOF_PREVIEW_LIMIT);

  return { reaction, comment, avatars };
}
