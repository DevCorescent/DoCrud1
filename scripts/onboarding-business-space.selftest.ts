/**
 * Onboarding — the business branch's Space step, and the branch rule that
 * routes to it.
 *
 * Run: npm run test:onboarding-business-space
 *
 * Two kinds of check here. The data and branch rules are executed for real
 * against the shipped modules. The component and flow rules are asserted by
 * reading the source, because they are decisions that must not silently
 * regress — which control is used, whether a default is invented, whether the
 * business path can fall into the individual one — and there is no DOM here.
 */
import { readFileSync } from 'node:fs';
import {
  DEFAULT_BUSINESS_SPACE_OPTIONS, type BusinessSpaceOption,
} from '../lib/onboarding-business-spaces';
import {
  DEFAULT_PERSONA_OPTIONS, accountKindForPersona,
} from '../lib/onboarding-personas';
import { industryOptions } from '../lib/industry-presets';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

const STEP = src('components/onboarding/BusinessSpaceStep.tsx');
const FLOW = src('app/onboarding/preview/PreviewClient.tsx');
/* Comments state what the prototype used and why it was rejected, so the
   "no fake data" checks must read the CODE, not the prose about it. */
const strip = (x: string) => stripComments(x);
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const STEP_CODE = stripComments(STEP);

/* ═══ 1. The data exists, and is Docrud's own ═══════════════════════════ */
console.log('\n── 1. Business space data ──');
check('there is at least one business space', DEFAULT_BUSINESS_SPACE_OPTIONS.length > 0);
check('every option has a stable id and a label',
  DEFAULT_BUSINESS_SPACE_OPTIONS.every((o) => Boolean(o.id) && Boolean(o.label)));
check('ids are unique',
  new Set(DEFAULT_BUSINESS_SPACE_OPTIONS.map((o) => o.id)).size === DEFAULT_BUSINESS_SPACE_OPTIONS.length);

/* The whole point: these are the SAME industries a business account already
   stores, so the answer needs no translation and cannot drift. */
const industryKeys = industryOptions.map((o) => o.key).sort();
check('the options are exactly Docrud\'s own industry taxonomy',
  JSON.stringify(DEFAULT_BUSINESS_SPACE_OPTIONS.map((o) => o.id).sort()) === JSON.stringify(industryKeys));
check('labels come from that taxonomy, not invented here',
  DEFAULT_BUSINESS_SPACE_OPTIONS.every((o) =>
    industryOptions.some((i) => i.key === o.id && i.label === o.label)));
check('descriptions come from the taxonomy summaries',
  DEFAULT_BUSINESS_SPACE_OPTIONS.every((o) =>
    industryOptions.some((i) => i.key === o.id && i.summary === o.description)));

/* ═══ 2. No fabricated business data ════════════════════════════════════ */
console.log('── 2. No fake business data ──');
/* The design source shipped AI / Fintech / SaaS / E-commerce / EdTech. None of
   them are Docrud industries, and none may appear. */
const PROTOTYPE_ONLY = ['Fintech', 'SaaS', 'E-commerce', 'EdTech'];
for (const fake of PROTOTYPE_ONLY) {
  check(`the prototype's "${fake}" is not in the taxonomy`,
    !DEFAULT_BUSINESS_SPACE_OPTIONS.some((o) => o.label.includes(fake)));
  check(`and "${fake}" is not hardcoded in the component`, !STEP_CODE.includes(fake));
}
check('the component hardcodes no option list of its own',
  !/const\s+\w*(SPACES|OPTIONS|INDUSTRIES)\w*\s*(:|=)\s*\[/.test(STEP_CODE));
check('no company, job or talent count is claimed on this screen',
  !/(applicant|professionals with|open roles|jobCount)/i.test(STEP_CODE));

/* ═══ 3. Selection: valid accepted, invalid rejected ════════════════════ */
console.log('── 3. Selection validity ──');
const isValidSpace = (v: string | null, options: readonly BusinessSpaceOption[] = DEFAULT_BUSINESS_SPACE_OPTIONS) =>
  Boolean(v) && options.some((o) => o.id === v);

for (const o of DEFAULT_BUSINESS_SPACE_OPTIONS) {
  check(`"${o.id}" is accepted as a valid space`, isValidSpace(o.id));
}
for (const bad of ['', 'saas', 'Technology', 'TECHNOLOGY', 'fintech', '../etc/passwd', 'null']) {
  check(`"${bad}" is rejected`, !isValidSpace(bad));
}
check('a null selection is rejected', !isValidSpace(null));

/* State is keyed on the id, never the display label — a label can be
   retranslated, an id cannot. */
check('the flow stores the id, not the label',
  /value=\{option\.id\}/.test(STEP) && /onChange\(option\.id\)/.test(STEP));

/* ═══ 4. Empty selection cannot continue ════════════════════════════════ */
console.log('── 4. Continue is gated ──');
check('Continue is enabled only when a space is chosen',
  /step === 'space' \? Boolean\(space\)/.test(FLOW));
check('the step starts with no selection', /useState<string \| null>\(null\)/.test(FLOW));
check('no default space is silently chosen',
  !new RegExp(`useState[^\\n]*'(${DEFAULT_BUSINESS_SPACE_OPTIONS.map((o) => o.id).join('|')})'`).test(FLOW));
check('Enter cannot advance without a selection',
  /event\.key === 'Enter' && value/.test(STEP));
check('advancing requires a truthy space',
  /step === 'space' && space\) setStep\('businessSkills'\)/.test(FLOW));

