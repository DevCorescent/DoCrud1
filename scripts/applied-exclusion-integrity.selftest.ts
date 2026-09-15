/**
 * A storage failure must never read as "this member has applied to nothing".
 *
 *   npx tsx scripts/applied-exclusion-integrity.selftest.ts
 *
 * ═══ THE SILENT FAILURE THIS PREVENTS ═══
 *
 * The applied set is the reason a job LEAVES a member's recommendations. Its
 * empty value is meaningful — "applied to nothing" — so a read that degrades to
 * `[]` on failure does not degrade, it INVERTS: applied-job exclusion switches
 * off and roles the member already applied to come back, behind an HTTP 200
 * that is indistinguishable from a correct feed.
 *
 * Two layers used to do exactly that:
 *
 *     readJsonFile(hiringApplicationsPath, [])   // storage.ts — swallows, returns []
 *     .catch(() => [])                            // the route — swallows again
 *
 * The corpus read beside it was deliberately left unguarded for this very
 * reason, with a comment saying so. The applied set was the other half of that
 * pair and never got the same treatment. `getApplicationCountsByJob` had
 * already made the strict choice against this same file.
 *
 * ABSENT is still `[]` — nobody has applied yet is a real answer, and as of
 * this writing it is the production state (the app_state key does not exist).
 * Only a FAILED read throws.
 *
 * Source-level plus a behavioural check of the storage contract. No network.
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
const ROUTE = strip(readFileSync('app/api/recommendations/jobs/route.ts', 'utf8'));
const HIRING = strip(readFileSync('lib/server/hiring.ts', 'utf8'));
const STORAGE = readFileSync('lib/server/storage.ts', 'utf8');

function readIsStrict() {
  console.log('\n── 1. The recommendation path reads strictly ──');
  check('a strict accessor exists for the applied set',
    /export async function getHiringApplicationsStrict\(\)/.test(HIRING));
  check('it uses readJsonFileStrict', /readJsonFileStrict<HiringJobApplication\[\]>/.test(HIRING));
  check('the route calls the strict accessor',
    ROUTE.includes('getHiringApplicationsStrict()'));
  /* THE regression: either layer re-swallowing restores the defect. */
  check('the route no longer swallows the failure',
    !/getHiringApplicationsStrict\(\)[\s\S]{0,200}?\.catch\(\(\) => \[\]\)/.test(ROUTE));
  check('and does not fall back to the non-strict accessor',
    !/\bgetHiringApplications\(\)/.test(ROUTE));
}

function absentIsStillEmpty() {
  console.log('\n── 2. An empty store is still a successful empty feed ──');
  /* The distinction the strict reader exists to make. Absent must NOT throw:
     today no member has applied, so throwing here would take the whole feed
     down for everyone. */
  const fn = STORAGE.slice(STORAGE.indexOf('export async function readJsonFileStrict'));
  check('strict reads document present / absent / failed',
    /present\s+→|absent\s+→|failed\s+→/.test(STORAGE.slice(0, STORAGE.indexOf('export async function readJsonFileStrict'))));
  check('absent returns the caller\'s fallback', fn.includes('fallbackWhenAbsent'));
  check('only a failed read throws', /throw new StorageReadError/.test(fn));
  check('the accessor passes [] as the absent value',
    /getHiringApplicationsStrict[\s\S]{0,400}hiringApplicationsPath, \[\]/.test(HIRING));
}

function failureCannotPoisonTheCache() {
  console.log('\n── 3. A failure reaches 503 and caches nothing ──');
  const body = ROUTE.slice(ROUTE.indexOf('function computePersonalized'),
    ROUTE.indexOf('async function cachedRanking'));
  /* Ordering is the guarantee: the read is awaited BEFORE the ranking cache is
     consulted, so a rejection leaves no entry behind. */
  check('applications are awaited before the ranking cache',
    body.indexOf('getHiringApplicationsStrict()') < body.indexOf('cachedRanking('),
    `${body.indexOf('getHiringApplicationsStrict()')} < ${body.indexOf('cachedRanking(')}`);
  check('the route answers 503 rather than a 200 with an empty feed',
    /\{ status: 503 \}/.test(ROUTE));
  check('the failure is logged', /console\.error\('\[recommendations\/jobs\] GET error'/.test(ROUTE));
  check('the 503 is not a success shape carrying zero results',
    /error: 'Recommendations are temporarily unavailable\.'/.test(ROUTE));
}

function exclusionSemanticsUnchanged() {
  console.log('\n── 4. What is excluded, and for whom, did not change ──');
  check('the applied set is still scoped to this viewer',
    /a\?\.candidateUserId === meId/.test(ROUTE));
  check('it is still keyed by jobId', /appliedJobIds: new Set\(applications\.map\(\(a\) => String\(a\.jobId\)\)\)/.test(ROUTE));
  /* Freshness: applications must stay OUT of the cached ranking, or an applied
     job lingers for the TTL. */
  const rank = ROUTE.slice(ROUTE.indexOf('async function rankPersonalized'));
  check('applications are not read inside the cached ranking',
    !rank.includes('getHiringApplicationsStrict()'));
  check('other callers keep the non-strict accessor',
    /export async function getHiringApplications\(\)/.test(HIRING)
    && /readJsonFile<HiringJobApplication\[\]>/.test(HIRING));
}

function main() {
  readIsStrict();
  absentIsStillEmpty();
  failureCannotPoisonTheCache();
  exclusionSemanticsUnchanged();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
