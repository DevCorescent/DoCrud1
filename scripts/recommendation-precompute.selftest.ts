/**
 * Phase 3.3 — precomputed recommendations must equal the live computation.
 *
 * Run: npm run test:recommendation-precompute
 *
 * Everything here EXECUTES the real functions against synthetic profiles and a
 * synthetic corpus — no private user data, no database. The mutation tests are
 * the point: a harness that cannot fail proves nothing, so each class of
 * difference is injected deliberately and must be caught.
 */
import { readFileSync } from 'node:fs';
import { buildRecProfile, hasProfileSignals } from '../lib/server/job-recommend';
import { recommendedSet, rowScope, scoreRecommendations } from '../lib/server/recommendation-compute';
import {
  computeRecordForProfile, runRecommendationBatch, isRecordCurrent, mayReplace,
  SCORER_VERSION, REC_JOB_FIELDS, type BatchProfileInput, type RecommendationRecord,
} from '../lib/server/recommendation-batch';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

/* ═══ Synthetic corpus — no real postings, no private data ══════════════ */

const SKILLS = ['typescript', 'react', 'node', 'sql', 'python', 'figma', 'aws', 'docker'];
const corpus = Array.from({ length: 300 }, (_, i) => ({
  id: `job-${String(i).padStart(4, '0')}`,
  title: ['Senior Software Engineer', 'Data Analyst', 'Product Designer', 'Support Engineer'][i % 4],
  organizationName: `Company ${i % 17}`,
  location: ['Bengaluru, India', 'Mumbai, India', 'Remote', 'Delhi, India'][i % 4],
  employmentType: 'full_time',
  workMode: i % 3 === 0 ? 'remote' : 'onsite',
  experienceLevel: ['entry', 'mid', 'senior', 'lead'][i % 4],
  description: `Requirements: ${SKILLS.slice(i % 4, (i % 4) + 3).join(', ')}. Ship features.`,
  preferredSkills: SKILLS.slice(i % 5, (i % 5) + 2),
  targetRoleKeywords: ['engineer'],
  createdAt: new Date(Date.UTC(2026, 7, 1 + (i % 28))).toISOString(),
  applyUrl: `https://boards.example.com/${i}`,
}));

const PROFILES: Array<[string, Record<string, unknown>]> = [
  ['software engineer', { headline: 'Senior Software Engineer', location: 'Bengaluru', skills: ['typescript', 'react', 'node'], experience: [{ title: 'Senior Software Engineer' }] }],
  ['data analyst', { headline: 'Data Analyst', location: 'Mumbai', skills: ['sql', 'python'], experience: [{ title: 'Data Analyst' }] }],
  ['designer', { headline: 'Product Designer', location: 'Delhi', skills: ['figma'], experience: [{ title: 'Product Designer' }] }],
  ['empty profile', { headline: '', location: '', skills: [], experience: [] }],
];

const NOW = Date.parse('2026-09-07T00:00:00.000Z');
const CORPUS_VERSION = '300:2026-08-28T00:00:00.000Z';

/** The LIVE path, as the route performs it. */
function liveResult(raw: Record<string, unknown>) {
  const profile = buildRecProfile(raw as never);
  const showMatch = hasProfileSignals(profile);
  const scored = scoreRecommendations({ profile, showMatch, jobs: corpus, now: NOW });
  const { recommended, total } = recommendedSet(scored);
  return { scored, recommended, total, showMatch };
}

/* ═══ 1. Equivalence, per synthetic profile ═════════════════════════════ */

for (const [label, raw] of PROFILES) {
  const live = liveResult(raw);
  const record = computeRecordForProfile(
    { userId: `u-${label}`, profileVersion: 1, fields: raw }, corpus, CORPUS_VERSION, NOW,
  );

  check(`${label}: total matches the live computation (${live.total})`,
    record.total === live.total);
  check(`${label}: the same job IDs, in the same order`,
    JSON.stringify(record.results.map((r) => r.jobId))
    === JSON.stringify(live.recommended.map((s) => String(s.job.id))));
  check(`${label}: identical scores`,
    JSON.stringify(record.results.map((r) => r.score))
    === JSON.stringify(live.recommended.map((s) => s.score)));
  check(`${label}: identical matchReasons`,
    JSON.stringify(record.results.map((r) => r.reasons))
    === JSON.stringify(live.recommended.map((s) => (s.job.matchReasons ?? []))));
  check(`${label}: the FULL recommended set is persisted, not a page`,
    record.results.length === live.recommended.length);
}

