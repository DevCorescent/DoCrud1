/**
 * Large-scale ingestion — where does the INGEST path stop scaling?
 *
 * Run: npm run bench:ingestion-scale
 *      SCALES=1000,5000 npm run bench:ingestion-scale
 *
 * ═══ WHY A SEPARATE BENCHMARK FROM job-scale.bench.ts ═══
 *
 * `job-scale.bench.ts` measures the canonical READ and WRITE paths. Neither is
 * what bounds ingestion. `runCanonicalIngestion` begins with
 *
 *     let jobs = await load();          // getHiringJobs() -> selectAllJobDocs()
 *
 * which materialises the ENTIRE corpus in memory, and then calls
 * `planIngest(drafts, jobs)` once PER SOURCE against that whole array. Those
 * two costs grow with the corpus, not with the number of jobs discovered, and
 * nothing in the existing benchmarks measures them.
 *
 * Critically, that load happens BEFORE the fetch deadline is consulted, so its
 * cost is subtracted from the run's usable budget without being accounted for
 * by `saveReserveMs`.
 *
 * ═══ WHAT IT MEASURES ═══
 *
 *   1. full-corpus load   — the real `selectAllJobDocs()`
 *   2. planIngest         — the real planner, once per simulated source
 *   3. heap after load    — against Vercel's 1024 MB Node limit
 *   4. re-ingest of identical drafts — proves the unchanged path writes nothing
 *
 * ═══ WHAT IT CANNOT TELL YOU ═══
 *
 * mongodb-memory-server over loopback. It answers "how does this scale with
 * corpus size on one machine?" It is NOT a production latency figure — over a
 * real network the load is additionally bandwidth-bound.
 */
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';

const SCALES = (process.env.SCALES ?? '1000,5000,10000,25000,50000,100000')
  .split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
const BATCH = Number(process.env.BATCH ?? 1000);
/** Simulated configured boards — how many times planIngest runs per ingestion. */
const SOURCES = Number(process.env.SOURCES ?? 23);
/** Jobs each simulated source returns per run. */
const PER_SOURCE = Number(process.env.PER_SOURCE ?? 100);

const COMPANIES = ['Acme', 'Northwind', 'Globex', 'Initech', 'Umbra', 'Vertex'];
const TITLES = ['Backend Engineer', 'Data Analyst', 'Platform Engineer', 'ML Engineer'];
const CITIES = ['Pune', 'Bengaluru', 'Hyderabad', 'Remote', 'Chennai'];

/** Shaped like the real schema and sized to the MEASURED production average
    (2,548 bytes/doc across 5,276 live documents). */
function makeJob(i: number): Record<string, unknown> {
  const org = COMPANIES[i % COMPANIES.length];
  const title = TITLES[i % TITLES.length];
  const iso = new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString();
  return {
    id: `ing-job-${i}`,
    title: `${title} ${i}`,
    organizationName: org,
    organizationId: `ing-org-${i % 200}`,
    createdByUserId: `ing-user-${i % 200}`,
    createdByEmail: `bench${i % 200}@example.invalid`,
    location: CITIES[i % CITIES.length],
    employmentType: 'full_time',
    workMode: i % 2 ? 'remote' : 'onsite',
    experienceLevel: ['entry', 'mid', 'senior'][i % 3],
    description: `We are hiring a ${title} at ${org}. `
      + 'The role covers service design, data modelling and production ownership. '.repeat(8),
    requirements: 'Experience with distributed systems and testing. '.repeat(3),
    responsibilities: 'Own services end to end. '.repeat(3),
    preferredSkills: ['typescript', 'mongodb', 'aws'],
    targetRoleKeywords: [title.toLowerCase()],
    status: 'published',
    isActive: true,
    applyUrl: `https://example.com/jobs/${i}`,
    shareUrl: `/jobs/ing-job-${i}`,
    sourceId: `bench-source-${i % SOURCES}`,
    sourceJobId: `ext-${i}`,
    minimumAtsScore: 0,
    postedAt: iso, createdAt: iso, updatedAt: iso,
  };
}

const SCALES_MAX = Math.max(...SCALES);
const ORDER_STEP = 1_048_576;

const heapMB = () => Math.round(process.memoryUsage().heapUsed / 1048576);
const pad = (s: string | number, n: number) => String(s).padStart(n);

