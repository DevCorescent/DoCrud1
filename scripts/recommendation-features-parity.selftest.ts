/**
 * The row/recommended scopes score with the derived-feature cache — and get
 * exactly what the inline scan gave.
 *
 * Run: npm run test:recommendation-features-parity
 *
 * ═══ WHAT WAS WRONG ═══
 *
 * `computeRecommendations` (the homepage tile, the carousel, /jobs?recommended)
 * scored every posting by scanning its description for skills on every cache
 * miss — 426 µs of a posting's ~440 µs, ~9 s per pass on the real corpus, and
 * the reason a cold /api/recommendations/jobs took >15 s. The personalized
 * ranking already fed the same scorer the same values derived once per corpus
 * version (`recFeaturesFor`); this scope never did.
 *
 * ═══ THE THINGS THAT MUST NOT REGRESS ═══
 *
 *  A. Parity: for the same corpus, profile and instant, feature-backed and
 *     inline scoring produce identical score, recommended, reasons, summary,
 *     factors, matchedSkills, missingSkills, and identical order.
 *  B. Cache: same version reuses, concurrent calls single-flight, a new
 *     version derives a new set, clearRecFeatures drops it.
 *  C. Fallback: a null feature set scores inline — identical output, never
 *     an empty result.
 *  D. Route: features are obtained ONCE per pass (never per job), after the
 *     corpus and before scoring, with the same version key the personalized
 *     path uses; both paths build postings through the ONE shared projection;
 *     cache keys, response shape and the guards around them are unchanged.
 *
 * Fixtures are asserted to be discriminating (text-only skills, years in
 * prose, empty descriptions, a title-only overlap, a no-overlap posting that
 * still scores). No database, no network, no session.
 */
import { readFileSync } from 'node:fs';
import { buildRecProfile, hasProfileSignals, recommendMatch, type RecJob } from '../lib/server/job-recommend';
import { recommendedSet, rowScope, scoreRecommendations, toRecJob } from '../lib/server/recommendation-compute';
import { clearRecFeatures, deriveRecFeatures, recFeaturesFor, recFeaturesState, type RecFeatures } from '../lib/server/recommendation-features';

