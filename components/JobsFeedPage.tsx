'use client';

/**
 * Jobs discovery — the Jobs-side mirror of app/projects/page.tsx.
 *
 * Same shell, header, quick-chip strip, filter sidebar, grid, empty/loading/
 * error states, mobile filter sheet, spacing, tokens and breakpoints as the
 * Projects discovery page, so the two marketplaces read as one product.
 * NOTHING in Projects is modified.
 *
 * Data flow is unchanged: the existing public feed GET /api/public/hiring/jobs
 * (a flat array) is fetched once and searched/filtered/sorted client-side. No
 * new API, no data-model change. Facets are derived from the loaded jobs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, Building2, LayoutGrid, MapPin, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS } from '@/lib/jobs-ui';
import { JobSummaryCard, type JobSummary } from '@/components/jobs/JobSummaryCard';

/* ── Presentation tokens — identical set to app/projects/page.tsx ── */
const HEADER_H = 56;
const GRID = 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4';
const LABEL = 'text-[10px] font-bold uppercase tracking-[0.14em] text-white/28 mb-2.5';
const DIVIDER = 'h-px bg-white/[0.06] mb-6';
const ROW = 'flex items-center gap-2 h-9 px-3 rounded-[10px] text-[12.5px] font-medium transition-all w-full';
const ROW_ON = 'bg-white/[0.10] border border-white/[0.22] text-white';
const ROW_OFF = 'border border-transparent text-white/38 hover:text-white/62 hover:bg-white/[0.04]';
const PILL = 'h-[26px] px-2.5 rounded-full text-[10.5px] font-medium transition-all';
const PILL_ON = 'bg-white/[0.12] border border-white/[0.22] text-white';
const PILL_OFF = 'border border-white/[0.07] text-white/32 hover:text-white/55 hover:border-white/[0.13]';
const INPUT = 'h-9 w-full rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-[12.5px] placeholder:text-white/18 focus:outline-none focus:border-white/20 transition-colors';
const EMPTY_ICON_BOX = 'h-18 w-18 rounded-[22px] border border-white/[0.07] flex items-center justify-center mb-6 p-5';
const EMPTY_BTN = 'h-10 px-7 rounded-[13px] border border-white/[0.10] bg-white/[0.04] text-[13.5px] font-semibold text-white/52 hover:bg-white/[0.08] hover:text-white/72 transition-all';

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'freelance'] as const;
const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const;
const EXPERIENCE_LEVELS = ['entry', 'associate', 'mid', 'senior', 'lead'] as const;

