/**
 * Recommendation snapshot delivery — the durable tier, the build budget, the
 * single flight, and the honest fallbacks.
 *
 * Proves, without a database or a server:
 *   A. a snapshot renders EXACTLY what the live pass returns, both scopes, for
 *      members, an empty profile and the signed-out viewer;
 *   B. freshness classification and the stale ceiling;
 *   C. the miss decision: fresh → no build; built inside budget → built;
 *      overrun → stale snapshot, else pending (503); failure inside budget
 *      rejects; the build is never cancelled and always completes;
 *   D. single-flight: N concurrent misses run ONE pass; a stale refresh and a
 *      miss share it;
 *   E. persistence: both scopes, the version guard, a failed write is logged
 *      and changes nothing;
 *   F. batch ≡ live: computeRecordForProfile writes what the live snapshot
 *      writes (preferences + features), so the shared store cannot disagree;
 *   G. chunked feature derivation ≡ the synchronous derivation;
 *   H. keep-warm is idempotent, unref'd, and skipped during `next build`;
 *   I. authorization and route wiring, pinned on the route source: viewer key
 *      is the server-resolved id, anon is its own key, the snapshot path never
 *      loads the corpus, the snapshot is consulted before any build, the stale
 *      tier and the miss tier share startBuild, and the error body is unchanged.
 */
import { readFileSync } from 'node:fs';
import { buildRecProfile, hasProfileSignals } from '../lib/server/job-recommend';
import { recommendedSet, rowScope, scoreRecommendations } from '../lib/server/recommendation-compute';
import { computeRecordForProfile } from '../lib/server/recommendation-batch';
import { deriveRecFeatures, recFeaturesFor, clearRecFeatures } from '../lib/server/recommendation-features';
import { SCORER_VERSION, type RecommendationResultRecord } from '../lib/server/db/recommendation-results';
import {
  ANON_VIEWER, ROW_SNAPSHOT_MAX, SNAPSHOT_BUILD_BUDGET_MS, SNAPSHOT_MAX_STALE_AGE_MS,
  answerMiss, classifySnapshot, persistSnapshots, readSnapshot, renderSnapshot,
  snapshotJobIds, snapshotRecordsFromScored, storedEntryOf, viewerKeyOf, withBudget,
  type RecsPayload,
} from '../lib/server/recommendation-snapshots';
import {
  KEEP_WARM_INTERVAL_MS, startRecommendationKeepWarm, stopRecommendationKeepWarm,
} from '../lib/server/recommendation-keep-warm';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ─── fixtures: the equivalence suite's synthetic corpus ─────────────────── */
const SKILLS = ['typescript', 'react', 'node', 'sql', 'python', 'figma', 'aws', 'docker', 'kubernetes'];
const TITLES = ['Senior Software Engineer', 'Data Analyst', 'Product Designer', 'Support Engineer'];
const corpus: Array<Record<string, unknown>> = Array.from({ length: 240 }, (_, i) => ({
  id: `job-${String(i).padStart(4, '0')}`,
  title: TITLES[i % TITLES.length],
  organizationName: `Company ${i % 19}`,
  location: ['Bengaluru, India', 'Mumbai, India', 'Remote', 'Delhi, India'][i % 4],
  employmentType: ['full_time', 'contract'][i % 2],
  workMode: ['remote', 'onsite', 'hybrid'][i % 3],
  experienceLevel: ['entry', 'mid', 'senior', 'lead'][i % 4],
  description: `Requirements: ${SKILLS.slice(i % 6, (i % 6) + 4).join(', ')}. Need ${2 + (i % 5)}+ years. Ship features.`,
  preferredSkills: SKILLS.slice(i % 7, (i % 7) + 3),
  targetRoleKeywords: ['engineer', 'analyst'][i % 2] ? ['engineer'] : [],
  createdAt: new Date(Date.UTC(2026, 7, 1 + (i % 28))).toISOString(),
  applyUrl: `https://boards.example.com/${i}`,
  hiringUrgency: i % 5 === 0 ? 'urgent' : undefined,
  /* Fields the live card never exposes — must not leak through a snapshot. */
  requirements: 'SECRET', contentHash: 'SECRET', sourceUrl: 'SECRET', minimumAtsScore: 70,
}));
const canonical = new Map(corpus.map((j) => [String(j.id), j]));
const NOW = Date.parse('2026-09-07T00:00:00.000Z');
const CV = '240:2026-08-28T00:00:00.000Z';
const MAX_CARDS = 6;

