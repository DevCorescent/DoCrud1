/**
 * The onboarding job-match count: one engine, a truthful bucket, no leaks.
 *
 * Run: npm run test:onboarding-job-matches
 *
 * ═══ WHAT THIS GUARDS ═══
 *
 *  1. SAME ENGINE AS THE HOMEPAGE. The count for a set of skills must equal
 *     `recommendedSet(scoreRecommendations(...)).total` — the exact chain the
 *     homepage "Job matches" tile runs — on a fixture corpus, with and without
 *     derived features. An onboarding-only matcher, a different threshold, or
 *     counting "score > 0" instead of "recommended" all fail here.
 *  2. NOTHING FAKE, NOTHING UNPUBLISHED. The count is over what it is handed
 *     and only the published part of it; an injected draft with perfect skills
 *     is not counted, and the route reads the corpus from the published
 *     accessor and nothing else.
 *  3. NO CROSS-CANDIDATE LEAK. The memo key carries the canonical skill set and
 *     the corpus version; two candidates with different skills can never share
 *     an entry, and a corpus change or a job write drops it.
 *  4. THE BUCKET IS NEVER ABOVE THE COUNT, and the count-up never shows a value
 *     above the bucket.
 *  5. THE ROUTE IS PRE-AUTH AND HONEST: no session, the shared coercer and rate
 *     limiter, and a failed read is a 503 with no total.
 *
 * Fixtures are asserted to be discriminating (a positive-score job that is NOT
 * recommended exists; a draft with matching skills exists) so the harness
 * cannot pass by accident. Source-level checks read the real files.
 *
 * No database, no network, no session.
 */
import { readFileSync } from 'node:fs';
import { buildRecProfile, hasProfileSignals, isRecommended, recommendMatch } from '../lib/server/job-recommend';
import { recommendedSet, scoreRecommendations } from '../lib/server/recommendation-compute';
import { deriveRecFeatures, type RecFeatures } from '../lib/server/recommendation-features';
import { invalidateRecommendationCaches } from '../lib/server/recommendation-cache';
import {
  canonicalSkills, clearOnboardingMatchCounts, countOnboardingMatches, matchBucket,
  matchCountKey, memoizedMatchCount, onboardingMatchCountState, onboardingRecProfile, toRecJob,
} from '../lib/server/onboarding-match-count';
import { countUpSteps, formatRecommendedJobCount } from '../lib/onboarding-jobs';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const path = (f: string) => new URL(`../${f}`, import.meta.url);
const src = (f: string) => readFileSync(path(f), 'utf8');
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/* ═══ Fixture corpus ═════════════════════════════════════════════════════ */
const NOW = Date.parse('2026-09-16T00:00:00.000Z');
const recent = new Date(NOW - 2 * 24 * 3600_000).toISOString();
const old = new Date(NOW - 400 * 24 * 3600_000).toISOString();
type Job = Record<string, unknown>;
const job = (over: Job): Job => ({
  status: 'published', organizationName: 'Acme', location: 'Bengaluru, India', employmentType: 'full_time',
  workMode: 'onsite', experienceLevel: 'associate', description: '', preferredSkills: [], targetRoleKeywords: [],
  createdAt: old, ...over,
});
const CORPUS: Job[] = [
  job({ id: 'j-node-declared', title: 'Backend Developer', preferredSkills: ['Node.js', 'MongoDB'] }),
  job({ id: 'j-react-in-text', title: 'Frontend Engineer', description: 'You will build interfaces with React and TypeScript, shipping weekly.' }),
  job({ id: 'j-python-declared', title: 'Data Analyst', preferredSkills: ['Python', 'SQL'] }),
  job({ id: 'j-java-old', title: 'Java Engineer', preferredSkills: ['Java'], createdAt: old }),
  /* Positive score with NO overlap: remote and posted this week. */
  job({ id: 'j-remote-recent-no-overlap', title: 'Operations Associate', workMode: 'remote', createdAt: recent, description: 'Coordinate vendors and schedules.' }),
  job({ id: 'j-unrelated', title: 'Warehouse Supervisor', description: 'Forklift certification required.' }),
  /* A DRAFT with perfect skills — must never be counted. */
  job({ id: 'j-draft-perfect', title: 'Node.js Developer', status: 'draft', preferredSkills: ['Node.js', 'React', 'MongoDB'] }),
  job({ id: 'j-closed-perfect', title: 'React Developer', status: 'closed', preferredSkills: ['React'] }),
];
const PUBLISHED = CORPUS.filter((j) => j.status === 'published');
const FEATURES: Map<string, RecFeatures> = new Map(CORPUS.map((j) => [String(j.id), deriveRecFeatures(j.description)]));

