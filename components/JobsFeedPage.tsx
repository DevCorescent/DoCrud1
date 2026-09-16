'use client';

/**
 * Jobs directory — drawn in the SAME page shell as app/people/page.tsx so Jobs
 * and People read as one marketplace: the 56px header (back · title + count ·
 * search · right-side stats · primary action), the quick-filter chip strip
 * beneath it, the 248/264px left FilterPanel rail with its divider, and the
 * responsive 1/2/3/4-column results grid with People's pagination.
 *
 * The frame is rigid: the page itself is a fixed 100dvh app shell that never
 * scrolls in either direction, so the header, chip strip and filter rail stay
 * put. The results <main> is the only vertical scroll region (the rail scrolls
 * independently when its own filters overflow), which is also why pagination
 * scrolls that pane rather than the window.
 *
 * The cards themselves are untouched: JobSummaryCard renders exactly as before,
 * with its Match %, why-it-matches reasons, source attribution and direct Apply
 * to the original ATS. Every Jobs feature is preserved — profile-matched
 * "Recommended for You", India-first location filtering, employment / experience
 * / work-mode filters, search and sort. Same two endpoints; no API, model or
 * pipeline change. Only real data renders; nothing is invented.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Briefcase, Building2, Globe, LayoutGrid, MapPin, Plus, Search,
  SlidersHorizontal, Sparkles, TrendingUp, X, Zap,
} from 'lucide-react';
import { EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS } from '@/lib/jobs-ui';
import { matchesIndiaFilter, type IndiaBucket } from '@/lib/server/job-scraper/india';
import { JobSummaryCard, type JobSummary } from '@/components/jobs/JobSummaryCard';
import {
  DEFAULT_JOBS_FEED_FILTERS, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, JOBS_FEED_PAGE_SIZE, SEARCH_DEBOUNCE_MS, WORK_MODES,
  createDebouncer, createJobsFeedController, filtersFromParams, filtersToParams, sameFilters,
  type JobsFeedController, type JobsFeedFilters, type JobsFeedPageResult, type JobsFeedState, type SortMode,
} from '@/lib/jobs-feed';

/* ═══ P2D — THE SERVER OWNS THE LIST ═══

   This page used to download every published posting from
   /api/public/hiring/jobs?view=list (~6 MB, 12,659 rows) and filter, search,
   sort, count and paginate it in four useMemos. Now every one of those is a
   request to /api/jobs/public with the SAME semantics — P2B reproduced the
   predicate below server-side and proved it on the real corpus (32/32
   ordered-id parity) — and the browser holds only the cards it shows.

   The URL is the single source of truth for the filters (refresh, share and
   Back/Forward all restore the list); lib/jobs-feed.ts owns the request
   lifecycle (abort, de-duplicate, debounce, never-zero-on-error). The
   recommended-only view is UNCHANGED: it is the viewer's matched set from
   /api/recommendations/jobs, filtered here exactly as before. */

/* ─── constants ──────────────────────────────────────────────────────── */
const PAGE_SIZE = JOBS_FEED_PAGE_SIZE;
const POST_HREF = '/jobs/post';
const MY_JOBS_HREF = '/jobs/my';

/* Quick-filter categories — India-first location focus, the product's core
   requirement and the Jobs analogue of People's quick chips. */
const LOCATION_NAV: Array<{ id: IndiaBucket; label: string; icon: typeof MapPin }> = [
  { id: '', label: 'All Jobs', icon: LayoutGrid },
  { id: 'india', label: 'India', icon: MapPin },
  { id: 'bengaluru', label: 'Bengaluru', icon: Building2 },
  { id: 'hyderabad', label: 'Hyderabad', icon: Building2 },
  { id: 'pune', label: 'Pune', icon: Building2 },
  { id: 'mumbai', label: 'Mumbai', icon: Building2 },
  { id: 'delhi-ncr', label: 'Delhi NCR', icon: Building2 },
  { id: 'chennai', label: 'Chennai', icon: Building2 },
  { id: 'remote-india', label: 'Remote India', icon: Globe },
];

