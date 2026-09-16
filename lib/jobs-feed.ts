/**
 * The Jobs page's query model — P2D.
 *
 * ═══ ONE SOURCE OF TRUTH: THE URL ═══
 *
 * Every filter the page can apply lives in the URL (`/jobs?q=react&wm=remote,
 * hybrid&india=bengaluru`), so a refresh, a shared link, and Back/Forward all
 * restore the same list. `filtersFromParams` / `filtersToParams` are inverse
 * for every reachable state (pinned by scripts/jobs-feed-query.selftest.ts).
 *
 * ═══ THE SERVER DOES THE WORK ═══
 *
 * `filtersToApiQuery` maps a filter state to the public feed's vocabulary —
 * the vocabulary P2B proved equivalent to the page's old client-side predicate
 * on the real corpus (32/32 ordered-id parity): `searchScope=card` for the
 * title/organisation/location search, comma-joined multi-selects, the India
 * chips as `indiaBucket`, the location box as `location`. `view=card` asks for
 * exactly the fields a card renders. Nothing here filters, sorts or counts
 * rows itself.
 *
 * ═══ NO RACES, NO DUPLICATES, NO ZERO-ON-ERROR ═══
 *
 * `createJobsFeedController` owns the request lifecycle so the React hook is
 * a thin subscriber: a new filter state aborts what is in flight and, for
 * typed search, debounces; every response is checked against the request it
 * answers before it is applied; pages are appended with de-duplication by id;
 * a failed page is an error state (never an empty list), and a failed count
 * is `null` (never 0). Dependencies (fetch, timers) are injected so all of
 * that is provable without a browser.
 */
import type { IndiaBucket } from '@/lib/server/job-scraper/india';

export type SortMode = 'recommended' | 'newest';

export interface JobsFeedFilters {
  sort: SortMode;
  search: string;
  employment: Set<string>;
  workMode: Set<string>;
  experience: Set<string>;
  india: IndiaBucket;
  location: string;
}

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship', 'freelance'] as const;
export const WORK_MODES = ['remote', 'hybrid', 'onsite'] as const;
export const EXPERIENCE_LEVELS = ['entry', 'associate', 'mid', 'senior', 'lead'] as const;
export const INDIA_BUCKETS: readonly IndiaBucket[] = ['india', 'bengaluru', 'hyderabad', 'pune', 'mumbai', 'delhi-ncr', 'chennai', 'remote-india'];
export const JOBS_FEED_PAGE_SIZE = 24;
/** Typed search waits this long after the last keystroke before asking the server. */
export const SEARCH_DEBOUNCE_MS = 300;
const MAX_TEXT = 200;

export const DEFAULT_JOBS_FEED_FILTERS: JobsFeedFilters = {
  sort: 'recommended', search: '', employment: new Set(), workMode: new Set(), experience: new Set(), india: '', location: '',
};

const text = (v: string | null | undefined) => String(v ?? '').trim().slice(0, MAX_TEXT);
const pick = (v: string | null | undefined, allowed: readonly string[]) =>
  new Set(String(v ?? '').split(',').map((x) => x.trim()).filter((x) => (allowed as readonly string[]).includes(x)));

/** URL → filters. Unknown enum values are dropped; free text is trimmed and capped. */
export function filtersFromParams(params: URLSearchParams): JobsFeedFilters {
  const india = text(params.get('india'));
  return {
    sort: params.get('sort') === 'newest' ? 'newest' : 'recommended',
    search: text(params.get('q')),
    employment: pick(params.get('emp'), EMPLOYMENT_TYPES),
    workMode: pick(params.get('wm'), WORK_MODES),
    experience: pick(params.get('exp'), EXPERIENCE_LEVELS),
    india: (INDIA_BUCKETS as readonly string[]).includes(india) ? (india as IndiaBucket) : '',
    location: text(params.get('loc')),
  };
}

/** Filters → URL. Defaults are omitted and multi-selects sorted, so equal states serialise identically. */
export function filtersToParams(f: JobsFeedFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.search) p.set('q', f.search);
  if (f.india) p.set('india', f.india);
  if (f.location) p.set('loc', f.location);
  if (f.employment.size) p.set('emp', Array.from(f.employment).sort().join(','));
  if (f.workMode.size) p.set('wm', Array.from(f.workMode).sort().join(','));
  if (f.experience.size) p.set('exp', Array.from(f.experience).sort().join(','));
  if (f.sort === 'newest') p.set('sort', 'newest');
  return p;
}

export const sameFilters = (a: JobsFeedFilters, b: JobsFeedFilters) => filtersToParams(a).toString() === filtersToParams(b).toString();

/**
 * Filters → the public feed's query string.
 *
 * Both sort modes map to the feed's default order: P2B replaced the client's
 * `createdAt` sort with the persisted newest key for BOTH modes (approved
 * departure; the modes differed only in whether that sort was re-applied to
 * the corpus order, which the persisted key already is).
 */
export function filtersToApiQuery(f: JobsFeedFilters, cursor: string | null = null, pageSize = JOBS_FEED_PAGE_SIZE): string {
  const p = new URLSearchParams();
  p.set('view', 'card');
  p.set('pageSize', String(pageSize));
  if (f.search) { p.set('search', f.search); p.set('searchScope', 'card'); }
  if (f.employment.size) p.set('employmentType', Array.from(f.employment).sort().join(','));
  if (f.workMode.size) p.set('workMode', Array.from(f.workMode).sort().join(','));
  if (f.experience.size) p.set('experienceLevel', Array.from(f.experience).sort().join(','));
  if (f.india) p.set('indiaBucket', f.india);
  if (f.location) p.set('location', f.location);
  if (f.sort === 'newest') p.set('sort', 'newest');
  if (cursor) p.set('cursor', cursor);
  return p.toString();
}

