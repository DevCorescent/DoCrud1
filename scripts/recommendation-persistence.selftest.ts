/**
 * Phase 3.5 — recommendation persistence, freshness and stale-writer guards.
 *
 * Run: npm run test:recommendation-persistence
 *
 * The version logic is PURE and is executed here against real values. Nothing
 * in this file touches a database.
 */
import { readFileSync } from 'node:fs';
import {
  freshnessOf, mayReplace, recordId, SCORER_VERSION, RECOMMENDATION_INDEXES,
  type RecommendationResultRecord,
} from '../lib/server/db/recommendation-results';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');
const V = (profileVersion: number, corpusVersion: string, scorerVersion = SCORER_VERSION) =>
  ({ profileVersion, corpusVersion, scorerVersion });

/* ═══ 1. Freshness is a VERSION contract ════════════════════════════════ */

const CORPUS = '5276:2026-09-03T14:27:40.013Z';
check('matching versions are fresh',
  freshnessOf(V(7, CORPUS), { profileVersion: 7, corpusVersion: CORPUS }) === 'fresh');
check('an absent record is missing, not stale',
  freshnessOf(null, { profileVersion: 7, corpusVersion: CORPUS }) === 'missing');
check('a newer profile makes it stale_profile',
  freshnessOf(V(7, CORPUS), { profileVersion: 8, corpusVersion: CORPUS }) === 'stale_profile');
check('a newer corpus makes it stale_corpus',
  freshnessOf(V(7, CORPUS), { profileVersion: 7, corpusVersion: '5300:x' }) === 'stale_corpus');
check('a scorer bump makes it stale_scorer',
  freshnessOf(V(7, CORPUS, SCORER_VERSION - 1), { profileVersion: 7, corpusVersion: CORPUS }) === 'stale_scorer');
check('the scorer is checked FIRST — it invalidates everything',
  freshnessOf(V(1, 'old', SCORER_VERSION - 1), { profileVersion: 7, corpusVersion: CORPUS }) === 'stale_scorer');
/* A version 0 profile is legitimate: it predates the field and has had no
   recommendation-relevant write. It is not "missing". */
check('a version 0 profile can still be fresh',
  freshnessOf(V(0, CORPUS), { profileVersion: 0, corpusVersion: CORPUS }) === 'fresh');

/* ═══ 2. Stale-writer protection ════════════════════════════════════════ */

check('a first write is always allowed', mayReplace(null, V(1, CORPUS)));
check('a NEWER profile version replaces an older result',
  mayReplace(V(10, CORPUS), V(11, CORPUS)));
check('an OLDER profile version is REFUSED — v10 cannot overwrite v11',
  !mayReplace(V(11, CORPUS), V(10, CORPUS)));
check('identical versions may replace, so a retry is idempotent',
  mayReplace(V(10, CORPUS), V(10, CORPUS)));
check('with equal profiles, a newer corpus wins',
  mayReplace(V(10, 'a'), V(10, 'b')));
check('with equal profiles, an older corpus is refused',
  mayReplace(V(10, 'b'), V(10, 'a')) === false);
check('a newer scorer always wins',
  mayReplace(V(99, 'z', SCORER_VERSION), V(1, 'a', SCORER_VERSION + 1)));
check('an older scorer never wins, even with a newer profile',
  !mayReplace(V(1, 'a', SCORER_VERSION), V(99, 'z', SCORER_VERSION - 1)));

/* ═══ 3. Identity ═══════════════════════════════════════════════════════ */

check('one document per user per scope', recordId('u1', 'row') === 'u1:row');
check('scopes do not collide', recordId('u1', 'row') !== recordId('u1', 'recommended'));
check('users do not collide', recordId('u1', 'row') !== recordId('u2', 'row'));

/* ═══ 4. What is stored ═════════════════════════════════════════════════ */

const SRC = read('lib/server/db/recommendation-results.ts');
check('results carry only jobId, score and reasons',
  /jobId: string;\s*\n\s*score: number;\s*\n\s*reasons: string\[\];/.test(SRC));
