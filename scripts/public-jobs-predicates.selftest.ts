/**
 * P2.9-A/C/D — the split query is the SAME query, and it is now bounded.
 *
 * Run: P29_CORPUS=/path/corpus-full.json npm run test:public-jobs-predicates
 *      (without P29_CORPUS a 3,000-row synthetic corpus is used and the run is
 *       labelled SYNTHETIC; the equivalence half still runs, the numbers are
 *       not the production numbers)
 *
 * ═══ OLD == NEW ═══
 *
 * The oracle is the untouched all-`$expr` builder (`buildPublicJobsConditions`
 * with DOC_REF) run with the same sort/limit; the candidate is
 * `buildPublicJobsCollectionPipeline` (plain predicates + residual `$expr` +
 * persisted `_indiaBucket`). For every Jobs-page query shape, ordered ids and
 * counts must be identical — on the real corpus when provided.
 *
 * ═══ AND BOUNDED ═══
 *
 * With the three P2.9-B indexes present on the isolated mongod, indexed
 * filters must examine ≤ 3× the rows they return, no winning plan may carry
 * a blocking SORT, and indexed counts must examine keys ≈ matches. These are
 * the acceptance gates from the P2.9 audit, asserted rather than described.
 *
 * Needs mongodb-memory-server; SKIPPED (printed) when unavailable.
 */
import { existsSync, readFileSync } from 'node:fs';
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';

let checks = 0; let failures = 0;
function check(label: string, cond: boolean, detail = '') {
  checks += 1;
  if (cond) { console.log(`  ✓ ${label}${detail ? `  [${detail}]` : ''}`); return; }
  failures += 1; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}
const stagesOf = (p: any): string[] => p ? [p.stage, ...(p.inputStage ? stagesOf(p.inputStage) : []), ...(p.inputStages ? p.inputStages.flatMap(stagesOf) : [])] : [];
const statsOf = (ex: any) => { const s = ex.executionStats ?? ex.stages?.[0]?.$cursor?.executionStats; const w = ex.queryPlanner?.winningPlan ?? ex.stages?.[0]?.$cursor?.queryPlanner?.winningPlan; const st = stagesOf(w); return { n: s?.nReturned ?? 0, keys: s?.totalKeysExamined ?? 0, docs: s?.totalDocsExamined ?? 0, ms: s?.executionTimeMillis ?? 0, stages: st, blocking: st.includes('SORT'), fetch: st.includes('FETCH') }; };

