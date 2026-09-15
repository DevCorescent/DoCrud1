/**
 * Keyset pagination returns every posting exactly once, in the same order.
 *
 *   npx tsx scripts/public-jobs-cursor.selftest.ts
 *
 * ═══ WHAT THIS REPLACES ═══
 *
 * `$skip` walks every key it passes: page 500 examined 10,020 index keys to
 * return 20 rows. A keyset seek examined 21 at the same depth — measured
 * against the production corpus, first page and fiftieth page alike.
 *
 * ═══ THE BUG THIS FILE EXISTS FOR ═══
 *
 * The feed sorts `{ sortKey: -1, id: 1 }` — key DESCENDING, tie-break
 * ASCENDING. So "after this row" is asymmetric:
 *
 *     sortKey <  value                    (descending)
 *     sortKey == value AND id > cursorId  (ascending)
 *
 * Writing `id <` there is the classic error and it fails SILENTLY: rows vanish
 * only where several postings share a sort value. That is not an edge case
 * here — `_skSalary` is 0 for thousands of postings and `_skRelevance` repeats
 * heavily. The fixtures below are built with deliberate ties so that walking
 * the whole set and comparing against a trusted baseline catches it.
 *
 * Seeded mongodb-memory-server, gated by `isIsolatedTestMongo()`. Never Atlas.
 */
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';
import { encodeCursor, decodeCursor, cursorCondition, CURSOR_VERSION } from '@/lib/server/db/public-jobs-cursor';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (!ok) { failures += 1; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
  else console.log(`  ✓ ${label}`);
}

const SORTS = ['newest', 'salary', 'relevance'] as const;
const SK = { newest: '_skNewest', salary: '_skSalary', relevance: '_skRelevance' } as const;

/** 120 postings with HEAVY ties: only 8 distinct values per sort key. */
function fixtures() {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < 120; i += 1) {
    const id = `job-${String(i).padStart(4, '0')}`;
    out.push({
      _id: id, id, status: 'published', title: `Engineer ${i}`,
      organizationName: `Co ${i % 7}`, location: 'Remote',
      /* Ties on purpose — the whole point of the tie-break. */
      _skNewest: `2026-01-${String((i % 8) + 1).padStart(2, '0')}T00:00:00.000Z`,
      _skSalary: (i % 8) * 1000,
      _skRelevance: (i % 8) / 10,
      createdAt: '2026-01-01T00:00:00.000Z', postedAt: '2026-01-01T00:00:00.000Z',
    });
  }
  return out;
}

