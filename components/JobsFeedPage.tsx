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
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Briefcase, Building2, ChevronLeft, ChevronRight, Globe, LayoutGrid, MapPin, Plus, Search,
  SlidersHorizontal, Sparkles, TrendingUp, X, Zap,
} from 'lucide-react';
import { EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS } from '@/lib/jobs-ui';
import { matchesIndiaFilter, type IndiaBucket } from '@/lib/server/job-scraper/india';
import { JobSummaryCard, type JobSummary } from '@/components/jobs/JobSummaryCard';

/* ─── constants ──────────────────────────────────────────────────────── */
const PAGE_SIZE = 24;
const POST_HREF = '/jobs/post';
const MY_JOBS_HREF = '/jobs/my';
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'freelance'] as const;
const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const;
const EXPERIENCE_LEVELS = ['entry', 'associate', 'mid', 'senior', 'lead'] as const;

type SortMode = 'recommended' | 'newest';

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
interface FilterState {
  sort: SortMode;
  search: string;
  employment: Set<string>;
  workMode: Set<string>;
  experience: Set<string>;
  india: IndiaBucket;
  location: string;
}

const DEFAULT_FILTERS: FilterState = {
  sort: 'recommended',
  search: '',
  employment: new Set(),
  workMode: new Set(),
  experience: new Set(),
  india: '',
  location: '',
};

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