const PROFILES: Array<[string, Record<string, unknown> | null]> = [
  ['software engineer', { headline: 'Senior Software Engineer', location: 'Bengaluru', skills: ['typescript', 'react', 'node'], experience: [{ title: 'Senior Software Engineer' }] }],
  ['data analyst', { headline: 'Data Analyst', location: 'Mumbai', skills: ['sql', 'python'], experience: [{ title: 'Data Analyst' }] }],
  ['location preference', { headline: 'Software Engineer', location: 'Bengaluru', skills: ['typescript'], experience: [{ title: 'Software Engineer' }], matchPreferences: { preferredLocations: ['Bengaluru'], workModes: ['remote'] } }],
  ['no matching jobs', { headline: 'Marine Biologist', location: 'Kochi', skills: ['cetacean acoustics'], experience: [{ title: 'Marine Biologist' }] }],
  ['empty profile', { headline: '', location: '', skills: [], experience: [] }],
  ['signed out', null],
];

/** EXACTLY computeRecommendations' pass (route.ts), minus the I/O. */
function livePass(fields: Record<string, unknown> | null, features: Map<string, { skills: readonly string[]; years: number | null }> | null) {
  const profile = buildRecProfile({
    ...(fields ?? {}),
    preferences: (fields as { matchPreferences?: Record<string, never> } | null)?.matchPreferences,
  } as never);
  const showMatch = hasProfileSignals(profile);
  const scored = scoreRecommendations({ profile, showMatch, jobs: corpus, now: NOW, features });
  scored.sort((a, b) => b.score - a.score || Date.parse(String(b.job.createdAt)) - Date.parse(String(a.job.createdAt)));
  const { recommended, total } = recommendedSet(scored);
  return {
    scored, showMatch, total,
    row: { jobs: rowScope(scored, MAX_CARDS), total } as RecsPayload,
    recommended: { jobs: recommended.map((s) => s.job), total } as RecsPayload,
  };
}

