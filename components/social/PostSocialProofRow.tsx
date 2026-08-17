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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { describeSocialProof, type PostSocialProof, type SocialProofActor } from '@/lib/social-proof';
import { WhoReactedModal, ReactorRow, useReactors } from '@/components/social/PostReactionButton';

/**
 * "Who reacted" without leaving the row.
 *
 * A popover on pointer screens, a bottom sheet on phones where a 200px-wide
 * popover would be unusable. Data comes from useReactors — the same single
 * endpoint the who-reacted modal uses — and only once the panel is opened.
 */
function ReactorsDropdown({ postId, count, onClose }: {
  postId: string; count: number; onClose: () => void;
}) {
  const { rows, total, hasMore, loading, error, load, viewerId } = useReactors(postId, true);
  const sheetRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Outside click and Escape both dismiss. Both panels are in the DOM (one is
  // hidden by CSS), so a click counts as "inside" if it lands in either.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (sheetRef.current?.contains(t) || popRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const list = (
    <>
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
        <p className="text-[12px] font-bold" style={{ color: 'var(--rx-text)' }}>People who reacted</p>
        {/* The row's chip counts people you follow; this panel lists everyone,
            so the number is labelled to make the difference deliberate. */}
        <span className="text-[11px] tabular-nums" style={{ color: 'var(--rx-text-muted)' }}>All {total || count}</span>
      </div>
      <div className="max-h-[260px] overflow-y-auto px-1.5 pb-1.5 scrollbar-minimal">
        {error && <p className="px-3 py-5 text-center text-[12px]" style={{ color: 'var(--rx-text-muted)' }}>Could not load reactions.</p>}
        {!error && rows.map(r => <ReactorRow key={r.id} r={r} youId={viewerId} />)}
        {!error && loading && rows.length === 0 && (
          <p className="px-3 py-5 text-center text-[12px]" style={{ color: 'var(--rx-text-muted)' }}>Loading…</p>
        )}
        {!error && !loading && rows.length === 0 && (
          <p className="px-3 py-5 text-center text-[12px]" style={{ color: 'var(--rx-text-muted)' }}>No reactions yet.</p>
        )}
        {hasMore && (
          <button type="button" onClick={() => void load('all', rows.length)} disabled={loading}
            className="mx-auto my-1.5 block rounded-full px-3 py-1.5 text-[11.5px] font-semibold"
            style={{ background: 'var(--rx-chip-hover)', color: 'var(--rx-text)' }}>
            {loading ? 'Loading…' : 'Show more'}
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Phones: bottom sheet. */}
      <div className="fixed inset-0 z-[9998] flex items-end sm:hidden" role="dialog" aria-modal="true" aria-label="People who reacted">
        <div className="absolute inset-0" style={{ background: 'var(--rx-scrim)' }} />
        <div ref={sheetRef} className="relative w-full rounded-t-[18px] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
          style={{ background: 'var(--rx-panel)', borderTop: '1px solid var(--rx-border)', boxShadow: 'var(--rx-shadow)' }}>
          {list}
        </div>
      </div>

      {/* Pointer screens: a compact popover anchored to the row. */}
      <div
        ref={popRef}
        role="dialog"
        aria-label="People who reacted"
        className="absolute left-0 top-full z-30 mt-1.5 hidden w-[260px] overflow-hidden rounded-[14px] sm:block
          animate-in fade-in slide-in-from-top-1 [animation-duration:150ms] motion-reduce:animate-none"
        style={{ background: 'var(--rx-panel)', border: '1px solid var(--rx-border)', boxShadow: 'var(--rx-shadow)' }}
      >
        {list}
      </div>
    </>
  );
}

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
  const [listOpen, setListOpen] = useState(false);
  const copy = describeSocialProof(socialProof);
  const reactionCount = socialProof?.reactionCount ?? 0;

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

        {/* Count + disclosure. Compact by design; the sentence stays the
            headline and this answers "who else, and with what". */}
        {copy.reaction && reactionCount > 0 && (
          <span className="relative inline-flex">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setListOpen(o => !o); }}
              aria-haspopup="dialog"
              aria-expanded={listOpen}
              aria-label={`See everyone who reacted — ${reactionCount} ${reactionCount === 1 ? 'person' : 'people'}`}
              className="social-proof-link inline-flex min-h-[40px] items-center gap-0.5 rounded-[6px] px-1 text-[11.5px] font-semibold tabular-nums sm:min-h-0"
            >
              {reactionCount}
              <ChevronDown className={`h-3 w-3 transition-transform duration-150 motion-reduce:transition-none ${listOpen ? 'rotate-180' : ''}`} />
            </button>
            {listOpen && (
              <ReactorsDropdown postId={postId} count={reactionCount} onClose={() => setListOpen(false)} />
            )}
          </span>
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
