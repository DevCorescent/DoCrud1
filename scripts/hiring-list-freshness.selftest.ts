/**
 * /api/public/hiring/jobs?view=list — the projected list is read ONCE per
 * corpus version, not once per 30 seconds per caller.
 *
 * Runs against an isolated in-memory MongoDB with the profiler on, so "no read
 * happened" is measured from the server's own operation log, not inferred:
 *
 *   find on hiring_jobs       → the 6 MB list read
 *   aggregate on hiring_jobs  → the ~50-byte version probe
 *
 *   A. first call reads the collection; the answer equals the mapper's output
 *   B. inside the probe interval: no probe, no read
 *   C. past the interval, corpus unchanged: ONE probe, NO read, same answer
 *   D. past the interval, a posting changed elsewhere: probe sees it → re-read
 *   E. a local write invalidates outright: next call re-reads
 *   F. N concurrent cold callers share ONE read
 *   G. resident full corpus at the same version → projected, no read
 *   H. route/loader wiring pinned on source
 */
import { readFileSync } from 'node:fs';
import { startTestMongo } from './support/mongo-test-env';

let passed = 0, failed = 0;
function check(label: string, cond: boolean, detail = '') {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}
const read = (p: string) => readFileSync(p, 'utf8');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const realNow = Date.now;
let offset = 0;
Date.now = () => realNow() + offset;
const advance = (ms: number) => { offset += ms; };