function SkeletonCard() {
  const bar = (w: string, h = 'h-2.5') => <div className={`${h} animate-pulse rounded-full ${w}`} style={{ background: 'rgba(255,255,255,0.05)' }} />;
  return (
    <>
      <div className="sm:hidden rounded-[20px] overflow-hidden border border-white/[0.07]" style={{ background: '#0d0d10' }}>
        <div className="h-[80px] animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="px-4 pb-4" style={{ marginTop: -26 }}>
          <div className="flex items-end gap-3">
            <div className="h-[52px] w-[52px] rounded-full animate-pulse shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="flex-1 pt-[24px]">{bar('w-1/2')}</div>
            <div className="h-8 w-8 animate-pulse rounded-[10px] mt-[24px] shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div className="mt-3 space-y-2">{bar('w-3/4', 'h-3.5')}{bar('w-1/2')}</div>
          <div className="flex gap-1.5 mt-3">{[1, 2, 3].map(j => <div key={j} className="h-6 w-16 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />)}</div>
          <div className="h-px mt-3.5 mb-3" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="flex gap-3">{[1, 2].map(j => <div key={j} className="h-2.5 w-16 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />)}</div>
        </div>
      </div>
      <div className="hidden sm:block rounded-[20px] overflow-hidden border border-white/[0.07]" style={{ background: '#0d0d10' }}>
        <div className="h-[104px] animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="px-4 pb-4">
          <div className="flex items-end justify-between" style={{ marginTop: -30 }}>
            <div className="h-[58px] w-[58px] rounded-full animate-pulse shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="h-8 w-8 animate-pulse rounded-[10px]" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div className="mt-3 space-y-2">{bar('w-2/5')}{bar('w-3/5', 'h-3.5')}{bar('w-1/2')}</div>
          <div className="flex gap-1.5 mt-3.5">{[1, 2, 3].map(j => <div key={j} className="h-6 w-16 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />)}</div>
          <div className="h-px mt-4 mb-3.5" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="flex gap-3">{[1, 2].map(j => <div key={j} className="h-2.5 w-16 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />)}</div>
        </div>
      </div>
    </>
  );
}

const POST_HREF = '/workspace?tab=hiring-desk';

export default function JobsFeedPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [employment, setEmployment] = useState<string[]>([]);
  const [workMode, setWorkMode] = useState<string[]>([]);
  const [experience, setExperience] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [sort, setSort] = useState<'recommended' | 'newest'>('recommended');
  const [sheetOpen, setSheetOpen] = useState(false);

  const [all, setAll] = useState<JobSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(() => {
    setState('loading');
    let active = true;
    fetch('/api/public/hiring/jobs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load-failed'))))
      .then((d) => { if (active) { setAll(Array.isArray(d) ? d : []); setState('ready'); } })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, []);
  useEffect(() => load(), [load]);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);

  const clearAll = () => {
    setQuery(''); setEmployment([]); setWorkMode([]); setExperience([]);
    setSkills([]); setLocation(''); setSort('recommended');
  };

  /* Facets derived from ALL loaded jobs (Projects derives them server-side). */
  const facets = useMemo(() => {
    const emp: Record<string, number> = {}, wm: Record<string, number> = {}, exp: Record<string, number> = {}, sk: Record<string, number> = {};
    for (const j of all) {
      const e = j.employmentType || ''; if (e) emp[e] = (emp[e] ?? 0) + 1;
      const w = j.workMode || ''; if (w) wm[w] = (wm[w] ?? 0) + 1;
      const x = j.experienceLevel || ''; if (x) exp[x] = (exp[x] ?? 0) + 1;
      for (const s of [...(j.preferredSkills ?? []), ...(j.targetRoleKeywords ?? [])]) { if (s) sk[s] = (sk[s] ?? 0) + 1; }
    }
    return { emp, wm, exp, sk };
  }, [all]);

  const skillKeys = useMemo(
    () => Array.from(new Set([...Object.keys(facets.sk), ...skills])).sort((a, b) => (facets.sk[b] ?? 0) - (facets.sk[a] ?? 0)).slice(0, 12),
    [facets.sk, skills],
  );

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const loc = location.trim().toLowerCase();
    let out = all.filter((j) => {
      if (employment.length && !employment.includes(j.employmentType || '')) return false;
      if (workMode.length && !workMode.includes(j.workMode || '')) return false;
      if (experience.length && !experience.includes(j.experienceLevel || '')) return false;
      if (skills.length) {
        const js = new Set([...(j.preferredSkills ?? []), ...(j.targetRoleKeywords ?? [])]);
        if (!skills.some((s) => js.has(s))) return false;
      }
      if (loc && !(j.location || '').toLowerCase().includes(loc)) return false;
      if (q) {
        const hay = `${j.title} ${j.organizationName || ''} ${j.location || ''} ${(j.preferredSkills ?? []).join(' ')} ${(j.targetRoleKeywords ?? []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (sort === 'newest') {
      const ts = (j: JobSummary) => Date.parse(j.createdAt || '') || 0;
      out = out.slice().sort((a, b) => ts(b) - ts(a));
    }
    // 'recommended' keeps the order the feed API returns (already newest-first).
    return out;
  }, [all, query, employment, workMode, experience, skills, location, sort]);

  const activeChips = [
    ...employment.map(v => ({ label: EMPLOYMENT_TYPE_LABELS[v] ?? v, clear: () => toggle(employment, setEmployment, v) })),
    ...workMode.map(v => ({ label: WORK_MODE_LABELS[v] ?? v, clear: () => toggle(workMode, setWorkMode, v) })),
    ...experience.map(v => ({ label: EXPERIENCE_LABELS[v] ?? v, clear: () => toggle(experience, setExperience, v) })),
    ...skills.map(v => ({ label: v, clear: () => toggle(skills, setSkills, v) })),
    ...(location.trim() ? [{ label: location.trim(), clear: () => setLocation('') }] : []),
  ];
  const hasFilters = activeChips.length > 0 || query.trim().length > 0;

  const companyCount = useMemo(() => new Set(all.map(j => (j.organizationName || '').toLowerCase()).filter(Boolean)).size, [all]);
  const openCount = useMemo(() => all.filter(j => (j.status || 'published') === 'published').length, [all]);

  const FilterPanel = (
    <div className="flex flex-col gap-0">
      <div className="flex items-center justify-between mb-6">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/35">Filters</span>
        {activeChips.length > 0 && (
          <button type="button" onClick={clearAll} className="text-[11px] font-semibold text-white/32 hover:text-white/58 transition-colors">Clear all</button>
        )}
      </div>

      <div className="mb-6">
        <p className={LABEL}>Employment type</p>
        <div className="flex flex-col gap-1">
          {EMPLOYMENT_TYPES.map(v => {
            const on = employment.includes(v);
            return (
              <button key={v} type="button" onClick={() => toggle(employment, setEmployment, v)} aria-pressed={on} className={`${ROW} ${on ? ROW_ON : ROW_OFF}`}>
                <span className="flex-1 text-left">{EMPLOYMENT_TYPE_LABELS[v]}</span>
                <span className="text-[11px] opacity-55">{facets.emp[v] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-6">
        <p className={LABEL}>Experience level</p>
        <div className="flex flex-wrap gap-1.5">
          {EXPERIENCE_LEVELS.map(v => {
            const on = experience.includes(v);
            return (
              <button key={v} type="button" onClick={() => toggle(experience, setExperience, v)} aria-pressed={on} className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}>
                {EXPERIENCE_LABELS[v]} <span className="opacity-55">{facets.exp[v] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={DIVIDER} />

      <div className="mb-6">
        <p className={LABEL}>Location</p>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-white/22" />
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="City or area…" aria-label="Filter by location" className={`${INPUT} pl-8`} />
        </div>
      </div>

      <div className="mb-6">
        <p className={LABEL}>Remote / on-site</p>
        <div className="flex flex-wrap gap-1.5">
          {WORK_MODES.map(v => {
            const on = workMode.includes(v);
            return (
              <button key={v} type="button" onClick={() => toggle(workMode, setWorkMode, v)} aria-pressed={on} className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}>
                {WORK_MODE_LABELS[v]} <span className="opacity-55">{facets.wm[v] ?? 0}</span>
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
                <button key={v} type="button" onClick={() => toggle(skills, setSkills, v)} aria-pressed={on} className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}>
                  {v} <span className="opacity-55">{facets.sk[v] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const quickChipActive = (id: string) => {
    if (id === 'all') return !hasFilters && sort === 'recommended';
    if (id === 'remote') return workMode.includes('remote');
    if (id === 'newest') return sort === 'newest';
    return employment.includes(id);
  };
  const quickChipClick = (id: string) => {
    if (id === 'all') { clearAll(); return; }
    if (id === 'remote') { toggle(workMode, setWorkMode, 'remote'); return; }
    if (id === 'newest') { setSort(sort === 'newest' ? 'recommended' : 'newest'); return; }
    toggle(employment, setEmployment, id);
  };
  const quickChips: Array<{ id: string; label: string }> = [
    { id: 'all', label: '◈ All' },
    ...EMPLOYMENT_TYPES.slice(0, 3).map(v => ({ id: v, label: EMPLOYMENT_TYPE_LABELS[v] })),
    { id: 'remote', label: 'Remote' },
    { id: 'newest', label: '✦ Recently posted' },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-white">
      <style>{`
        @keyframes cardIn { from { opacity:0; transform:translateY(20px) scale(0.96); } to { opacity:1; transform:translateY(0) scale(1); } }
        .jc-anim { animation: cardIn 0.42s cubic-bezier(0.22,1,0.36,1) both; }
        .no-sb::-webkit-scrollbar { display:none; }
        .no-sb { scrollbar-width:none; }
        .chip-strip-fade-right { mask-image: linear-gradient(to right, black 85%, transparent 100%); -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%); }
        .job-chip-strip { overflow-x:auto; overflow-y:hidden; touch-action:pan-x; overscroll-behavior-x:contain; -webkit-overflow-scrolling:touch; scroll-behavior:auto; }
        @media (prefers-reduced-motion: reduce) { .job-chip-strip button { transition:none !important; } .jc-anim { animation:none !important; } }
      `}</style>

      {/* ══ Sticky header ══ */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06]" style={{ height: HEADER_H, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px) saturate(180%)' }}>
        <div className="h-full px-3 sm:px-5 lg:px-8 flex items-center gap-3">
          <button type="button" onClick={() => router.back()} aria-label="Go back" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white hover:bg-white/[0.08] transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="hidden sm:flex items-baseline gap-2 shrink-0">
            <h1 className="text-[15px] font-bold tracking-[-0.01em] text-white">Jobs</h1>
            {state === 'ready' && <span className="text-[12px] font-medium text-white/28">{all.length.toLocaleString()}</span>}
          </div>

          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search jobs, companies or skills…" aria-label="Search jobs"
              className="h-9 w-full rounded-[11px] text-white pl-9 pr-9 text-[13px] transition-all focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.09)' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.20)'; e.target.style.background = 'rgba(255,255,255,0.07)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.background = 'rgba(255,255,255,0.055)'; }} />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/28 hover:text-white/55 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {state === 'ready' && (
            <div className="hidden lg:flex items-center gap-4 shrink-0 text-[11.5px] text-white/28">
              <span className="flex items-center gap-1.5 font-medium"><Briefcase className="h-3 w-3" /><span className="font-semibold text-white/45">{all.length.toLocaleString()}</span> jobs</span>
              <span className="flex items-center gap-1.5"><Building2 className="h-3 w-3" /><span className="font-semibold text-white/45">{companyCount}</span> companies</span>
              <span className="flex items-center gap-1.5"><LayoutGrid className="h-3 w-3" /><span className="font-semibold text-white/45">{openCount}</span> open</span>
            </div>
          )}

          <Link href={POST_HREF} className="hidden sm:inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-white/[0.10] bg-white/[0.06] px-3 text-[12.5px] font-semibold text-white/70 hover:bg-white/[0.10] hover:text-white transition-all">
            <Plus className="h-3.5 w-3.5" /> Post
          </Link>

          <button type="button" onClick={() => setSheetOpen(true)} aria-label="Filters and sort"
            className={`lg:hidden flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[12.5px] font-semibold shrink-0 transition-all ${activeChips.length > 0 ? 'bg-white text-[#0A0A0C]' : 'border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white/72'}`}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {activeChips.length > 0 && <span className="text-[10.5px] font-bold">{activeChips.length}</span>}
          </button>
        </div>
      </header>

      {/* ══ Quick-filter chip strip ══ */}
      <div className="sticky z-20 border-b border-white/[0.05]" style={{ top: HEADER_H, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px)' }}>
        <div className="job-chip-strip px-3 sm:px-5 lg:px-8 py-2.5 flex items-center gap-1.5 overflow-x-auto no-sb chip-strip-fade-right">
          {quickChips.map(chip => {
            const on = quickChipActive(chip.id);
            return (
              <button key={chip.id} type="button" onClick={() => quickChipClick(chip.id)} aria-pressed={on}
                className="shrink-0 h-[30px] px-3.5 rounded-full text-[11.5px] font-semibold transition-colors duration-150 whitespace-nowrap"
                style={on ? { background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', color: '#ffffff' } : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.40)' }}>
                {chip.label}
              </button>
            );
          })}
          {activeChips.map(chip => (
            <button key={`active-${chip.label}`} type="button" onClick={chip.clear} aria-label={`Remove filter: ${chip.label}`}
              className="shrink-0 inline-flex items-center gap-1 h-[30px] px-3.5 rounded-full text-[11.5px] font-semibold transition-colors whitespace-nowrap"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}>
              {chip.label} <X className="h-2.5 w-2.5" />
            </button>
          ))}
          {activeChips.length > 1 && (
            <button type="button" onClick={clearAll} className="shrink-0 h-[30px] px-3 rounded-full text-[11px] text-white/26 hover:text-white/52 transition-colors whitespace-nowrap">Clear all</button>
          )}
        </div>
      </div>

      {/* ══ Body ══ */}
      <div className="flex">
        <aside className="hidden lg:flex shrink-0 w-[248px] xl:w-[264px] flex-col border-r border-white/[0.05]">
          <div className="sticky overflow-y-auto px-5 py-6 no-sb" style={{ top: HEADER_H + 47, height: `calc(100vh - ${HEADER_H + 47}px)` }}>
            {FilterPanel}
          </div>
        </aside>

        <main className="flex-1 min-w-0 px-3 sm:px-4 lg:px-6 xl:px-8 pt-5 pb-12">
          {state === 'ready' && all.length > 0 && (
            <div className="sm:hidden flex items-center gap-3.5 mb-4 text-[11.5px] text-white/28">
              <span className="flex items-center gap-1.5"><Briefcase className="h-3 w-3" /><span className="font-semibold text-white/48">{all.length.toLocaleString()}</span> jobs</span>
              <span className="flex items-center gap-1.5"><Building2 className="h-3 w-3" /><span className="font-semibold text-white/48">{companyCount}</span> companies</span>
              <span className="flex items-center gap-1.5"><LayoutGrid className="h-3 w-3" /><span className="font-semibold text-white/48">{openCount}</span> open</span>
            </div>
          )}

          {state === 'loading' && <div className={GRID}>{Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}</div>}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-36 text-center">
              <div className={EMPTY_ICON_BOX}><Briefcase className="h-9 w-9 text-white/15" /></div>
              <p className="text-[17px] font-bold text-white/42 mb-2">Couldn&apos;t load jobs</p>
              <p className="text-[13.5px] text-white/22 mb-7 max-w-xs leading-relaxed">Something went wrong while fetching results. Try again in a moment.</p>
              <button type="button" onClick={() => load()} className={EMPTY_BTN}>Try again</button>
            </div>
          )}

          {state === 'ready' && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-36 text-center">
              <div className={EMPTY_ICON_BOX}><Briefcase className="h-9 w-9 text-white/15" /></div>
              <p className="text-[17px] font-bold text-white/42 mb-2">{hasFilters ? 'No jobs match your filters' : 'No jobs found'}</p>
              <p className="text-[13.5px] text-white/22 mb-7 max-w-xs leading-relaxed">
                {hasFilters ? 'Try removing a filter or searching for something broader.' : all.length === 0 ? 'No roles have been posted yet. Check back soon.' : 'Nothing to show right now.'}
              </p>
              {hasFilters
                ? <button type="button" onClick={clearAll} className={EMPTY_BTN}>Clear all filters</button>
                : <Link href={POST_HREF} className={EMPTY_BTN}>Post a job</Link>}
            </div>
          )}

          {state === 'ready' && items.length > 0 && (
            <>
              <div className={GRID}>
                {items.map((j, i) => (
                  <div key={j.id} className="jc-anim" style={{ animationDelay: `${Math.min(i, 11) * 0.04}s` }}>
                    <JobSummaryCard job={j} />
                  </div>
                ))}
              </div>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 pb-2 border-t border-white/[0.06]">
                <p className="text-[12px] text-white/28">
                  Showing <span className="text-white/52 font-semibold">{items.length.toLocaleString()}</span> of{' '}
                  <span className="text-white/52 font-semibold">{all.length.toLocaleString()}</span> {all.length === 1 ? 'job' : 'jobs'}
                </p>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Mobile "post" affordance */}
      <Link href={POST_HREF} aria-label="Post a job"
        className="sm:hidden fixed right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
        style={{ bottom: 'calc(96px + env(safe-area-inset-bottom))', background: 'linear-gradient(135deg,#8b5cf6,#7c3aed)' }}>
        <Plus className="h-5 w-5" />
      </Link>

      {/* ══ Mobile filter bottom-sheet ══ */}
      {sheetOpen && (
        <>
          <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm" onClick={() => setSheetOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[90] max-h-[90dvh] flex flex-col rounded-t-[24px] border-t border-white/[0.09] shadow-[0_-32px_80px_rgba(0,0,0,0.90)] lg:hidden" style={{ background: '#0f0f12' }}>
            <div className="shrink-0 px-5 pt-3.5 pb-4 border-b border-white/[0.07]">
              <div className="mx-auto mb-3.5 h-[3px] w-10 rounded-full bg-white/[0.14]" />
              <div className="flex items-center justify-between">
                <p className="text-[14.5px] font-bold text-white tracking-[-0.01em]">Filters &amp; Sort</p>
                <div className="flex items-center gap-3">
                  {activeChips.length > 0 && <button type="button" onClick={clearAll} className="text-[12px] font-semibold text-white/35 hover:text-white/62 transition-colors">Clear all</button>}
                  <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close filters" className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/[0.09] bg-white/[0.05] text-white/42 hover:text-white/70 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 no-sb">{FilterPanel}</div>
            <div className="shrink-0 px-5 py-4 border-t border-white/[0.07]" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setSheetOpen(false)} className="w-full h-12 rounded-[14px] font-bold text-[14.5px] tracking-[-0.01em] transition-all" style={{ background: '#ffffff', color: '#0A0A0C', boxShadow: '0 4px 20px rgba(255,255,255,0.15)' }}>
                Show {items.length.toLocaleString()} {items.length === 1 ? 'job' : 'jobs'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
