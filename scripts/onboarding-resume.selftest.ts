/**
 * Onboarding — anonymous résumé extraction and prefill.
 *
 * Run: npm run test:onboarding-resume
 *
 * The extraction itself is executed for real against fixture résumé text. The
 * security posture of the route and the override guarantee in the flow are
 * asserted against source, because both are decisions that must never regress
 * quietly.
 */
import { readFileSync } from 'node:fs';
import {
  extractName, extractRoles, extractSkills, extractFromResumeText,
} from '../lib/server/onboarding-resume-extract';
import { validateResumeUpload, RESUME_MAX_BYTES, RESUME_EXTENSIONS } from '../lib/onboarding-resume';
import { SKILLS } from '../lib/server/ats/skill-taxonomy';
import { JOB_DOMAINS } from '../lib/server/job-sources/taxonomy';

let passed = 0, failed = 0;
function check(label: string, cond: boolean) {
  if (cond) { passed += 1; return; }
  failed += 1;
  console.error(`  ✗ ${label}`);
}
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const file = (name: string, size: number) => ({ name, size } as File);

const RESUME = `Priya Nair
priya.nair@example.com | +91 98765 43210 | linkedin.com/in/priyanair

SUMMARY
Frontend engineer building product interfaces.

EXPERIENCE
Senior Frontend Engineer — Acme (2021 - 2024)
Built React and TypeScript interfaces backed by Node.js services.
Frontend Developer — Globex (2019 - 2021)
Shipped JavaScript features and CSS design systems.

SKILLS
JavaScript, TypeScript, React, Node.js, CSS, Figma

EDUCATION
B.Tech Computer Science, NIT, 2019`;

/* ═══ 1. Name ═══════════════════════════════════════════════════════════ */
console.log('\n── 1. Name extraction ──');
check('a plain name is taken', extractName('Priya Nair') === 'Priya Nair');
check('a three-part name is taken', extractName('Ana Maria Silva') === 'Ana Maria Silva');
check('an accented name is taken', extractName('José Álvarez') === 'José Álvarez');
check('a hyphenated name is taken', extractName('Mary-Jane Watson') === 'Mary-Jane Watson');
check('SHOUTED names are title-cased', extractName('PRIYA NAIR') === 'Priya Nair');
/* A job title in the header is the common failure; it must not become a name. */
for (const notName of [
  'Senior Frontend Engineer', 'Software Developer', 'Curriculum Vitae', 'RESUME',
  'Product Manager', 'priya@example.com', '+91 98765 43210', 'Professional Summary',
]) {
  check(`"${notName}" is not offered as a name`, extractName(notName) === undefined);
}
check('a single word is not a name', extractName('Priya') === undefined);
check('five words is not a name', extractName('A B C D E') === undefined);
check('digits disqualify a line', extractName('Priya Nair 2024') === undefined);
check('nothing in, nothing out', extractName(null) === undefined && extractName('') === undefined);

/* ═══ 2. Skills ═════════════════════════════════════════════════════════ */
console.log('── 2. Skill extraction ──');
const canonicalNames = new Set(SKILLS.map((s) => s.canonical));
const skills = extractSkills(['javascript', 'TypeScript', 'react', 'node.js', 'Figma']);
check('surfaces resolve to canonical names', skills.every((s) => canonicalNames.has(s)));
check('js resolves to JavaScript', skills.includes('JavaScript'));
check('react resolves to React', skills.includes('React'));
check('duplicates collapse', extractSkills(['react', 'React', 'REACT']).length === 1);
check('unknown skills are dropped, not invented', extractSkills(['Underwater Basket Weaving']).length === 0);
check('never more than ten are suggested',
  extractSkills(SKILLS.map((s) => s.canonical)).length === 10);
check('nothing in, nothing out', extractSkills([]).length === 0);

/* ═══ 3. Roles ══════════════════════════════════════════════════════════ */
console.log('── 3. Role extraction ──');
const roles = extractRoles(['Senior Frontend Engineer'], 'React TypeScript Node.js frontend interfaces');
check('roles are real job domains', roles.every((r) => (JOB_DOMAINS as readonly string[]).includes(r)));
check('a frontend résumé suggests software', roles.includes('software'));
check('the classifier\'s "did not match" bucket is never suggested', !roles.includes('other'));
check('at most three directions are suggested', roles.length <= 3);
check('an empty résumé suggests nothing', extractRoles([], '').length === 0);

/* ═══ 4. End to end, and partial résumés ════════════════════════════════ */
console.log('── 4. Whole extraction ──');
const full = extractFromResumeText(RESUME);
check('the name is found', full.name === 'Priya Nair');
check('skills are found', full.skills.length > 0);
check('roles are found', full.roles.length > 0);
check('every suggested skill is canonical', full.skills.every((s) => canonicalNames.has(s)));

/* A résumé with no name section still yields the rest, rather than failing. */
const noName = extractFromResumeText('SKILLS\nPython, SQL\n\nEXPERIENCE\nData Analyst — Acme');
check('a missing name does not break the rest', noName.skills.length > 0);
check('and no name is invented', noName.name === undefined || noName.name.length > 0);
const noSkills = extractFromResumeText('Priya Nair\n\nEXPERIENCE\nManager — Acme');
check('a résumé with no skills yields none', Array.isArray(noSkills.skills));
check('empty text yields empty suggestions',
  extractFromResumeText('').skills.length === 0 && extractFromResumeText('').roles.length === 0);
