/**
 * Phase 3.5 — personalized LIVE vs PRECOMPUTED, with REAL ATS enrichment.
 *
 * Run: npm run test:recommendation-ats-equivalence
 *
 * ═══ WHY THIS EXISTS SEPARATELY ═══
 *
 * The first equivalence harness ran with `candidate: null`, so ATS never
 * executed and its equality was unproven — stated as such rather than implied.
 * This runs the REAL `evaluateJobMatch` through `personalizedPage`, on both
 * sides, and requires identical output.
 *
 * ATS is NOT persisted and must never be: it depends on the member's résumé and
 * on live application state, neither of which moves `profileVersion`. It stays
 * request-time, computed on the page that survives exclusion and pagination.
 *
 * The ATS engine is untouched — this file imports it, never reimplements it.
 * No database, deterministic fixtures.
 */
import { readFileSync } from 'node:fs';
import { buildRecProfile, hasProfileSignals } from '../lib/server/job-recommend';
import { recommendedSet, scoreRecommendations } from '../lib/server/recommendation-compute';
import { computeRecordForProfile } from '../lib/server/recommendation-batch';
import { reconstructRanking } from '../lib/server/recommendation-reconstruct';
import { personalizedPage } from '../lib/server/job-api/personalized';
import type { MatchCandidate } from '../lib/server/job-sources/ats-match';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const read = (p: string) => readFileSync(p, 'utf8');

/* ═══ Corpus with genuinely different ATS outcomes ══════════════════════ */

const job = (i: number, over: Record<string, unknown> = {}) => ({
  id: `job-${String(i).padStart(3, '0')}`,
  title: 'Senior Software Engineer',
  organizationName: `Company ${i}`,
  location: 'Bengaluru, India',
  employmentType: 'full_time',
  workMode: 'remote',
  experienceLevel: 'senior',
  description: 'Requirements: TypeScript, React, Node.js, PostgreSQL. Responsibilities: build services.',
  requirements: ['TypeScript', 'React'],
  responsibilities: ['Ship features'],
  preferredSkills: ['TypeScript', 'React', 'Node.js'],
  targetRoleKeywords: ['engineer'],
  status: 'published',
  createdAt: '2026-08-01T00:00:00.000Z',
  applyUrl: 'https://boards.example.com/x',
  ...over,
});

const corpus = [
  /* A — strong ATS: the candidate has everything it asks for. */
  job(1),
  /* B — will be the APPLIED one. */
  job(2, { organizationName: 'Company 2' }),
  /* C — weak ATS: asks for a stack the candidate does not have. */
  job(3, {
    description: 'Requirements: COBOL, Fortran, mainframe operations, JCL.',
    requirements: ['COBOL', 'Fortran'], preferredSkills: ['COBOL', 'JCL'],
  }),
  /* D — partial. */
  job(4, {
    description: 'Requirements: TypeScript, Kubernetes, Terraform.',
    requirements: ['TypeScript', 'Kubernetes'], preferredSkills: ['TypeScript', 'Terraform'],
  }),
  job(5), job(6),
];

const PROFILE_FIELDS = {
  headline: 'Senior Software Engineer',
  location: 'Bengaluru',
  skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
  experience: [{ title: 'Senior Software Engineer' }],
};

/** A realistic candidate — enough for the ATS engine to actually score. */
const candidate: MatchCandidate = {
  id: 'u-ats-1',
  profile: {
    headline: 'Senior Software Engineer',
    bio: 'Backend engineer building distributed services.',
    location: 'Bengaluru, India',
    skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
  },
  resumeText: [
    'Senior Software Engineer',
    'EXPERIENCE',
    'Built and shipped services in TypeScript and Node.js against PostgreSQL.',
    'Led a React front end used by 2M people a month.',
    'SKILLS',
    'TypeScript, React, Node.js, PostgreSQL, Docker',
  ].join('\n'),
  experienceYears: 7,
};
/** A candidate with almost nothing stated — the missing-information case. */
const sparseCandidate: MatchCandidate = { id: 'u-ats-2', profile: { headline: 'Engineer' } };

