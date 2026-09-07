/**
 * Phase 2.5 — the public jobs read source, and proving both stores agree.
 *
 * Run: npm run test:job-read-cutover
 *
 * The flag and the comparator are executed against real values. The mutation
 * checks matter most: a verifier that cannot fail is not a verifier, so each
 * class of difference is injected deliberately and must be caught.
 */
import { readFileSync } from 'node:fs';
import {
  jobReadSource, verifySampleRate, comparePages, describeQuery,
} from '../lib/server/db/public-jobs-source';
import {
  buildPublicJobsCollectionPipeline, buildPublicJobsPipeline,
  buildPublicJobsConditions, ARRAY_REF, DOC_REF, PUBLIC_JOB_VIEW_FIELDS,
} from '../lib/server/db/public-jobs-query';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');
const ROUTE = read('app/api/jobs/public/route.ts');
const SOURCE = read('lib/server/db/public-jobs-source.ts');

const page = (over: Partial<{ items: Record<string, unknown>[]; page: number; pageSize: number; total: number }> = {}) => ({
  items: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
  page: 1, pageSize: 20, total: 2, ...over,
});

/* ═══ 1–4. The flag ══════════════════════════════════════════════════════ */

const original = process.env.JOB_READ_FROM_HIRING_JOBS;
try {
  delete process.env.JOB_READ_FROM_HIRING_JOBS;
  check('the flag DEFAULTS to app_state when absent', jobReadSource() === 'app_state');

  process.env.JOB_READ_FROM_HIRING_JOBS = 'true';
  check('exactly "true" selects hiring_jobs', jobReadSource() === 'hiring_jobs');

  process.env.JOB_READ_FROM_HIRING_JOBS = 'false';
  check('"false" selects app_state', jobReadSource() === 'app_state');

  for (const bad of ['TRUE', 'True', '1', 'yes', 'on', '', ' true', 'hiring_jobs']) {
    process.env.JOB_READ_FROM_HIRING_JOBS = bad;
    check(`a malformed value ${JSON.stringify(bad)} is treated as OFF`, jobReadSource() === 'app_state');
  }

  /* Rollback: on → off → on, with no other state involved. */
  process.env.JOB_READ_FROM_HIRING_JOBS = 'true';
  const on1 = jobReadSource();
  process.env.JOB_READ_FROM_HIRING_JOBS = 'false';
  const off = jobReadSource();
  process.env.JOB_READ_FROM_HIRING_JOBS = 'true';
  check('rollback is a single flag flip, and is reversible',
    on1 === 'hiring_jobs' && off === 'app_state' && jobReadSource() === 'hiring_jobs');
} finally {
  if (original === undefined) delete process.env.JOB_READ_FROM_HIRING_JOBS;
  else process.env.JOB_READ_FROM_HIRING_JOBS = original;
}

check('the source is never selectable from a request',
  !/searchParams\.get\('source'\)|body\.source|headers\.get\('x-source'\)/.test(ROUTE + SOURCE));
check('and the flag is read from the environment, server-side only',
  /process\.env\.JOB_READ_FROM_HIRING_JOBS === 'true'/.test(SOURCE));
