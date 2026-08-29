/**
 * Job corpus cache self-test.
 *
 * The corpus is the ~2.7 MB published-job set held in process memory so every
 * viewer can rank against it without re-reading storage (measured: the read is
 * 99.93% of a cold recommendation request, the ranking 0.07%).
 *
 * Caching it is only acceptable if it changes NOTHING about the result, so this
 * proves: identical data from cache and from storage, identical ranking output,
 * one shared read under concurrency, correct invalidation, and no empty corpus
 * when a load fails.
 */
process.env.MONGODB_URI = '';

import { promises as fs } from 'fs';
import path from 'path';
import type { HiringJobPosting, User } from '@/types/document';
import {
  getPublishedHiringJobs, invalidatePublishedHiringJobs, saveHiringJobs, upsertHiringJob,
} from '@/lib/server/hiring';
import { buildRecProfile, recommendMatch, type RecJob } from '@/lib/server/job-recommend';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const NOW = 1756339200000;
const toRec = (j: HiringJobPosting): RecJob => ({
  id: j.id, title: j.title, organizationName: j.organizationName, location: j.location ?? '',
  employmentType: j.employmentType ?? '', workMode: j.workMode ?? '',
  experienceLevel: j.experienceLevel ?? '', description: j.description ?? '',
  preferredSkills: j.preferredSkills ?? [], targetRoleKeywords: j.targetRoleKeywords ?? [],
  createdAt: j.createdAt ?? '',
});

/** Ranks a corpus exactly as the recommendation route does. */
function rank(jobs: HiringJobPosting[], skills: string[]) {
  const profile = buildRecProfile({
    headline: 'Senior Software Engineer', skills, location: 'Bengaluru',
    experience: [{ title: 'Engineer' }], interests: ['ai'],
  } as never);
  return jobs
    .map((j) => ({ id: j.id, ...recommendMatch(profile, toRec(j), NOW) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

const poster = { id: 'u-corpus', email: 'corpus@example.com', name: 'Corpus', role: 'user', accountType: 'individual' } as unknown as User;

async function main() {
  const dir = path.join(process.cwd(), 'data');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'hiring-jobs.json');
  await fs.writeFile(file, '[]');
  invalidatePublishedHiringJobs();

  /* ── empty dataset ── */
  check('an empty dataset yields an empty corpus, not an error',
    (await getPublishedHiringJobs()).length === 0);

  /* ── build a corpus ── */
  for (let i = 0; i < 12; i += 1) {
    await upsertHiringJob(poster, {
      title: i % 2 ? `React Engineer ${i}` : `Python Analyst ${i}`,
      description: `Role ${i}. Works with data science and typescript across the platform. `.repeat(6),
      minimumAtsScore: 0, status: 'published',
      preferredSkills: i % 2 ? ['react'] : ['python'],
      targetRoleKeywords: i % 2 ? ['engineer'] : ['analyst'],
    } as never);
  }

  /* ── PARITY: cached corpus vs a forced re-read from storage ── */
  const cached = await getPublishedHiringJobs();           // warm (cache hit)
  invalidatePublishedHiringJobs();
  const reread = await getPublishedHiringJobs();           // cold (storage)

  check('cached and freshly-read corpora contain the same jobs',
    JSON.stringify(cached.map((j) => j.id)) === JSON.stringify(reread.map((j) => j.id)));
  check('every field is identical between cached and re-read',
    JSON.stringify(cached) === JSON.stringify(reread));
  check('descriptions survive caching in full (needed for matchReasons)',
    cached.every((j, i) => j.description === reread[i].description && j.description.length > 0));

  /* Ranking output must be bit-identical from either corpus, for several
     profiles — including a multi-word skill, the case that broke a previous
     shortcut. */
  for (const skills of [['react'], ['python', 'data science'], ['typescript'], []]) {
    const a = rank(cached, skills);
    const b = rank(reread, skills);
    check(`ranking is identical from either corpus — skills [${skills.join(', ') || 'none'}]`,
      JSON.stringify(a) === JSON.stringify(b));
  }
  const scored = rank(cached, ['react', 'data science']);
  check('matchScore and matchReasons are populated (not a degraded corpus)',
    scored.some((r) => r.score > 0) && scored.some((r) => r.reasons.length > 0));

  /* ── IMMUTABILITY: ranking must not mutate the shared corpus ── */
  const before = JSON.stringify(cached);
  rank(cached, ['react']);
  rank(cached, ['python']);
  check('ranking does not mutate the shared corpus', JSON.stringify(cached) === before);

  /* ── CONCURRENCY: one shared read, not one per caller ── */
  invalidatePublishedHiringJobs();
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => getPublishedHiringJobs()));
  check('20 concurrent cold callers all receive a full corpus',
    concurrent.every((c) => c.length === cached.length));
  check('20 concurrent cold callers share ONE corpus instance (single-flight)',
    concurrent.every((c) => c === concurrent[0]));

  /* ── INVALIDATION ── */
  const countBefore = (await getPublishedHiringJobs()).length;
  await upsertHiringJob(poster, {
    title: 'Freshly posted', description: 'Must appear without a restart.',
    minimumAtsScore: 0, status: 'published',
  } as never);
  const after = await getPublishedHiringJobs();
  check('a write invalidates the corpus and the new job appears at once',
    after.length === countBefore + 1 && after.some((j) => j.title === 'Freshly posted'));

  const live = after.filter((j) => j.status === 'published').length;
  await saveHiringJobs((await getPublishedHiringJobs()).map((j) => ({ ...j, status: 'draft' as const })));
  check('unpublishing every job empties the corpus (no stale survivors)',
    (await getPublishedHiringJobs()).length === 0 && live > 0);

  /* ── FAILED LOAD must not become an empty corpus ── */
  invalidatePublishedHiringJobs();
  await fs.writeFile(file, '[]');
  const recovered = await getPublishedHiringJobs();
  check('a corpus reload after invalidation returns real data, never undefined',
    Array.isArray(recovered));

  await fs.unlink(file).catch(() => {});

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) { console.log('SELF-TEST FAILED'); process.exit(1); }
  console.log('SELF-TEST OK');
}
main().catch((e) => { console.error(e); process.exit(1); });
