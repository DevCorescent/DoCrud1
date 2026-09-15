/**
 * Phase 7 — exact application counts.
 *
 *   npx tsx scripts/application-analytics.selftest.ts
 *
 * ═══ MEASURED STATE ═══
 *
 * Production holds ZERO job applications: the `json:data/hiring-applications.json`
 * app_state document does not exist, so no application has ever been written.
 * Every count the product shows today is therefore a truthful 0.
 *
 * That makes these assertions the entire safety net — there is no production
 * data to catch a mistake, so the semantics must be pinned by tests. The
 * grouping is pure and exercised directly against fixtures; no database.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { HiringJobApplication } from '@/types/document';
import {
  countApplicationsByJob, applicantBucket,
} from '@/lib/server/job-applications/counts';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

/** Only the fields the counter reads. */
function app(jobId: string, status: HiringJobApplication['status'] = 'submitted') {
  return { jobId, status } as HiringJobApplication;
}

function counting() {
  console.log('\n── 1. Counts are exact and job-scoped ──');

  check('no applications -> empty map', countApplicationsByJob([]).size === 0);

  const one = countApplicationsByJob([app('job-a')]);
  check('one application counts as one', one.get('job-a')?.total === 1);
  check('and is active', one.get('job-a')?.active === 1);

  const many = countApplicationsByJob([
    app('job-a'), app('job-a'), app('job-a'), app('job-b'),
  ]);
  check('three applications on one job count as three', many.get('job-a')?.total === 3);
  /* The mutation that matters most: another job's applications must never leak
     into this job's number. */
  check('a second job is counted separately', many.get('job-b')?.total === 1);
  check('a job with no applications is simply absent',
    many.get('job-c') === undefined);

  /* An application that names no job cannot be attributed to one. Counting it
     anywhere would inflate an unrelated posting. */
  const orphan = countApplicationsByJob([app(''), app('   '), app('job-a')]);
  check('applications with no jobId are not attributed to any job',
    orphan.size === 1 && orphan.get('job-a')?.total === 1);
}

function statusSemantics() {
  console.log('\n── 2. Withdrawn is reported, never silently folded away ──');
  const counts = countApplicationsByJob([
    app('j', 'submitted'), app('j', 'reviewing'), app('j', 'shortlisted'),
    app('j', 'interview'), app('j', 'assignment'), app('j', 'offer_proposed'),
    app('j', 'rejected'), app('j', 'hired'), app('j', 'withdrawn'),
  ]).get('j')!;

  check('every record is in the total', counts.total === 9);
  check('withdrawals are counted', counts.withdrawn === 1);
  check('active excludes only withdrawals', counts.active === 8);
  check('the three add up', counts.active + counts.withdrawn === counts.total);

  /* Outcomes of a real application. Someone who was rejected still applied —
     dropping them would understate the job's genuine applicant volume. */
  const outcomes = countApplicationsByJob([app('j', 'rejected'), app('j', 'hired')]).get('j')!;
  check('rejected and hired still count as applications', outcomes.active === 2);
}

function buckets() {
  console.log('\n── 3. Buckets are presentation, and unambiguous ──');
  const cases: Array<[number, string]> = [
    [0, '0'], [1, '1'], [9, '9'], [10, '10+'], [24, '10+'], [25, '25+'],
    [49, '25+'], [50, '50+'], [99, '50+'], [100, '100+'], [137, '100+'],
    [199, '100+'], [200, '200+'], [264, '200+'], [499, '200+'], [500, '500+'],
    [999, '500+'], [1000, '1K+'], [4999, '1K+'], [5000, '5K+'], [50000, '5K+'],
  ];
  for (const [n, want] of cases) {
    check(`${n} -> ${want}`, applicantBucket(n) === want, applicantBucket(n));
  }
  /* Every count lands in exactly one band — no gaps, no overlaps. Walking 0..6000
     must produce exactly 18 distinct labels in order: the ten exact values 0-9,
     then 10+, 25+, 50+, 100+, 200+, 500+, 1K+, 5K+. A band that overlapped or
     left a gap would change this count. */
  const seen: string[] = [];
  for (let n = 0; n <= 6000; n += 1) {
    const b = applicantBucket(n);
    if (b !== seen[seen.length - 1]) seen.push(b);
  }
  check('bands ascend without gaps or overlap', seen.length === 18, `${seen.length} bands`);
  check('a label never reappears after being left behind',
    new Set(seen).size === seen.length);

  check('a negative count is unknown, not zero', applicantBucket(-1) === '—');
  check('NaN is unknown, not zero', applicantBucket(Number.NaN) === '—');
  check('small counts are shown exactly rather than rounded away',
    applicantBucket(3) === '3');
}

function failureIsNotZero() {
  console.log('\n── 4. A storage failure can never become "0 applicants" ──');
  const src = read('lib/server/job-applications/counts.ts');

  /* The non-strict reader swallows a failed read and returns its fallback,
     which would turn an outage into "0 applicants" on every job at once. */
  check('the strict reader is used', src.includes('readJsonFileStrict'));
  check('the swallowing reader is not', !/[^t]readJsonFile\(/.test(src));
  check('no catch turns a failure into an empty result',
    !/catch[\s\S]{0,120}return\s*(\[\]|EMPTY|\{ \.\.\.EMPTY \})/.test(src));

  /* Zero is still a legitimate answer for a job nobody applied to. */
  check('a job with no applications still reports a real zero',
    src.includes('byJob.get(id) ?? { ...EMPTY }'));
}

function notFabricated() {
  console.log('\n── 5. Counts come from applications, nothing else ──');
  const src = read('lib/server/job-applications/counts.ts');

  /* The named confusions from the brief. None may appear as an input. */
  for (const wrong of ['recommendation', 'atsScore', 'views', 'impression', 'estimate']) {
    check(`${wrong} is not an input to the count`,
      !new RegExp(`${wrong}`, 'i').test(
        src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''),
      ));
  }
  check('only jobId and status are read from a record',
    src.includes('app.jobId') && src.includes("app.status === 'withdrawn'"));

  /* One read for many jobs — not one read per job. */
  check('multi-job counting reads the store once',
    /getApplicationCountsForJobs[\s\S]{0,400}getApplicationCountsByJob\(\)/.test(src));
}

function scopeHeld() {
  console.log('\n── 6. Phase 7 wrote nothing and enabled nothing ──');
  const src = read('lib/server/job-applications/counts.ts');
  check('the module never writes', !/writeJsonFile|bulkWrite|updateOne|insertOne|deleteOne/.test(src));
  /* `[^=]` so a COMPARISON (`status === 'withdrawn'`) is not mistaken for an
     assignment. Reading a status is the whole job; writing one is not. */
  check('it does not change application status', !/status\s*=[^=]/.test(src));
  check('no denormalised counter is stored on a job',
    !/applicationCount:\s/.test(src));
  check('no caching was introduced across an authorization boundary',
    !/cache|memo|ttl/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
}

function main() {
  counting();
  statusSemantics();
  buckets();
  failureIsNotZero();
  notFabricated();
  scopeHeld();
  console.log(`\n✅ ${checks}/${checks} checks passed`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
