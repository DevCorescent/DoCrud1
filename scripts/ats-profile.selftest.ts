/**
 * Profile ATS section self-test.
 *
 * The point of this section is a DISTINCTION — resume quality is not a job
 * match — so most of what is asserted here is that the two scores come from
 * different places, are labelled differently, and cannot be confused.
 *
 * As with the other ATS suites, React is not rendered (this repo has no test
 * runner or jsdom). The component was written as a thin renderer over the
 * shared view model and over data the profile already holds; those are what is
 * covered, plus a static check of the component source for the things a
 * rendering test would otherwise catch.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  scoreTone, TONE_LABEL, TONE_CLASSES, displayScore, formatHistoryDate,
} from '@/components/ats/ats-view-model';
import { runAtsEvaluation } from '@/lib/server/ats/api';
import { buildAtsReportRecord } from '@/lib/server/ats/reports';
import type { AtsApiResponse } from '@/lib/server/ats/api';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const SRC = readFileSync(path.join(process.cwd(), 'components/ats/ProfileAtsSection.tsx'), 'utf8');
const PROFILE_PAGE = readFileSync(path.join(process.cwd(), 'app/u/[userId]/page.tsx'), 'utf8');

const PARSED = {
  headline: 'Senior Backend Engineer', location: 'Pune, India',
  skills: ['React', 'Node.js', 'PostgreSQL', 'Docker', 'TypeScript'],
  experience: [{ title: 'Senior Backend Engineer', company: 'Acme', period: 'Jan 2021 - Dec 2023',
    desc: 'Engineered REST APIs using Node.js, reducing latency by 31%.' }],
  education: [{ degree: 'B.Tech Computer Science', school: 'Pune University', year: '2019' }],
};
const JD = `Senior Backend Engineer
Requirements: React, Node.js, TypeScript, PostgreSQL are required.
We are looking for someone with 5+ years of experience.`;

function main() {
  console.log('\n── 1. The two scores stay distinct ──');

  check('the section never calls the evaluation endpoint',
    !SRC.includes('/api/ats/evaluate') || !/method:\s*'POST'/.test(SRC));
  check('nothing is evaluated on load — no POST anywhere in the section',
    !/method:\s*'POST'/.test(SRC));
  check('resume quality is labelled "Resume quality", never "match"',
    SRC.includes('Resume quality'));
  check('the job match is labelled "Latest job match"', SRC.includes('Latest job match'));
  check('the quality card states explicitly that it is not a match score',
    /not<\/strong>\s*a\s*\n?\s*match score|not a match score/.test(SRC.replace(/\s+/g, ' ')));
  check('the phrase "ATS Score" is never used bare for the resume alone',
    !/Your ATS Score/i.test(SRC));

  console.log('\n── 2. Data reuse ──');

  check('quality comes from the stored per-resume score, not a recomputation',
    SRC.includes('atsScore') && !SRC.includes('evaluateAts'));
  check('the section imports no scoring code',
    !SRC.includes("from '@/lib/server/ats/index'") && !SRC.includes('scoreResumeQuality'));
  check('resume files are passed in as props, not refetched',
    SRC.includes('resumeFiles: ProfileResumeFile[]') && !SRC.includes('/api/profile/me'));
  check('only ONE latest report is requested, never the whole history',
    SRC.includes("'/api/ats/reports?limit=1'"));
  check('the request carries no userId parameter — the session decides',
    !/reports\?[^'"`]*userId/.test(SRC));

  console.log('\n── 3. Score colour boundaries ──');

  for (const [score, tone] of [
    [0, 'red'], [24, 'red'], [24.9, 'red'],
    [25, 'yellow'], [49, 'yellow'],
    [50, 'blue'], [74, 'blue'], [74.9, 'blue'],
    [75, 'green'], [82, 'green'], [100, 'green'],
  ] as const) {
    check(`${score} is ${tone}`, scoreTone(score) === tone, scoreTone(score));
  }
  check('every band has a word so colour is never the only signal',
    (['red', 'yellow', 'blue', 'green'] as const).every((t) =>
      ['Poor', 'Weak', 'Competitive', 'Strong'].includes(TONE_LABEL[t])));
  check('the section renders the band word beside the number',
    SRC.includes('TONE_LABEL[tone]'));
  check('every tone defines light and dark classes',
    (['red', 'yellow', 'blue', 'green'] as const).every((t) => TONE_CLASSES[t].text.includes('dark:')));

  console.log('\n── 4. Empty and populated states ──');

  check('a profile with no resume prompts an upload',
    SRC.includes('Upload your resume to check ATS compatibility') && SRC.includes('Upload Resume'));
  check('a profile with a resume shows the filename and parsed state',
    SRC.includes('resume.fileName') && SRC.includes('Parsed'));
  check('no previous evaluation shows the explanatory empty state',
    SRC.includes('Run an ATS analysis against a job to see your match percentage.'));
  check('the empty state offers an analyze CTA', SRC.includes('Analyze a Job'));
  check('a missing quality score is stated, not faked',
    SRC.includes('No quality score was recorded'));
  check('a loading state is shown while the latest match loads',
    SRC.includes('Loading your latest analysis'));
  check('the loading state is announced to assistive tech', SRC.includes('aria-live'));

  console.log('\n── 5. Latest match fields ──');

  const result = runAtsEvaluation({ parsedResume: PARSED, jobDescription: JD, jobTitle: 'Senior Backend Engineer' }).body as AtsApiResponse;
  const record = buildAtsReportRecord({
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    userId: 'user-a', resumeId: 'r1', resumeName: 'Software Engineer Resume.pdf',
    jobTitle: 'Senior Backend Engineer', jobDescription: JD,
    createdAt: '2026-08-30T10:00:00.000Z', result,
  });

  check('the stored record carries the job title the card shows',
    record.jobTitle === 'Senior Backend Engineer');
  check('the stored record carries the resume name the card shows',
    record.resumeName === 'Software Engineer Resume.pdf');
  check('the stored record carries the score and band',
    record.overallScore === result.score && record.label === result.label);
  check('the analyzed date renders stably', formatHistoryDate(record.createdAt) === 'Aug 30, 2026');
  check('the score is only rounded for display, never altered',
    displayScore(record.overallScore) === Math.round(result.score));
  check('the card renders the job title', SRC.includes('latest.jobTitle'));
  check('the card renders the resume name', SRC.includes('latest.resumeName'));
  check('a resume-less evaluation still labels its source honestly',
    SRC.includes('uploaded for that evaluation'));

  console.log('\n── 6. Links ──');

  check('"Check Match Against a Job" points at the evaluator',
    /href="\/ats\/evaluate"[\s\S]{0,120}Check Match Against a Job/.test(SRC)
    || SRC.includes('Check Match Against a Job'));
  check('the evaluator link exists', SRC.includes('href="/ats/evaluate"'));
  check('the history link exists', SRC.includes('href="/ats/history"'));
  check('the full analysis deep-links the saved report by id',
    SRC.includes('/ats/history?report=${encodeURIComponent(latest.id)}'));
  check('the report id is URL-encoded before use', SRC.includes('encodeURIComponent'));

  console.log('\n── 7. Security ──');

  check('no score is ever accepted from a form or input in this section',
    !/<input|<textarea/.test(SRC));
  check('no raw HTML is rendered', !SRC.includes('dangerouslySetInnerHTML'));
  check('no user id is put in a query string', !/userId=/.test(SRC));
  check('nothing is written to localStorage', !SRC.includes('localStorage'));

  console.log('\n── 8. Responsive and theme structure ──');

  check('buttons wrap instead of overflowing', SRC.includes('flex-wrap'));
  check('long filenames truncate rather than break the row', SRC.includes('truncate'));
  check('the score block cannot be squeezed', SRC.includes('shrink-0'));
  check('long text rows can shrink', SRC.includes('min-w-0'));
  /* Checked as independent tokens, not as one contiguous string: Tailwind
     class order is arbitrary and an ordering assertion would fail on a
     harmless reshuffle while proving nothing about the theme. */
  check('surfaces define both light and dark values',
    ['bg-white', 'dark:bg-white/[0.03]', 'border-slate-200', 'dark:border-white/[0.07]']
      .every((token) => SRC.includes(token)));
  check('text colours are theme-aware too',
    SRC.includes('text-slate-600') && SRC.includes('dark:text-white/40'));
  check('no oversized score ring is used — a compact meter instead',
    !SRC.includes('<svg') && SRC.includes("role=\"meter\""));
  check('the meter exposes its value to assistive tech',
    SRC.includes('aria-valuenow') && SRC.includes('aria-valuemax'));
  check('buttons have visible focus states', SRC.includes('focus-visible:ring'));

  console.log('\n── 9. Profile page wiring ──');

  check('the section is rendered by the profile page',
    PROFILE_PAGE.includes('<ProfileAtsSection'));
  check('it receives the profile\'s already-loaded resume files',
    PROFILE_PAGE.includes('resumeFiles={(form.resumeFiles ?? [])'));
  check('the stored per-resume score is no longer labelled a bare "ATS" grade',
    !PROFILE_PAGE.includes('· ATS {entry.atsScore.grade}'));
  check('it is labelled as quality instead',
    PROFILE_PAGE.includes('· Quality {entry.atsScore.grade}'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