/** The same filters, for `/api/jobs/public/count` — no paging, no view, no sort. */
export function filtersToCountQuery(f: JobsFeedFilters): string {
  const p = new URLSearchParams(filtersToApiQuery(f));
  for (const k of ['view', 'pageSize', 'cursor', 'sort']) p.delete(k);
  return p.toString();
}

export interface JobsFeedFacets {
  emp: Record<string, number>; wm: Record<string, number>; exp: Record<string, number>;
  stats?: { open: number; companies: number; remote: number };
}

export interface JobsFeedPageResult<T> {
  items: T[];
  hasNextPage: boolean;
  nextCursor: string | null;
  facets?: JobsFeedFacets | null;
}

/** Append a page, dropping any id already shown — a cursor page must never repeat a card. */
export function appendPage<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const seen = new Set(existing.map((j) => j.id));
  const out = existing.slice();
  for (const j of incoming) { if (!seen.has(j.id)) { seen.add(j.id); out.push(j); } }
  return out;
}

export type JobsFeedStatus = 'loading' | 'ready' | 'error' | 'loading-more';

export interface JobsFeedState<T> {
  status: JobsFeedStatus;
  items: T[];
  hasNextPage: boolean;
  nextCursor: string | null;
  facets: JobsFeedFacets | null;
  /** Exact filtered count from the count endpoint; `null` while unknown or when that request failed. */
  count: number | null;
  /** The query the current items answer. */
  query: string;
}

export interface JobsFeedDeps<T> {
  fetchPage: (query: string, signal: AbortSignal) => Promise<JobsFeedPageResult<T>>;
  fetchCount: (query: string, signal: AbortSignal) => Promise<number | null>;
  onState: (state: JobsFeedState<T>) => void;
}

/**
 * Collapse a burst of calls into one, `ms` after the last. The page commits a
 * typed search to the URL through this, so a keystroke never becomes a request
 * until the typing pauses. Timers are injectable so the behaviour is testable.
 */
export function createDebouncer(
  ms: number,
  setT: (fn: () => void, ms: number) => unknown = (fn, m) => setTimeout(fn, m),
  clearT: (handle: unknown) => void = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
): { call: (fn: () => void) => void; cancel: () => void } {
  let handle: unknown = null;
  return {
    call(fn) { if (handle !== null) clearT(handle); handle = setT(() => { handle = null; fn(); }, ms); },
    cancel() { if (handle !== null) { clearT(handle); handle = null; } },
  };
}

export interface JobsFeedController {
  /** Apply a filter state: aborts anything in flight and asks for page one. */
  setFilters: (filters: JobsFeedFilters) => void;
  loadMore: () => void;
  retry: () => void;
  dispose: () => void;
}

export function createJobsFeedController<T extends { id: string }>(deps: JobsFeedDeps<T>): JobsFeedController {
  let state: JobsFeedState<T> = { status: 'loading', items: [], hasNextPage: false, nextCursor: null, facets: null, count: null, query: '' };
  let current: JobsFeedFilters = DEFAULT_JOBS_FEED_FILTERS;
  let requestId = 0;
  let inFlight: AbortController | null = null;
  let disposed = false;

  const emit = (next: Partial<JobsFeedState<T>>) => { state = { ...state, ...next }; deps.onState(state); };

  const abortInFlight = () => { if (inFlight) { inFlight.abort(); inFlight = null; } };

  const loadFirst = () => {
    abortInFlight();
    const id = ++requestId;
    const ac = new AbortController(); inFlight = ac;
    const query = filtersToApiQuery(current, null);
    emit({ status: 'loading', query, count: null });
    /* The page and its exact count are independent requests: the count's
       failure costs the figure, never the list; the list's failure is an error. */
    deps.fetchCount(filtersToCountQuery(current), ac.signal)
      .then((n) => { if (!disposed && id === requestId) emit({ count: typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null }); })
      .catch(() => { /* count stays null */ });
    deps.fetchPage(query, ac.signal)
      .then((page) => {
        if (disposed || id !== requestId) return;
        emit({ status: 'ready', items: appendPage([], page.items), hasNextPage: page.hasNextPage, nextCursor: page.nextCursor, facets: page.facets ?? state.facets });
      })
      .catch((err: unknown) => {
        if (disposed || id !== requestId) return;
        if ((err as { name?: string })?.name === 'AbortError') return;
        emit({ status: 'error' });
      });
  };

  return {
    setFilters(filters) {
      if (disposed) return;
      current = filters;
      loadFirst();
    },
    loadMore() {
      if (disposed || state.status !== 'ready' || !state.hasNextPage || !state.nextCursor) return;
      const id = requestId; const cursor = state.nextCursor;
      const ac = new AbortController(); inFlight = ac;
      emit({ status: 'loading-more' });
      deps.fetchPage(filtersToApiQuery(current, cursor), ac.signal)
        .then((page) => {
          /* Only if the filters did not change underneath and this is still the page we asked for. */
          if (disposed || id !== requestId || state.nextCursor !== cursor) return;
          emit({ status: 'ready', items: appendPage(state.items, page.items), hasNextPage: page.hasNextPage, nextCursor: page.nextCursor });
        })
        .catch((err: unknown) => {
          if (disposed || id !== requestId) return;
          if ((err as { name?: string })?.name === 'AbortError') return;
          /* Keep what is shown; the button can be pressed again. */
          emit({ status: 'ready' });
        });
    },
    retry() { if (!disposed) loadFirst(); },
    dispose() { disposed = true; abortInFlight(); },
  };
}