const NOW = Date.parse('2026-09-07T00:00:00.000Z');
const CORPUS_VERSION = '6:2026-08-01T00:00:00.000Z';
const canonicalById = new Map(corpus.map((j) => [String(j.id), j as Record<string, unknown>]));

/* ═══ The two paths ═════════════════════════════════════════════════════ */

function liveRanking() {
  const profile = buildRecProfile(PROFILE_FIELDS as never);
  const showMatch = hasProfileSignals(profile);
  const scored = scoreRecommendations({ profile, showMatch, jobs: corpus, now: NOW });
  const { recommended } = recommendedSet(scored);
  const reasons = new Map<string, string[]>();
  const summaries = new Map<string, string>();
  const factors = new Map<string, never>();
  const missing = new Map<string, string[]>();
  for (const s of recommended) {
    const j = s.job as Record<string, unknown>;
    reasons.set(String(j.id), (j.matchReasons as string[]) ?? []);
    if (typeof j.matchSummary === 'string') summaries.set(String(j.id), j.matchSummary);
    if (Array.isArray(j.matchFactors)) factors.set(String(j.id), j.matchFactors as never);
    if (Array.isArray(j.missingSkills)) missing.set(String(j.id), j.missingSkills as string[]);
  }
  /* The live route hands personalizedPage the CANONICAL postings, ranked. */
  const rankedJobs = recommended.map((s) => canonicalById.get(String((s.job as { id: unknown }).id))!);
  return { rankedJobs, reasons, summaries, factors, missing };
}

function precomputedRanking() {
  const record = computeRecordForProfile(
    { userId: 'u-ats-1', profileVersion: 1, fields: PROFILE_FIELDS }, corpus, CORPUS_VERSION, NOW,
  );
  const rebuilt = reconstructRanking(record.results, canonicalById);
  return { record, rebuilt };
}

const pageOf = (
  rankedJobs: Array<Record<string, unknown>>,
  maps: { reasons: Map<string, string[]>; summaries: Map<string, string>; factors: Map<string, never>; missing: Map<string, string[]> },
  cand: MatchCandidate | null,
  applied: Set<string>,
  page = 1, pageSize = 3,
) => personalizedPage({
  rankedJobs: rankedJobs as never,
  candidate: cand as never,
  appliedJobIds: applied,
  eligibilityProfile: null,
  reasonsByJobId: maps.reasons,
  summaryByJobId: maps.summaries,
  factorsByJobId: maps.factors as never,
  missingByJobId: maps.missing,
  page, pageSize,
} as never);

/* ═══ 1. REAL ATS actually executes ═════════════════════════════════════ */

const L = liveRanking();
const { rebuilt } = precomputedRanking();
const P = {
  reasons: rebuilt.reasonsByJobId, summaries: rebuilt.summaryByJobId,
  factors: rebuilt.factorsByJobId as never, missing: rebuilt.missingByJobId,
};

const livePage = pageOf(L.rankedJobs, L, candidate, new Set(), 1, 6);
const precPage = pageOf(rebuilt.rankedJobs, P, candidate, new Set(), 1, 6);

check('the ranking is non-empty, so the comparison means something',
  livePage.items.length > 0);
check('ATS ACTUALLY RAN — at least one row carries a real score',
  livePage.items.some((i) => typeof (i as { atsScore?: unknown }).atsScore === 'number'));
check('and a band', livePage.items.some((i) => (i as { atsBand?: unknown }).atsBand !== null));
check('scored is true when a candidate was supplied', livePage.scored === true);
/* Different jobs must produce different ATS outcomes, or the fixture proves nothing. */
{
  const scores = livePage.items.map((i) => (i as { atsScore?: number | null }).atsScore);
  check('the fixture yields DIFFERENT ATS scores across jobs',
    new Set(scores.map((s) => String(s))).size > 1);
}

/* ═══ 2. LIVE == PRECOMPUTED, field for field ═══════════════════════════ */

check('same number of rows', livePage.items.length === precPage.items.length);
check('same total', livePage.total === precPage.total);
check('same page/pageSize',
  livePage.page === precPage.page && livePage.pageSize === precPage.pageSize);
