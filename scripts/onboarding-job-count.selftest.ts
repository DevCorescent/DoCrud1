/**
 * The onboarding opportunity count — the number on the first screen.
 *
 * Run: npm run test:onboarding-job-count
 *
 * ═══ WHAT THIS GUARDS ═══
 *
 * `selectActiveJobCount()` counts postings INSIDE MongoDB so the onboarding
 * footer does not drag the whole ~12 MB corpus across the wire for one integer.
 * That means the "is this job active" rule now exists twice: once as
 * `isJobActive()` in lifecycle.ts, and once as an aggregation expression.
 *
 * Two implementations of one rule drift. So this file INTERPRETS the real
 * aggregation expression — imported, not retyped — and requires it to agree
 * with `isJobActive()` on every fixture, including the cases where Mongo's
 * truthiness and JavaScript's disagree. If someone edits the expression, this
 * fails; if someone edits `isJobActive`, this fails.
 *
 * The interpreter deliberately supports ONLY the operators the expression
 * actually uses. An unsupported operator throws rather than being guessed at,
 * so a rewritten predicate cannot slip through by being silently evaluated
 * wrong.
 */
import { readFileSync } from 'node:fs';
import { ACTIVE_JOB_COND } from '../lib/server/db/hiring-jobs-rows';
import { isJobActive } from '../lib/server/job-sources/lifecycle';
import type { HiringJobPosting } from '../types/document';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

/* ═══ A minimal evaluator for the aggregation expression ═════════════════
   `$$j.field` resolves against the job; a missing field is `undefined`, which
   is how Mongo treats an absent path in these operators. */
function evaluate(expr: unknown, job: Record<string, unknown>): unknown {
  if (typeof expr === 'string') {
    if (expr.startsWith('$$j.')) return job[expr.slice(4)];
    if (expr.startsWith('$')) throw new Error(`unsupported path ${expr}`);
    return expr;
  }
  if (expr === null || typeof expr !== 'object') return expr;
  if (Array.isArray(expr)) return expr.map((e) => evaluate(e, job));

  const entries = Object.entries(expr as Record<string, unknown>);
  if (entries.length !== 1) throw new Error('expected one operator per object');
  const [op, raw] = entries[0];
  const args = evaluate(raw, job) as unknown[];

  switch (op) {
    case '$and': return args.every(Boolean);
    /* Mongo compares BSON values; for the scalars in play this is `===`,
       except that a missing field and an explicit null compare equal. */
    case '$eq': return same(args[0], args[1]);
    case '$ne': return !same(args[0], args[1]);
    case '$ifNull': return args[0] === undefined || args[0] === null ? args[1] : args[0];
    default: throw new Error(`unsupported operator ${op} — extend this evaluator deliberately`);
  }
}
const same = (a: unknown, b: unknown) =>
  (a === undefined || a === null) && (b === undefined || b === null) ? true : a === b;

const mongoSaysActive = (job: Partial<HiringJobPosting>) =>
  Boolean(evaluate(ACTIVE_JOB_COND, job as Record<string, unknown>));

/* ═══ The fixtures ══════════════════════════════════════════════════════ */

const FIXTURES: Array<{ label: string; job: Partial<HiringJobPosting> }> = [
  { label: 'plain published posting', job: { status: 'published' } },
  { label: 'published + isActive true', job: { status: 'published', isActive: true } },
  /* The field is absent on most real postings — `$eq: true` would drop them. */
  { label: 'published, isActive absent', job: { status: 'published', title: 'x' } as never },
  { label: 'published but isActive false', job: { status: 'published', isActive: false } },
  { label: 'draft', job: { status: 'draft' } },
  { label: 'closed', job: { status: 'closed' } },
  { label: 'status absent', job: { title: 'x' } as never },
  { label: 'published but expired', job: { status: 'published', expiresAt: '2020-01-01T00:00:00.000Z' } },
  { label: 'published, future expiry still counts as expired',
    job: { status: 'published', expiresAt: '2999-01-01T00:00:00.000Z' } },
  /* The trap: '' is falsy in JS and TRUTHY in an aggregation. `$not` here
     would have marked this expired and undercounted the feed. */
  { label: "published, expiresAt '' (JS-falsy, Mongo-truthy)",
    job: { status: 'published', expiresAt: '' } },
  { label: 'published, expiresAt null', job: { status: 'published', expiresAt: null } as never },
  { label: 'published, expiresAt undefined', job: { status: 'published', expiresAt: undefined } },
  { label: 'every disqualifier at once', job: { status: 'draft', isActive: false, expiresAt: 'z' } },
];

for (const { label, job } of FIXTURES) {
  const js = isJobActive(job);
  const mongo = mongoSaysActive(job);
  check(`${label}: aggregation agrees with isJobActive (both ${js})`, js === mongo);
}

/* The suite is only meaningful if the fixtures cover both answers. */
check('fixtures include active postings', FIXTURES.some((f) => isJobActive(f.job)));
check('fixtures include inactive postings', FIXTURES.some((f) => !isJobActive(f.job)));

/* ═══ The counter must not touch the corpus path ═════════════════════════ */

const counter = read('components/onboarding/OpportunityCounter.tsx');
check('the counter reads the count route', /\/api\/jobs\/public\/count/.test(counter));
check('and no longer pulls a page of the feed for one number',
  !/\/api\/jobs\/public\?/.test(counter));

const route = read('app/api/jobs/public/count/route.ts');
check('the count route prefers the projected count', /selectActiveJobCount/.test(route));
/* getHiringJobsCached appears ONLY inside the fallback, for the case where a
   projection is impossible — never as the primary path. */
check('the corpus load is a fallback, below the projection',
  route.indexOf('selectActiveJobCount()') < route.indexOf('getHiringJobsCached()'));
check('the fallback reuses publicJobs so the number stays the feed\'s number',
  /publicJobs\(await getHiringJobsCached\(\)/.test(route));

/* ═══ A failed read must never render as "no jobs" ═══════════════════════ */

/* Read the catch BLOCK, not the whole file — the prose above it discusses
   `{ total: 0 }` precisely to explain why the code must never return it. */
const catchBlock = route.slice(route.indexOf('} catch'));
check('a failure is a 503', /status: 503/.test(catchBlock));
check('and carries no total at all, so a broken read cannot render as "no jobs"',
  !/total/.test(catchBlock));
check('the counter renders nothing when no total arrives',
  /if \(target === null\) return null;/.test(counter));

/* ═══ Public route unchanged ════════════════════════════════════════════ */

const publicRoute = read('app/api/jobs/public/route.ts');
check('the public feed still answers through publicJobs unchanged',
  /publicJobs\(await getHiringJobsCached\(\), query\)/.test(publicRoute));
/* No counting branch was grafted into the feed handler. Matched on the
   selector name rather than the word "count", which `q.get('country')`
   contains. */
check('and the count route did not become a branch inside it',
  !/selectActiveJobCount|countOnly/.test(publicRoute));

/* ═══ The selector keeps its fallback contract ══════════════════════════ */

const rows = read('lib/server/db/hiring-jobs-rows.ts');
check('selectActiveJobCount returns null rather than 0 when unavailable',
  /export async function selectActiveJobCount\(\): Promise<number \| null>/.test(rows));
check('a negative or non-numeric result is rejected, not passed through',
  /Number\.isFinite\(value\) && value >= 0 \? value : null/.test(rows));

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
