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
import Link from 'next/link';
import { Search, SlidersHorizontal, X, Loader2 } from 'lucide-react';
import { SERVICE_CATEGORIES, serviceCategory } from '@/lib/services-ui';
import { ServiceSummaryCard, type ServiceSummary } from '@/components/services/ServiceSummaryCard';

type Facets = { categories: Record<string, number>; subcategories?: Record<string, number>; pricing: Record<string, number>; tags?: Record<string, number>; workMode?: Record<string, number>; availability?: Record<string, number> };
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

export default function ServicesDiscoveryPage() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [pricing, setPricing] = useState<string[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [maxDelivery, setMaxDelivery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
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
    if (debouncedLocation) p.set('location', debouncedLocation);
    if (workMode.length) p.set('workMode', workMode.join(','));
    if (availability.length) p.set('availability', availability.join(','));
    if (minPrice.trim()) p.set('minPrice', minPrice.trim());
    if (maxPrice.trim()) p.set('maxPrice', maxPrice.trim());
    p.set('sort', sort);
    return p;
  }, [debounced, categories, subcategories, pricing, minRating, maxDelivery, tags, debouncedLocation, workMode, availability, minPrice, maxPrice, sort]);

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
    setMinRating(0); setMaxDelivery(''); setTags([]);
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

  const FilterPanel = (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Category</p>
        {catKeys.length === 0 && <p className="text-[12px] text-white/30">No categories yet</p>}
        <div className="space-y-1">
          {catKeys.map(c => {
            const on = categories.includes(c);
            const meta = SERVICE_CATEGORIES[c] ?? SERVICE_CATEGORIES.other;
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(categories, setCategories, c)}
                aria-pressed={on}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] transition ${
                  on ? 'border-white/25 bg-white/[0.08] text-white' : 'border-transparent text-white/55 hover:bg-white/[0.04]'
                }`}
              >
                <span aria-hidden>{meta.icon}</span>
                <span className="min-w-0 flex-1 truncate">{meta.label}</span>
                <span className="text-[11px] text-white/30">{facetCats[c] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Subcategory follows the category selection, so it appears only when
          the current results actually have subcategories to offer. */}
      {subKeys.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Subcategory</p>
          <div className="space-y-1">
            {subKeys.map(sc => (
              <button
                key={sc}
                type="button"
                onClick={() => toggle(subcategories, setSubcategories, sc)}
                aria-pressed={subcategories.includes(sc)}
                className={`flex w-full items-center rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] transition ${
                  subcategories.includes(sc) ? 'border-white/25 bg-white/[0.08] text-white' : 'border-transparent text-white/55 hover:bg-white/[0.04]'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{sc}</span>
                <span className="text-[11px] text-white/30">{facetSubs[sc] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Pricing</p>
        <div className="space-y-1">
          {Object.keys(PRICING_LABELS).map(m => {
            const on = pricing.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggle(pricing, setPricing, m)}
                aria-pressed={on}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] transition ${
                  on ? 'border-white/25 bg-white/[0.08] text-white' : 'border-transparent text-white/55 hover:bg-white/[0.04]'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{PRICING_LABELS[m]}</span>
                <span className="text-[11px] text-white/30">{facetPricing[m] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Price range</p>
        <div className="flex items-center gap-2">
          <input
            value={minPrice} onChange={e => setMinPrice(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric" placeholder="Min" aria-label="Minimum price"
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-[12.5px] text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none"
          />
          <span className="text-white/25">–</span>
          <input
            value={maxPrice} onChange={e => setMaxPrice(e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric" placeholder="Max" aria-label="Maximum price"
            className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-[12.5px] text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none"
          />
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-white/25">Custom-quote services have no set price and are excluded from a range.</p>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Location</p>
        <input
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="City or area"
          aria-label="Filter by location"
          className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-[12.5px] text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none"
        />
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Remote / on-site</p>
        <div className="flex flex-wrap gap-1.5">
          {WORK_MODES.map(w => (
            <button
              key={w.id}
              type="button"
              onClick={() => toggle(workMode, setWorkMode, w.id)}
              aria-pressed={workMode.includes(w.id)}
              className={`rounded-full border px-2.5 py-1 text-[12px] transition ${
                workMode.includes(w.id) ? 'border-white/25 bg-white/[0.08] text-white' : 'border-white/[0.08] text-white/55 hover:bg-white/[0.04]'
              }`}
            >
              {w.label} <span className="text-white/30">{data?.facets.workMode?.[w.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Availability</p>
        <div className="space-y-1">
          {AVAILABILITIES.map(a => (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(availability, setAvailability, a.id)}
              aria-pressed={availability.includes(a.id)}
              className={`flex w-full items-center rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] transition ${
                availability.includes(a.id) ? 'border-white/25 bg-white/[0.08] text-white' : 'border-transparent text-white/55 hover:bg-white/[0.04]'
              }`}
            >
              <span className="flex-1">{a.label}</span>
              <span className="text-[11px] text-white/30">{data?.facets.availability?.[a.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Delivery time</p>
        <div className="space-y-1">
          {DELIVERY_OPTIONS.map(d => (
            <button
              key={d.id}
              type="button"
              onClick={() => setMaxDelivery(maxDelivery === d.id ? '' : d.id)}
              aria-pressed={maxDelivery === d.id}
              className={`flex w-full items-center rounded-lg border px-2.5 py-1.5 text-left text-[12.5px] transition ${
                maxDelivery === d.id ? 'border-white/25 bg-white/[0.08] text-white' : 'border-transparent text-white/55 hover:bg-white/[0.04]'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {tagKeys.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Skills &amp; tags</p>
          <div className="flex flex-wrap gap-1.5">
            {tagKeys.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => toggle(tags, setTags, t)}
                aria-pressed={tags.includes(t)}
                className={`rounded-full border px-2.5 py-1 text-[12px] transition ${
                  tags.includes(t) ? 'border-white/25 bg-white/[0.08] text-white' : 'border-white/[0.08] text-white/55 hover:bg-white/[0.04]'
                }`}
              >
                {t} <span className="text-white/30">{facetTags[t] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Rating</p>
        <div className="flex flex-wrap gap-1.5">
          {RATINGS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setMinRating(minRating === r ? 0 : r)}
              aria-pressed={minRating === r}
              className={`rounded-full border px-2.5 py-1 text-[12px] transition ${
                minRating === r ? 'border-white/25 bg-white/[0.08] text-white' : 'border-white/[0.08] text-white/55 hover:bg-white/[0.04]'
              }`}
            >
              {r}+
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-white">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0A0A0C]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <h1 className="text-[15px] font-bold tracking-[-0.01em]">Services</h1>
          <span className="hidden text-[12.5px] text-white/30 sm:inline">Have a skill? List it. Need a service? Find it.</span>
          {data && state === 'ready' && (
            <span className="ml-auto shrink-0 text-[12px] text-white/30">{data.total} {data.total === 1 ? 'service' : 'services'}</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        {/* search + sort */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search services, skills or providers"
              aria-label="Search services"
              className="h-10 w-full rounded-full border border-white/[0.08] bg-white/[0.03] pl-9 pr-9 text-[13px] text-white placeholder:text-white/25 focus:border-white/25 focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            aria-label="Sort services"
            className="h-10 shrink-0 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 text-[12.5px] text-white/70 focus:border-white/25 focus:outline-none"
          >
            {SORTS.map(s => <option key={s.id} value={s.id} className="bg-[#0d0d10]">{s.label}</option>)}
          </select>

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 text-[12.5px] font-semibold text-white/70 lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters
            {activeChips.length > 0 && <span className="rounded-full bg-white/15 px-1.5 text-[11px]">{activeChips.length}</span>}
          </button>
        </div>

        {activeChips.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {activeChips.map(chip => (
              <button
                key={chip.label}
                type="button"
                onClick={chip.clear}
                className="inline-flex items-center gap-1 rounded-full border border-white/[0.10] bg-white/[0.05] px-2.5 py-1 text-[11.5px] text-white/70 hover:bg-white/[0.09]"
              >
                {chip.label} <X className="h-3 w-3" />
              </button>
            ))}
            <button type="button" onClick={clearAll} className="px-1.5 text-[11.5px] font-semibold text-white/40 hover:text-white">Clear all</button>
          </div>
        )}

        <div className="mt-5 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:block"><div className="sticky top-20">{FilterPanel}</div></aside>

          <section className="min-w-0">
            {state === 'loading' && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="animate-pulse overflow-hidden rounded-[20px] border border-white/[0.07] bg-[#0d0d10]">
                    <div className="h-28 w-full bg-white/[0.04]" />
                    <div className="space-y-2 p-3.5">
                      <div className="h-3 w-16 rounded bg-white/[0.04]" />
                      <div className="h-3.5 w-3/4 rounded bg-white/[0.04]" />
                      <div className="h-3 w-1/2 rounded bg-white/[0.04]" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {state === 'error' && (
              <div className="rounded-[20px] border border-white/[0.07] bg-[#0d0d10] py-16 text-center">
                <p className="text-[14px] font-semibold">Couldn&apos;t load services.</p>
                <button
                  type="button"
                  onClick={() => void fetchPage(1, false)}
                  className="mt-3 rounded-full bg-white px-4 py-2 text-[12px] font-bold text-[#0D0D0F] hover:bg-white/90"
                >
                  Try again
                </button>
              </div>
            )}

            {state === 'ready' && items.length === 0 && (
              <div className="rounded-[20px] border border-white/[0.07] bg-[#0d0d10] py-16 text-center">
                {/* "Nothing published yet" is a different message from
                    "nothing matches" — the API sends libraryTotal so the page
                    can tell them apart instead of guessing. */}
                <p className="text-[14px] font-semibold">
                  {hasFilters ? 'No services match your filters.' : 'No services found'}
                </p>
                <p className="mx-auto mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-white/40">
                  {hasFilters
                    ? 'Try removing a filter or searching for something broader.'
                    : (data?.libraryTotal ?? 0) === 0
                      ? 'Nobody has published a service yet. Add yours from Profile → Services.'
                      : 'Nothing to show right now.'}
                </p>
                {hasFilters && (
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <button type="button" onClick={clearAll} className="rounded-full bg-white px-4 py-2 text-[12px] font-bold text-[#0D0D0F] hover:bg-white/90">
                      Clear filters
                    </button>
                    <button type="button" onClick={clearAll} className="rounded-full border border-white/[0.10] px-4 py-2 text-[12px] font-semibold text-white/60 hover:bg-white/[0.06]">
                      Browse all services
                    </button>
                  </div>
                )}
              </div>
            )}

            {state === 'ready' && items.length > 0 && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map(s => <ServiceSummaryCard key={s.id} service={s} />)}
                </div>
                {data?.hasMore && (
                  <div className="mt-5 flex justify-center">
                    <button
                      type="button"
                      disabled={loadingMore}
                      onClick={() => { const next = page + 1; setPage(next); void fetchPage(next, true); }}
                      className="inline-flex items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.04] px-4 py-2 text-[12.5px] font-semibold text-white/70 hover:bg-white/[0.08] disabled:opacity-50"
                    >
                      {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Load more
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>

      {/* mobile filter sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-[20px] border-t border-white/[0.08] bg-[#0d0d10] p-5 pb-8">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[14px] font-bold">Filters</p>
              <button type="button" onClick={() => setSheetOpen(false)} aria-label="Close filters" className="text-white/40 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            {FilterPanel}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={clearAll} className="flex-1 rounded-full border border-white/[0.10] py-2.5 text-[12.5px] font-semibold text-white/60">Clear all</button>
              <button type="button" onClick={() => setSheetOpen(false)} className="flex-1 rounded-full bg-white py-2.5 text-[12.5px] font-bold text-[#0D0D0F]">Show results</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