check('no environment value can become a collection name',
  !/collection\(process\.env/.test(read('lib/server/db/public-jobs-query.ts')));

/* ═══ 5. Sampling ════════════════════════════════════════════════════════ */

{
  const prev = process.env.JOB_READ_VERIFY_SAMPLE;
  try {
    delete process.env.JOB_READ_VERIFY_SAMPLE;
    check('verification is OFF by default', verifySampleRate() === 0);
    process.env.JOB_READ_VERIFY_SAMPLE = '0.05';
    check('a valid rate is honoured', verifySampleRate() === 0.05);
    for (const bad of ['2', '-1', 'abc', '']) {
      process.env.JOB_READ_VERIFY_SAMPLE = bad;
      check(`an out-of-range rate ${JSON.stringify(bad)} disables verification`, verifySampleRate() === 0);
    }
  } finally {
    if (prev === undefined) delete process.env.JOB_READ_VERIFY_SAMPLE;
    else process.env.JOB_READ_VERIFY_SAMPLE = prev;
  }
}

/* ═══ 6. The comparator CATCHES things — mutation checks ═════════════════ */

check('two identical pages match', comparePages(page(), page()).match);

{
  const v = comparePages(page(), page({ total: 3 }));
  check('a differing TOTAL is caught', !v.match && v.kinds.includes('total'));
}
{
  const v = comparePages(page(), page({ items: [{ id: 'b', title: 'B' }, { id: 'a', title: 'A' }] }));
  check('a differing ORDER is caught', !v.match && v.kinds.includes('order'));
}
{
  const v = comparePages(page(), page({ items: [{ id: 'a', title: 'A' }] }));
  check('a differing ITEM COUNT is caught', !v.match && v.kinds.includes('itemCount'));
}
{
  /* Same ids, same order, ONE field different — the case an id-only check
     would miss, and the one that reaches a visitor as a wrong job card. */
  const v = comparePages(page(), page({ items: [{ id: 'a', title: 'CHANGED' }, { id: 'b', title: 'B' }] }));
  check('a differing FIELD VALUE is caught even when ids and order match',
    !v.match && v.kinds.includes('fields'));
}
{
  const v = comparePages(page(), page({ items: [{ id: 'a', title: 'A', extra: 1 }, { id: 'b', title: 'B' }] }));
  check('an EXTRA field is caught', !v.match && v.kinds.includes('fields'));
}
{
  const v = comparePages(page(), page({ items: [{ id: 'a' }, { id: 'b', title: 'B' }] }));
  check('a MISSING field is caught', !v.match && v.kinds.includes('fields'));
}
{
  const v = comparePages(page(), page({ items: [{ id: 'a', title: null }, { id: 'b', title: 'B' }] }));
  check('null vs a value is caught', !v.match && v.kinds.includes('fields'));
}
{
  const v = comparePages(page(), page({ page: 2 }));
  check('a differing PAGE is caught', !v.match && v.kinds.includes('page'));
}
{
  const v = comparePages(page(), page({ pageSize: 50 }));
  check('a differing PAGE SIZE is caught', !v.match && v.kinds.includes('pageSize'));
}
{
  check('an unavailable source is a mismatch, not a match',
    comparePages(page(), null).kinds.includes('availability')
    && comparePages(null, page()).kinds.includes('availability'));
}

/* ═══ 7. Mismatch behaviour ══════════════════════════════════════════════ */

check('a mismatch is logged loudly', /DUAL-READ MISMATCH/.test(ROUTE));
check('and does NOT switch source', !/verdict\.match[\s\S]{0,200}return alt/.test(ROUTE));
check('the response always comes from the SELECTED source',
  /return fromDb;/.test(ROUTE));
check('verification never blocks the response',
  /void readPublicJobsPage\(query, other\)/.test(ROUTE));
check('a failed verification cannot fail the request',
  /\.catch\(\(error\) => \{[\s\S]{0,140}verification failed/.test(ROUTE));

/* No job or user content in diagnostics. */
{
  const shape = describeQuery({ search: 'my name here', country: 'India', page: 3, pageSize: 20 });
  check('a search term is never logged, only its presence', shape.search === 'set');
  check('a country value is never logged either', shape.country === 'set');
  check('but pagination IS logged, since it identifies the shape',
    shape.page === 3 && shape.pageSize === 20);
  check('and empty params are omitted entirely',
    describeQuery({ search: '' } as never).search === undefined);
}

/* ═══ 8. One definition of the semantics ════════════════════════════════ */

check('both pipelines build filters from the SAME function',
  JSON.stringify(buildPublicJobsConditions({ search: 'x' }, ARRAY_REF)).replace(/\$\$j\./g, '$')
  === JSON.stringify(buildPublicJobsConditions({ search: 'x' }, DOC_REF)));
check('the array pipeline still targets app_state',
  JSON.stringify(buildPublicJobsPipeline({})).includes('json:data/hiring-jobs.json'));
check('the collection pipeline pages and counts in ONE round trip',
  JSON.stringify(buildPublicJobsCollectionPipeline({})).includes('$facet'));
check('it prefilters on status so an index can be used',
  JSON.stringify(buildPublicJobsCollectionPipeline({})[0]) === JSON.stringify({ $match: { status: 'published' } }));
check('it sorts with the id tie-break, like the JS comparators',
  JSON.stringify(buildPublicJobsCollectionPipeline({})).includes('"id":1'));
check('the projection emits fields in the SAME order, so bodies are identical',
  JSON.stringify(buildPublicJobsCollectionPipeline({}))
    .includes(`"${PUBLIC_JOB_VIEW_FIELDS[0]}":"$${PUBLIC_JOB_VIEW_FIELDS[0]}"`));
check('no second definition of search, filter, sort or projection exists',
  (read('lib/server/db/public-jobs-query.ts').match(/function buildPublicJobsConditions/g) ?? []).length === 1);

/* ═══ 9. Failure semantics survive ══════════════════════════════════════ */

check('a source that cannot answer returns null, never an empty page',
  /Promise<PublicJobsPage \| null>/.test(read('lib/server/db/public-jobs-query.ts')));
check('a genuine read failure still becomes a 500',
  /catch \{[\s\S]{0,140}status: 500/.test(ROUTE));
check('the Phase 2.4 strict corpus read is untouched',
  /readJsonFileStrict<HiringJobPosting\[\]>/.test(read('lib/server/hiring.ts')));

/* ═══ 9b. NO hidden cross-source fallback ═══════════════════════════════
   Quietly answering from app_state when hiring_jobs cannot would make a broken
   rollout look healthy, and would mean the flag no longer describes what is
   serving traffic. Rollback is the flag, not a runtime path. */

check('a hiring_jobs failure throws instead of serving app_state',
  /if \(source === 'hiring_jobs'\) \{[\s\S]{0,220}throw new Error\(/.test(ROUTE));
check('and says why, so the operator sees a real failure',
  /refusing to serve app_state silently/.test(ROUTE));
check('the app_state in-process path remains for the app_state source only',
  ROUTE.indexOf("source === 'hiring_jobs'") < ROUTE.indexOf('getHiringJobsCached()'));
check('a thrown read still becomes a 500, never an empty page',
  /catch \{[\s\S]{0,140}status: 500/.test(ROUTE));

/* ═══ 10. Writes are unchanged ══════════════════════════════════════════ */

const HIRING = read('lib/server/hiring.ts');
check('app_state is still written FIRST by the one write funnel',
  /await writeJsonFile\(hiringJobsPath, jobs\);/.test(HIRING));
check('and the mirror still follows it',
  HIRING.indexOf('writeJsonFile(hiringJobsPath') < HIRING.indexOf('mirrorPublishedJobs('));
check('this phase deletes nothing',
  !/deleteMany|drop\(/.test(SOURCE) && !/deleteMany|drop\(/.test(ROUTE));

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
