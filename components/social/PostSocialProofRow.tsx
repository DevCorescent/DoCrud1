'use client';

/**
 * Social-proof row — "❤️ Priya and 2 people you follow liked this · 💬 2 commented".
 *
 * Purely presentational. Everything it renders arrives on the post payload the
 * surface already fetched, so mounting this component issues no request: no
 * per-reactor lookup, no per-comment fetch, no follower list on the client.
 *
 * It also owns no engagement state. The reaction half opens the EXISTING
 * WhoReactedModal; the comment half calls back into the surface's existing
 * comments section. Nothing here can change a count.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { describeSocialProof, type PostSocialProof, type SocialProofActor } from '@/lib/social-proof';
import { WhoReactedModal } from '@/components/social/PostReactionButton';

/** One face in the stack: photo when we have one, initial when we do not, and
    initial again if the photo fails to load. */
function ProofAvatar({ actor }: { actor: SocialProofActor }) {
  const [failed, setFailed] = useState(false);
  // Reset when the person (or their photo) changes — otherwise a recycled row
  // keeps showing initials for someone whose avatar loads fine.
  useEffect(() => { setFailed(false); }, [actor.avatarUrl]);

  const showImage = Boolean(actor.avatarUrl) && !failed;
  return showImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={actor.avatarUrl as string}
      alt=""
      onError={() => setFailed(true)}
      className="h-[18px] w-[18px] rounded-full object-cover"
      style={{ border: '1px solid var(--sp-face-border)', background: 'var(--sp-face-bg)' }}
    />
  ) : (
    <span
      className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold leading-none"
      style={{ background: 'var(--sp-face-bg)', color: 'var(--sp-text-strong)', border: '1px solid var(--sp-face-border)' }}
    >
      {(actor.name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

export interface PostSocialProofRowProps {
  postId: string;
  socialProof?: PostSocialProof | null;
  /** Opens/focuses the surface's existing comments section. The comment half is
      inert text when this is omitted — no second comment UI is ever created. */
  onOpenComments?: () => void;
  className?: string;
}

export function PostSocialProofRow({ postId, socialProof, onOpenComments, className }: PostSocialProofRowProps) {
  const [whoOpen, setWhoOpen] = useState(false);
  const copy = describeSocialProof(socialProof);

  const openWho = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setWhoOpen(true);
  }, []);

  // No relevant engagement → no row. Never a placeholder, so nothing shifts.
  if (!copy) return null;

  return (
    <div
      className={`social-proof-row mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 ${className ?? ''}`}
      // Wrapping (not scrolling) is what keeps narrow screens from overflowing:
      // the avatars hold the first line and the sentence drops below them.
      style={{ rowGap: '4px' }}
    >
      {copy.avatars.length > 0 && (
        <span className="flex shrink-0 items-center -space-x-1.5" aria-hidden>
          {copy.avatars.map(a => <ProofAvatar key={a.id} actor={a} />)}
        </span>
      )}

      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] leading-[1.4]">
        {copy.reaction && (
          <button
            type="button"
            onClick={openWho}
            aria-label={`${copy.reaction.aria}. See who reacted.`}
            className="social-proof-link inline-flex min-w-0 items-center gap-1 rounded-[6px] text-left"
          >
            <span aria-hidden className="shrink-0">{copy.reaction.emoji}</span>
            <span className="truncate">{copy.reaction.text}</span>
          </button>
        )}

        {copy.reaction && copy.comment && (
          <span aria-hidden style={{ color: 'var(--sp-text)', opacity: 0.55 }}>·</span>
        )}

        {copy.comment && (onOpenComments ? (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onOpenComments(); }}
            aria-label={`${copy.comment.aria}. Open comments.`}
            className="social-proof-link inline-flex min-w-0 items-center gap-1 rounded-[6px] text-left"
          >
            <span aria-hidden className="shrink-0">{copy.comment.emoji}</span>
            <span className="truncate">{copy.comment.text}</span>
          </button>
        ) : (
          <span className="inline-flex min-w-0 items-center gap-1" style={{ color: 'var(--sp-text)' }}>
            <span aria-hidden className="shrink-0">{copy.comment.emoji}</span>
            <span className="truncate">{copy.comment.text}</span>
            <span className="sr-only">{copy.comment.aria}</span>
          </span>
        ))}
      </span>

      {whoOpen && <WhoReactedModal postId={postId} onClose={() => setWhoOpen(false)} />}
    </div>
  );
}

export default PostSocialProofRow;
