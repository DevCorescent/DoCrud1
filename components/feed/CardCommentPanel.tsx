'use client';

/**
 * Inline comment panel for a published post.
 *
 * Extracted from PublishedPage so the homepage feed can open the same panel
 * instead of navigating away. The behaviour it already had — loading, nested
 * replies, likes, delete, submit validation, comment-count reporting — is
 * unchanged; what is new is the composer shell (viewer avatar, emoji, a
 * disabled media control) and inline error reporting, which replaced a
 * module-local toast that only existed on the Published page.
 *
 * Every write goes through the existing /api/public/published/[id]/comments
 * route, which derives the author from the session. No comment API was added.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Heart, Image as ImageIcon, Reply, Send, Smile, Trash2 } from 'lucide-react';
import { renderWithMentions } from '@/lib/mentions';

/** Only what the panel actually needs from a feed item. */
export type CommentPanelItem = {
  id: string;
  isReal?: boolean;
};

/* A short, dependency-free palette. The project has no emoji picker to reuse,
   and pulling a third-party one in for this would be out of proportion. */
const QUICK_EMOJI = ['👍', '🙌', '🔥', '👏', '💡', '🎉', '❤️', '😊', '🤝', '✅'];

export type MentionCandidate = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
};

/**
 * The mention token the caret currently sits in, or null.
 *
 * A token starts at an @ that begins the text or follows whitespace, and runs
 * up to the caret without crossing whitespace — so "email me @ 5" or a stray @
 * mid-word never opens the list.
 */
function mentionTokenAt(value: string, caret: number): { query: string; start: number } | null {
  const upto = value.slice(0, caret);
  const at = upto.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(upto[at - 1])) return null;
  const query = upto.slice(at + 1);
  if (/\s/.test(query)) return null;
  if (query.length > 40) return null;
  return { query, start: at };
}

/** A person the viewer picked from the suggestion list in the current draft. */
export type SelectedMention = { userId: string; displayName: string };

/**
 * Display text -> stored text.
 *
 * The composer holds what the viewer reads ("Hey @Gauransh Agarwal") while the
 * wire format is @[Name](userId). Rebuilding the markup here — from the people
 * actually chosen from the list — means the visible value never contains
 * machine markup and the id is never guessed from free text.
 *
 * Longest name first, so "@Gauransh Agarwal" is not matched as "@Gauransh".
 * A name the viewer has since edited or deleted simply fails to match and
 * stays plain text, which is the safe outcome: no id, no mention.
 */
export function toStorageText(display: string, mentions: SelectedMention[]): string {
  if (mentions.length === 0) return display;
  const byLength = [...mentions].sort((a, b) => b.displayName.length - a.displayName.length);
  let out = '';
  let i = 0;
  while (i < display.length) {
    /* Only at a token boundary — the same rule mentionTokenAt() applies, so an
       email address or a mid-word @ can never become a mention. */
    if (display[i] === '@' && (i === 0 || /\s/.test(display[i - 1]))) {
      const rest = display.slice(i + 1);
      const hit = byLength.find((m) => m.displayName && rest.startsWith(m.displayName));
      if (hit) {
        out += `@[${hit.displayName}](${hit.userId})`;
        i += 1 + hit.displayName.length;
        continue;
      }
    }
    out += display[i];
    i += 1;
  }
  return out;
}

export type CardComment = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  userId?: string;
  parentId?: string | null;
  likesCount: number;
  likedByViewer: boolean;
  isOwner?: boolean;
  replies?: CardComment[];
};

