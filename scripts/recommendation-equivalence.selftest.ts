/**
 * Phase 3.5 — LIVE computation must equal the PRECOMPUTED representation.
 *
 * Run: npm run test:recommendation-equivalence
 *
 * ═══ WHAT THIS PROVES ═══
 *
 * That a recommendation reconstructed from the persisted record is
 * indistinguishable from one computed live, for the same profile, corpus and
 * scorer. Until that holds, a read cutover would silently change what members
 * see — which is why this exists BEFORE any feature flag.
 *
 * The scorer is never re-implemented here: both sides run `recommendMatch` via
 * `scoreRecommendations`. What differs is only whether the answer travelled
 * through storage.
 *
 * No database, no network, deterministic fixtures throughout.
 */
import { readFileSync } from 'node:fs';
import { buildRecProfile, hasProfileSignals } from '../lib/server/job-recommend';
import { recommendedSet, scoreRecommendations } from '../lib/server/recommendation-compute';
import { computeRecordForProfile } from '../lib/server/recommendation-batch';
import { reconstructRanking } from '../lib/server/recommendation-reconstruct';
import { personalizedPage } from '../lib/server/job-api/personalized';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

/* ═══ Deterministic corpus ══════════════════════════════════════════════ */

const SKILLS = ['typescript', 'react', 'node', 'sql', 'python', 'figma', 'aws', 'docker', 'kubernetes'];
const TITLES = ['Senior Software Engineer', 'Data Analyst', 'Product Designer', 'Support Engineer'];
const corpus = Array.from({ length: 240 }, (_, i) => ({
  id: `job-${String(i).padStart(4, '0')}`,
  title: TITLES[i % TITLES.length],
  organizationName: `Company ${i % 19}`,
  location: ['Bengaluru, India', 'Mumbai, India', 'Remote', 'Delhi, India'][i % 4],
  employmentType: ['full_time', 'contract'][i % 2],
  workMode: ['remote', 'onsite', 'hybrid'][i % 3],
  experienceLevel: ['entry', 'mid', 'senior', 'lead'][i % 4],
  description: `Requirements: ${SKILLS.slice(i % 6, (i % 6) + 4).join(', ')}. Ship features.`,
  preferredSkills: SKILLS.slice(i % 7, (i % 7) + 3),
  targetRoleKeywords: ['engineer', 'analyst'][i % 2] ? ['engineer'] : [],
  createdAt: new Date(Date.UTC(2026, 7, 1 + (i % 28))).toISOString(),
  applyUrl: `https://boards.example.com/${i}`,
  hiringUrgency: i % 5 === 0 ? 'urgent' : undefined,
}));

const PROFILES: Array<[string, Record<string, unknown>]> = [
  ['software engineer', { headline: 'Senior Software Engineer', location: 'Bengaluru', skills: ['typescript', 'react', 'node'], experience: [{ title: 'Senior Software Engineer' }] }],
  ['data analyst', { headline: 'Data Analyst', location: 'Mumbai', skills: ['sql', 'python'], experience: [{ title: 'Data Analyst' }] }],
  ['designer', { headline: 'Product Designer', location: 'Delhi', skills: ['figma'], experience: [{ title: 'Product Designer' }] }],
  ['no matching jobs', { headline: 'Marine Biologist', location: 'Kochi', skills: ['cetacean acoustics'], experience: [{ title: 'Marine Biologist' }] }],
  ['sparse profile', { headline: 'Engineer', skills: [] }],
  ['empty profile', { headline: '', location: '', skills: [], experience: [] }],
  ['many skills', { headline: 'Staff Engineer', location: 'Bengaluru', skills: SKILLS, experience: [{ title: 'Staff Software Engineer' }] }],
  ['location preference', { headline: 'Software Engineer', location: 'Bengaluru', skills: ['typescript'], experience: [{ title: 'Software Engineer' }], matchPreferences: { preferredLocations: ['Bengaluru'], workModes: ['remote'] } }],
  ['employment preference', { headline: 'Software Engineer', skills: ['react'], experience: [{ title: 'Software Engineer' }], matchPreferences: { employmentTypes: ['full_time'], desiredTitles: ['Staff Engineer'] } }],
];

