/**
 * The sitemap builds from a projection, not from the corpus.
 *
 *   npx tsx scripts/sitemap-scale.selftest.ts
 *
 * ═══ THE BUILD FAILURE THIS PREVENTS ═══
 *
 *   Error: Static page generation for /sitemap.xml is still timing out
 *          after 3 attempts.
 *
 * /sitemap.xml is statically prerendered, so every data source it reads runs
 * during `npm run build`. Measured against the live corpus, source by source:
 *
 *   jobs          75,968 ms   12,662 rows   <- 95% of the entire page
 *   templates      1,141 ms
 *   transfers        742 ms
 *   businesses       658 ms
 *   blog / docrudians / certificates / virtualIds / gigs   ~240 ms each
 *
 * One read was the whole problem. `getPublishedHiringJobList()` returns full
 * list rows — title, company, location, facets — for all 12,659 published
 * postings, and the sitemap uses exactly three fields of each: `id`,
 * `updatedAt`, `createdAt`.
 *
 *   before   getPublishedHiringJobList()   75,968 ms
 *   after    projected sitemap rows        21,824 ms   1.5 MB
 *   sitemap() end to end                   ~80 s  ->  20,445 ms
 *
 * This is the identical fix `selectPublicFileTransferSitemapRows` already
 * applies for transfers, and its comment describes the same defect: a list of
 * URLs does not need the documents.
 *
 * Asserted here without a database or a network call.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const SITEMAP = 'app/sitemap.ts';
const COL = 'lib/server/db/hiring-jobs-collection.ts';

function projectedRead() {
  console.log('\n── 1. The sitemap reads a projection ──');
  const s = code(read(SITEMAP));

  /* THE regression: one call here puts 76 s back into the build. */
  check('the sitemap no longer takes the full published list',
    !s.includes('getPublishedHiringJobList('));
  check('it takes the projected sitemap rows', s.includes('getPublishedJobsForSitemap('));

  const col = code(read(COL));
  const sel = col.slice(col.indexOf('export async function selectPublishedJobSitemapRows'));
  check('the projection is done in the database',
    /projection: \{ _id: 0, id: 1, updatedAt: 1, createdAt: 1 \}/.test(sel));
  check('it filters to published using the shared predicate', sel.includes('.find(PUBLISHED,'));
  /* A sitemap file may hold at most 50,000 URLs. */
  check('the row count is bounded', /Math\.min\(50_000, limit\)/.test(sel));
  check('an unreadable collection reports null, never an empty list',
    /Promise<JobSitemapRow\[\] \| null>/.test(sel) && sel.includes('return null;'));
}

function onlyWhatIsUsed() {
  console.log('\n── 2. The projection carries exactly what the entries read ──');
  const s = read(SITEMAP);

  /* If an entry ever reads a fourth field, the projection must grow with it —
     otherwise the URL silently gets a wrong lastModified. */
  const entry = s.slice(s.indexOf('const jobEntries'), s.indexOf('const certificateEntries'));
  const fields = Array.from(entry.matchAll(/job\.(\w+)/g)).map((m) => m[1]);
  const allowed = new Set(['id', 'updatedAt', 'createdAt']);
  check('job entries read only id, updatedAt and createdAt',
    fields.every((f) => allowed.has(f)), `reads: ${Array.from(new Set(fields)).join(', ')}`);
  check('the URL shape is unchanged', entry.includes('${baseUrl}/jobs/${job.id}'));
  check('lastModified still falls back through updatedAt -> createdAt -> now',
    entry.includes('job.updatedAt || job.createdAt || now'));
}

function fallbackPreserved() {
  console.log('\n── 3. Nothing silently loses its URLs ──');
  const hiring = code(read('lib/server/hiring.ts'));
  const wrapper = hiring.slice(hiring.indexOf('export async function getPublishedJobsForSitemap'));

  /* An unavailable collection must yield a SLOWER sitemap, never one with the
     jobs missing. */
  check('a null projection falls back to the full list',
    wrapper.includes('const list = await getPublishedHiringJobList();'));
  check('the fallback is bounded by the same limit', wrapper.includes('list.slice(0, limit)'));

  const s = code(read(SITEMAP));
  /* The narrow catch that lets CI build without MongoDB, unchanged: absent
     database yields no job URLs; a real failure with a database configured
     still throws. */
  check('an absent database still yields an empty job list for CI',
    /if \(!isDatabaseConfigured\(\)\) return \[\];/.test(s));
  check('a genuine read failure still propagates', /throw error;/.test(s));
  check('no category was removed',
    ['certificates', 'virtualIds', 'docrudians', 'blogPosts', 'gigs',
      'businesses', 'resumeDir', 'templates', 'fileTransfers'].every((k) => s.includes(k)));
  check('no empty-sitemap shortcut was introduced',
    !/catch[\s\S]{0,80}return \[\];\s*\}\s*\)?\s*;?\s*$/m.test(wrapper));
}

function renderingStrategyUnchanged() {
  console.log('\n── 4. The rendering strategy was not the fix ──');
  const s = read(SITEMAP);

  /* `force-dynamic` was tried here before and REMOVED: it pins revalidate to 0,
     so the sitemap rebuilt on every request at a measured 12.8 s. Re-adding it
     would trade a build failure for a per-request one. The cost was the query,
     so the query is what changed. */
  check('force-dynamic was not reintroduced', !/export const dynamic\s*=\s*'force-dynamic'/.test(s));
  check('hourly revalidation is preserved', /export const revalidate = 3600/.test(s));
  check('the file records why force-dynamic is absent', s.includes('silently defeated it'));
}

function main() {
  projectedRead();
  onlyWhatIsUsed();
  fallbackPreserved();
  renderingStrategyUnchanged();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
