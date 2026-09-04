/**
 * Onboarding — the business branch's Skills step, and the hand-off into
 * Talent Preview.
 *
 * Run: npm run test:onboarding-business-skills
 *
 * The skill vocabulary, the cap constant and the talent rounding are executed
 * for real. The selection and routing rules are asserted against the source,
 * because they are decisions that must not regress quietly — whether a second
 * taxonomy appears, whether a default is invented, whether the cap is enforced
 * anywhere other than a `disabled` attribute — and there is no DOM here.
 */
import { readFileSync } from 'node:fs';
import { DEFAULT_SKILL_OPTIONS, MAX_SKILLS } from '../lib/onboarding-skills';
import { formatTalentCount } from '../lib/onboarding-talent';
import { SKILLS } from '../lib/server/ats/skill-taxonomy';
import { getCompanyJobDisplayCount } from '../lib/company-explorer';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const BSTEP = src('components/onboarding/BusinessSkillsStep.tsx');
const SSTEP = src('components/onboarding/SkillsStep.tsx');
const FLOW  = src('app/onboarding/OnboardingClient.tsx');
const BSTEP_CODE = strip(BSTEP), SSTEP_CODE = strip(SSTEP);

/* ═══ 1–2. Canonical taxonomy, nothing invented ═════════════════════════ */
console.log('\n── 1. Canonical skill source ──');
check('there are skills to choose from', DEFAULT_SKILL_OPTIONS.length > 0);
check('the options are exactly Docrud\'s ATS skill dictionary',
  JSON.stringify(DEFAULT_SKILL_OPTIONS.map((o) => o.id).sort())
  === JSON.stringify(SKILLS.map((s) => s.canonical).sort()));
check('every label is the canonical spelling',
  DEFAULT_SKILL_OPTIONS.every((o) => o.id === o.label));
