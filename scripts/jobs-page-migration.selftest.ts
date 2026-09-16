/**
 * P2D — the Jobs page is server-driven, and stays that way.
 *
 * Run: npm run test:jobs-page-migration
 *
 * Source-level pins on components/JobsFeedPage.tsx and the modules it uses:
 *  · no full-corpus request anywhere in the page or its data layer;
 *  · the list comes from /api/jobs/public with view=card, the count from
 *    /api/jobs/public/count, the facets from the response;
 *  · filters are the URL (read from useSearchParams, written with
 *    router.replace, ?recommended=1 preserved); typed search is debounced;
 *  · requests are aborted and answered in order (the controller), pages are
 *    appended without repeats, a failed page is an error state and a failed
 *    count is null — never "0 jobs";
 *  · numbered pagination is gone; Load More is cursor-driven;
 *  · the recommended-only path is untouched.
 * Source-level. No database, no network, no browser.
 */
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) { if (cond) { passed += 1; return; } failed += 1; console.error(`  ✗ ${label}`); }
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PAGE_RAW = readFileSync('components/JobsFeedPage.tsx', 'utf8');
const PAGE = strip(PAGE_RAW);
const LIB = strip(readFileSync('lib/jobs-feed.ts', 'utf8'));
const CARD = strip(readFileSync('components/jobs/JobSummaryCard.tsx', 'utf8'));

console.log('── 1. No full corpus reaches the browser ──');
check('the page never requests the legacy full list', !/\/api\/public\/hiring\/jobs/.test(PAGE));
check('nor does the data layer', !/\/api\/public\/hiring\/jobs/.test(LIB));
check('nor the card', !/\/api\/public\/hiring\/jobs|\/api\/jobs\/public/.test(CARD));
check('no state holds "all" jobs', !/useState<JobSummary\[\]>\(\[\]\)[\s\S]{0,40}all\b/.test(PAGE) && !/\bsetAll\b/.test(PAGE));
check('no client-side filter over a corpus', !/const source = recommendedOnly \? recommended : all/.test(PAGE));
check('no client-side pagination', !/\.slice\(\(page - 1\)/.test(PAGE) && !/totalPages/.test(PAGE) && !/<Pagination/.test(PAGE));
check('no corpus-wide memos', !/\}, \[all\]\)/.test(PAGE));

console.log('── 2. The server answers list, count and facets ──');
check('the list is /api/jobs/public', /fetch\(`\/api\/jobs\/public\?\$\{query\}`/.test(PAGE));
check('with the card projection', /p\.set\('view', 'card'\)/.test(LIB));
check('and the card scope for search', /p\.set\('searchScope', 'card'\)/.test(LIB));
check('the count is /api/jobs/public/count', /fetch\(`\/api\/jobs\/public\/count\?\$\{query\}`/.test(PAGE));
check('facets are read from the response', /facets: d\.facets \?\? null/.test(PAGE) && /feed\.facets\?\.emp/.test(PAGE));
check('the header figures are the server stats', /stats\.open/.test(PAGE) && /stats\.companies/.test(PAGE) && /stats\.remote/.test(PAGE));
check('a non-OK page throws (never an empty list)', /if \(!r\.ok\) throw new Error\(`jobs \$\{r\.status\}`\)/.test(PAGE));
check('a malformed page throws', /throw new Error\('jobs: malformed page'\)/.test(PAGE));
check('a non-OK count is null', /if \(!r\.ok\) return null;/.test(PAGE));
check('the count is only shown when known', /total !== null && \(/.test(PAGE));

console.log('── 3. The URL is the filter state ──');
check('filters are derived from the URL', /filtersFromParams\(searchParams/.test(PAGE));
check('and written with router.replace', /router\.replace\(qs \? `\$\{pathname\}\?\$\{qs\}` : pathname, \{ scroll: false \}\)/.test(PAGE));
check('other params (?recommended=1) are preserved', /new URLSearchParams\(searchParams\?\.toString\(\) \?\? ''\)/.test(PAGE) && /for \(const k of \['q', 'india', 'loc', 'emp', 'wm', 'exp', 'sort'\]\) params\.delete\(k\)/.test(PAGE));
check('the controller follows the URL', /useEffect\(\(\) => \{ controller\.current\?\.setFilters\(filters\); \}, \[filters\]\)/.test(PAGE));
check('typed search is debounced with the shared constant', /createDebouncer\(SEARCH_DEBOUNCE_MS\)/.test(PAGE) && /debouncer\.current\.call\(/.test(PAGE));
check('the debounce is not zero', /export const SEARCH_DEBOUNCE_MS = (\d+)/.test(LIB) && Number(/export const SEARCH_DEBOUNCE_MS = (\d+)/.exec(LIB)![1]) >= 150);
check('the search box follows the URL on Back/Forward', /setSearchInput\(\(cur\) => \(cur\.trim\(\) === filters\.search \? cur : filters\.search\)\)/.test(PAGE));

console.log('── 4. Requests are aborted, ordered, de-duplicated ──');
check('the page passes the abort signal to fetch', /\{ cache: 'no-store', signal \}/.test(PAGE));
check('the controller aborts in-flight work on a new filter state', /const abortInFlight = \(\) => \{ if \(inFlight\) \{ inFlight\.abort\(\)/.test(LIB) && /const loadFirst = \(\) => \{\s*abortInFlight\(\);/.test(LIB));
check('and ignores answers to older requests', /if \(disposed \|\| id !== requestId\) return;/.test(LIB));
check('pages append through appendPage (no repeats)', /appendPage\(state\.items, page\.items\)/.test(LIB));
check('a loadMore answer is dropped if the cursor moved', /state\.nextCursor !== cursor\) return;/.test(LIB));
check('a failed first page is an error state', /emit\(\{ status: 'error' \}\)/.test(LIB));
check('a failed count stays null', /count: typeof n === 'number' && Number\.isFinite\(n\) && n >= 0 \? n : null/.test(LIB));

console.log('── 5. Load More, not page numbers ──');
check('LoadMore renders the cursor state', /<LoadMore/.test(PAGE) && /hasNext=\{feed\.hasNextPage\}/.test(PAGE) && /onMore=\{\(\) => controller\.current\?\.loadMore\(\)\}/.test(PAGE));
check('and is not shown in recommended-only mode', /\{!recommendedOnly && \(\s*<div className="mt-10">\s*<LoadMore/.test(PAGE));
check('the retry re-asks the server', /controller\.current\?\.retry\(\)/.test(PAGE));

console.log('── 6. The recommended-only path is unchanged ──');
check('still the viewer\'s matched set', /'\/api\/recommendations\/jobs\?scope=recommended'/.test(PAGE));
check('still requires a real matchScore', /\.filter\(\(j\) => typeof j\.matchScore === 'number'\)/.test(PAGE));
check('still filtered with the page\'s original predicate', /matchesIndiaFilter\(j\.location \|\| '', j\.workMode \|\| undefined, filters\.india\)/.test(PAGE) && /const hay = `\$\{j\.title\} \$\{j\.organizationName \|\| ''\} \$\{j\.location \|\| ''\}`\.toLowerCase\(\)/.test(PAGE));
check('the banner still waits for the request', /recommendedOnly && recState === 'ready' &&/.test(PAGE_RAW));

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