(async () => {
  clearRecFeatures();
  const features = await recFeaturesFor(CV, corpus);
  check('fixture: features derived for the corpus', !!features && features.size === corpus.length);

  /* ═══ A. snapshot render ≡ live pass ══════════════════════════════════════ */
  console.log('A. snapshot renders exactly the live payload');
  for (const [label, fields] of PROFILES) {
    const L = livePass(fields, features);
    const viewerKey = viewerKeyOf(fields ? `u-${label}` : null);
    const recs = snapshotRecordsFromScored({ viewerKey, profileVersion: 3, corpusVersion: CV, scored: L.scored, showMatch: L.showMatch, now: NOW });

    check(`${label}: row snapshot stores the ranked prefix (${ROW_SNAPSHOT_MAX})`,
      recs.row.results.length === Math.min(ROW_SNAPSHOT_MAX, corpus.length));
    check(`${label}: recommended snapshot stores the full set (${L.total})`,
      recs.recommended.results.length === L.total && recs.recommended.total === L.total && recs.row.total === L.total);
    check(`${label}: status names the empty-profile case`,
      recs.row.status === (L.showMatch ? 'ready' : 'empty_profile'));

    const row = renderSnapshot(recs.row, 'row', MAX_CARDS, canonical);
    const rec = renderSnapshot(recs.recommended, 'recommended', MAX_CARDS, canonical);
    check(`${label}: row render ≡ live row (${L.row.jobs.length} cards)`, same(row, L.row));
    check(`${label}: recommended render ≡ live recommended (${L.total} cards)`, same(rec, L.recommended));
    check(`${label}: no ingestion field leaks through a snapshot card`,
      JSON.stringify(row) .indexOf('SECRET') === -1 && JSON.stringify(rec).indexOf('SECRET') === -1);
    if (!L.showMatch) {
      check(`${label}: cards carry NO match fields (no fabricated score)`,
        (row?.jobs as Array<Record<string, unknown>>).every((c) => !('matchScore' in c) && !('matchReasons' in c)));
    }
  }
  {
    /* maxCards is applied at render, so a raised cap is honoured immediately. */
    const L = livePass(PROFILES[0][1], features);
    const recs = snapshotRecordsFromScored({ viewerKey: 'u', profileVersion: 1, corpusVersion: CV, scored: L.scored, showMatch: true, now: NOW });
    check('row render honours a larger maxCards from the stored prefix',
      same(renderSnapshot(recs.row, 'row', 12, canonical), { jobs: rowScope(L.scored, 12), total: L.total }));
    check('snapshotJobIds names only the postings a render needs',
      snapshotJobIds(recs.row, 'row', MAX_CARDS).length === MAX_CARDS
      && snapshotJobIds(recs.recommended, 'recommended', MAX_CARDS).length === L.total);
    /* A vanished posting is dropped, never invented. */
    const partial = new Map(canonical); partial.delete(String(recs.row.results[0].jobId));
    const rendered = renderSnapshot(recs.row, 'row', MAX_CARDS, partial);
    check('a vanished posting is dropped from the render, not invented',
      rendered !== null && rendered.jobs.length === MAX_CARDS - 1
      && !(rendered.jobs as Array<Record<string, unknown>>).some((c) => c.id === recs.row.results[0].jobId));
    check('no postings at all → null, never an empty success', renderSnapshot(recs.row, 'row', MAX_CARDS, null) === null);
    check('every named posting vanished → null, never "no matches"',
      renderSnapshot(recs.recommended, 'recommended', MAX_CARDS, new Map()) === null);
  }

  /* ═══ B. freshness ════════════════════════════════════════════════════════ */
  console.log('B. freshness classification');
  const base: RecommendationResultRecord = {
    userId: 'u', scope: 'row', profileVersion: 3, corpusVersion: CV, scorerVersion: SCORER_VERSION,
    generatedAt: new Date(NOW - 60_000).toISOString(), status: 'ready', total: 0, results: [],
  };
  const exp = { profileVersion: 3, corpusVersion: CV };
  check('all versions match → fresh', classifySnapshot(base, exp, NOW) === 'fresh');
  check('profile moved → stale (servable only past the budget)', classifySnapshot({ ...base, profileVersion: 2 }, exp, NOW) === 'stale');
  check('corpus moved → stale', classifySnapshot({ ...base, corpusVersion: '241:x' }, exp, NOW) === 'stale');
  check('scorer moved → unusable', classifySnapshot({ ...base, scorerVersion: SCORER_VERSION + 1, profileVersion: 2 }, exp, NOW) === 'unusable');
  check('older than the ceiling → unusable', classifySnapshot({ ...base, profileVersion: 2, generatedAt: new Date(NOW - SNAPSHOT_MAX_STALE_AGE_MS - 1).toISOString() }, exp, NOW) === 'unusable');
  check('a fresh record is fresh regardless of age', classifySnapshot({ ...base, generatedAt: '2020-01-01T00:00:00.000Z' }, exp, NOW) === 'fresh');
  check('missing → unusable', classifySnapshot(null, exp, NOW) === 'unusable');
  check('malformed (no results array) → unusable', classifySnapshot({ ...base, results: undefined as never }, exp, NOW) === 'unusable');
  check('unknown status → unusable', classifySnapshot({ ...base, status: 'failed' as never }, exp, NOW) === 'unusable');

  /* ═══ C. the miss decision ════════════════════════════════════════════════ */
  console.log('C. answerMiss: budget, fallbacks, failure');
  const P: RecsPayload = { jobs: [{ id: 'x' }], total: 1 };
  const S: RecsPayload = { jobs: [{ id: 'stale' }], total: 1 };
  {
    let builds = 0;
    const a = await answerMiss({ snapshot: { state: 'fresh', payload: P }, build: async () => { builds += 1; return P; }, budgetMs: 50 });
    check('fresh snapshot IS the answer', a.kind === 'fresh-snapshot' && same(a.payload, P));
    check('and no build is started for it', builds === 0);
  }
  {
    const a = await answerMiss({ snapshot: { state: 'disabled' }, build: async () => P, budgetMs: 50 });
    check('feed disabled → the live path\'s own empty answer', a.kind === 'disabled' && same(a.payload, { jobs: [], total: 0 }));
  }
  {
    const a = await answerMiss({ snapshot: { state: 'unusable' }, build: async () => { await sleep(10); return P; }, budgetMs: 200 });
    check('build inside budget → built', a.kind === 'built' && same(a.payload, P));
  }
  {
    let finished = false as boolean;
    const slow = async () => { await sleep(120); finished = true; return P; };
    const t0 = Date.now();
    const a = await answerMiss({ snapshot: { state: 'stale', payload: S }, build: slow, budgetMs: 30 });
    check('build overruns → the stale snapshot answers', a.kind === 'stale-snapshot' && same(a.payload, S));
    check('and the caller waited only the budget', Date.now() - t0 < 100);
    check('the build was NOT cancelled by the budget', finished === false);
    await sleep(150);
    check('…and completes on its own afterwards', finished === true);
  }
  {
    const a = await answerMiss({ snapshot: { state: 'unusable' }, build: async () => { await sleep(120); return P; }, budgetMs: 30 });
    check('build overruns with nothing valid → pending (503), never an empty 200', a.kind === 'pending');
    await sleep(150);
  }
  {
    let threw = false;
    try { await answerMiss({ snapshot: { state: 'stale', payload: S }, build: async () => { throw new Error('atlas down'); }, budgetMs: 200 }); }
    catch (e) { threw = (e as Error).message === 'atlas down'; }
    check('a build that fails INSIDE the budget rejects (the route answers 503)', threw);
  }
  {
    const r1 = await withBudget(Promise.resolve(7), 20);
    const r2 = await withBudget(sleep(60).then(() => 7), 20);
    check('withBudget: settled / unsettled', r1.settled && r1.value === 7 && !r2.settled);
    check('the production budget is well under 2 s', SNAPSHOT_BUILD_BUDGET_MS <= 1_500);
  }

  /* ═══ D. single flight ════════════════════════════════════════════════════ */
  console.log('D. single-flight build');
  {
    /* The route's startBuild, reproduced from its source so the seam is the
       same: one in-flight promise per key, removed on settle. */
    const inflight = new Map<string, Promise<RecsPayload>>();
    let passes = 0;
    const compute = async () => { passes += 1; await sleep(40); return P; };
    const startBuild = (key: string) => {
      const pending = inflight.get(key);
      if (pending) return pending;
      const run = compute().finally(() => { inflight.delete(key); });
      inflight.set(key, run);
      run.catch(() => undefined);
      return run;
    };
    const answers = await Promise.all(Array.from({ length: 20 }, () =>
      answerMiss({ snapshot: { state: 'unusable' }, build: () => startBuild('anon:row'), budgetMs: 200 })));
    check('20 concurrent misses → ONE ranking pass', passes === 1);
    check('…and every caller got the built payload', answers.every((a) => a.kind === 'built'));
    /* A stale-tier refresh and a miss on the same key share it too. */
    startBuild('u1:row').catch(() => undefined);
    await answerMiss({ snapshot: { state: 'unusable' }, build: () => startBuild('u1:row'), budgetMs: 200 });
    check('a stale refresh and a miss share the same pass', passes === 2);
    check('the in-flight entry is removed once settled', inflight.size === 0);
    /* Failure removes the entry so the next request may retry. */
    let n = 0;
    const startFailing = (key: string) => {
      const pending = inflight.get(key);
      if (pending) return pending;
      const run = (async () => { n += 1; throw new Error('boom'); })().finally(() => { inflight.delete(key); });
      inflight.set(key, run);
      run.catch(() => undefined);
      return run;
    };
    await startFailing('k').catch(() => undefined);
    await startFailing('k').catch(() => undefined);
    check('a failed pass is retried by the next request, not pinned', n === 2 && inflight.size === 0);
  }

  /* ═══ E. persistence ══════════════════════════════════════════════════════ */
  console.log('E. persistence');
  {
    const L = livePass(PROFILES[0][1], features);
    const recs = snapshotRecordsFromScored({ viewerKey: 'u-p', profileVersion: 3, corpusVersion: CV, scored: L.scored, showMatch: true, now: NOW });
    const written: string[] = [];
    const out = await persistSnapshots(recs, async (r) => { written.push(`${r.userId}:${r.scope}`); return { written: true }; });
    check('both scopes are persisted from one pass', same(written, ['u-p:row', 'u-p:recommended']) && out.row && out.recommended);
    const refused = await persistSnapshots(recs, async () => ({ written: false, reason: 'stale' }));
    check('a version-guard refusal is reported, not hidden', !refused.row && !refused.recommended);
    const opts: unknown[] = [];
    await persistSnapshots(recs, async (_r, o) => { opts.push(o); return { written: true }; });
    check('an unchanged snapshot is not re-sent across regions (skipIfUnchanged)',
      opts.length === 2 && opts.every((o) => (o as { skipIfUnchanged?: boolean })?.skipIfUnchanged === true));
    check('…and the store honours it without touching the identical-version replace a batch retry needs',
      /options\.skipIfUnchanged && existing/.test(read('lib/server/db/recommendation-results.ts'))
      && /return incoming\.corpusVersion >= existing\.corpusVersion;/.test(read('lib/server/db/recommendation-results.ts')));
    const errors: string[] = [];
    const origErr = console.error; console.error = (...a: unknown[]) => { errors.push(String(a[0])); };
    let threw = false;
    try { await persistSnapshots(recs, async () => { throw new Error('write failed'); }); } catch { threw = true; }
    console.error = origErr;
    check('a failed write is logged and never thrown at the response', !threw && errors.length === 2);
    const storedRead = await readSnapshot('u-p', 'row', async () => { throw new Error('read failed'); });
    check('a failed read is null (build live), never an empty answer', storedRead === null);
    check('records carry the scorer version so a scorer bump invalidates them', recs.row.scorerVersion === SCORER_VERSION);
  }

  /* ═══ F. batch ≡ live snapshot ════════════════════════════════════════════ */
  console.log('F. computeRecordForProfile ≡ live recommended snapshot');
  for (const [label, fields] of PROFILES) {
    if (!fields) continue;
    const L = livePass(fields, features);
    const live = snapshotRecordsFromScored({ viewerKey: `u-${label}`, profileVersion: 3, corpusVersion: CV, scored: L.scored, showMatch: L.showMatch, now: NOW }).recommended;
    const batch = computeRecordForProfile({ userId: `u-${label}`, profileVersion: 3, fields }, corpus, CV, NOW, features);
    /* Key order differs between the two builders; the CONTENT must not. */
    const canon = (r: unknown) => {
      const { scope: _s, ...rest } = r as Record<string, unknown>;
      return Object.fromEntries(Object.keys(rest).sort().map((k) => [k, rest[k]]));
    };
    check(`${label}: batch record ≡ live snapshot (preferences + features honoured)`, same(canon(batch), canon(live)));
  }
  check('storedEntryOf is the batch\'s entry definition (one definition)',
    /results: recommended\.map\(storedEntryOf\)/.test(read('lib/server/recommendation-batch.ts')));
  check('the batch builds the profile WITH stated preferences, as the route does',
    /preferences: \(input\.fields as \{ matchPreferences\?/.test(read('lib/server/recommendation-batch.ts')));

  /* ═══ G. chunked derivation ≡ synchronous derivation ══════════════════════ */
  console.log('G. chunked feature derivation');
  {
    const sync = new Map(corpus.map((j) => [String(j.id), deriveRecFeatures(j.description)]));
    check('chunked build derives the identical feature set',
      !!features && same(Array.from(features.entries()), Array.from(sync.entries())));
    const big = Array.from({ length: 1_001 }, (_, i) => ({ id: `b-${i}`, description: `Need ${i % 9}+ years of react and node` }));
    clearRecFeatures();
    let ticks = 0; const tick = setInterval(() => { ticks += 1; }, 0);
    const set = await recFeaturesFor('big:v', big);
    clearInterval(tick);
    check('a large derivation yields to the event loop while it runs', !!set && set.size === 1_001 && ticks > 0);
    check('the build yields between slices (setImmediate), never in the scorer',
      /await yieldToLoop\(\)/.test(read('lib/server/recommendation-features.ts'))
      && !/setImmediate/.test(read('lib/server/recommendation-compute.ts')));
    clearRecFeatures();
  }

  /* ═══ H. keep-warm ════════════════════════════════════════════════════════ */
  console.log('H. keep-warm timer');
  {
    check('the interval is shorter than the corpus trust window (10 min)', KEEP_WARM_INTERVAL_MS < 10 * 60_000);
    const first = startRecommendationKeepWarm(60_000);
    const second = startRecommendationKeepWarm(60_000);
    check('starts once; a second call is a no-op', first === true && second === false);
    stopRecommendationKeepWarm();
    check('stop makes a fresh start possible', startRecommendationKeepWarm(60_000) === true);
    stopRecommendationKeepWarm();
    const prev = process.env.NEXT_PHASE; process.env.NEXT_PHASE = 'phase-production-build';
    check('never starts inside `next build`', startRecommendationKeepWarm(60_000) === false);
    if (prev === undefined) delete process.env.NEXT_PHASE; else process.env.NEXT_PHASE = prev;
    const src = read('lib/server/recommendation-keep-warm.ts');
    check('the timer is unref\'d and ticks never overlap', /unref\?\.\(\)/.test(src) && /if \(guard\.ticking\) return/.test(src));
    check('it warms with the request path\'s OWN loaders, nothing new',
      /getPublishedHiringJobs\(\)/.test(src) && /recFeaturesFor\(version, jobs/.test(src) && !/scoreRecommendations|recommendMatch/.test(src));
  }

  /* ═══ I. authorization and route wiring ═══════════════════════════════════ */
  console.log('I. route wiring (source-pinned)');
  {
    const ROUTE = read('app/api/recommendations/jobs/route.ts');
    const fn = (name: string) => {
      const i = ROUTE.indexOf(`function ${name}(`);
      const j = ROUTE.indexOf('\n}\n', i);
      return ROUTE.slice(i, j);
    };
    const get = fn('GET'); const snap = fn('trySnapshot'); const cr = fn('computeRecommendations');
    check('viewer key is the SERVER-resolved id; anon is its own key', viewerKeyOf(null) === ANON_VIEWER && viewerKeyOf('u9') === 'u9');
    check('the route resolves the viewer from the session, never the request',
      /resolveSessionUserId\(session\)/.test(get) && !/params\.get\('userId'\)|params\.get\('me'\)/.test(get));
    check('the snapshot is read for viewerKeyOf(meId) only', /readSnapshot\(viewerKey, scope\)/.test(snap) && /const viewerKey = viewerKeyOf\(meId\)/.test(snap));
    check('the snapshot path NEVER loads the corpus', !/getPublishedHiringJobs\(/.test(snap));
    check('it renders from the in-memory corpus only when the version provably matches', /peekPublishedHiringJobsAt\(version\)/.test(snap));
    check('…else fetches only the named postings', /selectPublishedFeedJobsByIds\(ids\)/.test(snap));
    check('freshness inputs and the record are read in ONE parallel round', /Promise\.all\(\[\s*getFeedConfig\(\),\s*readHiringCorpusVersion\(\)/.test(snap));
    check('the L1 fresh tier is untouched', /if \(hit && age < CACHE_TTL\)/.test(get));
    check('the L1 stale tier is untouched and uses the shared single flight', /if \(hit && age < STALE_TTL\) \{\s*startBuild\(cacheKey, meId, scope\)/.test(get));
    check('on a miss the snapshot is consulted BEFORE any build', get.indexOf('await trySnapshot(') < get.indexOf('startBuild(cacheKey, meId, scope),'));
    check('the miss decision is answerMiss with the production budget', /answerMiss\(\{[\s\S]*budgetMs: SNAPSHOT_BUILD_BUDGET_MS/.test(get));
    check('a stale snapshot is cached as already stale (served, refresh in flight)', /ts: Date\.now\(\) - CACHE_TTL/.test(get));
    check('pending → 503 with the UNCHANGED error body and a Retry-After', /status: 503, headers: \{ 'Cache-Control': 'no-store', 'Retry-After'/.test(get) && (get.match(/error: 'Recommendations are temporarily unavailable\.'/g) ?? []).length >= 1);
    check('no response is ever public-cacheable', !/public|s-maxage/.test(get));
    check('the live pass persists BOTH scopes from its own scored array', /persistSnapshots\(snapshotRecordsFromScored\(\{[\s\S]*scored, showMatch, now/.test(cr));
    check('…only when the corpus version is known', /if \(corpusVersion\) \{\s*const profileVersion/.test(cr));
    check('…behind the response (void), never awaited', /void persistSnapshots\(/.test(cr));
    check('the scoring pass itself is unchanged', /const scored = scoreRecommendations\(\{ profile, showMatch, jobs: jobs as unknown as Array<Record<string, unknown>>, now, features \}\);/.test(cr));
    check('the corpus-version probe happens once per pass and feeds both features and the snapshot',
      (cr.match(/readHiringCorpusVersion\(\)/g) ?? []).length === 1 && /recFeaturesFor\(\s*corpusVersion,/.test(cr));
    check('keep-warm is started once at module load', /^startRecommendationKeepWarm\(\);/m.test(ROUTE));
    check('the flag-gated precomputed path is left as it was', /await tryPrecomputed\(meId, scope\)/.test(cr));
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
  if (failed > 0) { console.log('FAILED'); process.exit(1); }
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
