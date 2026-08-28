/**
 * Ranking parity test — precomputed metadata vs the full-document algorithm.
 *
 * Question: can recommendation ranking read a small precomputed representation
 * instead of the ~2.4 MB of description text, and still produce IDENTICAL
 * matchScore, matchReasons and ordering?
 *
 * The candidate representation is the one Phase 4 proposes: per job, a
 * precomputed token set from `title + description` (lowercased, split on
 * non-alphanumerics, deduplicated) plus a description LENGTH — everything the
 * scorer touches, without the prose.
 *
 * This runs both algorithms over EVERY published job against REAL profile skill
 * sets taken from the live user_profiles collection, because the viewer's own
 * skills are the input that decides whether the two agree.
 *
 * Run:  npm run test:ranking-parity
 */
import { MongoClient } from 'mongodb';
import { buildRecProfile, recommendMatch, type RecJob } from '@/lib/server/job-recommend';

const NOW = 1756339200000;   // fixed clock — recency must not vary between runs

/** The precomputed representation under test. */
function buildTokens(title: string, description: string): Set<string> {
  return new Set(
    `${title} ${description}`.toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean),
  );
}

/** A stand-in text that a token-based representation could reconstruct. */
function standIn(tokens: Set<string>, length: number): string {
  const joined = Array.from(tokens).join(' ');
  return joined.length >= length ? joined : joined + ' '.repeat(length - joined.length);
}

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!, {
    serverSelectionTimeoutMS: 60000, socketTimeoutMS: 900000,
  });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'docrud');

  const jobs = await db.collection('hiring_jobs').find({ status: 'published' }).toArray() as never as Array<Record<string, any>>;

  /* Real skill sets — the actual inputs users bring. */
  const profiles = (await db.collection('user_profiles')
    .find({ skills: { $exists: true, $ne: [] } }, { projection: { _id: 0, skills: 1, headline: 1, location: 1 } })
    .limit(40).toArray()) as never as Array<Record<string, any>>;

  console.log(`  ${jobs.length} published jobs × ${profiles.length} real profiles = ${jobs.length * profiles.length} comparisons\n`);

  const toRec = (j: Record<string, any>, description: string): RecJob => ({
    id: String(j.id ?? ''), title: String(j.title ?? ''),
    organizationName: String(j.organizationName ?? ''), location: String(j.location ?? ''),
    employmentType: String(j.employmentType ?? ''), workMode: String(j.workMode ?? ''),
    experienceLevel: String(j.experienceLevel ?? ''), description,
    preferredSkills: j.preferredSkills ?? [], targetRoleKeywords: j.targetRoleKeywords ?? [],
    createdAt: String(j.createdAt ?? ''),
  });

  const precomputed = jobs.map((j) => {
    const description = String(j.description ?? '');
    return { job: j, tokens: buildTokens(String(j.title ?? ''), description), length: description.length };
  });

  let scoreDiff = 0, reasonDiff = 0, orderDiff = 0, comparisons = 0;
  const examples: string[] = [];

  for (const p of profiles) {
    const profile = buildRecProfile({
      headline: p.headline ?? '', skills: p.skills ?? [], location: p.location ?? '',
      experience: [], interests: [],
    } as never);

    const oldRanked: Array<{ id: string; score: number }> = [];
    const newRanked: Array<{ id: string; score: number }> = [];

    for (const { job, tokens, length } of precomputed) {
      comparisons += 1;
      const oldMatch = recommendMatch(profile, toRec(job, String(job.description ?? '')), NOW);
      const newMatch = recommendMatch(profile, toRec(job, standIn(tokens, length)), NOW);

      if (oldMatch.score !== newMatch.score) scoreDiff += 1;
      if (JSON.stringify(oldMatch.reasons) !== JSON.stringify(newMatch.reasons)) {
        reasonDiff += 1;
        if (examples.length < 4) {
          const culprit = (profile.skills ?? []).find((s: string) =>
            `${String(job.title ?? '')} ${String(job.description ?? '')}`.toLowerCase().includes(s)
            && !standIn(tokens, length).includes(s));
          examples.push(`    job ${String(job.id).slice(0, 20)}… skill "${culprit ?? '?'}"\n`
            + `      full-document: ${JSON.stringify(oldMatch.reasons)}\n`
            + `      precomputed  : ${JSON.stringify(newMatch.reasons)}`);
        }
      }
      oldRanked.push({ id: String(job.id), score: oldMatch.score });
      newRanked.push({ id: String(job.id), score: newMatch.score });
    }

    const sort = (a: Array<{ id: string; score: number }>) =>
      [...a].sort((x, y) => y.score - x.score || x.id.localeCompare(y.id)).map((x) => x.id);
    if (JSON.stringify(sort(oldRanked)) !== JSON.stringify(sort(newRanked))) orderDiff += 1;
  }

  console.log(`  comparisons          : ${comparisons}`);
  console.log(`  matchScore mismatches: ${scoreDiff}`);
  console.log(`  matchReasons "       : ${reasonDiff}`);
  console.log(`  ranking-order "      : ${orderDiff} / ${profiles.length} profiles`);
  if (examples.length) {
    console.log('\n  why they diverge (multi-word / cross-token skills):');
    examples.forEach((e) => console.log(e));
  }

  const parity = scoreDiff === 0 && reasonDiff === 0 && orderDiff === 0;
  console.log(`\n  EXACT PARITY: ${parity ? 'YES — safe to switch ranking' : 'NO — do NOT switch ranking'}`);
  await client.close();
  process.exit(parity ? 0 : 2);
}
main().catch((e) => { console.error(String(e).split('\n')[0]); process.exit(1); });
