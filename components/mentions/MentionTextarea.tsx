'use client';

/**
 * A textarea that understands @mentions.
 *
 * One component serves the post composer, every publication body field and the
 * comment boxes, so the trigger, the ranking, the keyboard handling and the
 * mobile behaviour are written once. It stays a plain controlled textarea from
 * the caller's side — same value/onChange contract, same classes — so the
 * existing composer styling and the existing 500-character body limit carry
 * over untouched; pass that limit as `maxChars` and it is applied here, to the
 * typed text and to inserted mentions alike.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { clampPublicationBody } from '@/lib/publication-body';
import {
  activeMentionQuery,
  applyMention,
  reconcileMentions,
  type MentionUser,
} from '@/lib/mentions';

type Props = {
  value: string;
  onValueChange: (next: string) => void;
  /** Everyone the author has picked so far; the parent owns this list. */
  mentions: MentionUser[];
  onMentionsChange: (next: MentionUser[]) => void;
  /** Character ceiling for the field, e.g. the publication body limit. */
  maxChars?: number;
  className?: string;
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  /** Caller shortcuts. Skipped while the picker owns the keyboard. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
};

type Suggestions = { connected: MentionUser[]; others: MentionUser[] };
const EMPTY: Suggestions = { connected: [], others: [] };

/** Long enough that a fast typist issues one request, short enough to feel live. */
const DEBOUNCE_MS = 180;

