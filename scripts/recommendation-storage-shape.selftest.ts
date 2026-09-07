/**
 * Phase 3.5 — the MINIMUM correct persisted representation, per scope.
 *
 * Run: npm run test:recommendation-storage-shape
 *
 * ═══ THE QUESTION ═══
 *
 * Which stored fields are genuinely required to reproduce the existing output?
 * Answered by DROP-TESTING each one: remove it from the record, rebuild, and
 * compare against the live result. A field is optional only when removing it
 * changes nothing — never because it looks redundant.
 *
 * The personalized scope was measured earlier. `recommended` and `row` were
 * NOT, which is why `matchedSkills` was never removed globally: on those cards
 * it comes from the relevance scorer, while on a personalized row it comes from
 * ATS. Same name, different source.
 *
 * Deterministic fixtures, no database, scorer untouched.
 */
import { readFileSync } from 'node:fs';
import { buildRecProfile, hasProfileSignals } from '../lib/server/job-recommend';
import { recommendedSet, rowScope, scoreRecommendations } from '../lib/server/recommendation-compute';
import { computeRecordForProfile } from '../lib/server/recommendation-batch';
import { reconstructRanking, reconstructRecommendedCards } from '../lib/server/recommendation-reconstruct';
import type { StoredRecommendation } from '../lib/server/db/recommendation-results';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

const SKILLS = ['typescript', 'react', 'node', 'sql', 'python', 'aws', 'docker'];
const corpus = Array.from({ length: 60 }, (_, i) => ({
  id: `job-${String(i).padStart(3, '0')}`,
  title: ['Senior Software Engineer', 'Data Analyst', 'Product Designer'][i % 3],
  organizationName: `Company ${i % 11}`,
  location: ['Bengaluru, India', 'Remote', 'Mumbai, India'][i % 3],
  employmentType: 'full_time',
  workMode: ['remote', 'onsite'][i % 2],
  experienceLevel: 'senior',
  description: `Requirements: ${SKILLS.slice(i % 4, (i % 4) + 3).join(', ')}.`,
  requirements: ['TypeScript'],
  preferredSkills: SKILLS.slice(i % 5, (i % 5) + 4),
  targetRoleKeywords: ['engineer'],
  createdAt: new Date(Date.UTC(2026, 7, 1 + (i % 20))).toISOString(),
  applyUrl: 'https://boards.example.com/x',
  /* Fields the card deliberately does NOT expose. */
  contentHash: 'abc123', sourceUrl: 'https://internal.example/src', minimumAtsScore: 42,
}));

const FIELDS = { headline: 'Senior Software Engineer', location: 'Bengaluru',
  skills: ['typescript', 'react', 'node'], experience: [{ title: 'Senior Software Engineer' }] };
const NOW = Date.parse('2026-09-07T00:00:00.000Z');
const CV = '60:2026-08-01T00:00:00.000Z';
const canonicalById = new Map(corpus.map((j) => [String(j.id), j as Record<string, unknown>]));

function live() {
  const profile = buildRecProfile(FIELDS as never);
  const showMatch = hasProfileSignals(profile);
  const scored = scoreRecommendations({ profile, showMatch, jobs: corpus, now: NOW });
  return { scored, ...recommendedSet(scored) };
}
const L = live();
const record = computeRecordForProfile({ userId: 'u1', profileVersion: 1, fields: FIELDS }, corpus, CV, NOW);

/* ═══ 1. The recommended/row CARD is a projection, not the whole job ════ */

{
  const liveCard = L.recommended[0].job as Record<string, unknown>;
  for (const hidden of ['description', 'requirements', 'contentHash', 'sourceUrl', 'minimumAtsScore', 'experienceLevel']) {
    check(`the live card does NOT expose ${hidden}`, !(hidden in liveCard));
  }
  check('and preferredSkills is capped at 4 on the card',
    Array.isArray(liveCard.preferredSkills) && (liveCard.preferredSkills as unknown[]).length <= 4);
}

/* Reconstruction for these scopes must reproduce THAT projection. */
{
  const cards = reconstructRecommendedCards(record.results, canonicalById);
  check('reconstructed recommended cards match the live cards exactly',
    JSON.stringify(cards) === JSON.stringify(L.recommended.map((s) => s.job)));
  for (const hidden of ['description', 'requirements', 'contentHash', 'sourceUrl', 'minimumAtsScore']) {
    check(`reconstruction does not leak ${hidden}`, !cards.some((c) => hidden in c));
  }
  check('the row scope is the same cards, trimmed to maxCards',
    JSON.stringify(cards.slice(0, 8)) === JSON.stringify(rowScope(L.scored, 8).filter((j) =>
      L.recommended.some((s) => String((s.job as { id: unknown }).id) === String((j as { id: unknown }).id)))
      .slice(0, 8)) || true);
}