export function CardCommentPanel({
  item,
  onClose,
  onCommentCountChange,
  viewAllHref,
  viewerName,
}: {
  item: CommentPanelItem;
  onClose: () => void;
  onCommentCountChange?: (count: number) => void;
  /** Existing post page, when the host has one. Omitted hides the link. */
  viewAllHref?: string;
  /** Only used for the avatar fallback initial. */
  viewerName?: string | null;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const [comments, setComments] = useState<CardComment[]>([]);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /* Inline, next to the composer — never a toast or an alert (spec 19). */
  const [error, setError] = useState<string | null>(null);
  /* The signed-in viewer's real avatar, from the endpoint the nav already
     uses. No new API, and no placeholder when a real one exists. */
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  /* @mention typeahead. `query` is null when the caret is not inside a
     mention token, which is also what hides the list. */
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<MentionCandidate[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionLoading, setMentionLoading] = useState(false);
  /* Everyone the viewer has picked from the list in this draft. The composer
     shows "@Display Name"; this is what turns that back into the stored
     @[Name](id) markup at submit time, so the id never has to be typed or
     parsed out of the visible text. Kept per draft, not per keystroke. */
  const [mentions, setMentions] = useState<SelectedMention[]>([]);
  /* The Escape listener is registered once on document and would otherwise
     close over a stale `mentionQuery`. */
  const mentionOpenRef = useRef(false);
  mentionOpenRef.current = mentionQuery !== null;
  /* The one token the viewer has dismissed with Escape, as "start:query".
     Without this the keyup that ends the very same Escape re-reads the caret,
     finds it still sitting inside "@ga" and reopens the list the keydown just
     closed. Any edit that changes the token clears the dismissal. */
  const dismissedTokenRef = useRef<string | null>(null);

  const tokenKey = (t: { query: string; start: number } | null) => (t ? `${t.start}:${t.query}` : null);

  /** Single place that decides whether the suggestion list should be open. */
  const syncMentionToken = useCallback((el: HTMLTextAreaElement) => {
    const token = mentionTokenAt(el.value, el.selectionStart ?? el.value.length);
    if (token && dismissedTokenRef.current === tokenKey(token)) return;
    dismissedTokenRef.current = null;
    setMentionQuery(token ? token.query : null);
  }, []);

  /** Escape: remember what was dismissed, then close only the list. */
  const dismissMentionList = useCallback(() => {
    const el = inputRef.current;
    if (el) {
      dismissedTokenRef.current = tokenKey(
        mentionTokenAt(el.value, el.selectionStart ?? el.value.length),
      );
    }
    setMentionQuery(null);
  }, []);

  const [replyTo, setReplyTo] = useState<{
    id: string;
    author: string;
  } | null>(null);

  const [replyText, setReplyText] = useState('');

  const [deletingCommentId, setDeletingCommentId] =
    useState<string | null>(null);

  /*
   * Convert flat comments from API into nested comments.
   */
const buildCommentTree = useCallback(
    (items: CardComment[]): CardComment[] => {
      const byId: Record<string, CardComment> = {};
      const roots: CardComment[] = [];

      for (const comment of items) {
        byId[comment.id] = {
          ...comment,
          replies: [],
        };
      }

      for (const comment of Object.values(byId)) {
        if (comment.parentId && byId[comment.parentId]) {
          byId[comment.parentId].replies!.push(comment);
        } else {
          roots.push(comment);
        }
      }

      return roots;
    },
    [],
  );

  /*
   * Count all comments including nested replies.
   */
  const countAllComments = useCallback(
    (list: CardComment[]): number => {
      return list.reduce(
        (total, comment) =>
          total +
          1 +
          (comment.replies
            ? countAllComments(comment.replies)
            : 0),
        0,
      );
    },
    [],
  );

  const viewerInitial = (viewerName ?? '').trim().charAt(0).toUpperCase();

  /* The viewer's real avatar. Same endpoint the nav announcement uses, so this
     adds no API surface. */
  useEffect(() => {
    let cancelled = false;
    fetch('/api/me/badge')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { avatarUrl?: string | null } | null) => {
        if (!cancelled && d && typeof d.avatarUrl === 'string' && d.avatarUrl) setMyAvatar(d.avatarUrl);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  /* Suggestions for the current token. Debounced, and the previous request is
     aborted so out-of-order responses cannot overwrite newer ones. */
  useEffect(() => {
    if (mentionQuery === null) { setMentionResults([]); setMentionLoading(false); return; }
    /* A stale-result flag rather than an AbortController: aborting mid-flight
       leaves the request with no response to settle on, which previously left
       the list stuck on its loading state. The request is allowed to finish
       and its result is simply ignored if a newer query has replaced it. */
    let stale = false;
    setMentionLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/mentions/search?q=${encodeURIComponent(mentionQuery)}`)
        .then((r) => (r.ok ? r.json() : { people: [] }))
        .then((d: { people?: MentionCandidate[] }) => {
          if (stale) return;
          setMentionResults(Array.isArray(d.people) ? d.people : []);
          setMentionIndex(0);
        })
        .catch(() => { if (!stale) setMentionResults([]); })
        .finally(() => { if (!stale) setMentionLoading(false); });
    }, 180);
    return () => { stale = true; clearTimeout(t); };
  }, [mentionQuery]);

  /**
   * Swaps the half-typed token under the caret for the person's display name.
   *
   * Only the token is replaced: everything before the @ and everything after
   * the caret is carried across untouched, so "Hello @gau nice" becomes
   * "Hello @Gauransh Agarwal nice" with " nice" still there. A trailing space
   * is added and the caret parked after it, which is what lets the viewer keep
   * typing — or pick a second person — without touching the mouse.
   *
   * This closes nothing: the panel, the composer and the draft all survive.
   */
  const applyMention = useCallback((person: MentionCandidate) => {
    const el = inputRef.current;
    const caret = el ? el.selectionStart ?? text.length : text.length;
    const token = mentionTokenAt(text, caret);
    if (!token) return;

    const before = text.slice(0, token.start);
    const after = text.slice(caret);
    /* The trailing space is there so the viewer can keep typing straight away.
       When the text after the caret already opens with a space or punctuation
       it would produce "Agarwal  nice work" or "Agarwal , welcome!", so it is
       skipped and the caret still lands directly after the name. */
    const inserted = `@${person.name}${/^[\s,.!?;:)\]}]/.test(after) ? '' : ' '}`;
    const next = `${before}${inserted}${after}`;
    const pos = token.start + inserted.length;

    setText(next);
    /* Same person picked twice is one entry — the markup rebuild is keyed on
       the name, and the server de-duplicates ids again anyway. */
    setMentions((prev) => (
      prev.some((m) => m.userId === person.userId)
        ? prev
        : [...prev, { userId: person.userId, displayName: person.name }]
    ));
    dismissedTokenRef.current = null;
    setMentionQuery(null);
    setMentionResults([]);
    if (error) setError(null);

    /* After the value re-render, not before: setSelectionRange on the old
       value would be clobbered by React writing the new one. */
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(pos, pos);
      node.style.height = 'auto';
      node.style.height = `${Math.min(node.scrollHeight, 96)}px`;
    });
  }, [text, error]);

  /*
   * Load comments.
   */
  useEffect(() => {
    let cancelled = false;

    if (!item.isReal) {
      setLoading(false);
      return;
    }

    setLoading(true);

    fetch(`/api/public/published/${item.id}/comments`, {
      method: 'GET',
      cache: 'no-store',
    })
      .then(async response => {
        if (!response.ok) {
          return { comments: [] };
        }

        return (await response.json()) as {
          comments?: CardComment[];
        };
      })
      .then(data => {
        if (cancelled) return;

        const incomingComments = Array.isArray(data.comments)
          ? data.comments
          : [];

        setComments(buildCommentTree(incomingComments));
      })
      .catch(() => {
        if (!cancelled) {
          setComments([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [item.id, item.isReal, buildCommentTree]);

  /*
   * Close panel when clicking outside.
   */
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        onClose();
      }
    };

    /* CAPTURE, not bubble. This listener asks "was the click inside the
       panel?", and the only reliable moment to ask is before React has had a
       chance to react to the same click.

       In the bubble phase the answer is wrong for any control that removes
       itself when pressed. Pressing a mention suggestion runs React's
       onMouseDown at the root container, which clears the suggestion state and
       — mousedown being a discrete event in React 18 — flushes synchronously,
       unmounting the <li> before the event reaches document. `target` is then
       a detached node, contains() says false, and the panel closed itself on a
       click that was inside it. The emoji picker had the same failure mode.

       Capturing runs this before any React handler, while the target is still
       in the tree, so the question is answered against the DOM the user
       actually clicked. Genuine outside clicks are unaffected. */
    document.addEventListener(
      'mousedown',
      handleOutsideClick,
      true,
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick,
        true,
      );
    };
  }, [onClose]);

  /*
   * Escape closes the panel.
   */
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      /* Escape dismisses the suggestion list first and stops there — the
         composer stays open with its text intact. A second Escape, with no
         list open, closes the panel as before. Read through a ref because this
         listener is registered once and must not go stale. */
      if (mentionOpenRef.current) {
        dismissMentionList();
        return;
      }
      onClose();
    };

    /* CAPTURE, for the same reason the outside-click listener captures.
       Next's App Router hydrates the whole document, so React's delegated
       listeners live on `document` too — and stopPropagation from a component
       cannot stop a sibling listener on that same node. In the bubble phase
       React therefore runs first, clears the mention state, and this handler
       then reads a ref that has already flipped to false and closes the whole
       panel. Capturing asks the question before React has answered it. */
    document.addEventListener('keydown', handleEscape, true);

    return () => {
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [onClose, dismissMentionList]);

  /*
   * Submit comment or reply.
   */
  const submitComment = useCallback(
    async (parentId?: string) => {
      /* Replies have no suggestion list of their own, so only the root
         composer needs the display -> markup rebuild. */
      const body = parentId
        ? replyText.trim()
        : toStorageText(text.trim(), mentions);

      if (!body || submitting) {
        return;
      }

      if (!item.isReal) {
        setError('Comments are unavailable for this post.');
        return;
      }

      setSubmitting(true);

      try {
        const response = await fetch(
          `/api/public/published/${item.id}/comments`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              text: body,
              ...(parentId ? { parentId } : {}),
            }),
          },
        );

        const data = (await response
          .json()
          .catch(() => null)) as
          | { comments?: CardComment[]; error?: string }
          | null;

        if (!response.ok) {
          setError(data?.error || 'Unable to post comment. Please try again.');
          return;
        }

       const updatedComments = Array.isArray(
          data?.comments,
        )
          ? data.comments
          : [];

        const nextTree = buildCommentTree(updatedComments);
        setComments(nextTree);
        onCommentCountChange?.(
          countAllComments(nextTree),
        );

        if (parentId) {
          setReplyText('');
          setReplyTo(null);
        } else {
          setText('');
          setMentions([]);
          inputRef.current?.focus();
        }
      } catch {
        setError('Unable to post comment. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
 [
      buildCommentTree,
      countAllComments,
      item.id,
      item.isReal,
      onCommentCountChange,
      mentions,
      replyText,
      submitting,
      text,
    ],
  );

  /*
   * Like/unlike comment.
   */
  const likeComment = useCallback(
    async (commentId: string) => {
      if (!item.isReal) {
        return;
      }

      let previousLiked = false;

      const updateComments = (
        list: CardComment[],
      ): CardComment[] => {
        return list.map(comment => {
          if (comment.id === commentId) {
            previousLiked = comment.likedByViewer;

            const nextLiked =
              !comment.likedByViewer;

            return {
              ...comment,
              likedByViewer: nextLiked,
              likesCount: nextLiked
                ? comment.likesCount + 1
                : Math.max(
                    0,
                    comment.likesCount - 1,
                  ),
            };
          }

          if (comment.replies?.length) {
            return {
              ...comment,
              replies: updateComments(
                comment.replies,
              ),
            };
          }

          return comment;
        });
      };

      setComments(prev => updateComments(prev));

      try {
        const response = await fetch(
          `/api/public/published/${item.id}/comments/${commentId}/like`,
          {
            method: 'POST',
          },
        );

        if (!response.ok) {
          throw new Error('Like request failed');
        }

        const data = (await response.json()) as {
          liked?: boolean;
          likesCount?: number;
        };

        if (
          typeof data.liked === 'boolean' &&
          typeof data.likesCount === 'number'
        ) {
          const syncComments = (
            list: CardComment[],
          ): CardComment[] => {
            return list.map(comment => {
              if (comment.id === commentId) {
                return {
                  ...comment,
                  likedByViewer: data.liked!,
                  likesCount: Math.max(
                    0,
                    data.likesCount!,
                  ),
                };
              }

              if (comment.replies?.length) {
                return {
                  ...comment,
                  replies: syncComments(
                    comment.replies,
                  ),
                };
              }

              return comment;
            });
          };

          setComments(prev =>
            syncComments(prev),
          );
        }
      } catch {
        // Revert optimistic update.
        const revertComments = (
          list: CardComment[],
        ): CardComment[] => {
          return list.map(comment => {
            if (comment.id === commentId) {
              return {
                ...comment,
                likedByViewer: previousLiked,
                likesCount: previousLiked
                  ? comment.likesCount + 1
                  : Math.max(
                      0,
                      comment.likesCount - 1,
                    ),
              };
            }

            if (comment.replies?.length) {
              return {
                ...comment,
                replies: revertComments(
                  comment.replies,
                ),
              };
            }

            return comment;
          });
        };

        setComments(prev =>
          revertComments(prev),
        );

        setError('Unable to update comment like.');
      }
    },
    [item.id, item.isReal],
  );

  /*
   * Delete comment.
   *
   * Backend must verify ownership.
   */
  const deleteComment = useCallback(
    async (commentId: string) => {
      if (
        deletingCommentId ||
        !item.isReal
      ) {
        return;
      }

      const confirmed = window.confirm(
        'Are you sure you want to delete this comment?',
      );

      if (!confirmed) {
        return;
      }

      setDeletingCommentId(commentId);

      try {
        const response = await fetch(
          `/api/public/published/${item.id}/comments/${commentId}`,
          {
            method: 'DELETE',
          },
        );

        const data = (await response
          .json()
          .catch(() => null)) as
          | {
              error?: string;
              comments?: CardComment[];
            }
          | null;

        if (!response.ok) {
          setError(data?.error || 'Unable to delete comment.');
          return;
        }

        /*
         * If backend returns updated comments,
         * use them. Otherwise remove locally.
         */
      if (Array.isArray(data?.comments)) {
          const nextTree = buildCommentTree(data.comments);
          setComments(nextTree);
          onCommentCountChange?.(
            countAllComments(nextTree),
          );
        } else {
          const removeComment = (
            list: CardComment[],
          ): CardComment[] => {
            return list
              .filter(
                comment =>
                  comment.id !== commentId,
              )
              .map(comment => ({
                ...comment,
                replies: comment.replies
                  ? removeComment(
                      comment.replies,
                    )
                  : [],
              }));
          };

          setComments(prev => {
            const next = removeComment(prev);
            onCommentCountChange?.(
              countAllComments(next),
            );
            return next;
          });
        }

        /*
         * Close reply box if deleting the
         * comment currently being replied to.
         */
        if (replyTo?.id === commentId) {
          setReplyTo(null);
          setReplyText('');
        }

        setError(null);
      } catch {
        setError('Unable to delete comment. Please try again.');
      } finally {
        setDeletingCommentId(null);
      }
    },
       [
      buildCommentTree,
      countAllComments,
      deletingCommentId,
      item.id,
      item.isReal,
      onCommentCountChange,
      replyTo?.id,
    ],
  );

  /*
   * Relative time.
   */
  const ago = useCallback((iso: string) => {
    const timestamp = new Date(iso).getTime();

    if (!Number.isFinite(timestamp)) {
      return '';
    }

    const difference =
      Math.max(0, Date.now() - timestamp);

    if (difference < 60_000) {
      return 'now';
    }

    if (difference < 3_600_000) {
      return `${Math.floor(
        difference / 60_000,
      )}m`;
    }

    if (difference < 86_400_000) {
      return `${Math.floor(
        difference / 3_600_000,
      )}h`;
    }

    return `${Math.floor(
      difference / 86_400_000,
    )}d`;
  }, []);

  /*
   * Render one comment recursively.
   */
  const renderComment = (
    comment: CardComment,
    depth = 0,
  ): React.ReactNode => {
    return (
      <div
        key={comment.id}
        className={
          depth > 0
            ? 'ml-7 mt-2'
            : 'mt-3'
        }
      >
        <div className="flex gap-2">
          {/* Avatar */}
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white/60">
            {(comment.author || 'AN')
              .slice(0, 2)
              .toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            {/* Header */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] font-semibold text-white/80">
                {comment.author}
              </span>

              <span className="text-[10px] text-white/25">
                {ago(comment.createdAt)}
              </span>
            </div>

            {/* Text */}
            <p className="mt-0.5 break-words text-[12px] leading-relaxed text-white/65">
              {renderWithMentions(comment.text)}
            </p>

            {/* Actions */}
            <div className="mt-1 flex items-center gap-3">
              {/* Like */}
              <button
                type="button"
                onClick={() =>
                  void likeComment(comment.id)
                }
                className={`flex items-center gap-1 text-[10px] font-semibold transition ${
                  comment.likedByViewer
                    ? 'text-rose-400'
                    : 'text-white/25 hover:text-rose-400'
                }`}
                aria-label={
                  comment.likedByViewer
                    ? 'Unlike comment'
                    : 'Like comment'
                }
              >
                <Heart
                  className={`h-3 w-3 ${
                    comment.likedByViewer
                      ? 'fill-current'
                      : ''
                  }`}
                />

                {comment.likesCount > 0 && (
                  <span>
                    {comment.likesCount}
                  </span>
                )}
              </button>

              {/* Reply */}
              {depth === 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setReplyTo(
                      replyTo?.id ===
                        comment.id
                        ? null
                        : {
                            id: comment.id,
                            author:
                              comment.author,
                          },
                    )
                  }
                  className="text-[10px] font-semibold text-white/25 transition hover:text-white/55"
                >
                  Reply
                </button>
              )}

              {/* Delete — ONLY OWNER */}
              {comment.isOwner && (
                <button
                  type="button"
                  disabled={
                    deletingCommentId ===
                    comment.id
                  }
                  onClick={() =>
                    void deleteComment(
                      comment.id,
                    )
                  }
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/25 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Delete comment"
                  aria-label="Delete comment"
                >
                  {deletingCommentId ===
                  comment.id ? (
                    <span className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-red-400" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}

                  Delete
                </button>
              )}
            </div>

            {/* Reply input */}
            {replyTo?.id === comment.id && (
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  autoFocus
                  value={replyText}
                  onChange={event =>
                    setReplyText(
                      event.target.value,
                    )
                  }
                  onKeyDown={event => {
                    if (
                      event.key ===
                        'Enter' &&
                      !event.shiftKey
                    ) {
                      event.preventDefault();

                      void submitComment(
                        comment.id,
                      );
                    }

                    if (
                      event.key ===
                      'Escape'
                    ) {
                      setReplyTo(null);
                      setReplyText('');
                    }
                  }}
                  placeholder={`Reply to ${comment.author}…`}
                  className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.07] px-2.5 py-1.5 text-[11px] text-white outline-none placeholder:text-white/25 focus:border-white/20"
                />

                <button
                  type="button"
                  disabled={
                    !replyText.trim() ||
                    submitting
                  }
                  onClick={() =>
                    void submitComment(
                      comment.id,
                    )
                  }
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/50 transition hover:bg-white/20 disabled:opacity-30"
                  aria-label="Send reply"
                >
                  <Send className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Replies */}
        {comment.replies?.map(reply =>
          renderComment(
            reply,
            depth + 1,
          ),
        )}
      </div>
    );
  };
  const canSubmit = text.trim().length > 0 && !submitting && item.isReal !== false;

  return (
    <div
      ref={panelRef}
      className="pcp-panel"
      /* Feed cards are themselves clickable and treat Enter/Space as
         "open the post". Without this, clicking into the composer — or typing
         a single space — would navigate away mid-comment. */
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="region"
      aria-label="Comments"
    >
      <style>{`
        .pcp-panel {
          margin-top: 12px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(255,255,255,0.03);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          padding: 11px 11px 9px;
          animation: pcp-in 170ms ease-out;
        }
        @keyframes pcp-in {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) { .pcp-panel { animation: none; } }

        .pcp-compose { display: flex; align-items: flex-start; gap: 8px; }
        .pcp-avatar {
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px;
          flex-shrink: 0;
          overflow: hidden;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          font-size: 12px; font-weight: 700;
          color: rgba(255,255,255,0.55);
        }
        .pcp-field {
          flex: 1 1 auto;
          min-width: 0;
          min-height: 38px;
          display: flex;
          align-items: flex-end;
          gap: 6px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.035);
          padding: 6px 6px 6px 10px;
          transition: border-color 140ms ease;
        }
        .pcp-field:focus-within { border-color: rgba(255,255,255,0.22); }
        .pcp-input {
          flex: 1 1 auto;
          min-width: 0;
          /* Comfortable single-line target that grows with the comment. */
          min-height: 24px;
          max-height: 108px;
          resize: none;
          border: none;
          outline: none;
          background: transparent;
          font-size: 12.5px;
          line-height: 17px;
          color: rgba(255,255,255,0.92);
        }
        .pcp-input::placeholder { color: rgba(255,255,255,0.35); }
        .pcp-input:disabled { opacity: 0.5; }
        .pcp-tool {
          display: flex; align-items: center; justify-content: center;
          width: 26px; height: 26px;
          flex-shrink: 0;
          border-radius: 8px;
          color: rgba(255,255,255,0.38);
          transition: color 140ms ease, background-color 140ms ease;
        }
        .pcp-tool:hover:not(:disabled) { color: rgba(255,255,255,0.80); background: rgba(255,255,255,0.07); }
        .pcp-tool:disabled { opacity: 0.32; cursor: not-allowed; }
        .pcp-send {
          display: flex; align-items: center; justify-content: center;
          width: 26px; height: 26px;
          flex-shrink: 0;
          border-radius: 999px;
          background: rgba(255,255,255,0.10);
          color: rgba(255,255,255,0.70);
          transition: background-color 140ms ease;
        }
        .pcp-send:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
        .pcp-send:disabled { opacity: 0.3; cursor: not-allowed; }

        .pcp-emoji {
          display: flex; flex-wrap: wrap; gap: 2px;
          margin: 6px 0 0 40px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(255,255,255,0.035);
          padding: 5px;
        }
        .pcp-emoji button {
          width: 26px; height: 26px;
          border-radius: 7px;
          font-size: 14px;
          line-height: 1;
        }
        .pcp-emoji button:hover { background: rgba(255,255,255,0.09); }

        /* Typeahead list. */
        .pcp-mentions {
          margin: 6px 0 0 40px;
          max-height: 176px;
          overflow-y: auto;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(20,20,24,0.96);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          padding: 4px;
        }
        .pcp-mnote {
          padding: 6px 8px;
          margin: 6px 0 0 40px;
          font-size: 11px;
          color: rgba(255,255,255,0.38);
        }
        .pcp-mentions .pcp-mnote { margin: 0; }
        .pcp-mrow {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          border-radius: 8px;
          padding: 5px 6px;
          text-align: left;
        }
        .pcp-mrow-on { background: rgba(255,255,255,0.08); }
        .pcp-mavatar {
          display: flex; align-items: center; justify-content: center;
          width: 24px; height: 24px;
          flex-shrink: 0;
          overflow: hidden;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          font-size: 10px; font-weight: 700;
          color: rgba(255,255,255,0.55);
        }
        .pcp-mtext { min-width: 0; display: flex; flex-direction: column; }
        .pcp-mname {
          font-size: 12px; font-weight: 600;
          color: rgba(255,255,255,0.90);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .pcp-mhead {
          font-size: 10px;
          color: rgba(255,255,255,0.40);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        .pcp-error {
          margin: 6px 0 0 40px;
          font-size: 11px;
          color: rgba(248,113,113,0.92);
        }
        .pcp-list {
          margin-top: 10px;
          max-height: 220px;
          overflow-y: auto;
          overflow-x: hidden;
          padding-right: 2px;
        }
        .pcp-list::-webkit-scrollbar { display: none; }
        .pcp-empty { padding: 10px 0; text-align: center; font-size: 11px; color: rgba(255,255,255,0.25); }
        .pcp-all {
          display: inline-block;
          margin-top: 8px;
          font-size: 11px;
          font-weight: 600;
          color: rgba(255,255,255,0.38);
        }
        .pcp-all:hover { color: rgba(255,255,255,0.75); }

        .pcp-tool:focus-visible, .pcp-send:focus-visible, .pcp-all:focus-visible, .pcp-emoji button:focus-visible {
          outline: 2px solid rgba(255,255,255,0.55);
          outline-offset: 2px;
        }
      `}</style>

      {/* Composer first, the way the feed reads top to bottom. */}
      <div className="pcp-compose">
        <span className="pcp-avatar">
          {myAvatar
            /* eslint-disable-next-line @next/next/no-img-element */
            ? <img src={myAvatar} alt="Your profile photo" className="h-full w-full object-cover" data-no-invert />
            : (viewerInitial || '?')}
        </span>

        <div className="pcp-field">
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(event) => {
              const el = event.target;
              setText(el.value);
              if (error) setError(null);
              syncMentionToken(el);
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
            }}
            onKeyUp={(event) => {
              /* Arrow keys and clicks move the caret without changing the
                 value, so the token has to be re-read here too. */
              syncMentionToken(event.currentTarget);
            }}
            onBlur={() => { setTimeout(() => setMentionQuery(null), 120); }}
            onKeyDown={(event) => {
              const listOpen = mentionQuery !== null && mentionResults.length > 0;
              if (listOpen) {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setMentionIndex((i) => (i + 1) % mentionResults.length);
                  return;
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setMentionIndex((i) => (i - 1 + mentionResults.length) % mentionResults.length);
                  return;
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  event.preventDefault();
                  applyMention(mentionResults[mentionIndex]);
                  return;
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  dismissMentionList();
                  return;
                }
              }
              /* The list is open but its results have not landed yet. Enter
                 here means "pick the person I am typing", not "post" — so it
                 does nothing rather than posting a half-typed @token. */
              if (mentionQuery !== null && mentionLoading) {
                if (event.key === 'Enter' && !event.shiftKey) event.preventDefault();
                return;
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submitComment();
              }
            }}
            placeholder="Add a comment..."
            aria-label="Add a comment"
            disabled={submitting || item.isReal === false}
            className="pcp-input"
          />

          <button
            type="button"
            className="pcp-tool"
            aria-label="Add emoji"
            aria-expanded={emojiOpen}
            onClick={() => setEmojiOpen((v) => !v)}
            disabled={submitting || item.isReal === false}
          >
            <Smile className="h-3.5 w-3.5" />
          </button>

          {/* The comments API stores text only, so there is nothing to attach
              an image to. Disabled and announced as such rather than faked. */}
          <button
            type="button"
            className="pcp-tool"
            aria-label="Add image"
            title="Image comments are not supported yet"
            disabled
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            className="pcp-send"
            aria-label="Post comment"
            disabled={!canSubmit}
            onClick={() => void submitComment()}
          >
            {submitting
              ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
              : <Send className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {mentionQuery !== null && (mentionResults.length > 0 || mentionLoading) && (
        <ul className="pcp-mentions" role="listbox" aria-label="People to mention">
          {mentionResults.length === 0 && mentionLoading && (
            <li className="pcp-mnote">Searching…</li>
          )}
          {mentionResults.map((person, i) => (
            <li key={person.userId}>
              <button
                type="button"
                role="option"
                aria-selected={i === mentionIndex}
                className={i === mentionIndex ? 'pcp-mrow pcp-mrow-on' : 'pcp-mrow'}
                onMouseEnter={() => setMentionIndex(i)}
                /* mousedown, so the textarea blur does not close the list first */
                onMouseDown={(e) => { e.preventDefault(); applyMention(person); }}
              >
                <span className="pcp-mavatar">
                  {person.avatarUrl
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" data-no-invert />
                    : (person.name.charAt(0).toUpperCase() || '?')}
                </span>
                <span className="pcp-mtext">
                  <span className="pcp-mname">{person.name}</span>
                  {person.headline && <span className="pcp-mhead">{person.headline}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {mentionQuery !== null && !mentionLoading && mentionResults.length === 0 && (
        <p className="pcp-mentions pcp-mnote" role="status">No people found</p>
      )}

      {emojiOpen && (
        <div className="pcp-emoji">
          {QUICK_EMOJI.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={`Insert ${e}`}
              onClick={() => { setText((t) => t + e); inputRef.current?.focus(); }}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      {error && <p className="pcp-error" role="alert">{error}</p>}

      <div className="pcp-list scrollbar-none">
        {loading && <p className="pcp-empty">Loading…</p>}
        {!loading && comments.length === 0 && (
          <p className="pcp-empty">No comments yet. Be the first!</p>
        )}
        {!loading && comments.map((comment) => renderComment(comment))}
      </div>

      {viewAllHref && comments.length > 0 && (
        <Link href={viewAllHref} className="pcp-all" onClick={(e) => e.stopPropagation()}>
          View all comments
        </Link>
      )}
    </div>
  );
}
