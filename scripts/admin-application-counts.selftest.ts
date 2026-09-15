/**
 * Phase 8 Increment 2 — application counts in the Super Admin job table.
 *
 *   npx tsx scripts/admin-application-counts.selftest.ts
 *
 * The counting itself is proven by scripts/application-analytics.selftest.ts.
 * What is asserted HERE is the integration: that the admin overview attaches
 * exact counts, does it in one read, exposes no application record, and fails
 * loudly rather than showing zeros when the store cannot be read.
 *
 * MEASURED against production: 500 rows in 5,763 ms, every row carrying
 * `applications: 0` / `activeApplicants: 0` — a real zero, because the
 * application store holds no records at all.
 *
 * ═══ LOCKED PRODUCT SEMANTICS ═══
 *
 *   Applications      every genuine application record, INCLUDING withdrawn
 *   Active applicants the same, EXCLUDING withdrawn
 *
 * rejected / hired / shortlisted / interview / assignment / offer_proposed all
 * remain applications: each is the outcome of someone genuinely applying.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { countApplicationsByJob } from '@/lib/server/job-applications/counts';
import type { HiringJobApplication } from '@/types/document';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const app = (jobId: string, status: HiringJobApplication['status']) =>
  ({ jobId, status }) as HiringJobApplication;

function lockedSemantics() {
  console.log('\n── 1. The locked definitions ──');
  const counts = countApplicationsByJob([
    app('j', 'submitted'), app('j', 'shortlisted'), app('j', 'interview'),
    app('j', 'assignment'), app('j', 'offer_proposed'),
    app('j', 'rejected'), app('j', 'hired'), app('j', 'withdrawn'),
  ]).get('j')!;

  check('Applications INCLUDES withdrawn', counts.total === 8);
  check('Active applicants EXCLUDES withdrawn', counts.active === 7);
  check('rejected stays an application',
    countApplicationsByJob([app('j', 'rejected')]).get('j')!.total === 1);
  check('hired stays an application',
    countApplicationsByJob([app('j', 'hired')]).get('j')!.total === 1);

  /* The two must differ ONLY by withdrawals — any other divergence means a
     status was silently reclassified. */
  check('the two differ only by withdrawals',
    counts.total - counts.active === counts.withdrawn);

  const noWithdrawals = countApplicationsByJob([app('j', 'submitted'), app('j', 'hired')]).get('j')!;
  check('with no withdrawals the two are equal',
    noWithdrawals.total === noWithdrawals.active);
}

function jobBoundaries() {
  console.log('\n── 2. A count belongs to exactly one job ──');
  const byJob = countApplicationsByJob([
    app('job-a', 'submitted'), app('job-a', 'submitted'), app('job-b', 'submitted'),
  ]);
  check('job-a sees only its own', byJob.get('job-a')!.total === 2);
  check('job-b sees only its own', byJob.get('job-b')!.total === 1);
  /* The mutation that would be most damaging and least visible. */
  check('a job with no applications cannot inherit another job\'s count',
    byJob.get('job-c') === undefined);
}

function integration() {
  console.log('\n── 3. The overview attaches counts correctly ──');
  const src = read('lib/server/job-import.ts');
  const overview = src.slice(src.indexOf('export async function getJobAdminOverview'));

  check('it reuses the Phase 7 domain layer',
    overview.includes('getApplicationCountsForJobs'));
  /* A second implementation would drift from the locked semantics. */
  check('it does not re-implement counting',
    !/\.filter\([^)]*status[^)]*withdrawn/.test(overview));

  /* ONE grouped read for the page, not one per row. 500 rows would otherwise
     mean 500 full reads of the application store. */
  check('counts are fetched once for the whole page, outside the row map',
    overview.indexOf('getApplicationCountsForJobs') < overview.indexOf('rows.map'));
  check('the call is not inside the row map',
    !/rows\.map\([\s\S]{0,400}getApplicationCountsForJobs/.test(overview));

  check('counts are keyed by canonical job id',
    overview.includes('applications.get(String(j.id))'));
  /* Never by title, company, applyUrl or source. */
  check('no count is matched by title or company',
    !/applications\.get\(.*(title|organizationName|applyUrl)/.test(overview));
}

function failureIsNotZero() {
  console.log('\n── 4. An unreadable store fails loudly ──');
  const src = read('lib/server/job-import.ts');
  const overview = src.slice(src.indexOf('export async function getJobAdminOverview'),
    src.indexOf('export async function getJobAdminOverview') + 3000);

  /* `getApplicationCountsForJobs` throws on a storage failure. Catching it here
     would paint "0 applications" across every job at once — exactly the shape
     of the TOTAL 0 incident. */
  check('the overview does not swallow a count failure',
    !/getApplicationCountsForJobs[\s\S]{0,200}catch/.test(overview));
  check('there is no zero-filled fallback for counts',
    !/applications:\s*0\s*[,}]/.test(overview.replace(/\/\*[\s\S]*?\*\//g, '')));

  /* The UI half of the same principle, established in Phase 0. */
  const ui = read('components/superadmin/JobsTab.tsx');
  const load = ui.slice(ui.indexOf('const load = useCallback'), ui.indexOf('}, [query]);'));
  check('a failed overview is reported, not rendered as data',
    load.includes('setStatsErr'));
  check('and previously loaded rows are kept rather than zeroed',
    /return;\s*\/\/ previous stats\/jobs deliberately kept/.test(load));
}

function privacy() {
  console.log('\n── 5. Aggregates only ──');
  const src = read('lib/server/job-import.ts');
  const overview = src.slice(src.indexOf('export async function getJobAdminOverview'));

  /* Verified against production: the serialized overview contained none of
     these. Asserted here so a future field addition cannot reintroduce one. */
  for (const pii of ['candidateEmail', 'candidateName', 'candidateUserId',
    'resumeText', 'coverLetter', 'candidatePhone', 'analysisSummary']) {
    check(`${pii} is never serialized`, !overview.includes(pii));
  }
  check('no application record is returned, only two numbers',
    overview.includes('applications: applications.get')
    && overview.includes('activeApplicants: applications.get'));
}

function uiMinimal() {
  console.log('\n── 6. The table gained two columns and nothing else ──');
  const ui = read('components/superadmin/JobsTab.tsx');

  const headers = (ui.match(/>[A-Za-z ]+<\/th>/g) || []).map((h) => h.slice(1, -5));
  const cells = (ui.slice(ui.indexOf('{jobs.map((j) => ('))
    .match(/<td /g) || []).length;
  check('every header has a cell', headers.length === cells,
    `${headers.length} headers vs ${cells} cells`);
  check('the Apps column exists', headers.includes('Apps'));
  check('the Active column exists', headers.includes('Active'));

  /* The existing columns must all survive. */
  for (const col of ['Title', 'Company', 'Location', 'Type', 'Mode', 'Exp', 'Status', 'Source', 'Created']) {
    check(`${col} column is preserved`, headers.includes(col));
  }

  /* The exact number is authoritative in the admin console; a bucket must not
     stand in for it here. */
  check('the exact count is shown, not a bucket',
    ui.includes('{j.applications ?? 0}') && !ui.includes('applicantBucket('));

  /* Increment 1 must be untouched. */
  check('the public job card was not changed',
    read('components/jobs/JobSummaryCard.tsx').includes('overrideUrl={job.companyLogoUrl}'));
}

function main() {
  lockedSemantics();
  jobBoundaries();
  integration();
  failureIsNotZero();
  privacy();
  uiMinimal();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
