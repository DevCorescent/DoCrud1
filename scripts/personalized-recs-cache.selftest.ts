/**
 * The personalized scope caches the RANKING, and only for the viewer who owns it.
 *
 *   npx tsx scripts/personalized-recs-cache.selftest.ts
 *
 * ═══ WHAT WAS WRONG ═══
 *
 * `scope=personalized` returned before ever reaching the cache the other
 * recommendation scopes use — no 60 s entry, no stale-while-revalidate, no
 * single-flight. Because `page` sits in the client's `useCallback` deps, turning
 * to page 2 re-ran the entire ranking pass over 12,659 postings to produce
 * twenty rows that were already ordered.
 *
 * ═══ WHY THE RANKING AND NOT THE RESPONSE ═══
 *
 * Caching finished pages would make page 2 a miss and re-rank the corpus for
 * it. The ranking is page-independent; pagination, applied-job exclusion and the
 * ATS/eligibility enrichment are per-request and cheap — the enrichment only
 * ever touches the rows on the page.
 *
 * ═══ THE TWO THINGS THAT MUST NOT REGRESS ═══
 *
 *   1. ISOLATION. A personalized ranking is private. Its key must come from the
 *      SERVER-RESOLVED session id, never from anything a caller can send.
 *   2. FRESHNESS OF EXCLUSION. Applications are read every request, so applying
 *      to a job removes it from the very next response instead of lingering for
 *      the TTL.
 *
 * Source-level. No database, no network, no session.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const RAW = readFileSync('app/api/recommendations/jobs/route.ts', 'utf8');
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const fn = (name: string) => {
  const i = SRC.indexOf(`function ${name}(`);
  return i < 0 ? '' : SRC.slice(i, SRC.indexOf('\n}\n', i));
};

function keyIsPrivate() {
  console.log('\n── 1. The key identifies the viewer, from the server ──');
  const body = fn('computePersonalized');
  check('the key carries the resolved viewer id', /\$\{meId\}:personalized:/.test(body));
  /* THE isolation regression: any request-derived value in the key lets a
     caller select someone else's ranking. */
  check('the key is not built from request input',
    !/params\.get|searchParams|request\.|req\./.test(body));
  check('the viewer id reaches this function as an argument, not from a header',
    /function computePersonalized\(\s*meId: string \| null,/.test(SRC)
    || /computePersonalized\(\s*\n?\s*meId/.test(SRC));
  /* The route resolves it from the session and refuses without one. */
  check('the route resolves the id from the session',
    SRC.includes('resolveSessionUserId(session)'));
  check('and refuses an unauthenticated personalized request',
    /if \(!meId\) return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\)/.test(SRC));
}

function profileEditsInvalidate() {
  console.log('\n── 2. A changed profile is a different key ──');
  const body = fn('computePersonalized');
  check('the key carries the profile version', /personalized:v\$\{profileVersion\}/.test(body));
  check('the version is read from the profile, not assumed',
    /profileVersion\?: unknown/.test(body) && body.includes("'profileVersion'"));
  check('the profile is read on every request, before the cache is consulted',
    body.indexOf('getProfileFields(') < body.indexOf('cachedRanking('));
}

function exclusionStaysFresh() {
  console.log('\n── 3. Applying to a job takes effect immediately ──');
  const body = fn('computePersonalized');
  const rank = fn('rankPersonalized');
  /* THE regression: move the applications read inside the cached ranking and an
     applied job keeps appearing until the entry expires. */
  /* The accessor is the STRICT one — a storage failure must not read as
     "applied to nothing" (see applied-exclusion-integrity.selftest.ts). What
     this file guards is WHERE it is read, not which reader is used. */
  check('applications are read in the per-request path',
    /getHiringApplications(Strict)?\(\)/.test(body));
  check('and NOT inside the cached ranking',
    !/getHiringApplications(Strict)?\(\)/.test(rank));
  check('the applied set is still built from this viewer only',
    /a\?\.candidateUserId === meId/.test(body));
  check('and still feeds appliedJobIds', /appliedJobIds: new Set\(applications\.map/.test(body));
}

function paginationIsOutsideTheCache() {
  console.log('\n── 4. Page 2 does not re-rank ──');
  const rank = fn('rankPersonalized');
  const body = fn('computePersonalized');
  check('the ranking function takes no page argument',
    !/\bpage\b/.test(rank.slice(0, rank.indexOf('{'))));
  check('the corpus is read only inside the ranking',
    rank.includes('getPublishedHiringJobs()') && !body.includes('getPublishedHiringJobs()'));
  check('pagination happens after the cache lookup',
    body.indexOf('cachedRanking(') < body.indexOf('personalizedPage('));
  check('personalizedPage still receives page and pageSize',
    /page,\s*pageSize,\s*\}\);/.test(body));
}

function reusesExistingSemantics() {
  console.log('\n── 5. The same TTL, stale window and single-flight ──');
  const cr = fn('cachedRanking');
  check('fresh entries are served as-is', cr.includes('age < CACHE_TTL'));
  check('stale entries are served while refreshing', cr.includes('age < STALE_TTL'));
  check('a refresh runs at most once per key', cr.includes('rankingInFlight.has(key)'));
  check('concurrent cold callers share one pass', /const pending = rankingInFlight\.get\(key\)/.test(cr));
  check('the in-flight entry is always released', /\.finally\(\(\) => \{ rankingInFlight\.delete\(key\)/.test(cr));
  /* A failed refresh must not overwrite a good answer with an empty success. */
  check('a failed background refresh keeps the good entry',
    /\.catch\(\(error\) => \{ console\.error\('\[recommendations\/personalized\]/.test(cr));
  check('only a successful computation is stored',
    /if \(fresh\) rankingCache\.set/.test(cr));
  check('the TTLs are the shared constants, not new ones',
    !/const CACHE_TTL|const STALE_TTL/.test(cr));
}

function clearedOnJobWrite() {
  console.log('\n── 6. A job write drops it, like the other scopes ──');
  check('the ranking cache is registered for invalidation',
    /registerRecommendationCache\(rankingCache\)/.test(SRC));
  check('the original scope cache is still registered too',
    /registerRecommendationCache\(cache\)/.test(SRC));
}

function rankingLogicUntouched() {
  console.log('\n── 7. The ranking itself did not change ──');
  const rank = fn('rankPersonalized');
  check('the same scorer is called', rank.includes('recommendMatch(profile, recJob, now)'));
  check('the same tie-break survives',
    /b\.score - a\.score \|\| Date\.parse\(String\(b\.createdAt\)\) - Date\.parse\(String\(a\.createdAt\)\)/.test(rank));
  check('the recommended filter is unchanged',
    /scored\.filter\(\(s\) => s\.recommended\)\.map\(\(s\) => s\.raw\)/.test(rank));
  check('the candidate is still built only when there are signals',
    rank.includes('showMatch') && rank.includes('MatchCandidate | null'));
  check('eligibility preferences are still derived the same way',
    rank.includes('buildEligibilityProfile(') && rank.includes('toEligibilityPreferences('));
  check('an empty corpus still yields an empty page, not an error',
    rank.includes('return null;') && /ranking\) return \{ items: \[\], page: 1, pageSize, total: 0, scored: false \}/.test(fn('computePersonalized')));
}

function main() {
  keyIsPrivate();
  profileEditsInvalidate();
  exclusionStaysFresh();
  paginationIsOutsideTheCache();
  reusesExistingSemantics();
  clearedOnJobWrite();
  rankingLogicUntouched();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