async function main() {
  const mongo = await startTestMongo();
  try {
    if (!isIsolatedTestMongo()) {
      console.error('REFUSING TO RUN: not pointed at an isolated test database.');
      process.exit(1);
    }
    const { getMongoDb } = await import('@/lib/server/database');
    const { upsertHiringJobs, selectAllJobDocs } =
      await import('@/lib/server/db/hiring-jobs-collection');
    const { planIngest } = await import('@/lib/server/job-sources/ingest');
    const { selectJobDocsForSource } = await import('@/lib/server/db/hiring-jobs-collection');
    const { normalizeSourceJob } = await import('@/lib/server/job-sources/normalize');

    const db = await getMongoDb();
    if (!db) throw new Error('no isolated database');

    console.log(`\nSimulating ${SOURCES} configured boards x ${PER_SOURCE} jobs discovered per run.`);
    console.log('\n  WHOLE-CORPUS PATH                                                        || INCREMENTAL LOOKUP');
    console.log('  corpus |  load ms | load MB | heap MB | planIngest ms | new | updated | unchanged | rewrites || lookup | heap +MB | candidates');
    console.log('  -------+----------+---------+---------+---------------+-----+---------+-----------+----------++--------+----------+-----------');
    console.log('  (last two columns are the SECOND, identical pass: steady state)');

    let seeded = 0;
    for (const n of SCALES) {
      /* Grow the collection to n rather than rebuilding it each time. */
      while (seeded < n) {
        const upto = Math.min(n, seeded + BATCH);
        const batch = [];
        for (let i = seeded; i < upto; i += 1) {
          /* Descending order so job 0 sits at the front, matching the
             prepend semantics of the real ingest planner. */
          batch.push({ job: makeJob(i), order: (SCALES_MAX - i) * ORDER_STEP });
        }
        const res = await upsertHiringJobs(batch);
        if (!res.ok) throw new Error('seed failed');
        seeded = upto;
      }

      if (global.gc) global.gc();
      const t0 = Date.now();
      const jobs = await selectAllJobDocs();
      const loadMs = Date.now() - t0;
      const loadMB = Buffer.byteLength(JSON.stringify(jobs)) / 1048576;
      const heap = heapMB();

      /* Re-ingest jobs ALREADY in the corpus: the steady-state case, where a
         board returns what it returned last run. This is the path that must
         produce zero writes. */
      const now = new Date().toISOString();
      let planMs = 0; let created = 0; let updated = 0; let unchanged = 0;
      let working = jobs;
      const allDrafts: unknown[][] = [];
      for (let s = 0; s < SOURCES; s += 1) {
        const raw = [];
        for (let k = 0; k < PER_SOURCE; k += 1) {
          /* Jobs actually belonging to source s: makeJob stamps
             sourceId = bench-source-(i % SOURCES), so only these indices
             re-ingest as the SAME posting rather than as a new one. */
          const idx = (s + k * SOURCES) % n;
          const j = makeJob(idx) as Record<string, string>;
          raw.push({
            source: `bench-source-${s % SOURCES}`, provider: 'greenhouse',
            externalId: String(j.sourceJobId), title: String(j.title),
            organizationName: String(j.organizationName), location: String(j.location),
            department: '', employmentType: 'full_time', workMode: 'remote',
            experienceLevel: 'mid', description: String(j.description),
            responsibilities: ['Own services end to end.'],
            requirements: ['Distributed systems.'],
            preferredSkills: ['typescript', 'mongodb', 'aws'],
            targetRoleKeywords: [String(j.title).toLowerCase()],
            salaryPresent: false, postedAt: String(j.postedAt),
            jobUrl: String(j.applyUrl), applyUrl: String(j.applyUrl), isActive: true,
          });
        }
        const drafts = raw.map((r) => normalizeSourceJob(r as never,
          { sourceId: `bench-source-${s % SOURCES}`, now: Date.now() }));
        allDrafts.push(drafts as unknown[]);
        const p0 = Date.now();
        const plan = planIngest(drafts as never, working as never, { now });
        planMs += Date.now() - p0;
        working = plan.jobs as never;
        created += plan.report.created;
        updated += plan.report.updated;
      }

      /* SECOND pass, byte-identical drafts against the corpus the first pass
         produced. This is the steady state: a board that returned the same
         postings it returned last run must produce zero writes. */
      let secondUnchanged = 0; let secondWrites = 0;
      for (const drafts of allDrafts) {
        const plan = planIngest(drafts as never, working as never, { now });
        working = plan.jobs as never;
        secondUnchanged += plan.report.unchanged;
        secondWrites += plan.report.created + plan.report.updated;
      }
      unchanged = secondUnchanged;

      /* The incremental alternative, over the SAME corpus: per source fetch
         only the postings its drafts could match, never the whole corpus. */
      if (global.gc) global.gc();
      const heapBefore = heapMB();
      const i0 = Date.now();
      let candidateDocs = 0;
      for (let s2 = 0; s2 < SOURCES; s2 += 1) {
        const ids: string[] = [];
        for (let k = 0; k < PER_SOURCE; k += 1) ids.push(`ext-${(s2 + k * SOURCES) % n}`);
        const found = await selectJobDocsForSource(`bench-source-${s2}`, { sourceJobIds: ids });
        candidateDocs += found.length;
      }
      const incMs = Date.now() - i0;
      const incHeap = heapMB() - heapBefore;

      console.log(`  ${pad(n, 6)} | ${pad(loadMs, 8)} | ${pad(loadMB.toFixed(1), 7)} | ${pad(heap, 7)} | ${pad(planMs, 13)} | ${pad(created, 3)} | ${pad(updated, 7)} | ${pad(unchanged, 9)} | ${pad(secondWrites, 6)} || ${pad(incMs, 6)} | ${pad(incHeap, 8)} | ${pad(candidateDocs, 10)}`);
    }

    console.log('\nNOTE: loopback timings. Production adds network transfer to the load column.');
  } finally {
    await mongo.stop();
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