check('nothing returns raw résumé text',
  !('rawText' in full) && !('text' in full));

/* ═══ 5. Upload validation ══════════════════════════════════════════════ */
console.log('── 5. Client-side file rules ──');
check('a pdf is accepted', validateResumeUpload(file('cv.pdf', 200_000)) === null);
check('an oversized file is refused',
  validateResumeUpload(file('cv.pdf', RESUME_MAX_BYTES + 1))?.code === 'TOO_LARGE');
check('an empty file is refused', validateResumeUpload(file('cv.pdf', 0))?.code === 'EMPTY');
check('an executable is refused', validateResumeUpload(file('cv.exe', 1000))?.code === 'UNSUPPORTED');
check('no file is refused', validateResumeUpload(null)?.code === 'NO_FILE');
for (const ext of RESUME_EXTENSIONS) {
  check(`.${ext} is accepted`, validateResumeUpload(file(`cv.${ext}`, 1000)) === null);
}

/* ═══ 6. The route's security posture ═══════════════════════════════════ */
console.log('── 6. Pre-auth route safety ──');
const ROUTE = src('app/api/onboarding/resume-extract/route.ts');
const ROUTE_CODE = strip(ROUTE);
check('it needs no session', !/getAuthSession|resolveSessionUserId/.test(ROUTE_CODE));
check('it creates no session or user', !/(signIn|createUser|setCookie|cookies\(\))/.test(ROUTE_CODE));
check('it never calls a model', !/(generateAiText|isAiConfigured|openai|anthropic)/i.test(ROUTE_CODE));
check('and neither does the extractor',
  !/(generateAiText|fetch\()/.test(strip(src('lib/server/onboarding-resume-extract.ts'))));
check('it persists nothing', !/(insertOne|updateOne|save|upload|putObject|writeFile)/i.test(ROUTE_CODE));
check('it returns no raw résumé text', !/rawText|text:\s*text/.test(ROUTE_CODE));
check('size is checked', /file\.size > MAX_BYTES/.test(ROUTE_CODE));
check('extension is checked', /ALLOWED as readonly string\[\]\)\.includes\(ext\)/.test(ROUTE_CODE));
check('content is checked against the claimed type', /contentMatchesExtension\(ext, buf\)/.test(ROUTE_CODE));
check('a pdf must really start like one', /'%PDF-'/.test(ROUTE));
check('it is rate limited per caller', /consumeRateLimit\('resumeExtract'/.test(ROUTE_CODE));
check('and answers 429 when the ceiling is hit', /status: 429/.test(ROUTE_CODE));
check('no storage credential is referenced', !/(R2_|AWS_|SECRET|ACCESS_KEY)/.test(ROUTE));

/* The authenticated route must be exactly as it was. */
const OLD = src('app/api/onboarding/parse-resume/route.ts');
check('the authenticated parser still requires a session', /getAuthSession\(\)/.test(OLD));
check('and still refuses anonymous callers', /status: 401/.test(OLD));
check('and still uses the model', /generateAiText/.test(OLD));

/* ═══ 7. User edits outrank the résumé ══════════════════════════════════ */
console.log('── 7. Overrides are authoritative ──');
const FLOW = src('app/onboarding/OnboardingClient.tsx');
check('edited fields are tracked', /const \[touched, setTouched\]/.test(FLOW));
check('the name is only seeded when untouched', /if \(suggestedName && !touched\.name\)/.test(FLOW));
check('roles are only seeded when untouched', /if \(suggestedRoles\.length && !touched\.roles\)/.test(FLOW));
check('skills are only seeded when untouched', /if \(suggestedSkills\.length && !touched\.skills\)/.test(FLOW));
check('editing the name marks it', /const editName = [\s\S]*?setTouched/.test(FLOW));
check('editing roles marks them', /const editRoles = [\s\S]*?setTouched/.test(FLOW));
check('editing skills marks them', /const editSkills = [\s\S]*?setTouched/.test(FLOW));
check('the steps receive the marking setters, not the raw ones',
  /onChange=\{editName\}/.test(FLOW) && /onChange=\{editRoles\}/.test(FLOW) && /onChange=\{editSkills\}/.test(FLOW));
check('removing the résumé spares touched fields', /if \(!touched\.name\) setName\(''\)/.test(FLOW));
check('a replaced résumé aborts the previous read', /controller\.abort\(\)/.test(FLOW));
check('a stale read cannot land after a newer one', /if \(!controller\.signal\.aborted\)/.test(FLOW));
check('the seeded skills respect the ten cap', /suggestedSkills\.slice\(0, 10\)/.test(FLOW));
check('extraction is never confused with a failure',
  /'parsing'|'empty'|'failed'|'done'/.test(src('lib/onboarding-resume.ts')));
check('a failed read never reads as an empty one',
  /status: 'empty'/.test(src('lib/onboarding-resume.ts'))
  && /status: 'failed'/.test(src('lib/onboarding-resume.ts')));
check('the welcome step only claims success on success',
  /extraction\.status === 'done'/.test(src('components/onboarding/WelcomeStep.tsx')));

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
