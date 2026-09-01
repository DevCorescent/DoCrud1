/**
 * Job-post composer self-test.
 *
 * The composer is now a seven-step wizard rather than one scrolling form, and
 * the highest-value assertions are unchanged by that: the PAYLOAD it sends and
 * the ENDPOINT it sends to must not have drifted. A redesign that quietly drops
 * `requiredDocuments` or renames `minimumAtsScore` would break posting for
 * every existing user, and nothing else in the suite would notice.
 *
 * The rest are source and behaviour contracts for the wizard's flow, theming
 * and accessibility. This repo has no test runner or jsdom, so the pure logic
 * (validation, payload, draft storage) is EXECUTED here, and only the
 * presentational guarantees are asserted against source.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  EMPTY_DRAFT, FIRST_SERVER_DRAFT_STEP, STEPS, STEP_IDS, buildJobPayload,
  canSaveServerDraft, draftFromJob, draftHasContent, isStepId, stepIndex,
  validateStep, type JobDraft, type StepId,
} from '@/lib/jobs/post-wizard';
import { indiaCitySuggestions } from '@/lib/server/job-scraper/india';
import { formatSalary } from '@/components/jobs/JobPostPreview';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const WIZARD = read('components/jobs/post/JobPostWizard.tsx');
const STEPS_SRC = read('components/jobs/post/steps.tsx');
const CHROME = read('components/jobs/post/WizardChrome.tsx');
const CONTROLS = read('components/jobs/post/controls.tsx');
const UI = read('components/jobs/post/ui.tsx');
const LOGIC = read('lib/jobs/post-wizard.ts');
const PREVIEW = read('components/jobs/JobPostPreview.tsx');
const HIRING = read('lib/server/hiring.ts');
const ROUTE = read('app/api/hiring/jobs/route.ts');
const PAGE = read('app/jobs/post/page.tsx');

/* Comments explain the colours, the endpoint and the trade-offs by name. An
   absence check against raw source would match the prose, not the code. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ALL_UI = [WIZARD, STEPS_SRC, CHROME, CONTROLS, UI].join('\n');
const ALL_CODE = strip(ALL_UI);

const filled: JobDraft = {
  ...EMPTY_DRAFT,
  title: 'Senior React Developer',
  location: 'Bengaluru',
  description: 'Build the marketplace front end.',
  department: 'Engineering',
  responsibilities: 'Ship features\n  \nReview PRs',
  requirements: '3+ years React',
  preferredSkills: 'React\nTypeScript',
  requiredDocuments: 'Portfolio',
  salaryMin: '800000',
  salaryMax: '1400000',
};

function main() {
  console.log('\n── 1. The data contract is unchanged ──');

  const payload = buildJobPayload(filled) as Record<string, unknown>;
  const PAYLOAD_FIELDS = [
    'title', 'department', 'location', 'employmentType', 'workMode',
    'experienceLevel', 'description', 'responsibilities', 'requirements',
    'preferredSkills', 'minimumAtsScore', 'requiredDocuments', 'status',
    'targetRoleKeywords',
  ];
  for (const field of PAYLOAD_FIELDS) {
    check(`the payload still carries "${field}"`, field in payload);
  }
  check('minimumAtsScore is still sent as a number', typeof payload.minimumAtsScore === 'number');
  for (const listField of ['responsibilities', 'requirements', 'preferredSkills', 'requiredDocuments']) {
    check(`${listField} is still a trimmed, blank-free array`, (() => {
      const v = payload[listField];
      return Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim() === x && x !== '');
    })());
  }
  check('a blank line in a list does not become an empty entry',
    (payload.responsibilities as string[]).length === 2);
  check('targetRoleKeywords are still derived from the title',
    JSON.stringify(payload.targetRoleKeywords) === JSON.stringify(['Senior', 'React', 'Developer']));
  check('the edit id still travels in the body',
    (buildJobPayload(filled, { editId: 'job-1' }) as Record<string, unknown>).id === 'job-1');
  check('a new post sends no id at all', !('id' in payload));
  check('ownership is never sent from the browser',
    !('organizationId' in payload) && !('createdByUserId' in payload) && !('createdByEmail' in payload));
  check('it still POSTs to the existing endpoint', WIZARD.includes("fetch('/api/hiring/jobs'"));
  check('no second job endpoint was invented',
    !/fetch\(['"`]\/api\/(?!hiring\/jobs|profile\/me)[^'"`]*job/i.test(ALL_UI));
  check('no draft endpoint was invented',
    !/\/api\/[^'"`]*draft/i.test(ALL_UI) && !/\/api\/[^'"`]*autosave/i.test(ALL_UI));

  console.log('\n── 2. Language and country are not faked ──');

  check('language is held in the draft', 'language' in EMPTY_DRAFT && 'country' in EMPTY_DRAFT);
  check('language is NOT sent to a server that cannot store it',
    !('language' in payload) && !('country' in payload));
  check('the UI says the choice is not part of the saved record',
    CONTROLS.includes('kept with your draft') && CONTROLS.includes('of the saved job record'));

  console.log('\n── 3. Compensation persists, and absence stays absence ──');

  const noSalary = buildJobPayload({ ...filled, salaryMin: '', salaryMax: '' }) as Record<string, unknown>;
  check('a posting with no salary sends no salary fields',
    !('salaryMin' in noSalary) && !('salaryMax' in noSalary) && !('salaryCurrency' in noSalary));
  check('a stated range is sent as numbers',
    payload.salaryMin === 800000 && payload.salaryMax === 1400000);
  check('a currency and period accompany any figure',
    payload.salaryCurrency === 'INR' && payload.salaryPeriod === 'year');
  check('a zero is treated as "not stated", never as a salary of zero',
    !('salaryMin' in (buildJobPayload({ ...filled, salaryMin: '0', salaryMax: '' }) as object)));
  check('a single figure is allowed',
    (buildJobPayload({ ...filled, salaryMax: '' }) as Record<string, unknown>).salaryMin === 800000);
  check('the server now reads the salary fields it used to drop',
    HIRING.includes('salaryFields(payload)') && HIRING.includes('function salaryFields'));
  check('the server refuses to silently swap an inverted range',
    /salaryMin > salaryMax[\s\S]{0,120}undefined/.test(HIRING));
  check('the server never stores a zero or NaN salary',
    /function normalizeSalary[\s\S]{0,300}n <= 0/.test(HIRING));
  check('salary is optional on the model, so no existing job is invalidated',
    read('types/document.ts').includes('salaryMin?: number'));

  console.log('\n── 4. formatSalary never invents a figure ──');

  check('no salary renders as nothing at all', formatSalary({}) === '');
  check('a zero renders as nothing', formatSalary({ salaryMin: '0', salaryMax: '0' }) === '');
  check('a range reads as a range', formatSalary({ salaryMin: '100', salaryMax: '200', salaryCurrency: 'INR', salaryPeriod: 'year' }).includes('–'));
  check('a lone minimum reads as a floor, not a range',
    formatSalary({ salaryMin: '100', salaryCurrency: 'INR' }).startsWith('From'));
  check('a lone maximum reads as a ceiling',
    formatSalary({ salaryMax: '100', salaryCurrency: 'INR' }).startsWith('Up to'));
  check('the period is stated', formatSalary({ salaryMin: '100', salaryPeriod: 'month' }).includes('per month'));
  check('an unknown currency code does not throw',
    typeof formatSalary({ salaryMin: '100', salaryCurrency: 'ZZZ' }) === 'string');

  console.log('\n── 5. Steps, and per-step validation ──');

  check('there are seven steps', STEPS.length === 7);
  check('the steps are in the agreed order',
    JSON.stringify(STEP_IDS) === JSON.stringify(
      ['basics', 'details', 'requirements', 'compensation', 'screening', 'preview', 'publish']));
  check('every step declares a heading and a caption',
    STEPS.every((s) => s.title.trim() && s.caption.trim() && s.label.trim()));
  check('an unknown step id is rejected', !isStepId('nonsense') && isStepId('basics'));
  check('an unknown step falls back to the first', stepIndex('nonsense') === 0);

  check('step 1 requires a title', 'title' in validateStep('basics', EMPTY_DRAFT));
  check('step 1 requires a location for an on-site role',
    'location' in validateStep('basics', { ...EMPTY_DRAFT, title: 'X', workMode: 'onsite' }));
  check('a REMOTE role needs no location',
    !('location' in validateStep('basics', { ...EMPTY_DRAFT, title: 'X', workMode: 'remote' })));
  check('step 2 requires a description', 'description' in validateStep('details', EMPTY_DRAFT));
  check('step 1 does NOT gate on the description — it is not on that page',
    !('description' in validateStep('basics', filled)));
  check('step 2 does NOT gate on the title — it is not on that page',
    !('title' in validateStep('details', { ...EMPTY_DRAFT, description: 'x' })));
  check('only the two fields the server requires are ever hard-gated', (() => {
    const hard = new Set<string>();
    for (const id of STEP_IDS) {
      for (const key of Object.keys(validateStep(id, EMPTY_DRAFT))) hard.add(key);
    }
    /* Location is conditional on work mode, and the ATS score has a default,
       so neither can block a poster who simply continues. */
    hard.delete('location');
    hard.delete('minimumAtsScore');
    return hard.size === 2 && hard.has('title') && hard.has('description');
  })());
  check('an inverted salary range is caught before it is sent',
    'salaryMax' in validateStep('compensation', { ...filled, salaryMin: '900', salaryMax: '100' }));
  check('a blank salary is valid', Object.keys(validateStep('compensation', EMPTY_DRAFT)).length === 0);
  check('a negative salary is rejected',
    'salaryMin' in validateStep('compensation', { ...filled, salaryMin: '-5' }));
  check('an ATS score outside 0-100 is rejected',
    'minimumAtsScore' in validateStep('screening', { ...filled, minimumAtsScore: '140' }));
  check('the default ATS score is valid',
    Object.keys(validateStep('screening', EMPTY_DRAFT)).length === 0);
  check('a fully filled draft passes every step',
    STEP_IDS.every((id) => Object.keys(validateStep(id, filled)).length === 0));

  console.log('\n── 6. Drafts ──');

  check('a server draft is impossible before title AND description exist',
    !canSaveServerDraft(EMPTY_DRAFT) && !canSaveServerDraft({ ...EMPTY_DRAFT, title: 'X' }));
  check('a server draft becomes possible once both exist', canSaveServerDraft(filled));
  check('Save draft is not offered before the step where it could succeed',
    FIRST_SERVER_DRAFT_STEP === STEP_IDS.indexOf('requirements' as StepId));
  check('by that step both required fields have been collected',
    STEP_IDS.indexOf('basics') < FIRST_SERVER_DRAFT_STEP
    && STEP_IDS.indexOf('details') < FIRST_SERVER_DRAFT_STEP);
  check('the wizard gates the button on both the step and the content',
    WIZARD.includes('index >= FIRST_SERVER_DRAFT_STEP && canSaveServerDraft(draft)'));
  check('a server draft posts through the existing endpoint with status draft',
    WIZARD.includes("submit('draft')") && LOGIC.includes('options.status ?? draft.status'));
  check('an empty draft is not treated as content worth restoring',
    !draftHasContent(EMPTY_DRAFT) && draftHasContent(filled));
  check('local drafts are namespaced per job so an edit cannot leak into a new post',
    LOGIC.includes('function storageKey') && /editId \? `\$\{DRAFT_KEY\}:\$\{editId\}`/.test(LOGIC));
  check('a stored draft from another job is refused', LOGIC.includes('parsed.editId !== editId'));
  check('a stale draft is refused rather than resurrected', LOGIC.includes('DRAFT_MAX_AGE_MS'));
  check('a draft written by an older build is merged, not rendered as undefined',
    LOGIC.includes('...EMPTY_DRAFT, ...parsed.draft'));
  check('blocked or full storage degrades instead of throwing',
    (LOGIC.match(/} catch {/g) ?? []).length >= 3);
  check('the local draft is cleared once the job is really saved',
    WIZARD.includes('clearLocalDraft(editId)'));
  check('only job text is stored locally — no session, token or account data',
    !/localStorage[\s\S]{0,400}(token|session|email|password)/i.test(strip(LOGIC)));

  console.log('\n── 7. The edit flow still works ──');

  const rebuilt = draftFromJob({
    title: 'T', description: 'D', responsibilities: ['a', 'b'], minimumAtsScore: 80,
    salaryMin: 100, salaryMax: 0, workMode: 'remote',
  });
  check('an existing job rebuilds into the draft', rebuilt.title === 'T' && rebuilt.description === 'D');
  check('arrays come back as newline text', rebuilt.responsibilities === 'a\nb');
  check('a stored number comes back as text for the input', rebuilt.minimumAtsScore === '80');
  check('a zero salary comes back blank, not "0"', rebuilt.salaryMax === '');
  check('a missing field takes the same default the server uses',
    rebuilt.employmentType === 'full_time' && rebuilt.experienceLevel === 'associate');
  check('the edit id is still read from the query', WIZARD.includes("params?.get('edit')"));
  check('editing still loads through the already-scoped endpoint',
    WIZARD.includes("fetch('/api/hiring/jobs', { cache: 'no-store' })"));
  check('a restored local draft is not clobbered by the fetched job',
    WIZARD.includes('draftHasContent(prev) ? prev : draftFromJob(found)'));
  check('the server still derives the owner from the session',
    HIRING.includes('jobOwnerId(actor)') && HIRING.includes('You can only manage jobs you posted.'));
  check('the route still rejects unauthenticated callers', ROUTE.includes("{ error: 'Unauthorized' }"));

  console.log('\n── 8. Routing and navigation ──');

  check('the route is still a single page', PAGE.includes('/jobs/post') || PAGE.includes('JobPostWizard'));
  check('the step lives in the URL so browser Back works', WIZARD.includes("query.set('step', next)"));
  check('the query is read back on navigation', WIZARD.includes("params?.get('step')"));
  check('useSearchParams is wrapped in Suspense so the build does not fail',
    PAGE.includes('<Suspense') && PAGE.includes('JobPostWizard'));
  check('the page metadata was preserved', PAGE.includes('buildPageMetadata'));
  check('Back moves a step rather than leaving the page',
    WIZARD.includes('goto(STEPS[index - 1].id)'));
  check('Back is hidden on the first step only', WIZARD.includes('showBack={index > 0}'));
  check('the rail cannot jump past the furthest step reached',
    CHROME.includes('const reachable = i <= furthest') && CHROME.includes('disabled={!reachable}'));
  check('the final action publishes rather than continuing',
    WIZARD.includes("step === 'publish' ? (editId ? 'Update job' : 'Publish job')"));
  check('a duplicate submit is refused synchronously',
    WIZARD.includes('submittingRef.current') && WIZARD.includes('if (submittingRef.current) return false;'));
  check('nothing is published without reaching the confirmation step',
    WIZARD.includes("if (step !== 'publish') { goto(STEPS[index + 1].id); return; }"));

  console.log('\n── 9. No long scrolling form ──');

  /* The redesign's whole purpose. Each step renders ONLY its own fields, so no
     single view can hold all thirteen again. */
  const perStep = ['JobBasicsStep', 'JobDetailsStep', 'JobRequirementsStep',
    'JobCompensationStep', 'JobScreeningStep'];
  for (const name of perStep) {
    check(`${name} exists as its own component`, STEPS_SRC.includes(`export function ${name}`));
  }
  check('the wizard renders exactly one step at a time',
    perStep.every((n) => (WIZARD.match(new RegExp(`<${n} `, 'g')) ?? []).length === 1)
    && WIZARD.includes("{step === 'basics' &&"));
  check('no step component renders another step', !STEPS_SRC.includes('<JobDetailsStep'));
  check('the fields are spread across steps, not gathered in one',
    !/JobBasicsStep[\s\S]{0,3000}job-ats/.test(STEPS_SRC));
  check('the content column is capped so lines stay readable',
    WIZARD.includes('max-w-2xl'));

  console.log('\n── 10. Responsive ──');

  check('the rail becomes a compact indicator below lg',
    CHROME.includes('lg:hidden') && CHROME.includes('Step {index + 1} of {STEPS.length}'));
  check('the desktop rail is hidden on phones', CHROME.includes('hidden lg:block'));
  check('the layout is a single column until lg', WIZARD.includes('lg:grid lg:grid-cols-'));
  check('the tips column only appears when there is room for it',
    WIZARD.includes('hidden xl:block') && UI.includes('hidden p-5 lg:block'));
  check('a hidden tip is relocated below the form, not dropped',
    WIZARD.includes('mt-6 xl:hidden'));
  check('paired fields stack to one column on small screens',
    STEPS_SRC.includes('grid gap-5 sm:grid-cols-2'));
  /* Fixed rather than sticky below `lg`: as the last child of its container,
     a sticky bar has nothing to stick against and fell below the fold. */
  check('the action bar is pinned on phones and static on desktop',
    CHROME.includes('fixed inset-x-0 bottom-0') && CHROME.includes('lg:static'));
  check('the page reserves room for the pinned bar so it covers no field',
    WIZARD.includes('pb-28') && WIZARD.includes('lg:pb-10'));
  check('the sticky bar respects the device safe area',
    CHROME.includes('env(safe-area-inset-bottom)'));
  check('the success actions stack on mobile',
    WIZARD.includes('flex-col items-stretch gap-2.5 sm:flex-row'));
  /* `max-w-[…]` and `min-w-[…]` are caps, not fixed widths — they shrink. Only
     a bare `w-[…px]` pins an element to a size the viewport may not have. */
  check('no fixed pixel width is used for the layout',
    !/(?<![a-z-])w-\[\d{3,}px\]/.test(ALL_UI));
  check('long values cannot break a row', WIZARD.includes('truncate') && STEPS_SRC.includes('truncate'));
  check('the dropdown list is capped so it cannot exceed the viewport',
    UI.includes('max-h-[min(320px,60vh)]'));
  check('the modal is capped to the viewport and scrolls internally',
    CONTROLS.includes('max-h-[85dvh]') && CONTROLS.includes('overflow-y-auto'));
  check('the modal is a bottom sheet on phones and centred from sm',
    CONTROLS.includes('items-end justify-center') && CONTROLS.includes('sm:items-center'));

  console.log('\n── 11. Both themes ──');

  /* Every colour utility that paints a surface or text must have a dark
     partner. A single unpaired one is how the old composer shipped a black
     form to light-mode posters. */
  const UNPAIRED = /(?<!dark:)(?<![\w-])(bg-slate-(?:50|100|200|900)|text-slate-(?:700|800|900)|border-slate-(?:200|300))\b/g;
  for (const [name, src] of [['wizard', WIZARD], ['steps', STEPS_SRC], ['chrome', CHROME], ['controls', CONTROLS], ['ui', UI]] as const) {
    const light = strip(src).match(UNPAIRED) ?? [];
    const hasDark = /dark:/.test(src);
    check(`${name} declares dark values alongside its light ones`, light.length === 0 || hasDark);
  }
  check('the input control declares both themes',
    UI.includes('bg-white/80 text-slate-900') && UI.includes('dark:bg-white/[0.04] dark:text-white'));
  check('the page ground declares both themes',
    WIZARD.includes('bg-slate-50') && WIZARD.includes('dark:bg-[#0A0A0C]'));
  check('the gradient declares both themes',
    WIZARD.includes('from-sky-50') && WIZARD.includes('dark:from-[#0d1018]'));
  check('the glass surface declares both themes',
    UI.includes('bg-white/70') && UI.includes('dark:bg-white/[0.04]'));
  check('the error state is visible in light mode too',
    UI.includes('bg-rose-50/80') && UI.includes('dark:bg-rose-500/[0.06]'));
  check('the theme toggle reuses the app-wide mechanism, not a local one',
    WIZARD.includes('applyColorMode') && WIZARD.includes('getStoredColorMode')
    && !ALL_CODE.includes('localStorage.setItem(\'theme'));
  check('no second theme system was introduced',
    !ALL_CODE.includes('ThemeProvider') && !ALL_CODE.includes('createContext'));
  /* app/globals.css rewrites dark-mode text for any class CONTAINING
     text-slate-800/900/950 or text-black — a substring match that also catches
     the `dark:` prefixed form. On a light-filled button that produced a
     1.0:1 invisible label. Nothing in the wizard may use those tokens. */
  check('no light-filled control uses a token the global sheet would repaint',
    !/dark:text-(slate-(800|900|950)|black)\b/.test(ALL_UI));
  check('the primary action states its dark text as an arbitrary value',
    CHROME.includes('dark:text-[#0b1220]'));

  check('the dropdown reuses the design system select',
    UI.includes("from '@/components/ui/select'") && !strip(UI).includes('<select'));

  console.log('\n── 12. Glass, restrained ──');

  check('there is exactly one glass surface definition', (LOGIC + UI).match(/export const GLASS =/g)?.length === 1);
  check('the glass carries a border and a blur', UI.includes('backdrop-blur-xl') && UI.includes('rounded-2xl border'));
  check('the ambient gradient is low-alpha, not a coloured wash',
    /bg-sky-400\/\[0\.\d\d\]/.test(WIZARD) && WIZARD.includes('blur-[150px]'));
  check('no neon glow or coloured rim was added',
    !/shadow-\[0_0_\d+px_.*(sky|indigo|emerald|violet)/.test(ALL_UI));

  console.log('\n── 13. Accessibility ──');

  check('every control is reached through a real label',
    UI.includes('<label htmlFor={id}') && !ALL_CODE.includes('placeholder-only'));
  check('the required marker is not an asterisk alone', UI.includes('<span className="sr-only"> required</span>'));
  check('errors are associated with their input', UI.includes('aria-describedby') && UI.includes('aria-invalid'));
  check('errors are announced', UI.includes('role="alert"'));
  check('the first invalid field receives focus', WIZARD.includes('.focus();'));
  check('focus moves to the new step heading', WIZARD.includes('headingRef.current?.focus()'));
  check('focus is visible, not only a border tint', UI.includes('focus-visible:ring-2'));
  check('the step rail exposes the current step', CHROME.includes("aria-current={active ? 'step' : undefined}"));
  check('the mobile progress bar is a real progressbar',
    CHROME.includes('role="progressbar"') && CHROME.includes('aria-valuenow'));
  check('a completed step still announces its position', CHROME.includes('— completed</span>'));
  check('the modal is a labelled dialog', CONTROLS.includes('role="dialog"') && CONTROLS.includes('aria-modal="true"'));
  check('the modal closes on Escape', CONTROLS.includes("e.key === 'Escape'"));
  check('the modal traps focus', CONTROLS.includes("e.key !== 'Tab'") && CONTROLS.includes('shiftKey'));
  check('focus returns to the trigger when the modal closes', CONTROLS.includes('triggerRef.current?.focus()'));
  check('the location field is a real combobox',
    CONTROLS.includes('role="combobox"') && CONTROLS.includes('role="listbox"') && CONTROLS.includes('role="option"'));
  check('the combobox supports arrow keys and Escape',
    CONTROLS.includes("e.key === 'ArrowDown'") && CONTROLS.includes("e.key === 'ArrowUp'"));
  check('the combobox reports the active option', CONTROLS.includes('aria-activedescendant'));
  check('decorative icons and art are hidden from assistive tech',
    read('components/jobs/post/StepArt.tsx').includes('aria-hidden'));
  check('the back control is labelled', WIZARD.includes('aria-label="Back"'));
  check('the saving state is announced', WIZARD.includes('role="status"') && CHROME.includes('role="status"'));
  check('animation respects prefers-reduced-motion', WIZARD.includes('prefers-reduced-motion'));
  check('no clickable div stands in for a button',
    !/<div[^>]*onClick=(?![\s\S]{0,80}role=)/.test(strip(STEPS_SRC)));

  console.log('\n── 14. Location suggestions are real, not stubbed ──');

  check('suggestions come from the existing city canon',
    CONTROLS.includes("from '@/lib/server/job-scraper/india'"));
  check('an alias resolves to the canonical city',
    indiaCitySuggestions('bangalore')[0] === 'Bengaluru');
  check('a prefix match is ranked first', indiaCitySuggestions('che')[0] === 'Chennai');
  check('an empty query still offers a starting list', indiaCitySuggestions('').length > 0);
  check('an unknown place returns nothing rather than a wrong guess',
    indiaCitySuggestions('zzzzqqq').length === 0);
  check('the field is not restricted to the list', CONTROLS.includes('onChange(e.target.value)'));
  check('no location API was invented', !/fetch\([^)]*(geo|places|location)/i.test(ALL_UI));

  console.log('\n── 15. Errors are handled, never swallowed ──');

  check('the server error message is shown', WIZARD.includes("payload?.error ||"));
  check('an expired session says so plainly rather than "Unauthorized"',
    WIZARD.includes('Your session expired'));
  check('a network failure has its own message', WIZARD.includes('Could not reach the server'));
  check('no raw status code or stack is rendered',
    !/\{response\.status\}/.test(WIZARD) && !ALL_CODE.includes('error.stack'));
  check('a failed save does not clear the local draft',
    /if \(!result\) return;[\s\S]{0,200}clearLocalDraft/.test(WIZARD));
  check('the preview renders no raw HTML', !PREVIEW.includes('dangerouslySetInnerHTML'));

  console.log('\n── 16. The preview is real ──');

  check('the preview renders from draft state, not a request',
    STEPS_SRC.includes('<JobPostPreview data={draft}'));
  check('the existing preview component was reused, not duplicated',
    STEPS_SRC.includes("from '../JobPostPreview'"));
  check('an empty description is stated, not faked', PREVIEW.includes('No description yet.'));
  check('the poster is read from the existing profile endpoint',
    WIZARD.includes("fetch('/api/profile/me'"));
  check('the poster is never typed by the user', !STEPS_SRC.includes('poster.name}'));
  check('the publish step summarises real draft values, not placeholders',
    WIZARD.includes('value: draft.title.trim() || \'—\''));
  check('a job with no pay says so rather than showing a number',
    WIZARD.includes("salary || 'Not stated'"));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
