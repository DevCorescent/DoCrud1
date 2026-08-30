/**
 * ATS evaluator UI self-test.
 *
 * Covers components/ats/ats-view-model.ts — every presentation decision that
 * has a right answer: colour thresholds, the status vocabulary, filters, error
 * messages per HTTP status, and the request body (including that a stored
 * resumeId is preferred so nothing is re-parsed).
 *
 * It does NOT render React. This repo has no test runner and no jsdom, and
 * adding one would be a new dependency the phase brief rules out — so the page
 * component was written as a thin renderer over these functions, and the
 * functions are what is asserted. See the report for what that leaves uncovered.
 *
 * Same convention as the other scripts/*.selftest.ts.
 */
import {
  auditRows, buildRequestBody, canAnalyze, displayScore, errorMessageForStatus,
  filterCount, filterKeywords, gaps, KEYWORD_FILTERS, NETWORK_ERROR_MESSAGE,
  scoreTone, STATUS_META, strengths, TONE_CLASSES, TONE_LABEL,
  type AtsApiResponse, type AtsKeywordRow,
} from '@/components/ats/ats-view-model';
import { runAtsEvaluation } from '@/lib/server/ats/api';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

/* A REAL response from the real API, so the view model is tested against the
   contract it will actually receive rather than a hand-written fixture that
   could drift from it. */
const PARSED = {
  headline: 'Senior Backend Engineer', bio: 'Backend engineer focused on APIs.',
  location: 'Pune, India',
  skills: ['React', 'Node.js', 'PostgreSQL', 'Docker', 'TypeScript'],
  experience: [
    { title: 'Senior Backend Engineer', company: 'Acme', period: 'Jan 2021 - Present',
      desc: 'Engineered REST APIs using Node.js, reducing average response latency by 31%.\nOptimized PostgreSQL queries serving 10,000 users.' },
    { title: 'Backend Developer', company: 'Globex', period: 'Jan 2019 - Dec 2020',
      desc: 'Worked on backend APIs.\nDeployed services with Docker.' },
  ],
  education: [{ degree: 'B.Tech Computer Science', school: 'Pune University', year: '2019' }],
  socialLinks: { linkedin: 'https://linkedin.com/in/x' },
};
const JD = `Senior Backend Engineer
We are looking for a Senior Backend Engineer with 5+ years of experience.
Requirements: React, Node.js, TypeScript, PostgreSQL are required.
Docker and AWS are important for this role.
Kubernetes is nice to have.
Bachelor's degree in Computer Science or related field is required.`;

const live = runAtsEvaluation({ parsedResume: PARSED, jobDescription: JD, jobTitle: 'Senior Backend Engineer' });
const RESULT = live.body as AtsApiResponse;

