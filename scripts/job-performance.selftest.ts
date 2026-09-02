/**
 * Job performance — regression guards.
 *
 * These are not benchmarks. They assert the STRUCTURAL properties that made
 * the flows fast, so a later change cannot quietly undo them:
 *
 *   · a page of public jobs serializes the PAGE, not the corpus;
 *   · pagination is never dropped, and page size is always clamped;
 *   · recommendation enrichment stays bounded by MAX_ENRICHED_PER_PAGE;
 *   · an unscored candidate still yields null, not 0 — speed must not change
 *     the meaning of a score;
 *   · applicant ordering is still ATS desc, candidate id asc;
 *   · applicant rows still carry no résumé URL and no résumé bytes;
 *   · the routes still read each store ONCE per request.
 *
 * Run: npm run test:job-performance
 */
import { readFileSync } from 'node:fs';
import { publicJobs, rankApplicants, paginate, MAX_PAGE_SIZE } from '../lib/server/job-api/queries';
import { personalizedPage, MAX_ENRICHED_PER_PAGE } from '../lib/server/job-api/personalized';
import {
  evaluateJobMatch, clearAtsMatchMemos, rankCandidates,
  normalizeCandidateForMatch, normalizeJobForMatch,
  atsNormalizationStats, resetAtsNormalizationStats,
  type MatchCandidate,
} from '../lib/server/job-sources/ats-match';
import { buildRecommendations } from '../lib/server/job-sources/recommendation';
import { buildRecProfile, recommendMatch, type RecJob } from '../lib/server/job-recommend';
import { evaluateAts } from '../lib/server/ats';
import { normalizeJd } from '../lib/server/ats/jd';
import { normalizeResume } from '../lib/server/ats/resume';
import type { HiringJobPosting, HiringJobApplication } from '../types/document';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}

const LONG = 'x'.repeat(4000);
const job = (i: number, over: Partial<HiringJobPosting> = {}): HiringJobPosting => ({
  id: `job-${String(i).padStart(4, '0')}`,
  title: `Engineer ${i}`,
  organizationName: 'Acme',
  organizationId: 'org1',
  location: 'Bengaluru',
  workMode: 'hybrid',
  employmentType: 'full_time',
  /* Deliberately fat: descriptions are the bulk of the corpus, and the point
     of paging before serializing is that they are never touched off-page. */
  description: LONG,
  requirements: ['TypeScript'],
  responsibilities: ['Ship'],
  preferredSkills: ['React'],
  status: 'published',
  createdAt: new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString(),
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
} as unknown as HiringJobPosting);

/* ═══ Public feed: the page is serialized, not the corpus ════════════════ */

const corpus = Array.from({ length: 500 }, (_, i) => job(i));

/* publicJobView is what turns a posting into a response object. Counting how
   many times the description string is REFERENCED is impractical, so instead
   we assert the observable consequence: the response holds exactly one page. */
const page1 = publicJobs(corpus, { page: 1, pageSize: 20 });
check('a page of 20 returns 20 items', page1.items.length === 20);
check('the total still reports the whole corpus', page1.total === 500);
check('the page number is reported', page1.page === 1);

/* THE ACTUAL WORK IS COUNTED, not inferred from the output.
   Serializing the whole corpus and then slicing produces an identical response
   to slicing and then serializing — the waste is invisible from outside. So
   each posting's `description` is a GETTER that records a read: publicJobView
   touches it exactly once per posting it serializes. A page of 20 must cost 20
   reads, not 500. */
let reads = 0;
const counted = corpus.map((j) => {
  const clone = { ...j } as Record<string, unknown>;
  delete clone.description;
  Object.defineProperty(clone, 'description', {
    get() { reads += 1; return LONG; },
    enumerable: true,
  });
  return clone as unknown as HiringJobPosting;
});

reads = 0;
const cheap = publicJobs(counted, { page: 1, pageSize: 20 });
check('a 20-row page serializes 20 postings, not the whole corpus', reads <= 20);
check('and it still returns 20 rows', cheap.items.length === 20);
check('and they still carry their descriptions',
  String((cheap.items[0] as Record<string, unknown>).description ?? '').length === 4000);

/* A search reads descriptions to MATCH — that is required work, and separate
   from serialization. Page 5 of a plain listing must still cost one page. */
reads = 0;
publicJobs(counted, { page: 5, pageSize: 20 });
check('a later page also costs one page of serialization', reads <= 20);

/* Paging must not change WHICH jobs are returned or their order. */
const all = publicJobs(corpus, { page: 1, pageSize: MAX_PAGE_SIZE });
const p1 = publicJobs(corpus, { page: 1, pageSize: 10 });
const p2 = publicJobs(corpus, { page: 2, pageSize: 10 });
check('page 1 matches the head of the full ordering',
  p1.items.map((r) => r.id).join(',') === all.items.slice(0, 10).map((r) => r.id).join(','));
check('page 2 continues that ordering',
  p2.items.map((r) => r.id).join(',') === all.items.slice(10, 20).map((r) => r.id).join(','));
check('pages do not overlap',
  p1.items.every((a) => !p2.items.some((b) => b.id === a.id)));