async function main() {
  const mongo = await startTestMongo();
  if (!mongo) { console.log('mongodb-memory-server unavailable — skipped'); return; }
  if (!isIsolatedTestMongo()) throw new Error('refusing to run outside an isolated test mongo');

  const { getMongoDb } = await import('@/lib/server/database');
  const Q = await import('@/lib/server/db/public-jobs-query');
  const db = await getMongoDb();
  if (!db) throw new Error('no test db');
  const col = db.collection('hiring_jobs');
  await col.deleteMany({});
  await col.insertMany(fixtures() as never);
  for (const s of SORTS) {
    await col.createIndex({ status: 1, [SK[s]]: -1, id: 1 }, { name: `published_sk_${s}` });
  }

  for (const sort of SORTS) {
    console.log(`\n── ${sort}: the cursor walk equals the trusted order ──`);
    const field = SK[sort];

    /* The baseline: one sorted read of everything, the order the feed promises. */
    const baseline = (await col.find({ status: 'published' })
      .sort({ [field]: -1, id: 1 }).toArray())
      .map((d) => String((d as { id?: unknown }).id));

    /* The walk: 20 at a time, resuming from each returned cursor. */
    const walked: string[] = [];
    const seen = new Set<string>();
    let cursorToken: string | null = null;
    let pages = 0;
    for (;;) {
      const query = { sort, pageSize: '20' } as never;
      const cursor = cursorToken ? decodeCursor(cursorToken, query) : null;
      const page = await Q.selectPublicJobsPageFromCollection(query, { cursor });
      if (!page) throw new Error('selector returned null');
      pages += 1;
      for (const item of page.items) {
        const id = String(item.id);
        /* A duplicate means the cursor went BACKWARDS — exactly what a wrong
           boundary does. Throw rather than return: an early return would skip
           the exit below and leave the process parked with the client open,
           which reads as a hang instead of the failure it is. */
        if (seen.has(id)) throw new Error(`${sort}: duplicate across pages — cursor did not advance past ${id}`);
        seen.add(id);
        walked.push(id);
      }
      if (!page.hasNextPage || !page.nextCursor) break;
      cursorToken = page.nextCursor;
      if (pages > 30) throw new Error('walk did not terminate');
    }

    check(`${sort}: every posting was returned`, walked.length === baseline.length,
      `${walked.length} vs ${baseline.length}`);
    /* THE regression. A wrong tie-break direction loses rows HERE and nowhere
       else — the counts above can even still match while the order is wrong. */
    check(`${sort}: in exactly the trusted order`,
      JSON.stringify(walked) === JSON.stringify(baseline),
      walked.length === baseline.length ? 'same length, different order' : '');
    check(`${sort}: no duplicates`, seen.size === walked.length);
    check(`${sort}: the walk terminated`, pages <= 8, `${pages} pages`);

    /* Page size is not part of the ordering, so a different one must walk the
       same sequence. */
    const walked5: string[] = [];
    let t5: string | null = null;
    for (;;) {
      const query = { sort, pageSize: '5' } as never;
      const page = await Q.selectPublicJobsPageFromCollection(query, { cursor: t5 ? decodeCursor(t5, query) : null });
      if (!page) break;
      walked5.push(...page.items.map((i) => String(i.id)));
      if (!page.hasNextPage || !page.nextCursor) break;
      t5 = page.nextCursor;
      if (walked5.length > 200) break;
    }
    check(`${sort}: a different page size walks the same sequence`,
      JSON.stringify(walked5) === JSON.stringify(baseline));
  }

  console.log('\n── hasNextPage is exact at the boundary ──');
  {
    /* Walked to the LAST page rather than asking for the whole set in one go:
       `pageSize` is capped by MAX_PAGE_SIZE, so a request for 120 is not a
       request for 120. The boundary that matters is the final page. */
    const q = { sort: 'newest', pageSize: '40' } as never;
    let token: string | null = null;
    let last = await Q.selectPublicJobsPageFromCollection(q, {});
    let walked = last!.items.length;
    let hops = 0;
    while (last?.hasNextPage && last.nextCursor) {
      token = last.nextCursor;
      last = await Q.selectPublicJobsPageFromCollection(q, { cursor: decodeCursor(token, q) });
      walked += last!.items.length;
      /* A cursor that never reaches the end is a broken cursor, not a long
         feed: 120 rows at 40 a page is 3 hops. */
      if (++hops > 10) throw new Error('boundary walk did not terminate — cursor is not advancing');
    }
    check('the walk ends exactly when the set is exhausted', walked === 120, String(walked));
    check('the final page reports no next page', last?.hasNextPage === false);
    check('and offers no cursor', last?.nextCursor === null);
    const short = await Q.selectPublicJobsPageFromCollection({ sort: 'newest', pageSize: '40' } as never, {});
    check('a full page with more behind it reports a next page',
      short?.hasNextPage === true && short?.nextCursor !== null);
    check('and returns exactly the page asked for, not the probe row',
      short?.items.length === 40);
  }

  console.log('\n── a cursor is only valid for its own query ──');
  {
    const qNewest = { sort: 'newest', pageSize: '20' } as never;
    const first = await Q.selectPublicJobsPageFromCollection(qNewest, {});
    const token = first!.nextCursor!;
    check('it decodes for the query that made it', decodeCursor(token, qNewest) !== null);
    /* Boundaries from one ordering are meaningless in another. */
    check('a different sort is refused',
      decodeCursor(token, { sort: 'salary', pageSize: '20' } as never) === null);
    check('a different filter is refused',
      decodeCursor(token, { sort: 'newest', pageSize: '20', country: 'IN' } as never) === null);
    check('page size alone does NOT invalidate it',
      decodeCursor(token, { sort: 'newest', pageSize: '50' } as never) !== null);
    check('a tampered token is refused', decodeCursor(`${token}xx`, qNewest) === null);
    check('garbage is refused', decodeCursor('not-a-cursor', qNewest) === null);
    check('an empty token is refused', decodeCursor('', qNewest) === null);
    const old = Buffer.from(JSON.stringify({ v: CURSOR_VERSION + 1, value: 'x', id: 'y', q: 'z' })).toString('base64url');
    check('a future version is refused', decodeCursor(old, qNewest) === null);
    /* A refused cursor must mean "start over", never "serve an unknown page". */
    const restart = await Q.selectPublicJobsPageFromCollection(qNewest, { cursor: decodeCursor('bad', qNewest) });
    check('a refused cursor starts from the beginning',
      JSON.stringify(restart!.items.map((i) => String(i.id)))
      === JSON.stringify(first!.items.map((i) => String(i.id))));
  }

  console.log('\n── the boundary predicate is asymmetric ──');
  {
    const c = { v: CURSOR_VERSION, value: 'V', id: 'ID', q: 'Q' };
    const cond = JSON.stringify(cursorCondition('_skNewest', c));
    check('the sort key uses $lt (descending)', cond.includes('"$lt":"V"'));
    /* THE mutation target: `$lt` here silently drops tied rows. */
    check('the tie-break uses $gt (ascending)', cond.includes('"$gt":"ID"'));
    check('and never $lt on the id', !/"id":\{"\$lt"/.test(cond));
  }

  console.log('\n── the listing query no longer counts ──');
  {
    const pipe = JSON.stringify(Q.buildPublicJobsCollectionPipeline({ pageSize: '20' } as never));
    /* `"$country"` contains `$count`; the stage is what matters. */
    check('no $count stage', !pipe.includes('{"$count"'));
    check('no $facet stage', !pipe.includes('$facet'));
    check('no $skip for a cursor page',
      !JSON.stringify(Q.buildPublicJobsCollectionPipeline({ pageSize: '20' } as never, {
        cursor: { v: CURSOR_VERSION, value: 'x', id: 'y', q: 'z' },
      })).includes('$skip'));
    check('it asks for one row beyond the page', pipe.includes('"$limit":21'));
  }

  await mongo.stop();
  console.log(failures === 0 ? `\n✅ ${checks}/${checks} checks passed` : `\n❌ ${checks - failures}/${checks} passed`);
  if (failures) process.exit(1);
  /* Explicit exit: the app's global MongoClient outlives mongo.stop(), and a
     harness that hangs after passing is indistinguishable from one that hung
     while running. */
  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌', error instanceof Error ? error.message : error);
  process.exit(1);
});
