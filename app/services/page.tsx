'use client';

/**
 * Service discovery — the cross-provider entry point.
 *
 * /services → /services/s/[serviceId] (detail) → /services/[userId] (catalogue)
 *
 * One request per query. Search, filters, sorting and paging are all resolved
 * server-side by /api/services/discover, so the page never fetches provider or
 * rating information per card.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Briefcase, LayoutGrid, Loader2, MapPin, Search, SlidersHorizontal, X, Zap,
} from 'lucide-react';
import { SERVICE_CATEGORIES, serviceCategory } from '@/lib/services-ui';
import { ServiceSummaryCard, type ServiceSummary } from '@/components/services/ServiceSummaryCard';

type Facets = { categories: Record<string, number>; subcategories?: Record<string, number>; pricing: Record<string, number>; tags?: Record<string, number>; skills?: Record<string, number>; providerType?: Record<string, number>; languages?: Record<string, number>; workMode?: Record<string, number>; availability?: Record<string, number> };
type ApiResponse = {
  services: ServiceSummary[];
  total: number;
  hasMore: boolean;
  page: number;
  facets: Facets;
  libraryTotal: number;
};

const PRICING_LABELS: Record<string, string> = {
  fixed: 'Fixed price',
  hourly: 'Hourly',
  starting_from: 'Starting from',
  contact: 'Custom quote',
};

const SORTS: Array<{ id: string; label: string }> = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'relevance', label: 'Most relevant' },
  { id: 'bookings', label: 'Most booked' },
  { id: 'rating', label: 'Highest rated' },
  { id: 'reviews', label: 'Most reviewed' },
  { id: 'newest', label: 'Recently added' },
  { id: 'price_asc', label: 'Price: low to high' },
  { id: 'price_desc', label: 'Price: high to low' },
  { id: 'delivery', label: 'Fastest delivery' },
];

const RATINGS = [4.5, 4, 3];

const WORK_MODES: Array<{ id: string; label: string }> = [
  { id: 'remote', label: 'Remote' },
  { id: 'onsite', label: 'On-site' },
  { id: 'hybrid', label: 'Hybrid' },
];
const AVAILABILITIES: Array<{ id: string; label: string }> = [
  { id: 'available', label: 'Available now' },
  { id: 'limited', label: 'Limited availability' },
  { id: 'unavailable', label: 'Not taking work' },
];

/* Delivery options, expressed in hours so mixed stored units compare. */
const DELIVERY_OPTIONS: Array<{ id: string; label: string; hours: number }> = [
  { id: '24', label: 'Within 24 hours', hours: 24 },
  { id: '72', label: 'Within 3 days', hours: 72 },
  { id: '168', label: 'Within a week', hours: 168 },
  { id: '720', label: 'Within a month', hours: 720 },
];

/* ─── Presentation tokens ────────────────────────────────────────────
   Lifted from app/people/page.tsx so the two directories share one
   sidebar/grid/empty-state language. People itself is untouched. */
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

/* ─── Skeleton card ──────────────────────────────────────────────────
   Mirrors the discovery card's two silhouettes so the grid does not
   reflow when results land. */
