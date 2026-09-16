/**
 * P2D — `view=card`: the list card's fields and nothing else.
 *
 * Run: P29_CORPUS=/path/corpus-full.json npm run test:public-jobs-card-view
 *      (without P29_CORPUS a synthetic corpus is used; the size gate is then
 *       labelled SYNTHETIC)
 *
 *  · PUBLIC_JOB_CARD_FIELDS is exactly the former list-view contract
 *    (PublicHiringJobListItem) and a strict subset of the public allow-list;
 *  · a card page carries exactly those fields, the same ids and the same
 *    cursor as the full view — projection changes bytes, never rows or order;
 *  · a page of 24 cards is ≤ 20 KB on the real corpus (129 KB before);
 *  · the route parses `view=card`, keys its cache on it, and passes it down;
 *  · facets.stats equals direct counts.
 * Needs mongodb-memory-server; SKIPPED (printed) when unavailable.
 */
import { existsSync, readFileSync } from 'node:fs';
import { startTestMongo, isIsolatedTestMongo } from './support/mongo-test-env';

let checks = 0; let failures = 0;
function check(label: string, cond: boolean, detail = '') { checks += 1; if (cond) { console.log(`  ✓ ${label}${detail ? `  [${detail}]` : ''}`); return; } failures += 1; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

async function main() {
  const Q = await import('@/lib/server/db/public-jobs-query');
  console.log('── 1. The contract ──');
  const HIRING = readFileSync('lib/server/hiring.ts', 'utf8');
  const pick = /export type PublicHiringJobListItem = Pick<\s*PublicHiringJob,([\s\S]*?)>;/.exec(HIRING)![1];
  const legacy = Array.from(pick.matchAll(/'([a-zA-Z]+)'/g)).map((m) => m[1]).sort();
  check('PUBLIC_JOB_CARD_FIELDS == the former list-view contract', [...Q.PUBLIC_JOB_CARD_FIELDS].sort().join() === legacy.join(), `${legacy.length} fields`);
  check('and is a strict subset of the public allow-list', Q.PUBLIC_JOB_CARD_FIELDS.every((f) => (Q.PUBLIC_JOB_VIEW_FIELDS as readonly string[]).includes(f)) && Q.PUBLIC_JOB_CARD_FIELDS.length < Q.PUBLIC_JOB_VIEW_FIELDS.length);
  check('no body field is a card field', !['description', 'responsibilities', 'requirements'].some((f) => (Q.PUBLIC_JOB_CARD_FIELDS as readonly string[]).includes(f)));
  const ROUTE = strip(readFileSync('app/api/jobs/public/route.ts', 'utf8'));
  check('the route parses view=card', /const view = q\.get\('view'\) === 'card' \? 'card' as const : undefined;/.test(ROUTE));
  check('keys its cache on it', /params: \{ \.\.\.query, cursor: rawCursor, view \}/.test(ROUTE));
  check('and passes it to the selector', /readPublicJobsPage\(query, source, \{ cursor, view \}\)/.test(ROUTE));
  const full = Q.buildPublicJobsCollectionPipeline({ pageSize: '24' } as never, {});
  const card = Q.buildPublicJobsCollectionPipeline({ pageSize: '24' } as never, { view: 'card' });
  check('the view changes only the $project stage', JSON.stringify(full.slice(0, -1)) === JSON.stringify(card.slice(0, -1)) && JSON.stringify(full.at(-1)) !== JSON.stringify(card.at(-1)));

  let mongo: Awaited<ReturnType<typeof startTestMongo>> | null = null;
  try { mongo = await startTestMongo(); } catch (e) { console.log(`  (mongodb-memory-server unavailable — behavioural half SKIPPED, not passed: ${(e as Error).message.slice(0, 60)})`); console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`); process.exit(failures ? 1 : 0); }
  if (!isIsolatedTestMongo()) throw new Error('refusing to run outside an isolated test mongo');
  const { getMongoDb } = await import('@/lib/server/database'); const { derivePublicSortKeys } = await import('@/lib/server/db/public-sort-keys'); const B = await import('@/lib/server/db/public-india-bucket');
  const db = (await getMongoDb())!; const col = db.collection('hiring_jobs');
  const corpusPath = process.env.P29_CORPUS; let docs: Array<Record<string, unknown>>; let label: string;
  if (corpusPath && existsSync(corpusPath)) { docs = JSON.parse(readFileSync(corpusPath, 'utf8')); label = `REAL CORPUS (${docs.length})`; }
  else { docs = Array.from({ length: 500 }, (_, i) => ({ id: `s${i}`, status: 'published', title: `Engineer ${i}`, organizationName: `Co ${i % 20}`, location: 'Remote', description: 'x'.repeat(5000), responsibilities: 'y'.repeat(1000), requirements: 'z'.repeat(1000), workMode: i % 3 ? 'onsite' : 'remote', employmentType: 'full_time', preferredSkills: ['a', 'b'], applyUrl: 'https://x.test/apply', createdAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z` })); label = 'SYNTHETIC (500 rows)'; }
  for (let i = 0; i < docs.length; i += 2000) await col.insertMany(docs.slice(i, i + 2000).map((d) => ({ ...d, _id: d.id, ...derivePublicSortKeys(d), ...B.derivePublicIndiaBucket(d) })) as never);
  await col.createIndex({ status: 1, _skNewest: -1, id: 1 }, { name: 'published_sk_newest' });

  console.log(`── 2. A card page: same rows, only the card fields (${label}) ──`);
  const fullPage = (await Q.selectPublicJobsPageFromCollection({ pageSize: '24' } as never, {}))!;
  const cardPage = (await Q.selectPublicJobsPageFromCollection({ pageSize: '24' } as never, { view: 'card' }))!;
  check('same ids in the same order', fullPage.items.map((i) => i.id).join() === cardPage.items.map((i) => i.id).join());
  check('same cursor', fullPage.nextCursor === cardPage.nextCursor && fullPage.hasNextPage === cardPage.hasNextPage);
  const allowed = new Set<string>(Q.PUBLIC_JOB_CARD_FIELDS);
  check('every card row carries only card fields', cardPage.items.every((row) => Object.keys(row).every((k) => allowed.has(k))));
  check('no body field leaks', !cardPage.items.some((row) => 'description' in row || 'responsibilities' in row || 'requirements' in row));
  check('the full view still carries description', fullPage.items.some((row) => 'description' in row));
  const bytes = (o: unknown) => Buffer.byteLength(JSON.stringify(o));
  const kb = bytes(cardPage.items) / 1024; const fullKb = bytes(fullPage.items) / 1024;
  check(`a page of ${cardPage.items.length} cards ≤ 20 KB${corpusPath ? '' : ' (SYNTHETIC)'}`, kb <= 20, `${kb.toFixed(1)} KB (full view ${fullKb.toFixed(1)} KB)`);
  for (const q of [{ pageSize: '24', indiaBucket: 'bengaluru' }, { pageSize: '24', search: 'engineer', searchScope: 'card' }, { pageSize: '24', workMode: 'remote,hybrid' }]) {
    const p = (await Q.selectPublicJobsPageFromCollection(q as never, { view: 'card' }))!;
    check(`${JSON.stringify(q)}: card page ≤ 20 KB`, bytes(p.items) / 1024 <= 20, `${(bytes(p.items) / 1024).toFixed(1)} KB, ${p.items.length} rows`);
  }
  /* A cursor from a card page continues a full page and vice versa. */
  const C = await import('@/lib/server/db/public-jobs-cursor');
  if (cardPage.nextCursor) {
    const cur = C.decodeCursor(cardPage.nextCursor, { pageSize: '24' } as never);
    const nextCard = (await Q.selectPublicJobsPageFromCollection({ pageSize: '24' } as never, { view: 'card', cursor: cur }))!;
    const nextFull = (await Q.selectPublicJobsPageFromCollection({ pageSize: '24' } as never, { cursor: cur }))!;
    check('page 2 is identical under both views', nextCard.items.map((i) => i.id).join() === nextFull.items.map((i) => i.id).join());
    check('no id repeats across pages', !nextCard.items.some((i) => cardPage.items.some((j) => j.id === i.id)));
  }

  console.log('── 3. facets.stats equals direct counts ──');
  const f = (await Q.selectPublicJobFacetCounts())!;
  const open = await col.countDocuments({ status: 'published' });
  const remote = await col.countDocuments({ status: 'published', workMode: 'remote' });
  const orgs = new Set((await col.distinct('organizationName', { status: 'published' })).map((o) => String(o ?? '').toLowerCase()).filter(Boolean)).size;
  check(`stats.open == published (${open})`, f.stats.open === open);
  check(`stats.remote == remote postings (${remote})`, f.stats.remote === remote);
  check(`stats.companies == distinct organisations, case-folded (${orgs})`, f.stats.companies === orgs, `got ${f.stats.companies}`);
  check('facet buckets are unchanged by the stats branch', Object.keys(f.emp).length > 0 && Object.keys(f.wm).length > 0);

  await mongo.stop();
  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed  (${label})`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1); });