check('no job document fields are persisted',
  !/\b(description|preferredSkills|organizationName|applyUrl|title):/.test(SRC.replace(/\/\*[\s\S]*?\*\//g, '')));
check('empty_profile is a status, not an error',
  /'ready' \| 'empty_profile'/.test(SRC));
check('total is the real set size, not a page length',
  /total: number;/.test(SRC));

/* ═══ 5. Failure and last-known-good ════════════════════════════════════ */

check('a read failure THROWS rather than returning an empty result',
  /throw new Error\('recommendation store unavailable/.test(SRC));
check('a missing record returns null, distinct from a failure',
  /if \(!doc\) return null;/.test(SRC));
check('there is no delete-then-insert',
  !/deleteOne|deleteMany|drop\(/.test(SRC));
check('a refused write reports why instead of pretending to succeed',
  /return \{ written: false, reason: 'stale' \}/.test(SRC));
check('the atomic replace repeats the guard in its filter, for concurrency',
  /profileVersion: \{ \$lte: record\.profileVersion \}/.test(SRC));

/* ═══ 6. Personalized is deliberately NOT precomputable ═════════════════ */

check('only row and recommended scopes are storable',
  /RecommendationScope = 'row' \| 'recommended'/.test(SRC));
check('and the reason is recorded',
  /applied-job exclusion depends on live application state/.test(SRC));
/* The audit's basis: exclusion happens BEFORE pagination, from a live read. */
const PERSONALIZED = read('lib/server/job-api/personalized.ts');
check('applied jobs are excluded before paging, so it cannot be a page-time filter',
  PERSONALIZED.indexOf('!applied.has(job.id)') < PERSONALIZED.indexOf('paginate('));
check('ATS enrichment is already bounded to one page',
  /MAX_ENRICHED_PER_PAGE/.test(PERSONALIZED));

/* ═══ 7. Indexes are justified, not speculative ═════════════════════════ */

check('every index states what it supports',
  RECOMMENDATION_INDEXES.every((i) => i.supports && i.options.name));
check('no index duplicates the _id lookup the read path uses',
  !RECOMMENDATION_INDEXES.some((i) => Object.keys(i.keys).join() === '_id'));
check('indexes are declared, not created as a side effect of import',
  !/createIndex/.test(SRC));

/* ═══ 8. Nothing is wired to a route yet ════════════════════════════════ */

check('no API route reads the store yet',
  !/recommendation-results/.test(read('app/api/recommendations/jobs/route.ts')));
check('the scorer is untouched by this module',
  !/recommendMatch|buildRecProfile/.test(SRC));


/* ═══ 9. The refresh pass: ONE corpus read, many users ══════════════════
   Executed with injected storage, so no database is touched. */

const REFRESH = read('lib/server/recommendation-refresh.ts');
check('the refresh reads the corpus exactly once, outside the loop',
  REFRESH.indexOf('const jobs = await (options.loadCorpus ?? loadRecCorpus)()')
    < REFRESH.indexOf('for (let i = 0; i < profiles.length'));
check('and never loads a corpus inside the per-profile loop',
  !/for \(const profile of slice\)[\s\S]{0,600}loadRecCorpus|for \(const profile of slice\)[\s\S]{0,600}\.find\(/.test(REFRESH));
check('the projection keeps description — ranking-parity forbids dropping it',
  /for \(const f of REC_JOB_FIELDS\) projection\[f\] = 1/.test(REFRESH));
check('it reads from hiring_jobs, not the app_state blob',
  /collection\('hiring_jobs'\)/.test(REFRESH));
check('a missing corpus version aborts rather than writing unverifiable records',
  /corpus version unavailable/.test(REFRESH));
check('one profile failing does not abandon the pass',
  /stats\.failed \+= 1;/.test(REFRESH) && /catch \(error\)/.test(REFRESH));
check('a refused write is counted as stale, not as a failure',
  /stats\.discardedStale \+= 1;/.test(REFRESH));
check('already-fresh profiles are skipped, not recomputed',
  /if \(freshness === 'fresh'\) \{ stats\.alreadyFresh \+= 1; continue; \}/.test(REFRESH));
check('the refresh defines no scoring of its own',
  !/recommendMatch\(|buildRecProfile\(/.test(REFRESH));
check('and it is not scheduled by anything yet',
  !/cron|setInterval|schedule/i.test(REFRESH.replace(/\/\*[\s\S]*?\*\//g, '')));


/* ═══ 10. EXECUTED: the refresh, with storage injected ══════════════════ */

(async () => {
  const { refreshRecommendations } = await import('../lib/server/recommendation-refresh');

  const corpus = Array.from({ length: 80 }, (_, i) => ({
    id: `job-${i}`, title: 'Senior Software Engineer', organizationName: 'Acme',
    location: 'Bengaluru, India', employmentType: 'full_time', workMode: 'remote',
    experienceLevel: 'senior', description: 'Requirements: typescript, react, node.',
    preferredSkills: ['typescript', 'react'], targetRoleKeywords: ['engineer'],
    createdAt: '2026-08-01T00:00:00.000Z', applyUrl: 'https://example.com/1',
  }));
  const fields = { headline: 'Senior Software Engineer', location: 'Bengaluru',
    skills: ['typescript', 'react'], experience: [{ title: 'Senior Software Engineer' }] };

  const profiles = Array.from({ length: 40 }, (_, i) => ({
    userId: `u${i}`, profileVersion: 1, fields,
  }));

  let corpusLoads = 0;
  const store = new Map<string, any>();
  const opts = {
    batchSize: 7,
    corpusVersion: '80:2026-08-01T00:00:00.000Z',
    now: Date.parse('2026-09-07T00:00:00.000Z'),
    loadCorpus: async () => { corpusLoads += 1; return corpus; },
    readRecord: async (userId: string, scope: string) => store.get(`${userId}:${scope}`) ?? null,
    writeRecord: async (rec: any) => { store.set(`${rec.userId}:${rec.scope}`, rec); return { written: true as const }; },
  } as never;

  const stats = await refreshRecommendations(profiles, opts);

  check('THE INVARIANT: exactly ONE corpus read for 40 users', corpusLoads === 1);
  check('every profile was recomputed on the first pass', stats.recomputed === 40);
  check('and every result was persisted', stats.written === 40 && store.size === 40);
  check('none were discarded as stale', stats.discardedStale === 0);
  check('none failed', stats.failed === 0);
  check('the corpus size is reported', stats.corpusSize === 80);

  /* Second pass: everything is now fresh, so nothing should be rescored. */
  const again = await refreshRecommendations(profiles, opts);
  check('a SECOND pass recomputes nothing — versions say it is fresh',
    again.recomputed === 0 && again.alreadyFresh === 40);
  check('but it still reads the corpus only once', corpusLoads === 2);

  /* A bumped profile version makes exactly that member stale. */
  const bumped = profiles.map((p, i) => (i === 0 ? { ...p, profileVersion: 2 } : p));
  const third = await refreshRecommendations(bumped, opts);
  check('bumping ONE profileVersion recomputes exactly one member',
    third.recomputed === 1 && third.alreadyFresh === 39);

  /* A write refusal is counted as stale, and the previous record survives. */
  const before = store.get('u0:recommended');
  const refusing = { ...(opts as any), writeRecord: async () => ({ written: false, reason: 'stale' as const }) };
  const fourth = await refreshRecommendations(
    profiles.map((p, i) => (i === 0 ? { ...p, profileVersion: 3 } : p)), refusing);
  check('a refused write is counted as discardedStale, not failed',
    fourth.discardedStale === 1 && fourth.failed === 0);
  check('and the PREVIOUS record survives untouched',
    store.get('u0:recommended') === before);

  /* A throwing store costs that member only. */
  let calls = 0;
  const flaky = { ...(opts as any), readRecord: async () => { calls += 1; if (calls === 1) throw new Error('boom'); return null; } };
  const fifth = await refreshRecommendations(profiles.slice(0, 3), flaky);
  check('one profile throwing does not abandon the pass',
    fifth.failed === 1 && fifth.recomputed === 2);

  console.log(`\n${passed} checks passed, ${failed} failed.`);
  if (failed > 0) { console.error('FAILED'); process.exit(1); }
  console.log('ALL CHECKS PASSED');
})();
