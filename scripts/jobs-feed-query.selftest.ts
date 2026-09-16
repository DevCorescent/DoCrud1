/**
 * The Jobs page's query model — lib/jobs-feed.ts — proven without a browser.
 *
 * Run: npm run test:jobs-feed-query
 *
 * ═══ WHAT THIS GUARDS ═══
 *
 *  1. URL ⇄ filters is a round trip for every reachable state (100 random
 *     states), unknown values are dropped, defaults are omitted.
 *  2. Filters → the public feed's vocabulary: `view=card`, `searchScope=card`,
 *     comma-joined sorted multi-selects, `indiaBucket`, `location`, cursor
 *     pass-through; the count query strips paging/view/sort.
 *  3. Pages append without repeating an id.
 *  4. The debouncer collapses a burst into one call after the pause.
 *  5. The controller: a filter change aborts what is in flight and a late
 *     answer to an older request is ignored; a failed page is an error, never
 *     an empty list; a failed count is null, never 0; loadMore appends the
 *     next cursor page once and ignores a page that arrives after the filters
 *     changed.
 *
 * Fetch and timers are injected, so nothing here touches the network.
 */
import {
  DEFAULT_JOBS_FEED_FILTERS, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, INDIA_BUCKETS, JOBS_FEED_PAGE_SIZE, SEARCH_DEBOUNCE_MS, WORK_MODES,
  appendPage, createDebouncer, createJobsFeedController, filtersFromParams, filtersToApiQuery, filtersToCountQuery, filtersToParams, sameFilters,
  type JobsFeedFilters, type JobsFeedPageResult, type JobsFeedState,
} from '../lib/jobs-feed';

let passed = 0, failed = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { passed += 1; return; }
  failed += 1; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}
/* Deterministic pseudo-random, so a failure is reproducible. */
let seed = 20260916; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pickSome = <T,>(arr: readonly T[]) => new Set(arr.filter(() => rnd() < 0.4));
const randomFilters = (): JobsFeedFilters => ({
  sort: rnd() < 0.5 ? 'newest' : 'recommended',
  search: rnd() < 0.5 ? ['react', 'Data Engineer', 'bengaluru', 'a b  c', ''][Math.floor(rnd() * 5)] : '',
  employment: pickSome(EMPLOYMENT_TYPES), workMode: pickSome(WORK_MODES), experience: pickSome(EXPERIENCE_LEVELS),
  india: rnd() < 0.5 ? INDIA_BUCKETS[Math.floor(rnd() * INDIA_BUCKETS.length)] : '',
  location: rnd() < 0.4 ? ['india', 'Remote', 'Pune '][Math.floor(rnd() * 3)] : '',
});

console.log('── 1. URL ⇄ filters ──');
check('defaults serialise to an empty query', filtersToParams(DEFAULT_JOBS_FEED_FILTERS).toString() === '');
check('an empty URL is the defaults', sameFilters(filtersFromParams(new URLSearchParams('')), DEFAULT_JOBS_FEED_FILTERS));
/* Compared FIELD BY FIELD, not through the serialiser — a serialiser that
   forgot a field would agree with itself. */
const setEq = (a: Set<string>, b: Set<string>) => a.size === b.size && Array.from(a).every((x) => b.has(x));
const fieldEq = (a: JobsFeedFilters, b: JobsFeedFilters) => a.sort === b.sort && a.search === b.search && a.india === b.india && a.location === b.location
  && setEq(a.employment, b.employment) && setEq(a.workMode, b.workMode) && setEq(a.experience, b.experience);
let roundTrips = 0;
for (let i = 0; i < 100; i += 1) {
  const f = randomFilters();
  const back = filtersFromParams(filtersToParams(f));
  /* Free text is trimmed on the way in; everything else must be identical. */
  const norm = { ...f, search: f.search.trim(), location: f.location.trim() };
  if (fieldEq(norm, back)) roundTrips += 1;
}
check('100/100 random states round-trip through the URL (field by field)', roundTrips === 100, `${roundTrips}/100`);
const every: JobsFeedFilters = { sort: 'newest', search: 'react', employment: new Set(['internship']), workMode: new Set(['remote']), experience: new Set(['lead']), india: 'pune', location: 'india' };
const ep = filtersToParams(every);
check('every field has its URL key', ep.get('q') === 'react' && ep.get('sort') === 'newest' && ep.get('emp') === 'internship' && ep.get('wm') === 'remote' && ep.get('exp') === 'lead' && ep.get('india') === 'pune' && ep.get('loc') === 'india');
check('sameFilters agrees with field equality on a changed chip', !sameFilters(every, { ...every, india: 'mumbai' }) && fieldEq(filtersFromParams(ep), every));
check('unknown enum values are dropped', filtersFromParams(new URLSearchParams('wm=remote,zeppelin&emp=bogus')).workMode.size === 1
  && filtersFromParams(new URLSearchParams('wm=remote,zeppelin&emp=bogus')).employment.size === 0);
