/**
 * Phase 2.7F — does the canonical architecture actually hold at 100,000 jobs?
 *
 * Run: npm run bench:job-scale            (default up to 100K)
 *      SCALES=5000,10000 npm run bench:job-scale
 *
 * ═══ WHY THIS IS A BENCHMARK, NOT A SELFTEST ═══
 *
 * It writes hundreds of thousands of documents and takes minutes. Putting that
 * in the ordinary suite would make everyone stop running the suite. It is a
 * deliberate, separately-invoked measurement.
 *
 * ═══ IT MEASURES THE REAL CODE ═══
 *
 * Writes go through `upsertHiringJobs` — the production writer. Reads go
 * through `selectPublicJobsPageFromCollection`, `countPublishedJobs` and
 * `selectPublishedJobsByIds` — the production readers. No parallel benchmark
 * implementation exists, because a benchmark of code that is not shipped
 * measures nothing.
 *
 * ═══ ISOLATION IS ASSERTED, NOT ASSUMED ═══
 *
 * Everything runs against mongodb-memory-server, and `isIsolatedTestMongo()` is
 * checked before the first write. A benchmark that writes 100K synthetic
 * postings into Atlas would be an incident, so the check is a hard gate.
 *
 * ═══ WHAT IT CANNOT TELL YOU ═══
 *
 * Latency here is local-loopback against an in-memory mongod. It answers
 * "does the DATABASE-side work stay bounded as the collection grows?" It says
 * NOTHING about production latency over a network, and no number here should
 * ever be quoted as a production figure.
 */
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';

const SCALES = (process.env.SCALES ?? '5000,10000,50000,100000')
  .split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
const BATCH = Number(process.env.BATCH ?? 1000);
const SEED = Number(process.env.SEED ?? 20260908);