let passed = 0, failed = 0;
function check(label: string, cond: boolean, detail = '') { if (cond) { passed += 1; return; } failed += 1; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const NOW = Date.parse('2026-09-22T00:00:00.000Z');
const recent = new Date(NOW - 3 * 86400000).toISOString(); const old = new Date(NOW - 300 * 86400000).toISOString();
const job = (o: Record<string, unknown>): Record<string, unknown> => ({ status: 'published', organizationName: 'Acme', location: 'Bengaluru, India', employmentType: 'full_time', workMode: 'onsite', experienceLevel: 'associate', description: '', preferredSkills: [], targetRoleKeywords: [], createdAt: old, applyUrl: 'https://acme.test/apply', ...o });
const CORPUS: Record<string, unknown>[] = [
  job({ id: 'a', title: 'Backend Developer', preferredSkills: ['Node.js', 'MongoDB'], description: 'Own services in Node.js and TypeScript; 3+ years of experience required.' }),
  job({ id: 'b', title: 'Frontend Engineer', description: 'You will build interfaces with React and TypeScript. 2 years experience.' }),
  job({ id: 'c', title: 'Data Analyst', preferredSkills: ['Python', 'SQL'], description: 'Pandas and SQL daily.' }),
  job({ id: 'd', title: 'Operations Associate', workMode: 'remote', createdAt: recent, description: 'Coordinate vendors and schedules.' }),
  job({ id: 'e', title: 'Warehouse Supervisor' }),
  job({ id: 'f', title: 'Node Engineer', description: '', createdAt: recent, hiringUrgency: 'urgent' }),
  job({ id: 'g', title: 'React Native Developer', description: 'React Native, Redux and Jest. Minimum 5 years.', location: 'Remote', workMode: 'remote', createdAt: recent }),
  job({ id: 'h', title: 'Java Engineer', description: 'Spring Boot and Java 17.', targetRoleKeywords: ['java'] }),
  job({ id: 'i', title: 'Senior Python Engineer', description: 'Django, Postgres, 6+ years.', experienceLevel: 'senior', createdAt: recent }),
  job({ id: 'j', title: 'Product Manager', description: 'Roadmaps and stakeholders.', createdAt: recent }),
];
const FEATURES: Map<string, RecFeatures> = new Map(CORPUS.map((j) => [String(j.id), deriveRecFeatures(j.description)]));
const PROFILES: Array<[string, Parameters<typeof buildRecProfile>[0]]> = [
  ['backend member', { skills: ['Node.js', 'MongoDB', 'React'], headline: 'Backend Developer', location: 'Bengaluru', experience: [{ title: 'Backend Developer', period: '2021 – 2024' }] }],
  ['data member', { skills: ['Python', 'SQL'] }],
  ['react-only (text-only overlap)', { skills: ['React'] }],
  ['java by title keyword', { headline: 'Java Engineer' }],
  ['anonymous (no signals)', {}],
  ['nonsense', { skills: ['zzqx-not-a-skill'] }],
];
const wire = (v: unknown) => JSON.stringify(v);

console.log('── A. Feature-backed scoring == inline scoring ──');
check('fixture discriminates: a text-only skill exists (features path exercised)', (FEATURES.get('b')?.skills.length ?? 0) > 0);
check('fixture discriminates: years extracted from prose', FEATURES.get('a')?.years === 3 && FEATURES.get('g')?.years === 5);
check('fixture discriminates: empty description → no features', FEATURES.get('f')?.skills.length === 0 && FEATURES.get('f')?.years === null);
for (const [label, fields] of PROFILES) {
  const profile = buildRecProfile(fields); const showMatch = hasProfileSignals(profile);
  const inline = scoreRecommendations({ profile, showMatch, jobs: CORPUS, now: NOW });
  const backed = scoreRecommendations({ profile, showMatch, jobs: CORPUS, now: NOW, features: FEATURES });
  check(`${label}: identical scored output (score, recommended, job payload incl. reasons/summary/factors/matched/missing) and order`, wire(inline) === wire(backed));
  check(`${label}: identical recommended set and total`, wire(recommendedSet(inline)) === wire(recommendedSet(backed)));
  check(`${label}: identical row scope`, wire(rowScope(inline, 6)) === wire(rowScope(backed, 6)));
  /* Below the projection: the match object itself, field by field. */
  for (const j of CORPUS) {
    const a = recommendMatch(profile, toRecJob(j), NOW); const b = recommendMatch(profile, toRecJob(j, FEATURES), NOW);
    if (wire(a) !== wire(b)) { check(`${label}: recommendMatch parity on ${j.id}`, false, `${wire(a).slice(0, 120)} vs ${wire(b).slice(0, 120)}`); }
  }
}
check('recommendMatch parity held for every profile × posting', failed === 0);
check('the fixture discriminates: a scored-but-not-recommended posting exists', scoreRecommendations({ profile: buildRecProfile(PROFILES[0][1]), showMatch: true, jobs: CORPUS, now: NOW }).some((s) => s.score > 0 && !s.recommended));
check('the fixture discriminates: rankings are not all ties', new Set(scoreRecommendations({ profile: buildRecProfile(PROFILES[0][1]), showMatch: true, jobs: CORPUS, now: NOW }).map((s) => s.score)).size > 3);

console.log('── A2. The shared projection is the old inline projection ──');
const oldInline = (j: Record<string, unknown>): RecJob => ({ id: String(j.id ?? ''), title: String(j.title ?? ''), organizationName: String(j.organizationName ?? ''), location: String(j.location ?? ''), employmentType: String(j.employmentType ?? ''), workMode: String(j.workMode ?? ''), experienceLevel: String(j.experienceLevel ?? ''), description: String(j.description ?? ''), preferredSkills: Array.isArray(j.preferredSkills) ? (j.preferredSkills as string[]) : [], targetRoleKeywords: Array.isArray(j.targetRoleKeywords) ? (j.targetRoleKeywords as string[]) : [], createdAt: String(j.createdAt ?? '') });
check('toRecJob without features == the previous inline RecJob, key for key', CORPUS.every((j) => wire(toRecJob(j)) === wire(oldInline(j))));
check('toRecJob with features adds exactly recSkills/recYears', CORPUS.every((j) => { const r = toRecJob(j, FEATURES) as unknown as Record<string, unknown>; return r.recSkills === FEATURES.get(String(j.id))!.skills && r.recYears === FEATURES.get(String(j.id))!.years && wire({ ...r, recSkills: undefined, recYears: undefined }) === wire({ ...oldInline(j), recSkills: undefined, recYears: undefined }); }));
check('a posting absent from the set gets no feature keys (inline path)', !('recSkills' in toRecJob({ id: 'not-in-set', title: 'x' }, FEATURES)));
check('malformed fields coerce as before', wire(toRecJob({ id: 7, preferredSkills: 'nope', createdAt: null })) === wire(oldInline({ id: 7, preferredSkills: 'nope', createdAt: null })));

console.log('── B. The feature cache ──');
async function cacheBehaviour() {
  clearRecFeatures();
  const set1 = await recFeaturesFor('v1', CORPUS); check('a version derives a set', !!set1 && set1.size === CORPUS.length && recFeaturesState().version === 'v1');
  const set1b = await recFeaturesFor('v1', CORPUS); check('the same version reuses the same Map instance', set1b === set1);
  clearRecFeatures();
  const [x, y, z] = await Promise.all([recFeaturesFor('v2', CORPUS), recFeaturesFor('v2', CORPUS), recFeaturesFor('v2', CORPUS)]);
  check('concurrent callers on a cold cache share ONE derivation', x === y && y === z && recFeaturesState().version === 'v2');
  const set3 = await recFeaturesFor('v3', CORPUS); check('a changed version derives a new set', set3 !== x && recFeaturesState().version === 'v3');
  check('no version → null (never a reused set)', (await recFeaturesFor(null, CORPUS)) === null);
  clearRecFeatures(); check('clearRecFeatures drops the set', recFeaturesState().version === null && recFeaturesState().size === 0);
  check('a cached set carries the same values the parity test used', wire(Array.from((await recFeaturesFor('v4', CORPUS))!.entries())) === wire(Array.from(FEATURES.entries())));
  clearRecFeatures();
}

console.log('── C. Fallback: a null set scores inline ──');
for (const [label, fields] of PROFILES.slice(0, 3)) {
  const profile = buildRecProfile(fields); const showMatch = hasProfileSignals(profile);
  check(`${label}: features=null == inline, and not empty`, wire(scoreRecommendations({ profile, showMatch, jobs: CORPUS, now: NOW, features: null })) === wire(scoreRecommendations({ profile, showMatch, jobs: CORPUS, now: NOW })) && scoreRecommendations({ profile, showMatch, jobs: CORPUS, now: NOW, features: null }).length === CORPUS.length);
}
check('a partial set (some postings missing) still equals inline', wire(scoreRecommendations({ profile: buildRecProfile(PROFILES[0][1]), showMatch: true, jobs: CORPUS, now: NOW, features: new Map([['a', FEATURES.get('a')!]]) })) === wire(scoreRecommendations({ profile: buildRecProfile(PROFILES[0][1]), showMatch: true, jobs: CORPUS, now: NOW })));

console.log('── D. The route: once per pass, same key, same shape ──');
const ROUTE = strip(readFileSync('app/api/recommendations/jobs/route.ts', 'utf8'));
const fn = (name: string) => { const i = ROUTE.indexOf(`async function ${name}(`); return ROUTE.slice(i, ROUTE.indexOf('\n}\n', i)); };
const cr = fn('computeRecommendations'); const rp = fn('rankPersonalized');
check('computeRecommendations obtains features with recFeaturesFor', /const features = await recFeaturesFor\(/.test(cr));
check('with the same version key the personalized path uses', /corpusVersionKey\(await readHiringCorpusVersion\(\)\.catch\(\(\) => null\)\)/.test(cr) && /corpusVersionKey\(await readHiringCorpusVersion\(\)\.catch\(\(\) => null\)\)/.test(rp));
check('after the corpus is loaded and before scoring', cr.indexOf('getPublishedHiringJobs()') < cr.indexOf('recFeaturesFor(') && cr.indexOf('recFeaturesFor(') < cr.indexOf('scoreRecommendations('));
check('exactly once per pass — not inside a per-job callback', (cr.match(/recFeaturesFor\(/g) ?? []).length === 1 && (cr.match(/readHiringCorpusVersion\(/g) ?? []).length === 1 && !/\.map\([\s\S]*?recFeaturesFor/.test(cr));
check('a failed derivation is null, not a thrown pass', /recFeaturesFor\([\s\S]*?\)\.catch\(\(\) => null\)/.test(cr));
check('the features reach the scorer', /scoreRecommendations\(\{ profile, showMatch, jobs: jobs as unknown as Array<Record<string, unknown>>, now, features \}\)/.test(cr));
check('the personalized ranking builds postings through the shared projection', /const recJob = toRecJob\(j, features\);/.test(rp) && !/description: String\(j\.description \?\? ''\)/.test(rp));
check('and the compute module\'s scorer does too', /const recJob = toRecJob\(j, features\);/.test(strip(readFileSync('lib/server/recommendation-compute.ts', 'utf8'))));
check('the row/recommended cache key is unchanged', (cr.match(/cache\.set\(`\$\{meId \?\? 'anon'\}:\$\{scope\}`/g) ?? []).length >= 1);
check('the response shape is unchanged', /const payload: RecsPayload = \{ jobs: list, total \};/.test(cr));
check('the corpus read is still not swallowed', !/getPublishedHiringJobs\(\)\s*\.catch/.test(cr));
check('the recommended-set rule is unchanged', /const \{ recommended, total \} = recommendedSet\(scored\);/.test(cr));
check('the comparator is unchanged', /scored\.sort\(\(a, b\) => b\.score - a\.score \|\| Date\.parse\(String\(b\.job\.createdAt\)\) - Date\.parse\(String\(a\.job\.createdAt\)\)\);/.test(cr));
check('the profile fields read are unchanged', /getProfileFields\(meId, \['headline', 'skills', 'location', 'experience', 'interests', 'resumeFiles', 'matchPreferences'\]\)/.test(cr));

cacheBehaviour().then(() => {
  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
  if (failed > 0) { console.error('FAILED'); process.exit(1); }
}).catch((e) => { console.error('\n❌', e instanceof Error ? e.message : e); process.exit(1); });