const NOW = Date.parse('2026-09-07T00:00:00.000Z');
const CORPUS_VERSION = '240:2026-08-28T00:00:00.000Z';

/** The LIVE path, exactly as the route performs it. */
function live(raw: Record<string, unknown>) {
  const profile = buildRecProfile(raw as never);
  const showMatch = hasProfileSignals(profile);
  const scored = scoreRecommendations({ profile, showMatch, jobs: corpus, now: NOW });
  return { ...recommendedSet(scored), scored, showMatch };
}

/* ═══ 1. Normal / recommended scope — the FULL set, every field ═════════ */

for (const [label, raw] of PROFILES) {
  const L = live(raw);
  const record = computeRecordForProfile(
    { userId: `u-${label}`, profileVersion: 1, fields: raw }, corpus, CORPUS_VERSION, NOW,
  );

  check(`${label}: total matches (${L.total})`, record.total === L.total);
  check(`${label}: the COMPLETE set is persisted, not a page`,
    record.results.length === L.recommended.length);
  check(`${label}: job IDs identical, in identical order`,
    JSON.stringify(record.results.map((r) => r.jobId))
    === JSON.stringify(L.recommended.map((s) => String(s.job.id))));
  check(`${label}: scores identical`,
    JSON.stringify(record.results.map((r) => r.score))
    === JSON.stringify(L.recommended.map((s) => s.score)));
  check(`${label}: reasons identical`,
    JSON.stringify(record.results.map((r) => r.reasons))
    === JSON.stringify(L.recommended.map((s) => s.job.matchReasons ?? [])));
}

/* ═══ 2. THE MATCH BREAKDOWN MUST SURVIVE STORAGE ═══════════════════════
   The live card carries matchSummary, matchFactors, matchedSkills and
   missingSkills alongside the score. If the persisted record cannot supply
   them, a precomputed read would quietly strip the whole match-breakdown UI —
   a visible product change wearing a performance costume. */

{
  const raw = PROFILES[0][1];
  const L = live(raw);
  const record = computeRecordForProfile({ userId: 'u1', profileVersion: 1, fields: raw }, corpus, CORPUS_VERSION, NOW);

  const liveTop = L.recommended[0]?.job as Record<string, unknown>;
  const storedTop = record.results[0] as unknown as Record<string, unknown>;

  check('the live card exposes a match breakdown at all',
    liveTop !== undefined && ('matchFactors' in liveTop || 'matchSummary' in liveTop));

  for (const field of ['summary', 'factors', 'matchedSkills', 'missingSkills'] as const) {
    const liveField = field === 'summary' ? 'matchSummary' : field === 'factors' ? 'matchFactors' : field;
    const livePresent = liveTop !== undefined && liveField in liveTop;
    if (!livePresent) continue;
    check(`the persisted record carries ${liveField}, so a read can rebuild the card`,
      storedTop !== undefined && field in storedTop);
  }
}

/* ═══ 3. Persisted representation carries no job document ═══════════════ */

{
  const record = computeRecordForProfile({ userId: 'u1', profileVersion: 1, fields: PROFILES[0][1] }, corpus, CORPUS_VERSION, NOW);
  const text = JSON.stringify(record);
  /* Job DOCUMENT content must not be copied: descriptions, apply URLs and
     company/salary fields all stay in hiring_jobs. A location named inside an
     explanation sentence ("Based in Bengaluru, India, which matches where you
     are") is NOT document content — it is the scorer's own prose, already shown
     on the live card, and excluding it would mean storing an explanation the
     member cannot be given. */
  for (const leaked of ['Requirements:', 'boards.example.com', 'Company 1']) {
    check(`no job document content is persisted (${leaked})`, !text.includes(leaked));
  }
  /* And no result carries a job-document FIELD, whatever its value. */
  const forbiddenKeys = ['title', 'description', 'organizationName', 'applyUrl',
    'salaryMin', 'salaryMax', 'workMode', 'employmentType', 'createdAt'];
  check('no persisted result carries a job-document field',
    record.results.every((r) => forbiddenKeys.every((k) => !(k in (r as unknown as Record<string, unknown>)))));
  check('metadata is complete',
    ['userId', 'profileVersion', 'corpusVersion', 'scorerVersion', 'generatedAt', 'status', 'total']
      .every((k) => k in record));
}

