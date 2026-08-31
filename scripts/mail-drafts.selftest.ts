/**
 * Draft manager self-test (Phase 7).
 *
 * Autosave's dangerous failure is not "a save didn't happen" — it is a save
 * that happened with OLD content, silently reverting the admin's work. Two
 * requests in flight can complete in either order, so request order is not a
 * safe proxy for recency. The revision guard is what makes that impossible,
 * and most of this file exercises it for real against the storage layer.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import {
  saveMailDraft, getMailDraftById, getMailDrafts, deleteMailDraft,
  duplicateMailDraft, DraftConflictError,
} from '@/lib/server/mail-drafts';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const API = read('app/api/super-admin/mail/drafts/route.ts');
const LIB = read('lib/server/mail-drafts.ts');
const COMPOSE = read('components/superadmin/mail/MailCompose.tsx');
const UI = read('components/superadmin/mail/MailDrafts.tsx');
const PANEL = read('components/SuperAdminPanel.tsx');

const FILE = path.join(process.cwd(), 'data', 'mail-drafts.json');
let backup: string | null = null;

async function main() {
  delete process.env.MONGODB_URI;
  if (existsSync(FILE)) backup = readFileSync(FILE, 'utf8');
  writeFileSync(FILE, JSON.stringify({ drafts: [] }));

  console.log('\n── 1. Create and update ──');

  const created = await saveMailDraft({
    subject: 'First draft', html: '<p>Hello</p>', actor: 'admin@docrud.com',
  });
  check('a draft is created', Boolean(created.id));
  check('the first revision is 1', created.revision === 1, String(created.revision));
  check('HTML is sanitized on write', !created.html.includes('<script'));
  check('plain text is derived', created.text === 'Hello', created.text);
  check('the author is recorded', created.createdBy === 'admin@docrud.com');

  const updated = await saveMailDraft({
    id: created.id, subject: 'Second', html: '<p>World</p>',
    baseRevision: created.revision, actor: 'admin@docrud.com',
  });
  check('an update keeps the id', updated.id === created.id);
  check('the revision increments', updated.revision === 2, String(updated.revision));
  check('the original author is preserved', updated.createdBy === 'admin@docrud.com');
  check('content is replaced', updated.text === 'World');

  console.log('\n── 2. Sanitization on every write ──');

  const nasty = await saveMailDraft({
    id: created.id, baseRevision: updated.revision, actor: 'a@b.com',
    subject: 'X',
    html: '<p>ok</p><script>alert(1)</script><a href="javascript:alert(2)">x</a>',
  });
  check('script is stripped on save', !nasty.html.includes('<script'));
  check('javascript: URLs are stripped on save', !nasty.html.includes('javascript'));
  check('sanitization lives in the library, not only the route',
    LIB.includes('sanitizeEmailHtml(input.html)'));
  check('plain text is never taken from the client',
    !API.includes('body.text') && LIB.includes('emailHtmlToText(html)'));

  console.log('\n── 3. The concurrency guard ──');

  /* The scenario: two autosaves start from the same revision. The one that
     lands second carries OLDER content and must be refused. */
  const base = await saveMailDraft({
    id: created.id, subject: 'Base', html: '<p>base</p>',
    baseRevision: nasty.revision, actor: 'a@b.com',
  });
  const fast = await saveMailDraft({
    id: created.id, subject: 'Newer', html: '<p>newer</p>',
    baseRevision: base.revision, actor: 'a@b.com',
  });
  check('the newer save succeeds', fast.text === 'newer');

  let conflicted = false;
  try {
    await saveMailDraft({
      id: created.id, subject: 'Older', html: '<p>older</p>',
      baseRevision: base.revision, actor: 'a@b.com',
    });
  } catch (e) { conflicted = e instanceof DraftConflictError; }
  check('a stale save is refused, not applied', conflicted);

  const after = await getMailDraftById(created.id);
  check('the newest content survives', after?.text === 'newer', after?.text);
  check('the conflict carries the current draft for reconciliation',
    LIB.includes('readonly current: MailDraft'));
  check('the API reports a conflict as 409, not a server error',
    API.includes('conflict: true') && API.includes('{ status: 409 }'));
  /* A create has no base revision to check. */
  const fresh = await saveMailDraft({ subject: 'No base', html: '<p>x</p>', actor: 'a@b.com' });
  check('a create needs no base revision', fresh.revision === 1);

  console.log('\n── 4. Duplicate ──');

  const withSchedule = await saveMailDraft({
    subject: 'Scheduled draft', html: '<p>x</p>', actor: 'a@b.com',
    audience: { mode: 'all' }, scheduleAt: '2030-01-01T00:00', scheduleTimezone: 'Asia/Kolkata',
  });
  const copy = await duplicateMailDraft(withSchedule.id, 'other@docrud.com');
  check('a duplicate is created', Boolean(copy));
  check('the duplicate has a new id', copy!.id !== withSchedule.id);
  check('the duplicate has its own revision', copy!.revision === 1);
  check('content is copied', copy!.html === withSchedule.html);
  check('the audience definition is copied',
    JSON.stringify(copy!.audience) === JSON.stringify(withSchedule.audience));
  /* A copy inheriting a send time would inherit a decision made for a
     different message. */
  check('scheduling intent is NOT copied', !copy!.scheduleAt);
  check('the duplicate is attributed to the acting admin',
    copy!.createdBy === 'other@docrud.com');
  check('duplicating an unknown draft returns null',
    (await duplicateMailDraft('nope', 'a@b.com')) === null);

  console.log('\n── 5. Audience and schedule are intent only ──');

  check('the audience definition is stored, not a recipient list',
    JSON.stringify(withSchedule.audience) === '{"mode":"all"}');
  check('a draft carries no recipient addresses',
    !JSON.stringify(withSchedule).includes('@example.com'));
  /* Nothing may read scheduleAt and act on it. */
  check('no scheduler reads drafts',
    !read('lib/server/mail-campaigns.ts').includes('mail-drafts')
    && !read('app/api/cron/mail/route.ts').includes('draft'));
  check('the draft store is separate from the campaign store',
    LIB.includes('mailDraftsPath') && !LIB.includes('mailCampaignsPath'));

  console.log('\n── 6. List, search, delete ──');

  const all = await getMailDrafts();
  check('drafts are listed newest first',
    all.length >= 2
    && new Date(all[0].updatedAt).getTime() >= new Date(all[1].updatedAt).getTime());
  check('the list is paginated server-side',
    API.includes('const PAGE_SIZE = 20') && API.includes('slice(start, start + PAGE_SIZE)'));
  check('search is server-side',
    API.includes("d.subject.toLowerCase().includes(search)"));
  check('the list omits bodies',
    !/drafts: all\.slice[\s\S]{0,300}html:/.test(API));

  await deleteMailDraft(fresh.id);
  check('a draft can be deleted', (await getMailDraftById(fresh.id)) === null);
  check('deleting does not create a campaign', !API.includes('upsertMailCampaign'));

  console.log('\n── 7. Autosave behaviour ──');

  check('autosave is debounced, not per keystroke',
    COMPOSE.includes('setTimeout(() => { void persistDraft(true); }, 1200)'));
  check('autosave only runs when something changed',
    COMPOSE.includes('if (!dirty || !subject.trim() || loadingDraft) return undefined;'));
  /* State updates are async; a ref is the only synchronous guard. */
  check('overlapping saves are prevented synchronously',
    COMPOSE.includes('if (savingRef.current) return false;'));
  check('a superseded response cannot overwrite newer state',
    COMPOSE.includes('const seq = ++saveSeq.current;')
    && COMPOSE.includes('if (seq !== saveSeq.current) return false;'));
  check('the revision is sent with every save',
    COMPOSE.includes('revision: revision ?? undefined'));
  check('the revision is refreshed from the response',
    COMPOSE.includes('setRevision(data.draft.revision ?? null)'));
  /* "Saved" must never appear over a failed write. */
  check('a failed save is reported as failed, not saved',
    COMPOSE.includes("setAutosaveState('failed')")
    && COMPOSE.includes('Save failed — your changes are not stored'));
  check('a conflict tells the admin to reload rather than silently losing work',
    COMPOSE.includes('This draft was changed elsewhere.'));
  check('autosave and manual save share one path',
    COMPOSE.includes('const saveDraft = useCallback(() => persistDraft(false)'));
  check('an empty subject does not spam the server',
    COMPOSE.includes("if (!subject.trim()) {"));

  console.log('\n── 8. Drafts never send themselves ──');

  check('the drafts screen states drafts are never sent on their own',
    UI.includes('Drafts are never sent on their own'));
  check('editing reuses the composer rather than a second editor',
    UI.includes('<MailCompose draftId={editing || undefined} />'));
  check('the drafts screen creates no campaign',
    !UI.includes('send_broadcast') && !UI.includes('campaigns'));
  check('a duplicate is described as not sending on its own',
    UI.includes('will not send on its own'));
  check('deletion asks for confirmation',
    UI.includes('Delete this draft?') && UI.includes('This cannot be undone.'));
  check('double-clicks are guarded', UI.includes('if (acting) return;'));

  console.log('\n── 9. States, security and layout ──');

  /* The expression became `describeFetchError`, which also turns a 401 into
     "sign in again" instead of the raw "Unauthorized". The property is the
     same - a failure sets an error rather than rendering an empty list - and
     is asserted here against the shared helper. */
  check('an API failure is not rendered as an empty list',
    UI.includes("describeFetchError(r.status, data?.error, 'Unable to load drafts.')")
    && UI.includes("from '@/lib/email/session-error'"));
  check('empty and search-empty are different messages',
    UI.includes('No drafts yet.') && UI.includes('No drafts match your search.'));
  check('loading state exists', UI.includes('Loading drafts…'));
  check('errors and actions are announced',
    UI.includes('role="alert"') && UI.includes('role="status"'));
  check('every verb is guarded',
    (API.match(/const session = await guard\(req\);/g) ?? []).length === 3);
  check('the author comes from the session, not the payload',
    API.includes('actor: session.email') && !/body\.(createdBy|updatedBy|actor)/.test(API));
  check('an unknown draft is a 404', API.includes("{ error: 'Draft not found.' }, { status: 404 }"));
  check('the table scrolls inside its own container', UI.includes('overflow-x-auto'));
  check('row actions are labelled for assistive tech',
    UI.includes('aria-label={`Edit draft ${d.subject}`}'));
  check('the drafts tab is mounted',
    PANEL.includes('<MailDrafts />')
    && /const \[view, setView\] = useState<[^>]*'drafts'[^>]*>/.test(PANEL));

  restore();
  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

function restore() {
  if (backup !== null) writeFileSync(FILE, backup);
  else if (existsSync(FILE)) unlinkSync(FILE);
}

main().catch((err) => { restore(); console.error(err); process.exit(1); });
