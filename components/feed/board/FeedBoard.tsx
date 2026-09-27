'use client';

/**
 * The feed.
 *
 * ═══ THE SHAPE ═══
 *
 * The jobs board's language, in this context: the shared app shell, one sticky
 * row carrying the count, the category buckets and the filter control, a
 * responsive grid of cards, and a right rail led by the one thing this page
 * asks of a visitor.
 *
 * ═══ WHAT THE API CAN AND CANNOT DO ═══
 *
 * `/api/public/published` takes `limit` and `page` and nothing else — no
 * category, no query, no sort. So filtering happens over what has been loaded,
 * and the page says so rather than implying it searched the whole archive: the
 * heading counts the filtered set, and the footer states how much of the total
 * is loaded and offers to load more.
 *
 * ═══ NOTHING IS INVENTED ═══
 *
 * Every field on a card is one the endpoint returned. Reaction, comment and
 * trend counts render only when present and non-zero; a thumbnail renders only
 * when the item has one; the category chips and their counts are derived from
 * the loaded items, so a category nobody has published does not appear.
 *
 * Interaction — reacting, commenting, voting in a poll, bidding — belongs to
 * the item's own page at /published/[id], which already implements it. This is
 * a browse surface, and a card links there.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  SlidersHorizontal, X, Search, Clock, MessageSquare, Heart, TrendingUp,
  ArrowUpRight, LayoutGrid, FileText, Newspaper, BookOpen, Megaphone, Package,
  CalendarDays, User, Layers, Image as ImageIcon, ListChecks, Video, Award,
  PenLine, Sparkles, ChevronLeft, ChevronRight,
} from 'lucide-react';
import DiscoverShell from '@/components/home/discover/DiscoverShell';
import { FilterSheet, Group, CheckRow } from '@/components/ui/board/FilterSheet';
import './feed-board.css';

/* Only the fields this surface reads. The endpoint returns more; a card that
   renders a field it has not been given is how invented content appears. */
export interface FeedItem {
  id: string;
  category: string;
  badge?: string;
  title: string;
  byline?: string;
  body?: string;
  chips?: string[];
  postedAt?: string;
  featured?: boolean;
  thumbnailUrl?: string;
  avatarUrl?: string;
  uploadedByName?: string;
  likesCount?: number;
  commentsCount?: number;
  trendCount?: number;
  cta?: { label: string; url: string };
}

const PAGE = 60;
type SortMode = 'recent' | 'discussed' | 'liked';

/* The icon for a category, when it is one we have a word for. Anything else
   gets the generic mark rather than being hidden — a new category should
   appear, not vanish. */
const CAT_ICON: Record<string, typeof FileText> = {
  news: Newspaper, article: BookOpen, document: FileText, portfolio: Layers,
  announcement: Megaphone, product: Package, event: CalendarDays, resume: User,
  post: ImageIcon, poll: ListChecks, video: Video, milestone: Award,
  tutorial: BookOpen, thread: MessageSquare, survey: ListChecks, chart: TrendingUp,
};

const CAT_LABEL: Record<string, string> = {
  news: 'News', article: 'Articles', document: 'Documents', portfolio: 'Portfolio',
  announcement: 'Announcements', product: 'Products', event: 'Events', resume: 'Resumes',
  post: 'Posts', poll: 'Polls', video: 'Videos', milestone: 'Milestones',
  tutorial: 'Tutorials', thread: 'Threads', survey: 'Surveys', chart: 'Charts',
  hackathon: 'Hackathons', job: 'Job posts',
};

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const catLabel = (c: string) => CAT_LABEL[c] ?? titleCase(c);

/* Stable per-category hue, so the same category is the same colour on every
   card without a colour being stored anywhere. */
function hueOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function whenFrom(iso?: string) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.round(days / 30);
  return mo < 12 ? `${mo}mo ago` : `${Math.round(mo / 12)}y ago`;
}