/* ─── Pagination ─────────────────────────────────────────────────────── */
function Pagination({ page, totalPages, total, pageSize, onChange }: {
  page: number; totalPages: number; total: number; pageSize: number; onChange: (p: number) => void;
}) {
  const pages = useMemo(() => {
    const arr: (number | 'ellipsis')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) arr.push(i);
    } else {
      arr.push(1);
      if (page > 3) arr.push('ellipsis');
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) arr.push(i);
      if (page < totalPages - 2) arr.push('ellipsis');
      arr.push(totalPages);
    }
    return arr;
  }, [page, totalPages]);

  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 pb-2 border-t border-white/[0.06]">
      <p className="text-[12px] text-white/28">
        Showing <span className="text-white/52 font-semibold">{from}–{to}</span> of <span className="text-white/52 font-semibold">{total}</span> jobs
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)} disabled={page === 1}
          aria-label="Previous page"
          className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/38 hover:text-white/68 hover:bg-white/[0.08] transition-all disabled:opacity-25 disabled:cursor-not-allowed">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="flex h-8 w-8 items-center justify-center text-white/18 text-[12px]">…</span>
          ) : (
            <button key={p} onClick={() => onChange(p)}
              className={`flex h-8 w-8 items-center justify-center rounded-[10px] text-[12px] font-semibold transition-all ${
                p === page
                  ? 'bg-white text-[#0D0D0F]'
                  : 'border border-white/[0.08] text-white/38 hover:text-white/68 hover:bg-white/[0.06]'
              }`}>
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)} disabled={page === totalPages}
          aria-label="Next page"
          className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/38 hover:text-white/68 hover:bg-white/[0.08] transition-all disabled:opacity-25 disabled:cursor-not-allowed">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
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
  const recommendedOnly = useSearchParams()?.get('recommended') === '1';

  const [all, setAll] = useState<JobSummary[]>([]);
  const [recommended, setRecommended] = useState<JobSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const load = useCallback(() => {
    setState('loading');
    let active = true;
    /* view=list drops description/responsibilities/requirements — ~2.7 MB of
       payload the cards never render. Filtering, search, sort and facets all
       read fields the list view keeps. */
    fetch('/api/public/hiring/jobs?view=list', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load-failed'))))
      .then((d) => { if (active) { setAll(Array.isArray(d) ? d : []); setState('ready'); } })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, []);
  useEffect(() => load(), [load]);

  // Session-scoped recommendations — signed-out/no-profile viewers get [] (hidden).
  useEffect(() => {
    let active = true;
    /* scope=recommended returns every matched role rather than the row's worth,
       which is what the recommended-only view needs to render in full. */
    const url = recommendedOnly
      ? '/api/recommendations/jobs?scope=recommended'
      : '/api/recommendations/jobs';
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { jobs: [] }))
      .then((d) => { if (active) setRecommended((Array.isArray(d?.jobs) ? (d.jobs as JobSummary[]) : []).filter((j) => typeof j.matchScore === 'number')); })
      .catch(() => { /* best-effort */ });
    return () => { active = false; };
  }, [recommendedOnly]);

  /* ⌘K focus */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  useEffect(() => { setPage(1); }, [filters]);

  const setFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [sidebarOpen]);

  const facets = useMemo<Facets>(() => {
    const emp: Record<string, number> = {}, wm: Record<string, number> = {}, exp: Record<string, number> = {};
    for (const j of all) {
      const e = j.employmentType || ''; if (e) emp[e] = (emp[e] ?? 0) + 1;
      const w = j.workMode || ''; if (w) wm[w] = (wm[w] ?? 0) + 1;
      const x = j.experienceLevel || ''; if (x) exp[x] = (exp[x] ?? 0) + 1;
    }
    return { emp, wm, exp };
  }, [all]);

  const activeFilterCount = useMemo(() => [
    filters.sort !== 'recommended',
    filters.employment.size > 0,
    filters.workMode.size > 0,
    filters.experience.size > 0,
    filters.india !== '',
    filters.location !== '',
  ].filter(Boolean).length, [filters]);

  /* Unchanged matching logic — same fields, same substring search, same sort. */
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const loc = filters.location.trim().toLowerCase();
    /* In recommended-only mode the matched roles ARE the list — they already
       carry matchScore and are ranked best-first by the server. Every filter
       below still applies, so the viewer can narrow their matches further. */
    const source = recommendedOnly ? recommended : all;
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
  }, [all, recommended, recommendedOnly, filters]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const loading = state === 'loading';
  const isSearching = filters.search.trim().length > 0;
  const companies = useMemo(() => new Set(all.map((j) => (j.organizationName || '').toLowerCase()).filter(Boolean)).size, [all]);
  const remoteCount = useMemo(() => all.filter((j) => j.workMode === 'remote').length, [all]);

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
            {!loading && (
              <span className="text-[12px] font-medium"
                style={{ color: 'rgba(255,255,255,0.28)' }}>{filtered.length.toLocaleString()}</span>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
            <input
              ref={searchRef}
              value={filters.search}
              onChange={(e) => setFilter('search', e.target.value)}
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
            {filters.search && (
              <button onClick={() => setFilter('search', '')} aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/28 hover:text-white/55 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Desktop stats */}
          {!loading && (
            <div className="hidden lg:flex items-center gap-4 shrink-0 text-[11.5px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
              <span className="flex items-center gap-1.5 font-medium">
                <Briefcase className="h-3 w-3" />
                <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>{all.length}</span>
                open
              </span>
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3 w-3" />
                <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>{companies}</span>
                companies
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="h-3 w-3" />
                <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>{remoteCount}</span>
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
          {!loading && filtered.length > 0 && (
            <div className="sm:hidden flex items-center gap-3.5 mb-4 text-[11.5px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
              <span className="flex items-center gap-1.5"><Briefcase className="h-3 w-3" /><span className="font-semibold" style={{ color: 'rgba(255,255,255,0.48)' }}>{filtered.length}</span> jobs</span>
              <span className="flex items-center gap-1.5"><TrendingUp className="h-3 w-3" /><span className="font-semibold" style={{ color: 'rgba(255,255,255,0.48)' }}>{companies}</span> companies</span>
              <span className="flex items-center gap-1.5"><Zap className="h-3 w-3" /><span className="font-semibold" style={{ color: 'rgba(255,255,255,0.48)' }}>{remoteCount}</span> remote</span>
            </div>
          )}

          {/* A banner instead of the carousel when the whole page IS the matched
              set — otherwise the top four would simply repeat the list below. */}
          {recommendedOnly && (
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
          ) : state === 'error' ? (
            <div className="flex flex-col items-center justify-center py-36 text-center">
              <div className="h-18 w-18 rounded-[22px] border border-white/[0.07] flex items-center justify-center mb-6"
                style={{ background: 'rgba(255,255,255,0.025)', boxShadow: '0 0 0 1px rgba(255,255,255,0.04)' }}>
                <Briefcase className="h-9 w-9" style={{ color: 'rgba(255,255,255,0.15)' }} />
              </div>
              <p className="text-[17px] font-bold text-white/42 mb-2">Couldn&apos;t load jobs</p>
              <p className="text-[13.5px] text-white/22 mb-7 max-w-xs leading-relaxed">
                Something went wrong. Try again in a moment.
              </p>
              <button onClick={() => load()}
                className="h-10 px-7 rounded-[13px] border border-white/[0.10] bg-white/[0.04] text-[13.5px] font-semibold text-white/52 hover:bg-white/[0.08] hover:text-white/72 transition-all">
                Try again
              </button>
            </div>
          ) : filtered.length === 0 ? (
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
                {paginated.map((job, i) => (
                  <div key={job.id} className="pc-anim" style={{ animationDelay: `${Math.min(i, 11) * 0.04}s` }}>
                    <JobSummaryCard job={job} />
                  </div>
                ))}
              </div>
              <div className="mt-10">
                <Pagination
                  page={page} totalPages={totalPages} total={filtered.length}
                  pageSize={PAGE_SIZE} onChange={(p) => { setPage(p); mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                />
              </div>
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
                Show {filtered.length.toLocaleString()} {filtered.length === 1 ? 'job' : 'jobs'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