const PROFILES: Array<[string, string[]]> = [
  ['backend', ['Node.js', 'MongoDB', 'React']],
  ['data', ['Python']],
  ['react only (text-only match)', ['React']],
  ['java', ['Java']],
  ['nonsense', ['zzqx-not-a-skill']],
  ['empty', []],
];

/* The chain the homepage tile runs, verbatim. */
const homeTotal = (skills: string[]) => {
  const profile = buildRecProfile({ skills });
  return recommendedSet(scoreRecommendations({ profile, showMatch: hasProfileSignals(profile), jobs: PUBLISHED, now: NOW })).total;
};

/* ═══ 1. Same engine as the homepage ═════════════════════════════════════ */
console.log('── 1. Same engine as the homepage ──');
for (const [label, skills] of PROFILES) {
  const home = homeTotal(skills);
  check(`${label}: count without features equals the homepage total (${home})`,
    countOnboardingMatches(CORPUS, { skills }, NOW, null) === home);
  check(`${label}: count with derived features equals it too`,
    countOnboardingMatches(CORPUS, { skills }, NOW, FEATURES) === home);
}
check('the fixture discriminates: a published job scores above zero without being recommended',
  PUBLISHED.some((j) => {
    const m = recommendMatch(buildRecProfile({ skills: ['Node.js'] }), toRecJob(j), NOW);
    return m.score > 0 && !isRecommended(m);
  }));
check('the fixture discriminates: a text-only skill match exists (features path is exercised)',
  countOnboardingMatches(CORPUS, { skills: ['React'] }, NOW, null) >= 1 && FEATURES.get('j-react-in-text')!.skills.length > 0);
check('a text-only match is found with and without features',
  isRecommended(recommendMatch(buildRecProfile({ skills: ['React'] }), toRecJob(CORPUS[1], null), NOW))
  && isRecommended(recommendMatch(buildRecProfile({ skills: ['React'] }), toRecJob(CORPUS[1], FEATURES), NOW)));
check('the profile is built from skills only — the one onboarding answer the scorer reads',
  onboardingRecProfile({ skills: ['Node.js'], roles: ['software'], customRoles: ['Wizard'] }).roleTokens.length === 0
  && onboardingRecProfile({ skills: ['Node.js'] }).skills.join() === 'node.js');
check('roles alone carry no signal, exactly as the homepage treats them',
  !hasProfileSignals(onboardingRecProfile({ roles: ['software'], customRoles: ['Wizard'] })));

/* ═══ 2. Nothing fake, nothing unpublished ═══════════════════════════════ */
console.log('── 2. Nothing fake, nothing unpublished ──');
check('the fixture discriminates: a draft with perfect skills exists',
  CORPUS.some((j) => j.status === 'draft' && (j.preferredSkills as string[]).includes('Node.js')));
check('a draft is not counted even with perfect skills',
  countOnboardingMatches(CORPUS, { skills: ['Node.js'] }, NOW, null) === countOnboardingMatches(PUBLISHED, { skills: ['Node.js'] }, NOW, null));
check('a closed posting is not counted either',
  countOnboardingMatches(CORPUS, { skills: ['React'] }, NOW, null) === 1);
check('an injected extra published match raises the count by exactly one — nothing else is counted',
  countOnboardingMatches([...CORPUS, job({ id: 'j-extra', title: 'Node Engineer', preferredSkills: ['Node.js'] })], { skills: ['Node.js'] }, NOW, null)
    === countOnboardingMatches(CORPUS, { skills: ['Node.js'] }, NOW, null) + 1);
check('an empty corpus counts zero', countOnboardingMatches([], { skills: ['Node.js'] }, NOW, null) === 0);
check('no skills counts zero without looking at the corpus',
  countOnboardingMatches(CORPUS, { skills: [] }, NOW, null) === 0 && countOnboardingMatches(CORPUS, {}, NOW, null) === 0);

/* ═══ 3. No cross-candidate leak; invalidation ═══════════════════════════ */
console.log('── 3. Memo: keyed by skills and corpus version ──');
check('spelling, order and repeats do not make a new key',
  matchCountKey('v1', { skills: ['Node.js', 'React', 'react'] }) === matchCountKey('v1', { skills: [' REACT', 'node.js'] }));
check('a different skill set is a different key',
  matchCountKey('v1', { skills: ['React'] }) !== matchCountKey('v1', { skills: ['React', 'Node.js'] }));
check('a different corpus version is a different key',
  matchCountKey('v1', { skills: ['React'] }) !== matchCountKey('v2', { skills: ['React'] }));
check('roles do not change the key — the engine does not read them (update this when it does)',
  matchCountKey('v1', { skills: ['React'], roles: ['software'] }) === matchCountKey('v1', { skills: ['React'], roles: ['design'] }));