/* ═══ Pagination can never be dropped ═══════════════════════════════════ */

check('an absurd page size is clamped', paginate(corpus, 1, 100000).items.length <= MAX_PAGE_SIZE);
check('the clamp is MAX_PAGE_SIZE', MAX_PAGE_SIZE === 100);
check('a public request cannot ask for the whole corpus',
  publicJobs(corpus, { page: 1, pageSize: 99999 }).items.length <= MAX_PAGE_SIZE);
check('a negative page size falls back rather than returning everything',
  publicJobs(corpus, { page: 1, pageSize: -1 }).items.length <= MAX_PAGE_SIZE);

/* ═══ Recommendation enrichment stays bounded ═══════════════════════════ */

const big = personalizedPage({ rankedJobs: corpus, candidate: null, page: 1, pageSize: 100000 });
check('enrichment is capped', big.items.length <= MAX_ENRICHED_PER_PAGE);
check('the cap is still 25', MAX_ENRICHED_PER_PAGE === 25);
check('the true total is still reported', big.total === 500);

/* Speed must not change meaning: an unscored row is null, never 0. */
check('an unscored row is still null, not 0', big.items.every((r) => r.atsScore === null));
check('and its band is still null', big.items.every((r) => r.atsBand === null));

/* Applied exclusion still happens BEFORE paging. */
const applied = new Set(corpus.slice(0, 5).map((j) => j.id));
const excl = personalizedPage({ rankedJobs: corpus, candidate: null, appliedJobIds: applied, page: 1, pageSize: 10 });
check('applied jobs are still excluded', excl.items.every((r) => !applied.has(r.id)));
check('the page is still full after exclusion', excl.items.length === 10);
check('the total still reflects the exclusion', excl.total === 495);

/* ═══ Applicant ordering and résumé safety ══════════════════════════════ */

const app = (id: string, ats: number): HiringJobApplication => ({
  id: `app-${id}`,
  jobId: 'job-0001',
  candidateUserId: id,
  candidateName: `Candidate ${id}`,
  candidateEmail: `${id}@example.com`,
  organizationId: 'org1',
  organizationName: 'Acme',
  jobTitle: 'Engineer',
  atsScore: ats,
  status: 'submitted',
  appliedAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  resumeText: 'resume text',
  resumeFileName: 'cv.pdf',
  resumeRef: { url: 'https://storage.example/secret-object', fileName: 'cv.pdf' },
} as unknown as HiringJobApplication);

/* Deliberately tied scores, inserted in a hostile order. */
const applicants = [app('zed', 93), app('alice', 93), app('bob', 99), app('carol', 40)];
const ranked = rankApplicants(applicants, { page: 1, pageSize: 10 });
check('ordering is ATS descending', ranked.items[0].atsScore === 99);
check('ties break by candidate id ascending',
  ranked.items[1].candidateUserId === 'alice' && ranked.items[2].candidateUserId === 'zed');
check('the lowest score is last', ranked.items[3].candidateUserId === 'carol');

/* Ordering must be identical across repeated calls — paging depends on it. */
const again = rankApplicants(applicants, { page: 1, pageSize: 10 });
check('ordering is deterministic across calls',
  ranked.items.map((r) => r.candidateUserId).join(',') === again.items.map((r) => r.candidateUserId).join(','));

/* No résumé is fetched or exposed by a LISTING. */
const listJson = JSON.stringify(ranked.items);
check('no résumé URL appears in an applicant listing', !listJson.includes('storage.example'));
check('no résumé bytes appear in an applicant listing', !listJson.includes('resume text'));
check('but the listing still says a résumé exists', ranked.items.every((r) => r.hasResume === true));

/* The ATS score is READ, never recomputed, in a listing. */
check('the listed score is the stored score',
  ranked.items.find((r) => r.candidateUserId === 'bob')?.atsScore === 99);

/* ═══ Each store is read once per request ═══════════════════════════════ */

const ROUTES = [
  'app/api/hiring/jobs/mine/route.ts',
  'app/api/hiring/jobs/[jobId]/applicants/route.ts',
  'app/api/me/applications/route.ts',
  'app/api/hiring/applications/[applicationId]/status/route.ts',
  'app/api/hiring/applications/[applicationId]/resume/route.ts',
  'app/api/hiring/applications/[applicationId]/contact/route.ts',
];
for (const file of ROUTES) {
  const src = readFileSync(file, 'utf8');
  /* One call site per store per handler. A second one means a store is being
     re-read inside the same request. */
  const apps = (src.match(/getHiringApplications\(\)/g) ?? []).length;
  const handlers = (src.match(/export async function (GET|POST|PATCH|DELETE)/g) ?? []).length;
  check(`${file.split('/').slice(-2).join('/')} reads applications at most once per handler`,
    apps <= Math.max(1, handlers));
  /* And the independent reads are batched rather than serialized. */
  check(`${file.split('/').slice(-2).join('/')} batches its independent reads`,
    src.includes('Promise.all'));
}

