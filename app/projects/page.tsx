'use client';

/**
 * Project discovery — the cross-poster entry point.
 *
 * /projects → /projects/[id] (detail)
 *
 * Structured exactly like app/services/page.tsx: one request per query, with
 * search, filters, sorting and paging resolved server-side by
 * /api/projects/discover. Presentation tokens are the People-page language the
 * Services page already uses, so the two marketplaces read as one product.
 * Nothing in Services is modified.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, CalendarClock, LayoutGrid, Loader2, MapPin, Plus, Rocket,
  Search, SlidersHorizontal, X,
} from 'lucide-react';
import { PROJECT_CATEGORIES, projectCategory, BUDGET_TYPE_LABELS, PROJECT_TYPE_LABELS, WORK_MODE_LABELS, STATUS_LABELS } from '@/lib/projects-ui';
import { ProjectSummaryCard, type ProjectSummary } from '@/components/projects/ProjectSummaryCard';

type Facets = {
  categories: Record<string, number>;
  budgetType: Record<string, number>;
  projectType: Record<string, number>;
  workMode: Record<string, number>;
  status: Record<string, number>;
  skills: Record<string, number>;
};
type ApiResponse = {
  projects: ProjectSummary[];
  total: number;
  hasMore: boolean;
  page: number;
  facets: Facets;
  libraryTotal: number;
};

const SORTS: Array<{ id: string; label: string }> = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'relevance', label: 'Most relevant' },
  { id: 'newest', label: 'Recently posted' },
  { id: 'budget_desc', label: 'Budget: high to low' },
  { id: 'budget_asc', label: 'Budget: low to high' },
  { id: 'deadline', label: 'Deadline soonest' },
];

const WORK_MODES = ['remote', 'onsite', 'hybrid'] as const;
const PROJECT_TYPES = ['one_time', 'ongoing', 'contract', 'collaboration'] as const;
const BUDGET_TYPES = ['fixed', 'hourly', 'negotiable'] as const;
const STATUSES = ['open', 'in_progress', 'closed'] as const;

/* ─── Presentation tokens ────────────────────────────────────────────
   The same set app/services/page.tsx uses, so the two marketplaces share
   one sidebar/grid/empty-state language. */
const HEADER_H = 56;
const GRID = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4';
const LABEL = 'text-[10px] font-bold uppercase tracking-[0.14em] text-white/28 mb-2.5';
const DIVIDER = 'h-px bg-white/[0.06] mb-6';
const ROW = 'flex items-center gap-2 h-9 px-3 rounded-[10px] text-[12.5px] font-medium transition-all';
const ROW_ON = 'bg-white/[0.10] border border-white/[0.22] text-white';
const ROW_OFF = 'border border-transparent text-white/38 hover:text-white/62 hover:bg-white/[0.04]';
const PILL = 'h-[26px] px-2.5 rounded-full text-[10.5px] font-medium transition-all';
const PILL_ON = 'bg-white/[0.12] border border-white/[0.22] text-white';
const PILL_OFF = 'border border-white/[0.07] text-white/32 hover:text-white/55 hover:border-white/[0.13]';
const INPUT = 'h-9 w-full rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-[12.5px] placeholder:text-white/18 focus:outline-none focus:border-white/20 transition-colors';
const EMPTY_ICON_BOX = 'h-18 w-18 rounded-[22px] border border-white/[0.07] flex items-center justify-center mb-6 p-5';
const EMPTY_BTN = 'h-10 px-7 rounded-[13px] border border-white/[0.10] bg-white/[0.04] text-[13.5px] font-semibold text-white/52 hover:bg-white/[0.08] hover:text-white/72 transition-all';