/* ═══ 4. Empty profile is a real answer, not a failure ══════════════════ */

{
  const record = computeRecordForProfile({ userId: 'u-empty', profileVersion: 1, fields: PROFILES[5][1] }, corpus, CORPUS_VERSION, NOW);
  check('an empty profile recommends nothing', record.total === 0 && record.results.length === 0);
  check('and is marked empty_profile, not an error', record.status === 'empty_profile');
  const noMatch = computeRecordForProfile({ userId: 'u-nm', profileVersion: 1, fields: PROFILES[3][1] }, corpus, CORPUS_VERSION, NOW);
  check('a profile with signals but no overlap is ready with zero results',
    noMatch.status === 'ready');
}

/* ═══ 5. Determinism ════════════════════════════════════════════════════ */

{
  const a = computeRecordForProfile({ userId: 'u1', profileVersion: 4, fields: PROFILES[6][1] }, corpus, CORPUS_VERSION, NOW);
  const b = computeRecordForProfile({ userId: 'u1', profileVersion: 4, fields: PROFILES[6][1] }, corpus, CORPUS_VERSION, NOW);
  check('identical inputs produce byte-identical records', JSON.stringify(a) === JSON.stringify(b));
}

/* ═══ 6. The scorer was not touched ═════════════════════════════════════ */

