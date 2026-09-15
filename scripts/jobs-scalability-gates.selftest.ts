/**
 * The Jobs section must stay bounded with respect to corpus size.
 *
 *   npx tsx scripts/jobs-scalability-gates.selftest.ts
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * Every performance defect found in the Jobs section had ONE shape: work
 * proportional to the corpus on a path that should be proportional to the page.
 *
 *     scraper stalled          loaded 12,659 postings before fetching a source
 *     /api/jobs/public 500     sorted 12,659 in memory, unindexed
 *     jobs page 6.15 MB        shipped 12,662 rows to render 20
 *     organizationId COLLSCAN  examined 12,659 to return 2
 *     page 500                 walked 10,020 index keys for 20 rows
 *     exact total              consumed every match before any row was returned
 *
 * Fixing instances does not stop the next one: the corpus keeps growing, so a
 * path that was acceptable at 5,000 becomes an outage at 50,000 without anybody
 * changing it. These gates fail the build when the shape returns, which is the
 * only thing that makes the fix permanent.
 *
 * THE INVARIANT
 *
 *   A request serving N rows reads ~N documents, examines ~N index keys and
 *   transfers ~N rows — at 12K, 100K or 1M.
 *
 * Gate B runs against seeded mongodb-memory-server so CI never needs Atlas.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';

let checks = 0;
function check(name: string, cond: boolean, detail = '') {
  assert.ok(cond, `${name}${detail ? ` — ${detail}` : ''}`);
  checks += 1;
  console.log(`  ✓ ${name}`);
}

/* ── Gate A ──────────────────────────────────────────────────────────────
   No hot Jobs path may reach for the whole corpus. The accessors below load
   every posting; a listing route that calls one has already lost the
   invariant, whatever it does afterwards. */
const WHOLE_CORPUS = ['getHiringJobs(', 'getPublishedHiringJobs(', 'getPublishedHiringJobList(', 'selectAllJobDocs('];
const HOT_ROUTES = [
  'app/api/jobs/public/route.ts',
  'app/api/jobs/public/[jobId]/route.ts',
  'app/api/jobs/public/count/route.ts',
];

function gateA() {
  console.log('\n── Gate A: no whole-corpus read on a hot Jobs path ──');
  for (const file of HOT_ROUTES) {
    const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const accessor of WHOLE_CORPUS) {
      /* `getHiringJobsCached` survives ONLY as a fallback for a store that
         cannot answer — never as the primary path. That distinction is tested
         in public-job-detail-lookup.selftest.ts; here the rule is that the
         unguarded accessors do not appear at all. */
      const used = src.includes(accessor);
      check(`${file.split('/').slice(-2).join('/')} does not call ${accessor}`, !used);
    }
  }
  /* The listing pipeline must not count, either: an exact total consumes the
     whole match set before a page can be returned. */
  const q = readFileSync('lib/server/db/public-jobs-query.ts', 'utf8');
  const pipe = q.slice(q.indexOf('export function buildPublicJobsCollectionPipeline'));
  const body = pipe.slice(0, pipe.indexOf('\n}\n'));
  /* `$count` as a SUBSTRING also appears inside `"$country"`, which is a field
     this pipeline legitimately projects. The stage is what matters, so the
     check is for a `$count:` key — a looser test passes while proving nothing,
     which is how a useless assertion survives. */
  check('the listing pipeline has no $count stage', !/\$count\s*:/.test(body));
  check('and no $facet stage', !/\$facet\s*:/.test(body));
}

/* ── Gate C ──────────────────────────────────────────────────────────────
   A default page is twenty cards. The ceiling is set from the MEASURED
   response — ~129 KB, of which ~83% is `description` — not from an
   aspirational figure that would fail before the projection work exists.
   Tightening it is Phase 2's job, and lowering this number is how that work
   gets proven rather than assumed. */
const PAGE_BYTE_CEILING = 160 * 1024;

function gateC(bytes: number) {
  console.log('\n── Gate C: a default page stays under the byte ceiling ──');
  check(`a 20-row page is under ${(PAGE_BYTE_CEILING / 1024).toFixed(0)} KB`,
    bytes <= PAGE_BYTE_CEILING, `${(bytes / 1024).toFixed(1)} KB`);
  /* Records where the bytes actually are, so Phase 2's projection has a
     baseline to beat rather than a claim to make. */
  console.log(`     measured: ${(bytes / 1024).toFixed(1)} KB for 20 rows`);
}

