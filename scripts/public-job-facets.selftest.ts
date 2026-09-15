/**
 * The filter rail's counts are global, and the feed's sort keeps its index.
 *
 *   npx tsx scripts/public-job-facets.selftest.ts
 *
 * ═══ WHAT THIS PROTECTS ═══
 *
 * `JobsFeedPage` shows a count beside every employment type, work mode and
 * experience level. It computes them with `useMemo(..., [all])` — over the
 * WHOLE published corpus, never over the filtered result — which is why
 * selecting "Remote" does not change the number beside "Full-time".
 *
 * Serving those counts from the API is what lets that page stop downloading
 * 12,662 postings (6.15 MB) to render twenty. Two things can quietly break it:
 *
 *   1. Computing the counts AFTER the request's filters. The rail would then
 *      report a refinement rather than the corpus, and every number would move
 *      when a filter was clicked.
 *   2. Folding the branches into the page pipeline's `$facet`. Sub-pipelines
 *      cannot use an index, so the `$sort` would come inside with them and go
 *      back to an in-memory sort — measured 294 ms against 157 ms, and it is
 *      exactly the blocking sort that produced `Sort exceeded memory limit of
 *      33554432 bytes` and a 500 on this endpoint at ~3,000 postings.
 *
 * Source-level. No database, no network — the count equivalence itself is
 * proven against the live corpus separately.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const QUERY = strip(readFileSync('lib/server/db/public-jobs-query.ts', 'utf8'));
const ROUTE = strip(readFileSync('app/api/jobs/public/route.ts', 'utf8'));
const FEED = readFileSync('components/JobsFeedPage.tsx', 'utf8');

function countsAreGlobal() {
  console.log('\n── 1. Counts describe the corpus, not the filtered page ──');
  const fn = QUERY.slice(QUERY.indexOf('export async function selectPublicJobFacetCounts'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));

  check('the selector exists', body.length > 0);
  check('it starts from the published predicate',
    /\$match: \{ status: 'published' \} \}/.test(body));
  /* THE regression: applying the request's conditions here turns a corpus
     count into a filtered one. */
  check('it never applies the request query',
    !body.includes('buildPublicJobsConditions') && !body.includes('query.'));
  check('it takes no query argument at all',
    /selectPublicJobFacetCounts\(\s*opts: PublicQueryOptions = \{\},?\s*\)/.test(fn));
  check('it stays inside the feed universe when freshness is on',
    body.includes('publicFreshnessEnabled()') && body.includes('publiclyFreshCond'));
}

function bucketsMirrorTheClient() {
  console.log('\n── 2. The buckets are the ones the rail renders ──');
  const fn = QUERY.slice(QUERY.indexOf('const FACET_FIELDS'));
  for (const field of ['employmentType', 'workMode', 'experienceLevel']) {
    check(`${field} is counted`, fn.includes(`'${field}'`));
  }
  check('keys match the client shape (emp / wm / exp)',
    /'emp', 'employmentType'/.test(fn) && /'wm', 'workMode'/.test(fn) && /'exp', 'experienceLevel'/.test(fn));

  /* The client does `const e = j.employmentType || ''; if (e) …` — absent and
     empty both contribute to nothing. An "" bucket would render a blank row. */
  check('absent and empty values are excluded, never bucketed as ""',
    /\$nin: \[null, ''\]/.test(fn));
  check('and a non-string bucket is dropped rather than coerced',
    /typeof b\._id !== 'string' \|\| b\._id === ''/.test(fn));
  check('values are not lowercased, matching the client loop',
    !/toLower/.test(fn.slice(0, fn.indexOf('return out;'))));
}

function pageSortKeepsItsIndex() {
  console.log('\n── 3. The page pipeline was not restructured ──');
  const pipe = QUERY.slice(QUERY.indexOf('export function buildPublicJobsCollectionPipeline'));
  const body = pipe.slice(0, pipe.indexOf('\n}\n'));
  const iSort = body.indexOf('$sort');
  const iFacet = body.indexOf('$facet');
  check('the page sort is still OUTSIDE $facet', iSort >= 0 && iFacet >= 0 && iSort < iFacet,
    `sort@${iSort} facet@${iFacet}`);
  check('it still sorts on the persisted key', body.includes('persistedSortField(query.sort)'));
  check('the facet counts are a separate aggregation',
    QUERY.indexOf('selectPublicJobFacetCounts') !== -1
    && !body.includes('FACET_FIELDS'));
  check('no allowDiskUse workaround was introduced', !/allowDiskUse/.test(QUERY));
}

function responseIsAdditive() {
  console.log('\n── 4. The response only gained a field ──');
  check('facets are attached to the payload', ROUTE.includes('.facets = facets'));
  check('only when they were actually read', /payload && facets/.test(ROUTE));
  /* A failed count must not fail the feed. */
  check('a facet failure degrades to no field', /\.catch\(\(\) => null\)/.test(ROUTE));
  check('they have their own cache entry, not one per query shape',
    /kind: 'facets', params: \{\}/.test(ROUTE));
  for (const field of ['items', 'page', 'pageSize', 'total']) {
    check(`${field} is still produced`, QUERY.includes(`${field}:`) || QUERY.includes(`${field},`));
  }
}

function clientContractUnchanged() {
  console.log('\n── 5. The client semantics this mirrors ──');
  /* If the page ever starts computing facets from the filtered list, these
     server counts stop matching it and the rail silently disagrees with
     itself. Pin the dependency that makes them global. */
  const memo = FEED.slice(FEED.indexOf('const facets = useMemo'));
  check('the client still derives facets from the full list, not the filtered one',
    /\}, \[all\]\);/.test(memo.slice(0, memo.indexOf('\n\n'))));
  check('and still skips empty values', /if \(e\) emp\[e\]/.test(memo));
}

function main() {
  countsAreGlobal();
  bucketsMirrorTheClient();
  pageSortKeepsItsIndex();
  responseIsAdditive();
  clientContractUnchanged();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