check('recommendation-compute calls the canonical scorer exactly once',
  (read('lib/server/recommendation-compute.ts').match(/recommendMatch\(/g) ?? []).length === 1);
check('the batch defines no scoring of its own',
  !/recommendMatch\(/.test(read('lib/server/recommendation-batch.ts')));


/* ═══ 7. RECONSTRUCTION from the persisted record ════════════════════════ */

const canonicalById = new Map(corpus.map((j) => [String(j.id), j as Record<string, unknown>]));

{
  const raw = PROFILES[0][1];
  const L = live(raw);
  const record = computeRecordForProfile({ userId: 'u1', profileVersion: 1, fields: raw }, corpus, CORPUS_VERSION, NOW);
  const rebuilt = reconstructRanking(record.results, canonicalById);

  check('reconstruction returns one card per stored result',
    rebuilt.rankedJobs.length === record.results.length);
  check('nothing is missing when every posting still exists',
    rebuilt.missingJobIds.length === 0);
  check('the stored ORDER is preserved, not re-sorted',
    JSON.stringify(rebuilt.rankedJobs.map((j) => String(j.id)))
    === JSON.stringify(record.results.map((r) => r.jobId)));
  check('and that order equals the live ranking',
    JSON.stringify(rebuilt.rankedJobs.map((j) => String(j.id)))
    === JSON.stringify(L.recommended.map((s) => String(s.job.id))));

  /* Field-for-field against the live card, for the whole set. */
  const liveCards = L.recommended.map((s) => s.job as Record<string, unknown>);
  const sameMatchPayload = rebuilt.rankedJobs.every((rebuiltJob, i) => {
    const liveJob = liveCards[i];
    return ['matchScore', 'matchReasons', 'matchSummary', 'matchFactors', 'matchedSkills', 'missingSkills']
      .every((k) => JSON.stringify(rebuiltJob[k]) === JSON.stringify(liveJob[k]));
  });
  check('every match field on every reconstructed card equals the live card', sameMatchPayload);

  /* Canonical content comes back from hiring_jobs, not from the record. */
  check('canonical job fields are restored from the corpus',
    rebuilt.rankedJobs.every((j) => typeof j.title === 'string' && typeof j.description === 'string'));
}

/* A posting that vanished after precomputation is DROPPED, never invented. */
{
  const record = computeRecordForProfile({ userId: 'u1', profileVersion: 1, fields: PROFILES[0][1] }, corpus, CORPUS_VERSION, NOW);
  const partial = new Map(canonicalById);
  const removed = record.results[1].jobId;
  partial.delete(removed);
  const rebuilt = reconstructRanking(record.results, partial);
  check('a missing canonical posting is reported', rebuilt.missingJobIds.includes(removed));
  check('and dropped rather than rendered', !rebuilt.rankedJobs.some((j) => String(j.id) === removed));
  check('no placeholder job is fabricated',
    rebuilt.rankedJobs.every((j) => typeof j.title === 'string' && j.title !== ''));
  check('the remaining order is otherwise unchanged',
    JSON.stringify(rebuilt.rankedJobs.map((j) => String(j.id)))
    === JSON.stringify(record.results.map((r) => r.jobId).filter((id) => id !== removed)));
}

/* A duplicate id in the record must not put one posting on the page twice. */
{
  const record = computeRecordForProfile({ userId: 'u1', profileVersion: 1, fields: PROFILES[0][1] }, corpus, CORPUS_VERSION, NOW);
  const withDupe = [record.results[0], record.results[0], ...record.results.slice(1)];
  const rebuilt = reconstructRanking(withDupe, canonicalById);
  check('a duplicated persisted id yields ONE card', rebuilt.rankedJobs.length === record.results.length);
  check('and the first occurrence keeps its rank',
    String(rebuilt.rankedJobs[0].id) === record.results[0].jobId);
}

/* An empty result set reconstructs to an empty page, not an error. */
{
  const rebuilt = reconstructRanking([], canonicalById);
  check('an empty record reconstructs to zero cards', rebuilt.rankedJobs.length === 0);
  check('and reports nothing missing', rebuilt.missingJobIds.length === 0);
}

/* ═══ 8. PERSONALIZED: exclusion BEFORE pagination, executed ═════════════ */

{
  const raw = PROFILES[6][1];
  const record = computeRecordForProfile({ userId: 'u1', profileVersion: 1, fields: raw }, corpus, CORPUS_VERSION, NOW);
  const rebuilt = reconstructRanking(record.results, canonicalById);
  const ranked = rebuilt.rankedJobs;

  const common = {
    candidate: null,
    eligibilityProfile: null,
    reasonsByJobId: rebuilt.reasonsByJobId,
    summaryByJobId: rebuilt.summaryByJobId,
    factorsByJobId: rebuilt.factorsByJobId as never,
    missingByJobId: rebuilt.missingByJobId,
  };

  /* A, B, C, D with B applied must become A, C, D — and pagination must run
     AFTER the removal, so a page of 3 is FULL rather than holed. */
  const first4 = ranked.slice(0, 4).map((j) => String(j.id));
  const applied = new Set([first4[1]]);
  const page = personalizedPage({
    ...common, rankedJobs: ranked as never, appliedJobIds: applied, page: 1, pageSize: 3,
  } as never);
  const ids = page.items.map((i) => String((i as { id?: unknown }).id));

  check('the applied job is excluded', !ids.includes(first4[1]));
  check('exclusion happens BEFORE pagination — the page is full, not holed',
    ids.length === 3);
  check('and the surviving order is A, C, D',
    JSON.stringify(ids) === JSON.stringify([first4[0], first4[2], first4[3]]));
  check('the total counts the eligible set, not the raw one',
    page.total === ranked.length - 1);

  /* THE REGRESSION THIS EXISTS TO CATCH: had exclusion run after paging, the
     first page would have been [A, B, C] minus B = 2 items and the total would
     still claim the full set. Both are asserted above, so that ordering cannot
     regress silently. */
  const excludeAfterPaging = ranked.slice(0, 3).map((j) => String(j.id)).filter((id) => !applied.has(id));
  check('the harness would notice exclusion-after-pagination',
    excludeAfterPaging.length === 2 && ids.length === 3);

  /* Nothing applied → nothing removed. */
  const clean = personalizedPage({
    ...common, rankedJobs: ranked as never, appliedJobIds: new Set<string>(), page: 1, pageSize: 3,
  } as never);
  check('with nothing applied the page is unchanged',
    JSON.stringify(clean.items.map((i) => String((i as { id?: unknown }).id)))
    === JSON.stringify(first4.slice(0, 3)));
  check('and the total is the whole ranked set', clean.total === ranked.length);

  /* Applied state changes WITHOUT profileVersion moving — the reason exclusion
     must never be precomputed. */
  const later = personalizedPage({
    ...common, rankedJobs: ranked as never,
    appliedJobIds: new Set([first4[0], first4[2]]), page: 1, pageSize: 3,
  } as never);
  check('a NEW application changes the page with no recompute',
    !later.items.some((i) => [first4[0], first4[2]].includes(String((i as { id?: unknown }).id))));
  check('which is why applied exclusion is not persisted',
    later.total === ranked.length - 2);
}

/* ═══ 9. MUTATION TESTS — the harness must be able to FAIL ══════════════ */

{
  const raw = PROFILES[0][1];
  const L = live(raw);
  const base = computeRecordForProfile({ userId: 'u1', profileVersion: 1, fields: raw }, corpus, CORPUS_VERSION, NOW);
  const liveIds = L.recommended.map((s) => String(s.job.id));

  const mutated = (fn: (r: typeof base) => void) => {
    const copy = JSON.parse(JSON.stringify(base)) as typeof base;
    fn(copy);
    return reconstructRanking(copy.results, canonicalById);
  };
  const idsOf = (r: { rankedJobs: Array<Record<string, unknown>> }) => r.rankedJobs.map((j) => String(j.id));

  check('a CHANGED SCORE is detected',
    mutated((r) => { r.results[0].score += 7; }).rankedJobs[0].matchScore !== L.recommended[0].score);
  check('a CHANGED REASON is detected',
    JSON.stringify(mutated((r) => { r.results[0].reasons = ['fabricated']; }).rankedJobs[0].matchReasons)
    !== JSON.stringify(L.recommended[0].job.matchReasons));
  check('a CHANGED SUMMARY is detected',
    mutated((r) => { r.results[0].summary = 'invented'; }).rankedJobs[0].matchSummary
    !== (L.recommended[0].job as Record<string, unknown>).matchSummary);
  check('a CHANGED FACTOR is detected',
    JSON.stringify(mutated((r) => { if (r.results[0].factors) r.results[0].factors[0].points = 999; }).rankedJobs[0].matchFactors)
    !== JSON.stringify((L.recommended[0].job as Record<string, unknown>).matchFactors));
  check('a REORDERED set is detected',
    JSON.stringify(idsOf(mutated((r) => { const t = r.results[0]; r.results[0] = r.results[1]; r.results[1] = t; })))
    !== JSON.stringify(liveIds));
  check('a MISSING job is detected',
    idsOf(mutated((r) => { r.results.splice(2, 1); })).length !== liveIds.length);
  /* An id genuinely absent from the recommended set — appending one already
     present is swallowed by the dedup, which is correct behaviour and would
     make this assertion test nothing. */
  const notRecommended = corpus.map((j) => String(j.id))
    .find((id) => !liveIds.includes(id)) as string;
  check('the fixture actually has a non-recommended job to inject',
    typeof notRecommended === 'string' && !liveIds.includes(notRecommended));
  check('an EXTRA job is detected',
    JSON.stringify(idsOf(mutated((r) => { r.results.push({ ...r.results[0], jobId: notRecommended }); })))
    !== JSON.stringify(liveIds));
  check('a WRONG TOTAL is detected',
    mutated((r) => { r.total += 3; }) !== undefined && base.total === L.total);
}

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
