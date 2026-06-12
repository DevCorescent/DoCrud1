'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, BadgeCheck, Briefcase, Building2, ChevronDown,
  Globe, MapPin, Plus, Search, SlidersHorizontal, Star, TrendingUp,
  Users, X, Zap, BarChart2, Layers, BookOpen,
} from 'lucide-react';

interface BizPage {
  id: string; slug: string; name: string; tagline?: string; industry: string;
  companySize?: string; city?: string; country?: string; logoUrl?: string;
  coverUrl?: string; followerCount: number; postCount: number; jobCount: number;
  verified: boolean; createdAt: string;
}

/* ─── industry config ─────────────────────────────────────────────── */
const INDUSTRIES = [
  { value: '',              label: 'All Industries',        icon: Layers },
  { value: 'technology',   label: 'Technology',            icon: Zap },
  { value: 'finance',      label: 'Finance & Banking',     icon: BarChart2 },
  { value: 'healthcare',   label: 'Healthcare',            icon: Star },
  { value: 'legal',        label: 'Legal & Compliance',    icon: BookOpen },
  { value: 'education',    label: 'Education',             icon: BookOpen },
  { value: 'manufacturing',label: 'Manufacturing',         icon: Building2 },
  { value: 'retail',       label: 'Retail & E-commerce',   icon: Globe },
  { value: 'real_estate',  label: 'Real Estate',           icon: MapPin },
  { value: 'media',        label: 'Media & Entertainment', icon: Globe },
  { value: 'logistics',    label: 'Logistics',             icon: Globe },
  { value: 'hospitality',  label: 'Hospitality & Travel',  icon: Globe },
  { value: 'consulting',   label: 'Consulting',            icon: Users },
  { value: 'ngo',          label: 'NGO / Non-profit',      icon: Users },
  { value: 'government',   label: 'Government',            icon: Building2 },
  { value: 'other',        label: 'Other',                 icon: Building2 },
];

const COMPANY_SIZES = [
  { value: '',        label: 'Any Size' },
  { value: '1-10',    label: '1–10' },
  { value: '11-50',   label: '11–50' },
  { value: '51-200',  label: '51–200' },
  { value: '201-500', label: '201–500' },
  { value: '501-1000',label: '501–1k' },
  { value: '1001+',   label: '1k+' },
];

const SORT_OPTIONS = [
  { value: 'newest',    label: 'Newest' },
  { value: 'followers', label: 'Most Followed' },
  { value: 'name',      label: 'Name A–Z' },
];

