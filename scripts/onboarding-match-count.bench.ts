/**
 * Benchmark: the onboarding job-match count against the REAL corpus.
 *
 * Run: npm run bench:onboarding-match-count   (needs MONGODB_URI; skips otherwise)
 *
 * READ-ONLY. Loads the app's env, reads the published corpus through the same
 * accessor the route uses, and measures what one request costs:
 *
 *   cold   — the corpus read + the per-version feature derivation, paid once
 *            per process (and again when the corpus changes). Wherever this
 *            runs, that read is bounded by the link to Atlas, so the number is
 *            about the machine it ran on as much as about the code.
 *   warm   — one ranking pass per distinct answer set (memo miss), and the
 *            memo hit that every repeat inside a minute gets.
 *
 * Also prints, for one profile, the homepage's own path (scoreRecommendations,
 * scanning descriptions inline) so the two can be compared on the same
 * corpus — and asserts they agree, because they must.
 *
 * Totals and buckets printed are the engine's real answers for the profiles
 * listed. Nothing is estimated.
 */
import { loadAppEnv } from './load-env';
loadAppEnv(process.cwd());

const ms = (t: number) => `${(performance.now() - t).toFixed(0).padStart(6)} ms`;

(async () => {
  if (!process.env.MONGODB_URI) {
    console.log('no MongoDB configured — bench SKIPPED (not run)');
    process.exit(0);
  }
  const { getPublishedHiringJobs } = await import('@/lib/server/hiring');
  const { readHiringCorpusVersion } = await import('@/lib/server/db/hiring-jobs-collection');
  const { corpusVersionKey } = await import('@/lib/server/recommendation-refresh');
  const { recFeaturesFor } = await import('@/lib/server/recommendation-features');
  const { buildRecProfile, hasProfileSignals } = await import('@/lib/server/job-recommend');
  const { recommendedSet, scoreRecommendations } = await import('@/lib/server/recommendation-compute');
  const M = await import('@/lib/server/onboarding-match-count');

  console.log('REAL CORPUS — read-only. Host: ' + (process.env.MONGODB_URI.match(/@([^/?]+)/)?.[1] ?? 'unknown'));

  let t = performance.now();
  const jobs = await getPublishedHiringJobs() as unknown as Array<Record<string, unknown>>;
  console.log(`cold: corpus read           ${ms(t)}   published=${jobs.length}`);
  t = performance.now();
  const version = corpusVersionKey(await readHiringCorpusVersion().catch(() => null));
  console.log(`      version probe         ${ms(t)}   version=${version}`);
  t = performance.now();
  const features = await recFeaturesFor(version, jobs);
  console.log(`      features derive       ${ms(t)}   entries=${features?.size ?? 'null (inline scan fallback)'}`);
  t = performance.now();
  await getPublishedHiringJobs();
  console.log(`warm: corpus read           ${ms(t)}`);

  const PROFILES: Array<[string, string[]]> = [
    ['backend  node/express/mongodb/react/docker', ['Node.js', 'Express', 'MongoDB', 'React', 'Docker']],
    ['data     python/sql/pandas/excel', ['Python', 'SQL', 'Pandas', 'Excel']],
    ['design   figma/ui-ux/adobe xd', ['Figma', 'UI/UX', 'Adobe XD']],
    ['single   java', ['Java']],
    ['nonsense zzqx-not-a-skill', ['zzqx-not-a-skill']],
    ['empty    (no answers)', []],
  ];
  const now = Date.now();
  console.log('\nprofile                                    |  total  bucket | memo miss (count pass) | memo hit');
  for (const [label, skills] of PROFILES) {
    const answers = { skills };
    const key = M.matchCountKey(version, answers);
    M.clearOnboardingMatchCounts();
    const a = performance.now();
    const total = await M.memoizedMatchCount(key, async () => M.countOnboardingMatches(jobs, answers, now, features));
    const miss = performance.now() - a;
    const b = performance.now();
    const again = await M.memoizedMatchCount(key, async () => -1);
    const hit = performance.now() - b;
    console.log(`${label.padEnd(42)} | ${String(total).padStart(6)}  ${(String(M.matchBucket(total)) + '+').padStart(6)} | ${miss.toFixed(0).padStart(8)} ms             | ${hit.toFixed(2).padStart(6)} ms${again === total ? '' : '  (MEMO MISMATCH)'}`);
  }

  /* The homepage's own path on the same corpus, for one profile: the number
     must agree, and the cost is the reason the count uses the features path. */
  const skills = PROFILES[0][1];
  const profile = buildRecProfile({ skills });
  t = performance.now();
  const home = recommendedSet(scoreRecommendations({ profile, showMatch: hasProfileSignals(profile), jobs, now })).total;
  const homeMs = performance.now() - t;
  const ours = M.countOnboardingMatches(jobs, { skills }, now, features);
  console.log(`\nhomepage path (scoreRecommendations, inline scan) for "${PROFILES[0][0].trim()}": total=${home} in ${homeMs.toFixed(0)} ms — onboarding count=${ours} ${home === ours ? 'AGREES' : '*** DISAGREES ***'}`);
  process.exit(home === ours ? 0 : 1);
})().catch((error) => { console.error('BENCH FAILED', error instanceof Error ? error.message : error); process.exit(1); });