/* The public feed must use the CACHED corpus accessor, not the raw one. */
for (const file of ['app/api/jobs/public/route.ts', 'app/api/jobs/public/[jobId]/route.ts']) {
  const src = readFileSync(file, 'utf8');
  check(`${file.split('/').slice(-2).join('/')} uses the cached corpus`,
    src.includes('getHiringJobsCached'));
  check(`${file.split('/').slice(-2).join('/')} does not re-read the raw corpus`,
    !/\bgetHiringJobs\(\)/.test(src));
}

/* Employer routes must NOT use the cached corpus: an employer editing a
   posting has to see their own change with no staleness window. */
for (const file of ['app/api/hiring/jobs/mine/route.ts', 'app/api/hiring/jobs/[jobId]/route.ts']) {
  const src = readFileSync(file, 'utf8');
  check(`${file.split('/').slice(-2).join('/')} reads employer jobs uncached`,
    !src.includes('getHiringJobsCached'));
}

/* ═══ ATS normalization memo: speed must not change the score ════════════ */

const CAND = {
  id: 'u1',
  profile: {
    headline: 'Senior Software Engineer',
    bio: 'Building web platforms.',
    skills: ['TypeScript', 'React', 'Node.js', 'MongoDB'],
    location: 'Bengaluru',
    interests: ['distributed systems'],
  },
  resumeText: 'Senior Software Engineer, 6 years. TypeScript, React, MongoDB, Docker, CI/CD.',
};

const scored = Array.from({ length: 12 }, (_, i) => job(i, {
  description: `Engineer ${i}. Requirements: ${i % 2 ? 'TypeScript' : 'Python'}, React, Node.js, Kubernetes.`,
} as Partial<HiringJobPosting>));

/* THE PROPERTY THAT MATTERS: a memo hit must produce byte-identical output to
   a cold computation. If it does not, the optimization changed the product. */
let mismatch = 0;
for (const j of scored) {
  clearAtsMatchMemos();
  const cold = JSON.stringify(evaluateJobMatch(j, CAND as never));
  const warm = JSON.stringify(evaluateJobMatch(j, CAND as never));
  if (cold !== warm) mismatch += 1;
}
check('a memo hit scores identically to a cold computation', mismatch === 0);

/* Scoring many jobs in one pass must not let one job's normalization leak into
   another's result. */
clearAtsMatchMemos();
const isolated = scored.map((j) => { clearAtsMatchMemos(); return JSON.stringify(evaluateJobMatch(j, CAND as never)); });
clearAtsMatchMemos();
const batched = scored.map((j) => JSON.stringify(evaluateJobMatch(j, CAND as never)));
check('scoring in a batch matches scoring in isolation',
  isolated.every((v, i) => v === batched[i]));

/* TWO POSTINGS WITH THE SAME TITLE and different requirements. A memo keyed on
   the title alone would serve the first one's normalized description for the
   second — the same-title collision is the realistic form of this bug, since
   "Software Engineer" is posted by everyone. */
clearAtsMatchMemos();
const sameTitleA = job(90, { title: 'Software Engineer',
  description: 'Requirements: TypeScript, React, Node.js, MongoDB.' } as Partial<HiringJobPosting>);
const sameTitleB = job(91, { title: 'Software Engineer',
  description: 'Requirements: Photoshop, Illustrator, InDesign, brand design.' } as Partial<HiringJobPosting>);
const aScore = evaluateJobMatch(sameTitleA, CAND as never);
const bScore = evaluateJobMatch(sameTitleB, CAND as never);
check('two same-title postings score differently on their own requirements',
  JSON.stringify(aScore.matchedSkills) !== JSON.stringify(bScore.matchedSkills)
  || aScore.score !== bScore.score);
clearAtsMatchMemos();
const bAlone = evaluateJobMatch(sameTitleB, CAND as never);
check('the second same-title posting matches its cold score',
  JSON.stringify(bScore) === JSON.stringify(bAlone));

/* A different candidate against a cached job must NOT inherit the first
   candidate's result — the classic memo-key bug. */
clearAtsMatchMemos();
const other = { id: 'u2', profile: { headline: 'Marketing Manager', skills: ['SEO', 'Copywriting'], location: 'Delhi' }, resumeText: 'Marketing manager. SEO, campaigns, copywriting.' };
const forCand1 = JSON.stringify(evaluateJobMatch(scored[0], CAND as never));
const forCand2 = JSON.stringify(evaluateJobMatch(scored[0], other as never));
check('a second candidate does not inherit the first candidate\'s score',
  forCand1 !== forCand2);
clearAtsMatchMemos();
check('and that second score matches a cold computation',
  JSON.stringify(evaluateJobMatch(scored[0], other as never)) === forCand2);

/* The memo must be BOUNDED. Exceeding it must evict, not corrupt. */
clearAtsMatchMemos();
const many = Array.from({ length: 400 }, (_, i) => job(i, {
  description: `Distinct posting ${i}. Requirements: Skill${i}, React.`,
} as Partial<HiringJobPosting>));
for (const j of many) evaluateJobMatch(j, CAND as never);
const afterEviction = JSON.stringify(evaluateJobMatch(many[0], CAND as never));
clearAtsMatchMemos();
check('results stay correct after the memo evicts',
  afterEviction === JSON.stringify(evaluateJobMatch(many[0], CAND as never)));

