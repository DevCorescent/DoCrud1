/**
 * Onboarding — the page inventory, the router, and the flow state.
 *
 * Run: npm run test:onboarding-flow
 *
 * Covers what the per-page suites do not: that every page in the current
 * approved flow EXISTS, is reachable, holds its value, and that the two
 * branches stay separate. Page-specific rules live in
 * onboarding-business-space / onboarding-business-skills.
 *
 * The flow order asserted here is the CURRENT approved one. It is expected to
 * be re-decided; when it is, update this file deliberately rather than letting
 * a reorder pass unnoticed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { DEFAULT_PERSONA_OPTIONS, accountKindForPersona } from '../lib/onboarding-personas';
import { DEFAULT_ROLE_OPTIONS } from '../lib/onboarding-roles';
import { DEFAULT_SKILL_OPTIONS } from '../lib/onboarding-skills';
import { DEFAULT_BUSINESS_SPACE_OPTIONS } from '../lib/onboarding-business-spaces';
import { JOB_DOMAIN_LABELS } from '../lib/server/job-sources/taxonomy';
import { formatRecommendedJobCount, jobQueryForRoles } from '../lib/onboarding-jobs';
import { validateResumeUpload, RESUME_MAX_BYTES } from '../lib/onboarding-resume';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const path = (f: string) => new URL(`../${f}`, import.meta.url);
const src = (f: string) => readFileSync(path(f), 'utf8');
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const FLOW = src('app/onboarding/preview/PreviewClient.tsx');
const FLOW_CODE = strip(FLOW);

/* ═══ 1. Every page exists ══════════════════════════════════════════════ */
console.log('\n── 1. Page inventory ──');
const PAGES = [
  ['Welcome', 'WelcomeStep'], ['Name', 'NameStep'], ['Persona', 'PersonaStep'],
  ['Role', 'RoleStep'], ['Skills', 'SkillsStep'], ['Jobs', 'JobPreviewStep'],
  ['Business Space', 'BusinessSpaceStep'], ['Business Skills', 'BusinessSkillsStep'],
  ['Talent Preview', 'TalentPreviewStep'], ['Create account', 'AuthGate'],
] as const;
for (const [label, file] of PAGES) {
  check(`${label} exists`, existsSync(path(`components/onboarding/${file}.tsx`)));
  check(`${label} is rendered by the flow`, new RegExp(`<${file}\\b`).test(FLOW));
}
check('the shell exists', existsSync(path('components/onboarding/OnboardingShell.tsx')));
check('the canvas exists', existsSync(path('components/onboarding/OnboardingCanvas.tsx')));
check('shared step chrome exists', existsSync(path('components/onboarding/StepChrome.tsx')));

/* ═══ 2. Every page is reachable ════════════════════════════════════════ */
console.log('── 2. Router completeness ──');
for (const step of ['welcome','name','persona','role','skills','jobs','space','businessSkills','talent','auth']) {
  check(`"${step}" is a step the flow can render`, new RegExp(`step === '${step}'`).test(FLOW));
}
const FORWARD: Array<[string, RegExp]> = [
  ['Welcome → Name', /setStep\('name'\)/],
  ['Name → Persona', /step === 'name' && isNameValid\(name\)\) setStep\('persona'\)/],
  ['Persona → Role (individual)', /accountKindForPersona\(persona\) === 'individual'\) setStep\('role'\)/],
  ['Persona → Space (business)', /accountKindForPersona\(persona\) === 'business'\) setStep\('space'\)/],
  ['Role → Skills', /step === 'role' && isRoleSelectionValid\(roles, customRoles\)\) setStep\('skills'\)/],
  ['Skills → Jobs', /step === 'skills' && skills\.length > 0\) setStep\('jobs'\)/],
  ['Space → Business Skills', /step === 'space' && space\) setStep\('businessSkills'\)/],
  ['Business Skills → Talent', /step === 'businessSkills' && businessSkills\.length > 0\) setStep\('talent'\)/],
];
for (const [label, re] of FORWARD) check(label, re.test(FLOW));

const BACK: Array<[string, RegExp]> = [
  ['Name → Welcome', /name: 'welcome'/], ['Persona → Name', /persona: 'name'/],
  ['Role → Persona', /role: 'persona'/], ['Skills → Role', /skills: 'role'/],
  ['Jobs → Skills', /jobs: 'skills'/], ['Space → Persona', /space: 'persona'/],
  ['Business Skills → Space', /businessSkills: 'space'/], ['Talent → Business Skills', /talent: 'businessSkills'/],
];
for (const [label, re] of BACK) check(`Back: ${label}`, re.test(FLOW));