check('the key carries the version in clear and the skills only as a digest',
  matchCountKey('12659:2026-09-16', { skills: ['React'] }).startsWith('12659:2026-09-16:')
  && !matchCountKey('v', { skills: ['React'] }).includes('react'));
check('canonical skills are lower-cased, trimmed, unique and sorted',
  canonicalSkills({ skills: [' Zed', 'alpha', 'ALPHA', ''] }).join(',') === 'alpha,zed');

async function memoBehaviour() {
  clearOnboardingMatchCounts();
  let computed = 0;
  const compute = (n: number) => async () => { computed += 1; return n; };
  const a = matchCountKey('v1', { skills: ['Node.js'] });
  const b = matchCountKey('v1', { skills: ['Python'] });
  const t0 = 1_000_000;
  check('first call computes', await memoizedMatchCount(a, compute(7), t0) === 7 && computed === 1);
  check('same skills inside the window are served from the memo', await memoizedMatchCount(a, compute(99), t0 + 30_000) === 7 && computed === 1);
  check('candidate B with different skills gets B\'s own number, not A\'s',
    await memoizedMatchCount(b, compute(3), t0 + 30_000) === 3 && computed === 2);
  check('A\'s entry is untouched by B', await memoizedMatchCount(a, compute(99), t0 + 31_000) === 7 && computed === 2);
  check('past the window the count is recomputed', await memoizedMatchCount(a, compute(8), t0 + 61_000) === 8 && computed === 3);
  check('a new corpus version is a miss', await memoizedMatchCount(matchCountKey('v2', { skills: ['Node.js'] }), compute(9), t0 + 61_000) === 9 && computed === 4);
  invalidateRecommendationCaches();
  check('a job write clears the memo (registered with the recommendation caches)',
    onboardingMatchCountState().size === 0 && await memoizedMatchCount(a, compute(10), t0 + 62_000) === 10 && computed === 5);
  /* Single-flight: concurrent identical requests share one computation. */
  clearOnboardingMatchCounts(); computed = 0;
  const slow = async () => { computed += 1; await new Promise((r) => setTimeout(r, 20)); return 5; };
  const both = await Promise.all([memoizedMatchCount(a, slow, t0), memoizedMatchCount(a, slow, t0)]);
  check('concurrent callers on one key share a single computation', both.join() === '5,5' && computed === 1);
  clearOnboardingMatchCounts();
}

/* ═══ 4. Bucket and count-up ════════════════════════════════════════════ */
console.log('── 4. Bucket never above the count; count-up never above the bucket ──');
for (const [actual, want] of [[109, 105], [105, 105], [104, 100], [87, 85], [51, 50], [25, 25], [24, 20], [7, 5], [6, 5], [5, 5], [4, 0], [3, 0], [1, 0], [0, 0], [-3, 0], [NaN, 0], [1464, 1460]] as Array<[number, number]>) {
  check(`bucket(${actual}) = ${want}`, matchBucket(actual) === want);
}
for (let n = 0; n <= 1000; n += 1) {
  const b = matchBucket(n);
  if (!(b <= n && b % 5 === 0 && n - b < 5)) { check(`bucket(${n}) is the greatest multiple of five not above it`, false); break; }
}
check('bucket property held for 0..1000', true);
check('the copy shows the bucket', formatRecommendedJobCount(109) === '105+' && formatRecommendedJobCount(1464) === '1,460+');
for (const b of [0, 5, 105, 1460]) {
  const steps = countUpSteps(b);
  check(`count-up to ${b}: starts at 0, ends at the bucket, climbs in fives, never above`,
    steps[0] === 0 && steps[steps.length - 1] === b && steps.every((v, i) => v % 5 === 0 && v <= b && (i === 0 || v === steps[i - 1] + 5)));
}
check('a raw count is bucketed before the climb is built', countUpSteps(109).at(-1) === 105);

/* ═══ 5. The route: pre-auth, coerced, limited, honest ══════════════════ */
console.log('── 5. Route ──');
const ROUTE = src('app/api/onboarding/job-matches/count/route.ts');
const ROUTE_CODE = strip(ROUTE);
check('no session is read', !/getAuthSession|resolveSessionUserId|getServerSession/.test(ROUTE_CODE));
check('nothing user-scoped is read', !/getProfileFields|getHiringApplications|userId/.test(ROUTE_CODE));
check('the answers pass through the shared coercer', /coerceOnboarding\(\(body as \{ onboarding\?: unknown \}\)\.onboarding\)/.test(ROUTE_CODE));
check('the shared limiter runs first, per address, on its own policy',
  ROUTE_CODE.indexOf('enforceRateLimits(') < ROUTE_CODE.indexOf('req.json()') && /RATE_POLICIES\.onboardingMatchCountIp/.test(ROUTE_CODE));