/* ── A card ─────────────────────────────────────────────────────────────── */
function FeedCard({ item }: { item: FeedItem }) {
  const [imgFailed, setImgFailed] = useState(false);
  const hue = hueOf(item.category || 'post');
  const Icon = CAT_ICON[item.category] ?? FileText;
  const author = (item.uploadedByName || item.byline || '').trim();
  const chips = (item.chips ?? []).filter(Boolean).slice(0, 2);
  const when = whenFrom(item.postedAt);
  const showThumb = !!item.thumbnailUrl && !imgFailed;

  /* The jobs card's structure, which is what makes a grid of heterogeneous
     items work: the artwork is a small square beside the title rather than a
     full-bleed cover, because a 148px cover on the third of items that have one
     dragged every card in its row to that height — measured at 224px of dead
     space inside a 360px card. A square that is either the thumbnail or the
     category's own mark keeps every card the same shape. */
  return (
    <Link href={`/published/${item.id}`} className="fd-card">
      <span className="fd-head">
        <span
          className="fd-mark"
          style={showThumb ? undefined : {
            background: `hsl(${hue} 62% 96%)`,
            borderColor: `hsl(${hue} 44% 87%)`,
            color: `hsl(${hue} 42% 36%)`,
          }}
        >
          {showThumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.thumbnailUrl} alt="" loading="lazy" decoding="async"
              onError={() => setImgFailed(true)}
            />
          ) : <Icon size={17} strokeWidth={1.9} />}
        </span>

        <span className="fd-id">
          <h3 className="fd-t">{item.title}</h3>
          {author && <span className="fd-by">{author}</span>}
        </span>

        {item.featured && <span className="fd-feat" title="Featured"><Sparkles size={11} /></span>}
      </span>

      <span className="fd-tags">
        <span
          className="fd-cat"
          style={{
            background: `hsl(${hue} 64% 96%)`,
            borderColor: `hsl(${hue} 44% 87%)`,
            color: `hsl(${hue} 44% 32%)`,
          }}
        >
          {catLabel(item.category)}
        </span>
        {chips.map((c) => <span key={c} className="fd-chip">{c}</span>)}
      </span>

      {item.body && <p className="fd-b">{item.body}</p>}

      <span className="fd-foot">
        {when && <span className="fd-m"><Clock size={11} />{when}</span>}
        {/* Only when there is something to report. A row of zeroes says the
            post failed rather than that it is new. */}
        {!!item.likesCount && <span className="fd-m"><Heart size={11} />{item.likesCount}</span>}
        {!!item.commentsCount && <span className="fd-m"><MessageSquare size={11} />{item.commentsCount}</span>}
        {!!item.trendCount && <span className="fd-m"><TrendingUp size={11} />{item.trendCount}</span>}
        <ArrowUpRight size={14} className="fd-go" aria-hidden />
      </span>
    </Link>
  );
}

/* ── The page ───────────────────────────────────────────────────────────── */
export interface FeedBoardProps {
  softwareName: string;
  guestMode?: boolean;
  viewer: { name: string | null; email: string | null } | null;
}