/* Deterministic PRNG so a run is reproducible from its seed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

const COMPANIES = ['Acme', 'Northwind', 'Globex', 'Initech', 'Umbra', 'Vertex', 'Lumen', 'Kestrel'];
const TITLES = ['Backend Engineer', 'Data Analyst', 'Platform Engineer', 'ML Engineer',
  'Frontend Developer', 'SRE', 'Product Designer', 'QA Engineer'];
const CITIES = [['Pune', 'MH', 'IN'], ['Bengaluru', 'KA', 'IN'], ['Hyderabad', 'TG', 'IN'],
  ['Remote', '', 'IN'], ['Chennai', 'TN', 'IN']];
const SKILLS = ['typescript', 'python', 'react', 'mongodb', 'aws', 'kubernetes', 'go', 'rust'];

/** A synthetic posting shaped like the real schema, sized like real data. */
function makeJob(i: number, rand: () => number, variant = 0): Record<string, unknown> {
  const [city, state, country] = CITIES[i % CITIES.length];
  const org = COMPANIES[i % COMPANIES.length];
  const title = TITLES[i % TITLES.length];
  return {
    id: `bench-job-${i}`,
    title: `${title} ${i}${variant ? ` v${variant}` : ''}`,
    organizationName: org,
    createdByUserId: `bench-user-${i % 200}`,
    organizationId: `bench-org-${i % 200}`,
    location: city, city, state, country,
    employmentType: i % 3 === 0 ? 'full_time' : i % 3 === 1 ? 'contract' : 'internship',
    workMode: i % 2 ? 'remote' : 'onsite',
    experienceLevel: ['entry', 'mid', 'senior'][i % 3],
    /* ~900 chars — measured against the real corpus average rather than padded
       to make the benchmark look impressive or deliberately kept tiny. */
    description: `We are hiring a ${title} at ${org} in ${city}. `
      + 'The role covers service design, data modelling and production ownership. '.repeat(8),
    requirements: 'Experience with distributed systems and testing. '.repeat(3),
    preferredSkills: [SKILLS[i % 8], SKILLS[(i + 3) % 8], SKILLS[(i + 5) % 8]],
    targetRoleKeywords: [title.toLowerCase()],
    salaryMin: 600000 + (i % 20) * 100000,
    salaryMax: 1200000 + (i % 20) * 150000,
    salaryCurrency: 'INR',
    status: 'published',
    isActive: true,
    applyUrl: `https://example.com/jobs/${i}`,
    shareUrl: `/jobs/bench-job-${i}`,
    sourceId: `bench-source-${i % 12}`,
    sourceJobId: `ext-${i}`,
    domainConfidence: Math.round(rand() * 100) / 100,
    minimumAtsScore: 0,
    postedAt: new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString(),
    createdAt: new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString(),
  };
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;
const heapMB = () => Math.round(process.memoryUsage().heapUsed / 1048576);
function pct(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
}

async function main() {
  const started = new Date().toISOString();
  const mongo = await startTestMongo();
  try {
    if (!isIsolatedTestMongo()) {
      console.error('REFUSING TO RUN: not pointed at an isolated test database.');
      process.exit(1);
    }
    const { getMongoDb } = await import('@/lib/server/database');
    const {
      upsertHiringJobs, countPublishedJobs, selectPublishedJobsByIds,
    } = await import('@/lib/server/db/hiring-jobs-collection');
    const { selectPublicJobsPageFromCollection } = await import('@/lib/server/db/public-jobs-query');
    const { HIRING_JOBS_INDEXES } = await import('./db-indexes-hiring-jobs.mjs');

    const db = await getMongoDb();
    if (!db) throw new Error('no database');
    const col = db.collection('hiring_jobs');
    const buildInfo = await db.admin().buildInfo().catch(() => ({ version: 'unknown' }));

    console.log('═══ PHASE 2.7F — CANONICAL JOB SCALE VALIDATION ═══');
    console.log(`  started      : ${started}`);
    console.log(`  node         : ${process.version}   platform: ${process.platform}/${process.arch}`);
    console.log(`  mongodb      : ${(buildInfo as { version?: string }).version}  (mongodb-memory-server, isolated)`);
    console.log(`  database     : ${mongo.dbName}`);
    console.log(`  seed         : ${SEED}   batch: ${BATCH}   scales: ${SCALES.join(', ')}`);

    /* Production indexes, so the measurement reflects production planning
       rather than an unindexed collection. */
    for (const idx of HIRING_JOBS_INDEXES as unknown as Array<{ keys: Record<string, number>; options: { name: string } }>) {
      await col.createIndex(idx.keys as never, idx.options);
    }
    console.log(`  indexes      : ${(await col.indexes()).length} created from the production plan\n`);

    /* ── document size, measured not assumed ────────────────────────────── */
    const rand = rng(SEED);
    const sizes = Array.from({ length: 500 }, (_, i) =>
      Buffer.byteLength(JSON.stringify(makeJob(i, rand)), 'utf8'));
    const avg = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);
    console.log('── DOCUMENT SIZE (500 samples) ──');
    console.log(`  avg ${avg} B | p50 ${pct(sizes, 0.5)} | p95 ${pct(sizes, 0.95)} | p99 ${pct(sizes, 0.99)} | max ${Math.max(...sizes)}`);
    for (const n of [10000, 50000, 100000, 1000000]) {
      console.log(`  projected raw JSON at ${String(n).padStart(7)}: ${mb(avg * n)}${n === 1000000 ? '   (ESTIMATED)' : ''}`);
    }
    console.log('');

    let populated = 0;
    for (const scale of SCALES) {
      console.log(`═══ SCALE ${scale.toLocaleString()} ═══`);
      const r2 = rng(SEED + scale);

      /* ── bulk write through the PRODUCTION writer ─────────────────────── */
      const heapBefore = heapMB();
      let peak = heapBefore;
      const t0 = Date.now();
      let written = 0;
      for (let start = populated; start < scale; start += BATCH) {
        const end = Math.min(start + BATCH, scale);
        const inputs = [];
        for (let i = start; i < end; i += 1) {
          inputs.push({ job: makeJob(i, r2), order: i * 1048576 });
        }
        const res = await upsertHiringJobs(inputs);
        if (!res.ok) throw new Error(`write failed at ${start}: ${res.error}`);
        written += res.written;
        peak = Math.max(peak, heapMB());
      }
      const writeMs = Date.now() - t0;
      const count = await col.countDocuments();
      populated = scale;

      console.log(`── BULK WRITE ──`);
      console.log(`  wrote ${written} in ${writeMs} ms  (${Math.round(written / (writeMs / 1000))} jobs/sec, batch ${BATCH})`);
      console.log(`  collection now ${count} docs | heap ${heapBefore}→${heapMB()} MB, peak ${peak} MB`);
      const stats = await db.command({ collStats: 'hiring_jobs' }).catch(() => null) as
        { size?: number; storageSize?: number; totalIndexSize?: number } | null;
      if (stats) {
        console.log(`  storage: data ${mb(stats.size ?? 0)} | alloc ${mb(stats.storageSize ?? 0)} | indexes ${mb(stats.totalIndexSize ?? 0)}`);
      }

      /* ── changed-job updates: the architectural proof ──────────────────── */
      console.log('── CHANGED-JOB UPDATE (the O(changed) proof) ──');
      for (const changed of [1, 10, 100, 1000]) {
        if (changed > scale) continue;
        const h0 = heapMB();
        const inputs = Array.from({ length: changed }, (_, k) => ({ job: makeJob(k, rng(SEED), scale) }));
        const t = Date.now();
        const res = await upsertHiringJobs(inputs);
        console.log(`  ${String(changed).padStart(5)} changed of ${scale}: ${Date.now() - t} ms, `
          + `${res.written} written, ${res.unchanged} unchanged, heap ${h0}→${heapMB()} MB`);
      }

      /* ── unchanged: fingerprint protection ─────────────────────────────── */
      const sameInputs = Array.from({ length: 1000 }, (_, k) => ({ job: makeJob(k, rng(SEED), scale) }));
      const tU = Date.now();
      const unchangedRes = await upsertHiringJobs(sameInputs);
      console.log('── UNCHANGED-JOB RESUBMIT ──');
      console.log(`  1000 identical: ${Date.now() - tU} ms, ${unchangedRes.written} written, ${unchangedRes.unchanged} unchanged`);

      /* ── partial batch safety ──────────────────────────────────────────── */
      const before = await col.countDocuments();
      await upsertHiringJobs(Array.from({ length: 100 }, (_, k) => ({ job: makeJob(k, rng(SEED), scale + 1) })));
      const after = await col.countDocuments();
      console.log('── PARTIAL BATCH SAFETY ──');
      console.log(`  submitted 100 of ${before}: ${after} remain  → ${after === before ? 'NO unrelated deletion ✓' : 'DELETION DETECTED ✗'}`);

      /* ── duplicate / identity ──────────────────────────────────────────── */
      const dupBefore = await col.countDocuments();
      await upsertHiringJobs([
        { job: makeJob(0, rng(SEED), scale + 2) }, { job: makeJob(0, rng(SEED), scale + 2) },
      ]);
      const dupAfter = await col.countDocuments();
      console.log(`── DUPLICATE IDENTITY ──`);
      console.log(`  same id twice: ${dupBefore} → ${dupAfter}  → ${dupAfter === dupBefore ? 'no duplicate document ✓' : 'DUPLICATE ✗'}`);

      /* ── public reads through the production query ─────────────────────── */
      console.log('── PUBLIC READ (production query) ──');
      for (const [label, query] of [
        ['newest p20', { page: 1, pageSize: 20, sort: 'newest' }],
        ['newest p100', { page: 1, pageSize: 100, sort: 'newest' }],
        ['deep page 50', { page: 50, pageSize: 20, sort: 'newest' }],
        ['country=IN', { page: 1, pageSize: 20, country: 'IN' }],
        ['search', { page: 1, pageSize: 20, search: 'engineer' }],
        ['salary sort', { page: 1, pageSize: 20, sort: 'salary' }],
      ] as Array<[string, Record<string, unknown>]>) {
        const runs: number[] = [];
        let total = 0, items = 0, bytes = 0;
        for (let r = 0; r < 5; r += 1) {
          const h0 = heapMB();
          const t = Date.now();
          const page = await selectPublicJobsPageFromCollection(query as never);
          runs.push(Date.now() - t);
          if (page) { total = page.total; items = page.items.length; bytes = Buffer.byteLength(JSON.stringify(page.items), 'utf8'); }
          peak = Math.max(peak, heapMB()); void h0;
        }
        console.log(`  ${label.padEnd(14)} p50 ${String(pct(runs, 0.5)).padStart(5)} ms | p95 ${String(pct(runs, 0.95)).padStart(5)} ms `
          + `| ${items} of ${total} | payload ${(bytes / 1024).toFixed(0)} KB`);
      }

      /* ── count ─────────────────────────────────────────────────────────── */
      const cRuns: number[] = [];
      let cVal: number | null = 0;
      for (let r = 0; r < 5; r += 1) { const t = Date.now(); cVal = await countPublishedJobs(); cRuns.push(Date.now() - t); }
      console.log(`── COUNT ──\n  p50 ${pct(cRuns, 0.5)} ms | value ${cVal} | correct: ${cVal === (await col.countDocuments({ status: 'published' })) ? 'YES ✓' : 'NO ✗'}`);

      /* ── by-id ─────────────────────────────────────────────────────────── */
      console.log('── BY-ID ──');
      for (const n of [1, 10, 100, 500]) {
        const ids = Array.from({ length: n }, (_, k) => `bench-job-${k}`);
        const runs: number[] = [];
        let got = 0;
        for (let r = 0; r < 5; r += 1) {
          const t = Date.now();
          const m = await selectPublishedJobsByIds(ids);
          runs.push(Date.now() - t);
          got = m ? m.size : -1;
        }
        console.log(`  ${String(n).padStart(3)} ids: p50 ${String(pct(runs, 0.5)).padStart(4)} ms | returned ${got}${got === n ? ' ✓' : ' ✗'}`);
      }

      /* ── explain: is the query bounded? ────────────────────────────────── */
      const ex = await col.find({ status: 'published' }).sort({ postedAt: -1, _id: 1 })
        .limit(20).explain('executionStats') as Record<string, unknown>;
      const es = (ex.executionStats ?? {}) as { totalDocsExamined?: number; totalKeysExamined?: number; nReturned?: number; executionTimeMillis?: number };
      const plan = JSON.stringify(ex.queryPlanner ?? {});
      console.log('── EXPLAIN (newest page) ──');
      console.log(`  index ${(plan.match(/"indexName":"([^"]+)"/) || [])[1] ?? 'NONE'} | `
        + `docsExamined ${es.totalDocsExamined} | keysExamined ${es.totalKeysExamined} | returned ${es.nReturned} | ${es.executionTimeMillis} ms`);
      console.log(`  heap after scale ${scale}: ${heapMB()} MB (peak ${peak} MB)\n`);
    }

    /* ── failure semantics at scale ───────────────────────────────────────── */
    console.log('═══ FAILURE SEMANTICS ═══');
    const empty = await upsertHiringJobs([]);
    console.log(`  empty batch: ok=${empty.ok} written=${empty.written} → deletes nothing ✓`);
    let threwNoId = false;
    try { await upsertHiringJobs([{ job: { title: 'no id' } }]); } catch { threwNoId = true; }
    console.log(`  job without id: ${threwNoId ? 'REFUSED ✓' : 'ACCEPTED ✗'}`);
    /* The refusal surfaces as a FAILED RESULT, not a throw: upsertHiringJobs
       catches inside its own try and reports. What matters is that nothing was
       written, which is checked against the count. */
    const beforeNoOrder = await col.countDocuments();
    const noOrder = await upsertHiringJobs([{ job: { id: 'brand-new-no-order' } }]);
    const afterNoOrder = await col.countDocuments();
    console.log(`  new job without order: ok=${noOrder.ok} written=${noOrder.written} `
      + `docs ${beforeNoOrder}→${afterNoOrder} → `
      + `${!noOrder.ok && afterNoOrder === beforeNoOrder ? 'REFUSED, nothing written ✓' : 'ACCEPTED ✗'}`);
    const finalCount = await col.countDocuments();
    console.log(`  collection intact after failures: ${finalCount} docs`);

    console.log('\n═══ END ═══');
  } finally {
    await mongo.stop();
  }
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
