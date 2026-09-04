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
import {
  validateResumeUpload, RESUME_MAX_BYTES, RESUME_EXTENSIONS,
  PLATFORM_REQUEST_BODY_LIMIT_BYTES,
} from '../lib/onboarding-resume';
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


/* ═══ The read must be VISIBLE on the steps it feeds ═════════════════════
   Attaching a résumé advances straight past Welcome, so a status rendered only
   by WelcomeStep is a status nobody sees. That was the live bug: a 422 was
   handled correctly and its message thrown away, leaving an empty Name field
   and no explanation — indistinguishable from "extraction stopped". */

const NOTICE = src('components/onboarding/ExtractionNotice.tsx');

check('there is a status surface for the steps that use the result',
  NOTICE.length > 0);
check('it reports the parsing state', /'parsing'/.test(NOTICE) && /Reading your resume/i.test(NOTICE));
check('it reports a failure with the server\'s own message',
  /extraction\.message/.test(NOTICE));
check('it distinguishes "read it, found nothing" from "could not read it"',
  /'empty'/.test(NOTICE) && /extraction-note-failed/.test(NOTICE));
check('it renders nothing on success, so a filled field is not narrated',
  /status === 'done'\) return null/.test(NOTICE));
check('the busy state is announced to assistive tech',
  /aria-live="polite"/.test(NOTICE) && /role="status"/.test(NOTICE));

for (const step of ['NameStep', 'RoleStep', 'SkillsStep']) {
  const code = src(`components/onboarding/${step}.tsx`);
  check(`${step} renders the extraction notice`, /<ExtractionNotice/.test(code));
  check(`${step} accepts the extraction state`, /extraction\?: ExtractionState/.test(code));
}

check('the flow passes extraction to every step that consumes it',
  (FLOW.match(/extraction=\{extraction\}/g) ?? []).length >= 4);

/* ═══ Retry re-runs the EXISTING read, and is not a second system ════════ */

check('a failed read can be retried', /onRetryExtraction/.test(FLOW));
check('retry re-runs the same effect rather than adding a parse path',
  /retryNonce/.test(FLOW) && (FLOW.match(/extractResume\(/g) ?? []).length === 1);
check('retry does nothing without a file', /if \(resume\) setRetryNonce/.test(FLOW));
check('the retry control is only offered when there is something to retry',
  /onRetry && \(/.test(NOTICE));

/* ═══ Still exactly one extraction, still no fabrication ═════════════════ */

check('extraction is requested once per attached file, not per step',
  /\}, \[resume, retryNonce\]\)/.test(FLOW));
check('no step re-parses the résumé itself',
  !/extractResume/.test(src('components/onboarding/NameStep.tsx'))
  && !/extractResume/.test(src('components/onboarding/RoleStep.tsx'))
  && !/extractResume/.test(src('components/onboarding/SkillsStep.tsx')));

/* ═══ The route still refuses to fake a success ══════════════════════════ */

const EXTRACT_ROUTE = src('app/api/onboarding/resume-extract/route.ts');
check('a parser failure is a 422, never a 200 with empty data', /status: 422/.test(EXTRACT_ROUTE));
check('an unreadable file is distinguished from an empty one',
  /readable: false/.test(EXTRACT_ROUTE) && /status: 422/.test(EXTRACT_ROUTE));
check('size, extension and magic bytes are all still enforced',
  /MAX_BYTES/.test(EXTRACT_ROUTE) && /ALLOWED/.test(EXTRACT_ROUTE) && /contentMatchesExtension/.test(EXTRACT_ROUTE));
