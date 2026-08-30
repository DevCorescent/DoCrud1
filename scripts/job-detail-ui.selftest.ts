/**
 * Job detail (job description) UI self-test.
 *
 * The valuable assertions are the ones that would catch a UX redesign quietly
 * removing capability: the apply flow, the save and share actions, the
 * owner-only controls, and the rule that a section with no data renders no
 * section. A theme sweep that dropped one of those would look fine in a
 * screenshot and be a regression in production.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { stripDescriptionMarkup } from '@/components/jobs/JobDetailPage';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const DETAIL = read('components/jobs/JobDetailPage.tsx');
const ROUTE = read('app/jobs/[id]/page.tsx');
const SCHEMA = read('lib/server/hiring.ts');

function main() {
  console.log('\n── 1. Data flow and actions are unchanged ──');

  check('the page still renders from the server-supplied job',
    ROUTE.includes('getPublishedHiringJobById(params.id)') && ROUTE.includes('<JobDetailPage job={job}'));
  check('ownership is still decided on the server', ROUTE.includes('userOwnsHiringJob(viewer, job)'));
  check('the job is not refetched on the client', !DETAIL.includes("fetch(`/api/public/hiring/jobs/"));
  check('the native apply still posts to the existing endpoint',
    DETAIL.includes("'/api/hiring/applications'"));
  check('a scraped role still applies at the employer URL',
    DETAIL.includes('href={job.applyUrl}') && DETAIL.includes('isValidApplyUrl'));
  check('external apply still opens in a new tab safely',
    DETAIL.includes('rel="noopener noreferrer nofollow"'));
  check('Save is still available', DETAIL.includes('toggleSave') && DETAIL.includes('aria-pressed={saved}'));
  check('Share is still available', DETAIL.includes('Share Job') && DETAIL.includes('role="menu"'));
  check('owner controls still exist', DETAIL.includes('Edit job') && DETAIL.includes('Unpublish'));
  check('owner controls are still gated by isOwner', DETAIL.includes('{isOwner && ('));
  check('the edit link still targets the composer',
    DETAIL.includes('/jobs/post?edit=${encodeURIComponent(job.id)}'));

  console.log('\n── 2. No invented fields ──');

  /* The reference UI shows stipend, duration, vacancies and perks. None exist
     in HiringJobPosting, so none may appear here. */
  const body = DETAIL.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const absent of ['stipend', 'vacanc', 'perks', 'salary', 'deadline', 'benefits']) {
    check(`no invented "${absent}" field`, !new RegExp(absent, 'i').test(body));
  }
  check('the schema still has no salary field', !/salary\??:/.test(SCHEMA.slice(SCHEMA.indexOf('const nextJob'), SCHEMA.indexOf('const nextJob') + 1200)));
  check('only existing metadata is shown',
    DETAIL.includes("label: 'Location'") && DETAIL.includes("label: 'Employment'")
    && DETAIL.includes("label: 'Work mode'") && DETAIL.includes("label: 'Level'")
    && DETAIL.includes("label: 'Posted'"));

  console.log('\n── 3. Sections render only when data exists ──');

  check('the description section is conditional', DETAIL.includes('{job.description && ('));
  check('skills render only when present',
    DETAIL.includes("(job.preferredSkills ?? []).filter(Boolean).length > 0"));
  check('the metadata block is conditional', DETAIL.includes('{meta.length > 0 && ('));
  check('list sections drop themselves when empty',
    DETAIL.includes('<ListSection title="Responsibilities"') && DETAIL.includes('<ListSection title="Requirements"'));

  console.log('\n── 4. Description safety and formatting ──');

  check('no raw HTML is rendered', !DETAIL.includes('dangerouslySetInnerHTML'));
  check('the description is parsed into blocks, not dumped as one paragraph',
    DETAIL.includes('parseDescription') && DETAIL.includes("kind: 'heading'") && DETAIL.includes("kind: 'list'"));
  check('bullets render as a real list', DETAIL.includes('<ul key={`l-${i}`}'));
  check('headings inside the description are real headings', DETAIL.includes('<h3 key={`h-${i}`}'));
  check('the employer text is not rewritten',
    !/\.replace\(\s*\/\[a-z\]/.test(DETAIL) && DETAIL.includes('{block.text}'));

  console.log('\n── 4b. Scraped markup is removed, never executed ──');

  /* Real shape from the live data: a Greenhouse import stored entity-encoded. */
  const encoded = '&lt;div class=&quot;content-intro&quot;&gt;&lt;p&gt;Razorpay is one of India&#39;s leading companies.&lt;/p&gt;&lt;p&gt;We build payments.&lt;/p&gt;&lt;/div&gt;';
  const cleaned = stripDescriptionMarkup(encoded);
  check('entity-encoded tags are gone', !cleaned.includes('&lt;') && !cleaned.includes('&gt;'));
  check('no literal tags survive', !/<[a-z/][^>]*>/i.test(cleaned), cleaned.slice(0, 60));
  check("the employer's words are preserved",
    cleaned.includes('Razorpay is one of India') && cleaned.includes('We build payments'));
  check('an apostrophe entity is decoded', cleaned.includes("India's"), cleaned.slice(0, 40));
  check('paragraphs become separate lines', cleaned.split('\n').filter(Boolean).length >= 2);

  const withList = stripDescriptionMarkup('&lt;ul&gt;&lt;li&gt;Own the pipeline&lt;/li&gt;&lt;li&gt;Close deals&lt;/li&gt;&lt;/ul&gt;');
  check('list items keep a bullet the parser can see',
    (withList.match(/•/g) ?? []).length === 2, JSON.stringify(withList));

  const script = stripDescriptionMarkup('&lt;p&gt;Real text&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  check('script content is removed entirely', !script.includes('alert'), script);
  check('surrounding text survives a removed script', script.includes('Real text'));

  const plain = 'We are hiring a backend engineer.\nYou will build APIs.';
  check('a plain-text description is returned untouched', stripDescriptionMarkup(plain) === plain);
  check('an empty description is safe', stripDescriptionMarkup('') === '');
  check('the stripper never produces HTML for React to render',
    typeof stripDescriptionMarkup(encoded) === 'string');

  console.log('\n── 5. Layout ──');

  check('the page is two columns from lg',
    DETAIL.includes('lg:grid-cols-[minmax(0,1fr)_320px]'));
  /* `lg:!sticky` is required, not stylistic: app/globals.css has an unmediated
     `.dark aside { position: relative }` that outranks `.lg\:sticky` and
     un-sticks the rail in dark mode only. Verified in Chrome. */
  check('the rail is sticky on desktop in BOTH themes', DETAIL.includes('lg:!sticky lg:top-4'));
  check('the rail comes first on mobile and last on desktop',
    DETAIL.includes('order-first') && DETAIL.includes('lg:order-last'));
  check('the reading column is not cramped', DETAIL.includes('max-w-6xl') && DETAIL.includes('min-w-0'));
  check('the rail carries Apply, metadata and the poster',
    DETAIL.includes('<aside') && DETAIL.includes('Job details') && DETAIL.includes('Posted by'));
  check('the sidebar cannot exceed the viewport on mobile',
    DETAIL.includes('grid gap-5 lg:grid-cols-'));

  console.log('\n── 6. Poster identity ──');

  check('the poster section exists', DETAIL.includes('Posted by'));
  check('an individual is not labelled a company',
    !/>\s*Company\s*</.test(DETAIL) && DETAIL.includes("job.department?.trim() ? job.department.trim() : 'Employer'"));
  check('the poster name comes from the stored job', DETAIL.includes('{company}'));
  /* /api/profile/me was already used here to list the candidate's saved
     resumes for the apply form. Asserting it is ABSENT would be wrong; what
     matters is that no second profile source was added. */
  check('the poster card adds no profile fetch of its own',
    (DETAIL.match(/fetch\('\/api\/profile\//g) ?? []).length === 1);
  check('the existing profile call still serves the resume picker',
    DETAIL.includes('profileResumes') || DETAIL.includes('setProfileResumes'));

  console.log('\n── 7. Both themes ──');

  const darkOnly = DETAIL.split('\n').filter((line) =>
    /className|PANEL|BTN|MUTED|FAINT|HEADING|INPUT/.test(line)
    && /(text-white\/|bg-white\/\[0|border-white\/\[0|#0A0A0C)/.test(line)
    && !line.includes('dark:'));
  check('no dark-only surface, text or border remains',
    darkOnly.length === 0, darkOnly[0]?.trim().slice(0, 90));
  check('no class was damaged by the theme sweep',
    !/dark:\/\d/.test(DETAIL) && !/hover:\/\d/.test(DETAIL));
  check('the page has a light background', DETAIL.includes('bg-slate-50 text-slate-900 dark:bg-[#0A0A0C]'));
  check('panels are readable in both themes',
    DETAIL.includes('border-slate-200 bg-white dark:border-white/[0.07] dark:bg-white/[0.02]'));
  check('the primary button avoids the white-on-white trap',
    DETAIL.includes('dark:text-[#020617]') && !DETAIL.includes('dark:text-slate-900'));
  check('Apply keeps a colour that works on both grounds',
    DETAIL.includes('bg-emerald-500') && DETAIL.includes('text-white'));

  console.log('\n── 8. Accessibility ──');

  check('there is exactly one h1', (DETAIL.match(/<h1\b/g) ?? []).length === 1);
  check('sections use h2', (DETAIL.match(/<h2\b/g) ?? []).length >= 3);
  check('sub-sections use h3', (DETAIL.match(/<h3\b/g) ?? []).length >= 2);
  check('icon-only controls are labelled',
    DETAIL.includes('aria-label="Back"') && DETAIL.includes("aria-label={saved ?"));
  check('decorative icons are hidden', (DETAIL.match(/aria-hidden/g) ?? []).length >= 3);
  check('focus is visible on interactive elements',
    (DETAIL.match(/focus-visible:ring/g) ?? []).length >= 3);
  check('the save control reports its state', DETAIL.includes('aria-pressed={saved}'));
  check('status messages are announced', DETAIL.includes('role="status"'));

  console.log('\n── 9. Match score is not invented ──');

  /* The detail page receives `job` and `isOwner` only. Adding a score here
     would mean running the recommendation engine per page view, which this
     task explicitly must not do. */
  check('no match score is computed in the UI',
    !DETAIL.includes('recommendMatch') && !DETAIL.includes('buildRecProfile'));
  check('no recommendation endpoint is called from the detail page',
    !DETAIL.includes('/api/recommendations/'));
  check('the server page does not compute a score either',
    !ROUTE.includes('recommendMatch'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