check('ids are unique', new Set(DEFAULT_SKILL_OPTIONS.map((o) => o.id)).size === DEFAULT_SKILL_OPTIONS.length);
check('business skills reuse that one source, with no list of their own',
  !/\[\s*'[^']+'\s*,\s*'[^']+'/.test(BSTEP_CODE));
check('and the shared step hardcodes no list either',
  !/const\s+\w*(SKILLS|OPTIONS)\w*\s*=\s*\[/.test(SSTEP_CODE));

console.log('── 2. No fake skills or people ──');
/* The design source shipped ten example skills. They may only appear here if
   the real taxonomy also has them — never as a hardcoded list. */
check('no candidate, employee or applicant data is invented',
  !/(candidate|employee|applicant)/i.test(BSTEP_CODE + SSTEP_CODE));
check('the step claims no counts of its own',
  !/\d{2,}\s*(professionals|people|candidates)/i.test(BSTEP_CODE + SSTEP_CODE));

/* ═══ 3–8. Selection and the cap ════════════════════════════════════════ */
console.log('── 3. Selection ──');
check('several skills can be held at once', /value: readonly string\[\]/.test(SSTEP));
check('the control is a real checkbox, not a toggle button',
  /type="checkbox"/.test(SSTEP_CODE) && !/aria-pressed/.test(SSTEP_CODE));
check('business skills render through the shared step, not a copy',
  /<SkillsStep/.test(BSTEP) && !/type="checkbox"/.test(BSTEP));

console.log('── 4. Continue is gated ──');
check('an empty selection cannot continue',
  /step === 'businessSkills' \? businessSkills\.length > 0/.test(FLOW));
check('one selected skill is enough to continue',
  /step === 'businessSkills' && businessSkills\.length > 0\) setStep\('talent'\)/.test(FLOW));
check('the step starts empty — no default skills',
  /const \[businessSkills, setBusinessSkills\] = useState<string\[\]>\(\[\]\)/.test(FLOW));

console.log('── 5. The 10 cap ──');
check('the cap is ten', MAX_SKILLS === 10);
check('the cap is a shared constant, not a literal in the UI',
  /maxSkills = MAX_SKILLS/.test(SSTEP) && /maxSkills = MAX_SKILLS/.test(BSTEP));
check('at the limit, unchosen options are disabled',
  /disabled=\{!isSelected && atLimit\}/.test(SSTEP));
/* The disabled attribute alone is not enough — a caller could render the pills
   another way. The handler must refuse an 11th on its own. */
check('and the handler refuses an 11th independently',
  /if \(selected\.size >= maxSkills\) return;/.test(SSTEP));
check('a chosen skill stays removable at the limit',
  /if \(selected\.has\(id\)\) \{[\s\S]{0,120}onChange\(value\.filter/.test(SSTEP));
check('removing is not gated by the limit',
  SSTEP.indexOf('selected.has(id)') < SSTEP.indexOf('if (selected.size >= maxSkills) return;'));
/* The count now lives inside the search field as a compact "n/max". */
check('the count is shown as "n/max"', /\{selected\.size\}\/\{maxSkills\}/.test(SSTEP));
check('and it sits inside the search field, not in a heading',
  /skills-count-inline/.test(SSTEP) && !/skills-header/.test(SSTEP));
check('the count is announced to assistive tech', /aria-live="polite"/.test(SSTEP));
check('the limit is explained, not just enforced silently',
  /remove one to choose a different skill/.test(SSTEP));

console.log('── 6. Stable ids, not labels ──');
check('selection is keyed on the option id', /toggle\(option\.id\)/.test(SSTEP));
check('membership is tested by id', /selected\.has\(o\.id\)/.test(SSTEP));
check('the label is rendered but never used as the key',
  /\{option\.label\}/.test(SSTEP) && !/selected\.has\(option\.label\)/.test(SSTEP));
check('duplicates are impossible — a Set backs the lookup',
  /new Set\(value\)/.test(SSTEP));

/* ═══ 7. State lives in the flow ════════════════════════════════════════ */
console.log('── 7. One state store ──');
/* The step may keep VIEW state — the search text, whether the list is
   expanded — but never the chosen skills, which belong to the flow so Back
   cannot lose them. */
check('the shared step keeps only view state',
  /const \[draft, setDraft\]/.test(SSTEP) && /const \[expanded, setExpanded\]/.test(SSTEP));
check('and never the skills it edits',
  !/useState[^\n]*\bskills\b/i.test(SSTEP_CODE));
check('the chosen skills arrive as a prop', /value: readonly string\[\]/.test(SSTEP));
check('nor does the business wrapper', !/useState/.test(BSTEP));
check('the flow owns the selection', /const \[businessSkills, setBusinessSkills\]/.test(FLOW));
check('no second store was introduced',
  !/(localStorage|sessionStorage|createContext|zustand|redux)/.test(strip(FLOW) + SSTEP_CODE + BSTEP_CODE));
check('Back only changes which step renders',
  /onBack=\{\(\) => setStep\(BACK\[step\]\)\}/.test(FLOW));
check('Back from Business Skills returns to Space', /businessSkills: 'space'/.test(FLOW));
check('Back from Talent returns to Business Skills', /talent: 'businessSkills'/.test(FLOW));

/* ═══ 8. Business continuity and routing ════════════════════════════════ */
console.log('── 8. Routing and continuity ──');
check('Space advances to Business Skills', /step === 'space' && space\) setStep\('businessSkills'\)/.test(FLOW));
check('Business Skills advances to Talent', /setStep\('talent'\)/.test(FLOW));
/* Space is written in exactly one place — the Space step's onChange — and is
   never cleared on a later step, so it is still there for Talent Preview. */
check('Space is written by the Space step alone',
  (strip(FLOW).match(/setSpace\b/g) ?? []).length === 2
  && /onChange=\{setSpace\}/.test(FLOW));
check('and is never reset while moving through the branch',
  !/setSpace\((null|''|undefined)\)/.test(FLOW));
check('the branch is decided by accountKind, not a persona label',
  /accountKind === 'business'/.test(FLOW) && !/persona === 'business'/.test(FLOW));
check('the Space label shown later is looked up from the stored id',
  /DEFAULT_BUSINESS_SPACE_OPTIONS\.find\(o => o\.id === space\)/.test(FLOW));

console.log('── 9. Individual path untouched ──');
check('individual still routes to Role', /accountKind === 'individual'\) setStep\('role'\)/.test(FLOW));
check('Role → Skills', /step === 'role' && isRoleSelectionValid\(roles, customRoles\)\) setStep\('skills'\)/.test(FLOW));
check('Skills → Jobs', /step === 'skills' && skills\.length > 0\) setStep\('jobs'\)/.test(FLOW));
check('the two branches keep separate skill state',
  /const \[skills, setSkills\]/.test(FLOW) && /const \[businessSkills, setBusinessSkills\]/.test(FLOW));

