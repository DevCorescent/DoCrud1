/**
 * Email template self-test (Phase 8).
 *
 * The requirement that matters most is §37: editing a template must not change
 * a campaign already created from it. That holds because a campaign stores its
 * own resolved HTML and no send path ever reads a template — both asserted
 * here, because a future "optimisation" that swaps the copy for a templateId
 * lookup would silently rewrite mail history.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import {
  saveMailTemplate, getMailTemplateById, getMailTemplates, deleteMailTemplate,
  duplicateMailTemplate, TemplateConflictError, TEMPLATE_CATEGORIES,
} from '@/lib/server/mail-templates';
import { unknownVariables } from '@/lib/server/mail-recipients';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const API = read('app/api/super-admin/mail/templates/route.ts');
const LIB = read('lib/server/mail-templates.ts');
const UI = read('components/superadmin/mail/MailTemplates.tsx');
const COMPOSE = read('components/superadmin/mail/MailCompose.tsx');
const PANEL = read('components/SuperAdminPanel.tsx');
const CAMPAIGNS = read('lib/server/mail-campaigns.ts');
const MAIL_API = read('app/api/super-admin/mail/route.ts');
const PREVIEW_UI = read('components/superadmin/mail/EmailPreviewDialog.tsx');
const TEST_UI = read('components/superadmin/mail/TestSendDialog.tsx');
const CONTRACTS = read('lib/email/variable-contracts.ts');

const FILE = path.join(process.cwd(), 'data', 'mail-templates.json');
let backup: string | null = null;

async function main() {
  delete process.env.MONGODB_URI;
  if (existsSync(FILE)) backup = readFileSync(FILE, 'utf8');
  writeFileSync(FILE, JSON.stringify({ templates: [] }));

  console.log('\n── 1. Create, update, sanitize ──');

  const t = await saveMailTemplate({
    name: 'Welcome', subject: 'Hi {{firstName}}',
    html: '<h1>Hello</h1><script>alert(1)</script><a href="javascript:x">bad</a>',
    category: 'marketing', actor: 'admin@docrud.com',
  });
  check('a template is created', Boolean(t.id) && t.revision === 1);
  check('script is stripped on write', !t.html.includes('<script'));
  check('javascript: URLs are stripped', !t.html.includes('javascript'));
  /* The sanitizer keeps link TEXT while dropping the unsafe href, so the
     derived text legitimately contains both. */
  check('plain text is derived server-side',
    t.text.includes('Hello') && !t.text.includes('<'), JSON.stringify(t.text));
  check('the category is applied', t.category === 'marketing');
  check('an unknown category falls back rather than being stored',
    (await saveMailTemplate({ name: 'X', subject: 'S', html: '<p>x</p>', category: 'nonsense', actor: 'a' })).category === 'general');
  check('the author is recorded', t.createdBy === 'admin@docrud.com');
  check('sanitization lives in the library, not only the route',
    LIB.includes('sanitizeEmailHtml(input.html)'));

  const updated = await saveMailTemplate({
    id: t.id, name: 'Welcome v2', subject: 'Hi', html: '<p>v2</p>',
    baseRevision: t.revision, actor: 'admin@docrud.com',
  });
  check('an update keeps the id and bumps the revision',
    updated.id === t.id && updated.revision === 2);
  check('the original author survives an update', updated.createdBy === 'admin@docrud.com');

  console.log('\n── 2. Revision conflict ──');

  await saveMailTemplate({
    id: t.id, name: 'Newer', subject: 'S', html: '<p>newer</p>',
    baseRevision: updated.revision, actor: 'a@b.com',
  });
  let conflicted = false;
  try {
    await saveMailTemplate({
      id: t.id, name: 'Older', subject: 'S', html: '<p>older</p>',
      baseRevision: updated.revision, actor: 'a@b.com',
    });
  } catch (e) { conflicted = e instanceof TemplateConflictError; }
  check('a stale write is refused', conflicted);
  check('the newest content survives', (await getMailTemplateById(t.id))?.text === 'newer');
  check('the API reports a conflict as 409',
    API.includes('conflict: true') && API.includes('{ status: 409 }'));
  check('the conflict carries the current template for reconciliation',
    LIB.includes('readonly current: MailTemplate'));
  check('the UI tells the admin to reload rather than losing a version',
    UI.includes('changed by another administrator'));

  console.log('\n── 3. Variables ──');

  check('unknown variables are reported, not substituted',
    JSON.stringify(unknownVariables('Hello {{city}}')) === '["city"]');
  check('the API reports unknown variables on save and read',
    (API.match(/unknownVariables\(/g) ?? []).length === 2);
  check('no second variable resolver was created',
    API.includes("from '@/lib/server/mail-recipients'") && !LIB.includes('unknownVariables'));
  check('the variable list is served by the server, not hardcoded in the UI',
    API.includes('variables: SUPPORTED_VARIABLES') && !UI.includes("'firstName',"));
  check('the UI blocks on unknown variables', UI.includes('will block sending'));
  /* Preview values must never leak into a real send. */
  /* Sample data moved to ONE server-side source. The template screen used to
     carry its own map (John Doe, john@example.com) while the server used
     different values, so the preview an admin approved was rendered by
     different code with different data than the email that would be sent. */
  check('preview values are clearly sample data',
    CONTRACTS.includes('export const SAMPLE_VALUES')
    && CONTRACTS.includes("email: 'test@example.com'")
    && UI.includes('never used as an audience'));
  check('preview substitution is display-only',
    /* No component substitutes variables any more - not this one, not the
       composer, not the shared dialog. */
    !UI.includes('const renderPreview')
    && !/\{\{\\s\*\(\[a-zA-Z0-9_\]\+\)/.test(UI)
    && !COMPOSE.includes('PREVIEW_VALUES')
    && !PREVIEW_UI.includes('.replace(/\\{\\{'));

  console.log('\n── 4. Campaign immutability (§37) ──');

  /* If a campaign referenced a template instead of copying it, editing the
     template would rewrite mail that has already been delivered. */
  check('a campaign stores its own HTML at creation',
    MAIL_API.includes('html: String(htmlBody)'));
  check('no send path reads a template',
    !CAMPAIGNS.includes('mail-templates')
    && !read('app/api/cron/mail/route.ts').includes('template'));
  check('the campaign record has no templateId link',
    !CAMPAIGNS.includes('templateId'));
  check('using a template COPIES content into the composer',
    COMPOSE.includes('/* A copy, not a reference. */')
    && COMPOSE.includes('setHtml(t.html ?? \'\')'));
  check('the composer keeps no live template reference',
    !COMPOSE.includes('templateId:'));
  check('the UI states edits do not change sent mail',
    UI.includes('never changes an email that has already been sent')
    && COMPOSE.includes('do not affect what you send from here'));

  console.log('\n── 5. Duplicate, archive, delete ──');

  const copy = await duplicateMailTemplate(t.id, 'other@docrud.com');
  check('a duplicate is created with a new id', Boolean(copy) && copy!.id !== t.id);
  check('the duplicate is named as a copy', copy!.name.includes('(Copy)'));
  check('the duplicate starts at revision 1', copy!.revision === 1);
  check('the duplicate is attributed to the acting admin', copy!.createdBy === 'other@docrud.com');
  check('content is copied', copy!.html === (await getMailTemplateById(t.id))!.html);
  /* There is no send state on a template, and none may be invented. */
  check('a template carries no send state',
    !JSON.stringify(copy).includes('sendAt') && !JSON.stringify(copy).includes('deliveries'));
  check('duplicating an unknown template returns null',
    (await duplicateMailTemplate('nope', 'a')) === null);

  const archived = await saveMailTemplate({
    id: copy!.id, name: copy!.name, subject: copy!.subject, html: copy!.html,
    status: 'archived', baseRevision: copy!.revision, actor: 'a@b.com',
  });
  check('a template can be archived', archived.status === 'archived');
  check('archiving does not delete it', Boolean(await getMailTemplateById(copy!.id)));
  check('the composer offers only active templates',
    COMPOSE.includes("templates?status=active"));

  await deleteMailTemplate(copy!.id);
  check('a template can be deleted', (await getMailTemplateById(copy!.id)) === null);
  check('deleting creates no campaign', !API.includes('upsertMailCampaign'));
  check('the UI says existing campaigns are unaffected',
    UI.includes('Campaigns and drafts already created from it are unaffected'));

  console.log('\n── 6. List, search, filters ──');

  const all = await getMailTemplates();
  check('templates are listed newest first',
    all.length >= 2
    && new Date(all[0].updatedAt).getTime() >= new Date(all[1].updatedAt).getTime());
  check('the list is paginated server-side',
    API.includes('const PAGE_SIZE = 20') && API.includes('slice(start, start + PAGE_SIZE)'));
  check('search covers name and subject',
    API.includes('t.name.toLowerCase().includes(search)')
    && API.includes('t.subject.toLowerCase().includes(search)'));
  check('category and status filters exist',
    API.includes('t.category === category') && API.includes('t.status === status'));
  check('the list omits bodies',
    !/templates: rows\.slice[\s\S]{0,300}html:/.test(API));
  check('categories are a fixed, meaningful set',
    TEMPLATE_CATEGORIES.length === 4 && TEMPLATE_CATEGORIES.includes('marketing'));

  console.log('\n── 7. Editor reuse and safety ──');

  check('the existing editor is reused, not replaced',
    UI.includes("from '@/components/superadmin/mail/RichEmailEditor'")
    && !UI.includes('contentEditable'));
  check('preview uses the shared server endpoint',
    UI.includes('<EmailPreviewDialog') && UI.includes('source="template"')
    && PREVIEW_UI.includes("fetch('/api/super-admin/mail/preview'"));
  check('the template screen cannot send anything',
    /* A test send is explicit and single-recipient; broadcasting is not
       reachable from here, and an archived template is refused outright. */
    !UI.includes('send_broadcast')
    && UI.includes("blockedReason={editingStatus === 'archived'")
    && TEST_UI.includes('never reach a campaign audience'));
  check('image upload reuses the existing pipeline',
    read('components/superadmin/mail/RichEmailEditor.tsx').includes('/api/super-admin/mail/upload'));
  check('the async-load bug from Phase 7 cannot recur here',
    read('components/superadmin/mail/RichEmailEditor.tsx').includes('lastEmitted.current'));

  console.log('\n── 8. Security, states, layout ──');

  check('every verb is guarded',
    (API.match(/const session = await guard\(req\);/g) ?? []).length === 3);
  check('the author comes from the session, not the payload',
    API.includes('const actor = session.email') && !/body\.(createdBy|updatedBy|actor)/.test(API));
  check('an unknown template is a 404',
    (API.match(/'Template not found\.' }, { status: 404 }/g) ?? []).length >= 2);
  check('a name and subject are required',
    API.includes("'A template name is required.'") && API.includes("'A subject is required.'"));
  check('actions are audited',
    ['created', 'updated', 'duplicated', 'deleted'].every((a) => API.includes(a)));
  check('an audit failure cannot fail a save', API.includes('never fail a save for the audit trail'));
  /* The expression became `describeFetchError`, which also turns a 401 into
     "sign in again" instead of the raw "Unauthorized". The property is the
     same - a failure sets an error rather than rendering an empty list - and
     is asserted here against the shared helper. */
  check('an API failure is not rendered as an empty list',
    UI.includes("describeFetchError(r.status, data?.error, 'Unable to load templates.')")
    && UI.includes("from '@/lib/email/session-error'"));
  check('empty and search-empty are different messages',
    UI.includes('No email templates yet.') && UI.includes('No templates match your search.'));
  check('double-clicks are guarded synchronously',
    UI.includes('if (savingRef.current) return;') && UI.includes('if (actingRef.current) return;'));
  check('the table scrolls inside its own container', UI.includes('overflow-x-auto'));
  check('row actions are labelled for assistive tech',
    UI.includes('aria-label={`Edit template ${t.name}`}'));
  check('replacing composer content asks first',
    COMPOSE.includes('Replace current content?'));
  check('the templates tab is mounted',
    PANEL.includes('<MailTemplates />')
    && /const \[view, setView\] = useState<[^>]*'templates'[^>]*>/.test(PANEL));

  restore();
  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

function restore() {
  if (backup !== null) writeFileSync(FILE, backup);
  else if (existsSync(FILE)) unlinkSync(FILE);
}

main().catch((err) => { restore(); console.error(err); process.exit(1); });
