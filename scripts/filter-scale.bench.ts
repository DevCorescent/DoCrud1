/**
 * P2.9 — filtered public-jobs queries as the corpus grows. SYNTHETIC.
 *
 * Run: npm run bench:filter-scale
 *
 * Seeds an isolated mongod with N postings shaped like the real corpus
 * (published share, workMode / country / India-bucket distributions from the
 * audit), with the P2.9-B indexes, and explains the split pipeline at each
 * size. The number that matters is docs examined per row returned: it must
 * not grow with N. Milliseconds are this machine's and are shown only for
 * scale; the production numbers are in the P2.9 audit and the predicates
 * selftest run against the real corpus.
 */
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';

(async () => {
  const mongo = await startTestMongo();
  if (!isIsolatedTestMongo()) throw new Error('refusing to run outside an isolated test mongo');
  const { getMongoDb } = await import('@/lib/server/database');
  const Q = await import('@/lib/server/db/public-jobs-query');
  const { derivePublicSortKeys } = await import('@/lib/server/db/public-sort-keys');
  const B = await import('@/lib/server/db/public-india-bucket');
  const db = (await getMongoDb())!; const col = db.collection('hiring_jobs');
  console.log('SYNTHETIC — seeded in-memory MongoDB shaped like the audit distributions, not production Atlas\n');
  const SIZES = [12659, 50000, 100000, 250000, 500000, 1000000];
  const locs = ['Bengaluru, India', 'Remote, India', 'Gurgaon', 'Pune', 'Hyderabad', 'Mumbai', 'Chennai', 'London, UK', 'Remote', 'New York, US', 'Toronto, CA', 'Singapore', 'Dublin, IE', 'Austin, US', 'Berlin, DE', 'Kolkata'];
  const wm = (i: number) => (i % 100 < 70 ? 'onsite' : i % 100 < 96 ? 'remote' : 'hybrid');
  const ctry = (i: number) => { const l = locs[i % locs.length]; return l.includes('India') || ['Gurgaon', 'Pune', 'Hyderabad', 'Mumbai', 'Chennai', 'Kolkata'].includes(l) ? 'IN' : l.includes('UK') ? 'GB' : l.includes('US') ? 'US' : l.includes('CA') ? 'CA' : undefined; };
  const stagesOf = (p: any): string[] => p ? [p.stage, ...(p.inputStage ? stagesOf(p.inputStage) : []), ...(p.inputStages ? p.inputStages.flatMap(stagesOf) : [])] : [];
  const CASES: Array<[string, Record<string, unknown>]> = [
    ['newest', { pageSize: '20' }], ['country IN', { pageSize: '20', country: 'IN' }], ['remote-india', { pageSize: '20', indiaBucket: 'remote-india' }],
    ['delhi-ncr', { pageSize: '20', indiaBucket: 'delhi-ncr' }], ['workMode hybrid', { pageSize: '20', workMode: 'hybrid' }], ['remote,hybrid', { pageSize: '20', workMode: 'remote,hybrid' }],
    ['delhi-ncr + remote (empty)', { pageSize: '20', indiaBucket: 'delhi-ncr', workMode: 'remote' }], ['search zzqx (empty, NOT indexed)', { pageSize: '20', search: 'zzqx', searchScope: 'card' }],
  ];
  let seeded = 0;
  console.log('  corpus    case                              ret   keys    docs     ms  plan');
  for (const N of SIZES) {
    const t0 = Date.now();
    while (seeded < N) {
      const batch: Record<string, unknown>[] = [];
      for (let i = seeded; i < Math.min(N, seeded + 5000); i += 1) {
        const d: Record<string, unknown> = { id: `j${i}`, status: 'published', title: i % 7 ? `Engineer ${i}` : `Manager ${i}`, organizationName: `Co ${i % 500}`, location: locs[i % locs.length], country: ctry(i), workMode: wm(i), employmentType: 'full_time', experienceLevel: ['associate', 'senior', 'lead', undefined][i % 4], description: 'x'.repeat(300), createdAt: new Date(Date.UTC(2026, 0, 1) + (i * 7919) % (400 * 86400000)).toISOString() };
        batch.push({ ...d, _id: d.id, ...derivePublicSortKeys(d), ...B.derivePublicIndiaBucket(d) });
      }
      await col.insertMany(batch as never, { ordered: false }); seeded += batch.length;
    }
    if (N === SIZES[0]) {
      await col.createIndex({ status: 1, _skNewest: -1, id: 1 }, { name: 'published_sk_newest' });
      await col.createIndex({ status: 1, country: 1, _skNewest: -1, id: 1 }, { name: 'published_country_newest' });
      await col.createIndex({ status: 1, workMode: 1, _skNewest: -1, id: 1 }, { name: 'published_workmode_newest' });
      await col.createIndex({ status: 1, _indiaBucket: 1, _skNewest: -1, id: 1 }, { name: 'published_indiabucket_newest' });
    }
    console.log(`  (seeded ${N} in ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    for (const [name, q] of CASES) {
      const ex: any = await col.aggregate(Q.buildPublicJobsCollectionPipeline(q as never, {})).explain('executionStats');
      const s = ex.executionStats ?? ex.stages?.[0]?.$cursor?.executionStats; const w = ex.queryPlanner?.winningPlan ?? ex.stages?.[0]?.$cursor?.queryPlanner?.winningPlan;
      console.log(`  ${String(N).padStart(8)}  ${name.padEnd(32)} ${String(s.nReturned).padStart(4)} ${String(s.totalKeysExamined).padStart(7)} ${String(s.totalDocsExamined).padStart(7)} ${String(s.executionTimeMillis).padStart(6)}  ${stagesOf(w).join('>')}`);
    }
    console.log('');
  }
  await mongo.stop();
  process.exit(0);
})().catch((e) => { console.error('BENCH FAILED', e instanceof Error ? e.message : e); process.exit(1); });