/* evaluateAts must honour pre-normalized inputs and produce the same answer. */
const jdText = 'Requirements: TypeScript, React, Node.js. Responsibilities: ship features.';
const resumeInput = { headline: 'Engineer', bio: null, location: 'Bengaluru',
  skills: ['TypeScript', 'React'], experience: [], education: [], achievements: [], certifications: [] };
const plain = evaluateAts({ resume: resumeInput as never, resumeText: CAND.resumeText, jobDescription: jdText, jobTitle: 'Engineer' });
const preNorm = evaluateAts({
  resume: resumeInput as never, resumeText: CAND.resumeText, jobDescription: jdText, jobTitle: 'Engineer',
  normalizedJd: normalizeJd(jdText, 'Engineer'),
  normalizedResume: normalizeResume(resumeInput as never, CAND.resumeText),
});
check('pre-normalized input yields the identical evaluation',
  JSON.stringify(plain) === JSON.stringify(preNorm));
check('and the identical overall score', plain.overallScore === preNorm.overallScore);
check('and the identical band', plain.band === preNorm.band);

/* The two calls above are equivalent BY DESIGN, so passing the same values
   proves nothing about whether the parameter is read at all. This one passes a
   DELIBERATELY DIFFERENT normalized JD: if evaluateAts ignored it and
   re-normalized `jobDescription`, the result would be unchanged. */
const otherJd = 'Requirements: Photoshop, Illustrator, InDesign, brand and print design.';
const substituted = evaluateAts({
  resume: resumeInput as never, resumeText: CAND.resumeText,
  jobDescription: jdText, jobTitle: 'Engineer',
  normalizedJd: normalizeJd(otherJd, 'Designer'),
});
check('the supplied normalized JD is actually used, not recomputed',
  JSON.stringify(substituted.keyword) !== JSON.stringify(plain.keyword));

/* Same proof for the résumé side. */
const otherResume = { headline: 'Graphic Designer', bio: null, location: 'Delhi',
  skills: ['Photoshop', 'Illustrator'], experience: [], education: [], achievements: [], certifications: [] };
const substitutedResume = evaluateAts({
  resume: resumeInput as never, resumeText: CAND.resumeText,
  jobDescription: jdText, jobTitle: 'Engineer',
  normalizedResume: normalizeResume(otherResume as never, 'Graphic designer. Photoshop, Illustrator.'),
});
check('the supplied normalized résumé is actually used, not recomputed',
  JSON.stringify(substitutedResume.keyword) !== JSON.stringify(plain.keyword));

/* The memo must actually be wired in — a structural check, because timing
   assertions are unreliable in CI. */