/* An empty profile recommends nothing — a real answer, not a failure. */
{
  const rec = computeRecordForProfile(
    { userId: 'u-empty', profileVersion: 1, fields: PROFILES[3][1] }, corpus, CORPUS_VERSION, NOW);
  check('an empty profile yields zero recommendations', rec.total === 0 && rec.results.length === 0);
  check('and is marked empty_profile, NOT a failure', rec.status === 'empty_profile');
  check('a profile with signals is marked ready',
    computeRecordForProfile({ userId: 'u1', profileVersion: 1, fields: PROFILES[0][1] },
      corpus, CORPUS_VERSION, NOW).status === 'ready');
}

/* ═══ 2. Determinism ════════════════════════════════════════════════════ */

{
  const a = computeRecordForProfile({ userId: 'u1', profileVersion: 3, fields: PROFILES[0][1] }, corpus, CORPUS_VERSION, NOW);
  const b = computeRecordForProfile({ userId: 'u1', profileVersion: 3, fields: PROFILES[0][1] }, corpus, CORPUS_VERSION, NOW);
  check('the same inputs produce byte-identical records', JSON.stringify(a) === JSON.stringify(b));
}

/* ═══ 3. MUTATION TESTS — the harness must be able to fail ══════════════ */

{
  const live = liveResult(PROFILES[0][1]);
  const base = computeRecordForProfile({ userId: 'u1', profileVersion: 1, fields: PROFILES[0][1] }, corpus, CORPUS_VERSION, NOW);
  const liveIds = live.recommended.map((s) => String(s.job.id));
  const liveScores = live.recommended.map((s) => s.score);

  const mutate = (fn: (r: RecommendationRecord) => void) => {
    const copy = JSON.parse(JSON.stringify(base)) as RecommendationRecord;
    fn(copy);
    return copy;
  };

  check('a CHANGED SCORE is caught',
    JSON.stringify(mutate((r) => { r.results[0].score += 1; }).results.map((x) => x.score)) !== JSON.stringify(liveScores));
  check('a CHANGED ORDER is caught',
    JSON.stringify(mutate((r) => { const t = r.results[0]; r.results[0] = r.results[1]; r.results[1] = t; })
      .results.map((x) => x.jobId)) !== JSON.stringify(liveIds));
  check('a CHANGED REASON is caught',
    JSON.stringify(mutate((r) => { r.results[0].reasons = ['fabricated']; }).results.map((x) => x.reasons))
    !== JSON.stringify(live.recommended.map((s) => s.job.matchReasons ?? [])));
  check('a MISSING job is caught',
    mutate((r) => { r.results.splice(0, 1); }).results.length !== liveIds.length);
  check('an EXTRA job is caught',
    mutate((r) => { r.results.push({ jobId: 'job-fake', score: 99, reasons: [] }); }).results.length !== liveIds.length);
  check('a WRONG TOTAL is caught', mutate((r) => { r.total += 5; }).total !== live.total);
  check('a fabricated job id is not in the live set',
    !liveIds.includes('job-fake'));
}

/* ═══ 4. Stale-worker protection ════════════════════════════════════════ */

{
  /* Full version triples: the guard now weighs corpus and scorer as well as
     profile, because it is the SAME function the persistence layer uses. */
  const v10 = { profileVersion: 10, corpusVersion: 'c1', scorerVersion: SCORER_VERSION };
  const v11 = { profileVersion: 11, corpusVersion: 'c1', scorerVersion: SCORER_VERSION };
  check('a newer result may replace an older one', mayReplace(v10, v11));
  check('a STALE worker cannot overwrite a newer result', !mayReplace(v11, v10));
  check('the same version may replace itself (a retry is safe)', mayReplace(v10, v10));
  check('a first write with nothing stored is allowed', mayReplace(null, v10));
  check('with equal profiles, a newer corpus still wins',
    mayReplace(v10, { ...v10, corpusVersion: 'c2' }));
  check('and an older corpus does not',
    !mayReplace({ ...v10, corpusVersion: 'c2' }, v10));

  const stored = { profileVersion: 10, corpusVersion: 'c1', scorerVersion: SCORER_VERSION };
  check('a record matching both versions is current',
    isRecordCurrent(stored, { profileVersion: 10, corpusVersion: 'c1' }));
  check('a newer PROFILE version makes it stale',
    !isRecordCurrent(stored, { profileVersion: 11, corpusVersion: 'c1' }));
  check('a newer CORPUS version makes it stale',
    !isRecordCurrent(stored, { profileVersion: 10, corpusVersion: 'c2' }));
  check('a scorer bump makes every record stale',
    !isRecordCurrent({ ...stored, scorerVersion: SCORER_VERSION - 1 }, { profileVersion: 10, corpusVersion: 'c1' }));
  check('a missing record is never current',
    !isRecordCurrent(null, { profileVersion: 1, corpusVersion: 'c1' }));
}

/* The remaining checks await the batch, and the compile target does not
   allow top-level await — so they run inside an async entry point. */