function SkeletonCard() {
  return (
    <>
      <div className="sm:hidden rounded-[20px] overflow-hidden border border-white/[0.07]" style={{ background: '#0d0d10' }}>
        <div className="h-[80px] animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="px-4 pb-4" style={{ marginTop: -26 }}>
          <div className="flex items-end gap-3">
            <div className="h-[58px] w-[58px] rounded-full animate-pulse shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="flex-1 pb-1 pt-[24px]"><div className="h-2.5 animate-pulse rounded-full w-1/2" style={{ background: 'rgba(255,255,255,0.05)' }} /></div>
            <div className="h-8 w-8 animate-pulse rounded-[10px] pb-1 mt-[24px] shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-3.5 animate-pulse rounded-full w-3/4" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="h-2.5 animate-pulse rounded-full w-1/2" style={{ background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div className="flex gap-1.5 mt-3">{[1,2,3].map(j => <div key={j} className="h-6 w-16 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />)}</div>
          <div className="h-px mt-3.5 mb-3" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="flex gap-3">{[1,2].map(j => <div key={j} className="h-2.5 w-16 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />)}</div>
        </div>
      </div>
      <div className="hidden sm:block rounded-[20px] overflow-hidden border border-white/[0.07]" style={{ background: '#0d0d10' }}>
        <div className="h-[104px] animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="px-4 pb-4">
          <div className="flex items-end justify-between" style={{ marginTop: -30 }}>
            <div className="h-[64px] w-[64px] rounded-full animate-pulse shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="h-8 w-8 animate-pulse rounded-[10px]" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-2.5 animate-pulse rounded-full w-2/5" style={{ background: 'rgba(255,255,255,0.05)' }} />
            <div className="h-3.5 animate-pulse rounded-full w-3/5" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="h-2.5 animate-pulse rounded-full w-1/2" style={{ background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div className="flex gap-1.5 mt-3.5">{[1,2,3].map(j => <div key={j} className="h-6 w-16 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />)}</div>
          <div className="h-px mt-4 mb-3.5" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="flex gap-3">{[1,2].map(j => <div key={j} className="h-2.5 w-16 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />)}</div>
        </div>
      </div>
    </>
  );
}

export default function ProjectsDiscoveryPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [budgetType, setBudgetType] = useState<string[]>([]);
  const [projectType, setProjectType] = useState<string[]>([]);
  const [workMode, setWorkMode] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [debouncedLocation, setDebouncedLocation] = useState('');
  const [minBudget, setMinBudget] = useState('');
  const [maxBudget, setMaxBudget] = useState('');
  const [sort, setSort] = useState('recommended');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [items, setItems] = useState<ProjectSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  /* Debounce keystrokes so typing does not issue a request per character. */
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(query.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedLocation(location.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [location]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (debounced) p.set('q', debounced);
    if (categories.length) p.set('categories', categories.join(','));
    if (budgetType.length) p.set('budgetType', budgetType.join(','));
    if (projectType.length) p.set('projectType', projectType.join(','));
    if (workMode.length) p.set('workMode', workMode.join(','));
    if (status.length) p.set('status', status.join(','));
    if (skills.length) p.set('skills', skills.join(','));
    if (debouncedLocation) p.set('location', debouncedLocation);
    if (minBudget.trim()) p.set('minBudget', minBudget.trim());
    if (maxBudget.trim()) p.set('maxBudget', maxBudget.trim());
    p.set('sort', sort);
    return p;
  }, [debounced, categories, budgetType, projectType, workMode, status, skills, debouncedLocation, minBudget, maxBudget, sort]);

  /* Monotonic id: a slow earlier response can never overwrite a newer one. */
  const reqId = useRef(0);
  const fetchPage = useCallback(async (targetPage: number, append: boolean) => {
    const id = ++reqId.current;
    if (append) setLoadingMore(true); else setState('loading');
    try {
      const p = new URLSearchParams(params);
      p.set('page', String(targetPage));
      const res = await fetch(`/api/projects/discover?${p.toString()}`);
      if (id !== reqId.current) return;      // superseded
      if (!res.ok) { setState('error'); return; }
      const json = (await res.json()) as ApiResponse;
      if (id !== reqId.current) return;
      setData(json);
      setItems(prev => (append ? [...prev, ...json.projects] : json.projects));
      setState('ready');
    } catch {
      if (id === reqId.current) setState('error');
    } finally {
      if (id === reqId.current) setLoadingMore(false);
    }
  }, [params]);

  useEffect(() => { setPage(1); void fetchPage(1, false); }, [fetchPage]);

  const clearAll = () => {
    setQuery(''); setCategories([]); setBudgetType([]); setProjectType([]);
    setWorkMode([]); setStatus([]); setSkills([]); setLocation('');
    setMinBudget(''); setMaxBudget(''); setSort('recommended');
  };

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const activeChips = [
    ...categories.map(c => ({ label: projectCategory(c).label, clear: () => toggle(categories, setCategories, c) })),
    ...budgetType.map(v => ({ label: BUDGET_TYPE_LABELS[v] ?? v, clear: () => toggle(budgetType, setBudgetType, v) })),
    ...projectType.map(v => ({ label: PROJECT_TYPE_LABELS[v] ?? v, clear: () => toggle(projectType, setProjectType, v) })),
    ...workMode.map(v => ({ label: WORK_MODE_LABELS[v] ?? v, clear: () => toggle(workMode, setWorkMode, v) })),
    ...status.map(v => ({ label: STATUS_LABELS[v] ?? v, clear: () => toggle(status, setStatus, v) })),
    ...skills.map(v => ({ label: v, clear: () => toggle(skills, setSkills, v) })),
    ...(debouncedLocation ? [{ label: debouncedLocation, clear: () => setLocation('') }] : []),
    ...(minBudget.trim() ? [{ label: `Min ${minBudget}`, clear: () => setMinBudget('') }] : []),
    ...(maxBudget.trim() ? [{ label: `Max ${maxBudget}`, clear: () => setMaxBudget('') }] : []),
  ];
  const hasFilters = activeChips.length > 0 || debounced.length > 0 || debouncedLocation.length > 0;

  const facetCats = data?.facets.categories ?? {};
  const catKeys = Array.from(new Set([...Object.keys(facetCats), ...categories]))
    .sort((a, b) => (facetCats[b] ?? 0) - (facetCats[a] ?? 0));
  const facetSkills = data?.facets.skills ?? {};
  const skillKeys = Array.from(new Set([...Object.keys(facetSkills), ...skills]))
    .sort((a, b) => (facetSkills[b] ?? 0) - (facetSkills[a] ?? 0)).slice(0, 12);

  const FilterPanel = (
    <div className="flex flex-col gap-0">
      <div className="flex items-center justify-between mb-6">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/35">Filters</span>
        {activeChips.length > 0 && (
          <button type="button" onClick={clearAll} className="text-[11px] font-semibold text-white/32 hover:text-white/58 transition-colors">
            Clear {activeChips.length}
          </button>
        )}
      </div>

      <div className="mb-6">
        <p className={LABEL}>Sort by</p>
        <div className="flex flex-col gap-0.5">
          {SORTS.map(s => (
            <button key={s.id} type="button" onClick={() => setSort(s.id)} aria-pressed={sort === s.id}
              className={`flex items-center h-9 px-3 rounded-[10px] text-[12.5px] font-medium text-left transition-all ${
                sort === s.id ? 'bg-white text-[#0D0D0F] font-semibold' : 'text-white/42 hover:text-white/68 hover:bg-white/[0.05]'
              }`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className={DIVIDER} />

      <div className="mb-6">
        <p className={LABEL}>Category</p>
        {catKeys.length === 0 && <p className="text-[12px] text-white/25">No categories yet</p>}
        <div className="flex flex-col gap-1">
          {catKeys.map(c => {
            const on = categories.includes(c);
            const meta = PROJECT_CATEGORIES[c] ?? PROJECT_CATEGORIES.other;
            return (
              <button key={c} type="button" onClick={() => toggle(categories, setCategories, c)} aria-pressed={on}
                className={`${ROW} ${on ? ROW_ON : ROW_OFF}`}>
                <span aria-hidden className="text-[12px] shrink-0">{meta.icon}</span>
                <span className="min-w-0 flex-1 truncate text-left">{meta.label}</span>
                <span className="text-[10.5px] opacity-60 shrink-0">{facetCats[c] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={DIVIDER} />

      <div className="mb-6">
        <p className={LABEL}>Status</p>
        <div className="flex flex-col gap-1">
          {STATUSES.map(v => (
            <button key={v} type="button" onClick={() => toggle(status, setStatus, v)} aria-pressed={status.includes(v)}
              className={`${ROW} ${status.includes(v) ? ROW_ON : ROW_OFF}`}>
              <span className="min-w-0 flex-1 truncate text-left">{STATUS_LABELS[v]}</span>
              <span className="text-[10.5px] opacity-60 shrink-0">{data?.facets.status?.[v] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <p className={LABEL}>Project type</p>
        <div className="flex flex-col gap-1">
          {PROJECT_TYPES.map(v => (
            <button key={v} type="button" onClick={() => toggle(projectType, setProjectType, v)} aria-pressed={projectType.includes(v)}
              className={`${ROW} ${projectType.includes(v) ? ROW_ON : ROW_OFF}`}>
              <span className="min-w-0 flex-1 truncate text-left">{PROJECT_TYPE_LABELS[v]}</span>
              <span className="text-[10.5px] opacity-60 shrink-0">{data?.facets.projectType?.[v] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <p className={LABEL}>Budget type</p>
        <div className="flex flex-col gap-1">
          {BUDGET_TYPES.map(v => (
            <button key={v} type="button" onClick={() => toggle(budgetType, setBudgetType, v)} aria-pressed={budgetType.includes(v)}
              className={`${ROW} ${budgetType.includes(v) ? ROW_ON : ROW_OFF}`}>
              <span className="min-w-0 flex-1 truncate text-left">{BUDGET_TYPE_LABELS[v]}</span>
              <span className="text-[10.5px] opacity-60 shrink-0">{data?.facets.budgetType?.[v] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <p className={LABEL}>Budget range</p>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="text-[10.5px] text-white/28 mb-1 block" htmlFor="prj-min">Min</label>
            <input id="prj-min" value={minBudget} onChange={e => setMinBudget(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric" placeholder="0" aria-label="Minimum budget" className={INPUT} />
          </div>
          <div className="flex-1">
            <label className="text-[10.5px] text-white/28 mb-1 block" htmlFor="prj-max">Max</label>
            <input id="prj-max" value={maxBudget} onChange={e => setMaxBudget(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric" placeholder="Any" aria-label="Maximum budget" className={INPUT} />
          </div>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/22">Negotiable projects have no set figure and are excluded from a range.</p>
      </div>

      <div className={DIVIDER} />

      <div className="mb-6">
        <p className={LABEL}>Location</p>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-white/22" />
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="City or area…"
            aria-label="Filter by location" className={`${INPUT} pl-8`} />
        </div>
      </div>

      <div className="mb-6">
        <p className={LABEL}>Remote / on-site</p>
        <div className="flex flex-wrap gap-1.5">
          {WORK_MODES.map(v => {
            const on = workMode.includes(v);
            return (
              <button key={v} type="button" onClick={() => toggle(workMode, setWorkMode, v)} aria-pressed={on}
                className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}>
                {WORK_MODE_LABELS[v]} <span className="opacity-55">{data?.facets.workMode?.[v] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {skillKeys.length > 0 && (
        <div>
          <p className={LABEL}>Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {skillKeys.map(v => {
              const on = skills.includes(v);
              return (
                <button key={v} type="button" onClick={() => toggle(skills, setSkills, v)} aria-pressed={on}
                  className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}>
                  {v} <span className="opacity-55">{facetSkills[v] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  /* Quick chips, wired only to filters this page already has. */
  const quickChipActive = (id: string) => {
    if (id === 'all') return !hasFilters && sort === 'recommended';
    if (id === 'open') return status.includes('open');
    if (id === 'remote') return workMode.includes('remote');
    if (id === 'newest') return sort === 'newest';
    if (id === 'budget_desc') return sort === 'budget_desc';
    if (id === 'deadline') return sort === 'deadline';
    return categories.includes(id);
  };
  const quickChipClick = (id: string) => {
    if (id === 'all') { clearAll(); return; }
    if (id === 'open') { toggle(status, setStatus, 'open'); return; }
    if (id === 'remote') { toggle(workMode, setWorkMode, 'remote'); return; }
    if (id === 'newest') { setSort('newest'); return; }
    if (id === 'budget_desc') { setSort('budget_desc'); return; }
    if (id === 'deadline') { setSort('deadline'); return; }
    toggle(categories, setCategories, id);
  };
  const quickChips: Array<{ id: string; label: string }> = [
    { id: 'all', label: '◈ All' },
    ...catKeys.slice(0, 4).map(c => ({ id: c, label: `${projectCategory(c).icon} ${projectCategory(c).label}` })),
    { id: 'open', label: 'Open' },
    { id: 'remote', label: 'Remote' },
    { id: 'newest', label: '✦ Recently posted' },
    { id: 'budget_desc', label: '▲ Top budget' },
    { id: 'deadline', label: '◷ Deadline soon' },
  ];

  const categoryCount = Object.keys(facetCats).length;
  const openCount = data?.facets.status?.open ?? 0;

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-white">
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

        /* Same scroll hardening the other category strips carry. Its own class
           because no-sb is shared with the vertical sidebar and mobile sheet. */
        .prj-chip-strip {
          overflow-x: auto;
          overflow-y: hidden;
          touch-action: pan-x;
          overscroll-behavior-x: contain;
          -webkit-overflow-scrolling: touch;
          scroll-behavior: auto;
        }
        @media (prefers-reduced-motion: reduce) {
          .prj-chip-strip button { transition: none !important; }
          .pc-anim { animation: none !important; }
        }
      `}</style>

      {/* ══ Sticky header ══════════════════════════════════════════════ */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06]"
        style={{ height: HEADER_H, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px) saturate(180%)' }}>
        <div className="h-full px-3 sm:px-5 lg:px-8 flex items-center gap-3">
          <button type="button" onClick={() => router.back()} aria-label="Go back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white hover:bg-white/[0.08] transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="hidden sm:flex items-baseline gap-2 shrink-0">
            <h1 className="text-[15px] font-bold tracking-[-0.01em] text-white">Projects</h1>
            {state === 'ready' && data && (
              <span className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.28)' }}>{data.total.toLocaleString()}</span>
            )}
          </div>

          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
            <input value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search projects, skills or posters…" aria-label="Search projects"
              className="h-9 w-full rounded-[11px] text-white pl-9 pr-9 text-[13px] transition-all focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.09)' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.20)'; e.target.style.background = 'rgba(255,255,255,0.07)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.background = 'rgba(255,255,255,0.055)'; }} />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/28 hover:text-white/55 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {state === 'ready' && data && (
            <div className="hidden lg:flex items-center gap-4 shrink-0 text-[11.5px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
              <span className="flex items-center gap-1.5 font-medium">
                <Rocket className="h-3 w-3" />
                <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>{data.total.toLocaleString()}</span> projects
              </span>
              <span className="flex items-center gap-1.5">
                <LayoutGrid className="h-3 w-3" />
                <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>{categoryCount}</span> categories
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarClock className="h-3 w-3" />
                <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>{openCount}</span> open
              </span>
            </div>
          )}

          <Link href="/projects/create"
            className="hidden sm:inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-white/[0.10] bg-white/[0.06] px-3 text-[12.5px] font-semibold text-white/70 hover:bg-white/[0.10] hover:text-white transition-all">
            <Plus className="h-3.5 w-3.5" /> Post
          </Link>

          <button type="button" onClick={() => setSheetOpen(true)} aria-label="Filters and sort"
            className={`lg:hidden flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[12.5px] font-semibold shrink-0 transition-all ${
              activeChips.length > 0 ? 'bg-white text-[#0A0A0C]' : 'border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white/72'
            }`}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {activeChips.length > 0 && <span className="text-[10.5px] font-bold">{activeChips.length}</span>}
          </button>
        </div>
      </header>

      {/* ══ Quick-filter chip strip ═════════════════════════════════════ */}
      <div className="sticky z-20 border-b border-white/[0.05]"
        style={{ top: HEADER_H, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px)' }}>
        <div className="prj-chip-strip px-3 sm:px-5 lg:px-8 py-2.5 flex items-center gap-1.5 overflow-x-auto no-sb chip-strip-fade-right">
          {quickChips.map(chip => {
            const on = quickChipActive(chip.id);
            return (
              <button key={chip.id} type="button" onClick={() => quickChipClick(chip.id)} aria-pressed={on}
                className="shrink-0 h-[30px] px-3.5 rounded-full text-[11.5px] font-semibold transition-colors duration-150 whitespace-nowrap"
                style={on
                  ? { background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', color: '#ffffff' }
                  : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.40)' }}>
                {chip.label}
              </button>
            );
          })}
          {activeChips.map(chip => (
            <button key={`active-${chip.label}`} type="button" onClick={chip.clear}
              aria-label={`Remove filter: ${chip.label}`}
              className="shrink-0 inline-flex items-center gap-1 h-[30px] px-3.5 rounded-full text-[11.5px] font-semibold transition-colors whitespace-nowrap"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              {chip.label} <X className="h-2.5 w-2.5" />
            </button>
          ))}
          {activeChips.length > 1 && (
            <button type="button" onClick={clearAll}
              className="shrink-0 h-[30px] px-3 rounded-full text-[11px] text-white/26 hover:text-white/52 transition-colors whitespace-nowrap">
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* ══ Body ════════════════════════════════════════════════════════ */}
      <div className="flex">
        <aside className="hidden lg:flex shrink-0 w-[248px] xl:w-[264px] flex-col border-r border-white/[0.05]">
          <div className="sticky overflow-y-auto px-5 py-6 no-sb"
            style={{ top: HEADER_H + 47, height: `calc(100vh - ${HEADER_H + 47}px)` }}>
            {FilterPanel}
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-3 sm:px-4 lg:px-6 xl:px-8 pt-5 pb-12">
          {state === 'ready' && data && items.length > 0 && (
            <div className="sm:hidden flex items-center gap-3.5 mb-4 text-[11.5px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
              <span className="flex items-center gap-1.5"><Rocket className="h-3 w-3" /><span className="font-semibold" style={{ color: 'rgba(255,255,255,0.48)' }}>{data.total.toLocaleString()}</span> projects</span>
              <span className="flex items-center gap-1.5"><LayoutGrid className="h-3 w-3" /><span className="font-semibold" style={{ color: 'rgba(255,255,255,0.48)' }}>{categoryCount}</span> categories</span>
              <span className="flex items-center gap-1.5"><CalendarClock className="h-3 w-3" /><span className="font-semibold" style={{ color: 'rgba(255,255,255,0.48)' }}>{openCount}</span> open</span>
            </div>
          )}

          {state === 'loading' && (
            <div className={GRID}>{Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}</div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-36 text-center">
              <div className={EMPTY_ICON_BOX}><Rocket className="h-9 w-9" style={{ color: 'rgba(255,255,255,0.15)' }} /></div>
              <p className="text-[17px] font-bold text-white/42 mb-2">Couldn&apos;t load projects</p>
              <p className="text-[13.5px] text-white/22 mb-7 max-w-xs leading-relaxed">Something went wrong while fetching results. Try again in a moment.</p>
              <button type="button" onClick={() => void fetchPage(1, false)} className={EMPTY_BTN}>Try again</button>
            </div>
          )}

          {state === 'ready' && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-36 text-center">
              <div className={EMPTY_ICON_BOX}><Rocket className="h-9 w-9" style={{ color: 'rgba(255,255,255,0.15)' }} /></div>
              {/* "Nothing posted yet" is a different message from "nothing
                  matches" — libraryTotal tells them apart instead of guessing. */}
              <p className="text-[17px] font-bold text-white/42 mb-2">
                {hasFilters ? 'No projects match your filters' : 'No projects found'}
              </p>
              <p className="text-[13.5px] text-white/22 mb-7 max-w-xs leading-relaxed">
                {hasFilters
                  ? 'Try removing a filter or searching for something broader.'
                  : (data?.libraryTotal ?? 0) === 0
                    ? 'Nobody has posted a project yet. Post the first one.'
                    : 'Nothing to show right now.'}
              </p>
              {hasFilters
                ? <button type="button" onClick={clearAll} className={EMPTY_BTN}>Clear all filters</button>
                : <Link href="/projects/create" className={EMPTY_BTN}>Post a project</Link>}
            </div>
          )}

          {state === 'ready' && items.length > 0 && (
            <>
              <div className={GRID}>
                {items.map((p, i) => (
                  <div key={p.id} className="pc-anim" style={{ animationDelay: `${Math.min(i, 11) * 0.04}s` }}>
                    <ProjectSummaryCard project={p} />
                  </div>
                ))}
              </div>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 pb-2 border-t border-white/[0.06]">
                <p className="text-[12px] text-white/28">
                  Showing <span className="text-white/52 font-semibold">{items.length.toLocaleString()}</span> of{' '}
                  <span className="text-white/52 font-semibold">{(data?.total ?? items.length).toLocaleString()}</span>{' '}
                  {(data?.total ?? items.length) === 1 ? 'project' : 'projects'}
                </p>
                {data?.hasMore && (
                  <button type="button" disabled={loadingMore}
                    onClick={() => { const next = page + 1; setPage(next); void fetchPage(next, true); }}
                    className="inline-flex items-center gap-2 h-9 px-5 rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-[12.5px] font-semibold text-white/48 hover:text-white/72 hover:bg-white/[0.08] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                    {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Load more
                  </button>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Mobile "post" affordance — the header button is desktop-only. */}
      <Link href="/projects/create" aria-label="Post a project"
        className="sm:hidden fixed right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
        style={{ bottom: 'calc(96px + env(safe-area-inset-bottom))', background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' }}>
        <Plus className="h-5 w-5" />
      </Link>

      {/* ══ Mobile filter bottom-sheet ══════════════════════════════════ */}
      {sheetOpen && (
        <>
          <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[90] max-h-[90dvh] flex flex-col rounded-t-[24px] border-t border-white/[0.09] shadow-[0_-32px_80px_rgba(0,0,0,0.90)] lg:hidden"
            style={{ background: '#0f0f12' }}>
            <div className="shrink-0 px-5 pt-3.5 pb-4 border-b border-white/[0.07]">
              <div className="mx-auto mb-3.5 h-[3px] w-10 rounded-full bg-white/[0.14]" />
              <div className="flex items-center justify-between">
                <p className="text-[14.5px] font-bold text-white tracking-[-0.01em]">Filters &amp; Sort</p>
                <div className="flex items-center gap-3">
                  {activeChips.length > 0 && (
                    <button type="button" onClick={clearAll} className="text-[12px] font-semibold text-white/35 hover:text-white/62 transition-colors">Clear all</button>
                  )}
                  <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close filters"
                    className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/[0.09] bg-white/[0.05] text-white/42 hover:text-white/70 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 no-sb">{FilterPanel}</div>
            <div className="shrink-0 px-5 py-4 border-t border-white/[0.07]" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setSheetOpen(false)}
                className="w-full h-12 rounded-[14px] font-bold text-[14.5px] tracking-[-0.01em] transition-all"
                style={{ background: '#ffffff', color: '#0A0A0C', boxShadow: '0 4px 20px rgba(255,255,255,0.15)' }}>
                Show {(data?.total ?? items.length).toLocaleString()} {(data?.total ?? items.length) === 1 ? 'project' : 'projects'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