/* ═══ 10. Hand-off into Talent Preview ══════════════════════════════════ */
console.log('── 10. Talent Preview hand-off ──');
check('the selected ids are resolved to real options before counting',
  /DEFAULT_SKILL_OPTIONS\.filter\(option => businessSkills\.includes\(option\.id\)\)/.test(FLOW));
check('and handed to the existing counter unchanged', /fetchTalentMetrics\(chosen\)/.test(FLOW));
check('counting reruns when the chosen skills change', /\}, \[businessSkills\]\)/.test(FLOW));

/* The rounding rule, executed. Down, never up — a screen must never promise
   more people than exist. */
console.log('── 11. Talent rounding never rounds up ──');
for (const [actual, want] of [[13,'10+'],[44,'40+'],[25,'25+'],[0,'0+']] as Array<[number,string]>) {
  check(`${actual} professionals displays as ${want}`, formatTalentCount(actual) === want);
}
for (let n = 0; n <= 200; n += 1) {
  const shown = Number(formatTalentCount(n).replace('+', ''));
  check(`${n} never displays more than it has`, shown <= n);
  check(`${n} is a multiple of five`, shown % 5 === 0);
}
check('the rounding reuses Docrud\'s existing rule, not a second one',
  /getCompanyJobDisplayCount/.test(src('lib/onboarding-talent.ts'))
  && formatTalentCount(37) === `${getCompanyJobDisplayCount(37)}+`);
check('nothing counted is called an applicant',
  !/applicant/i.test(strip(src('components/onboarding/TalentPreviewStep.tsx'))
    .replace(/not applicants/gi, '')));
check('the metric entity is a professional', /entityType: 'professional'/.test(src('lib/onboarding-talent.ts')));
check('no candidate identity is read — counts only',
  !/(email|phone|resume|avatar)/i.test(strip(src('lib/onboarding-talent.ts'))));

console.log('── 12. Compact list, read more, custom skills ──');
check('only the first twenty unchosen skills are offered', /const VISIBLE_COUNT = 20;/.test(SSTEP));
check('the rest are behind a Read more control', /Read more \(\{hiddenCount\}\)/.test(SSTEP));
check('and can be collapsed again', /Show less/.test(SSTEP));
check('a search shows every match, collapsed or not',
  /const collapsed = !expanded && !query/.test(SSTEP));
check('chosen skills always render, above the rest',
  /skills-chosen/.test(SSTEP) && /chosen\.map\(option => pill\(option, true\)\)/.test(SSTEP));
/* A résumé-suggested skill sitting deep in the taxonomy must not be hidden. */
check('a chosen skill outside the visible slice still renders',
  /const chosen = value\.map\(id => byId\.get\(id\) \?\? \{ id, label: id \}\)/.test(SSTEP));
check('a typed skill that is canonical resolves to the canonical spelling',
  /canonicalMatch \? canonicalMatch\.id : query/.test(SSTEP));
check('a duplicate cannot be added', /const alreadyChosen =/.test(SSTEP));
check('adding respects the cap', /const canAdd = query\.length > 0 && !alreadyChosen && !atLimit/.test(SSTEP));
check('the list wraps rather than scrolling inside itself',
  /\.skills-options \{[^}]*flex-wrap: wrap/.test(src('components/onboarding/onboarding.css'))
  && !/\.skills-options \{[^}]*overflow/.test(src('components/onboarding/onboarding.css')));

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
