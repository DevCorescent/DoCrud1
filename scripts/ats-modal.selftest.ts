/**
 * ATS results dialog + action-plan regression self-test.
 *
 * Two subjects:
 *   1. The action-plan JD leak — a DATA bug, asserted against the real engine.
 *   2. The dialog refactor — asserted as source contracts, since this repo has
 *      no test runner or jsdom. The behavioural half (open/close/Escape/scroll
 *      lock) is verified in a real browser instead; see the Phase 11 harness.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { runAtsEvaluation } from '@/lib/server/ats/api';
import { normalizeJd } from '@/lib/server/ats/jd';
import type { AtsApiResponse } from '@/lib/server/ats/api';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const MODAL = read('components/ats/AtsResultsModal.tsx');
const EVAL = read('components/ats/AtsEvaluatorPage.tsx');
const HISTORY = read('components/ats/AtsHistoryPage.tsx');

/* A posting pasted as ONE paragraph with no separate title — how people
   actually paste from a job board, and what triggered the leak. */
const JD_ONE_LINE = 'WHO WE ARE Most companies are racing to deploy AI and we are hiring a Business Development Representative to help. Requirements: Salesforce, Excel and CRM experience are required. You will prospect accounts and book meetings. A Bachelor degree is preferred.';
const RESUME = {
  headline: 'Software Engineer',
  skills: ['Excel'],
  experience: [{ title: 'Software Engineer', company: 'A', period: 'Jan 2022 - Dec 2023', desc: 'Worked on backend APIs.' }],
  education: [],
};