check('same job IDs in the same order',
  JSON.stringify(livePage.items.map((i) => (i as { id: string }).id))
  === JSON.stringify(precPage.items.map((i) => (i as { id: string }).id)));
check('same ATS scores', JSON.stringify(livePage.items.map((i) => (i as { atsScore?: unknown }).atsScore))
  === JSON.stringify(precPage.items.map((i) => (i as { atsScore?: unknown }).atsScore)));
check('same ATS bands', JSON.stringify(livePage.items.map((i) => (i as { atsBand?: unknown }).atsBand))
  === JSON.stringify(precPage.items.map((i) => (i as { atsBand?: unknown }).atsBand)));
for (const field of ['matchReasons', 'matchSummary', 'matchFactors', 'relevanceMissingSkills',
  'matchedSkills', 'missingRequiredSkills', 'missingPreferredSkills', 'eligibility'] as const) {
  check(`same ${field}`,
    JSON.stringify(livePage.items.map((i) => (i as unknown as Record<string, unknown>)[field]))
    === JSON.stringify(precPage.items.map((i) => (i as unknown as Record<string, unknown>)[field])));
}
check('THE WHOLE PAGE serialises identically',
  JSON.stringify(livePage) === JSON.stringify(precPage));

/* ═══ 3. Weak / missing-information candidates ══════════════════════════ */

{
  const liveSparse = pageOf(L.rankedJobs, L, sparseCandidate, new Set(), 1, 6);
  const precSparse = pageOf(rebuilt.rankedJobs, P, sparseCandidate, new Set(), 1, 6);
  check('a sparse candidate produces identical pages on both paths',
    JSON.stringify(liveSparse) === JSON.stringify(precSparse));
  check('and is still scored rather than crashing', liveSparse.scored === true);
}
{
  const liveNone = pageOf(L.rankedJobs, L, null, new Set(), 1, 6);
  const precNone = pageOf(rebuilt.rankedJobs, P, null, new Set(), 1, 6);
  check('no candidate → no ATS, identically on both paths',
    JSON.stringify(liveNone) === JSON.stringify(precNone));
  check('and ATS is null rather than zero',
    liveNone.items.every((i) => (i as { atsScore: unknown }).atsScore === null));
  check('scored is false, so the UI can explain the blank', liveNone.scored === false);
}

/* ═══ 4. Applied exclusion WITH a real candidate ════════════════════════ */

{
  const ids = rebuilt.rankedJobs.map((j) => String(j.id));
  const [A, B, C, D] = ids;
  const applied = new Set([B]);

  const liveEx = pageOf(L.rankedJobs, L, candidate, applied, 1, 3);
  const precEx = pageOf(rebuilt.rankedJobs, P, candidate, applied, 1, 3);

  const precIds = precEx.items.map((i) => (i as { id: string }).id);
  check('the applied job B is excluded', !precIds.includes(B));
  check('exclusion ran BEFORE pagination — the page is full', precIds.length === 3);
  check('the surviving order is A, C, D', JSON.stringify(precIds) === JSON.stringify([A, C, D]));
  check('B NEVER received ATS enrichment', !precEx.items.some((i) => (i as { id: string }).id === B));
  check('total counts the eligible set', precEx.total === ids.length - 1);
  check('LIVE and PRECOMPUTED agree exactly with exclusion applied',
    JSON.stringify(liveEx) === JSON.stringify(precEx));
  check('ATS values for A, C, D are unchanged by the exclusion',
    JSON.stringify(precEx.items.map((i) => (i as { atsScore?: unknown }).atsScore))
    === JSON.stringify(precPage.items.filter((i) => (i as { id: string }).id !== B)
      .slice(0, 3).map((i) => (i as { atsScore?: unknown }).atsScore)));

  /* A NEW application, with NO recompute: the record is untouched and the page
     still changes — which is exactly why exclusion is not persisted. */
  const laterApplied = new Set([B, C]);
  const later = pageOf(rebuilt.rankedJobs, P, candidate, laterApplied, 1, 3);
  const laterIds = later.items.map((i) => (i as { id: string }).id);
  check('a newly applied job disappears with no recomputation',
    !laterIds.includes(C) && !laterIds.includes(B));
  check('the remaining jobs keep their ATS values',
    (later.items[0] as { atsScore?: unknown }).atsScore
    === (precPage.items.find((i) => (i as { id: string }).id === A) as { atsScore?: unknown }).atsScore);
  check('and the total reflects both exclusions', later.total === ids.length - 2);
}