/* ─── industry colour map ─────────────────────────────────────────── */
const IND_COLOR: Record<string, string> = {
  technology:    'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  finance:       'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  healthcare:    'bg-pink-500/10 text-pink-400 border-pink-500/20',
  legal:         'bg-amber-500/10 text-amber-400 border-amber-500/20',
  education:     'bg-blue-500/10 text-blue-400 border-blue-500/20',
  manufacturing: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  retail:        'bg-purple-500/10 text-purple-400 border-purple-500/20',
  real_estate:   'bg-teal-500/10 text-teal-400 border-teal-500/20',
  media:         'bg-red-500/10 text-red-400 border-red-500/20',
  consulting:    'bg-violet-500/10 text-violet-400 border-violet-500/20',
  logistics:     'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  hospitality:   'bg-rose-500/10 text-rose-400 border-rose-500/20',
  ngo:           'bg-lime-500/10 text-lime-400 border-lime-500/20',
  government:    'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

function indColor(industry: string) {
  return IND_COLOR[industry] ?? 'bg-white/[0.07] text-white/50 border-white/[0.10]';
}

function indLabel(industry: string) {
  return INDUSTRIES.find(i => i.value === industry)?.label ?? industry;
}

/* ─── right sidebar panel ─────────────────────────────────────────── */
function BusinessInsightsPanel({
  pages,
  total,
  onIndustryClick,
}: {
  pages: BizPage[];
  total: number;
  onIndustryClick: (ind: string) => void;
}) {
  /* top companies by followers */
  const topByFollowers = useMemo(
    () => [...pages].sort((a, b) => b.followerCount - a.followerCount).slice(0, 5),
    [pages]
  );

  /* most jobs */
  const topByJobs = useMemo(
    () => [...pages].filter(p => p.jobCount > 0).sort((a, b) => b.jobCount - a.jobCount).slice(0, 4),
    [pages]
  );

  /* industry distribution */
  const indDist = useMemo(() => {
    const counts: Record<string, number> = {};
    pages.forEach(p => { counts[p.industry] = (counts[p.industry] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [pages]);

  /* verified count */
  const verifiedCount = pages.filter(p => p.verified).length;

  /* newest */
  const newest = useMemo(
    () => [...pages].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 4),
    [pages]
  );

  function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60_000)       return 'Just now';
    if (diff < 3_600_000)    return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000)   return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 7*86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  return (
    <div className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="p-4 space-y-7 pb-20">

        {/* ── Directory stats ── */}
        {total > 0 && (
          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-3">Directory</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Companies', value: total.toLocaleString() },
                { label: 'Verified', value: verifiedCount.toString() },
                { label: 'Open Jobs', value: pages.reduce((a, p) => a + p.jobCount, 0).toLocaleString() },
                { label: 'Industries', value: indDist.length.toString() },
              ].map(s => (
                <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                  <p className="text-[16px] font-bold text-white/80 tabular-nums leading-none">{s.value}</p>
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/25 mt-1">{s.label}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Top Companies ── */}
        {topByFollowers.length > 0 && (
          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-3">Top Companies</p>
            <div className="space-y-3.5">
              {topByFollowers.map((p, i) => (
                <Link key={p.id} href={`/businesses/${p.slug}`} className="group flex items-center gap-2.5">
                  <span className="text-[11px] font-bold text-white/20 tabular-nums w-4 shrink-0">{i + 1}</span>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-[12px] font-bold text-white/60">
                    {p.logoUrl
                      ? <img src={p.logoUrl} alt={p.name} className="h-full w-full rounded-lg object-cover" />
                      : p.name.charAt(0).toUpperCase()
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="text-[12px] font-semibold text-white/65 leading-snug truncate group-hover:text-white transition-colors">{p.name}</p>
                      {p.verified && <BadgeCheck className="h-3 w-3 text-indigo-400/70 shrink-0" />}
                    </div>
                    <p className="text-[10.5px] text-white/25 mt-0.5 tabular-nums">
                      {p.followerCount.toLocaleString()} followers
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Hiring Now ── */}
        {topByJobs.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Hiring Now</p>
              <Briefcase className="h-3 w-3 text-white/20" />
            </div>
            <div className="space-y-3">
              {topByJobs.map(p => (
                <Link key={p.id} href={`/businesses/${p.slug}`} className="group flex items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-[11px] font-bold text-white/50">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] font-semibold text-white/60 truncate group-hover:text-white/90 transition-colors">{p.name}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[9.5px] font-bold text-blue-400">
                    {p.jobCount} open
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── Industry breakdown ── */}
        {indDist.length > 0 && (
          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-3">Industries</p>
            <div className="space-y-1">
              {indDist.map(([ind, count]) => {
                const maxCount = Math.max(...indDist.map(([, c]) => c), 1);
                const IndIcon = INDUSTRIES.find(i => i.value === ind)?.icon ?? Building2;
                return (
                  <button
                    key={ind}
                    type="button"
                    onClick={() => onIndustryClick(ind)}
                    className="group w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-white/[0.04] transition"
                  >
                    <IndIcon className="h-3.5 w-3.5 text-white/25 shrink-0" />
                    <span className="text-[12px] font-medium text-white/50 group-hover:text-white/80 transition flex-1 capitalize truncate">
                      {indLabel(ind)}
                    </span>
                    <div className="w-14 h-1 rounded-full bg-white/[0.05] overflow-hidden shrink-0">
                      <div className="h-full rounded-full bg-white/20" style={{ width: `${(count / maxCount) * 100}%` }} />
                    </div>
                    <span className="text-[10.5px] font-semibold text-white/25 tabular-nums shrink-0 min-w-[20px] text-right">{count}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Recently Joined ── */}
        {newest.length > 0 && (
          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-3">Recently Joined</p>
            <div className="space-y-3">
              {newest.map(p => (
                <Link key={p.id} href={`/businesses/${p.slug}`} className="group flex items-start gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-[10px] font-bold text-white/50 mt-0.5">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] font-semibold text-white/60 truncate group-hover:text-white/90 transition-colors">{p.name}</p>
                    <p className="text-[10px] text-white/25 mt-0.5 capitalize">{indLabel(p.industry)} · {timeAgo(p.createdAt)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

/* ─── business card — feed style (matches PublishedPage card) ──────── */
function BusinessCard({ page }: { page: BizPage }) {
  const indCls = indColor(page.industry);
  const initials = page.name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');

  return (
    <Link href={`/businesses/${page.slug}`} className="group block">
      <article className="py-5">
        {/* header */}
        <div className="flex items-center gap-3 mb-3.5">
          {/* logo */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.06] text-[11px] font-bold text-white/60 overflow-hidden">
            {page.logoUrl
              ? <img src={page.logoUrl} alt={page.name} className="h-full w-full object-cover" />
              : initials || <Building2 className="h-4 w-4 opacity-50" />
            }
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-semibold text-white leading-tight truncate">{page.name}</span>
              {page.verified && <BadgeCheck className="h-3.5 w-3.5 text-indigo-400 shrink-0" />}
            </div>
            <p className="text-[11px] text-white/35 mt-0.5 truncate">
              {indLabel(page.industry)}
              {page.city ? ` · ${page.city}` : ''}
              {page.companySize ? ` · ${page.companySize} employees` : ''}
            </p>
          </div>
          {/* industry badge */}
          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${indCls}`}>
            {indLabel(page.industry)}
          </span>
        </div>

        {/* cover — only if available */}
        {page.coverUrl && (
          <div className="mb-3.5 -mx-4 sm:mx-0 sm:rounded-xl overflow-hidden h-32">
            <img src={page.coverUrl} alt={page.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.01]" />
          </div>
        )}

        {/* tagline */}
        {page.tagline && (
          <p className="text-[13.5px] font-semibold leading-snug tracking-tight text-white line-clamp-2 mb-2 group-hover:text-white/85 transition-colors">
            {page.tagline}
          </p>
        )}

        {/* location */}
        {(page.city || page.country) && (
          <div className="flex items-center gap-1.5 text-[12px] text-white/35 mb-3">
            <MapPin className="h-3 w-3 shrink-0" />
            {[page.city, page.country].filter(Boolean).join(', ')}
          </div>
        )}

        {/* stats row */}
        <div className="flex items-center gap-5 mt-3 pt-3.5 border-t border-white/[0.05]">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[13.5px] font-bold text-white/80 tabular-nums">{page.followerCount.toLocaleString()}</span>
            <span className="text-[9.5px] font-semibold uppercase tracking-widest text-white/25">followers</span>
          </div>
          {page.postCount > 0 && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[13.5px] font-bold text-white/80 tabular-nums">{page.postCount}</span>
              <span className="text-[9.5px] font-semibold uppercase tracking-widest text-white/25">posts</span>
            </div>
          )}
          {page.jobCount > 0 && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[13.5px] font-bold text-blue-400 tabular-nums">{page.jobCount}</span>
              <span className="text-[9.5px] font-semibold uppercase tracking-widest text-white/25">open jobs</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {page.jobCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-[10.5px] font-semibold text-blue-400">
                <Briefcase className="h-3 w-3" /> Hiring
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-white/30 opacity-0 group-hover:opacity-100 transition">
              View <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

/* ─── skeleton ────────────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <article className="py-5">
      <div className="flex items-center gap-3 mb-3.5">
        <div className="h-10 w-10 rounded-full bg-white/[0.05] animate-pulse shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-36 rounded-full bg-white/[0.05] animate-pulse" />
          <div className="h-2.5 w-24 rounded-full bg-white/[0.03] animate-pulse" />
        </div>
        <div className="h-5 w-20 rounded-full bg-white/[0.04] animate-pulse" />
      </div>
      <div className="h-4 w-3/4 rounded-full bg-white/[0.04] animate-pulse mb-2" />
      <div className="h-3 w-1/2 rounded-full bg-white/[0.03] animate-pulse" />
      <div className="flex gap-5 mt-3 pt-3.5 border-t border-white/[0.04]">
        <div className="h-3 w-20 rounded-full bg-white/[0.04] animate-pulse" />
        <div className="h-3 w-16 rounded-full bg-white/[0.03] animate-pulse" />
      </div>
    </article>
  );
}

/* ─── main component ──────────────────────────────────────────────── */
export default function BusinessDirectory() {
  const [pages, setPages]           = useState<BizPage[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [industry, setIndustry]     = useState('');
  const [companySize, setCompanySize] = useState('');
  const [verified, setVerified]     = useState(false);
  const [sortBy, setSortBy]         = useState('newest');
  const [offset, setOffset]         = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const searchTimer                 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef                   = useRef<HTMLInputElement>(null);
  const loadMoreRef                 = useRef<HTMLDivElement>(null);
  const LIMIT = 50;

  const fetchPages = useCallback(async (opts: {
    search: string; industry: string; companySize: string;
    verified: boolean; sortBy: string; offset: number;
  }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (opts.search)      params.set('search', opts.search);
      if (opts.industry)    params.set('industry', opts.industry);
      if (opts.companySize) params.set('companySize', opts.companySize);
      if (opts.verified)    params.set('verified', 'true');
      params.set('sortBy', opts.sortBy);
      params.set('limit', String(LIMIT));
      params.set('offset', String(opts.offset));
      const res  = await fetch(`/api/business-pages?${params}`);
      const data = await res.json() as { pages: BizPage[]; total: number };
      if (opts.offset === 0) setPages(data.pages || []);
      else setPages(prev => [...prev, ...(data.pages || [])]);
      setTotal(data.total || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setOffset(0);
      setVisibleCount(20);
      void fetchPages({ search, industry, companySize, verified, sortBy, offset: 0 });
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, industry, companySize, verified, sortBy, fetchPages]);

  /* infinite scroll */
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleCount(c => c + 10); },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [pages]);

  /* ⌘K focus */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const activeFilters = [industry, companySize, verified ? 'v' : ''].filter(Boolean).length;

  function clearFilters() {
    setIndustry(''); setCompanySize(''); setVerified(false);
  }

  const visiblePages = pages.slice(0, visibleCount);
  const isSearching  = search.trim().length > 0;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#0A0A0C] text-white">

      {/* ── ambient glows ── */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <div className="absolute left-1/3 top-1/4 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/[0.05] blur-[160px]" />
        <div className="absolute right-0 bottom-0 h-[400px] w-[400px] rounded-full bg-violet-500/[0.04] blur-[130px]" />
      </div>

      {/* ══════════════════════════════════════
          LEFT SIDEBAR
      ══════════════════════════════════════ */}
      <aside className="hidden lg:flex w-56 xl:w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#0A0A0C]">

        {/* logo / title area */}
        <div className="px-4 py-5 border-b border-white/[0.05]">
          <Link href="/" className="inline-flex items-center gap-2 text-xs font-medium text-white/40 transition hover:text-white/70">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to app
          </Link>
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/25">Docrud</p>
            <h1 className="mt-0.5 text-lg font-bold tracking-tight text-white">Businesses</h1>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] text-white/35 tabular-nums">{total > 0 ? `${total.toLocaleString()} companies` : 'Directory'}</span>
          </div>
        </div>

        {/* industry nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {INDUSTRIES.map(ind => {
            const isActive = industry === ind.value;
            const colorCls = ind.value ? indColor(ind.value) : 'bg-white/10 text-white/70 border-white/10';
            return (
              <button
                key={ind.value}
                type="button"
                onClick={() => { setIndustry(ind.value); setVisibleCount(20); }}
                className={`group w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] font-medium transition-all ${
                  isActive
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-white/40 hover:bg-white/[0.04] hover:text-white/80'
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  isActive ? colorCls : 'border-white/[0.06] bg-transparent text-white/30 group-hover:border-white/[0.10] group-hover:text-white/50'
                }`}>
                  <ind.icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 text-left truncate">{ind.label}</span>
              </button>
            );
          })}
        </nav>

        {/* bottom CTA */}
        <div className="p-3 border-t border-white/[0.05] space-y-2">
          <Link
            href="/businesses/create"
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 py-2.5 text-[11.5px] font-semibold text-white/55 transition hover:border-white/[0.18] hover:bg-white/[0.09] hover:text-white/85 active:scale-[0.98]"
          >
            <Plus className="h-3.5 w-3.5 transition-transform group-hover:rotate-90 duration-200" />
            Create Business Page
          </Link>
        </div>
      </aside>

      {/* ══════════════════════════════════════
          MAIN CONTENT + RIGHT PANEL
      ══════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden min-w-0">
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">

          {/* ── Desktop top bar ── */}
          <header className="hidden lg:flex shrink-0 items-center gap-4 border-b border-white/[0.06] bg-[#0A0A0C]/80 px-5 py-3 backdrop-blur-xl">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-lg border ${industry ? indColor(industry) : 'border-white/[0.10] bg-white/[0.06] text-white/40'}`}>
                <Building2 className="h-3 w-3" />
              </span>
              <h2 className="text-sm font-semibold text-white truncate">
                {industry ? indLabel(industry) : 'All Companies'}
              </h2>
            </div>

            {/* search */}
            <div className="relative w-72 xl:w-96">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search companies… (⌘K)"
                className="h-9 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-9 pr-8 text-sm text-white placeholder:text-white/20 outline-none transition focus:border-white/[0.18] focus:bg-white/[0.06]"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <Link
              href="/businesses/create"
              className="group inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.05] px-3.5 py-2 text-[12px] font-semibold text-white/55 transition hover:border-white/[0.18] hover:bg-white/[0.09] hover:text-white/85 active:scale-[0.97]"
            >
              <Plus className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-90" />
              Create Page
            </Link>

            {/* sort */}
            <div className="relative shrink-0">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="h-9 appearance-none pl-3 pr-8 rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs font-medium text-white/50 outline-none cursor-pointer hover:bg-white/[0.08] hover:text-white transition"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ background: '#111116' }}>{o.label}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
            </div>

            {/* filter toggle */}
            <button
              type="button"
              onClick={() => setFiltersOpen(o => !o)}
              className={`relative inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition ${
                filtersOpen || activeFilters > 0
                  ? 'border-white/[0.18] bg-white/[0.08] text-white'
                  : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeFilters > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white text-[8px] font-bold text-slate-950 px-1">{activeFilters}</span>
              )}
            </button>
          </header>

          {/* ── Mobile header ── */}
          <header className="lg:hidden shrink-0 border-b border-white/[0.06] bg-[#0A0A0C]/90 backdrop-blur-xl">
            <div className="flex items-center gap-3 px-4 py-3">
              <Link href="/" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/55">
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search companies…"
                  className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] pl-9 pr-9 text-[13px] text-white placeholder:text-white/25 outline-none transition focus:border-white/[0.18]"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Link href="/businesses/create" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.05] text-white/50">
                <Plus className="h-4 w-4" />
              </Link>
            </div>

            {/* mobile industry chips + verified quick-filter */}
            {!isSearching && (
              <div className="overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex min-w-max gap-2">
                  {/* Verified quick-filter pill */}
                  <button
                    type="button"
                    onClick={() => setVerified(v => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition border ${
                      verified
                        ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.25)]'
                        : 'border-white/[0.07] bg-white/[0.03] text-white/38 hover:text-white/65 hover:border-white/[0.12]'
                    }`}
                  >
                    <BadgeCheck className="h-3 w-3" />
                    Verified
                  </button>
                  {INDUSTRIES.slice(0, 8).map(ind => {
                    const isActive = industry === ind.value;
                    return (
                      <button
                        key={ind.value}
                        type="button"
                        onClick={() => setIndustry(ind.value)}
                        className={`inline-flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition border ${
                          isActive
                            ? 'border-white/[0.18] bg-white/[0.09] text-white/80'
                            : 'border-white/[0.07] bg-white/[0.03] text-white/38 hover:text-white/65 hover:border-white/[0.12]'
                        }`}
                      >
                        <ind.icon className="h-3 w-3" />
                        {ind.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </header>

          {/* ── Expanded filter panel ── */}
          <div
            className="shrink-0 overflow-hidden"
            style={{ display: 'grid', gridTemplateRows: filtersOpen ? '1fr' : '0fr', transition: 'grid-template-rows 0.3s cubic-bezier(0.22,1,0.36,1)' }}
          >
            <div className="overflow-hidden">
              <div className="border-b border-white/[0.06] bg-[#0b0c0f] px-4 lg:px-5 py-3 space-y-2">

                {/* Company Size */}
                <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
                  <span className="shrink-0 w-10 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Size</span>
                  {COMPANY_SIZES.map(s => (
                    <button key={s.value} type="button" onClick={() => setCompanySize(s.value)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${companySize === s.value ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{s.label}</button>
                  ))}
                </div>

                {/* Sort + Verified */}
                <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
                  <span className="shrink-0 w-10 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Sort</span>
                  {SORT_OPTIONS.map(o => (
                    <button key={o.value} type="button" onClick={() => setSortBy(o.value)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${sortBy === o.value ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{o.label}</button>
                  ))}
                  <div className="h-3.5 w-px shrink-0 bg-white/[0.07]" />
                  <button type="button" onClick={() => setVerified(v => !v)}
                    className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${verified ? 'bg-indigo-500/[0.12] border-indigo-400/[0.25] text-indigo-300/80' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                  >
                    <BadgeCheck className="h-3 w-3" />Verified only
                  </button>
                </div>

                {/* clear */}
                {activeFilters > 0 && (
                  <div className="flex items-center justify-between border-t border-white/[0.04] pt-2">
                    <span className="text-[10px] text-white/25">{activeFilters} filter{activeFilters > 1 ? 's' : ''} active</span>
                    <button type="button" onClick={clearFilters}
                      className="flex items-center gap-1 rounded-full border border-rose-500/[0.20] bg-rose-500/[0.08] px-3 py-1 text-[10.5px] font-semibold text-rose-300/70 transition hover:bg-rose-500/[0.14]"
                    >
                      <X className="h-3 w-3" />Clear filters
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Active filter chips ── */}
          {activeFilters > 0 && !isSearching && (
            <div className="shrink-0 border-b border-white/[0.04] bg-[#0A0A0C] px-4 lg:px-5 py-2 overflow-x-auto [scrollbar-width:none]">
              <div className="flex items-center gap-1.5 min-w-max">
                <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.18em] text-white/20 pr-1">Active</span>
                {industry && (
                  <button type="button" onClick={() => setIndustry('')}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-white/[0.10] bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-medium text-white/55 transition hover:bg-white/[0.09] hover:text-white/80"
                  >
                    {indLabel(industry)} <X className="h-2.5 w-2.5 text-white/30" />
                  </button>
                )}
                {companySize && (
                  <button type="button" onClick={() => setCompanySize('')}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-white/[0.10] bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-medium text-white/55 transition hover:bg-white/[0.09] hover:text-white/80"
                  >
                    {companySize} employees <X className="h-2.5 w-2.5 text-white/30" />
                  </button>
                )}
                {verified && (
                  <button type="button" onClick={() => setVerified(false)}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-white/[0.10] bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-medium text-white/55 transition hover:bg-white/[0.09] hover:text-white/80"
                  >
                    Verified <X className="h-2.5 w-2.5 text-white/30" />
                  </button>
                )}
                <button type="button" onClick={clearFilters}
                  className="shrink-0 ml-1 flex items-center gap-0.5 rounded-full border border-rose-500/[0.15] bg-rose-500/[0.07] px-2.5 py-0.5 text-[9.5px] font-semibold text-rose-300/60 transition hover:bg-rose-500/[0.12]"
                >
                  <X className="h-2.5 w-2.5" />Clear all
                </button>
              </div>
            </div>
          )}

          {/* ── Scrollable content ── */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <div className="p-4 lg:py-6 lg:px-8 pb-24 lg:pb-10 max-w-3xl mx-auto w-full">

              {loading && pages.length === 0 ? (
                <div className="divide-y divide-white/[0.05]">
                  {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : pages.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-20 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.04]">
                    <Building2 className="h-7 w-7 text-white/20" />
                  </div>
                  <p className="text-[15px] font-semibold text-white/60">No companies found</p>
                  <p className="text-[13px] text-white/30 max-w-xs">
                    {isSearching ? `No results for "${search}"` : 'Try adjusting your filters or be the first to create a business page.'}
                  </p>
                  <Link
                    href="/businesses/create"
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.10] bg-white/[0.05] px-5 py-2.5 text-[12.5px] font-semibold text-white/60 transition hover:bg-white/[0.09] hover:text-white/85"
                  >
                    <Plus className="h-3.5 w-3.5" /> Create First Page
                  </Link>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-white/[0.05]">
                    {visiblePages.map(page => <BusinessCard key={page.id} page={page} />)}
                  </div>

                  {/* load more sentinel */}
                  {visibleCount < pages.length && (
                    <div ref={loadMoreRef} className="flex flex-col items-center gap-3 pt-4 pb-2">
                      <button
                        type="button"
                        onClick={() => setVisibleCount(c => c + 10)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.09] bg-white/[0.04] px-6 py-2.5 text-[12.5px] font-semibold text-white/55 transition-all hover:bg-white/[0.08] hover:text-white hover:border-white/[0.16] active:scale-[0.97]"
                      >
                        Load more
                        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                      </button>
                      <p className="text-[10.5px] text-white/20">
                        Showing {Math.min(visibleCount, pages.length)} of {total}
                      </p>
                    </div>
                  )}

                  {visibleCount >= pages.length && pages.length > 6 && (
                    <div className="flex items-center gap-3 pt-4 pb-2">
                      <div className="flex-1 h-px bg-white/[0.05]" />
                      <p className="text-[10.5px] text-white/20 shrink-0">All {pages.length} companies loaded</p>
                      <div className="flex-1 h-px bg-white/[0.05]" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Right sidebar — Business Insights ── */}
        <aside className="hidden xl:flex w-72 2xl:w-80 shrink-0 flex-col border-l border-white/[0.06] bg-[#0A0A0C] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.05] shrink-0">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 text-indigo-400/60" />
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Directory Insights</span>
            </div>
          </div>
          <BusinessInsightsPanel
            pages={pages}
            total={total}
            onIndustryClick={ind => { setIndustry(ind); setVisibleCount(20); }}
          />
        </aside>
      </div>

      {/* ── Mobile bottom nav placeholder (matches app shell) ── */}
    </div>
  );
}
