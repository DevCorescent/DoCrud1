/**
 * Individual job-post composer self-test.
 *
 * The highest-value assertions here are the CONTRACT ones: the payload this
 * form sends, and the fields it sends, must not have changed. A UI task that
 * quietly drops `requiredDocuments` or renames `minimumAtsScore` would break
 * posting for every existing user, and nothing else in the suite would notice.
 *
 * The rest are source contracts for theming and accessibility, since this repo
 * has no test runner or jsdom; layout and rendering are verified in a real
 * browser separately.
 */
import { readFileSync } from 'fs';
import path from 'path';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const FORM = read('components/jobs/PostJobPage.tsx');
const PREVIEW = read('components/jobs/JobPostPreview.tsx');
const HIRING = read('lib/server/hiring.ts');
const ROUTE = read('app/api/hiring/jobs/route.ts');

function main() {
  console.log('\n── 1. The data contract is unchanged ──');

  /* Every field upsertHiringJob reads from the payload. If the form stops
     sending one, the job silently loses it on the next edit. */
  const PAYLOAD_FIELDS = [
    'title', 'department', 'location', 'employmentType', 'workMode',
    'experienceLevel', 'description', 'responsibilities', 'requirements',
    'preferredSkills', 'minimumAtsScore', 'requiredDocuments', 'status',
  ];
  for (const field of PAYLOAD_FIELDS) {
    check(`the form still holds "${field}"`, new RegExp(`\\b${field}:`).test(FORM));
  }
  check('targetRoleKeywords are still derived from the title',
    FORM.includes('targetRoleKeywords: jobForm.title.split(/\\s+/).filter(Boolean)'));
  check('minimumAtsScore is still sent as a number',
    FORM.includes('minimumAtsScore: Number(jobForm.minimumAtsScore || 0)'));
  for (const listField of ['responsibilities', 'requirements', 'preferredSkills', 'requiredDocuments']) {
    check(`${listField} is still newline-split into an array`,
      new RegExp(`${listField}: jobForm\\.${listField}\\.split\\('\\\\n'\\)`).test(FORM));
  }
  check('it still POSTs to the existing endpoint',
    FORM.includes("fetch('/api/hiring/jobs'") && FORM.includes("method: 'POST'"));
  check('no second job endpoint was invented',
    (FORM.match(/\/api\/hiring\/jobs/g) ?? []).length >= 1
    && !/\/api\/jobs\/(create|post|individual)/.test(FORM));
  check('the edit id still travels in the body',
    FORM.includes('...(editId ? { id: editId } : {})'));
  check('ownership is still decided server-side, not sent',
    !/organizationId:|createdByUserId:|ownerId:/.test(FORM));

  console.log('\n── 2. No backend or schema change ──');

  check('upsertHiringJob still derives the owner from the actor',
    HIRING.includes('organizationId: ownerId') && HIRING.includes('createdByUserId: existing?.createdByUserId ?? actor.id'));
  check('the route still rejects unauthenticated callers',
    ROUTE.includes("error: 'Unauthorized'"));
  check('no salary or deadline field was invented in the UI',
    !/salary|currency|deadline|benefits/i.test(FORM.replace(/\/\*[\s\S]*?\*\//g, '')));

  console.log('\n── 3. Validation ──');

  check('title is validated client-side', FORM.includes("next.title = 'Job title is required.'"));
  check('description is validated client-side', FORM.includes("next.description = 'Description is required.'"));
  check('validation runs before the request', /if \(!validate\(\)\) return;/.test(FORM));
  check('only the two fields the server requires are gated',
    (FORM.match(/next\.\w+ = '/g) ?? []).length === 2);
  check('both required fields are marked in the UI',
    (FORM.match(/label="Job title" required/g) ?? []).length === 1
    && (FORM.match(/label="Description" required/g) ?? []).length === 1);
  check('the required marker is not an asterisk alone',
    FORM.includes('<span className="sr-only"> required</span>'));
  check('errors are associated with their input',
    FORM.includes('aria-describedby={errors.title') && FORM.includes('aria-invalid={!!errors.title}'));
  check('errors are announced', FORM.includes('role="alert"'));
  check('the server error is shown, not swallowed',
    FORM.includes("payload?.error || 'Unable to save job.'"));

  console.log('\n── 4. Submit, loading and success states ──');

  check('the submit button disables while saving', FORM.includes('disabled={savingJob}'));
  check('a duplicate submit is refused', FORM.includes('if (savingJob) return;'));
  check('the saving state is announced to assistive tech',
    FORM.includes('aria-live="polite"') && FORM.includes('Saving your job posting.'));
  check('the button label reflects the mode',
    FORM.includes("editId ? 'Save changes' : 'Post Job'"));
  check('the heading reflects the mode', FORM.includes("{editId ? 'Edit job' : 'Post a job'}"));
  check('success is announced', FORM.includes('role="status"'));
  check('the success screen still offers View job / Post another / Back',
    FORM.includes('View job') && FORM.includes('Post another') && FORM.includes('Back to Jobs'));
  check('the edit flow still loads the job', FORM.includes("if (!editId) return;"));

  console.log('\n── 5. Both themes ──');

  /* A dark-only utility with no light counterpart is what made this page a
     black form for anyone on the light theme. */
  const darkOnly = FORM.split('\n').filter((line) =>
    /className|CLASS|PANEL|BTN_|MUTED/.test(line)
    && /(text-white\b|text-white\/|bg-white\/\[0|border-white\/\[0|#0A0A0C)/.test(line)
    && !line.includes('dark:'));
  check('no dark-only surface, text or border remains',
    darkOnly.length === 0, darkOnly[0]?.trim().slice(0, 90));
  for (const token of ['dark:bg-[#0A0A0C]', 'dark:border-white/[0.08]', 'dark:text-white']) {
    check(`theme pair present: ${token}`, FORM.includes(token));
  }
  check('the page has a light background', FORM.includes('bg-slate-50'));
  check('inputs are readable in both themes',
    FORM.includes('bg-white text-slate-900') && FORM.includes('dark:bg-white/[0.04] dark:text-white'));
  check('the primary button avoids the white-on-white trap',
    FORM.includes('dark:text-[#020617]') && !FORM.includes('dark:text-slate-900'));
  check('the error state is visible in light mode too',
    FORM.includes('border-rose-500 bg-rose-50'));

  console.log('\n── 6. Accessibility ──');

  check('every control is reached through the Field label',
    (FORM.match(/<Field id="/g) ?? []).length >= 10);
  check('focus is visible, not only a border tint', FORM.includes('focus-visible:ring-2'));
  check('the preview toggle reports its state', FORM.includes('aria-pressed={showPreview}'));
  check('decorative icons are hidden from assistive tech',
    (FORM.match(/aria-hidden/g) ?? []).length >= 3);
  check('the back control is labelled', FORM.includes('aria-label="Back"'));

  console.log('\n── 7. Individual poster identity ──');

  check('the poster is read from the existing profile endpoint',
    FORM.includes("fetch('/api/profile/me'"));
  check('the poster is never typed by the user',
    !/setPoster\(\{[^}]*value/.test(FORM));
  check('the composer states who the job is posted as', FORM.includes('Posting as {poster.name}'));
  check('an individual is labelled as one, not as a company',
    FORM.includes('· Individual') && PREVIEW.includes('· Individual'));
  check('the poster card hides when the profile is unavailable', FORM.includes('{poster && ('));
  check('no avatar/bitmoji feature was introduced',
    !/bitmoji|avatarBuilder|AvatarPicker/i.test(FORM) && !/bitmoji/i.test(PREVIEW));

  console.log('\n── 8. Preview ──');

  check('the preview renders from form state, not a request',
    PREVIEW.includes('data: JobPreviewData') && !PREVIEW.includes('fetch('));
  check('the preview is opt-in', FORM.includes('{showPreview && ('));
  check('the preview receives the live form object', FORM.includes('<JobPostPreview data={jobForm}'));
  for (const part of ['title', 'description', 'responsibilities', 'requirements', 'preferredSkills']) {
    check(`the preview shows ${part}`, PREVIEW.includes(`data.${part}`));
  }
  check('the preview shows the meta chips',
    PREVIEW.includes('EMPLOYMENT_TYPE_LABELS') && PREVIEW.includes('WORK_MODE_LABELS')
    && PREVIEW.includes('EXPERIENCE_LABELS'));
  check('the preview splits lists the same way the payload does',
    PREVIEW.includes("value.split('\\n').map((line) => line.trim()).filter(Boolean)"));
  check('the preview is theme-aware', PREVIEW.includes('dark:bg-white/[0.02]') && PREVIEW.includes('dark:text-white/40'));
  check('the preview renders no raw HTML', !PREVIEW.includes('dangerouslySetInnerHTML'));
  check('an empty description is stated, not faked', PREVIEW.includes('No description yet.'));

  console.log('\n── 9. Responsive structure ──');

  check('the form stacks to one column on mobile', FORM.includes('grid gap-4 sm:grid-cols-2'));
  check('the footer actions stack on mobile',
    FORM.includes('flex flex-col-reverse gap-2.5') && FORM.includes('sm:flex-row'));
  check('buttons are full width on mobile', FORM.includes('w-full') && FORM.includes('sm:w-auto'));
  check('the content column is capped', FORM.includes('max-w-3xl'));
  check('long text in the preview cannot break the row',
    PREVIEW.includes('truncate') && PREVIEW.includes('min-w-0'));
  check('the preview wraps its chips', PREVIEW.includes('flex flex-wrap'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