const matchSrc = readFileSync('lib/server/job-sources/ats-match.ts', 'utf8');
check('the JD normalizer is memoized across requests', /jdMemo\.set\(/.test(matchSrc));
check('the memo is bounded', /JD_MEMO_LIMIT\s*=\s*\d+/.test(matchSrc));
check('the memo evicts its oldest entry', /jdMemo\.delete\(oldest\)/.test(matchSrc));
/* The shared side must be reusable explicitly, not only via the memo. */
check('callers can pass a pre-normalized shared side',
  /shared: SharedNormalization/.test(matchSrc));
check('the JD helper is exported for one-per-job reuse',
  /export function normalizeJobForMatch/.test(matchSrc));
check('the résumé helper is exported for one-per-candidate reuse',
  /export function normalizeCandidateForMatch/.test(matchSrc));

/* ═══ /jobs/my must not issue the same employer query twice ══════════════ */

const myJobsSrc = readFileSync('components/jobs/MyJobsPage.tsx', 'utf8');
const postedSrc = readFileSync('components/jobs/my/PostedJobs.tsx', 'utf8');
check('the probe requests a full first page, not a bare count',
  myJobsSrc.includes('pageSize=${SEED_PAGE_SIZE}'));
check('and hands it to the panel as a seed', myJobsSrc.includes('seed={seedPosted}'));
check('the panel accepts a seed', postedSrc.includes('seed?: PostedSeed | null'));
check('the panel skips the duplicate first load', postedSrc.includes('if (seedUsed.current)'));
/* One-shot: a filter, sort or page change must still hit the server. */
check('the seed is consumed after one use', postedSrc.includes('seedUsed.current = false'));
check('the probe and the panel agree on the query',
  postedSrc.includes('SEED_PAGE_SIZE = 20') && postedSrc.includes("SEED_SORT = 'newest'"));

/* ═══ Shared-side normalization: counted, and proven score-identical ═════ */

const SHARED_JOBS = Array.from({ length: 25 }, (_, i) => job(100 + i, {
  title: `Senior Software Engineer ${i % 7}`,
  description: `Engineer ${i}. Requirements: ${i % 3 === 0 ? 'TypeScript' : i % 3 === 1 ? 'Python' : 'Go'}, React, Node.js, Kubernetes.`,
} as Partial<HiringJobPosting>));

const SHARED_CAND: MatchCandidate = {
  id: 'shared-1',
  profile: { headline: 'Senior Software Engineer', bio: 'Building platforms.',
    skills: ['TypeScript', 'React', 'Node.js', 'MongoDB'], location: 'Bengaluru' },
  resumeText: 'Engineer, 6 years. TypeScript, React, MongoDB, Docker, CI/CD.',
};

/* ONE CANDIDATE × MANY JOBS — the résumé must be normalized ONCE. */
resetAtsNormalizationStats();
for (const j of SHARED_JOBS) evaluateJobMatch(j, SHARED_CAND);
const naive = atsNormalizationStats();
check('without sharing, the résumé is normalized once per job',
  naive.resume === SHARED_JOBS.length);

resetAtsNormalizationStats();
const sharedResume = normalizeCandidateForMatch(SHARED_CAND);
for (const j of SHARED_JOBS) evaluateJobMatch(j, SHARED_CAND, { resume: sharedResume });
const withShared = atsNormalizationStats();
check('with sharing, the résumé is normalized exactly once', withShared.resume === 1);
check('and that is fewer than one per job', withShared.resume < naive.resume);

/* MANY CANDIDATES × ONE JOB — the JD must be normalized ONCE, and that must
   hold WITHOUT relying on the cross-request memo. */
const CANDS: MatchCandidate[] = Array.from({ length: 40 }, (_, i) => ({
  id: `c${String(i).padStart(3, '0')}`,
  profile: { headline: `Engineer ${i}`, skills: ['TypeScript', 'React'].slice(0, 1 + (i % 2)), location: 'Bengaluru' },
  resumeText: `Engineer with ${3 + (i % 8)} years. TypeScript, React.`,
}));
resetAtsNormalizationStats();
rankCandidates(SHARED_JOBS[0], CANDS);
const rankStats = atsNormalizationStats();
check('ranking many candidates normalizes the JD exactly once', rankStats.jd === 1);
check('and normalizes each candidate exactly once', rankStats.resume === CANDS.length);
/* The count above is also satisfied by the cross-request memo, so it cannot
   tell whether rankCandidates shares explicitly. This asserts the explicit
   hand-off, which is what makes the guarantee hold even after an eviction. */
check('rankCandidates passes the JD to every evaluation',
  /evaluateJobMatch\(job, c, \{ jd \}\)/.test(readFileSync('lib/server/job-sources/ats-match.ts', 'utf8')));

/* SCORES MUST BE UNCHANGED — the whole point. */
resetAtsNormalizationStats();
const independent = SHARED_JOBS.map((j) => JSON.stringify(evaluateJobMatch(j, SHARED_CAND)));
resetAtsNormalizationStats();
const reused = SHARED_JOBS.map((j) => JSON.stringify(
  evaluateJobMatch(j, SHARED_CAND, { resume: normalizeCandidateForMatch(SHARED_CAND) })));
check('shared-résumé scoring is byte-identical to independent scoring',
  independent.every((v, i) => v === reused[i]));

resetAtsNormalizationStats();
const perCandidate = CANDS.map((c) => JSON.stringify(evaluateJobMatch(SHARED_JOBS[0], c)));
resetAtsNormalizationStats();
const sharedJd = normalizeJobForMatch(SHARED_JOBS[0]);
const perCandidateShared = CANDS.map((c) => JSON.stringify(
  evaluateJobMatch(SHARED_JOBS[0], c, { jd: sharedJd })));
check('shared-JD scoring is byte-identical to independent scoring',
  perCandidate.every((v, i) => v === perCandidateShared[i]));

/* rankCandidates as a whole must equal the naive implementation. */
resetAtsNormalizationStats();
const rankedOut = JSON.stringify(rankCandidates(SHARED_JOBS[0], CANDS));
const naiveOut = JSON.stringify(CANDS.map((c) => evaluateJobMatch(SHARED_JOBS[0], c))
  .sort((a, b) => (b.score - a.score) || a.candidateId.localeCompare(b.candidateId)));
check('rankCandidates output is byte-identical to the naive ranking', rankedOut === naiveOut);

/* personalizedPage must produce identical rows with and without the memo warm. */
clearAtsMatchMemos();
const pCold = JSON.stringify(personalizedPage({
  rankedJobs: SHARED_JOBS, candidate: SHARED_CAND, page: 1, pageSize: 25 }).items);
const pWarm = JSON.stringify(personalizedPage({
  rankedJobs: SHARED_JOBS, candidate: SHARED_CAND, page: 1, pageSize: 25 }).items);
check('personalizedPage rows are identical cold and warm', pCold === pWarm);
check('and every row carries a real score', JSON.parse(pCold).every((r: { atsScore: number | null }) => typeof r.atsScore === 'number'));

/* THE SHARED VALUE MUST BE THE RIGHT ONE. Sharing a résumé that is not this
   candidate's would still normalize exactly once — and silently score every row
   against the wrong person. So each row's score is compared against an
   independent evaluation of the same pair. */
const pageRows = personalizedPage({
  rankedJobs: SHARED_JOBS, candidate: SHARED_CAND, page: 1, pageSize: 25 }).items;
let scoreDrift = 0;
for (const row of pageRows) {
  const source = SHARED_JOBS.find((j) => j.id === row.id)!;
  const independentScore = evaluateJobMatch(source, SHARED_CAND).score;
  if (row.atsScore !== independentScore) scoreDrift += 1;
}
check('every personalizedPage score equals an independent evaluation', scoreDrift === 0);
check('and the page actually scored something', pageRows.length === 25);

/* Same proof for the matched/missing skill lists, which the UI renders. */
const firstRow = pageRows[0];
const firstIndependent = evaluateJobMatch(SHARED_JOBS.find((j) => j.id === firstRow.id)!, SHARED_CAND);
check('matched skills match an independent evaluation',
  JSON.stringify(firstRow.matchedSkills) === JSON.stringify(firstIndependent.matchedSkills.slice(0, 12)));
check('missing required skills match an independent evaluation',
  JSON.stringify(firstRow.missingRequiredSkills) === JSON.stringify(firstIndependent.missingRequiredSkills.slice(0, 12)));
check('the band matches an independent evaluation', firstRow.atsBand === firstIndependent.band);

/* personalizedPage must normalize the résumé once for the whole page. */
resetAtsNormalizationStats();
personalizedPage({ rankedJobs: SHARED_JOBS, candidate: SHARED_CAND, page: 1, pageSize: 25 });
check('personalizedPage normalizes the résumé once per page',
  atsNormalizationStats().resume === 1);

/* Phase 7's buildRecommendations does the same for its pass. */
resetAtsNormalizationStats();
buildRecommendations(SHARED_JOBS, {
  userId: 'u1',
  profile: buildRecProfile({ headline: 'Engineer', skills: ['TypeScript'], location: 'Bengaluru' } as never),
  candidate: SHARED_CAND,
  now: Date.parse('2026-09-02T00:00:00.000Z'),
});
check('buildRecommendations normalizes the résumé once per pass',
  atsNormalizationStats().resume === 1);

/* The JD memo key must be the FULL text, never a hash — a collision would
   serve one posting's description for another and change a score. */
const matchSrc2 = readFileSync('lib/server/job-sources/ats-match.ts', 'utf8');
check('the JD memo keys on the full text, not a hash',
  /const key = `\$\{title\}\\u0000\$\{jdText\}`/.test(matchSrc2));
check('no hash function is used for memo keys', !/fnv|0x811c9dc5/i.test(matchSrc2));
check('the JD memo is bounded', /JD_MEMO_LIMIT\s*=\s*\d+/.test(matchSrc2));
/* Résumés are personal data and must not sit in a process-wide map. */
check('résumés are not memoized across requests', !/resumeMemo/.test(matchSrc2));

/* ═══ API CONTRACT: the serialization change must not drop a field ═══════ */

/* publicJobs now pages BEFORE serializing. If that refactor ever drops or
   renames a field, this is what notices — the public feed is a contract. */
const CONTRACT_FIELDS = [
  'id', 'title', 'organizationName', 'location', 'city', 'state', 'country',
  'isIndia', 'workMode', 'employmentType', 'experienceLevel', 'department',
  'description', 'responsibilities', 'requirements', 'preferredSkills',
  'domain', 'subDomain', 'salaryMin', 'salaryMax', 'salaryCurrency',
  'salaryPeriod', 'postedAt', 'createdAt', 'updatedAt', 'applyUrl', 'shareUrl',
] as const;

const contractJob = job(9001, {
  city: 'Bengaluru', state: 'Karnataka', country: 'IN', isIndia: true,
  experienceLevel: 'senior', department: 'Engineering',
  domain: 'engineering', subDomain: 'backend',
  salaryMin: 100000, salaryMax: 200000, salaryCurrency: 'INR', salaryPeriod: 'year',
  postedAt: '2026-08-01T00:00:00.000Z', applyUrl: 'https://example.com/apply',
  shareUrl: 'https://example.com/job',
} as Partial<HiringJobPosting>);
const contractRow = publicJobs([contractJob], { page: 1, pageSize: 20 }).items[0];
for (const field of CONTRACT_FIELDS) {
  check(`public job response still carries "${field}"`, field in contractRow);
}
check('description survives the page-then-serialize refactor',
  String(contractRow.description ?? '').length > 0);

/* And the allow-list must not have WIDENED: ingestion and ownership fields
   must never reach a public response. */
const NEVER_PUBLIC = ['contentHash', 'sourceId', 'sourceJobId', 'dedupGroupId',
  'ingestedAt', 'lastSeenAt', 'minimumAtsScore', 'organizationId',
  'createdByUserId', 'createdByEmail', 'classificationVersion', 'resumeText'];
for (const field of NEVER_PUBLIC) {
  check(`public job response never exposes "${field}"`, !(field in contractRow));
}

/* ═══ SECURITY: caching must not change who can see what ═════════════════ */

/* The public feed is served from a CACHED corpus. A draft or closed posting
   must still be excluded — caching must never widen visibility. */
const mixed = [
  job(9100, { status: 'draft' } as Partial<HiringJobPosting>),
  job(9101, { status: 'published', isActive: false } as Partial<HiringJobPosting>),
  job(9102, { status: 'published', expiresAt: '2026-01-01T00:00:00.000Z' } as Partial<HiringJobPosting>),
  job(9103, { status: 'published' } as Partial<HiringJobPosting>),
];
const publicIds = publicJobs(mixed, { page: 1, pageSize: 20 }).items.map((r) => r.id);
check('a draft posting is never public', !publicIds.includes('job-9100'));
check('a deactivated posting is never public', !publicIds.includes('job-9101'));
check('an expired posting is never public', !publicIds.includes('job-9102'));
check('a published posting is public', publicIds.includes('job-9103'));
check('exactly one of the four is public', publicIds.length === 1);

/* Applicant rows must never carry another candidate's data or a résumé URL —
   re-asserted here because the ranking path was touched for performance. */
const leakProbe = rankApplicants([app('alice', 90), app('bob', 80)], { page: 1, pageSize: 10 });
const leakJson = JSON.stringify(leakProbe.items);
check('applicant rows carry no résumé URL', !leakJson.includes('storage.example'));
check('applicant rows carry no résumé text', !leakJson.includes('resume text'));
check('applicant rows carry no organizationId', !leakJson.includes('organizationId'));

/* ═══ Employer freshness vs public caching ═══════════════════════════════ */

const hiringSrc = readFileSync('lib/server/hiring.ts', 'utf8');
check('the raw-corpus cache is cleared by the single write path',
  /invalidatePublishedHiringJobs\(\)/.test(hiringSrc)
  && /rawCache = null/.test(hiringSrc));
check('saveHiringJobs invalidates before returning',
  hiringSrc.indexOf('rawCache = null') > 0);
/* The GUARD itself, not merely the identifier: concurrent cold callers must
   return the in-flight promise instead of each starting their own 2.7 MB read. */
check('the cache is single-flighted against a stampede',
  /if \(rawInFlight\) return rawInFlight;/.test(hiringSrc));
check('and the in-flight promise is cleared on failure',
  /rawInFlight = null;[\s\S]{0,120}throw error/.test(hiringSrc));
check('the cache is revalidated by a version probe, not trusted forever',
  /readHiringCorpusVersion/.test(hiringSrc));

/* ═══ COMPLEXITY: work must scale with the PAGE, not the corpus ══════════ */

/* Each stage is counted by instrumenting the field it reads. `candidateEmail`
   is touched ONLY by the applicant row builder, so counting its reads counts
   row constructions exactly — no production code is modified. */
function countingApp(i: number, counter: { n: number }): HiringJobApplication {
  const raw: Record<string, unknown> = {
    id: `ca-${i}`, jobId: 'job-0001', candidateUserId: `cu${String(i).padStart(5, '0')}`,
    candidateName: `Candidate ${i}`, organizationId: 'org1', organizationName: 'Acme',
    jobTitle: 'Engineer', atsScore: (i * 37) % 101, status: 'submitted',
    appliedAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
    resumeFileName: 'cv.pdf',
  };
  Object.defineProperty(raw, 'candidateEmail', {
    get() { counter.n += 1; return `c${i}@example.com`; }, enumerable: true,
  });
  return raw as unknown as HiringJobApplication;
}

for (const A of [200, 2000]) {
  const counter = { n: 0 };
  const pool = Array.from({ length: A }, (_, i) => countingApp(i, counter));
  counter.n = 0;
  const paged = rankApplicants(pool, { page: 1, pageSize: 25 });
  check(`rankApplicants builds <= 25 rows for A=${A}`, counter.n <= 25);
  check(`rankApplicants returns 25 rows for A=${A}`, paged.items.length === 25);
  check(`rankApplicants reports the true total for A=${A}`, paged.total === A);
  /* THE POINT: constructions must NOT grow with the corpus. */
  check(`rankApplicants row construction is independent of A=${A}`, counter.n < A);
}

/* publicJobs: description serialization must stay at P as N grows 50x. */
function countingJob(i: number, counter: { n: number }): HiringJobPosting {
  const raw: Record<string, unknown> = {
    id: `cj-${String(i).padStart(5, '0')}`, title: `Role ${i}`, organizationName: 'Acme',
    organizationId: 'org1', location: 'Bengaluru', workMode: 'hybrid',
    employmentType: 'full_time', requirements: ['TypeScript'], responsibilities: ['Ship'],
    preferredSkills: ['React'], status: 'published',
    createdAt: new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString(),
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
  Object.defineProperty(raw, 'description', {
    get() { counter.n += 1; return 'Requirements: TypeScript, React.'; }, enumerable: true,
  });
  return raw as unknown as HiringJobPosting;
}

const counts: number[] = [];
for (const N of [100, 5000]) {
  const c = { n: 0 };
  const corpus = Array.from({ length: N }, (_, i) => countingJob(i, c));
  c.n = 0;
  publicJobs(corpus, { page: 1, pageSize: 20 });
  counts.push(c.n);
  check(`publicJobs serializes <= 20 descriptions for N=${N}`, c.n <= 20);
}
check('publicJobs serialization does not grow with the corpus', counts[0] === counts[1]);

/* personalizedPage: ATS enrichment must stay at P as N grows 50x. */
const enrichCounts: number[] = [];
for (const N of [100, 5000]) {
  const c = { n: 0 };
  const corpus = Array.from({ length: N }, (_, i) => countingJob(i, c));
  c.n = 0;
  personalizedPage({ rankedJobs: corpus, candidate: SHARED_CAND as never, page: 1, pageSize: 25 });
  enrichCounts.push(c.n);
}
check('personalizedPage enrichment does not grow with the corpus',
  enrichCounts[0] === enrichCounts[1]);
check('personalizedPage enrichment is bounded by the page, not the corpus',
  enrichCounts[1] < 5000);

/* ═══ RANKING: O(J x profileSkills) -> ~O(J) ═════════════════════════════ */

const RSKILLS = ['typescript', 'react', 'node.js', 'mongodb', 'graphql', 'go', 'rust', 'kafka'];
const recJob = (i: number, over: Partial<RecJob> = {}): RecJob => ({
  id: `rj${i}`, title: `Senior Software Engineer ${i}`, organizationName: 'Acme',
  location: 'Bengaluru', employmentType: 'full_time', workMode: 'hybrid',
  experienceLevel: 'senior',
  description: `Requirements: ${RSKILLS.join(', ')}. Responsibilities: ship features.`,
  preferredSkills: ['typescript', 'react'], targetRoleKeywords: ['engineer'],
  createdAt: '2026-08-01T00:00:00.000Z', ...over,
});

const bigProfile = buildRecProfile({
  headline: 'Senior Software Engineer', location: 'Bengaluru',
  skills: Array.from({ length: 150 }, (_, i) => RSKILLS[i % RSKILLS.length] + (i >= RSKILLS.length ? String(i) : '')),
  experience: [{ title: 'Senior Software Engineer' }], interests: ['distributed systems'],
} as never);

/* The profile must carry a prebuilt Set, so skill overlap is O(jobSkills) per
   job instead of an array scan per job skill. */
check('buildRecProfile precomputes a skill Set', bigProfile.skillSet instanceof Set);
check('the Set holds exactly the profile skills',
  bigProfile.skillSet!.size === new Set(bigProfile.skills).size);

/* A profile WITHOUT the Set must score identically — the fallback path. */
const noSet = { ...bigProfile, skillSet: undefined };
const withSet = recommendMatch(bigProfile, recJob(1), Date.parse('2026-09-02T00:00:00.000Z'));
const without = recommendMatch(noSet, recJob(1), Date.parse('2026-09-02T00:00:00.000Z'));
check('the Set fast path scores identically to the array fallback',
  JSON.stringify(withSet) === JSON.stringify(without));

/* LAZINESS, counted. `profile.skills.filter` is the textHits scan — the single
   most expensive step. A job whose declared skills MATCHED must never run it. */
function countingProfile(base: typeof bigProfile, counter: { n: number }) {
  const arr = base.skills.slice() as string[] & { filter: unknown };
  const realFilter = Array.prototype.filter;
  Object.defineProperty(arr, 'filter', {
    value(this: string[], ...args: Parameters<typeof realFilter>) {
      counter.n += 1;
      return realFilter.apply(this, args as never);
    },
  });
  return { ...base, skills: arr as unknown as string[] };
}

const NOW = Date.parse('2026-09-02T00:00:00.000Z');
let c1 = { n: 0 };
recommendMatch(countingProfile(bigProfile, c1), recJob(2), NOW);          // declared skills MATCH
check('a matched job never runs the description scan', c1.n === 0);

let c2 = { n: 0 };
recommendMatch(countingProfile(bigProfile, c2),
  recJob(3, { preferredSkills: ['cobol'], targetRoleKeywords: ['mainframe'] }), NOW);
check('an unmatched job still runs the description scan once', c2.n === 1);

let c3 = { n: 0 };
recommendMatch(countingProfile(bigProfile, c3),
  recJob(4, { preferredSkills: [], targetRoleKeywords: [] }), NOW);
check('a job that declares no skills scans the description once', c3.n === 1);
check('and never more than once (the result is memoized)', c3.n <= 1);

/* Semantics preserved on the paths that DO need textHits. */
const noDeclared = recommendMatch(bigProfile, recJob(5, { preferredSkills: [], targetRoleKeywords: [] }), NOW);
check('a job with no declared skills still scores from text mentions', noDeclared.score > 0);
check('and still reports overlap', noDeclared.overlap === true);
check('and still explains itself',
  noDeclared.reasons.some((r) => /referenced|matching/.test(r)));

/* ═══ UI: never state a count before it is known ═════════════════════════ */

const feedSrc = readFileSync('components/JobsFeedPage.tsx', 'utf8');
check('the best-matches banner waits for the request to finish',
  /recommendedOnly && recState === 'ready' &&/.test(feedSrc));
check('the banner is not rendered on the loading state alone',
  !/\{recommendedOnly && \(\s*\n\s*<div className="mb-6/.test(feedSrc));

console.log(`\n${passed} checks passed, ${failed} failed.`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
console.log('ALL CHECKS PASSED');
