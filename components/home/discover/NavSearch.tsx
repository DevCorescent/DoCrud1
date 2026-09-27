'use client';

/**
 * The navbar's search.
 *
 * ═══ WHAT IT SEARCHES ═══
 *
 * `/api/search?mode=intelligent`. The endpoint's default lexical mode only
 * covers static feature pages — it returns nothing at all for "developer",
 * "databricks" or "india", which on a hiring marketplace are the queries
 * people actually type. Intelligent mode searches the real entities and comes
 * back grouped, with a per-item `matchPercent` and a `why`.
 *
 * `ai=1` is deliberately NOT sent. The route's own note says the optional Groq
 * expansion must never run on a keystroke, and this fires while typing.
 *
 * ═══ THE DROPDOWN IS A PORTAL ═══
 *
 * `.dh-bar-in` declares `backdrop-filter`. A blurred panel nested inside a
 * filtered ancestor does not render as softer glass — it renders as grey
 * rectangles over content that never gets painted. So the dropdown mounts on
 * `document.body` and is positioned from the field's own rect. That also keeps
 * it out of the bar's stacking context, where the app's bottom navigation
 * (z-index 9995) would otherwise paint over it on a phone.
 *
 * Being outside `.dh` means the `--dh-*` tokens do not reach it, so its root
 * re-declares the ones it uses — see the note in discover.css.
 *
 * ═══ NOTHING IS INVENTED ═══
 *
 * Every row renders fields the endpoint returned and links to the `url` it
 * gave. No result is synthesised, no count is estimated, and a query with no
 * matches says so rather than showing something adjacent.
 */

import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Search, X, Loader2, CornerDownLeft, ArrowUpRight } from 'lucide-react';

/* Only what this component reads. */
interface Hit {
  id: string;
  type: string;
  title: string;
  subtitle?: string | null;
  location?: string | null;
  url?: string | null;
  badge?: string | null;
  matchPercent?: number | null;
  why?: string | null;
  image?: string | null;
}

interface Payload {
  results?: Hit[];
  groups?: Record<string, Hit[]>;
  total?: number;
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 240;
const PER_GROUP = 4;

/* The endpoint's type keys, as words. An unknown key falls back to itself
   rather than being dropped — a new entity type should appear, not vanish. */
const GROUP_LABEL: Record<string, string> = {
  job: 'Roles',
  person: 'People',
  business: 'Companies',
  service: 'Services',
  gig: 'Gigs',
  post: 'Posts',
  article: 'Articles',
  file: 'Files',
  feature: 'On Docrud',
  product: 'Products',
  event: 'Events',
};

/* Roles first, because that is what this product is mostly asked about. */
const GROUP_ORDER = ['job', 'person', 'business', 'service', 'feature', 'article', 'post', 'file'];

/* The field is a flexible track in the bar, so on a phone it is a few hundred
   pixels narrower than on a laptop and the full wording does not fit. CSS
   cannot shorten placeholder text, so this does. Starts false and corrects
   after mount, so server and first client render agree. */
function useNarrow(query = '(max-width: 760px)') {
  const [is, setIs] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setIs(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [query]);
  return is;
}

export default function NavSearch({ placeholder }: { placeholder?: string }) {
  const narrow = useNarrow();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [data, setData] = useState<Payload | null>(null);
  const [cursor, setCursor] = useState(-1);
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  const wrap = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);
  const abort = useRef<AbortController | null>(null);
  const listId = useId();

  useEffect(() => setMounted(true), []);

  /* ── Flattened, in the order they are drawn ──
     The keyboard walks this list, so it has to be the same sequence the eye
     sees — including the trailing "see all" row, which is why that is a real
     entry here rather than something appended in the markup. */
  const rows = useMemo(() => {
    if (!data) return [] as Array<{ kind: 'hit'; hit: Hit } | { kind: 'all'; href: string; label: string }>;
    const groups = data.groups ?? {};
    const keys = [
      ...GROUP_ORDER.filter((k) => (groups[k] ?? []).length),
      ...Object.keys(groups).filter((k) => !GROUP_ORDER.includes(k) && (groups[k] ?? []).length),
    ];
    const out: Array<{ kind: 'hit'; hit: Hit } | { kind: 'all'; href: string; label: string }> = [];
    for (const k of keys) {
      for (const hit of (groups[k] ?? []).slice(0, PER_GROUP)) {
        if (hit.url) out.push({ kind: 'hit', hit });
      }
    }
    /* One destination that exists. There is no /search page in this app, so
       "see everything" means the Jobs board with the query applied — offered
       only when the roles group is what the query actually matched. */
    const jobs = (groups.job ?? []).length;
    const total = data.total ?? 0;
    if (jobs > PER_GROUP && total > 0) {
      out.push({
        kind: 'all',
        href: `/jobs?q=${encodeURIComponent(q.trim())}`,
        label: `See all ${total.toLocaleString()} matching roles`,
      });
    }
    return out;
  }, [data, q]);

  const grouped = useMemo(() => {
    const groups = data?.groups ?? {};
    const keys = [
      ...GROUP_ORDER.filter((k) => (groups[k] ?? []).length),
      ...Object.keys(groups).filter((k) => !GROUP_ORDER.includes(k) && (groups[k] ?? []).length),
    ];
    let i = 0;
    return keys.map((k) => ({
      key: k,
      label: GROUP_LABEL[k] ?? k,
      items: (groups[k] ?? []).slice(0, PER_GROUP).filter((h) => h.url).map((hit) => ({ hit, index: i++ })),
    })).filter((g) => g.items.length);
  }, [data]);

