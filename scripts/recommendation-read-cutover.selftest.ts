/**
 * Phase 3.5 — the precomputed read flag, and what it refuses to serve.
 *
 * Run: npm run test:recommendation-read-cutover
 *
 * The flag is exercised for real by setting the environment variable; the store
 * is injected, so no database is touched. What is being defended here is the
 * distinction between "no matches" and "could not answer" — every uncertainty
 * must fall back to the live path, never to an empty payload.
 */
import { readFileSync } from 'node:fs';
import {
  recommendationReadSource, readFreshRecommendationRecord, renderPrecomputed,
  type FallbackReason,
} from '../lib/server/db/recommendation-read-source';
import { SCORER_VERSION, type RecommendationResultRecord } from '../lib/server/db/recommendation-results';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

const CV = '5276:2026-09-03T14:27:40.013Z';
const FLAG = 'RECOMMENDATION_READ_FROM_PRECOMPUTED';

function record(over: Partial<RecommendationResultRecord> = {}): RecommendationResultRecord {
  return {
    userId: 'u1', scope: 'recommended',
    profileVersion: 3, corpusVersion: CV, scorerVersion: SCORER_VERSION,
    generatedAt: '2026-09-07T00:00:00.000Z', total: 2,
    results: [
      { jobId: 'j1', score: 88, reasons: ['Shares 3 of your skills'] },
      { jobId: 'j2', score: 61, reasons: ['Remote'] },
    ],
    ...over,
  } as RecommendationResultRecord;
}

const CANON = new Map<string, Record<string, unknown>>([
  ['j1', { id: 'j1', title: 'Backend Engineer', organizationName: 'Acme', location: 'Pune',
           employmentType: 'full_time', workMode: 'remote', preferredSkills: ['a', 'b', 'c', 'd', 'e'],
           applyUrl: 'https://example.com/apply', createdAt: '2026-09-01T00:00:00.000Z',
           description: 'SECRET', requirements: 'SECRET', contentHash: 'SECRET',
           sourceUrl: 'SECRET', minimumAtsScore: 70 }],
  ['j2', { id: 'j2', title: 'Platform Engineer', organizationName: 'Beta', location: 'Remote',
           employmentType: 'full_time', workMode: 'remote', preferredSkills: [],
           applyUrl: 'https://example.com/b', createdAt: '2026-09-02T00:00:00.000Z' }],
]);

function withFlag<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env[FLAG];
  if (value === undefined) delete process.env[FLAG]; else process.env[FLAG] = value;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env[FLAG]; else process.env[FLAG] = prev;
  }
}

const reasons: FallbackReason[] = [];
const collect = (r: FallbackReason) => { reasons.push(r); };
const opts = (over: Record<string, unknown> = {}) => ({
  profileVersion: 3, corpusVersion: CV,
  readRecord: async () => record(),
  ...over,
} as never);