/* Both terminal pages end at the real login route, not a new auth screen. */
console.log('── 3. Login gate ──');
/* The value pages now lead to the account gate, and only the gate leaves for
   the real login route. */
check('both value pages lead to the account gate',
  /onLogin=\{\(\) => toAuth\('jobs'\)\}/.test(FLOW) && /onLogin=\{\(\) => toAuth\('talent'\)\}/.test(FLOW));
check('the gate hands off to the existing /login route',
  /router\.push\('\/login\?method=google'\)/.test(FLOW) && /router\.push\('\/login\?method=email'\)/.test(FLOW));
check('Back from the gate returns to the page it was reached from',
  /BACK\.auth = from/.test(FLOW));
check('no second authentication was built',
  !/(signIn\(|NextAuth|useSession|createUser|signUp)/.test(FLOW_CODE));
check('no profile is written before authentication',
  !/(api\/profile|api\/onboarding\/complete|api\/individual\/signup)/.test(FLOW_CODE));
check('Jobs offers the login CTA', /onLogin=\{\(\) => router\.push\('\/login'\)\}/.test(FLOW));

/* ═══ 4. State completeness ═════════════════════════════════════════════ */
console.log('── 4. Flow state ──');
for (const [label, re] of [
  ['name', /const \[name, setName\] = useState/],
  ['persona', /const \[persona, setPersona\] = useState/],
  ['roles', /const \[roles, setRoles\] = useState<string\[\]>/],
  ['custom roles', /const \[customRoles, setCustomRoles\] = useState<string\[\]>/],
  ['the attached resume', /const \[resume, setResume\] = useState<File \| null>/],
  ['custom persona text', /const \[personaOther, setPersonaOther\] = useState/],
  ['individual skills', /const \[skills, setSkills\] = useState/],
  ['business space', /const \[space, setSpace\] = useState/],
  ['business skills', /const \[businessSkills, setBusinessSkills\] = useState/],
] as Array<[string, RegExp]>) {
  check(`the flow holds ${label}`, re.test(FLOW));
}
check('the two branches keep separate skill state', /\[skills,/.test(FLOW) && /\[businessSkills,/.test(FLOW));
check('no page keeps a competing store',
  PAGES.every(([, f]) => !/useState/.test(strip(src(`components/onboarding/${f}.tsx`))
    .replace(/useState<'loading'[^\n]*/g, ''))
    || ['WelcomeStep', 'JobPreviewStep', 'TalentPreviewStep'].includes(f)));
check('no localStorage persistence was smuggled in',
  !/(localStorage|sessionStorage)/.test(FLOW_CODE));
check('the gate itself authenticates nobody',
  !/(signIn\(|useSession|NextAuth)/.test(strip(src('components/onboarding/AuthGate.tsx'))));
check('and writes no profile', !/(api\/profile|api\/onboarding)/.test(strip(src('components/onboarding/AuthGate.tsx'))));

/* ═══ 5. Real data everywhere ═══════════════════════════════════════════ */
console.log('── 5. Real data, no fixtures ──');
check('personas are data-driven', DEFAULT_PERSONA_OPTIONS.length > 0);
check('every persona maps to a real account kind',
  DEFAULT_PERSONA_OPTIONS.every((p) => accountKindForPersona(p.id) === p.accountKind));
/* Business and Recruiter both arrive to find people, so both take the business
   branch. A distinct recruiter journey would branch on the persona id, which is
   why the id is kept separate from the account kind. */
check('the business branch has at least one persona',
  DEFAULT_PERSONA_OPTIONS.some((p) => p.accountKind === 'business'));
check('and at least one individual persona exists',
  DEFAULT_PERSONA_OPTIONS.some((p) => p.accountKind === 'individual'));
check('a catch-all persona is offered', DEFAULT_PERSONA_OPTIONS.some((p) => p.id === 'other'));
check('a recruiter persona is offered', DEFAULT_PERSONA_OPTIONS.some((p) => p.id === 'recruiter'));
check('roles come from the job-domain taxonomy',
  DEFAULT_ROLE_OPTIONS.every((r) => JOB_DOMAIN_LABELS[r.id as keyof typeof JOB_DOMAIN_LABELS] === r.label));
check('the "other" job domain is not offered as a career direction',
  !DEFAULT_ROLE_OPTIONS.some((r) => r.id === 'other'));
check('skills and spaces are both populated',
  DEFAULT_SKILL_OPTIONS.length > 0 && DEFAULT_BUSINESS_SPACE_OPTIONS.length > 0);
check('nothing is marked recommended without a real source',
  !DEFAULT_ROLE_OPTIONS.some((r) => r.recommended) && !DEFAULT_SKILL_OPTIONS.some((s) => s.recommended));
/* Jobs must come from the public API, never a fixture. */
const JOBS = strip(src('lib/onboarding-jobs.ts'));
check('jobs are read from the existing public endpoint', /\/api\/jobs\/public/.test(JOBS));
check('and no job list is hardcoded', !/(title:\s*'|organizationName:\s*')/.test(JOBS));
check('a failed job request is not turned into an empty result',
  /throw new Error\(`Job feed responded/.test(JOBS));

/* ═══ 6. Shared shell and canvas ════════════════════════════════════════ */
console.log('── 6. Shell, canvas, motion ──');
check('the shell is mounted once, outside the step switch',
  (FLOW.match(/<OnboardingShell/g) ?? []).length === 1);
check('no page mounts its own canvas',
  PAGES.every(([, f]) => !/<OnboardingCanvas/.test(src(`components/onboarding/${f}.tsx`))));
const CSS = src('components/onboarding/onboarding.css');
check('the canvas cannot take a pointer event', /pointer-events: none/.test(CSS));
check('the canvas is hidden from assistive tech',
  /aria-hidden="true"/.test(src('components/onboarding/OnboardingCanvas.tsx')));
check('reduced motion is honoured', /@media \(prefers-reduced-motion: reduce\)/.test(CSS));
check('onboarding styles stay scoped', !/^(?!\.docrud-onboarding)[a-z]+\s*\{/m.test(CSS));

/* ═══ 7. The recommended-job count ══════════════════════════════════════ */
console.log('── 7. Job count: floor to five, never up ──');
for (const [actual, want] of [[0,'0+'],[1,'0+'],[4,'0+'],[5,'5+'],[7,'5+'],[13,'10+'],
  [20,'20+'],[23,'20+'],[24,'20+'],[25,'25+'],[44,'40+']] as Array<[number,string]>) {
  check(`${actual} displays as ${want}`, formatRecommendedJobCount(actual) === want);
}
for (let n = 0; n <= 300; n += 1) {
  const shown = Number(formatRecommendedJobCount(n).replace(/[+,]/g, ''));
  check(`${n} never over-promises`, shown <= n && shown % 5 === 0);
}
check('large counts stay readable', formatRecommendedJobCount(1019) === '1,015+');

/* ═══ 8. Roles and the resume ═══════════════════════════════════════════ */
console.log('── 8. Role query and resume rules ──');
check('a chosen direction filters the feed by domain',
  jobQueryForRoles(['software'], [], DEFAULT_ROLE_OPTIONS).includes('domain=software'));
check('a typed role searches instead, since it has no domain',
  jobQueryForRoles([], ['Product Engineer'], DEFAULT_ROLE_OPTIONS).includes('search=Product+Engineer'));
check('no filter is invented when nothing is chosen',
  !/domain=|search=/.test(jobQueryForRoles([], [], DEFAULT_ROLE_OPTIONS)));
check('role availability is read from the existing public feed',
  /\/api\/jobs\/public\?domain=/.test(src('lib/onboarding-roles.ts')));
check('a direction with an unknown count is not shown as zero',
  /entries\.filter\(Boolean\)/.test(src('lib/onboarding-roles.ts')));

check('a resume is optional — the flow never demands one',
  !/resume[^\n]{0,40}(required|must)/i.test(FLOW_CODE));
check('an oversized resume is refused',
  validateResumeUpload({ name: 'cv.pdf', size: RESUME_MAX_BYTES + 1 } as File)?.code === 'TOO_LARGE');
check('an unsupported type is refused',
  validateResumeUpload({ name: 'cv.exe', size: 1000 } as File)?.code === 'UNSUPPORTED');
check('an empty file is refused',
  validateResumeUpload({ name: 'cv.pdf', size: 0 } as File)?.code === 'EMPTY');
check('a normal pdf is accepted',
  validateResumeUpload({ name: 'cv.pdf', size: 200_000 } as File) === null);
check('nothing here parses a resume pre-auth',
  !/parse-resume/.test(FLOW_CODE) && !/parse-resume/.test(strip(src('components/onboarding/WelcomeStep.tsx'))));

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