async function main() {
  let mongo: Awaited<ReturnType<typeof startTestMongo>> | null = null;
  try { mongo = await startTestMongo(); } catch (e) { console.log(`  (mongodb-memory-server unavailable — SKIPPED, not passed: ${(e as Error).message.slice(0, 60)})`); process.exit(0); }
  if (!isIsolatedTestMongo()) throw new Error('refusing to run outside an isolated test mongo');
  const { getMongoDb } = await import('@/lib/server/database');
  const Q = await import('@/lib/server/db/public-jobs-query');
  const C = await import('@/lib/server/db/public-jobs-cursor');
  const B = await import('@/lib/server/db/public-india-bucket');
  const { derivePublicSortKeys } = await import('@/lib/server/db/public-sort-keys');
  const db = (await getMongoDb())!; const col = db.collection('hiring_jobs');

  const corpusPath = process.env.P29_CORPUS;
  let docs: Array<Record<string, unknown>>; let label: string;
  if (corpusPath && existsSync(corpusPath)) {
    docs = JSON.parse(readFileSync(corpusPath, 'utf8')); label = `REAL CORPUS (${docs.length} rows)`;
  } else {
    const cities = ['Bengaluru, India', 'Remote, India', 'Gurgaon', 'Pune', 'London, UK', 'Remote', 'Mumbai', 'New York, US'];
    docs = Array.from({ length: 3000 }, (_, i) => ({ id: `s${i}`, status: i % 50 === 0 ? 'draft' : 'published', title: i % 3 ? `Engineer ${i}` : `Manager ${i}`, organizationName: `Co ${i % 40}`, location: cities[i % cities.length], country: i % cities.length < 4 || i % cities.length === 6 ? 'IN' : (i % cities.length === 4 ? 'GB' : (i % cities.length === 7 ? 'US' : undefined)), workMode: ['onsite', 'remote', 'hybrid'][i % 3], employmentType: i % 20 ? 'full_time' : 'internship', experienceLevel: ['associate', 'senior', 'lead', undefined][i % 4], description: 'x'.repeat(200), createdAt: `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`, postedAt: undefined, salaryMax: (i % 30) * 1000, domainConfidence: (i % 10) / 10 }));
    label = `SYNTHETIC (${docs.length} rows — not production numbers)`;
  }
  console.log(`corpus: ${label}`);
  /* Seed as the write path would: sort keys and the India bucket derived by the real functions. */
  for (let i = 0; i < docs.length; i += 2000) {
    await col.insertMany(docs.slice(i, i + 2000).map((d) => ({ ...d, _id: d.id, ...derivePublicSortKeys(d), ...B.derivePublicIndiaBucket(d) })) as never);
  }
  await col.createIndex({ status: 1, _skNewest: -1, id: 1 }, { name: 'published_sk_newest' });
  await col.createIndex({ status: 1, _skSalary: -1, id: 1 }, { name: 'published_sk_salary' });
  await col.createIndex({ status: 1, _skRelevance: -1, id: 1 }, { name: 'published_sk_relevance' });
  await col.createIndex({ status: 1, workMode: 1, employmentType: 1, experienceLevel: 1 }, { name: 'published_facets' });
  await col.createIndex({ status: 1, country: 1, state: 1, city: 1 }, { name: 'published_location' });
  /* P2.9-B */
  await col.createIndex({ status: 1, country: 1, _skNewest: -1, id: 1 }, { name: 'published_country_newest' });
  await col.createIndex({ status: 1, workMode: 1, _skNewest: -1, id: 1 }, { name: 'published_workmode_newest' });
  await col.createIndex({ status: 1, _indiaBucket: 1, _skNewest: -1, id: 1 }, { name: 'published_indiabucket_newest' });
  const published = await col.countDocuments({ status: 'published' });

  /* The oracle: the unchanged `$expr` form, same sort and limit. */
  const sortField = (sort?: string) => sort === 'salary' ? '_skSalary' : sort === 'relevance' ? '_skRelevance' : '_skNewest';
  const oracle = async (q: Record<string, unknown>, cursor: unknown = null) => {
    const conds = Q.buildPublicJobsConditions(q as never, Q.DOC_REF);
    const seek = cursor ? C.cursorCondition(sortField(q.sort as string), cursor as never) : null;
    const rows = await col.aggregate([{ $match: seek ? { status: 'published', ...seek } : { status: 'published' } }, { $match: { $expr: { $and: conds } } }, { $sort: { [sortField(q.sort as string)]: -1, id: 1 } }, { $limit: Number(q.pageSize ?? 20) + 1 }, { $project: { _id: 0, id: 1 } }]).toArray();
    return rows.map((r) => String(r.id));
  };
  const oracleCount = async (q: Record<string, unknown>) => col.countDocuments({ status: 'published', $expr: { $and: Q.buildPublicJobsConditions(q as never, Q.DOC_REF) } });
  const candidate = async (q: Record<string, unknown>, cursor: unknown = null) => (await col.aggregate(Q.buildPublicJobsCollectionPipeline(q as never, { cursor: cursor as never })).toArray()).map((r) => String(r.id));

  const CASES: Array<[string, Record<string, unknown>]> = [
    ['newest', { pageSize: '100' }], ['salary', { pageSize: '100', sort: 'salary' }], ['relevance', { pageSize: '100', sort: 'relevance' }],
    ['search engineer (card)', { pageSize: '100', search: 'engineer', searchScope: 'card' }], ['search manager (default)', { pageSize: '100', search: 'manager' }],
    ['search bengaluru (card, location-only hits)', { pageSize: '100', search: 'bengaluru', searchScope: 'card' }], ['search remote (card, location-only hits)', { pageSize: '100', search: 'remote', searchScope: 'card' }],
    ['search "co 7" (card, organisation hits)', { pageSize: '100', search: 'co 7', searchScope: 'card' }],
    ['workMode remote', { pageSize: '100', workMode: 'remote' }], ['workMode remote,hybrid', { pageSize: '100', workMode: 'remote,hybrid' }],
    ['employmentType internship', { pageSize: '100', employmentType: 'internship' }], ['employmentType full_time,internship', { pageSize: '100', employmentType: 'full_time,internship' }],
    ['experience senior', { pageSize: '100', experienceLevel: 'senior' }], ['experience senior,lead', { pageSize: '100', experienceLevel: 'senior,lead' }],
    ['country IN', { pageSize: '100', country: 'IN' }], ['country in (lower)', { pageSize: '100', country: 'in' }], ['country IN,GB', { pageSize: '100', country: 'IN,GB' }],
    ['india', { pageSize: '100', indiaBucket: 'india' }], ['remote-india', { pageSize: '100', indiaBucket: 'remote-india' }], ['bengaluru', { pageSize: '100', indiaBucket: 'bengaluru' }], ['hyderabad', { pageSize: '100', indiaBucket: 'hyderabad' }], ['pune', { pageSize: '100', indiaBucket: 'pune' }], ['mumbai', { pageSize: '100', indiaBucket: 'mumbai' }], ['chennai', { pageSize: '100', indiaBucket: 'chennai' }], ['delhi-ncr', { pageSize: '100', indiaBucket: 'delhi-ncr' }],
    ['location bengaluru', { pageSize: '100', location: 'bengaluru' }], ['location remote', { pageSize: '100', location: 'remote' }],
    ['remote + india', { pageSize: '100', workMode: 'remote', indiaBucket: 'india' }], ['bengaluru + senior', { pageSize: '100', indiaBucket: 'bengaluru', experienceLevel: 'senior' }],
    ['emp multi + wm multi', { pageSize: '100', employmentType: 'full_time,internship', workMode: 'onsite,remote,hybrid' }],
    ['india + search manager', { pageSize: '100', indiaBucket: 'india', search: 'manager', searchScope: 'card' }], ['remote-india + full_time', { pageSize: '100', indiaBucket: 'remote-india', employmentType: 'full_time' }],
    ['location + exp multi', { pageSize: '100', location: 'india', experienceLevel: 'associate,senior,lead' }], ['delhi-ncr + remote (empty-ish)', { pageSize: '100', indiaBucket: 'delhi-ncr', workMode: 'remote' }],
    ['everything', { pageSize: '100', search: 'engineer', searchScope: 'card', employmentType: 'full_time,internship', workMode: 'onsite,remote,hybrid', experienceLevel: 'associate,senior,lead', indiaBucket: 'india' }],
    ['nothing matches', { pageSize: '100', search: 'zzqx-no-such-job', searchScope: 'card' }],
    ['minSalary 20000', { pageSize: '100', minSalary: '20000' }], ['salary + country IN', { pageSize: '100', sort: 'salary', country: 'IN' }],
  ];

  console.log(`\n── 1. OLD ($expr) == NEW (plain + $expr) — first 100 rows, ordered ids ──`);
  for (const [name, q] of CASES) {
    const [o, c] = [await oracle(q), await candidate(q)];
    check(`${name}: ${o.length} ids identical`, o.join() === c.join(), o.join() === c.join() ? '' : `first diff @${o.findIndex((x, i) => x !== c[i])} old=${o.length} new=${c.length}`);
  }
  console.log(`\n── 2. Deep cursor pages agree ──`);
  for (const [name, q] of [CASES[0], CASES[5], CASES[14], CASES[16]]) {
    let cur: unknown = null; let page = 0;
    for (let i = 0; i < 4; i += 1) { const rows = await candidate(q, cur); if (rows.length <= 100) break; const last = (await col.findOne({ id: rows[99] }))!; cur = { v: 1, value: last[sortField(q.sort as string)], id: rows[99], q: C.cursorBinding(q as never) }; page = i + 2; }
    if (cur) check(`${name}: page ${page} identical under the same cursor`, (await oracle(q, cur)).join() === (await candidate(q, cur)).join());
    else check(`${name}: fewer than 2 pages — deep check not applicable`, true);
  }
  console.log(`\n── 3. Counts agree ──`);
  for (const [name, q] of CASES) { const [o, c] = [await oracleCount(q), await Q.countPublicJobs(q as never)]; check(`${name}: count ${o}`, o === c, `new ${c}`); }

  console.log(`\n── 4. Bounded: indexed filters examine ≤ 3× returned, no blocking SORT (${label}) ──`);
  const INDEXED: Array<[string, Record<string, unknown>]> = [
    ['newest first page', { pageSize: '20' }], ['country IN', { pageSize: '20', country: 'IN' }], ['india', { pageSize: '20', indiaBucket: 'india' }],
    ['remote-india', { pageSize: '20', indiaBucket: 'remote-india' }], ['bengaluru', { pageSize: '20', indiaBucket: 'bengaluru' }], ['delhi-ncr', { pageSize: '20', indiaBucket: 'delhi-ncr' }],
    ['workMode hybrid', { pageSize: '20', workMode: 'hybrid' }], ['workMode remote,hybrid', { pageSize: '20', workMode: 'remote,hybrid' }], ['remote + india', { pageSize: '20', workMode: 'remote', indiaBucket: 'india' }],
    ['delhi-ncr + remote (empty)', { pageSize: '20', indiaBucket: 'delhi-ncr', workMode: 'remote' }],
  ];
  console.log('  case                            ret   keys   docs   ms  plan');
  for (const [name, q] of INDEXED) {
    const s = statsOf(await col.aggregate(Q.buildPublicJobsCollectionPipeline(q as never, {})).explain('executionStats'));
    console.log(`  ${name.padEnd(30)} ${String(s.n).padStart(4)} ${String(s.keys).padStart(6)} ${String(s.docs).padStart(6)} ${String(s.ms).padStart(4)}  ${s.stages.join('>')}`);
    /* One indexed predicate bounds the scan to ITS matches; the rest of a
       conjunction is evaluated on those fetched rows. So a page is bounded by
       returned rows while matches exist, and by the most selective plain
       predicate's match count when they run out — never by the corpus. */
    const { plain } = Q.buildPublicJobsMatch(q as never);
    const singles = plain.filter((p) => !('status' in p) && !('isActive' in p) && !('expiresAt' in p));
    const tightest = singles.length ? Math.min(...await Promise.all(singles.map((p) => col.countDocuments({ status: 'published', ...p })))) : published;
    /* A single plain predicate: the index bounds the scan to the rows returned.
       A conjunction of several: ONE index bounds ONE predicate, the others are
       evaluated on those fetched rows — so the bound is that predicate's own
       match count, never the corpus. (remote + india: 76 fetched for 21 rows,
       against 1,001 on the unsplit query.) */
    const single = singles.length <= 1 && s.n > 0;
    /* A sort-only page (no filter) must examine ~1 document per row: 1.2×. */
    const factor = singles.length === 0 ? 1.2 : 3;
    const bound = single ? Math.max(factor * s.n, 3) : tightest;
    check(`${name}: docs examined ≤ ${single ? `${factor}× returned` : `tightest plain predicate (${tightest})`}`, s.docs <= bound, `${s.docs} for ${s.n} rows`);
    check(`${name}: not corpus-proportional`, s.docs < published, `${s.docs} of ${published}`);
    check(`${name}: no blocking SORT`, !s.blocking);
  }
  console.log(`\n── 4b. Deep pages of indexed filters stay bounded (P2.9-F rooted seek) ──`);
  console.log('  case                            ret   keys   docs   ms  plan');
  for (const [name, q] of [['newest', { pageSize: '20' }], ['country IN', { pageSize: '20', country: 'IN' }], ['workMode remote', { pageSize: '20', workMode: 'remote' }], ['workMode hybrid', { pageSize: '20', workMode: 'hybrid' }], ['workMode remote,hybrid', { pageSize: '20', workMode: 'remote,hybrid' }], ['remote-india', { pageSize: '20', indiaBucket: 'remote-india' }], ['bengaluru', { pageSize: '20', indiaBucket: 'bengaluru' }], ['delhi-ncr', { pageSize: '20', indiaBucket: 'delhi-ncr' }]] as Array<[string, Record<string, unknown>]>) {
    /* The boundary is the row 40% of the way through the shape's own order —
       found server-side so the check costs one small query, not a page walk. */
    const { plain } = Q.buildPublicJobsMatch(q as never);
    const total = await col.countDocuments({ $and: plain });
    if (total < 40) { check(`${name}: too few rows for a deep page (${total}) — not applicable`, true); continue; }
    const [b] = await col.aggregate([{ $match: { $and: plain } }, { $sort: { _skNewest: -1, id: 1 } }, { $skip: Math.floor(total * 0.4) }, { $limit: 1 }, { $project: { _id: 0, id: 1, _skNewest: 1 } }]).toArray();
    const cur = { v: 1, value: b._skNewest, id: b.id, q: C.cursorBinding(q as never) } as never;
    const s = statsOf(await col.aggregate(Q.buildPublicJobsCollectionPipeline(q as never, { cursor: cur })).explain('executionStats'));
    console.log(`  ${name.padEnd(30)} ${String(s.n).padStart(4)} ${String(s.keys).padStart(6)} ${String(s.docs).padStart(6)} ${String(s.ms).padStart(4)}  ${s.stages.join('>')}`);
    /* A single-equality shape is index-bounded: ~1 document per row. A
       multi-value `$in` shape deliberately keeps the unrooted seek (the rooted
       form blocking-sorted 2,271 docs on Atlas) and walks the newest index
       bounded by its SELECTIVITY p = matches / published — expected ≈ rows / p
       — never by the corpus. The gate is 3× that expectation. */
    const multi = plain.some((pr) => !('expiresAt' in pr) && Object.values(pr).some((v) => typeof v === 'object' && v !== null && '$in' in (v as Record<string, unknown>)));
    const expected = multi ? Math.ceil(s.n / (total / published)) : s.n;
    check(`${name} deep: docs examined ≤ 3× ${multi ? `rows/selectivity (${expected})` : 'returned'}`, s.docs <= Math.max(3 * expected, 3), `${s.docs} for ${s.n}`);
    check(`${name} deep: no blocking SORT`, !s.blocking);
    check(`${name} deep: same ids as the $expr oracle under this cursor`, (await oracle(q, cur)).join() === (await candidate(q, cur)).join());
  }

  console.log(`\n── 5. Bounded counts: keys examined == matches for indexed predicates ──`);
  for (const [name, q] of [['country IN', { country: 'IN' }], ['remote-india', { indiaBucket: 'remote-india' }], ['workMode hybrid', { workMode: 'hybrid' }], ['bengaluru', { indiaBucket: 'bengaluru' }]] as Array<[string, Record<string, unknown>]>) {
    const { plain, expr } = Q.buildPublicJobsMatch(q as never);
    const s = statsOf(await col.find({ $and: expr.length ? [...plain, { $expr: { $and: expr } }] : plain }).explain('executionStats'));
    const matches = await Q.countPublicJobs(q as never);
    check(`${name}: keys ${s.keys} == matches ${matches} (docs ${s.docs}, plan ${s.stages.join('>')})`, s.keys === matches && s.keys < published);
  }
  console.log(`\n── 6. The residual $expr is empty for pure-filter queries ──`);
  check('country + workMode leaves no $expr', Q.buildPublicJobsMatch({ country: 'IN', workMode: 'remote' } as never).expr.length === 0);
  check('search keeps its $expr', Q.buildPublicJobsMatch({ search: 'x', searchScope: 'card' } as never).expr.length === 1);
  check('state stays an expression (mixed-case stored values)', Q.buildPublicJobsMatch({ state: 'Karnataka' } as never).expr.length === 1);

  console.log(`\n── 7. A storage failure is null, never a count of zero ──`);
  const SRC = readFileSync(new URL('../lib/server/db/public-jobs-query.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const countFn = SRC.slice(SRC.indexOf('export async function countPublicJobs('), SRC.indexOf('\n}\n', SRC.indexOf('export async function countPublicJobs(')));
  check('countPublicJobs returns null on a failed read (source)', /catch \{\s*return null;\s*\}/.test(countFn) && !/return 0/.test(countFn));
  await mongo.stop();
  const { invalidatePublishedHiringJobs } = await import('@/lib/server/hiring'); invalidatePublishedHiringJobs();
  const down = await Q.countPublicJobs({ workMode: 'remote' } as never).catch(() => 'threw');
  check('countPublicJobs answers null when the store is gone (behaviour)', down === null, `got ${String(down)}`);
  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed  (${label})`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1); });