(async () => {
  /* ═══ 1. The flag defaults OFF ═════════════════════════════════════════ */
  check('absent means live', withFlag(undefined, recommendationReadSource) === 'live');
  check('"false" means live', withFlag('false', recommendationReadSource) === 'live');
  check('"TRUE" is not "true" — only the exact string enables it',
    withFlag('TRUE', recommendationReadSource) === 'live');
  check('"1" does not enable it', withFlag('1', recommendationReadSource) === 'live');
  check('empty does not enable it', withFlag('', recommendationReadSource) === 'live');
  check('"true" enables it', withFlag('true', recommendationReadSource) === 'precomputed');

  /* ═══ 2. OFF serves nothing at all ═════════════════════════════════════ */
  {
    reasons.length = 0;
    let called = 0;
    const r = await withFlag('false', () => readFreshRecommendationRecord('u1', 'recommended',
      opts({ readRecord: async () => { called += 1; return record(); } }), collect));
    check('with the flag off nothing is served', r === null);
    check('and the store is never even read', called === 0);
    check('the reason is recorded', reasons[0] === 'flag_off');
  }

  /* ═══ 3. ON, fresh: served ═════════════════════════════════════════════ */
  {
    const r = await withFlag('true', () => readFreshRecommendationRecord('u1', 'recommended', opts(), collect));
    check('a fresh record is served', r !== null && r.results.length === 2);
  }

  /* ═══ 4. Every uncertainty falls back to LIVE, never to empty ══════════ */
  const cases: Array<[string, Record<string, unknown>, string | null, FallbackReason]> = [
    ['a signed-out viewer gets no stored record', {}, null, 'anonymous'],
    ['an absent record falls back', { readRecord: async () => null }, 'u1', 'missing'],
    ['a stale profile version falls back', { profileVersion: 4 }, 'u1', 'stale'],
    ['a stale corpus version falls back', { corpusVersion: '9999:2027-01-01T00:00:00.000Z' }, 'u1', 'stale'],
    ['an old scorer version falls back',
      { readRecord: async () => record({ scorerVersion: SCORER_VERSION - 1 }) }, 'u1', 'stale'],
    ['a storage FAILURE falls back rather than returning empty',
      { readRecord: async () => { throw new Error('atlas down'); } }, 'u1', 'read_failed'],
  ];
  for (const [label, over, userId, reason] of cases) {
    reasons.length = 0;
    const r = await withFlag('true', () => readFreshRecommendationRecord(
      userId, 'recommended', opts(over), collect));
    check(label, r === null);
    check(`  ...and says why: ${reason}`, reasons[0] === reason);
  }

  /* ═══ 5. Rendering matches the live card contract ══════════════════════ */
  {
    const out = renderPrecomputed(record(), CANON);
    check('a fresh record renders its cards', out?.jobs.length === 2);
    check('the stored total is preserved', out?.total === 2);
    check('the generation time is carried', out?.generatedAt === '2026-09-07T00:00:00.000Z');

    const card = out!.jobs[0] as Record<string, unknown>;
    check('scores come from the record, not recomputed', card.matchScore === 88);
    check('the four-skill cap is applied', (card.preferredSkills as string[]).length === 4);
    for (const leak of ['description', 'requirements', 'contentHash', 'sourceUrl', 'minimumAtsScore']) {
      check(`ingestion metadata does not leak: ${leak}`, !(leak in card));
    }
    check('absent match fields are omitted, not sent as undefined',
      !('matchSummary' in card) && !('matchedSkills' in card));
  }

  /* ═══ 6. Rendering declines rather than inventing ══════════════════════ */
  {
    reasons.length = 0;
    check('unavailable postings fall back', renderPrecomputed(record(), null, collect) === null);
    check('  ...with a reason', reasons[0] === 'jobs_missing');

    reasons.length = 0;
    check('a record whose postings all vanished falls back',
      renderPrecomputed(record(), new Map(), collect) === null);

    const partial = renderPrecomputed(record(), new Map([['j1', CANON.get('j1')!]]));
    check('a partially vanished record renders what survives', partial?.jobs.length === 1);
    check('and never invents the missing posting',
      !JSON.stringify(partial).includes('j2'));

    const empty = renderPrecomputed(record({ results: [], total: 0 }), new Map());
    check('a genuinely empty record IS served — that is a real "no matches"',
      empty !== null && empty.jobs.length === 0 && empty.total === 0);
  }

  /* ═══ 7. Structural: the flag is server-side and the live path intact ══ */
  {
    const SRC = read('lib/server/db/recommendation-read-source.ts');
    check('the flag is read from the environment only',
      /process\.env\.RECOMMENDATION_READ_FROM_PRECOMPUTED === 'true'/.test(SRC));
    check('it is never read from a request',
      !/searchParams|headers|req\.|request\./.test(SRC));
    check('the read path never writes', !/writeRecommendationRecord|updateOne|insertOne/.test(SRC));
    check('it never scores', !/recommendMatch|scoreRecommendations/.test(SRC));
    check('personalized is not servable from the store',
      /personalized/i.test(SRC) && !/'personalized'/.test(SRC));

    const ROUTE = read('app/api/recommendations/jobs/route.ts');
    check('the route still contains the live computation',
      /scoreRecommendations\(\{ profile, showMatch/.test(ROUTE));
    check('the precomputed attempt happens BEFORE the corpus read',
      ROUTE.indexOf('await tryPrecomputed(') < ROUTE.indexOf('getPublishedHiringJobs()'));
    check('only the stored ids are fetched, not the corpus',
      /selectPublishedJobsByIds\(record\.results\.map/.test(ROUTE));
    check('a precomputed failure can never fail the request',
      /computing live', error\);\s*\n\s*return null;/.test(ROUTE));
    check('the fallback reason is never returned to the client',
      !/fallbackReason|skippedReason/.test(ROUTE));

    const COLL = read('lib/server/db/hiring-jobs-collection.ts');
    check('the by-id fetch stays filtered to published postings',
      /\$in: wanted as never\[\] \}, \.\.\.PUBLISHED/.test(COLL));
    /* Measured against Atlas: keying the map on `_id` returned ONE job for
       500 ids, because the projection drops `_id` and every document collapsed
       onto the empty-string key. The card projection has no `_id` to key on. */
    check('postings are keyed by their own id, never by the dropped _id',
      /out\.set\(String\(\(job as unknown as \{ id\?: unknown \}\)\.id/.test(COLL));
    check('the empty key is never served as a posting', /out\.delete\(''\);/.test(COLL));
    check('the card projection carries hiringUrgency, which the card renders',
      /const CARD_PROJECTION = \{[\s\S]*?hiringUrgency: 1,/.test(COLL));
    check('it returns null rather than a partial map on failure',
      /catch \{\s*\n\s*return null;\s*\n\s*\}\s*\n\}\s*\n\s*\/\*\*\s*\n \* Re-points/.test(COLL));
  }

  console.log(`\n${passed} checks passed, ${failed} failed.`);
  if (failed > 0) { console.error('FAILED'); process.exit(1); }
  console.log('ALL CHECKS PASSED');
})();