check('an unknown India chip is ignored', filtersFromParams(new URLSearchParams('india=mars')).india === '');
check('multi-selects serialise sorted, so order does not make a new URL',
  filtersToParams({ ...DEFAULT_JOBS_FEED_FILTERS, workMode: new Set(['remote', 'hybrid']) }).toString()
  === filtersToParams({ ...DEFAULT_JOBS_FEED_FILTERS, workMode: new Set(['hybrid', 'remote']) }).toString());
check('long free text is capped', filtersFromParams(new URLSearchParams(`q=${'x'.repeat(500)}`)).search.length === 200);
check('the only sort written is newest', filtersToParams({ ...DEFAULT_JOBS_FEED_FILTERS, sort: 'newest' }).get('sort') === 'newest'
  && filtersToParams({ ...DEFAULT_JOBS_FEED_FILTERS, sort: 'recommended' }).get('sort') === null);

console.log('── 2. Filters → the feed\'s vocabulary ──');
const f1: JobsFeedFilters = { sort: 'newest', search: 'React dev', employment: new Set(['internship', 'full_time']), workMode: new Set(['remote', 'hybrid']), experience: new Set(['senior']), india: 'bengaluru', location: 'india' };
const q1 = new URLSearchParams(filtersToApiQuery(f1, 'CURSOR123'));
check('view=card is always requested', q1.get('view') === 'card');
check('page size is the page\'s', q1.get('pageSize') === String(JOBS_FEED_PAGE_SIZE));
check('search uses the card scope (title / organisation / location)', q1.get('search') === 'React dev' && q1.get('searchScope') === 'card');
check('multi-selects are comma-joined and sorted', q1.get('employmentType') === 'full_time,internship' && q1.get('workMode') === 'hybrid,remote' && q1.get('experienceLevel') === 'senior');
check('India chip → indiaBucket', q1.get('indiaBucket') === 'bengaluru');
check('location box → location', q1.get('location') === 'india');
check('newest → sort=newest', q1.get('sort') === 'newest');
check('the cursor passes through', q1.get('cursor') === 'CURSOR123');
check('no search → no searchScope', !new URLSearchParams(filtersToApiQuery(DEFAULT_JOBS_FEED_FILTERS)).has('searchScope'));
check('recommended sort sends no sort (the feed\'s default order)', !new URLSearchParams(filtersToApiQuery(DEFAULT_JOBS_FEED_FILTERS)).has('sort'));
const c1 = new URLSearchParams(filtersToCountQuery(f1));
check('the count query keeps every filter', c1.get('search') === 'React dev' && c1.get('searchScope') === 'card' && c1.get('indiaBucket') === 'bengaluru' && c1.get('workMode') === 'hybrid,remote');
check('and carries no paging, view, cursor or sort', !c1.has('pageSize') && !c1.has('view') && !c1.has('cursor') && !c1.has('sort'));

console.log('── 3. Pages append without repeats ──');
const j = (id: string) => ({ id });
check('a new page appends in order', appendPage([j('a'), j('b')], [j('c'), j('d')]).map((x) => x.id).join() === 'a,b,c,d');
check('an id already shown is not shown twice', appendPage([j('a'), j('b')], [j('b'), j('c')]).map((x) => x.id).join() === 'a,b,c');
check('a page repeating itself is collapsed', appendPage([], [j('a'), j('a')]).length === 1);
check('the existing array is not mutated', (() => { const e = [j('a')]; appendPage(e, [j('b')]); return e.length === 1; })());

console.log('── 4. The debouncer ──');
{
  const timers: Array<{ fn: () => void; ms: number; cleared: boolean }> = [];
  const d = createDebouncer(SEARCH_DEBOUNCE_MS, (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; }, (h) => { (h as { cleared: boolean }).cleared = true; });
  let fired = 0;
  d.call(() => { fired += 1; }); d.call(() => { fired += 1; }); d.call(() => { fired += 1; });
  check('three rapid calls schedule three timers, cancelling the first two', timers.length === 3 && timers[0].cleared && timers[1].cleared && !timers[2].cleared);
  check(`each waits ${SEARCH_DEBOUNCE_MS} ms`, timers.every((t) => t.ms === SEARCH_DEBOUNCE_MS));
  check('the pause is real (≥ 150 ms), so a keystroke is never a request', SEARCH_DEBOUNCE_MS >= 150 && timers.every((t) => t.ms >= 150));
  timers[2].fn();
  check('only the last call fires', fired === 1);
  d.call(() => { fired += 1; }); d.cancel();
  check('cancel drops a pending call', timers[3].cleared && fired === 1);
}

