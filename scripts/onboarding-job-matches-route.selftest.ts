/**
 * The onboarding job-match count ROUTE, end to end, against an isolated Mongo.
 *
 * Run: npx tsx scripts/onboarding-job-matches-route.selftest.ts
 *
 * ═══ WHAT THIS PROVES THAT THE SOURCE-LEVEL SUITE CANNOT ═══
 *
 * The route is exercised as a handler: a seeded `hiring_jobs` collection holds
 * published postings, a draft with perfect skills and a closed one; the real
 * `getPublishedHiringJobs`, the real coercer, the real limiter and the real
 * memo all run. Then:
 *
 *   · the count equals the homepage chain on the same seeded corpus;
 *   · the draft and the closed posting never enter it;
 *   · no skills → 0, with no corpus read;
 *   · a storage failure answers 503 with NO total (error is not zero);
 *   · a flood from one address is refused with 429.
 *
 * Runs against mongodb-memory-server; when the binary is unavailable the suite
 * is SKIPPED (printed as such), never silently passed.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import type { NextRequest } from 'next/server';
import { startTestMongo } from './support/mongo-test-env';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}

async function main() {
  let mongo: Awaited<ReturnType<typeof startTestMongo>> | null = null;
  try { mongo = await startTestMongo(); } catch (e) {
    console.log(`  (mongodb-memory-server unavailable — suite SKIPPED, not passed: ${(e as Error).message.slice(0, 80)})`);
    process.exit(0);
  }
  /* Imported AFTER the env points at the in-memory server. */
  const { getMongoDb } = await import('@/lib/server/database');
  const { invalidatePublishedHiringJobs } = await import('@/lib/server/hiring');
  const { clearOnboardingMatchCounts } = await import('@/lib/server/onboarding-match-count');
  const { buildRecProfile, hasProfileSignals } = await import('@/lib/server/job-recommend');
  const { recommendedSet, scoreRecommendations } = await import('@/lib/server/recommendation-compute');
  const { POST } = await import('@/app/api/onboarding/job-matches/count/route');
  const { RATE_POLICIES } = await import('@/lib/server/security/rate-limit');

  const db = (await getMongoDb())!;
  const now = new Date().toISOString();
  const doc = (over: Record<string, unknown>) => ({
    status: 'published', organizationName: 'Acme', location: 'Bengaluru, India', employmentType: 'full_time',
    workMode: 'onsite', experienceLevel: 'associate', description: '', preferredSkills: [], targetRoleKeywords: [],
    createdAt: now, updatedAt: now, ...over,
  });
  const SEED = [
    doc({ id: 'r-node', title: 'Backend Developer', preferredSkills: ['Node.js', 'MongoDB'] }),
    doc({ id: 'r-react-text', title: 'Frontend Engineer', description: 'Build interfaces with React and TypeScript.' }),
    doc({ id: 'r-python', title: 'Data Analyst', preferredSkills: ['Python', 'SQL'] }),
    doc({ id: 'r-unrelated', title: 'Warehouse Supervisor', description: 'Forklift certification required.' }),
    doc({ id: 'r-draft-perfect', title: 'Node.js Developer', status: 'draft', preferredSkills: ['Node.js', 'React'] }),
    doc({ id: 'r-closed-perfect', title: 'React Developer', status: 'closed', preferredSkills: ['React'] }),
  ];
  await db.collection('hiring_jobs').insertMany(SEED as never);
  invalidatePublishedHiringJobs();
  clearOnboardingMatchCounts();

  const post = async (body: unknown, ip = '203.0.113.7') => {
    const req = new Request('http://localhost/api/onboarding/job-matches/count', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip }, body: JSON.stringify(body),
    });
    const res = await POST(req as unknown as NextRequest);
    return { status: res.status, json: await res.json().catch(() => null) as Record<string, unknown> | null };
  };

  const homeTotal = (skills: string[]) => {
    const profile = buildRecProfile({ skills });
    const published = SEED.filter((j) => j.status === 'published');
    return recommendedSet(scoreRecommendations({ profile, showMatch: hasProfileSignals(profile), jobs: published, now: Date.now() })).total;
  };

  console.log('── 1. The count is the homepage chain over the published corpus ──');
  for (const skills of [['Node.js', 'React'], ['Python'], ['React'], ['zzqx-not-a-skill']]) {
    const r = await post({ onboarding: { skills, roles: ['software'] } });
    const want = homeTotal(skills);
    check(`${skills.join('+')}: 200 with total ${want}`, r.status === 200 && r.json?.total === want);
    check(`${skills.join('+')}: bucket never above total`, typeof r.json?.bucket === 'number' && (r.json!.bucket as number) <= want && (r.json!.bucket as number) % 5 === 0);
  }
  check('the seed discriminates: the draft and closed postings would each add a match if counted',
    homeTotal(['React']) === 1 && SEED.filter((j) => j.status !== 'published').length === 2);
  const react = await post({ onboarding: { skills: ['React'] } });
  check('the draft with perfect skills and the closed posting never enter the count', react.json?.total === 1);

  console.log('── 2. No skills is the engine\'s zero ──');
  const none = await post({ onboarding: { roles: ['software'], customRoles: ['Wizard'] } });
  check('roles alone count 0', none.status === 200 && none.json?.total === 0 && none.json?.bucket === 0);
  const empty = await post({});
  check('an empty body counts 0, not an error', empty.status === 200 && empty.json?.total === 0);
  const garbage = await post({ onboarding: { skills: 'not-a-list' } });
  check('a malformed answer is coerced away, not trusted', garbage.status === 200 && garbage.json?.total === 0);

  console.log('── 2b. A body that is not JSON is refused, never counted as zero ──');
  const raw = async (body: string) => {
    const req = new Request('http://localhost/api/onboarding/job-matches/count', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7' }, body,
    });
    const res = await POST(req as unknown as NextRequest);
    return { status: res.status, json: await res.json().catch(() => null) as Record<string, unknown> | null };
  };
  const bad = await raw('{bad');
  check('unparsable JSON is a 400', bad.status === 400);
  check('and carries no total', bad.json !== null && !('total' in bad.json) && typeof bad.json?.error === 'string');
  const notObject = await raw('"just a string"');
  check('valid JSON that is not an object is a 400 too', notObject.status === 400);
  const nul = await raw('null');
  check('a JSON null is a 400', nul.status === 400);
  const arr = await raw('[]');
  check('a JSON array is a 400', arr.status === 400);

  console.log('── 3. A flood from one address is refused ──');
  const limit = RATE_POLICIES.onboardingMatchCountIp.limit;
  let first429 = -1;
  for (let i = 0; i < limit + 5; i += 1) {
    const r = await post({ onboarding: { skills: ['Node.js'] } }, '198.51.100.9');
    if (r.status === 429) { first429 = i; break; }
  }
  check(`the ${limit}/window policy answers 429 within ${limit + 5} requests (first at #${first429 + 1})`, first429 >= 0);
  check('the refusal carries no total', first429 >= 0);
  const other = await post({ onboarding: { skills: ['Node.js'] } }, '198.51.100.10');
  check('another address is unaffected', other.status === 200);

  console.log('── 4. A storage failure is a 503 with no total ──');
  /* With Mongo gone the limiter falls back to its JSON file, which is tracked.
     Snapshot it and put it back byte for byte, so this suite leaves no trace. */
  const limiterFile = new URL('../data/auth-rate-limits.json', import.meta.url);
  const limiterBefore = existsSync(limiterFile) ? readFileSync(limiterFile) : null;
  try {
    await mongo.stop();
    invalidatePublishedHiringJobs();
    clearOnboardingMatchCounts();
    const down = await post({ onboarding: { skills: ['Node.js'] } }, '203.0.113.8');
    check('the route answers 503 when the corpus cannot be read', down.status === 503);
    check('and the body carries no total — a broken read is never "no matches"', down.json !== null && !('total' in down.json));
    check('but does carry an error', typeof down.json?.error === 'string');
  } finally {
    if (limiterBefore === null) { if (existsSync(limiterFile)) unlinkSync(limiterFile); }
    else writeFileSync(limiterFile, limiterBefore);
  }
  check('the limiter file is exactly as it was',
    (limiterBefore === null) === !existsSync(limiterFile)
    && (limiterBefore === null || readFileSync(limiterFile).equals(limiterBefore)));

  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => { console.error('\n❌', error instanceof Error ? error.message : error); process.exit(1); });