export default function FeedBoard({ softwareName, guestMode = false, viewer }: FeedBoardProps) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [cat, setCat] = useState('');
  const [sort, setSort] = useState<SortMode>('recent');
  const [q, setQ] = useState('');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const kwRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback((p: number, append: boolean) => {
    if (append) setMore(true); else setState('loading');
    fetch(`/api/public/published?limit=${PAGE}&page=${p}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('feed-failed'))))
      .then((d) => {
        const batch: FeedItem[] = Array.isArray(d?.items) ? d.items : [];
        setItems((prev) => {
          if (!append) return batch;
          /* The endpoint pages a live collection, so the same item can arrive
             twice if something is published between requests. */
          const seen = new Set(prev.map((i) => i.id));
          return [...prev, ...batch.filter((i) => !seen.has(i.id))];
        });
        setTotal(Number(d?.total) || 0);
        setHasMore(Boolean(d?.hasMore));
        setPage(p);
        setState('ready');
        setMore(false);
      })
      .catch(() => { setState('error'); setMore(false); });
  }, []);

  useEffect(() => { load(1, false); }, [load]);

  /* Counted from what is loaded, so a category with nothing in it is not
     offered — and the number on the chip is the number the chip will show. */
  const cats = useMemo(() => {
    const by = new Map<string, number>();
    for (const it of items) {
      const c = (it.category || '').trim();
      if (c) by.set(c, (by.get(c) ?? 0) + 1);
    }
    return Array.from(by.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = items.filter((it) => {
      if (cat && it.category !== cat) return false;
      if (featuredOnly && !it.featured) return false;
      if (needle) {
        const hay = `${it.title} ${it.byline ?? ''} ${it.uploadedByName ?? ''} ${(it.chips ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const n = (v?: number) => (typeof v === 'number' ? v : 0);
    if (sort === 'discussed') out = out.slice().sort((a, b) => n(b.commentsCount) - n(a.commentsCount));
    else if (sort === 'liked') out = out.slice().sort((a, b) => n(b.likesCount) - n(a.likesCount));
    else out = out.slice().sort((a, b) => (Date.parse(b.postedAt || '') || 0) - (Date.parse(a.postedAt || '') || 0));
    return out;
  }, [items, cat, q, sort, featuredOnly]);

  const activeCount =
    (cat ? 1 : 0) + (q.trim() ? 1 : 0) + (sort !== 'recent' ? 1 : 0) + (featuredOnly ? 1 : 0);

  const pills = useMemo(() => {
    const out: Array<{ key: string; label: string; clear: () => void }> = [];
    if (cat) out.push({ key: 'cat', label: catLabel(cat), clear: () => setCat('') });
    if (featuredOnly) out.push({ key: 'feat', label: 'Featured', clear: () => setFeaturedOnly(false) });
    if (sort !== 'recent') {
      out.push({
        key: 'sort',
        label: sort === 'discussed' ? 'Most discussed' : 'Most liked',
        clear: () => setSort('recent'),
      });
    }
    if (q.trim()) out.push({ key: 'q', label: `“${q.trim()}”`, clear: () => setQ('') });
    return out;
  }, [cat, q, sort, featuredOnly]);

  const clearAll = () => { setCat(''); setQ(''); setSort('recent'); setFeaturedOnly(false); };

  const contributors = useMemo(() => {
    const by = new Map<string, number>();
    for (const it of items) {
      const n = (it.uploadedByName || it.byline || '').trim();
      if (n) by.set(n, (by.get(n) ?? 0) + 1);
    }
    return Array.from(by.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [items]);

  const loading = state === 'loading';

  return (
    <DiscoverShell softwareName={softwareName} guestMode={guestMode} viewer={viewer} bare>
      <div className="fd" ref={scrollRef}>
        {guestMode && (
          <div className="fd-pad" style={{ paddingTop: 18 }}>
            <div className="dh-guest" style={{ marginInline: 0 }}>
              <Sparkles size={15} />
              <span>
                You are browsing in incognito mode. <Link href="/login">Sign in</Link> to react, comment and publish.
              </span>
            </div>
          </div>
        )}

        {/* ══ One row ══ */}
        <div className="fd-bar">
          <h1 className="fd-title">
            {loading ? <span>Feed</span> : (
              <>
                <b>{(activeCount ? filtered.length : total || items.length).toLocaleString()}</b>
                <span>{(activeCount ? filtered.length : total || items.length) === 1 ? 'post' : 'posts'}</span>
              </>
            )}
          </h1>

          <div className="fd-cats" role="tablist" aria-label="Filter by category">
            <button
              type="button" className="fd-cat-b" data-on={cat === '' ? '1' : '0'}
              role="tab" aria-selected={cat === ''} onClick={() => setCat('')}
            >
              <LayoutGrid size={14} strokeWidth={1.9} />
              <span className="fd-cat-l">Everything</span>
              {!loading && <span className="fd-cat-n">{items.length.toLocaleString()}</span>}
            </button>
            {cats.map(([c, n]) => {
              const Icon = CAT_ICON[c] ?? FileText;
              const on = cat === c;
              return (
                <button
                  key={c} type="button" className="fd-cat-b" data-on={on ? '1' : '0'}
                  role="tab" aria-selected={on} onClick={() => setCat(on ? '' : c)}
                >
                  <Icon size={14} strokeWidth={1.9} />
                  <span className="fd-cat-l">{catLabel(c)}</span>
                  <span className="fd-cat-n">{n.toLocaleString()}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button" className="fd-fbtn" data-on={activeCount ? '1' : '0'}
            onClick={() => setSheet(true)} aria-haspopup="dialog" aria-expanded={sheet}
          >
            <SlidersHorizontal size={14} />
            <span className="fd-fbtn-l">Filters</span>
            {activeCount > 0 && <span className="fd-fbtn-n">{activeCount}</span>}
          </button>
        </div>

        <div className="fd-body">
          <div className="fd-main">
            {pills.length > 0 && (
              <div className="fd-active">
                {pills.map((p) => (
                  <button key={p.key} type="button" className="fd-pill" onClick={p.clear}>
                    {p.label}<X size={12} />
                  </button>
                ))}
                <button type="button" className="fd-clear" onClick={clearAll}>Clear all</button>
              </div>
            )}

            {loading ? (
              <div className="fd-grid">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="fd-skel" />)}
              </div>
            ) : state === 'error' ? (
              <div className="fd-empty">
                <div className="fd-empty-t">The feed could not be loaded</div>
                <div className="fd-empty-s">The request failed. Reload the page to try again.</div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="fd-empty">
                <div className="fd-empty-t">
                  {items.length === 0 ? 'Nothing published yet' : 'Nothing matches those filters'}
                </div>
                <div className="fd-empty-s">
                  {items.length === 0
                    ? 'When people publish documents, articles, posts and announcements, they appear here.'
                    : 'Clear a filter, or load more of the archive to widen the search.'}
                </div>
                {items.length === 0 && (
                  <Link href="/publish" className="fd-empty-cta">
                    <PenLine size={14} /> Publish the first one
                  </Link>
                )}
              </div>
            ) : (
              <>
                <div className="fd-grid">
                  {filtered.map((it) => <FeedCard key={it.id} item={it} />)}
                </div>

                {/* Honest about scope: filters run over what is loaded, and the
                    endpoint cannot filter server-side. */}
                <div className="fd-more">
                  <span className="fd-more-n">
                    Showing {filtered.length.toLocaleString()} of {items.length.toLocaleString()} loaded
                    {total > items.length && ` · ${total.toLocaleString()} published in all`}
                  </span>
                  {hasMore && (
                    <button
                      type="button" className="fd-more-b" disabled={more}
                      onClick={() => load(page + 1, true)}
                    >
                      {more ? 'Loading…' : 'Load more'}
                      {!more && <ChevronRight size={14} />}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <aside className="fd-rail" aria-label="More on Docrud">
            <div className="fd-panel fd-panel-cta">
              <h2 className="fd-panel-t">Publishing on Docrud?</h2>
              <p className="fd-panel-s">Share work and reach the directory</p>
              <Link href="/publish" className="fd-cta">
                <span className="fd-cta-mark" aria-hidden><PenLine size={16} /></span>
                <span className="fd-cta-b">
                  <span className="fd-cta-t">Publish something</span>
                  <span className="fd-cta-s">Documents, posts, announcements</span>
                </span>
                <ArrowUpRight size={15} className="fd-cta-a" aria-hidden />
              </Link>
              <Link href="/profile" className="fd-row fd-row-quiet">
                <span className="fd-row-mark" aria-hidden><User size={16} /></span>
                <span className="fd-row-b">
                  <span className="fd-row-t">Your published work</span>
                  <span className="fd-row-s">Everything under your name</span>
                </span>
              </Link>
            </div>

            {cats.length > 0 && (
              <div className="fd-panel">
                <h2 className="fd-panel-t">What people publish</h2>
                <p className="fd-panel-s">Counted from the posts loaded here</p>
                {cats.slice(0, 7).map(([c, n]) => (
                  <button
                    key={c} type="button" className="fd-src" onClick={() => setCat(cat === c ? '' : c)}
                    data-on={cat === c ? '1' : '0'}
                  >
                    <span className="fd-src-mark" aria-hidden>
                      {(() => { const I = CAT_ICON[c] ?? FileText; return <I size={14} />; })()}
                    </span>
                    <span className="fd-row-b">
                      <span className="fd-row-t">{catLabel(c)}</span>
                      <span className="fd-row-s">{n.toLocaleString()} post{n === 1 ? '' : 's'}</span>
                    </span>
                    <span
                      className="fd-src-bar" aria-hidden
                      style={{ ['--w' as string]: `${Math.max(3, Math.round((n / items.length) * 100))}%` }}
                    />
                  </button>
                ))}
              </div>
            )}

            {contributors.length > 0 && (
              <div className="fd-panel">
                <h2 className="fd-panel-t">Who is publishing</h2>
                <p className="fd-panel-s">Most posts among those loaded</p>
                {contributors.map(([name, n]) => (
                  <div key={name} className="fd-row">
                    <span className="fd-row-mark" aria-hidden>{name.charAt(0).toUpperCase()}</span>
                    <span className="fd-row-b">
                      <span className="fd-row-t">{name}</span>
                      <span className="fd-row-s">{n.toLocaleString()} post{n === 1 ? '' : 's'}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>

      <FilterSheet
        open={sheet}
        onClose={() => setSheet(false)}
        count={activeCount}
        footer={(
          <>
            <button type="button" className="bd-sheet-clear" onClick={clearAll} disabled={activeCount === 0}>
              Clear all
            </button>
            <button type="button" className="bd-sheet-go" onClick={() => setSheet(false)}>
              Show {filtered.length.toLocaleString()} post{filtered.length === 1 ? '' : 's'}
            </button>
          </>
        )}
      >
        <Group label="Keyword">
          <div className="fd-kw">
            <Search size={14} aria-hidden />
            <input
              ref={kwRef} value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Title, author or tag"
              aria-label="Filter these posts by keyword"
            />
            {q && (
              <button type="button" onClick={() => setQ('')} aria-label="Clear keyword"><X size={13} /></button>
            )}
          </div>
        </Group>

        <Group label="Sort by">
          <CheckRow on={sort === 'recent'} label="Most recent" onClick={() => setSort('recent')} />
          <CheckRow on={sort === 'discussed'} label="Most discussed" onClick={() => setSort('discussed')} />
          <CheckRow on={sort === 'liked'} label="Most liked" onClick={() => setSort('liked')} />
        </Group>

        <Group label="Show">
          <CheckRow
            on={featuredOnly} label="Featured only"
            n={items.filter((i) => i.featured).length}
            onClick={() => setFeaturedOnly((v) => !v)}
          />
        </Group>

        <Group label="Category">
          <CheckRow on={cat === ''} label="Everything" n={items.length} onClick={() => setCat('')} />
          {cats.map(([c, n]) => (
            <CheckRow key={c} on={cat === c} label={catLabel(c)} n={n} onClick={() => setCat(cat === c ? '' : c)} />
          ))}
        </Group>
      </FilterSheet>
    </DiscoverShell>
  );
}