check('the policy exists', /onboardingMatchCountIp:\s*\{ limit: \d+, windowMs: \d+ \* MIN \}/.test(src('lib/server/security/rate-limit.ts')));
check('the corpus comes from the published accessor and nothing else',
  /getPublishedHiringJobs\(\)/.test(ROUTE_CODE) && !/getHiringJobsCached|selectAllJobDocs|getHiringJobs\(|find\(/.test(ROUTE_CODE));
check('the corpus read is not swallowed into an empty list', !/getPublishedHiringJobs\(\)\s*\.catch/.test(ROUTE_CODE));
check('features are the shared per-version set', /recFeaturesFor\(versionKey, jobs/.test(ROUTE_CODE));
check('the count is the shared module\'s, behind the memo',
  /memoizedMatchCount\(matchCountKey\(versionKey, answers\)/.test(ROUTE_CODE) && /countOnboardingMatches\(jobs/.test(ROUTE_CODE));
check('the response is the count and its bucket', /\{ total, bucket: matchBucket\(total\) \}/.test(ROUTE_CODE));
check('and is never stored by a shared cache', /'Cache-Control': 'no-store'/.test(ROUTE_CODE));
check('an unparsable or non-object body is refused with 400, before any count',
  /status: 400/.test(ROUTE_CODE) && ROUTE_CODE.indexOf('status: 400') < ROUTE_CODE.indexOf('coerceOnboarding(')
  && !/req\.json\(\)\.catch\(\(\) => \(\{\}\)\)/.test(ROUTE_CODE));
/* The OUTER catch — the inner one only turns unparsable JSON into a 400. */
const catchBlock = ROUTE_CODE.slice(ROUTE_CODE.lastIndexOf('} catch'));
check('a failure is a 503', /status: 503/.test(catchBlock));
check('and carries no total, so a broken read cannot render as "no matches"', !/total/.test(catchBlock));
check('the recommendations API is not called or imported', !/api\/recommendations|recommendations\/jobs\/route/.test(ROUTE_CODE));

/* ═══ 6. The client: skills sent, error is error, every frame true ══════ */
console.log('── 6. Client ──');
const LIB = strip(src('lib/onboarding-jobs.ts'));
check('the client posts the answers to the count route', /\/api\/onboarding\/job-matches\/count/.test(LIB) && /method: 'POST'/.test(LIB));
check('no corpus is fetched into the browser', !/\/api\/jobs\/public|\/api\/public\/hiring\/jobs|\/api\/recommendations/.test(LIB));
check('a non-OK response throws', /throw new Error\(`Job matches responded/.test(LIB));
check('a malformed count throws', /throw new Error\('Job matches returned no count'\)/.test(LIB));
check('the bucket shown is recomputed from the count, not trusted from the wire', /return \{ total, bucket: matchBucket\(total\) \}/.test(LIB));
const COUNTER = strip(src('components/onboarding/MatchCounter.tsx'));
check('the counter only ever renders elements of the count-up', /setShown\(steps\[index\]\)/.test(COUNTER) && /setShown\(last\)/.test(COUNTER) && !/setShown\(Math/.test(COUNTER));
check('it starts at zero', /useState\(0\)/.test(COUNTER) && /setShown\(0\);/.test(COUNTER));
check('the frame loop is cancelled on unmount', /cancelAnimationFrame\(frame\.current\)/.test(COUNTER));
check('reduced motion skips the climb', /prefers-reduced-motion: reduce/.test(COUNTER));
const STEP = src('components/onboarding/JobPreviewStep.tsx');
check('the card is captioned as matches, not open roles', /Job matches/.test(STEP) && !/>Open roles</.test(STEP));
check('the card is hidden on error — an error is not a number', /status !== 'error' && \(/.test(STEP));
check('under five, the copy does not print "0+"', /A few jobs match your skills/.test(STEP));
check('still no job list', !/<ul/.test(STEP));

/* ═══ 7. The engine itself is unchanged ═════════════════════════════════ */
console.log('── 7. Engine guard ──');
const ENGINE = strip(src('lib/server/job-recommend.ts'));
check('isRecommended is still overlap', /function isRecommended\(match: RecMatch\): boolean \{\s*return match\.overlap;\s*\}/.test(ENGINE));
const HOME = strip(src('app/api/recommendations/jobs/route.ts'));
check('the homepage total is still the recommended set', /const \{ recommended, total \} = recommendedSet\(scored\);/.test(HOME));
check('the personalized feed still excludes applied jobs', /appliedJobIds: new Set\(applications\.map/.test(HOME));

memoBehaviour().then(() => {
  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
  if (failed > 0) { console.error('FAILED'); process.exit(1); }
}).catch((error) => { console.error('\n❌', error instanceof Error ? error.message : error); process.exit(1); });