function main() {
  console.log('\n── 1. Action plan never contains the job description ──');

  const leaky = runAtsEvaluation({ parsedResume: RESUME, jobDescription: JD_ONE_LINE }).body as AtsApiResponse;

  check('no action-plan item contains the opening of the JD',
    !leaky.actionPlan.some((s) => s.includes('WHO WE ARE Most companies')),
    leaky.actionPlan.find((s) => s.includes('WHO WE ARE'))?.slice(0, 90));
  check('no action-plan item contains a long verbatim run of the JD',
    !leaky.actionPlan.some((s) => JD_ONE_LINE.includes(s.slice(0, 80)) && s.length > 80));
  check('every action-plan item stays a sentence, not a document',
    leaky.actionPlan.every((s) => s.length <= 320),
    String(Math.max(...leaky.actionPlan.map((s) => s.length))));
  check('an action plan is still produced', leaky.actionPlan.length >= 1 && leaky.actionPlan.length <= 3);

  /* The source: an implausible first line must not become the title. */
  check('a one-paragraph JD yields no derived title rather than a wrong one',
    normalizeJd(JD_ONE_LINE).title === '', JSON.stringify(normalizeJd(JD_ONE_LINE).title.slice(0, 60)));
  check('the derived title is not leaked into the report either',
    leaky.alignment.jdTitle.length <= 80, String(leaky.alignment.jdTitle.length));

  /* A posting that genuinely leads with its title keeps it. */
  const titled = normalizeJd('Senior Backend Engineer\nWe are looking for someone with 5+ years.');
  check('a real leading title is still used', titled.title === 'Senior Backend Engineer', titled.title);
  const clause = normalizeJd('Senior Backend Engineer - We are looking for an experienced engineer to join our platform team in Pune.');
  check('a title followed by a dash is recovered from the leading clause',
    clause.title === 'Senior Backend Engineer', clause.title);
  const longFirstLine = normalizeJd('We are a fast growing company that is looking for many different kinds of people to join our teams across the world this year.');
  check('a prose first line yields no title', longFirstLine.title === '', longFirstLine.title);

  /* A caller-supplied title is untrusted and must be clipped in the plan. */
  const hugeTitle = runAtsEvaluation({
    parsedResume: RESUME, jobDescription: JD_ONE_LINE, jobTitle: 'X'.repeat(400),
  }).body as AtsApiResponse;
  check('an oversized caller-supplied title cannot bloat a recommendation',
    hugeTitle.actionPlan.every((s) => s.length <= 320),
    String(Math.max(...hugeTitle.actionPlan.map((s) => s.length))));

  console.log('\n── 2. Scoring is unchanged by the fix ──');

  const withTitle = runAtsEvaluation({
    parsedResume: RESUME, jobDescription: JD_ONE_LINE, jobTitle: 'Business Development Representative',
  }).body as AtsApiResponse;
  check('the weights are still 45 / 35 / 20',
    withTitle.breakdown.keyword.weight === 45 && withTitle.breakdown.experience.weight === 35
    && withTitle.breakdown.alignment.weight === 20);
  check('the score is still the weighted sum, capped',
    Math.abs(withTitle.score - Math.min(
      withTitle.breakdown.keyword.weightedScore + withTitle.breakdown.experience.weightedScore
      + withTitle.breakdown.alignment.weightedScore,
      withTitle.breakdown.parsingCap.cap,
    )) < 0.11);
  check('the same input still produces the same score',
    (runAtsEvaluation({ parsedResume: RESUME, jobDescription: JD_ONE_LINE }).body as AtsApiResponse).score === leaky.score);

  console.log('\n── 3. Dialog: structure and accessibility ──');

  check('it is a dialog', MODAL.includes('role="dialog"') && MODAL.includes('aria-modal="true"'));
  check('it is labelled by its own title', MODAL.includes('aria-labelledby={TITLE_ID}') && MODAL.includes('id={TITLE_ID}'));
  check('the close button has the required label', MODAL.includes('aria-label="Close ATS analysis"'));
  check('Escape closes it', MODAL.includes("e.key === 'Escape'") && MODAL.includes('onClose()'));
  check('focus moves into the dialog on open', MODAL.includes('closeRef.current?.focus()'));
  check('focus is restored to the trigger on close',
    MODAL.includes('restoreFocusRef') && EVAL.includes('analyzeRef.current?.focus()'));
  check('Tab is kept inside the dialog', MODAL.includes("e.key !== 'Tab'") && MODAL.includes('preventDefault'));
  check('a footer Close button exists', /Close\s*<\/button>/.test(MODAL));
  check('the backdrop closes only when the backdrop itself is pressed',
    MODAL.includes('e.target === e.currentTarget'));
  check('a press starting inside the report cannot dismiss it',
    MODAL.includes('onMouseDown') && !MODAL.includes('onClick={onClose}\n      >'));

  console.log('\n── 4. Dialog: scroll lock ──');

  check('body scrolling is locked while open', MODAL.includes("body.style.overflow = 'hidden'"));
  /* The document element is locked too. Locking only <body> measurably failed:
     the scrolling element on this layout is documentElement, so the page went
     on scrolling behind the open dialog. */
  check('the document element is locked as well as the body',
    MODAL.includes("root.style.overflow = 'hidden'"));
  check('the previous overflow of both is captured before either changes',
    MODAL.includes('rootOverflow: root.style.overflow') && MODAL.includes('bodyOverflow: body.style.overflow'));
  check('both overflow values are restored on close',
    MODAL.includes('root.style.overflow = previous.rootOverflow')
    && MODAL.includes('body.style.overflow = previous.bodyOverflow'));
  check('the scrollbar width is compensated so the page does not jump',
    MODAL.includes('window.innerWidth - root.clientWidth')
    && MODAL.includes('body.style.paddingRight'));
  check('the previous padding is restored too',
    MODAL.includes('body.style.paddingRight = previous.bodyPadding'));
  check('the cleanup runs on unmount as well as on close', MODAL.includes('return () => {'));

  console.log('\n── 5. Dialog: sizing and internal scrolling ──');

  check('the body is the only scrolling region', MODAL.includes('overflow-y-auto'));
  check('a flick inside the dialog does not scroll the page behind',
    MODAL.includes('overscroll-contain'));
  check('the header is outside the scrolling region', MODAL.includes('flex shrink-0 items-start justify-between'));
  check('desktop is centred and capped near 1080px',
    MODAL.includes('sm:items-center') && MODAL.includes('sm:max-w-[1080px]'));
  check('desktop height is capped at 88vh', MODAL.includes('sm:max-h-[88vh]'));
  check('mobile uses almost the whole screen',
    MODAL.includes('max-h-[calc(100vh-16px)]') && MODAL.includes('w-full') && MODAL.includes(' p-2 '));
  check('the panel has rounded corners and a border',
    MODAL.includes('rounded-2xl') && MODAL.includes('border border-slate-200'));
  check('there is a backdrop behind it', MODAL.includes('bg-slate-900/50') && MODAL.includes('dark:bg-black/70'));
  check('the dialog cannot itself cause page overflow', MODAL.includes('overflow-hidden'));
  check('it renders in a portal on document.body', MODAL.includes('createPortal') && MODAL.includes('document.body'));
  /* Regression: at z-1000 the global bottom navigation (z-9995) painted over
     the dialog footer on mobile and the Close button could not be clicked. */
  check('the dialog stacks above the global bottom navigation',
    MODAL.includes('z-[10000]'));

  console.log('\n── 6. Dialog: light and dark ──');

  for (const token of ['dark:border-white/[0.10]', 'dark:bg-[#08080b]', 'dark:bg-black/70', 'dark:text-white/45']) {
    check(`theme token present: ${token}`, MODAL.includes(token));
  }
  check('the footer button avoids the invisible-on-white trap',
    MODAL.includes('dark:text-[#020617]') && !MODAL.includes('dark:text-slate-900'));

  console.log('\n── 7. No duplicated report markup ──');

  check('the dialog renders the existing AtsResults', MODAL.includes('<AtsResults result={result} />'));
  check('the dialog does not reimplement the report',
    !MODAL.includes('Keyword match') && !MODAL.includes('Action plan'));
  /* Matched on the exact element, not the prefix: `<AtsResultsModal` also
     starts with `<AtsResults`, and a substring check would pass either way. */
  check('the evaluator no longer renders the report inline',
    !/<AtsResults[\s/>]/.test(EVAL), 'inline <AtsResults …> still present');
  check('the evaluator renders the dialog instead', EVAL.includes('<AtsResultsModal'));
  check('history uses the same dialog', HISTORY.includes('<AtsResultsModal') && !HISTORY.includes('<AtsResults '));

  console.log('\n── 8. Page behaviour around the dialog ──');

  check('the dialog never opens without a result', MODAL.includes('open && result !== null'));
  check('it opens only after a successful evaluation',
    /setResult\(\(await response\.json\(\)\) as AtsApiResponse\);\s*\n\s*setReportOpen\(true\);/.test(EVAL));
  check('an error path does not open it',
    EVAL.indexOf('setError(errorMessageForStatus') < EVAL.indexOf('setReportOpen(true)'));
  check('errors stay on the page, outside the dialog',
    EVAL.includes('role="alert"') && !MODAL.includes('role="alert"'));
  check('closing keeps the result available', EVAL.includes('setReportOpen(false)') && EVAL.includes('result &&'));
  check('a compact card summarises the result on the page', EVAL.includes('function ResultCard'));
  check('the card reopens the same result', EVAL.includes('View Full Analysis') && EVAL.includes('onOpen={() => setReportOpen(true)}'));
  check('the card shows the three module scores',
    EVAL.includes("['Keyword', breakdown.keyword.score]") && EVAL.includes("['Alignment', breakdown.alignment.score]"));
  check('the card states the band as a word, not only a colour', EVAL.includes('{result.label}'));
  check('a parsing cap is still surfaced on the card', EVAL.includes('breakdown.parsingCap.applied'));
  check('resetting clears the dialog too',
    /setResult\(null\);\s*\n\s*setReportOpen\(false\);/.test(EVAL));
  check('the loading behaviour is unchanged',
    EVAL.includes('Analyzing resume…') && EVAL.includes('pointer-events-none opacity-60'));

  console.log('\n── 9. History still works ──');

  check('the report deep link is untouched', HISTORY.includes("searchParams?.get('report')"));
  check('opening a row fetches that report', HISTORY.includes('/api/ats/reports/${encodeURIComponent(id)}'));
  check('the open control advertises a dialog', HISTORY.includes('aria-haspopup="dialog"'));
  check('closing clears the opened report', HISTORY.includes('setOpenReport(null)'));
  check('delete still works', HISTORY.includes("method: 'DELETE'"));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