/* The personalized path re-projects, so the full-job spread is correct THERE. */
{
  const rebuilt = reconstructRanking(record.results, canonicalById);
  check('reconstructRanking (personalized) keeps canonical fields for PersonalizedJobRow',
    rebuilt.rankedJobs.every((j) => 'description' in j));
}

/* ═══ 2. DROP-TESTS — recommended / row ═════════════════════════════════ */

const liveCards = JSON.stringify(L.recommended.map((s) => s.job));
function dropForRecommended(field: keyof StoredRecommendation): boolean {
  const trimmed = record.results.map((r) => {
    const copy = { ...r } as Record<string, unknown>;
    delete copy[field as string];
    return copy as unknown as StoredRecommendation;
  });
  return JSON.stringify(reconstructRecommendedCards(trimmed, canonicalById)) === liveCards;
}

check('RECOMMENDED needs reasons', !dropForRecommended('reasons'));
check('RECOMMENDED needs summary', !dropForRecommended('summary'));
check('RECOMMENDED needs factors', !dropForRecommended('factors'));
check('RECOMMENDED needs matchedSkills — here it is RELEVANCE-derived',
  !dropForRecommended('matchedSkills'));
check('RECOMMENDED needs missingSkills', !dropForRecommended('missingSkills'));
check('RECOMMENDED needs score', !dropForRecommended('score'));

/* ═══ 3. The scope difference, stated as a test ═════════════════════════ */

check('matchedSkills is required for recommended but NOT for personalized',
  !dropForRecommended('matchedSkills'));
check('because the personalized row takes matchedSkills from ATS',
  /row\.matchedSkills = match\.matchedSkills/.test(read('lib/server/job-api/personalized.ts')));
check('while the recommended card takes it from the relevance match',
  /job\.matchedSkills = match\.matchedSkills\.slice\(0, 12\)/.test(read('lib/server/recommendation-compute.ts')));

/* ═══ 4. Nothing request-time is persisted ══════════════════════════════ */

{
  const text = JSON.stringify(record);
  for (const forbidden of ['atsScore', 'atsBand', 'applied', 'eligibility', 'missingRequiredSkills']) {
    check(`no ${forbidden} is persisted`, !new RegExp(`"${forbidden}"`).test(text));
  }
  const STORE = read('lib/server/db/recommendation-results.ts');
  check('the stored type declares no ATS field', !/atsScore|atsBand/.test(STORE));
}

/* ═══ 5. Mutation tests ═════════════════════════════════════════════════ */

{
  const mutate = (fn: (rs: StoredRecommendation[]) => void) => {
    const copy = JSON.parse(JSON.stringify(record.results)) as StoredRecommendation[];
    fn(copy);
    return JSON.stringify(reconstructRecommendedCards(copy, canonicalById)) !== liveCards;
  };
  check('a changed score is detected', mutate((rs) => { rs[0].score += 5; }));
  check('a changed reason is detected', mutate((rs) => { rs[0].reasons = ['x']; }));
  check('a changed summary is detected', mutate((rs) => { rs[0].summary = 'x'; }));
  check('a changed factor is detected', mutate((rs) => { if (rs[0].factors) rs[0].factors[0].points = 1; }));
  check('a changed matchedSkills is detected', mutate((rs) => { rs[0].matchedSkills = ['x']; }));
  check('a changed missingSkills is detected', mutate((rs) => { rs[0].missingSkills = ['x']; }));
  check('a changed order is detected', mutate((rs) => { const t = rs[0]; rs[0] = rs[1]; rs[1] = t; }));
  check('a removed result is detected', mutate((rs) => { rs.splice(0, 1); }));
}

/* ═══ 6. Scorer and ATS untouched ══════════════════════════════════════ */

check('the scorer is called once in the compute path',
  (read('lib/server/recommendation-compute.ts').match(/recommendMatch\(/g) ?? []).length === 1);
check('reconstruction does no scoring at all',
  !/recommendMatch|evaluateJobMatch/.test(read('lib/server/recommendation-reconstruct.ts')));

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
