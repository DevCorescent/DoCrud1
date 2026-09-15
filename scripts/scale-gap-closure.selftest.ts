/**
 * Phase 9.1 — the remaining full-corpus hot paths, closed.
 *
 *   npx tsx scripts/scale-gap-closure.selftest.ts
 *
 * Phase 9 fixed `/api/hiring/jobs/[jobId]` (238,107 ms -> 314 ms) and named
 * two siblings with the same defect. This file guards their fixes, plus the
 * second homepage read found by isolating that path.
 *
 * ═══ MEASURED, live corpus, laptop -> Atlas ═══
 *
 *   /mine        find({organizationId:$in})    285 ms   0.0026 MB   2 docs
 *                getHiringJobs()+filter    230,436 ms  19.32   MB   7,106 docs
 *                -> same job set, proven before the change
 *
 *   /applicants  by-id read, same as the detail route it mirrors
 *
 *   homepage     countPublishedJobs     2,765 ms
 *                users                  8,708 ms   0.52 MB
 *                history                  257 ms
 *                transfers             77,567 ms   6.9  MB   <- 98.5% of the path
 *
 * No database here: shape is asserted over the source, and the live numbers
 * above are what justified each change.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
/* Doc comments quote the defects they replaced, so structure is checked on code. */
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const MINE = 'app/api/hiring/jobs/mine/route.ts';
const APPLICANTS = 'app/api/hiring/jobs/[jobId]/applicants/route.ts';
const HOME = 'lib/server/public-home-metrics.ts';
const JOBS_COL = 'lib/server/db/hiring-jobs-collection.ts';
const XFER_COL = 'lib/server/db/file-transfers-rows.ts';

function mine() {
  console.log('\n── 1. /mine reads the employer\'s jobs, not every job ──');
  const src = code(read(MINE));

  check('the corpus is no longer loaded', !src.includes('getHiringJobs('));
  check('jobs are scoped in the query', src.includes('selectJobDocsByOrganizations(orgIds)'));
  check('the JavaScript filter over the corpus is gone',
    !/allJobs\.filter\(\(j\) => orgIds\.includes/.test(src));

  /* Scoping still comes from the actor's organizations — the same rule, applied
     in the database instead of in memory. */
  /* Positions compare the CALLS, not the import lines at the top of the file —
     an import sits before everything and would make either check vacuous. */
  const readAt = src.indexOf('selectJobDocsByOrganizations(orgIds)');
  check('scope still derives from viewerOrganizationIds',
    src.indexOf('viewerOrganizationIds(actor)') < readAt);
  check('authorization still precedes the read',
    src.indexOf('getAuthSession()') < readAt);

  /* The selector answers null on a storage failure. Turning that into [] would
     tell an employer their postings had vanished. */
  check('a storage failure is a 500, not an empty job list',
    /if \(!owned\) \{[\s\S]{0,200}status: 500/.test(src));
  check('applications are still filtered to owned jobs', src.includes('ownedIds.has(a.jobId)'));
  /* The presentation layer is untouched: search, status, sort, paging. */
  /* `sort` is cast — `sort: (q.get('sort') as ...)` — so the match allows an
     optional paren rather than demanding the bare call. */
  check('employerJobs still receives the same options',
    ['search', 'status', 'state', 'sort', 'page', 'pageSize']
      .every((k) => new RegExp(`${k}: \\(?q\\.get\\('${k}'\\)`).test(src)));

  const col = code(read(JOBS_COL));
  const sel = col.slice(col.indexOf('export async function selectJobDocsByOrganizations'));
  check('the selector filters by organizationId in Mongo',
    sel.includes('organizationId: { $in: ids }'));
  check('no organizations means an empty answer without a query',
    sel.includes('if (ids.length === 0) return [];'));
  check('the selector reports failure as null, never []',
    /Promise<HiringJobPosting\[\] \| null>/.test(sel) && sel.includes('return null;'));
}

function applicants() {
  console.log('\n── 2. /applicants reads one job ──');
  const src = code(read(APPLICANTS));

  check('the corpus is no longer loaded', !src.includes('getHiringJobs('));
  check('the job comes from a by-id read', src.includes('selectJobDocById(params.jobId)'));
  check('the array scan for the job is gone', !/jobs\.find\(\(j\) => j\.id === params\.jobId\)/.test(src));
  /* The id is in the URL, so nothing is waited on: the read keeps its place in
     the parallel batch. */
  check('the by-id read stays in the parallel batch',
    /Promise\.all\(\[\s*getStoredUsers\(\), selectJobDocById\(params\.jobId\), getHiringApplications\(\),?\s*\]\)/.test(src));

  /* Ownership: unchanged rule, and not-found and not-owned still answer alike
     so a foreign job id cannot be probed. */
  check('the ownership rule is unchanged',
    src.includes("actor.role === 'admin' || orgIds.includes(job!.organizationId)"));
  check('not-found and not-owned still share one 404',
    /if \(!job \|\| !owns\) \{[\s\S]{0,120}status: 404/.test(src));
  check('applications are still matched on canonical jobId', src.includes('a.jobId === job.id'));
  check('applicant ranking is untouched', src.includes('rankApplicants(applications'));
}

function homepage() {
  console.log('\n── 3. The homepage counts what it used to load ──');
  const src = code(read(HOME));

  check('the job corpus is not loaded', !src.includes('getHiringJobs('));
  check('published jobs are counted', src.includes('countPublishedJobs()'));
  check('the transfers blob is not loaded', !src.includes('fileTransfersPath'));
  check('transfers are counted', src.includes('countFileTransferRows()'));
  check('shares come from the count', src.includes('formatCount(transferCount ?? 0)'));

  /* Degradation is deliberately unchanged: a decorative counter must not take
     the homepage down, and the old fallback also produced 0. */
  check('an uncountable transfer store degrades to 0, as before',
    src.includes('countFileTransferRows().catch(() => null)'));
  check('an uncountable job store degrades to 0, as before',
    src.includes('countPublishedJobs().catch(() => null)'));
  check('the four metric ids are unchanged',
    ['docs', 'shares', 'workspaces', 'roles'].every((id) => src.includes(`id: '${id}'`)));
  check('the roles label still falls back to form flows',
    src.includes("liveRoles ? 'live hiring roles' : 'active form flows'"));

  const col = code(read(XFER_COL));
  const cnt = col.slice(col.indexOf('export async function countFileTransferRows'));
  check('the transfer count is a countDocuments', cnt.includes('countDocuments({})'));
  check('the transfer count reports failure as null, never 0',
    /Promise<number \| null>/.test(cnt) && cnt.includes('return null;'));
}

function corpusCallersGone() {
  console.log('\n── 4. No request path reloads the corpus ──');
  /* The three request routes this phase and Phase 9 fixed. `job-import` (CSV
     import) and the scraper planner are the two REQUIRED whole-corpus readers
     and are deliberately not listed. */
  for (const file of [MINE, APPLICANTS, 'app/api/hiring/jobs/[jobId]/route.ts', HOME]) {
    check(`${file} has no getHiringJobs()`, !code(read(file)).includes('getHiringJobs('));
  }
}

function main() {
  mine();
  applicants();
  homepage();
  corpusCallersGone();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
