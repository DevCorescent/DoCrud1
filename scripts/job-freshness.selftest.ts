/**
 * Phase 6B — the public freshness model. IMPLEMENTED BUT NOT ACTIVATED.
 *
 *   npx tsx scripts/job-freshness.selftest.ts
 *
 * What is proven here, in order of how badly it could go wrong:
 *
 *   • With the flag OFF (the default, and production), the public feed is
 *     unchanged: old scraped jobs stay visible exactly as before. The
 *     catastrophic mode — 4,646 postings vanishing on deploy — is impossible.
 *   • With the flag ON, only STALE scraped jobs are hidden. Manual/employer
 *     jobs and jobs with no usable lastSeenAt pass through.
 *   • The clock is lastSeenAt. ingestedAt, createdAt and expiresAt are never
 *     consulted, and expiresAt is never written.
 *   • Only "true" turns it on.
 *   • markSeen stamps only what a successful source matched.
 *   • The Mongo expression mirrors the pure predicate, shape for shape.
 *   • The dry-run cannot write.
 *
 * No database: pure predicates over fixtures, plus source-level assertions
 * for the wiring. The live cross-check of predicate vs $expr is what
 * scripts/freshness-dry-run.ts does.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { HiringJobPosting } from '@/types/document';
import {
  PUBLIC_FRESHNESS_MS, freshnessAgeMs, freshnessState, isPubliclyFresh, isScrapedJob,
  publicFreshnessEnabled, publiclyFreshCond, staleCond,
} from '@/lib/server/job-sources/freshness';
import { markSeen } from '@/lib/server/job-sources/lifecycle';
import { publicJobs } from '@/lib/server/job-api/queries';
import { ARRAY_REF, DOC_REF, buildPublicJobsConditions } from '@/lib/server/db/public-jobs-query';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

const H = 3600_000;
const NOW = Date.parse('2026-09-15T12:00:00.000Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

/** A publishable posting with only what the predicates and publicJobs read. */
function job(over: Partial<HiringJobPosting>): HiringJobPosting {
  return {
    id: over.id ?? `j-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Engineer', organizationName: 'Acme', status: 'published',
    createdAt: iso(400 * H), updatedAt: iso(400 * H),
    ...over,
  } as HiringJobPosting;
}
const scraped = (over: Partial<HiringJobPosting> = {}) => job({ source: 'scraper', sourceId: 'greenhouse:acme', ...over });
const manual = (over: Partial<HiringJobPosting> = {}) => job({ source: 'hiring', ...over });

function withFlag<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env.PUBLIC_FRESHNESS_ENABLED;
  if (value === undefined) delete process.env.PUBLIC_FRESHNESS_ENABLED;
  else process.env.PUBLIC_FRESHNESS_ENABLED = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.PUBLIC_FRESHNESS_ENABLED;
    else process.env.PUBLIC_FRESHNESS_ENABLED = prev;
  }
}

function classification() {
  console.log('\n── 1. isScrapedJob reuses the canonical ownership test ──');
  check('source=scraper is scraped', isScrapedJob({ source: 'scraper' }));
  check('a sourceId alone is scraped', isScrapedJob({ sourceId: 'lever:x' }));
  check('neither is not scraped', !isScrapedJob({ source: 'hiring' }));
  check('an empty sourceId is not scraped', !isScrapedJob({ source: 'hiring', sourceId: '' }));
}

function age() {
  console.log('\n── 2. freshnessAgeMs comes from lastSeenAt, or is unknown ──');
  check('a valid timestamp yields its age', freshnessAgeMs({ lastSeenAt: iso(5 * H) }, NOW) === 5 * H);
  check('missing lastSeenAt is null', freshnessAgeMs({}, NOW) === null);
  check('empty lastSeenAt is null', freshnessAgeMs({ lastSeenAt: '' }, NOW) === null);
  check('whitespace lastSeenAt is null', freshnessAgeMs({ lastSeenAt: '   ' }, NOW) === null);
  check('malformed lastSeenAt is null', freshnessAgeMs({ lastSeenAt: 'yesterday' }, NOW) === null);
  /* Existing lifecycle convention (jobAgeMs): a future timestamp is age 0. */
  check('a future timestamp is age 0, never negative',
    freshnessAgeMs({ lastSeenAt: new Date(NOW + 3 * H).toISOString() }, NOW) === 0);
  /* The clock must be lastSeenAt and nothing else. */
  check('ingestedAt alone does not produce an age',
    freshnessAgeMs({ ingestedAt: iso(H) }, NOW) === null);
  check('createdAt alone does not produce an age',
    freshnessAgeMs({ createdAt: iso(H) }, NOW) === null);
}

function boundary() {
  console.log('\n── 3. The 168h boundary ──');
  check('the window is exactly 168h in ms', PUBLIC_FRESHNESS_MS === 168 * 60 * 60 * 1000);
  const at = (msAgo: number) => freshnessState(scraped({ lastSeenAt: iso(msAgo) }), NOW);
  check('167h 59m 59s -> fresh', at(168 * H - 1000) === 'fresh');
  check('167h 59m 59.999s -> fresh', at(168 * H - 1) === 'fresh');
  check('exactly 168h -> stale', at(168 * H) === 'stale');
  check('168h + 1ms -> stale', at(168 * H + 1) === 'stale');
  check('a job seen just now is fresh', at(0) === 'fresh');
  check('a future observation is fresh (age 0)',
    freshnessState(scraped({ lastSeenAt: new Date(NOW + H).toISOString() }), NOW) === 'fresh');
}

function exemptionAndUnknown() {
  console.log('\n── 4. Exemption and unknown ──');
  check('manual job + no lastSeenAt -> exempt', freshnessState(manual(), NOW) === 'exempt');
  check('employer job + no lastSeenAt -> exempt',
    freshnessState(job({ source: 'hiring', createdByUserId: 'u1' } as Partial<HiringJobPosting>), NOW) === 'exempt');
  check('manual job with an ancient lastSeenAt is STILL exempt',
    freshnessState(manual({ lastSeenAt: iso(5000 * H) }), NOW) === 'exempt');
  check('scraped + recent -> fresh', freshnessState(scraped({ lastSeenAt: iso(H) }), NOW) === 'fresh');
  check('scraped + old -> stale', freshnessState(scraped({ lastSeenAt: iso(500 * H) }), NOW) === 'stale');
  check('scraped + missing -> unknown', freshnessState(scraped(), NOW) === 'unknown');
  check('scraped + malformed -> unknown', freshnessState(scraped({ lastSeenAt: 'n/a' }), NOW) === 'unknown');

  /* The rule only ever says no to STALE. */
  check('exempt is publicly fresh', isPubliclyFresh(manual(), NOW));
  check('unknown is publicly fresh — it does not become expired', isPubliclyFresh(scraped(), NOW));
  check('fresh is publicly fresh', isPubliclyFresh(scraped({ lastSeenAt: iso(H) }), NOW));
  check('stale is not', !isPubliclyFresh(scraped({ lastSeenAt: iso(200 * H) }), NOW));
}

function flag() {
  console.log('\n── 5. Only the string "true" activates ──');
  for (const [v, want] of [
    ['true', true], ['TRUE', false], ['1', false], ['yes', false], ['false', false],
    ['', false], [undefined, false], [' true', false], ['True', false],
  ] as Array<[string | undefined, boolean]>) {
    check(`PUBLIC_FRESHNESS_ENABLED=${JSON.stringify(v)} -> ${want ? 'ON' : 'OFF'}`,
      withFlag(v, publicFreshnessEnabled) === want);
  }
  /* Evaluated at call time, not cached at import. */
  check('the flag is read live', withFlag('true', publicFreshnessEnabled) && withFlag(undefined, () => !publicFreshnessEnabled()));
}

function inMemoryPath() {
  console.log('\n── 6. publicJobs(): OFF is unchanged, ON hides only stale scraped ──');
  const fixture = [
    scraped({ id: 'old-1', lastSeenAt: iso(300 * H) }),
    scraped({ id: 'old-2', lastSeenAt: iso(1000 * H) }),
    scraped({ id: 'recent', lastSeenAt: iso(2 * H) }),
    scraped({ id: 'unknown-seen' }),
    scraped({ id: 'bad-seen', lastSeenAt: 'garbage' }),
    manual({ id: 'manual-1' }),
    manual({ id: 'manual-old', lastSeenAt: iso(9000 * H) }),
    /* Not published: excluded by isJobActive in BOTH modes — freshness must not
       resurrect it. */
    scraped({ id: 'draft', status: 'draft', lastSeenAt: iso(H) }),
  ];
  const ids = (p: { items: Array<Record<string, unknown>> }) => p.items.map((r) => String(r.id)).sort();
  const baseline = ['bad-seen', 'manual-1', 'manual-old', 'old-1', 'old-2', 'recent', 'unknown-seen'];

  const off = withFlag(undefined, () => publicJobs(fixture, { pageSize: 50 }, { now: NOW }));
  check('OFF: every published job is returned, old ones included', JSON.stringify(ids(off)) === JSON.stringify(baseline));
  check('OFF: total agrees with the rows', off.total === 7);
  const offFalse = withFlag('false', () => publicJobs(fixture, { pageSize: 50 }, { now: NOW }));
  check('"false" behaves exactly like unset', JSON.stringify(ids(offFalse)) === JSON.stringify(baseline));
  const offTrueCaps = withFlag('TRUE', () => publicJobs(fixture, { pageSize: 50 }, { now: NOW }));
  check('"TRUE" behaves exactly like unset', JSON.stringify(ids(offTrueCaps)) === JSON.stringify(baseline));

  const on = withFlag('true', () => publicJobs(fixture, { pageSize: 50 }, { now: NOW }));
  check('ON: stale scraped jobs are hidden', !ids(on).includes('old-1') && !ids(on).includes('old-2'));
  check('ON: a recent scraped job stays', ids(on).includes('recent'));
  check('ON: a scraped job with no lastSeenAt stays (unknown != expired)', ids(on).includes('unknown-seen'));
  check('ON: a scraped job with malformed lastSeenAt stays', ids(on).includes('bad-seen'));
  check('ON: manual jobs stay regardless of lastSeenAt',
    ids(on).includes('manual-1') && ids(on).includes('manual-old'));
  check('ON: the total is the filtered count, not the corpus', on.total === 5);
  check('draft stays excluded in both modes', !ids(off).includes('draft') && !ids(on).includes('draft'));

  /* The public contract is unchanged: the two-argument call still works. */
  const twoArgs = withFlag(undefined, () => publicJobs(fixture, { pageSize: 50 }));
  check('publicJobs(jobs, query) still works with two arguments', twoArgs.total === 7);
}

function mongoPath() {
  console.log('\n── 7. The Mongo clause mirrors the predicate and is gated identically ──');
  const doc = JSON.stringify(staleCond(DOC_REF, NOW));
  const arr = JSON.stringify(staleCond(ARRAY_REF, NOW));

  check('it reads lastSeenAt', doc.includes('"$lastSeenAt"'));
  check('it is built through FieldRef (array shape addresses $$j.)', arr.includes('"$$j.lastSeenAt"'));
  check('missing lastSeenAt parses to null (unknown), via onNull', doc.includes('"onNull":null'));
  check('malformed lastSeenAt parses to null (unknown), via onError', doc.includes('"onError":null'));
  check('null (unknown) is excluded from stale', doc.includes('"$ne":["$$seen",null]'));
  check('stale is >= 168h, matching the predicate\'s < 168h fresh', doc.includes(`"$gte"`) && doc.includes(String(PUBLIC_FRESHNESS_MS)));
  check('scraped is source=scraper OR non-empty sourceId, like isSourcedJob',
    doc.includes('"$eq":["$source","scraper"]') && doc.includes('"$sourceId"'));
  check('it never consults expiresAt', !doc.includes('expiresAt'));
  check('it never consults ingestedAt or createdAt', !doc.includes('ingestedAt') && !doc.includes('createdAt'));
  check('publiclyFreshCond is the negation', JSON.stringify(publiclyFreshCond(DOC_REF, NOW)).startsWith('{"$not":['));

  const offConds = withFlag(undefined, () => buildPublicJobsConditions({}, DOC_REF, { now: NOW }));
  const onConds = withFlag('true', () => buildPublicJobsConditions({}, DOC_REF, { now: NOW }));
  const noOpts = withFlag(undefined, () => buildPublicJobsConditions({}, DOC_REF));
  check('OFF: the query conditions are exactly the pre-existing set',
    JSON.stringify(offConds) === JSON.stringify(noOpts));
  check('OFF: no freshness clause is present', !JSON.stringify(offConds).includes('lastSeenAt'));
  check('ON: exactly one clause is added', onConds.length === offConds.length + 1);
  check('ON: the added clause is the freshness negation',
    JSON.stringify(onConds[onConds.length - 1]) === JSON.stringify(publiclyFreshCond(DOC_REF, NOW)));
  check('the pre-existing active definition is untouched',
    JSON.stringify(onConds[0]) === JSON.stringify(offConds[0]) && JSON.stringify(offConds[0]).includes('"$expiresAt"'));
}

function markSeenSafety() {
  console.log('\n── 8. markSeen renews only what a successful source matched ──');
  const jobs = [scraped({ id: 'a' }), scraped({ id: 'b' }), scraped({ id: 'c' })];
  const stamped = markSeen(jobs, new Set(['a', 'c']), NOW);
  check('only matched ids are stamped', stamped.map((s) => s.id).sort().join() === 'a,c');
  check('an unmatched job is not renewed', !stamped.some((s) => s.id === 'b'));
  check('an empty match set renews nothing (a failed or empty source)', markSeen(jobs, new Set(), NOW).length === 0);
  check('the stamp is the injected instant', stamped[0].lastSeenAt === new Date(NOW).toISOString());

  /* Where matchedIds comes from in the real run: the success path only. */
  const run = code(read('lib/server/job-sources/run-ingestion.ts'));
  check('matchedIds is populated from the plan of a fetched source, once',
    (run.match(/matchedIds\.add\(/g) || []).length === 1);
  const addAt = run.indexOf('matchedIds.add(');
  const failAt = run.indexOf("ok: false");
  check('the failure branch records ok:false without reaching matchedIds',
    failAt > -1 && /ok: false[\s\S]{0,400}continue;/.test(run.slice(failAt)));
  check('markSeen is the only lastSeenAt writer in the run',
    (run.match(/lastSeenAt/g) || []).length <= 3 && run.includes('markSeen(jobs, matchedIds, now)'));
  check('no global stamp after the loop', !/jobs\.map\(\(job\) => \(\{ \.\.\.job, lastSeenAt: at \}\)\)/.test(run));
  check('the worker never touches lastSeenAt',
    !code(read('scripts/run-job-scraper.ts')).includes('lastSeenAt'));
  void addAt;
}

function noTombstone() {
  console.log('\n── 9. expiresAt is never written or used as a deadline ──');
  const fresh = code(read('lib/server/job-sources/freshness.ts'));
  check('the freshness module has no expiresAt in code', !fresh.includes('expiresAt'));
  check('nor ingestedAt or createdAt', !fresh.includes('ingestedAt') && !fresh.includes('createdAt'));
  check('no Date.now() inside the predicates',
    !/export function (freshnessAgeMs|freshnessState|isPubliclyFresh)[\s\S]{0,400}Date\.now\(\)/.test(fresh));
  for (const f of ['lib/server/db/public-jobs-query.ts', 'lib/server/job-api/queries.ts']) {
    check(`${path.basename(f)} writes nothing`, !/updateOne|updateMany|bulkWrite|insertOne|deleteOne|deleteMany/.test(code(read(f))));
  }
  const dry = code(read('scripts/freshness-dry-run.ts'));
  check('the dry-run performs zero writes',
    !/updateOne|updateMany|bulkWrite|insertOne|insertMany|deleteOne|deleteMany|writeJsonFile|replaceOne|findOneAndUpdate/.test(dry));
  check('the dry-run reads a projection, not whole documents', dry.includes('projection: { _id: 0, id: 1, source: 1, sourceId: 1, lastSeenAt: 1, status: 1 }'));
  check('the dry-run cross-checks the $expr against the predicate', dry.includes('staleCond(DOC_REF, now)') && dry.includes('DISAGREE'));
}

function notActivated() {
  console.log('\n── 10. Not activated ──');
  /* `.env` is untracked ON PURPOSE — it holds production credentials — so it
     does not exist in CI and reading it unconditionally made this suite fail
     with ENOENT on a runner while passing locally. Its ABSENCE is not evidence
     that the flag is off, so the real proof is the live environment check
     below, which holds in both places. The file is still inspected when it
     happens to be present, because a developer running with the flag enabled
     locally is worth catching. */
  const envPath = path.join(ROOT, '.env');
  if (existsSync(envPath)) {
    check('.env does not enable the flag',
      !/^PUBLIC_FRESHNESS_ENABLED=true\s*$/m.test(readFileSync(envPath, 'utf8')));
  } else {
    console.log('  – .env absent (CI): activation proven from process.env instead');
  }
  const example = read('.env.example');
  check('.env.example documents the flag as OFF', /^PUBLIC_FRESHNESS_ENABLED=\s*$/m.test(example));
  check('no frontend reads the flag',
    !read('components/jobs/JobSummaryCard.tsx').includes('PUBLIC_FRESHNESS') && !read('components/JobsFeedPage.tsx').includes('PUBLIC_FRESHNESS'));
  check('the process is not running with it on', process.env.PUBLIC_FRESHNESS_ENABLED !== 'true');
}

function main() {
  classification();
  age();
  boundary();
  exemptionAndUnknown();
  flag();
  inMemoryPath();
  mongoPath();
  markSeenSafety();
  noTombstone();
  notActivated();
  console.log(`\n✅ ${checks}/${checks} checks passed — IMPLEMENTED BUT NOT ACTIVATED`);
}

try { main(); } catch (error) {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
}