  const measure = useCallback(() => {
    const el = input.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    /* Never wider than the window, and never off either edge: on a phone the
       field is nearly full width and an unclamped panel would hang off it. */
    const width = Math.min(Math.max(r.width, 300), window.innerWidth - 16);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setBox({ left, top: r.bottom + 8, width });
  }, []);

  /* ── Fetch, debounced, with the previous request cancelled ── */
  useEffect(() => {
    const query = q.trim();
    if (query.length < MIN_CHARS) {
      abort.current?.abort();
      setData(null);
      setState('idle');
      return;
    }
    const t = setTimeout(() => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setState('loading');
      fetch(`/api/search?q=${encodeURIComponent(query)}&mode=intelligent&limit=24`, {
        signal: ac.signal, cache: 'no-store',
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('search-failed'))))
        .then((d: Payload) => { setData(d); setState('ready'); setCursor(-1); })
        .catch((e) => { if (e?.name !== 'AbortError') { setState('error'); setData(null); } });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => { if (open) measure(); }, [open, measure, state]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrap.current?.contains(t)) return;
      if ((t as HTMLElement)?.closest?.('.dh-sr')) return;
      setOpen(false);
    };
    const onResize = () => measure();
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onResize);
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('resize', onResize); };
  }, [open, measure]);

  /* ⌘K / Ctrl-K focuses the field from anywhere. */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const go = useCallback((href: string) => {
    setOpen(false);
    setCursor(-1);
    input.current?.blur();
    router.push(href);
  }, [router]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setOpen(false); setCursor(-1); return; }
    if (!open || !rows.length) {
      if (e.key === 'ArrowDown' && rows.length) { setOpen(true); setCursor(0); e.preventDefault(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % rows.length); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c <= 0 ? rows.length - 1 : c - 1)); return; }
    if (e.key === 'Enter') {
      const row = rows[cursor] ?? rows[0];
      if (!row) return;
      e.preventDefault();
      go(row.kind === 'hit' ? (row.hit.url as string) : row.href);
    }
  };

  const showPanel = open && q.trim().length >= MIN_CHARS;
  const allRow = rows.find((r) => r.kind === 'all') as { kind: 'all'; href: string; label: string } | undefined;
  const allIndex = allRow ? rows.indexOf(allRow) : -1;

  return (
    <div className="dh-search" ref={wrap}>
      <Search size={15} className="dh-search-i" aria-hidden />
      <input
        ref={input}
        type="search"
        className="dh-search-in"
        value={q}
        placeholder={narrow ? 'Search…' : (placeholder ?? 'Search roles, people, companies…')}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => { if (q.trim().length >= MIN_CHARS) setOpen(true); measure(); }}
        onKeyDown={onKey}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={cursor >= 0 ? `${listId}-${cursor}` : undefined}
        aria-label="Search Docrud"
        autoComplete="off"
        spellCheck={false}
      />
      {state === 'loading' && <Loader2 size={14} className="dh-search-sp" aria-hidden />}
      {q && state !== 'loading' && (
        <button
          type="button" className="dh-search-x" aria-label="Clear search"
          onClick={() => { setQ(''); setData(null); setOpen(false); input.current?.focus(); }}
        >
          <X size={13} />
        </button>
      )}
      {!q && <kbd className="dh-search-k" aria-hidden>⌘K</kbd>}

      {mounted && showPanel && box && createPortal(
        <div
          className="dh-sr"
          style={{ left: box.left, top: box.top, width: box.width }}
          id={listId}
          role="listbox"
          aria-label="Search results"
        >
          {state === 'loading' && !grouped.length && (
            <div className="dh-sr-note"><Loader2 size={14} className="dh-search-sp" aria-hidden /> Searching…</div>
          )}

          {state === 'error' && (
            <div className="dh-sr-note">Search could not run. Try again.</div>
          )}

          {state === 'ready' && !grouped.length && (
            <div className="dh-sr-note">
              No matches for &ldquo;{q.trim()}&rdquo;
            </div>
          )}

          {grouped.map((g) => (
            <div className="dh-sr-g" key={g.key}>
              <div className="dh-sr-gl">{g.label}</div>
              {g.items.map(({ hit, index }) => (
                <a
                  key={hit.id}
                  id={`${listId}-${index}`}
                  href={hit.url as string}
                  className="dh-sr-r"
                  role="option"
                  aria-selected={cursor === index}
                  data-on={cursor === index ? '1' : '0'}
                  onMouseEnter={() => setCursor(index)}
                  onClick={(e) => { e.preventDefault(); go(hit.url as string); }}
                >
                  <span className="dh-sr-m" aria-hidden>
                    {(hit.title || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="dh-sr-b">
                    <span className="dh-sr-t">{hit.title}</span>
                    <span className="dh-sr-s">
                      {hit.subtitle || ''}
                      {hit.subtitle && hit.location ? ' · ' : ''}
                      {hit.location || ''}
                    </span>
                  </span>
                  {typeof hit.matchPercent === 'number' && (
                    <span className="dh-sr-p">{hit.matchPercent}%</span>
                  )}
                  <ArrowUpRight size={13} className="dh-sr-a" aria-hidden />
                </a>
              ))}
            </div>
          ))}

          {allRow && (
            <a
              id={`${listId}-${allIndex}`}
              href={allRow.href}
              className="dh-sr-all"
              role="option"
              aria-selected={cursor === allIndex}
              data-on={cursor === allIndex ? '1' : '0'}
              onMouseEnter={() => setCursor(allIndex)}
              onClick={(e) => { e.preventDefault(); go(allRow.href); }}
            >
              {allRow.label}
              <CornerDownLeft size={13} aria-hidden />
            </a>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
