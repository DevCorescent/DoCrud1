'use client';

/**
 * Post reactions — the single implementation used by every published-post
 * surface (profile feed, public feed, published page, item page, business page).
 *
 * Extracted verbatim from the version proven in ProfilePublishedFeed: same
 * optimistic flow, same picker, same modal, same API. Nothing here fetches per
 * post — counts, the viewer's reaction and preview avatars all arrive with the
 * feed/page payload the surface already loads.
 *
 * Split into a hook plus two presentational pieces so each surface can place
 * the button and the summary inside its own layout without forking behaviour.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Heart } from 'lucide-react';
import {
  REACTION_TYPES, REACTION_META,
  type ReactionType, type ReactionSummary,
} from '@/lib/reactions';

export type PostReactionSummary = ReactionSummary & { previewAvatars?: string[] };

export interface PostReactionInit {
  likesCount?: number;
  likedByViewer?: boolean;
  reactions?: PostReactionSummary;
}

export interface PostReactionController {
  reaction: ReactionType | null;
  likeCount: number;
  counts: Partial<Record<ReactionType, number>>;
  previewAvatars: string[];
  pickerOpen: boolean;
  burst: boolean;
  setPickerOpen: (v: boolean) => void;
  openPicker: () => void;
  closePickerSoon: () => void;
  applyReaction: (next: ReactionType | null) => Promise<void>;
  onBodyDoubleTap: (e: React.SyntheticEvent) => void;
}

/**
 * All reaction state for one post.
 *
 * `live` false (e.g. business-page posts, which are a different entity with
 * their own like endpoint) keeps the optimistic UI but skips the published
 * reaction API — matching the existing `isReal` guard.
 */
export function usePostReactions(
  postId: string,
  init: PostReactionInit,
  opts: { live?: boolean; onError?: (message: string) => void; onChanged?: (r: ReactionType | null) => void } = {},
): PostReactionController {
  const { live = true, onError, onChanged } = opts;

  const [reaction, setReaction] = useState<ReactionType | null>(
    init.reactions?.viewer ?? (init.likedByViewer ? 'like' : null),
  );
  const [likeCount, setLikeCount] = useState(init.likesCount ?? 0);
  const [counts, setCounts] = useState<Partial<Record<ReactionType, number>>>(init.reactions?.counts ?? {});
  const [previewAvatars, setPreviewAvatars] = useState<string[]>(init.reactions?.previewAvatars ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [burst, setBurst] = useState(false);

  const inFlight = useRef(false);
  const pickerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);

  // Keep in step when the surface re-fetches its payload.
  useEffect(() => { setReaction(init.reactions?.viewer ?? (init.likedByViewer ? 'like' : null)); },
    [init.reactions?.viewer, init.likedByViewer]);
  useEffect(() => { setLikeCount(init.likesCount ?? 0); }, [init.likesCount]);
  useEffect(() => { setCounts(init.reactions?.counts ?? {}); }, [init.reactions?.counts]);
  useEffect(() => { setPreviewAvatars(init.reactions?.previewAvatars ?? []); }, [init.reactions?.previewAvatars]);

  const openPicker = useCallback(() => {
    if (pickerTimer.current) clearTimeout(pickerTimer.current);
    setPickerOpen(true);
  }, []);
  const closePickerSoon = useCallback(() => {
    if (pickerTimer.current) clearTimeout(pickerTimer.current);
    pickerTimer.current = setTimeout(() => setPickerOpen(false), 180);
  }, []);

  /**
   * Single mutation path: like / change / remove.
   * Optimistic first, request second, response reconciles, failure rolls back
   * to the exact previous snapshot. One in-flight request at a time.
   */
  const applyReaction = useCallback(async (next: ReactionType | null) => {
    if (inFlight.current) return;
    const prev = { reaction, likeCount, counts };
    const target = next !== null && next === reaction ? null : next;

    setPickerOpen(false);
    setReaction(target);
    setLikeCount(c => {
      if (prev.reaction === null && target !== null) return c + 1;
      if (prev.reaction !== null && target === null) return Math.max(0, c - 1);
      return c;                                  // a change keeps the total
    });
    setCounts(c => {
      const draft = { ...c };
      if (prev.reaction) draft[prev.reaction] = Math.max(0, (draft[prev.reaction] ?? 1) - 1);
      if (target) draft[target] = (draft[target] ?? 0) + 1;
      return draft;
    });
    if (target) { setBurst(true); setTimeout(() => setBurst(false), 260); }
    onChanged?.(target);

    if (!live) return;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/published/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: target }),
      });
      if (!res.ok) throw new Error('failed');
      const d = await res.json() as {
        liked: boolean; likesCount: number;
        reactionType: ReactionType | null; reactions?: PostReactionSummary;
      };
      setLikeCount(d.likesCount);
      setReaction(d.reactionType ?? null);
      if (d.reactions?.counts) setCounts(d.reactions.counts);
      if (d.reactions?.previewAvatars) setPreviewAvatars(d.reactions.previewAvatars);
    } catch {
      setReaction(prev.reaction);
      setLikeCount(prev.likeCount);
      setCounts(prev.counts);
      onError?.('Could not save your reaction');
    } finally {
      inFlight.current = false;
    }
  }, [reaction, likeCount, counts, postId, live, onError, onChanged]);

  /** Double-tap likes; never un-likes, and never hijacks a real control. */
  const onBodyDoubleTap = useCallback((e: React.SyntheticEvent) => {
    const el = e.target as HTMLElement | null;
    if (el?.closest('a,button,input,textarea,select,video,audio,[role="button"],[contenteditable="true"]')) return;
    if (typeof window !== 'undefined' && window.getSelection?.()?.toString()) return;

    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      if (!reaction) void applyReaction('like');
      else { setBurst(true); setTimeout(() => setBurst(false), 260); }
    } else {
      lastTapRef.current = now;
    }
  }, [reaction, applyReaction]);

  return {
    reaction, likeCount, counts, previewAvatars, pickerOpen, burst,
    setPickerOpen, openPicker, closePickerSoon, applyReaction, onBodyDoubleTap,
  };
}