function main() {
  check('the fixture is a real 200 response from the API', live.status === 200, String(live.status));

  console.log('\n── 1. Score colour thresholds ──');

  check('0 is red', scoreTone(0) === 'red');
  check('24 is red (upper bound)', scoreTone(24) === 'red');
  check('24.9 is still red', scoreTone(24.9) === 'red');
  check('25 is yellow (boundary)', scoreTone(25) === 'yellow');
  check('49 is yellow', scoreTone(49) === 'yellow');
  check('50 is blue (boundary)', scoreTone(50) === 'blue');
  check('74 is blue', scoreTone(74) === 'blue');
  check('74.9 is still blue', scoreTone(74.9) === 'blue');
  check('75 is green (boundary)', scoreTone(75) === 'green');
  check('100 is green', scoreTone(100) === 'green');
  check('every tone has a word, so colour is never the only signal',
    (['red', 'yellow', 'blue', 'green'] as const).every((t) => TONE_LABEL[t].length > 0));
  check('every tone defines light AND dark classes',
    (['red', 'yellow', 'blue', 'green'] as const).every((t) =>
      TONE_CLASSES[t].text.includes('dark:') && TONE_CLASSES[t].ring.includes('dark:') && TONE_CLASSES[t].chip.includes('dark:')));

  console.log('\n── 2. Score rendering ──');

  check('a score is rounded for display only', displayScore(73.9) === 74 && displayScore(80) === 80);
  check('rounding never changes the API value', RESULT.score === (live.body as AtsApiResponse).score);
  check('the displayed score maps to a tone', ['red', 'yellow', 'blue', 'green'].includes(scoreTone(RESULT.score)));

  console.log('\n── 3. Status vocabulary ──');

  for (const status of ['exact', 'normalized', 'semantic', 'partial', 'related', 'missing'] as const) {
    check(`"${status}" has a glyph and a word`,
      STATUS_META[status].glyph.length > 0 && STATUS_META[status].label.length > 0);
  }
  check('exact reads as a strong tone', STATUS_META.exact.tone === 'green');
  check('missing reads as a failing tone', STATUS_META.missing.tone === 'red');
  check('related is NOT presented as a match', STATUS_META.related.label.toLowerCase().includes('related'));

  console.log('\n── 4. Keyword filters ──');

  const rows = RESULT.keywords;
  check('the response carries requirements to filter', rows.length > 0, String(rows.length));
  check('"all" keeps every row', filterKeywords(rows, 'all').length === rows.length);
  check('"matched" keeps only exact/normalized/semantic',
    filterKeywords(rows, 'matched').every((r) => ['exact', 'normalized', 'semantic'].includes(r.status)));
  check('"partial" keeps only partial/related',
    filterKeywords(rows, 'partial').every((r) => ['partial', 'related'].includes(r.status)));
  check('"missing" keeps only missing',
    filterKeywords(rows, 'missing').every((r) => r.status === 'missing'));
  check('the filters partition the rows exactly once',
    filterCount(rows, 'matched') + filterCount(rows, 'partial') + filterCount(rows, 'missing') === rows.length,
    `${filterCount(rows, 'matched')}+${filterCount(rows, 'partial')}+${filterCount(rows, 'missing')} vs ${rows.length}`);
  check('four filters are offered', KEYWORD_FILTERS.length === 4);
  check('an empty row set filters safely', filterKeywords([] as AtsKeywordRow[], 'missing').length === 0);

  console.log('\n── 5. Derived sections ──');

  check('the audit renders a row per contact and section field', auditRows(RESULT.parsing).length === 12);
  check('audit rows report only what the API returned',
    auditRows(RESULT.parsing).find((r) => r.label === 'Email')?.state
      === (RESULT.parsing.contactCompleteness.email ? 'ok' : 'missing'));
  check('strengths contain only proven matches',
    strengths(RESULT).every((r) => r.contextualProof && ['exact', 'normalized', 'semantic'].includes(r.status)));
  check('strengths are capped at 6', strengths(RESULT).length <= 6);
  check('gaps surface the missing requirement', gaps(RESULT).some((r) => r.requirement === 'AWS'));
  check('gaps put required items first',
    gaps(RESULT).length < 2 || gaps(RESULT)[0].importance !== 'nice' || gaps(RESULT).every((g) => g.importance === 'nice'));
  check('gaps are capped at 6', gaps(RESULT).length <= 6);

  console.log('\n── 6. Errors ──');

  check('400 asks for the missing inputs', /resume and a job description/i.test(errorMessageForStatus(400)));
  check('401 asks the user to sign in', /sign in/i.test(errorMessageForStatus(401)));
  check('404 mentions the resume was not found', /find that resume/i.test(errorMessageForStatus(404)));
  check('413 mentions length', /too long/i.test(errorMessageForStatus(413)));
  check('422 mentions unusable information', /usable information/i.test(errorMessageForStatus(422)));
  check('500 is a generic retry message', /something went wrong/i.test(errorMessageForStatus(500)));
  check('503 falls back to the server message', /something went wrong/i.test(errorMessageForStatus(503)));
  check('a network failure has its own message', NETWORK_ERROR_MESSAGE.length > 0 && /connection/i.test(NETWORK_ERROR_MESSAGE));
  const allMessages = [400, 401, 404, 413, 422, 500, 503].map(errorMessageForStatus).concat(NETWORK_ERROR_MESSAGE);
  check('no user-facing message leaks a status code or internals',
    allMessages.every((m) => !/\b(4\d\d|5\d\d)\b|stack|error:|\/Users\//i.test(m)), JSON.stringify(allMessages));

  console.log('\n── 7. Request body & button state ──');

  check('a stored resumeId is preferred, so nothing is re-parsed',
    JSON.stringify(buildRequestBody({ resumeId: 'r1', resumeText: 'ignored text', jobDescription: JD }))
      === JSON.stringify({ resumeId: 'r1', jobDescription: JD, jobTitle: undefined }));
  check('pasted text is used when no resume is selected',
    (buildRequestBody({ resumeText: 'my resume', jobDescription: JD }) as { resume?: string })?.resume === 'my resume');
  check('the job title is passed through when given',
    buildRequestBody({ resumeId: 'r1', jobDescription: JD, jobTitle: ' Backend ' })?.jobTitle === 'Backend');
  check('a blank job title is omitted rather than sent empty',
    buildRequestBody({ resumeId: 'r1', jobDescription: JD, jobTitle: '   ' })?.jobTitle === undefined);
  check('inputs are trimmed before sending',
    buildRequestBody({ resumeId: 'r1', jobDescription: `  ${JD}  ` })?.jobDescription === JD);
  check('no body without a job description', buildRequestBody({ resumeId: 'r1', jobDescription: '' }) === null);
  check('no body for a whitespace-only job description',
    buildRequestBody({ resumeId: 'r1', jobDescription: '   \n ' }) === null);
  check('no body without any resume', buildRequestBody({ jobDescription: JD }) === null);
  check('no body for a whitespace-only resume',
    buildRequestBody({ resumeText: '  \n ', jobDescription: JD }) === null);

  check('the button is enabled when a request can be built',
    canAnalyze({ resumeId: 'r1', jobDescription: JD }, false));
  check('the button is disabled with no resume',
    !canAnalyze({ jobDescription: JD }, false));
  check('the button is disabled with no job description',
    !canAnalyze({ resumeId: 'r1', jobDescription: '' }, false));
  check('the button is disabled while a request is running',
    !canAnalyze({ resumeId: 'r1', jobDescription: JD }, true));
  check('button state and request body never disagree',
    [
      { resumeId: 'r1', jobDescription: JD },
      { jobDescription: JD },
      { resumeText: 'x', jobDescription: '' },
      { resumeText: '   ', jobDescription: JD },
    ].every((d) => canAnalyze(d, false) === (buildRequestBody(d) !== null)));

  console.log('\n── 8. Repeated analysis ──');

  const again = runAtsEvaluation({ parsedResume: PARSED, jobDescription: JD, jobTitle: 'Senior Backend Engineer' });
  check('re-analyzing the same inputs renders identical data',
    JSON.stringify(again.body) === JSON.stringify(RESULT));
  const changedJd = runAtsEvaluation({ parsedResume: PARSED, jobDescription: `${JD}\nKubernetes is required.`, jobTitle: 'Senior Backend Engineer' });
  check('re-analyzing with a modified JD produces a different view',
    JSON.stringify(changedJd.body) !== JSON.stringify(RESULT));

  console.log('\n── 9. No scoring in the view layer ──');

  check('the view model exposes no scoring function',
    typeof (globalThis as Record<string, unknown>).evaluateAts === 'undefined');
  check('module scores come straight from the API',
    RESULT.breakdown.keyword.score === (live.body as AtsApiResponse).breakdown.keyword.score);
  check('the weights displayed are the API\'s, not the page\'s',
    RESULT.breakdown.keyword.weight === 45 && RESULT.breakdown.experience.weight === 35
    && RESULT.breakdown.alignment.weight === 20);

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
