/**
 * One public job costs one document, not the corpus.
 *
 *   npx tsx scripts/public-job-detail-lookup.selftest.ts
 *
 * ═══ THE COST THIS PREVENTS ═══
 *
 * `/api/jobs/public/[jobId]` answered "show me this posting" by loading EVERY
 * posting and calling `.find()` on the array. The employer-facing detail route
 * had the same defect and measured 238,107 ms -> 314 ms when it was fixed; this
 * one was never converted.
 *
 * The Redis cache hid it. A cache HIT is cheap, so the endpoint looked healthy
 * — but every cold key (a new posting, an expired entry, a link arriving from
 * search) paid for the whole corpus: 12,659 documents, 72.0 MB, measured.
 *
 * `_id` IS the posting id, so a primary-key lookup answers this at any corpus
 * size. The corpus read survives only as the fallback for a store that cannot
 * answer for certain — an unavailable collection must stay slow, never become
 * a 404 for a posting that exists.
 *
 * Source-level assertions. No database, no network.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const ROUTE = 'app/api/jobs/public/[jobId]/route.ts';
const raw = readFileSync(ROUTE, 'utf8');
/* Comments describe the defect, so they must not be able to satisfy a check. */
const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function targetedFirst() {
  console.log('\n── 1. The targeted lookup is the primary path ──');
  check('the route selects one published doc by id',
    src.includes('selectPublishedJobDocById(params.jobId)'));

  /* THE regression: if the corpus read runs first, or unconditionally, the
     whole point is gone. */
  const iSel = src.indexOf('selectPublishedJobDocById(');
  const iCorpus = src.indexOf('getHiringJobsCached(');
  check('the corpus read is not reached before it',
    iSel >= 0 && iCorpus >= 0 && iSel < iCorpus, `${iSel} < ${iCorpus}`);
  check('the corpus read is conditional, not a separate statement',
    /found\s*\?[\s\S]{0,80}getHiringJobsCached\(\)/.test(src));
}

function failureIsNotNotFound() {
  console.log('\n── 2. "Store cannot answer" is not "no such job" ──');
  /* selectPublishedJobDocById returns null when the store could not answer and
     { job: null } when it answered "nothing". Collapsing the two would 404 a
     posting that exists whenever the collection is unavailable. */
  check('a null selector result falls back rather than 404ing',
    /const job = found\s*$|\bfound\s*\?/m.test(src) && src.includes('found.job'));
  check('the fallback still uses the cached accessor',
    /getHiringJobsCached\(\)\)\.find\(/.test(src));
}

function visibilityUnchanged() {
  console.log('\n── 3. What the public may see did not widen ──');
  /* isJobActive is the single definition of public visibility: a draft, closed
     or expired posting is never served, whichever path found it. */
  check('isJobActive still gates the response', /job && isJobActive\(job\)/.test(src));
  check('the view is still built by publicJobView', src.includes('publicJobView(job)'));
  check('a miss is still null, so the 404 shape is unchanged',
    src.includes(': null') && src.includes("{ error: 'Job not found.' }"));
  check('the selector filters to published',
    readFileSync('lib/server/db/hiring-jobs-collection.ts', 'utf8')
      .includes('findOne({ _id: id as never, ...PUBLISHED })'));
}

function cacheUnchanged() {
  console.log('\n── 4. The cache contract is untouched ──');
  check('still cached per posting', src.includes("kind: 'detail'"));
  check('still caches the null answer', src.includes('Record<string, unknown> | null'));
  check('still public-only, no session read',
    !src.includes('getAuthSession') && !src.includes('resolveSessionUserId'));
  check('the TTL was not changed', src.includes('TTL.publicDetail'));
}

function main() {
  targetedFirst();
  failureIsNotNotFound();
  visibilityUnchanged();
  cacheUnchanged();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