async function gateB() {
  console.log('\n── Gate B: examined documents stay proportional to rows returned ──');
  const mongo = await startTestMongo();
  if (!mongo) { console.log('  (mongodb-memory-server unavailable — Gate B skipped)'); return 0; }
  if (!isIsolatedTestMongo()) throw new Error('refusing to run outside an isolated test mongo');

  const { getMongoDb } = await import('@/lib/server/database');
  const Q = await import('@/lib/server/db/public-jobs-query');
  const db = await getMongoDb();
  if (!db) throw new Error('no test db');
  const col = db.collection('hiring_jobs');
  await col.deleteMany({});

  /* Deliberately far more postings than a page, so an unbounded query is
     obvious rather than lost in the noise of a small fixture. */
  const docs = Array.from({ length: 4000 }, (_, i) => ({
    _id: `job-${String(i).padStart(5, '0')}`, id: `job-${String(i).padStart(5, '0')}`,
    status: 'published', title: `Engineer ${i}`, organizationName: `Co ${i % 50}`,
    location: 'Remote', description: 'x'.repeat(400),
    _skNewest: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    _skSalary: (i % 40) * 1000, _skRelevance: (i % 20) / 20,
    createdAt: '2026-01-01T00:00:00.000Z', postedAt: '2026-01-01T00:00:00.000Z',
  }));
  await col.insertMany(docs as never);
  await col.createIndex({ status: 1, _skNewest: -1, id: 1 }, { name: 'published_sk_newest' });

  const explain = async (cursor: unknown) => {
    const e = await col.aggregate(
      Q.buildPublicJobsCollectionPipeline({ pageSize: '20' } as never, { cursor: cursor as never }),
    ).explain('executionStats') as Record<string, never>;
    const ex = (e as { executionStats?: { nReturned: number; totalKeysExamined: number; totalDocsExamined: number } }).executionStats;
    return ex ?? { nReturned: 0, totalKeysExamined: 0, totalDocsExamined: 0 };
  };

  const first = await explain(null);
  /* THE ratio. 20 rows must not cost 4,000 documents because an index went
     missing or a count came back. 3x leaves room for a filter that has to skip
     a few non-matching keys; it does not leave room for a scan. */
  check('first page examines ~1 document per row returned',
    first.totalDocsExamined <= 3 * first.nReturned,
    `${first.totalDocsExamined} docs for ${first.nReturned} rows`);
  check('and ~1 index key per row', first.totalKeysExamined <= 3 * first.nReturned,
    `${first.totalKeysExamined} keys`);

  /* Walk deep, then prove depth changed nothing. This is the property `$skip`
     could never have. */
  const C = await import('@/lib/server/db/public-jobs-cursor');
  let token: string | null = null;
  for (let i = 0; i < 40; i += 1) {
    const q = { pageSize: '20' } as never;
    const page = await Q.selectPublicJobsPageFromCollection(q, { cursor: token ? C.decodeCursor(token, q) : null });
    if (!page?.nextCursor) break;
    token = page.nextCursor;
  }
  const deep = await explain(token ? C.decodeCursor(token, { pageSize: '20' } as never) : null);
  check('a deep page examines the same as the first',
    deep.totalDocsExamined <= 3 * deep.nReturned,
    `${deep.totalDocsExamined} docs at depth ~800`);
  check('depth does not increase the work',
    deep.totalKeysExamined <= first.totalKeysExamined + 2,
    `first ${first.totalKeysExamined} vs deep ${deep.totalKeysExamined}`);

  const page = await Q.selectPublicJobsPageFromCollection({ pageSize: '20' } as never, {});
  const bytes = Buffer.byteLength(JSON.stringify(page?.items ?? []));
  await mongo.stop();
  return bytes;
}

async function main() {
  gateA();
  const bytes = await gateB();
  if (bytes) gateC(bytes);
  console.log(`\n✅ ${checks}/${checks} checks passed`);
  /* Explicit exit: the app's global MongoClient outlives mongo.stop(). */
  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