/** The Like control plus its reaction picker. */
export function PostReactionButton({ c, compact = false }: { c: PostReactionController; compact?: boolean }) {
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); void c.applyReaction(c.reaction ? null : 'like'); }}
        onMouseEnter={c.openPicker}
        onMouseLeave={c.closePickerSoon}
        onTouchStart={e => { e.stopPropagation(); longPress.current = setTimeout(() => c.setPickerOpen(true), 450); }}
        onTouchEnd={() => { if (longPress.current) clearTimeout(longPress.current); }}
        onKeyDown={e => {
          if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) { e.preventDefault(); c.setPickerOpen(true); }
        }}
        aria-label={c.reaction ? `Remove your ${REACTION_META[c.reaction].label} reaction` : 'Like this post'}
        aria-haspopup="menu"
        aria-expanded={c.pickerOpen}
        className={`reaction-trigger flex items-center gap-1.5 font-semibold transition ${compact ? 'text-[11px]' : 'text-[12px]'} ${c.reaction ? 'text-rose-400' : 'text-white/35 hover:text-white/70'}`}
      >
        {c.reaction && c.reaction !== 'like'
          ? <span className={`text-[15px] leading-none ${c.burst ? 'reaction-pop' : ''}`} aria-hidden>{REACTION_META[c.reaction].emoji}</span>
          : <Heart className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} transition-transform ${c.reaction ? 'fill-current' : ''} ${c.burst ? 'reaction-pop' : ''}`} />}
        <span>{c.likeCount > 0 ? c.likeCount : (c.reaction ? REACTION_META[c.reaction].label : 'Like')}</span>
      </button>

      {c.pickerOpen && (
        <div
          role="menu"
          aria-label="Choose a reaction"
          onMouseEnter={c.openPicker}
          onMouseLeave={c.closePickerSoon}
          className="reaction-tray absolute bottom-full left-0 z-30 mb-2 flex items-center gap-0.5 rounded-full border px-1.5 py-1"
          style={{ background: 'var(--rx-surface)', borderColor: 'var(--rx-border)', boxShadow: 'var(--rx-shadow)' }}
        >
          {REACTION_TYPES.map(t => (
            <button
              key={t}
              type="button"
              role="menuitem"
              title={REACTION_META[t].label}
              aria-label={REACTION_META[t].aria}
              onClick={e => { e.stopPropagation(); void c.applyReaction(t); }}
              className={`reaction-chip flex h-8 w-8 items-center justify-center rounded-full text-[17px] transition ${c.reaction === t ? 'ring-1 ring-rose-400/50' : ''}`}
            >
              <span aria-hidden>{REACTION_META[t].emoji}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Top reaction glyphs, up to three reactor photos, and the who-reacted trigger. */
export function PostReactionSummaryBar({ c, postId, fmtCount }: {
  c: PostReactionController;
  postId: string;
  fmtCount?: (n: number) => string;
}) {
  const [whoOpen, setWhoOpen] = useState(false);
  const fmt = fmtCount ?? ((n: number) => String(n));
  if (c.likeCount <= 0) return null;

  return (
    <div className="mt-3 flex items-center gap-2">
      <span className="flex items-center -space-x-1" aria-hidden>
        {(Object.keys(c.counts) as ReactionType[])
          .sort((a, b) => (c.counts[b] ?? 0) - (c.counts[a] ?? 0))
          .slice(0, 3)
          .map(t => (
            <span key={t}
              className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px]"
              style={{ background: 'var(--rx-surface)', border: '1px solid var(--rx-border)' }}>
              {REACTION_META[t].emoji}
            </span>
          ))}
      </span>

      {c.previewAvatars.length > 0 && (
        <span className="flex items-center -space-x-1.5" aria-hidden>
          {c.previewAvatars.slice(0, 3).map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={url} alt="" className="h-[18px] w-[18px] rounded-full object-cover"
              style={{ border: '1px solid var(--rx-border)' }} />
          ))}
        </span>
      )}

      <button
        type="button"
        onClick={e => { e.stopPropagation(); setWhoOpen(true); }}
        className="text-[11px] text-white/35 transition hover:text-white/70 hover:underline"
        aria-label={`See who reacted — ${c.likeCount} ${c.likeCount === 1 ? 'reaction' : 'reactions'}`}
      >
        {fmt(c.likeCount)} {c.likeCount === 1 ? 'reaction' : 'reactions'}
      </button>

      {whoOpen && <WhoReactedModal postId={postId} onClose={() => setWhoOpen(false)} />}
    </div>
  );
}

/* ─── Who reacted ────────────────────────────────────────────────────────────
   Bounded listing from the single existing endpoint. */
interface Reactor { id: string; name: string; avatarUrl: string | null; type: ReactionType }

export function WhoReactedModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [filter, setFilter] = useState<'all' | ReactionType>('all');
  const [rows, setRows] = useState<Reactor[]>([]);
  const [counts, setCounts] = useState<Partial<Record<ReactionType, number>>>({});
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (type: 'all' | ReactionType, offset: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/published/${postId}/reactions?type=${type}&offset=${offset}&limit=30`);
      if (!res.ok) throw new Error('failed');
      const d = await res.json() as {
        reactors: Reactor[]; total: number; hasMore: boolean;
        summary: { counts: Partial<Record<ReactionType, number>> };
      };
      setRows(prev => (offset === 0 ? d.reactors : [...prev, ...d.reactors]));
      setCounts(d.summary?.counts ?? {});
      setTotal(d.total); setHasMore(d.hasMore); setError(false);
    } catch { setError(true); } finally { setLoading(false); }
  }, [postId]);

  useEffect(() => { void load(filter, 0); }, [filter, load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog" aria-modal="true" aria-label="Reactions" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'var(--rx-scrim)' }} />
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full sm:max-w-[420px] max-h-[75vh] flex flex-col overflow-hidden rounded-t-[22px] sm:rounded-[18px]"
        style={{ background: 'var(--rx-panel)', border: '1px solid var(--rx-border)', boxShadow: 'var(--rx-shadow)' }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--rx-border)' }}>
          <p className="text-[14px] font-bold" style={{ color: 'var(--rx-text)' }}>Reactions</p>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[13px]"
            style={{ background: 'var(--rx-chip-hover)', color: 'var(--rx-text-muted)' }}>✕</button>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto px-4 py-2.5" style={{ borderBottom: '1px solid var(--rx-border)' }}>
          {(['all', ...(Object.keys(counts) as ReactionType[])] as Array<'all' | ReactionType>).map(t => (
            <button key={t} type="button" onClick={() => setFilter(t)}
              className="shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition"
              style={{
                background: filter === t ? 'var(--rx-chip-hover)' : 'transparent',
                border: `1px solid ${filter === t ? 'var(--rx-border)' : 'transparent'}`,
                color: filter === t ? 'var(--rx-text)' : 'var(--rx-text-muted)',
              }}>
              {t === 'all' ? `All ${total}` : `${REACTION_META[t].emoji} ${counts[t] ?? 0}`}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
          {error && <p className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--rx-text-muted)' }}>Could not load reactions.</p>}
          {!error && rows.map(r => (
            <a key={r.id} href={`/u/${r.id}`} className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition"
              style={{ color: 'var(--rx-text)' }}>
              {r.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={r.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
                : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
                    style={{ background: 'var(--rx-chip-hover)', color: 'var(--rx-text-muted)' }}>
                    {(r.name || '?').charAt(0).toUpperCase()}
                  </span>}
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{r.name}</span>
              <span className="shrink-0 text-[15px]" aria-label={REACTION_META[r.type].label}>{REACTION_META[r.type].emoji}</span>
            </a>
          ))}
          {!error && !loading && rows.length === 0 && (
            <p className="px-3 py-6 text-center text-[12px]" style={{ color: 'var(--rx-text-muted)' }}>No reactions yet.</p>
          )}
          {hasMore && (
            <button type="button" onClick={() => void load(filter, rows.length)} disabled={loading}
              className="mx-auto my-2 block rounded-full px-3 py-1.5 text-[11.5px] font-semibold"
              style={{ background: 'var(--rx-chip-hover)', color: 'var(--rx-text)' }}>
              {loading ? 'Loading…' : 'Show more'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