/* ─── Sidebar filter panel ───────────────────────────────────────────── */
type FilterState = JobsFeedFilters;
const DEFAULT_FILTERS: FilterState = DEFAULT_JOBS_FEED_FILTERS;

type Facets = { emp: Record<string, number>; wm: Record<string, number>; exp: Record<string, number> };

function FilterPanel({
  filters, facets, onChange, onClear, activeCount,
}: {
  filters: FilterState;
  facets: Facets;
  onChange: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  onClear: () => void;
  activeCount: number;
}) {
  const sortOptions: { label: string; value: SortMode; icon: string }[] = [
    { label: 'Best Match', value: 'recommended', icon: '◈' },
    { label: 'Latest', value: 'newest', icon: '✦' },
  ];

  const toggle = (key: 'employment' | 'workMode' | 'experience', v: string) => {
    const next = new Set(filters[key]);
    next.has(v) ? next.delete(v) : next.add(v);
    onChange(key, next);
  };

  return (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/35">Filters</span>
        {activeCount > 0 && (
          <button onClick={onClear} className="text-[11px] font-semibold text-white/32 hover:text-white/58 transition-colors">
            Clear {activeCount}
          </button>
        )}
      </div>

      {/* Sort */}
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/28 mb-2.5">Sort by</p>
        <div className="flex flex-col gap-0.5">
          {sortOptions.map((o) => (
            <button key={o.value} onClick={() => onChange('sort', o.value)}
              className={`flex items-center gap-2.5 h-9 px-3 rounded-[10px] text-[12.5px] font-medium text-left transition-all ${
                filters.sort === o.value
                  ? 'bg-white text-[#0D0D0F] font-semibold'
                  : 'text-white/42 hover:text-white/68 hover:bg-white/[0.05]'
              }`}>
              <span className="text-[10px] opacity-55">{o.icon}</span>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-white/[0.06] mb-6" />

      {/* Employment type */}
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/28 mb-2.5">Employment type</p>
        <div className="flex flex-col gap-1">
          {EMPLOYMENT_TYPES.map((v) => {
            const active = filters.employment.has(v);
            return (
              <button key={v} onClick={() => toggle('employment', v)}
                className={`flex items-center justify-between h-9 px-3 rounded-[10px] text-[12.5px] font-medium transition-all ${
                  active
                    ? 'bg-white/[0.10] border border-white/[0.22] text-white'
                    : 'text-white/38 hover:text-white/62 hover:bg-white/[0.04]'
                }`}>
                {EMPLOYMENT_TYPE_LABELS[v]}
                <span className={`text-[10.5px] tabular-nums ${active ? 'opacity-70' : 'text-white/22'}`}>
                  {facets.emp[v] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-white/[0.06] mb-6" />

      {/* Experience level */}
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/28 mb-2.5">Experience level</p>
        <div className="flex flex-wrap gap-1.5">
          {EXPERIENCE_LEVELS.map((v) => {
            const active = filters.experience.has(v);
            return (
              <button key={v} onClick={() => toggle('experience', v)}
                className={`h-7 px-3 rounded-full text-[11px] font-semibold transition-all ${
                  active
                    ? 'bg-white text-[#0D0D0F]'
                    : 'border border-white/[0.08] text-white/32 hover:text-white/58'
                }`}>
                {EXPERIENCE_LABELS[v]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-white/[0.06] mb-6" />

      {/* Remote / On-site */}
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/28 mb-2.5">Remote / On-site</p>
        <div className="flex flex-wrap gap-1.5">
          {WORK_MODES.map((v) => {
            const active = filters.workMode.has(v);
            return (
              <button key={v} onClick={() => toggle('workMode', v)}
                className={`h-7 px-3 rounded-full text-[11px] font-semibold transition-all ${
                  active
                    ? 'bg-white text-[#0D0D0F]'
                    : 'border border-white/[0.08] text-white/32 hover:text-white/58'
                }`}>
                {WORK_MODE_LABELS[v]}
                <span className={`ml-1.5 text-[10px] tabular-nums ${active ? 'opacity-55' : 'opacity-45'}`}>
                  {facets.wm[v] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-white/[0.06] mb-6" />

      {/* Location */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/28 mb-2.5">Location</p>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-white/22" />
          <input
            value={filters.location}
            onChange={(e) => onChange('location', e.target.value)}
            placeholder="City, country…"
            className="h-9 w-full rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white pl-8 pr-3 text-[12.5px] placeholder:text-white/18 focus:outline-none focus:border-white/20 transition-colors"
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Load more ──────────────────────────────────────────────────────── */
function LoadMore({ shown, total, hasNext, loading, onMore }: {
  shown: number; total: number | null; hasNext: boolean; loading: boolean; onMore: () => void;
}) {
  if (!hasNext && shown === 0) return null;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 pb-2 border-t border-white/[0.06]">
      <p className="text-[12px] text-white/28">
        Showing <span className="text-white/52 font-semibold">{shown.toLocaleString()}</span>
        {total !== null && <> of <span className="text-white/52 font-semibold">{total.toLocaleString()}</span></>} jobs
      </p>
      {hasNext && (
        <button
          onClick={onMore} disabled={loading}
          className="flex h-9 items-center justify-center gap-2 rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-4 text-[12.5px] font-semibold text-white/48 hover:text-white/72 hover:bg-white/[0.08] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

/* ─── Skeleton card ──────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <article className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5">
      <div className="mb-3.5 flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-white/[0.05]" />
        <div className="flex-1 space-y-2 pt-0.5">
          <div className="h-3.5 w-3/4 animate-pulse rounded-full bg-white/[0.05]" />
          <div className="h-2.5 w-24 animate-pulse rounded-full bg-white/[0.03]" />
        </div>
      </div>
      <div className="mb-2 h-3 w-1/2 animate-pulse rounded-full bg-white/[0.04]" />
      <div className="mt-4 flex gap-3 border-t border-white/[0.04] pt-3.5">
        <div className="h-3 w-20 animate-pulse rounded-full bg-white/[0.04]" />
        <div className="ml-auto h-6 w-24 animate-pulse rounded-full bg-white/[0.04]" />
      </div>
    </article>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */
export default function JobsFeedPage() {
  const router = useRouter();
  /* ?recommended=1 — arriving from the homepage Jobs tile. The page then shows
     ONLY the viewer's matched roles, so it can never list more (or other) jobs
     than the count that was clicked. */
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const recommendedOnly = searchParams?.get('recommended') === '1';

  const [recommended, setRecommended] = useState<JobSummary[]>([]);
  /* The recommendation request has its own state. `state` above tracks the
     all-jobs list, which in recommended mode supplies NOTHING the page renders
     — it resolves in milliseconds while ranking can take far longer, so the
     page reported "ready" with an empty recommendation set and rendered "No
     jobs found" over data that was still in flight. That was the 149 → 0 bug. */
  const [recState, setRecState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [recReloadKey, setRecReloadKey] = useState(0);
  /* The filters ARE the URL. */
  const filters = useMemo<FilterState>(() => filtersFromParams(searchParams ?? new URLSearchParams()), [searchParams]);
  /* The search box keeps its own text so typing is instant; the URL (and so
     the request) follows after a pause. */
  const [searchInput, setSearchInput] = useState(filters.search);
  const [feed, setFeed] = useState<JobsFeedState<JobSummary>>({
    status: 'loading', items: [], hasNextPage: false, nextCursor: null, facets: null, count: null, query: '',
  });
  const controller = useRef<JobsFeedController | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  /* One controller for the page's life: it aborts what is in flight when the
     filters change, appends cursor pages without repeating a card, and never
     turns a failed request into an empty list. */
  useEffect(() => {
    const fetchPage = async (query: string, signal: AbortSignal): Promise<JobsFeedPageResult<JobSummary>> => {
      const r = await fetch(`/api/jobs/public?${query}`, { cache: 'no-store', signal });
      if (!r.ok) throw new Error(`jobs ${r.status}`);
      const d = await r.json();
      if (!d || !Array.isArray(d.items)) throw new Error('jobs: malformed page');
      return { items: d.items as JobSummary[], hasNextPage: Boolean(d.hasNextPage), nextCursor: typeof d.nextCursor === 'string' ? d.nextCursor : null, facets: d.facets ?? null };
    };
    const fetchCount = async (query: string, signal: AbortSignal): Promise<number | null> => {
      const r = await fetch(`/api/jobs/public/count?${query}`, { cache: 'no-store', signal });
      if (!r.ok) return null;
      const d = await r.json().catch(() => null);
      return typeof d?.total === 'number' ? d.total : null;
    };
    const c = createJobsFeedController<JobSummary>({ fetchPage, fetchCount, onState: setFeed });
    controller.current = c;
    return () => { c.dispose(); controller.current = null; };
  }, []);
  useEffect(() => { controller.current?.setFilters(filters); }, [filters]);

  // Session-scoped recommendations — signed-out/no-profile viewers get [] (hidden).
  useEffect(() => {
    let active = true;
    setRecState('loading');
    /* scope=recommended returns every matched role rather than the row's worth,
       which is what the recommended-only view needs to render in full. It is
       the SAME endpoint and the same per-viewer cache the homepage count reads,
       so the two can never disagree about what this viewer matched. */
    const url = recommendedOnly
      ? '/api/recommendations/jobs?scope=recommended'
      : '/api/recommendations/jobs';
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('recommendations-failed'))))
      .then((d) => {
        if (!active) return;
        setRecommended((Array.isArray(d?.jobs) ? (d.jobs as JobSummary[]) : [])
          .filter((j) => typeof j.matchScore === 'number'));
        setRecState('ready');
      })
      .catch(() => {
        /* A failure must read as a failure. Leaving this silent is what made a
           broken request look like "you have no matches". */
        if (active) setRecState('error');
      });
    return () => { active = false; };
  }, [recommendedOnly, recReloadKey]);

  /* ⌘K focus */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

    /* Writing the URL IS setting the filters. Other params (?recommended=1) are kept. */
  const commit = useCallback((next: FilterState) => {
    if (sameFilters(next, filters)) return;
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    for (const k of ['q', 'india', 'loc', 'emp', 'wm', 'exp', 'sort']) params.delete(k);
    for (const [k, v] of Array.from(filtersToParams(next).entries())) params.set(k, v);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters, pathname, router, searchParams]);
  const setFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    commit({ ...filters, [key]: value });
  }, [commit, filters]);
  const clearFilters = useCallback(() => { setSearchInput(''); commit(DEFAULT_FILTERS); }, [commit]);
  /* Typed search reaches the URL SEARCH_DEBOUNCE_MS after the last keystroke. */
  const debouncer = useRef(createDebouncer(SEARCH_DEBOUNCE_MS));
  const onSearchInput = useCallback((value: string) => {
    setSearchInput(value);
    debouncer.current.call(() => commit({ ...filters, search: value.trim() }));
  }, [commit, filters]);
  useEffect(() => { const d = debouncer.current; return () => d.cancel(); }, []);
  /* Back/Forward or a cleared URL: the box follows the URL. */
  useEffect(() => { setSearchInput((cur) => (cur.trim() === filters.search ? cur : filters.search)); }, [filters.search]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [sidebarOpen]);

  /* Global counts beside every filter, served with the page (see
     selectPublicJobFacetCounts) — the same numbers the page once computed over
     the corpus it downloaded. */
  const facets = useMemo<Facets>(() => ({ emp: feed.facets?.emp ?? {}, wm: feed.facets?.wm ?? {}, exp: feed.facets?.exp ?? {} }), [feed.facets]);
  const stats = feed.facets?.stats ?? null;

  const activeFilterCount = useMemo(() => [
    filters.sort !== 'recommended',
    filters.employment.size > 0,
    filters.workMode.size > 0,
    filters.experience.size > 0,
    filters.india !== '',
    filters.location !== '',
  ].filter(Boolean).length, [filters]);

  /* Recommended-only mode: the matched roles ARE the list — they already
     carry matchScore and are ranked best-first by the server — and every
     filter still applies to them, with the page's original predicate, so the
     viewer can narrow their matches further. (For the all-jobs list this
     predicate now runs on the server; see lib/jobs-feed.ts.) */
  const filteredRecommended = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const loc = filters.location.trim().toLowerCase();
    const source = recommended;
    let out = source.filter((j) => {
      if (filters.employment.size && !filters.employment.has(j.employmentType || '')) return false;
      if (filters.workMode.size && !filters.workMode.has(j.workMode || '')) return false;
      if (filters.experience.size && !filters.experience.has(j.experienceLevel || '')) return false;
      if (filters.india && !matchesIndiaFilter(j.location || '', j.workMode || undefined, filters.india)) return false;
      if (loc && !(j.location || '').toLowerCase().includes(loc)) return false;
      if (q) {
        const hay = `${j.title} ${j.organizationName || ''} ${j.location || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (filters.sort === 'newest') {
      const ts = (j: JobSummary) => Date.parse(j.createdAt || '') || 0;
      out = out.slice().sort((a, b) => ts(b) - ts(a));
    }
    return out;
  }, [recommended, filters]);

  const items = recommendedOnly ? filteredRecommended : feed.items;
  /* The exact filtered count: the recommended set's length, or the count
     endpoint's answer — `null` until it arrives, and null (not 0) if it failed. */
  const total: number | null = recommendedOnly ? filteredRecommended.length : feed.count;

  /* In recommended mode the page is driven by the recommendation request; in
     normal mode by the all-jobs list. Reading the wrong one is the whole bug. */
  const loading = recommendedOnly ? recState === 'loading' : feed.status === 'loading';
  const errored = recommendedOnly ? recState === 'error' : feed.status === 'error';
  const isSearching = filters.search.trim().length > 0;

  /* Active non-category filters, mirrored into the chip strip as removable pills. */
  const activePills = useMemo(() => {
    const out: Array<{ key: string; label: string; remove: () => void }> = [];
    for (const v of Array.from(filters.employment)) {
      out.push({ key: `emp-${v}`, label: EMPLOYMENT_TYPE_LABELS[v] ?? v, remove: () => { const n = new Set(filters.employment); n.delete(v); setFilter('employment', n); } });
    }
    for (const v of Array.from(filters.workMode)) {
      out.push({ key: `wm-${v}`, label: WORK_MODE_LABELS[v] ?? v, remove: () => { const n = new Set(filters.workMode); n.delete(v); setFilter('workMode', n); } });
    }
    for (const v of Array.from(filters.experience)) {
      out.push({ key: `exp-${v}`, label: EXPERIENCE_LABELS[v] ?? v, remove: () => { const n = new Set(filters.experience); n.delete(v); setFilter('experience', n); } });
    }
    return out;
  }, [filters.employment, filters.workMode, filters.experience, setFilter]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#0A0A0C] text-white">
      <style>{`
        @keyframes cardIn {
          from { opacity:0; transform:translateY(20px) scale(0.96); }
          to   { opacity:1; transform:translateY(0)    scale(1);    }
        }
        .pc-anim { animation: cardIn 0.42s cubic-bezier(0.22,1,0.36,1) both; }
        .no-sb::-webkit-scrollbar { display:none; }
        .no-sb { scrollbar-width:none; }

        .chip-strip-fade-right {
          mask-image: linear-gradient(to right, black 85%, transparent 100%);
          -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
        }
      `}</style>

      {/* ══ Sticky header ══════════════════════════════════════════════════ */}
      <header className="shrink-0 z-30 border-b border-white/[0.06]"
        style={{ height: 56, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px) saturate(180%)' }}>
        <div className="h-full px-3 sm:px-5 lg:px-8 flex items-center gap-3">

          {/* Back */}
          <button onClick={() => router.back()} aria-label="Back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white hover:bg-white/[0.08] transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Title */}
          <div className="hidden sm:flex items-baseline gap-2 shrink-0">
            <span className="text-[15px] font-bold tracking-[-0.01em] text-white">Jobs</span>
            {!loading && total !== null && (
              <span className="text-[12px] font-medium"
                style={{ color: 'rgba(255,255,255,0.28)' }}>{total.toLocaleString()}</span>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
            <input
              ref={searchRef}
              value={searchInput}
              onChange={(e) => onSearchInput(e.target.value)}
              placeholder="Search jobs, companies, location…"
              aria-label="Search jobs"
              className="h-9 w-full rounded-[11px] text-white pl-9 pr-9 text-[13px] transition-all focus:outline-none"
              style={{
                background: 'rgba(255,255,255,0.055)',
                border: '1px solid rgba(255,255,255,0.09)',
                color: 'white',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.20)'; e.target.style.background = 'rgba(255,255,255,0.07)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.background = 'rgba(255,255,255,0.055)'; }}
            />
            {searchInput && (
              <button onClick={() => onSearchInput('')} aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/28 hover:text-white/55 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Desktop stats */}
          {!loading && stats && (
            <div className="hidden lg:flex items-center gap-4 shrink-0 text-[11.5px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
              <span className="flex items-center gap-1.5 font-medium">
                <Briefcase className="h-3 w-3" />
                <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>{stats.open}</span>
                open
              </span>
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3 w-3" />
                <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>{stats.companies}</span>
                companies
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="h-3 w-3" />
                <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>{stats.remote}</span>
                remote
              </span>
            </div>
          )}

          {/* Manage what you posted — same header group as the post action. */}
          <Link href={MY_JOBS_HREF}
            className="hidden sm:flex shrink-0 items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[12.5px] font-semibold border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white/72 hover:bg-white/[0.08] transition-all">
            <Briefcase className="h-3.5 w-3.5" /> My Jobs
          </Link>

          {/* Primary action */}
          <Link href={POST_HREF}
            className="hidden sm:flex shrink-0 items-center gap-1.5 h-9 px-3.5 rounded-[10px] text-[12.5px] font-semibold border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white/72 hover:bg-white/[0.08] transition-all">
            <Plus className="h-3.5 w-3.5" /> Post a Job
          </Link>

          {/* Mobile filter button */}
          <button onClick={() => setSidebarOpen(true)} aria-label="Filters"
            className={`lg:hidden flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[12.5px] font-semibold shrink-0 transition-all ${
              activeFilterCount > 0
                ? 'bg-white text-[#0A0A0C]'
                : 'border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white/72'
            }`}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {activeFilterCount > 0 && <span className="text-[10.5px] font-bold">{activeFilterCount}</span>}
          </button>
        </div>
      </header>

      {/* ══ Quick-filter chip strip ══════════════════════════════════════ */}
      <div className="shrink-0 z-20 border-b border-white/[0.05]"
        style={{ background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px)' }}>
        <div className="px-3 sm:px-5 lg:px-8 py-2.5 flex items-center gap-1.5 overflow-x-auto no-sb chip-strip-fade-right">
          {LOCATION_NAV.map((n) => {
            const active = filters.india === n.id;
            return (
              <button
                key={n.label}
                onClick={() => setFilter('india', n.id)}
                className="shrink-0 inline-flex items-center gap-1.5 h-[30px] px-3.5 rounded-full text-[11.5px] font-semibold transition-all duration-150 whitespace-nowrap"
                style={active
                  ? { background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', color: '#ffffff' }
                  : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.40)' }
                }>
                <n.icon className="h-3 w-3" />
                {n.label}
              </button>
            );
          })}

          {activePills.map((p) => (
            <button key={p.key} onClick={p.remove}
              className="shrink-0 inline-flex items-center gap-1 h-[30px] px-3.5 rounded-full text-[11.5px] font-semibold transition-all whitespace-nowrap"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              {p.label} <X className="h-2.5 w-2.5" />
            </button>
          ))}

          {filters.location && (
            <button onClick={() => setFilter('location', '')}
              className="shrink-0 inline-flex items-center gap-1 h-[30px] px-3.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              <MapPin className="h-2.5 w-2.5" />{filters.location} <X className="h-2.5 w-2.5" />
            </button>
          )}

          {activeFilterCount > 1 && (
            <button onClick={clearFilters}
              className="shrink-0 h-[30px] px-3 rounded-full text-[11px] text-white/26 hover:text-white/52 transition-colors whitespace-nowrap">
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* ══ Body ════════════════════════════════════════════════════════ */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* Desktop sidebar */}
        <aside className="hidden lg:flex shrink-0 w-[248px] xl:w-[264px] flex-col overflow-hidden border-r border-white/[0.05]">
          <div className="h-full overflow-y-auto px-5 py-6 no-sb">
            <FilterPanel
              filters={filters} facets={facets}
              onChange={setFilter} onClear={clearFilters} activeCount={activeFilterCount}
            />
          </div>
        </aside>

        {/* Main content */}
        <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto px-3 sm:px-4 lg:px-6 xl:px-8 pt-5 pb-12">

          {/* Mobile stats */}
          {!loading && items.length > 0 && stats && (
            <div className="sm:hidden flex items-center gap-3.5 mb-4 text-[11.5px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
              <span className="flex items-center gap-1.5"><Briefcase className="h-3 w-3" /><span className="font-semibold" style={{ color: 'rgba(255,255,255,0.48)' }}>{(total ?? items.length).toLocaleString()}</span> jobs</span>
              <span className="flex items-center gap-1.5"><TrendingUp className="h-3 w-3" /><span className="font-semibold" style={{ color: 'rgba(255,255,255,0.48)' }}>{stats.companies}</span> companies</span>
              <span className="flex items-center gap-1.5"><Zap className="h-3 w-3" /><span className="font-semibold" style={{ color: 'rgba(255,255,255,0.48)' }}>{stats.remote}</span> remote</span>
            </div>
          )}

          {/* A banner instead of the carousel when the whole page IS the matched
              set — otherwise the top four would simply repeat the list below. */}
          {/* Only once the count is KNOWN. While the request is in flight
              `recommended` is still empty, and rendering the banner then
              announced "Showing your 0 best matches" above a grid of loading
              skeletons — a number stated before anything had been counted. */}
          {recommendedOnly && recState === 'ready' && (
            <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[14px] border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-3">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-emerald-300/80" />
              <p className="text-[12.5px] font-semibold text-emerald-100/85">
                Showing your {recommended.length} best {recommended.length === 1 ? 'match' : 'matches'}
              </p>
              <span className="text-[12px] text-white/30">roles that overlap your skills or role</span>
              <Link href="/jobs"
                className="ml-auto inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-white/[0.10] bg-white/[0.05] px-3 text-[12px] font-semibold text-white/60 transition hover:bg-white/[0.09] hover:text-white/90">
                Browse all jobs
              </Link>
            </div>
          )}

          {/* Recommended for You — unchanged data, unchanged cards */}
          {!recommendedOnly && recommended.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-emerald-400/70" />
                <h2 className="text-sm font-bold tracking-tight text-white">Recommended for You</h2>
                <span className="text-[11px] font-medium text-white/28">matched to your profile</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {recommended.slice(0, 4).map((j) => <JobSummaryCard key={`rec-${j.id}`} job={j} />)}
              </div>
              <div className="mt-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/[0.05]" />
                <p className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/25">All Jobs</p>
                <div className="h-px flex-1 bg-white/[0.05]" />
              </div>
            </section>
          )}

          {/* Grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : errored ? (
            <div className="flex flex-col items-center justify-center py-36 text-center">
              <div className="h-18 w-18 rounded-[22px] border border-white/[0.07] flex items-center justify-center mb-6"
                style={{ background: 'rgba(255,255,255,0.025)', boxShadow: '0 0 0 1px rgba(255,255,255,0.04)' }}>
                <Briefcase className="h-9 w-9" style={{ color: 'rgba(255,255,255,0.15)' }} />
              </div>
              <p className="text-[17px] font-bold text-white/42 mb-2">
                {recommendedOnly ? 'Couldn\u2019t load recommendations' : 'Couldn\u2019t load jobs'}
              </p>
              <p className="text-[13.5px] text-white/22 mb-7 max-w-xs leading-relaxed">
                Something went wrong. Try again in a moment.
              </p>
              {/* Retries whichever request actually failed. */}
              <button onClick={() => (recommendedOnly ? setRecReloadKey((k) => k + 1) : controller.current?.retry())}
                className="h-10 px-7 rounded-[13px] border border-white/[0.10] bg-white/[0.04] text-[13.5px] font-semibold text-white/52 hover:bg-white/[0.08] hover:text-white/72 transition-all">
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-36 text-center">
              <div className="h-18 w-18 rounded-[22px] border border-white/[0.07] flex items-center justify-center mb-6"
                style={{ background: 'rgba(255,255,255,0.025)', boxShadow: '0 0 0 1px rgba(255,255,255,0.04)' }}>
                <Briefcase className="h-9 w-9" style={{ color: 'rgba(255,255,255,0.15)' }} />
              </div>
              <p className="text-[17px] font-bold text-white/42 mb-2">No jobs found</p>
              <p className="text-[13.5px] text-white/22 mb-7 max-w-xs leading-relaxed">
                {isSearching
                  ? `No results for "${filters.search}"`
                  : 'Try clearing some filters or searching with a different keyword'}
              </p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters}
                  className="h-10 px-7 rounded-[13px] border border-white/[0.10] bg-white/[0.04] text-[13.5px] font-semibold text-white/52 hover:bg-white/[0.08] hover:text-white/72 transition-all">
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                {items.map((job, i) => (
                  <div key={job.id} className="pc-anim" style={{ animationDelay: `${Math.min(i, 11) * 0.04}s` }}>
                    <JobSummaryCard job={job} />
                  </div>
                ))}
              </div>
              {!recommendedOnly && (
                <div className="mt-10">
                  <LoadMore
                    shown={items.length} total={total} hasNext={feed.hasNextPage}
                    loading={feed.status === 'loading-more'} onMore={() => controller.current?.loadMore()}
                  />
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ══ Mobile filter bottom-sheet ══════════════════════════════════ */}
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[90] max-h-[90dvh] flex flex-col rounded-t-[24px] border-t border-white/[0.09] shadow-[0_-32px_80px_rgba(0,0,0,0.90)]"
            style={{ background: '#0f0f12' }}>
            {/* Handle */}
            <div className="shrink-0 px-5 pt-3.5 pb-4 border-b border-white/[0.07]">
              <div className="mx-auto mb-3.5 h-[3px] w-10 rounded-full bg-white/[0.14]" />
              <div className="flex items-center justify-between">
                <p className="text-[14.5px] font-bold text-white tracking-[-0.01em]">Filters &amp; Sort</p>
                <div className="flex items-center gap-3">
                  {activeFilterCount > 0 && (
                    <button onClick={clearFilters}
                      className="text-[12px] font-semibold text-white/35 hover:text-white/62 transition-colors">
                      Clear all
                    </button>
                  )}
                  <button onClick={() => setSidebarOpen(false)} aria-label="Close filters"
                    className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/[0.09] bg-white/[0.05] text-white/42 hover:text-white/70 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 no-sb">
              <FilterPanel
                filters={filters} facets={facets}
                onChange={setFilter} onClear={clearFilters} activeCount={activeFilterCount}
              />
            </div>
            <div className="shrink-0 px-5 py-4 border-t border-white/[0.07]" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
              <button onClick={() => setSidebarOpen(false)}
                className="w-full h-12 rounded-[14px] font-bold text-[14.5px] tracking-[-0.01em] transition-all"
                style={{ background: '#ffffff', color: '#0A0A0C', boxShadow: '0 4px 20px rgba(255,255,255,0.15)' }}>
                Show {(total ?? items.length).toLocaleString()} {(total ?? items.length) === 1 ? 'job' : 'jobs'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