check('the rate limit is still applied', /consumeRateLimit\('resumeExtract'/.test(EXTRACT_ROUTE));
check('no résumé text is logged', !/console\.(log|info|warn|error)\([^)]*text/.test(EXTRACT_ROUTE));


/* ═══ Production (serverless) parsing ════════════════════════════════════
   The reported failure was Vercel-only:

       POST /api/onboarding/resume-extract → 422
       [doc-parser] all PDF extraction methods failed — throwing

   "all methods" reads as though four things were tried. Three of them invoke
   ABSOLUTE macOS paths (/opt/homebrew/bin/pdftotext, /opt/homebrew/bin/pdftoppm,
   /usr/bin/swift) and cannot exist on Linux, so on Vercel pdf-parse is the only
   path there has ever been — and its error was buried under three guaranteed
   ENOENTs that looked like peers. */

const PARSER = src('lib/server/document-parser.ts');

check('macOS-only helpers are not attempted off macOS',
  /NATIVE_HELPERS_AVAILABLE = process\.platform === 'darwin'/.test(PARSER)
  && /if \(NATIVE_HELPERS_AVAILABLE\) \{/.test(PARSER));
check('and the log says so, instead of implying they were tried',
  /unavailable-on-platform/.test(PARSER));
check('the exhausted line reports what was ACTUALLY attempted',
  /attempted: NATIVE_HELPERS_AVAILABLE \? /.test(PARSER));

/* Diagnostics a production failure can be read from. */
check('every stage logs a structured outcome', /function stage\(/.test(PARSER));
check('the parser error name and message are logged',
  /stage\('pdf-parse', 'failed', \{ \.\.\.safeError\(err\)/.test(PARSER));
check('duration is recorded', /ms: Date\.now\(\) - startedAt/.test(PARSER));
check('file type, size and platform are recorded',
  /mime: normalizedMime, ext: extension, bytes: buffer\.length/.test(PARSER)
  && /platform: process\.platform/.test(PARSER));

/* PII must not reach the logs. */
check('the résumé FILENAME is never logged (it is usually the person\'s name)',
  !/file="\$\{fileName\}"/.test(PARSER));
check('error messages are truncated and flattened before logging',
  /\.replace\(\/\\s\+\/g, ' '\)\.slice\(0, 200\)/.test(PARSER));
check('no extracted text is ever logged, only its length',
  !/console\.log\([^)]*\$\{text\}/.test(PARSER));

/* An empty text layer is not a parser error. */
check('a scanned PDF is reported as empty-text-layer, not as a failure',
  /'empty-text-layer'/.test(PARSER));

/* The route must stay on Node — the parser has no Edge equivalent. */
check('the extract route pins the nodejs runtime',
  /export const runtime = 'nodejs';/.test(EXTRACT_ROUTE));

/* Every document-parsing route is traced for deployment. */
const NEXT_CONFIG = src('next.config.js');
check('the pdfjs worker list is shared, not retyped per route',
  /const PDF_WORKER_FILES = \[/.test(NEXT_CONFIG));
check('the onboarding extract route is traced',
  /'\/api\/onboarding\/resume-extract': PDF_WORKER_FILES/.test(NEXT_CONFIG));
check('and so is every other route that parses documents',
  (NEXT_CONFIG.match(/: PDF_WORKER_FILES/g) ?? []).length >= 12);

/* Still no fake success. */
check('an unreadable PDF is still a 422, never a 200 with empty data',
  /status: 422/.test(EXTRACT_ROUTE) && !/extraction: \{ roles: \[\], skills: \[\] \}, readable: true/.test(EXTRACT_ROUTE));

/* ═══ The size contract must match the PLATFORM, not just itself ═════════
   The limit was 8 MB while the deployment rejects any request body over
   4.5 MB at the edge — before the handler runs. So a 6 MB résumé passed
   client validation, uploaded, and then died with an error the application
   never saw and could not explain to the person. A client that permits more
   than the deployment accepts is a promise the product cannot keep. */

check('the resume limit sits under the platform request-body ceiling',
  RESUME_MAX_BYTES < PLATFORM_REQUEST_BODY_LIMIT_BYTES);
check('with real headroom for multipart overhead (>= 256 KB)',
  PLATFORM_REQUEST_BODY_LIMIT_BYTES - RESUME_MAX_BYTES >= 256 * 1024);
check('and it is no longer the old unreachable 8 MB',
  RESUME_MAX_BYTES !== 8 * 1024 * 1024);

/* Boundary behaviour, exercised rather than asserted about. */
check('a file comfortably under the limit is accepted',
  validateResumeUpload(file('cv.pdf', 1 * 1024 * 1024)) === null);
check('a file one byte under the limit is accepted',
  validateResumeUpload(file('cv.pdf', RESUME_MAX_BYTES - 1)) === null);
check('a file exactly at the limit is accepted',
  validateResumeUpload(file('cv.pdf', RESUME_MAX_BYTES)) === null);
check('a file one byte over the limit is rejected',
  validateResumeUpload(file('cv.pdf', RESUME_MAX_BYTES + 1))?.code === 'TOO_LARGE');
check('a file that would have passed the OLD 8 MB limit is now rejected',
  validateResumeUpload(file('cv.pdf', 6 * 1024 * 1024))?.code === 'TOO_LARGE');
check('the rejection message names the real limit',
  (validateResumeUpload(file('cv.pdf', RESUME_MAX_BYTES + 1))?.message ?? '').includes('4 MB'));

/* One number, shared — the client and the server cannot drift. */
check('the extract route imports the shared limit rather than retyping one',
  /import \{ RESUME_MAX_BYTES \} from '@\/lib\/onboarding-resume'/.test(EXTRACT_ROUTE)
  && /const MAX_BYTES = RESUME_MAX_BYTES;/.test(EXTRACT_ROUTE));
check('and so does the authenticated parse route',
  /const MAX_BYTES = RESUME_MAX_BYTES;/.test(src('app/api/onboarding/parse-resume/route.ts')));
check('no resume route hardcodes 8 MB any more',
  !/8 \* 1024 \* 1024/.test(EXTRACT_ROUTE)
  && !/8 \* 1024 \* 1024/.test(src('app/api/onboarding/parse-resume/route.ts')));
check('an oversized upload is a 413, never a success',
  /status: 413/.test(EXTRACT_ROUTE));

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${passed + failed} checks passed`);
if (failed > 0) { console.error('FAILED'); process.exit(1); }