console.log('── 5. The controller ──');
type Row = { id: string };
type Deferred = { query: string; resolve: (p: JobsFeedPageResult<Row>) => void; reject: (e: unknown) => void; signal: AbortSignal };
async function controllerScenarios() {
  const pages: Deferred[] = []; const counts: Array<Deferred & { resolveCount: (n: number | null) => void }> = [];
  const states: JobsFeedState<Row>[] = [];
  const c = createJobsFeedController<Row>({
    /* Deliberately NOT rejecting on abort: a server that ignores the abort
       still answers, and only the controller's request-id guard may drop it. */
    fetchPage: (query, signal) => new Promise((resolve, reject) => { pages.push({ query, resolve, reject, signal }); }),
    fetchCount: (query, signal) => new Promise((resolve, reject) => { counts.push({ query, resolve: () => {}, resolveCount: resolve, reject, signal }); signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))); }),
    onState: (s) => states.push(s),
  });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const last = () => states[states.length - 1];

  c.setFilters(DEFAULT_JOBS_FEED_FILTERS);
  check('a filter state starts a page request and a count request', pages.length === 1 && counts.length === 1 && last().status === 'loading');
  /* The filters change before the first answer arrives. */
  c.setFilters({ ...DEFAULT_JOBS_FEED_FILTERS, india: 'india' });
  check('the older page request is aborted', pages[0].signal.aborted && counts[0].signal.aborted);
  check('a new pair is in flight', pages.length === 2 && !pages[1].signal.aborted);
  /* The OLD request answers late anyway (a server that ignored the abort). */
  pages[0].resolve({ items: [{ id: 'stale-1' }], hasNextPage: false, nextCursor: null }); await tick();
  check('a late answer to an older request is ignored', !last().items.some((r) => r.id === 'stale-1'));
  pages[1].resolve({ items: [{ id: 'a' }, { id: 'b' }], hasNextPage: true, nextCursor: 'CUR2', facets: { emp: {}, wm: {}, exp: {}, stats: { open: 2, companies: 1, remote: 0 } } }); await tick();
  check('the current answer is applied', last().status === 'ready' && last().items.map((r) => r.id).join() === 'a,b' && last().nextCursor === 'CUR2');
  check('facets ride along', last().facets?.stats?.open === 2);
  counts[1].reject(new Error('503')); await tick();
  check('a failed count is null, never 0', last().count === null && last().status === 'ready');

  c.loadMore();
  check('loadMore asks for the next cursor', pages.length === 3 && new URLSearchParams(pages[2].query).get('cursor') === 'CUR2' && last().status === 'loading-more');
  c.loadMore();
  check('a second loadMore while loading is ignored', pages.length === 3);
  pages[2].resolve({ items: [{ id: 'b' }, { id: 'c' }], hasNextPage: false, nextCursor: null }); await tick();
  check('the next page appends without repeating b', last().items.map((r) => r.id).join() === 'a,b,c' && last().hasNextPage === false);
  c.loadMore();
  check('no next page → no request', pages.length === 3);

  /* Filters change while a loadMore is in flight: the stale page must not land. */
  c.setFilters({ ...DEFAULT_JOBS_FEED_FILTERS, workMode: new Set(['remote']) });
  pages[3].resolve({ items: [{ id: 'r1' }], hasNextPage: true, nextCursor: 'R2' }); await tick();
  c.loadMore(); const lm = pages[4];
  c.setFilters({ ...DEFAULT_JOBS_FEED_FILTERS, workMode: new Set(['hybrid']) });
  lm.resolve({ items: [{ id: 'r2' }], hasNextPage: false, nextCursor: null }); await tick();
  check('a loadMore page arriving after the filters changed is dropped', !states.some((s) => s.items.some((r) => r.id === 'r2')));
  pages[5].reject(new Error('500')); await tick();
  check('a failed first page is an error state, not an empty list', last().status === 'error');
  c.retry();
  check('retry asks again for page one', pages.length === 7 && !new URLSearchParams(pages[6].query).has('cursor'));
  const n = states.length; c.dispose(); pages[6].resolve({ items: [{ id: 'z' }], hasNextPage: false, nextCursor: null }); await tick();
  check('after dispose nothing is applied', states.length === n);
}

controllerScenarios().then(() => {
  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
  process.exit(failed ? 1 : 0);
}).catch((e) => { console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1); });
