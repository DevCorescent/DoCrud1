/**
 * Post reactions.
 *
 * Extends the existing like model rather than replacing it. Likes already live
 * on the post document as `likedBy: string[]` + `likesCount`; reactions add a
 * parallel `reactions: Record<identifier, ReactionType>` map on the same
 * document.
 *
 * Why a map and not a collection: the key IS the per-user uniqueness
 * constraint the feature needs — one identifier can hold exactly one reaction,
 * so "change your reaction" is a single-key overwrite and can never produce two
 * records for the same (post, user). No new collection, no migration, and the
 * existing `likedBy` array stays authoritative for "has this viewer reacted",
 * so every current reader keeps working untouched.
 *
 * Types are stable strings, never emoji — the UI owns the glyph.
 */

export const REACTION_TYPES = ['like', 'helpful', 'celebrate', 'insightful', 'opportunity', 'funny'] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export const DEFAULT_REACTION: ReactionType = 'like';

export interface ReactionMeta {
  type: ReactionType;
  emoji: string;
  label: string;
  /** Accessible verb used in aria-labels. */
  aria: string;
}

/** Presentation only. Changing an emoji here never touches stored data. */
export const REACTION_META: Record<ReactionType, ReactionMeta> = {
  like:        { type: 'like',        emoji: '❤️', label: 'Like',        aria: 'React Like' },
  helpful:     { type: 'helpful',     emoji: '👍', label: 'Helpful',     aria: 'React Helpful' },
  celebrate:   { type: 'celebrate',   emoji: '👏', label: 'Celebrate',   aria: 'React Celebrate' },
  insightful:  { type: 'insightful',  emoji: '💡', label: 'Insightful',  aria: 'React Insightful' },
  opportunity: { type: 'opportunity', emoji: '🚀', label: 'Opportunity', aria: 'React Opportunity' },
  funny:       { type: 'funny',       emoji: '😂', label: 'Funny',       aria: 'React Funny' },
};

export function isReactionType(value: unknown): value is ReactionType {
  return typeof value === 'string' && (REACTION_TYPES as readonly string[]).includes(value);
}

/** Server-side coercion: anything unrecognised becomes a plain like. */
export function coerceReactionType(value: unknown): ReactionType {
  return isReactionType(value) ? value : DEFAULT_REACTION;
}

export interface ReactionSummary {
  /** Up to 3 reactor identifiers, newest first — the footer's avatar stack.
      Identifiers only; the caller resolves photos in its existing bulk pass. */
  previewIds: string[];
  /** Count per type, only for types that have at least one reaction. */
  counts: Partial<Record<ReactionType, number>>;
  /** Types ordered by count, highest first — what the footer renders. */
  top: ReactionType[];
  total: number;
  /** The requesting viewer's own reaction, if any. */
  viewer: ReactionType | null;
}

/**
 * Build the compact summary sent with a post.
 *
 * `likedBy` is the source of truth for the total, so posts that were liked
 * before reactions existed still count — their identifiers simply have no entry
 * in the map and fall back to `like`.
 */
export function summarizeReactions(
  likedBy: string[] | undefined,
  reactions: Record<string, string> | undefined,
  viewerIdentifier?: string | null,
): ReactionSummary {
  const ids = likedBy ?? [];
  const map = reactions ?? {};
  const counts: Partial<Record<ReactionType, number>> = {};

  for (const id of ids) {
    const type = coerceReactionType(map[id]);
    counts[type] = (counts[type] ?? 0) + 1;
  }

  const top = (Object.keys(counts) as ReactionType[])
    .sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));

  const viewer = viewerIdentifier && ids.includes(viewerIdentifier)
    ? coerceReactionType(map[viewerIdentifier])
    : null;

  return {
    counts,
    top,
    total: ids.length,
    viewer,
    previewIds: ids.slice(-3).reverse(),
  };
}