(async () => {
  const mongo = await startTestMongo();
  try {
    const { MongoClient } = await import('mongodb');
    const probe = new MongoClient(mongo.uri); await probe.connect();
    /* The profiler records every operation with its command, so a find on
       hiring_jobs (the list read) and an aggregate on it (the version probe)
       are counted apart — opcounters lumps both under `query`. */
    await probe.db(mongo.dbName).command({ profile: 2 });
    const counters = async () => {
      const ops = await probe.db(mongo.dbName).collection('system.profile')
        .find({ ns: `${mongo.dbName}.hiring_jobs` }, { projection: { command: 1, op: 1 } }).toArray() as unknown as Array<{ op: string; command?: Record<string, unknown> }>;
      return {
        query: ops.filter((o) => o.command && 'find' in o.command).length,
        command: ops.filter((o) => o.command && 'aggregate' in o.command).length,
      };
    };

    const { getMongoDb } = await import('../lib/server/database');
    const {
      getPublishedHiringJobList, getPublishedHiringJobs, invalidatePublishedHiringJobs, toPublicHiringJobListItem,
    } = await import('../lib/server/hiring');

    const db = (await getMongoDb())!;
    const N = 300;
    const docs = Array.from({ length: N }, (_, i) => ({
      _id: `job-${String(i).padStart(4, '0')}`,
      id: `job-${String(i).padStart(4, '0')}`,
      _order: i,
      status: i % 10 === 0 ? 'closed' : 'published',
      title: `Role ${i}`, organizationName: `Org ${i % 17}`, location: ['Pune', 'Remote', 'Delhi'][i % 3],
      department: 'Eng', employmentType: 'full_time', workMode: ['remote', 'onsite'][i % 2], experienceLevel: 'mid',
      preferredSkills: ['ts', 'react'], applyUrl: `https://x.example/${i}`, shareUrl: '',
      description: 'x'.repeat(2000), requirements: 'SECRET',
      createdAt: new Date(Date.UTC(2026, 7, 1 + (i % 28))).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 8, 1)).toISOString(),
    }));
    await db.collection('hiring_jobs').insertMany(docs as never[]);
    const expected = docs.filter((d) => d.status === 'published').map((d) => toPublicHiringJobListItem(d as never));

    /* ═══ A ═══ */
    console.log('A. first read');
    invalidatePublishedHiringJobs();
    let before = await counters();
    const first = await getPublishedHiringJobList();
    let after = await counters();
    check('the first call reads the collection once', after.query - before.query === 1, `${after.query - before.query} finds`);
    check(`the answer is every published card in board order (${expected.length})`, same(first, expected));
    check('no ingestion field leaks', !JSON.stringify(first).includes('SECRET') && !JSON.stringify(first).includes('xxxx'));

    /* ═══ B ═══ */
    console.log('B. inside the probe interval');
    before = await counters();
    const second = await getPublishedHiringJobList();
    after = await counters();
    check('no probe and no read inside 30 s', after.query === before.query && after.command === before.command, `q+${after.query - before.query} c+${after.command - before.command}`);
    check('same array served', second === first);

    /* ═══ C ═══ */
    console.log('C. past the interval, nothing changed');
    advance(31_000);
    before = await counters();
    const third = await getPublishedHiringJobList();
    after = await counters();
    check('ONE version probe (aggregate), NO list read (find)', after.query === before.query && after.command - before.command >= 1, `q+${after.query - before.query} c+${after.command - before.command}`);
    check('same array served', third === first);
    advance(31_000);
    before = await counters();
    await getPublishedHiringJobList();
    after = await counters();
    check('…and again at the next interval', after.query === before.query);

    /* ═══ D ═══ */
    console.log('D. a posting changed on another instance');
    await db.collection('hiring_jobs').updateOne({ _id: 'job-0001' as never }, { $set: { title: 'Role 1 (edited elsewhere)', updatedAt: new Date(Date.UTC(2026, 8, 2)).toISOString() } });
    advance(31_000);
    before = await counters();
    const fourth = await getPublishedHiringJobList();
    after = await counters();
    check('the probe sees the new version and the list is re-read once', after.query - before.query === 1);
    check('the edit is visible', (fourth as Array<{ id: string; title: string }>).find((j) => j.id === 'job-0001')?.title === 'Role 1 (edited elsewhere)');
    check('a NEW posting on another instance is visible after the next probe', await (async () => {
      await db.collection('hiring_jobs').insertOne({ ...docs[5], _id: 'job-new' as never, id: 'job-new', _order: 9999, status: 'published', title: 'Brand new', updatedAt: new Date(Date.UTC(2026, 8, 3)).toISOString() } as never);
      advance(31_000);
      const list = await getPublishedHiringJobList() as Array<{ id: string }>;
      return list[list.length - 1]?.id === 'job-new';
    })());

    /* ═══ E ═══ */
    console.log('E. local write invalidates');
    invalidatePublishedHiringJobs();
    before = await counters();
    await getPublishedHiringJobList();
    after = await counters();
    check('after invalidation the next call re-reads immediately', after.query - before.query === 1);

    /* ═══ F ═══ */
    console.log('F. concurrent cold callers');
    invalidatePublishedHiringJobs();
    before = await counters();
    const all = await Promise.all(Array.from({ length: 12 }, () => getPublishedHiringJobList()));
    after = await counters();
    check('12 concurrent cold callers → ONE read', after.query - before.query === 1, `${after.query - before.query} finds`);
    check('…and all received the same array', all.every((a) => a === all[0]));

    /* ═══ G ═══ */
    console.log('G. resident full corpus, same version');
    invalidatePublishedHiringJobs();
    await getPublishedHiringJobs();            // loads the full corpus (one find)
    advance(31_000);                           // past the corpus's own 30 s window
    before = await counters();
    const fromCorpus = await getPublishedHiringJobList();
    after = await counters();
    check('the list is projected from the resident corpus: probe only, no find', after.query === before.query && after.command - before.command >= 1, `q+${after.query - before.query}`);
    check('…and equals the collection-projected list', same(fromCorpus, await (async () => { invalidatePublishedHiringJobs(); return getPublishedHiringJobList(); })()));

    /* ═══ H ═══ */
    console.log('H. wiring');
    const H = read('lib/server/hiring.ts');
    const fn = H.slice(H.indexOf('export async function getPublishedHiringJobList('), H.indexOf('async function readPublishedHiringJobList('));
    check('the list keeps the same 30 s serve-as-is window', /age < PUBLISHED_PROBE_INTERVAL\) return listCache\.value/.test(fn));
    check('past it, the corpus version probe decides — the same probe the full feed uses', /readHiringCorpusVersion\(\)/.test(fn) && /sameVersion\(version, hit\.version\)/.test(fn));
    check('the resident corpus is reused only when provably the same version', /peekPublishedHiringJobsAt\(version\)/.test(fn));
    check('cold reads are single-flighted', /if \(listInFlight\) return listInFlight;/.test(fn));
    check('a job write drops the in-flight read too', /listInFlight = null;/.test(H.slice(H.indexOf('export function invalidatePublishedHiringJobs'), H.indexOf('export function invalidatePublishedHiringJobs') + 400)));
    check('the fallback ladder is unchanged', /selectPublishedJobListRows\(\)/.test(H) && /\(await getPublishedHiringJobs\(\)\)\.map\(toPublicHiringJobListItem\)/.test(H));
    const ROUTE = read('app/api/public/hiring/jobs/route.ts');
    check('the route contract is untouched: ?view=list → getPublishedHiringJobList()', /view'\) === 'list'\) \{\s*return NextResponse\.json\(await getPublishedHiringJobList\(\)\);/.test(ROUTE));
    check('no public cache header was added', !/Cache-Control/.test(ROUTE));
    const SEL = read('lib/server/db/hiring-jobs-collection.ts');
    check('the collection query is unchanged: status=published, list projection, _order asc', /\.find\(PUBLISHED, \{ projection: LIST_PROJECTION \}\)\s*\.sort\(BY_ORDER\)/.test(SEL));

    await probe.close();
  } finally {
    Date.now = realNow;
    await mongo.stop();
  }
  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => { console.error(error); process.exit(1); });