export default function MentionTextarea({
  value,
  onValueChange,
  mentions,
  onMentionsChange,
  maxChars,
  className,
  rows,
  placeholder,
  autoFocus,
  disabled,
  onKeyDown,
  textareaRef,
  ...rest
}: Props) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? ownRef;
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const [query, setQuery] = useState<{ query: string; start: number } | null>(null);
  const [items, setItems] = useState<Suggestions>(EMPTY);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [above, setAbove] = useState(false);

  /* The caret position to restore after an insertion re-renders the field. */
  const pendingCaret = useRef<number | null>(null);
  /* Rising request id — a slow response for an older query is discarded. */
  const requestId = useRef(0);
  /* The "@" offset the author dismissed with Escape, so the picker does not
     pop straight back on the next keystroke of the same word. */
  const dismissedAt = useRef<number | null>(null);

  const flat = useMemo(() => [...items.connected, ...items.others], [items]);
  const open = query !== null && (flat.length > 0 || loading);

  const close = useCallback(() => {
    setQuery(null);
    setItems(EMPTY);
    setActive(0);
    setLoading(false);
    requestId.current += 1;
  }, []);

  /** Recompute whether the caret sits inside an "@…" token. */
  const syncQuery = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = activeMentionQuery(el.value, el.selectionStart ?? 0);
    /* Leaving the dismissed word clears the dismissal, so the next "@" opens
       the picker again as normal. */
    if (!next || next.start !== dismissedAt.current) dismissedAt.current = null;
    if (next && next.start === dismissedAt.current) { setQuery(null); return; }
    setQuery((prev) => {
      if (!next) return null;
      if (prev && prev.start === next.start && prev.query === next.query) return prev;
      return next;
    });
    if (!next) { setItems(EMPTY); setActive(0); }
  }, [ref]);

  /* Fetch suggestions for the active token. Debounced, cancellable, and
     discarded if a newer keystroke has already been issued. */
  useEffect(() => {
    if (query === null) return;
    const id = (requestId.current += 1);
    const controller = new AbortController();
    setLoading(true);

    const timer = setTimeout(() => {
      fetch(`/api/users/mention-search?q=${encodeURIComponent(query.query)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Suggestions | null) => {
          if (id !== requestId.current) return;
          setItems(d ? { connected: d.connected ?? [], others: d.others ?? [] } : EMPTY);
          setActive(0);
          setLoading(false);
        })
        .catch(() => { if (id === requestId.current) { setLoading(false); } });
    }, DEBOUNCE_MS);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  /* Put the list above the field when the space below cannot hold it — on a
     phone that space is what the on-screen keyboard leaves, which is why the
     visual viewport is measured rather than the window. */
  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      setAbove(viewport - box.bottom < 200 && box.top > 200);
    };
    measure();
    window.visualViewport?.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.visualViewport?.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, ref]);

  /* Tapping or clicking anywhere else dismisses the list. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, close]);

  /* Restore the caret after an insertion, clamped to whatever survived the
     character limit so it can never land past the end of the text. */
  useEffect(() => {
    if (pendingCaret.current === null) return;
    const el = ref.current;
    if (!el) { pendingCaret.current = null; return; }
    const at = Math.min(pendingCaret.current, el.value.length);
    el.focus();
    el.setSelectionRange(at, at);
    pendingCaret.current = null;
  }, [value, ref]);

  const commit = useCallback((next: string) => {
    const bounded = maxChars ? clampPublicationBody(next, maxChars) : next;
    onValueChange(bounded);
    /* A mention whose visible "@Name" was just deleted stops being a mention. */
    const kept = reconcileMentions(bounded, mentions);
    if (kept.length !== mentions.length) onMentionsChange(kept);
  }, [maxChars, mentions, onMentionsChange, onValueChange]);

  const choose = useCallback((user: MentionUser) => {
    const el = ref.current;
    if (!el || !query) return;
    const { text, caret } = applyMention(el.value, query.start, el.selectionStart ?? el.value.length, user.name);
    const bounded = maxChars ? clampPublicationBody(text, maxChars) : text;
    pendingCaret.current = caret;
    /* The caret lands just past the name that was inserted, which is still
       inside that "@…" token — without this the picker would reopen on the
       mention it has only just completed. */
    dismissedAt.current = query.start;
    onValueChange(bounded);
    /* Only keep the reference if the whole "@Name" actually fits — otherwise
       the limit truncated it and there is no mention to record. */
    const next = reconcileMentions(bounded, [...mentions, user]);
    onMentionsChange(next);
    close();
  }, [close, maxChars, mentions, onMentionsChange, onValueChange, query, ref]);

  /**
   * Escape belongs to the picker while it is open.
   *
   * The surrounding dialogs listen for Escape on `document`, which React's
   * `stopPropagation` cannot reach — without stopping the native event too,
   * dismissing the picker also tried to close the composer and took the focus
   * with it. Stopped here only while the picker is open, so Escape still
   * closes the dialog the rest of the time.
   */
  const dismiss = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    dismissedAt.current = query?.start ?? null;
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && flat.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % flat.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + flat.length) % flat.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(flat[active]); return; }
      if (e.key === 'Escape') { dismiss(e); return; }
    }
    if (open && e.key === 'Escape') { dismiss(e); return; }
    onKeyDown?.(e);
  };

  const group = (label: string, list: MentionUser[], offset: number) => (
    list.length === 0 ? null : (
      <div key={label}>
        <p className="px-3 pb-1 pt-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/25">{label}</p>
        {list.map((u, i) => {
          const index = offset + i;
          const selected = index === active;
          return (
            <button
              key={u.id}
              type="button"
              role="option"
              aria-selected={selected}
              /* Pointer-down, not click: the textarea keeps focus and a tap
                 registers before the outside-press handler can dismiss us. */
              onPointerDown={(e) => { e.preventDefault(); choose(u); }}
              onMouseEnter={() => setActive(index)}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition ${
                selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.05]'
              }`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.08] text-[10px] font-bold text-white/70">
                {u.avatarUrl
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  : u.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold text-white/85">{u.name}</span>
                {u.headline && <span className="block truncate text-[10.5px] text-white/35">{u.headline}</span>}
              </span>
            </button>
          );
        })}
      </div>
    )
  );

  return (
    <div ref={wrapRef} className="relative">
      <textarea
        {...rest}
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        className={className}
        onChange={(e) => { commit(e.target.value); queueMicrotask(syncQuery); }}
        onKeyUp={syncQuery}
        onClick={syncQuery}
        onSelect={syncQuery}
        onBlur={() => { /* selection runs on pointer-down, so blur can close */ setTimeout(close, 120); }}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
      />

      {open && (
        <div
          id={listId}
          role="listbox"
          /* Pinned to the field's own width, so it can never overflow the
             composer or push the page sideways on a phone. */
          className={`absolute left-0 right-0 z-[600] max-h-[248px] overflow-y-auto overscroll-contain rounded-xl border border-white/[0.10] bg-[#0B0B0F]/98 shadow-[0_18px_48px_rgba(0,0,0,0.7)] backdrop-blur-xl ${
            above ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          }`}
        >
          {flat.length === 0 && loading && (
            <p className="px-3 py-2.5 text-[11.5px] text-white/30">Searching…</p>
          )}
          {group('Suggested', items.connected, 0)}
          {group('People on Docrud', items.others, items.connected.length)}
        </div>
      )}
    </div>
  );
}