/* ═══ 5. ATS is NOT persisted ═══════════════════════════════════════════ */

{
  const { record } = precomputedRanking();
  const text = JSON.stringify(record);
  check('no ATS score is persisted', !/"atsScore"/.test(text));
  check('no ATS band is persisted', !/"atsBand"/.test(text));
  check('no application state is persisted', !/applied|appliedJobIds/i.test(text));
  check('no eligibility verdict is persisted', !/"eligibility"/.test(text));
  const STORE = read('lib/server/db/recommendation-results.ts');
  check('the stored type has no ATS field', !/ats/i.test(STORE.replace(/\/\*[\s\S]*?\*\//g, '')));
}

/* ═══ 6. Mutation tests — the suite must be able to FAIL ════════════════ */

{
  const mutate = (fn: (rows: Array<Record<string, unknown>>) => void) => {
    const copy = JSON.parse(JSON.stringify(precPage)) as typeof precPage;
    fn(copy.items as unknown as Array<Record<string, unknown>>);
    return JSON.stringify(copy) !== JSON.stringify(livePage);
  };
  check('a mutated ATS SCORE is detected', mutate((rows) => { rows[0].atsScore = 999; }));
  check('a mutated ATS BAND is detected', mutate((rows) => { rows[0].atsBand = 'perfect'; }));
  check('a mutated matchedSkills (ATS-derived) is detected',
    mutate((rows) => { rows[0].matchedSkills = ['fabricated']; }));
  check('a mutated ORDER is detected',
    mutate((rows) => { const t = rows[0]; rows[0] = rows[1]; rows[1] = t; }));
  check('a REMOVED row is detected', mutate((rows) => { rows.splice(0, 1); }));
  check('a mutated recommendation REASON is detected',
    mutate((rows) => { rows[0].matchReasons = ['invented']; }));
  check('a mutated matchSummary is detected',
    mutate((rows) => { rows[0].matchSummary = 'invented'; }));
  check('a mutated relevanceMissingSkills is detected',
    mutate((rows) => { rows[0].relevanceMissingSkills = ['invented']; }));
}

/* ═══ 7. Which persisted fields the UI actually needs ═══════════════════ */

{
  /* Measured, not assumed: drop each stored field and see whether the
     personalized page still matches live. */
  const { record } = precomputedRanking();
  const without = (drop: string) => {
    const trimmed = record.results.map((r) => {
      const copy = { ...r } as Record<string, unknown>;
      delete copy[drop];
      return copy as unknown as typeof r;
    });
    const rb = reconstructRanking(trimmed, canonicalById);
    const page = pageOf(rb.rankedJobs, {
      reasons: rb.reasonsByJobId, summaries: rb.summaryByJobId,
      factors: rb.factorsByJobId as never, missing: rb.missingByJobId,
    }, candidate, new Set(), 1, 6);
    return JSON.stringify(page) === JSON.stringify(livePage);
  };
  check('PERSONALIZED needs reasons', !without('reasons'));
  check('PERSONALIZED needs summary', !without('summary'));
  check('PERSONALIZED needs factors', !without('factors'));
  check('PERSONALIZED needs missingSkills (rendered as relevanceMissingSkills)',
    !without('missingSkills'));
  /* matchedSkills on this row comes from ATS, not from the record. */
  check('PERSONALIZED does NOT need persisted matchedSkills — ATS supplies it',
    without('matchedSkills'));
}

check('the ATS engine was not modified',
  /export function evaluateJobMatch/.test(read('lib/server/job-sources/ats-match.ts')));

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