/* ═══ 5. Selection survives Next and Back ═══════════════════════════════ */
console.log('── 5. State persistence across navigation ──');
check('the space lives in the flow, not inside the step',
  /const \[space, setSpace\] = useState/.test(FLOW) && !/useState/.test(STEP));
check('the step is fully controlled by value + onChange',
  /value: string \| null;/.test(STEP) && /onChange: \(spaceId: string\) => void;/.test(STEP));
/* Back must not clear it: BACK only changes which step renders. */
check('Back changes the step and nothing else', /onBack=\{\(\) => setStep\(BACK\[step\]\)\}/.test(FLOW));
check('Back from Space returns to Persona', /space: 'persona'/.test(FLOW));
check('no second onboarding state store was introduced',
  !/(localStorage|sessionStorage|createContext|zustand|redux)/.test(strip(FLOW) + strip(STEP)));

/* ═══ 6. Business routes to Business Skills ═════════════════════════════ */
console.log('── 6. Business routing ──');
check('Persona routes a business account to Space',
  /accountKindForPersona\(persona\) === 'business'\) setStep\('space'\)/.test(FLOW));
check('Space routes forward to Business Skills', /setStep\('businessSkills'\)/.test(FLOW));
check('the branch is decided by accountKind, never by a persona id',
  /accountKindForPersona\(persona\)/.test(FLOW)
  && !/persona === '(business|student|freelancer|contract|professional)'/.test(FLOW));

/* Every business persona really does resolve to the business branch. */
for (const p of DEFAULT_PERSONA_OPTIONS.filter((o) => o.accountKind === 'business')) {
  check(`persona "${p.id}" resolves to the business branch`,
    accountKindForPersona(p.id) === 'business');
}

/* ═══ 7. The individual path is untouched ═══════════════════════════════ */
console.log('── 7. Individual path unaffected ──');
for (const p of DEFAULT_PERSONA_OPTIONS.filter((o) => o.accountKind === 'individual')) {
  check(`persona "${p.id}" still resolves to the individual branch`,
    accountKindForPersona(p.id) === 'individual');
}
check('an individual still routes to Role, not Space',
  /accountKindForPersona\(persona\) === 'individual'\) setStep\('role'\)/.test(FLOW));
check('Role still leads to Skills then Jobs',
  /setStep\('skills'\)/.test(FLOW) && /setStep\('jobs'\)/.test(FLOW));
check('an unknown persona resolves to neither branch', accountKindForPersona('nonsense') === null);
check('an empty persona resolves to neither branch', accountKindForPersona('') === null);

/* ═══ 8. Accessible, non-interactive canvas ═════════════════════════════ */
console.log('── 8. Controls and canvas ──');
check('selection uses native radio inputs', /type="radio"/.test(STEP));
check('they share one group name', /name="onboarding-business-space"/.test(STEP));
check('the group is a fieldset with a legend',
  /<fieldset/.test(STEP) && /<legend/.test(STEP));
check('selection is not signalled by colour alone', /space-card-check/.test(STEP));
check('no clickable div stands in for a control', !/<div[^>]*onClick/.test(STEP));
check('the decorative canvas cannot take a click',
  /pointer-events: none/.test(src('components/onboarding/onboarding.css')));
check('the canvas is hidden from assistive tech',
  /aria-hidden="true"/.test(src('components/onboarding/OnboardingCanvas.tsx')));
check('reduced motion is honoured',
  /@media \(prefers-reduced-motion: reduce\)/.test(src('components/onboarding/onboarding.css')));

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
