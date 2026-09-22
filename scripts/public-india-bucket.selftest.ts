/**
 * `_indiaBucket` (P2.9-C) equals the `$expr` chips P2B shipped — on fixtures
 * that hit every branch, and on the real corpus when it is available.
 *
 * Run: npm run test:public-india-bucket
 *
 * The oracle is `buildPublicJobsConditions(query, DOC_REF)` — the untouched
 * all-`$expr` form of every chip — evaluated by an isolated mongod over the
 * same documents. If the derivation ever disagrees with the expression for
 * any row, this fails; a mutation of either side fails it too.
 *
 * Needs mongodb-memory-server; SKIPPED (printed) when the binary is missing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';

let checks = 0; let failures = 0;
function check(label: string, cond: boolean, detail = '') {
  checks += 1;
  if (cond) { console.log(`  ✓ ${label}`); return; }
  failures += 1; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  let mongo: Awaited<ReturnType<typeof startTestMongo>> | null = null;
  try { mongo = await startTestMongo(); } catch (e) { console.log(`  (mongodb-memory-server unavailable — SKIPPED, not passed: ${(e as Error).message.slice(0, 60)})`); process.exit(0); }
  if (!isIsolatedTestMongo()) throw new Error('refusing to run outside an isolated test mongo');
  const { getMongoDb } = await import('@/lib/server/database');
  const Q = await import('@/lib/server/db/public-jobs-query');
  const B = await import('@/lib/server/db/public-india-bucket');
  const db = (await getMongoDb())!; const col = db.collection('hiring_jobs');

  console.log('── 1. Fixtures: every branch of the derivation ──');
  const fx = (i: number, o: Record<string, unknown>): Record<string, unknown> => ({ _id: `f${i}`, id: `f${i}`, status: 'published', title: 't', ...o });
  const FIXTURES = [
    fx(1, { location: 'Bengaluru, India', workMode: 'onsite', country: 'IN' }),
    fx(2, { location: 'Bangalore', workMode: 'hybrid' }),                       // alias, no country → city chip still (text)
    fx(3, { location: 'Remote - Bengaluru', workMode: 'onsite', country: 'IN' }), // remote in text → remote-india, NOT bengaluru
    fx(4, { location: 'Bengaluru', workMode: 'remote', country: 'IN' }),        // remote workMode → remote-india
    fx(5, { location: 'Bengaluru', workMode: 'remote' }),                        // remote, country absent → ''
    fx(6, { location: 'Remote, in', workMode: 'onsite', country: 'IN' }),        // the 8.1B correction: remote-india by stored country
    fx(7, { location: 'Gurgaon, Haryana', workMode: 'onsite', country: 'IN' }),  // delhi-ncr via alias→Gurugram
    fx(8, { location: 'New Delhi', country: 'IN' }),                              // 'delhi' alias first → delhi-ncr
    fx(9, { location: 'Noida', country: 'IN' }),
    fx(10, { location: 'Mumbai / Pune', country: 'IN' }),                         // first alias in TABLE order (pune precedes mumbai), not text order
    fx(11, { location: 'Pune, Maharashtra', country: 'IN' }),
    fx(12, { location: 'Hyderabad', country: 'IN' }),
    fx(13, { location: 'Chennai, Tamil Nadu', country: 'IN' }),
    fx(14, { location: 'Madras', country: 'IN' }),                                // alias → chennai
    fx(15, { location: 'Kolkata', country: 'IN' }),                               // India, no chip city → 'india'
    fx(16, { location: 'Anywhere in India', country: 'IN' }),
    fx(17, { location: 'London, UK', country: 'GB' }),
    fx(18, { location: '', country: 'IN' }),
    fx(19, { location: 'REMOTE', workMode: 'REMOTE', country: 'IN' }),            // case-insensitive
    fx(20, { location: 'Bengaluru', country: 'in' }),                              // wrong-case country is NOT 'IN' — same as the $expr
    fx(21, { location: 'Hyderabad', workMode: 'remote', country: 'IN', status: 'draft' }),
  ];
  await col.deleteMany({}); await col.insertMany(FIXTURES as never);
  const expect: Record<string, string> = { f1: 'bengaluru', f2: 'bengaluru', f3: 'remote-india', f4: 'remote-india', f5: '', f6: 'remote-india', f7: 'delhi-ncr', f8: 'delhi-ncr', f9: 'delhi-ncr', f10: 'pune', f11: 'pune', f12: 'hyderabad', f13: 'chennai', f14: 'chennai', f15: 'india', f16: 'india', f17: '', f18: 'india', f19: 'remote-india', f20: 'bengaluru', f21: 'remote-india' };
  for (const f of FIXTURES) check(`${String(f._id)} ${JSON.stringify(f.location)}/${String(f.workMode ?? '-')}/${String(f.country ?? '-')} → ${expect[String(f._id)]}`, B.publicIndiaBucket(f) === expect[String(f._id)], `got ${B.publicIndiaBucket(f)}`);

  /* The oracle: P2B's expression, per chip, over the same rows. */
  const CHIPS = ['remote-india', 'bengaluru', 'hyderabad', 'pune', 'mumbai', 'chennai', 'delhi-ncr', 'india'];
  const oracleIds = async (chip: string) => (await col.aggregate([{ $match: { status: 'published', $expr: { $and: Q.buildPublicJobsConditions({ indiaBucket: chip } as never, Q.DOC_REF) } } }, { $project: { _id: 1 } }]).toArray()).map((d) => String(d._id)).sort();
  const derivedIds = async (chip: string) => {
    const docs = await col.find({ status: 'published' }).toArray();
    return docs.filter((d) => chip === 'india' ? d.country === 'IN' : B.publicIndiaBucket(d as Record<string, unknown>) === chip).map((d) => String(d._id)).sort();
  };
  console.log('── 2. Fixtures: derivation == P2B $expr for every chip ──');
  for (const chip of CHIPS) { const [o, d] = [await oracleIds(chip), await derivedIds(chip)]; check(`${chip}: ${o.length} rows agree`, o.join() === d.join(), `oracle ${o} vs derived ${d}`); }
  check('the fixture discriminates: remote-text row is excluded from its city chip', !(await oracleIds('bengaluru')).includes('f3'));
  check('the fixture discriminates: a draft never appears', !(await oracleIds('remote-india')).includes('f21'));

  console.log('── 3. The persisted field answers the chip query exactly like the expression ──');
  await col.updateMany({}, [{ $set: { [B.INDIA_BUCKET_FIELD]: '' } }] as never);
  for (const d of await col.find({}).toArray()) await col.updateOne({ _id: d._id }, { $set: { [B.INDIA_BUCKET_FIELD]: B.publicIndiaBucket(d as Record<string, unknown>) } });
  for (const chip of CHIPS) {
    const pipeIds = (await col.aggregate(Q.buildPublicJobsCollectionPipeline({ indiaBucket: chip, pageSize: '100' } as never, {})).toArray()).map((d) => String(d.id)).sort();
    check(`${chip}: collection pipeline (plain predicate) == $expr oracle`, pipeIds.join() === (await oracleIds(chip)).join());
  }
  /* A skipped or stale backfill row is VISIBLE: the persisted predicate and the
     expression disagree for that chip, which is exactly what the completeness
     gate and the predicates suite refuse. */
  await col.updateOne({ _id: 'f11' } as never, { $set: { [B.INDIA_BUCKET_FIELD]: 'india' } });
  const puneNow = (await col.aggregate(Q.buildPublicJobsCollectionPipeline({ indiaBucket: 'pune', pageSize: '100' } as never, {})).toArray()).map((d) => String(d.id)).sort();
  check('one row with a stale/missing bucket makes the chip disagree with the expression (a skipped backfill cannot pass)', puneNow.join() !== (await oracleIds('pune')).join());
  await col.updateOne({ _id: 'f11' } as never, { $set: { [B.INDIA_BUCKET_FIELD]: 'pune' } });
  check('indiaBucketIsCurrent detects a stale value', !B.indiaBucketIsCurrent({ location: 'Pune', country: 'IN', [B.INDIA_BUCKET_FIELD]: 'india' }) && B.indiaBucketIsCurrent({ location: 'Pune', country: 'IN', [B.INDIA_BUCKET_FIELD]: 'pune' }));

  console.log('── 4. The write path stores the field ──');
  const SRC = readFileSync(new URL('../lib/server/db/hiring-jobs-collection.ts', import.meta.url), 'utf8');
  check('both write sites spread derivePublicIndiaBucket', (SRC.match(/\.\.\.derivePublicIndiaBucket\(/g) ?? []).length === 2);
  check('next to derivePublicSortKeys, never instead of it', (SRC.match(/\.\.\.derivePublicSortKeys\(/g) ?? []).length === 2);

  const corpus = process.env.P29_CORPUS;
  if (corpus && existsSync(corpus)) {
    console.log('── 5. REAL CORPUS: derivation == P2B $expr for every chip, every row ──');
    await col.deleteMany({});
    const docs = JSON.parse(readFileSync(corpus, 'utf8')) as Array<Record<string, unknown>>;
    for (let i = 0; i < docs.length; i += 2000) await col.insertMany(docs.slice(i, i + 2000).map((d) => ({ ...d, _id: d.id })) as never);
    for (const chip of CHIPS) { const [o, d] = [await oracleIds(chip), await derivedIds(chip)]; check(`${chip}: ${o.length} rows agree on the real corpus`, o.join() === d.join(), `${o.length} vs ${d.length}`); }
  } else {
    console.log('── 5. REAL CORPUS: skipped (set P29_CORPUS=/path/corpus-full.json) ──');
  }
  await mongo.stop();
  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1); });