function SkeletonCard() {
  return (
    <>
      <div className="sm:hidden rounded-[20px] overflow-hidden border border-white/[0.07]" style={{ background: '#0d0d10' }}>
        <div className="h-[80px] animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="px-4 pb-4" style={{ marginTop: -26 }}>
          <div className="flex items-end gap-3">
            <div className="h-[58px] w-[58px] rounded-full animate-pulse shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="flex-1 pb-1 pt-[24px]">
              <div className="h-2.5 animate-pulse rounded-full w-1/2" style={{ background: 'rgba(255,255,255,0.05)' }} />
            </div>
            <div className="h-8 w-24 animate-pulse rounded-[10px] pb-1 mt-[24px] shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-3.5 animate-pulse rounded-full w-3/4" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="h-2.5 animate-pulse rounded-full w-1/2" style={{ background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div className="flex gap-1.5 mt-3">
            {[1, 2, 3].map(j => <div key={j} className="h-6 w-16 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
          </div>
          <div className="h-px mt-3.5 mb-3" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="flex gap-3">
            {[1, 2].map(j => <div key={j} className="h-2.5 w-16 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
          </div>
        </div>
      </div>

      <div className="hidden sm:block rounded-[20px] overflow-hidden border border-white/[0.07]" style={{ background: '#0d0d10' }}>
        <div className="h-[104px] animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="px-4 pb-4">
          <div className="flex items-end justify-between" style={{ marginTop: -30 }}>
            <div className="h-[64px] w-[64px] rounded-full animate-pulse shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="flex gap-1.5 pb-1">
              <div className="h-8 w-20 animate-pulse rounded-[10px]" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <div className="h-8 w-8 animate-pulse rounded-[10px]" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-2.5 animate-pulse rounded-full w-2/5" style={{ background: 'rgba(255,255,255,0.05)' }} />
            <div className="h-3.5 animate-pulse rounded-full w-3/5" style={{ background: 'rgba(255,255,255,0.07)' }} />
            <div className="h-2.5 animate-pulse rounded-full w-1/2" style={{ background: 'rgba(255,255,255,0.05)' }} />
          </div>
          <div className="flex gap-1.5 mt-3.5">
            {[1, 2, 3].map(j => <div key={j} className="h-6 w-16 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
          </div>
          <div className="h-px mt-4 mb-3.5" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="flex gap-3">
            {[1, 2].map(j => <div key={j} className="h-2.5 w-16 animate-pulse rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />)}
          </div>
        </div>
      </div>
    </>
  );
}

export default function ServicesDiscoveryPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [pricing, setPricing] = useState<string[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [maxDelivery, setMaxDelivery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [providerType, setProviderType] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [debouncedLocation, setDebouncedLocation] = useState('');
  const [workMode, setWorkMode] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState('recommended');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [items, setItems] = useState<ServiceSummary[]>([]);
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
    if (subcategories.length) p.set('subcategories', subcategories.join(','));
    if (pricing.length) p.set('pricing', pricing.join(','));
    if (minRating) p.set('minRating', String(minRating));
    if (maxDelivery) p.set('maxDelivery', maxDelivery);
    if (tags.length) p.set('tags', tags.join(','));
    if (skills.length) p.set('skills', skills.join(','));
    if (languages.length) p.set('languages', languages.join(','));
    if (providerType.length) p.set('providerType', providerType.join(','));
    if (debouncedLocation) p.set('location', debouncedLocation);
    if (workMode.length) p.set('workMode', workMode.join(','));
    if (availability.length) p.set('availability', availability.join(','));
    if (minPrice.trim()) p.set('minPrice', minPrice.trim());
    if (maxPrice.trim()) p.set('maxPrice', maxPrice.trim());
    p.set('sort', sort);
    return p;
  }, [debounced, categories, subcategories, pricing, minRating, maxDelivery, tags, skills, languages, providerType, debouncedLocation, workMode, availability, minPrice, maxPrice, sort]);

  /* Monotonic id: a slow earlier response can never overwrite a newer one. */
  const reqId = useRef(0);

  const fetchPage = useCallback(async (targetPage: number, append: boolean) => {
    const id = ++reqId.current;
    if (append) setLoadingMore(true); else setState('loading');
    try {
      const p = new URLSearchParams(params);
      p.set('page', String(targetPage));
      const res = await fetch(`/api/services/discover?${p.toString()}`);
      if (id !== reqId.current) return;      // superseded
      if (!res.ok) { setState('error'); return; }
      const json = (await res.json()) as ApiResponse;
      if (id !== reqId.current) return;
      setData(json);
      setItems(prev => (append ? [...prev, ...json.services] : json.services));
      setState('ready');
    } catch {
      if (id === reqId.current) setState('error');
    } finally {
      if (id === reqId.current) setLoadingMore(false);
    }
  }, [params]);

  useEffect(() => { setPage(1); void fetchPage(1, false); }, [fetchPage]);

  const clearAll = () => {
    setQuery(''); setCategories([]); setSubcategories([]); setPricing([]);
    setMinRating(0); setMaxDelivery(''); setTags([]); setSkills([]); setLanguages([]); setProviderType([]);
    setLocation(''); setWorkMode([]); setAvailability([]);
    setMinPrice(''); setMaxPrice(''); setSort('recommended');
  };

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const activeChips = [
    ...categories.map(c => ({ label: serviceCategory(c).label, clear: () => toggle(categories, setCategories, c) })),
    ...subcategories.map(sc => ({ label: sc, clear: () => toggle(subcategories, setSubcategories, sc) })),
    ...pricing.map(p => ({ label: PRICING_LABELS[p] ?? p, clear: () => toggle(pricing, setPricing, p) })),
    ...(minRating ? [{ label: `${minRating}+ rating`, clear: () => setMinRating(0) }] : []),
    ...(maxDelivery ? [{ label: DELIVERY_OPTIONS.find(d => d.id === maxDelivery)?.label ?? 'Delivery', clear: () => setMaxDelivery('') }] : []),
    ...tags.map(t => ({ label: t, clear: () => toggle(tags, setTags, t) })),
    ...skills.map(v => ({ label: v, clear: () => toggle(skills, setSkills, v) })),
    ...languages.map(v => ({ label: v, clear: () => toggle(languages, setLanguages, v) })),
    ...providerType.map(v => ({ label: v === 'business' ? 'Company / agency' : 'Individual', clear: () => toggle(providerType, setProviderType, v) })),
    ...(debouncedLocation ? [{ label: debouncedLocation, clear: () => setLocation('') }] : []),
    ...workMode.map(w => ({ label: WORK_MODES.find(x => x.id === w)?.label ?? w, clear: () => toggle(workMode, setWorkMode, w) })),
    ...availability.map(a => ({ label: AVAILABILITIES.find(x => x.id === a)?.label ?? a, clear: () => toggle(availability, setAvailability, a) })),
    ...(minPrice.trim() ? [{ label: `Min ${minPrice}`, clear: () => setMinPrice('') }] : []),
    ...(maxPrice.trim() ? [{ label: `Max ${maxPrice}`, clear: () => setMaxPrice('') }] : []),
  ];
  const hasFilters = activeChips.length > 0 || debounced.length > 0 || debouncedLocation.length > 0;

  const facetCats = data?.facets.categories ?? {};
  const facetSubs = data?.facets.subcategories ?? {};
  const subKeys = Array.from(new Set([...Object.keys(facetSubs), ...subcategories]))
    .sort((a, b) => (facetSubs[b] ?? 0) - (facetSubs[a] ?? 0));
  const facetTags = data?.facets.tags ?? {};
  const tagKeys = Array.from(new Set([...Object.keys(facetTags), ...tags]))
    .sort((a, b) => (facetTags[b] ?? 0) - (facetTags[a] ?? 0))
    .slice(0, 12);
  const facetPricing = data?.facets.pricing ?? {};
  /* Every category with results, plus any currently selected one so a
     selection never vanishes from the list. */
  const catKeys = Array.from(new Set([...Object.keys(facetCats), ...categories]))
    .sort((a, b) => (facetCats[b] ?? 0) - (facetCats[a] ?? 0));


  /* ── Filter panel ──────────────────────────────────────────────────
     Every existing filter, redrawn in the People page's sidebar language:
     uppercase micro-labels, 36px list rows, pill groups and hairline
     dividers. Sort moved here from the header select so that — exactly as
     on People — one panel serves the desktop sidebar and the mobile sheet. */
  const FilterPanel = (
    <div className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-white/35">Filters</span>
        {activeChips.length > 0 && (
          <button type="button" onClick={clearAll} className="text-[11px] font-semibold text-white/32 hover:text-white/58 transition-colors">
            Clear {activeChips.length}
          </button>
        )}
      </div>

      {/* Sort */}
      <div className="mb-6">
        <p className={LABEL}>Sort by</p>
        <div className="flex flex-col gap-0.5">
          {SORTS.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSort(s.id)}
              aria-pressed={sort === s.id}
              className={`flex items-center h-9 px-3 rounded-[10px] text-[12.5px] font-medium text-left transition-all ${
                sort === s.id ? 'bg-white text-[#0D0D0F] font-semibold' : 'text-white/42 hover:text-white/68 hover:bg-white/[0.05]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className={DIVIDER} />

      {/* Category */}
      <div className="mb-6">
        <p className={LABEL}>Category</p>
        {catKeys.length === 0 && <p className="text-[12px] text-white/25">No categories yet</p>}
        <div className="flex flex-col gap-1">
          {catKeys.map(c => {
            const on = categories.includes(c);
            const meta = SERVICE_CATEGORIES[c] ?? SERVICE_CATEGORIES.other;
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(categories, setCategories, c)}
                aria-pressed={on}
                className={`${ROW} ${on ? ROW_ON : ROW_OFF}`}
              >
                <span aria-hidden className="text-[12px] shrink-0">{meta.icon}</span>
                <span className="min-w-0 flex-1 truncate text-left">{meta.label}</span>
                <span className="text-[10.5px] opacity-60 shrink-0">{facetCats[c] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Subcategory follows the category selection, so it appears only when
          the current results actually have subcategories to offer. */}
      {subKeys.length > 0 && (
        <div className="mb-6">
          <p className={LABEL}>Subcategory</p>
          <div className="flex flex-col gap-1">
            {subKeys.map(sc => (
              <button
                key={sc}
                type="button"
                onClick={() => toggle(subcategories, setSubcategories, sc)}
                aria-pressed={subcategories.includes(sc)}
                className={`${ROW} ${subcategories.includes(sc) ? ROW_ON : ROW_OFF}`}
              >
                <span className="min-w-0 flex-1 truncate text-left">{sc}</span>
                <span className="text-[10.5px] opacity-60 shrink-0">{facetSubs[sc] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={DIVIDER} />

      {/* Pricing */}
      <div className="mb-6">
        <p className={LABEL}>Pricing</p>
        <div className="flex flex-col gap-1">
          {Object.keys(PRICING_LABELS).map(m => {
            const on = pricing.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggle(pricing, setPricing, m)}
                aria-pressed={on}
                className={`${ROW} ${on ? ROW_ON : ROW_OFF}`}
              >
                <span className="min-w-0 flex-1 truncate text-left">{PRICING_LABELS[m]}</span>
                <span className="text-[10.5px] opacity-60 shrink-0">{facetPricing[m] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Price range */}
      <div className="mb-6">
        <p className={LABEL}>Price range</p>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <label className="text-[10.5px] text-white/28 mb-1 block" htmlFor="svc-min-price">Min</label>
            <input
              id="svc-min-price"
              value={minPrice} onChange={e => setMinPrice(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric" placeholder="0" aria-label="Minimum price"
              className={INPUT}
            />
          </div>
          <div className="flex-1">
            <label className="text-[10.5px] text-white/28 mb-1 block" htmlFor="svc-max-price">Max</label>
            <input
              id="svc-max-price"
              value={maxPrice} onChange={e => setMaxPrice(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric" placeholder="Any" aria-label="Maximum price"
              className={INPUT}
            />
          </div>
        </div>
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/22">Custom-quote services have no set price and are excluded from a range.</p>
      </div>

      <div className={DIVIDER} />

      {/* Location */}
      <div className="mb-6">
        <p className={LABEL}>Location</p>
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-white/22" />
          <input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="City or area…"
            aria-label="Filter by location"
            className={`${INPUT} pl-8`}
          />
        </div>
      </div>

      {/* Remote / on-site */}
      <div className="mb-6">
        <p className={LABEL}>Remote / on-site</p>
        <div className="flex flex-wrap gap-1.5">
          {WORK_MODES.map(w => {
            const on = workMode.includes(w.id);
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => toggle(workMode, setWorkMode, w.id)}
                aria-pressed={on}
                className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}
              >
                {w.label} <span className="opacity-55">{data?.facets.workMode?.[w.id] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Availability */}
      <div className="mb-6">
        <p className={LABEL}>Availability</p>
        <div className="flex flex-col gap-1">
          {AVAILABILITIES.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(availability, setAvailability, a.id)}
              aria-pressed={availability.includes(a.id)}
              className={`${ROW} ${availability.includes(a.id) ? ROW_ON : ROW_OFF}`}
            >
              <span className="min-w-0 flex-1 truncate text-left">{a.label}</span>
              <span className="text-[10.5px] opacity-60 shrink-0">{data?.facets.availability?.[a.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Delivery time */}
      <div className="mb-6">
        <p className={LABEL}>Delivery time</p>
        <div className="flex flex-col gap-1">
          {DELIVERY_OPTIONS.map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() => setMaxDelivery(maxDelivery === d.id ? '' : d.id)}
              aria-pressed={maxDelivery === d.id}
              className={`${ROW} ${maxDelivery === d.id ? ROW_ON : ROW_OFF}`}
            >
              <span className="min-w-0 flex-1 truncate text-left">{d.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={DIVIDER} />

      {/* Provider type comes from the account record, not the service. */}
      {Object.keys(data?.facets.providerType ?? {}).length > 0 && (
        <div className="mb-6">
          <p className={LABEL}>Provider type</p>
          <div className="flex flex-wrap gap-1.5">
            {([['individual','Individual'],['business','Company / agency']] as const)
              .filter(([id]) => (data?.facets.providerType?.[id] ?? 0) > 0 || providerType.includes(id))
              .map(([id,label]) => {
                const on = providerType.includes(id);
                return (
                  <button key={id} type="button" onClick={() => toggle(providerType, setProviderType, id)} aria-pressed={on}
                    className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}>
                    {label} <span className="opacity-55">{data?.facets.providerType?.[id] ?? 0}</span>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* Skills — the specification lists these separately from tags. */}
      {Object.keys(data?.facets.skills ?? {}).length > 0 && (
        <div className="mb-6">
          <p className={LABEL}>Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(data?.facets.skills ?? {}).sort((a,b)=>(data!.facets.skills![b])-(data!.facets.skills![a])).slice(0,12).map(v => {
              const on = skills.includes(v);
              return (
                <button key={v} type="button" onClick={() => toggle(skills, setSkills, v)} aria-pressed={on}
                  className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}>
                  {v} <span className="opacity-55">{data?.facets.skills?.[v] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {Object.keys(data?.facets.languages ?? {}).length > 0 && (
        <div className="mb-6">
          <p className={LABEL}>Language</p>
          <div className="flex flex-wrap gap-1.5">
            {Object.keys(data?.facets.languages ?? {}).map(v => {
              const on = languages.includes(v);
              return (
                <button key={v} type="button" onClick={() => toggle(languages, setLanguages, v)} aria-pressed={on}
                  className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}>
                  {v} <span className="opacity-55">{data?.facets.languages?.[v] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tagKeys.length > 0 && (
        <div className="mb-6">
          <p className={LABEL}>Skills &amp; tags</p>
          <div className="flex flex-wrap gap-1.5">
            {tagKeys.map(t => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle(tags, setTags, t)}
                  aria-pressed={on}
                  className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}
                >
                  {t} <span className="opacity-55">{facetTags[t] ?? 0}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Rating */}
      <div>
        <p className={LABEL}>Rating</p>
        <div className="flex flex-wrap gap-1.5">
          {RATINGS.map(r => {
            const on = minRating === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setMinRating(minRating === r ? 0 : r)}
                aria-pressed={on}
                className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}
              >
                {r}+
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  /* ── Quick-filter chips ────────────────────────────────────────────
     People's chip strip, wired only to filters this page already has. */
  const topCategoryChips = catKeys.slice(0, 4);
  const quickChipActive = (id: string) => {
    if (id === 'all') return !hasFilters && sort === 'recommended';
    if (id === 'remote') return workMode.includes('remote');
    if (id === 'available') return availability.includes('available');
    if (id === 'rating45') return minRating === 4.5;
    if (id === 'bookings') return sort === 'bookings';
    if (id === 'ratingSort') return sort === 'rating';
    if (id === 'newest') return sort === 'newest';
    return categories.includes(id);
  };
  const quickChipClick = (id: string) => {
    if (id === 'all') { clearAll(); return; }
    if (id === 'remote') { toggle(workMode, setWorkMode, 'remote'); return; }
    if (id === 'available') { toggle(availability, setAvailability, 'available'); return; }
    if (id === 'rating45') { setMinRating(minRating === 4.5 ? 0 : 4.5); return; }
    if (id === 'bookings') { setSort('bookings'); return; }
    if (id === 'ratingSort') { setSort('rating'); return; }
    if (id === 'newest') { setSort('newest'); return; }
    toggle(categories, setCategories, id);
  };
  const quickChips: Array<{ id: string; label: string }> = [
    { id: 'all', label: '◈ All' },
    ...topCategoryChips.map(c => ({ id: c, label: `${serviceCategory(c).icon} ${serviceCategory(c).label}` })),
    { id: 'available', label: 'Available now' },
    { id: 'remote', label: 'Remote' },
    { id: 'rating45', label: '★ 4.5+' },
    { id: 'bookings', label: '▲ Most booked' },
    { id: 'ratingSort', label: '◉ Highest rated' },
    { id: 'newest', label: '✦ Recently added' },
  ];

  const categoryCount = Object.keys(facetCats).length;
  const availableCount = data?.facets.availability?.available ?? 0;

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
      `}</style>

      {/* ══ Sticky header ══════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06]"
        style={{ height: HEADER_H, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px) saturate(180%)' }}>
        <div className="h-full px-3 sm:px-5 lg:px-8 flex items-center gap-3">

          {/* Back */}
          <button type="button" onClick={() => router.back()} aria-label="Go back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white hover:bg-white/[0.08] transition-all">
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Title */}
          <div className="hidden sm:flex items-baseline gap-2 shrink-0">
            <h1 className="text-[15px] font-bold tracking-[-0.01em] text-white">Services</h1>
            {state === 'ready' && data && (
              <span className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.28)' }}>
                {data.total.toLocaleString()}
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.25)' }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search services, skills or providers…"
              aria-label="Search services"
              className="h-9 w-full rounded-[11px] text-white pl-9 pr-9 text-[13px] transition-all focus:outline-none"
              style={{ background: 'rgba(255,255,255,0.055)', border: '1px solid rgba(255,255,255,0.09)' }}
              onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,0.20)'; e.target.style.background = 'rgba(255,255,255,0.07)'; }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.09)'; e.target.style.background = 'rgba(255,255,255,0.055)'; }}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/28 hover:text-white/55 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Desktop stats */}
          {state === 'ready' && data && (
            <div className="hidden lg:flex items-center gap-4 shrink-0 text-[11.5px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
              <span className="flex items-center gap-1.5 font-medium">
                <Briefcase className="h-3 w-3" />
                <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>{data.total.toLocaleString()}</span>
                services
              </span>
              <span className="flex items-center gap-1.5">
                <LayoutGrid className="h-3 w-3" />
                <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>{categoryCount}</span>
                categories
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="h-3 w-3" />
                <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.45)' }}>{availableCount}</span>
                available
              </span>
            </div>
          )}

          {/* Mobile filter button */}
          <button type="button" onClick={() => setSheetOpen(true)} aria-label="Filters and sort"
            className={`lg:hidden flex items-center gap-1.5 h-9 px-3 rounded-[10px] text-[12.5px] font-semibold shrink-0 transition-all ${
              activeChips.length > 0
                ? 'bg-white text-[#0A0A0C]'
                : 'border border-white/[0.08] bg-white/[0.04] text-white/48 hover:text-white/72'
            }`}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {activeChips.length > 0 && <span className="text-[10.5px] font-bold">{activeChips.length}</span>}
          </button>
        </div>
      </header>

      {/* ══ Quick-filter chip strip ══════════════════════════════════════ */}
      <div className="sticky z-20 border-b border-white/[0.05]"
        style={{ top: HEADER_H, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px)' }}>
        <div className="px-3 sm:px-5 lg:px-8 py-2.5 flex items-center gap-1.5 overflow-x-auto no-sb chip-strip-fade-right">
          {quickChips.map(chip => {
            const on = quickChipActive(chip.id);
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => quickChipClick(chip.id)}
                aria-pressed={on}
                className="shrink-0 h-[30px] px-3.5 rounded-full text-[11.5px] font-semibold transition-all duration-150 whitespace-nowrap"
                style={on
                  ? { background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', color: '#ffffff' }
                  : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.40)' }}
              >
                {chip.label}
              </button>
            );
          })}

          {/* Every active filter stays individually removable, as before. */}
          {activeChips.map(chip => (
            <button
              key={`active-${chip.label}`}
              type="button"
              onClick={chip.clear}
              aria-label={`Remove filter: ${chip.label}`}
              className="shrink-0 inline-flex items-center gap-1 h-[30px] px-3.5 rounded-full text-[11.5px] font-semibold transition-all whitespace-nowrap"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.20)', color: '#fff' }}
            >
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

        {/* Desktop sidebar */}
        <aside className="hidden lg:flex shrink-0 w-[248px] xl:w-[264px] flex-col border-r border-white/[0.05]">
          <div className="sticky overflow-y-auto px-5 py-6 no-sb"
            style={{ top: HEADER_H + 47, height: `calc(100vh - ${HEADER_H + 47}px)` }}>
            {FilterPanel}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 px-3 sm:px-4 lg:px-6 xl:px-8 pt-5 pb-12">

          {/* Mobile stats */}
          {state === 'ready' && data && items.length > 0 && (
            <div className="sm:hidden flex items-center gap-3.5 mb-4 text-[11.5px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
              <span className="flex items-center gap-1.5"><Briefcase className="h-3 w-3" /><span className="font-semibold" style={{ color: 'rgba(255,255,255,0.48)' }}>{data.total.toLocaleString()}</span> services</span>
              <span className="flex items-center gap-1.5"><LayoutGrid className="h-3 w-3" /><span className="font-semibold" style={{ color: 'rgba(255,255,255,0.48)' }}>{categoryCount}</span> categories</span>
              <span className="flex items-center gap-1.5"><Zap className="h-3 w-3" /><span className="font-semibold" style={{ color: 'rgba(255,255,255,0.48)' }}>{availableCount}</span> available</span>
            </div>
          )}

          {state === 'loading' && (
            <div className={GRID}>
              {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-36 text-center">
              <div className={EMPTY_ICON_BOX}>
                <Briefcase className="h-9 w-9" style={{ color: 'rgba(255,255,255,0.15)' }} />
              </div>
              <p className="text-[17px] font-bold text-white/42 mb-2">Couldn&apos;t load services</p>
              <p className="text-[13.5px] text-white/22 mb-7 max-w-xs leading-relaxed">
                Something went wrong while fetching results. Try again in a moment.
              </p>
              <button type="button" onClick={() => void fetchPage(1, false)} className={EMPTY_BTN}>
                Try again
              </button>
            </div>
          )}

          {state === 'ready' && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-36 text-center">
              <div className={EMPTY_ICON_BOX}>
                <Briefcase className="h-9 w-9" style={{ color: 'rgba(255,255,255,0.15)' }} />
              </div>
              {/* "Nothing published yet" is a different message from
                  "nothing matches" — the API sends libraryTotal so the page
                  can tell them apart instead of guessing. */}
              <p className="text-[17px] font-bold text-white/42 mb-2">
                {hasFilters ? 'No services match your filters' : 'No services found'}
              </p>
              <p className="text-[13.5px] text-white/22 mb-7 max-w-xs leading-relaxed">
                {hasFilters
                  ? 'Try removing a filter or searching for something broader.'
                  : (data?.libraryTotal ?? 0) === 0
                    ? 'Nobody has published a service yet. Add yours from Profile → Services.'
                    : 'Nothing to show right now.'}
              </p>
              {hasFilters && (
                <button type="button" onClick={clearAll} className={EMPTY_BTN}>
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {state === 'ready' && items.length > 0 && (
            <>
              <div className={GRID}>
                {items.map((s, i) => (
                  <div key={s.id} className="pc-anim" style={{ animationDelay: `${Math.min(i, 11) * 0.04}s` }}>
                    <ServiceSummaryCard service={s} variant="discovery" />
                  </div>
                ))}
              </div>

              {/* Result footer. Services pages results with an append-style
                  "Load more" rather than People's numbered pages, so the
                  paging behaviour is unchanged — only its frame matches. */}
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 pb-2 border-t border-white/[0.06]">
                <p className="text-[12px] text-white/28">
                  Showing <span className="text-white/52 font-semibold">{items.length.toLocaleString()}</span> of{' '}
                  <span className="text-white/52 font-semibold">{(data?.total ?? items.length).toLocaleString()}</span>{' '}
                  {(data?.total ?? items.length) === 1 ? 'service' : 'services'}
                </p>
                {data?.hasMore && (
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => { const next = page + 1; setPage(next); void fetchPage(next, true); }}
                    className="inline-flex items-center gap-2 h-9 px-5 rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-[12.5px] font-semibold text-white/48 hover:text-white/72 hover:bg-white/[0.08] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Load more
                  </button>
                )}
              </div>
            </>
          )}
        </main>
      </div>

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
                    <button type="button" onClick={clearAll}
                      className="text-[12px] font-semibold text-white/35 hover:text-white/62 transition-colors">
                      Clear all
                    </button>
                  )}
                  <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close filters"
                    className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/[0.09] bg-white/[0.05] text-white/42 hover:text-white/70 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-5 no-sb">
              {FilterPanel}
            </div>
            <div className="shrink-0 px-5 py-4 border-t border-white/[0.07]" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
              <button type="button" onClick={() => setSheetOpen(false)}
                className="w-full h-12 rounded-[14px] font-bold text-[14.5px] tracking-[-0.01em] transition-all"
                style={{ background: '#ffffff', color: '#0A0A0C', boxShadow: '0 4px 20px rgba(255,255,255,0.15)' }}>
                Show {(data?.total ?? items.length).toLocaleString()} {(data?.total ?? items.length) === 1 ? 'service' : 'services'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