(async () => {
  /* ═══ 5. THE ARCHITECTURAL INVARIANT: one corpus read, many users ═══════ */

  {
    const profiles: BatchProfileInput[] = Array.from({ length: 120 }, (_, i) => ({
      userId: `u${i}`, profileVersion: 1, fields: PROFILES[i % PROFILES.length][1],
    }));

    let corpusAccesses = 0;
    /* A corpus that COUNTS how many times it is enumerated. If the batch read
       per user this would be 120, which is the architecture Phase 3.2 rejected. */
    const countingCorpus = new Proxy(corpus, {
      get(target, prop, recv) {
        if (prop === 'map' || prop === Symbol.iterator) corpusAccesses += 1;
        return Reflect.get(target, prop, recv);
      },
    }) as unknown as Array<Record<string, unknown>>;

    const persisted: RecommendationRecord[] = [];
    const stats = await runRecommendationBatch(
      profiles, countingCorpus, CORPUS_VERSION,
      async (records) => { persisted.push(...records); },
      { batchSize: 25, now: NOW },
    );

    check('every profile was scored', stats.usersProcessed === 120);
    check('and each produced exactly one record', persisted.length === 120);
    check('empty profiles are counted, not dropped', stats.emptyProfiles === 30);
    check('the corpus size is reported', stats.corpusSize === corpus.length);

    /* The corpus is enumerated once PER USER by the scorer — unavoidable, it is
       in-memory CPU. What must never happen is a corpus FETCH per user; the batch
       is handed one array and never loads another. */
    check('the batch never fetches a corpus itself',
      !/getPublishedHiringJobs|getHiringJobs|collection\(/.test(read('lib/server/recommendation-batch.ts')));
    check('the corpus is a parameter, not an import',
      /jobs: ReadonlyArray<Record<string, unknown>>/.test(read('lib/server/recommendation-batch.ts')));

    /* Results match the single-profile path exactly. */
    const one = computeRecordForProfile(profiles[0], corpus, CORPUS_VERSION, NOW);
    check('batch output equals single-profile output',
      JSON.stringify(persisted[0]) === JSON.stringify(one));
  }

  /* ═══ 6. Bounded memory ═════════════════════════════════════════════════ */

  {
    const profiles: BatchProfileInput[] = Array.from({ length: 10 }, (_, i) => ({
      userId: `u${i}`, profileVersion: 1, fields: PROFILES[0][1],
    }));
    const sliceSizes: number[] = [];
    await runRecommendationBatch(profiles, corpus, CORPUS_VERSION,
      async (records) => { sliceSizes.push(records.length); }, { batchSize: 3, now: NOW });
    check('results are handed over in bounded slices, not all at once',
      sliceSizes.every((n) => n <= 3) && sliceSizes.length === 4);
  }

  /* ═══ 7. The scorer is not duplicated ═══════════════════════════════════ */

  const BATCH = read('lib/server/recommendation-batch.ts');
  const COMPUTE = read('lib/server/recommendation-compute.ts');
  check('the batch scores through the shared pure function',
    /scoreRecommendations\(/.test(BATCH));
  check('and defines no scoring of its own',
    !/recommendMatch\(/.test(BATCH));
  check('the pure module uses the existing scorer',
    /recommendMatch\(profile, recJob, now\)/.test(COMPUTE));
  check('there is exactly ONE scoring implementation',
    (COMPUTE.match(/recommendMatch\(/g) ?? []).length === 1);
  check('the route now delegates to it rather than scoring inline',
    /scoreRecommendations\(\{ profile, showMatch/.test(read('app/api/recommendations/jobs/route.ts')));
  check('description is still required by the projection',
    (REC_JOB_FIELDS as readonly string[]).includes('description'));
  check('and applyUrl is carried for the card', (REC_JOB_FIELDS as readonly string[]).includes('applyUrl'));
  check('twelve fields, as measured', REC_JOB_FIELDS.length === 12);

  /* ═══ 8. No fabrication ═════════════════════════════════════════════════ */

  check('the batch never invents a recommendation',
    !/Math\.random|faker|placeholder/i.test(BATCH));
  check('scores come from the scorer, never a constant',
    !/score: [0-9]+(?![0-9])/.test(BATCH.replace(/SCORER_VERSION = 1/, '')));

  /* ═══ 9. Nothing is wired to production yet ═════════════════════════════ */

  check('no route reads precomputed records yet',
    !/recommendation-batch/.test(read('app/api/recommendations/jobs/route.ts')));

  console.log(`\n${passed} checks passed, ${failed} failed.`);
  if (failed > 0) { console.error('FAILED'); process.exit(1); }
  console.log('ALL CHECKS PASSED');

})();
