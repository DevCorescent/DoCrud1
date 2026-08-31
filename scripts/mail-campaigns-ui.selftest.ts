/**
 * Campaign control-centre self-test (Phase 6).
 *
 * Two classes of failure matter here and neither is a crash:
 *
 *  1. TELLING THE ADMIN SOMETHING UNTRUE — calling provider acceptance
 *     "delivered", collapsing a partial failure into "sent", or rendering an
 *     API error as an empty campaign list ("nothing was ever sent").
 *  2. OFFERING AN UNSAFE ACTION — a retry button for a permanently failed
 *     recipient, cancelling a campaign that is already sending, or a duplicate
 *     that quietly re-sends.
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
const API = read('app/api/super-admin/mail/campaigns/route.ts');
const UI = read('components/superadmin/mail/MailCampaigns.tsx');
const PANEL = read('components/SuperAdminPanel.tsx');
const ENGINE = read('lib/server/mail-campaigns.ts');

function main() {
  console.log('\n── 1. Authorization and access ──');

  check('both verbs are guarded',
    (API.match(/const session = await guard\(req\);/g) ?? []).length === 2
    && (API.match(/{ error: 'Unauthorized' }, { status: 401 }/g) ?? []).length === 2);
  check('it uses the Super Admin session, not the NextAuth admin role',
    API.includes('getSuperAdminSessionFromRequest') && !API.includes("role !== 'admin'"));
  check('the existing admin campaign routes are untouched',
    read('app/api/admin/mail/campaigns/route.ts').includes("role !== 'admin'"));
  check('a missing campaign is a 404, not an empty object',
    API.includes("{ error: 'Campaign not found.' }, { status: 404 }"));
  check('the campaign id is required for actions',
    API.includes("'A campaign id is required.'"));
  /* Status must come from the store, never from the caller. */
  check('no status is accepted from the client',
    !/body\.(status|progress|sent|failed|deliveries)/.test(API));

  console.log('\n── 2. Listing ──');

  check('the list is paginated server-side',
    API.includes('const PAGE_SIZE = 20') && API.includes('rows.slice(start, start + PAGE_SIZE)'));
  check('search covers subject, title and id',
    API.includes('c.subject.toLowerCase().includes(search)')
    && API.includes('c.id.toLowerCase().includes(search)'));
  check('status filtering is supported', API.includes("rows.filter((c) => c.status === status)"));
  check('status counts are returned for the filter chips', API.includes('counts: {'));
  /* The list must not carry bodies or per-recipient records. */
  const listRowBody = API.slice(API.indexOf('function toListRow'), API.indexOf('export async function GET'));
  check('the list projection omits the body and deliveries',
    listRowBody.includes('pendingRetry')
    && !listRowBody.includes('html:') && !listRowBody.includes('deliveries:'));
  check('newest-first ordering comes from the store',
    ENGINE.includes('new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()'));

  console.log('\n── 3. Detail ──');

  check('detail returns per-recipient delivery records',
    API.includes('const deliveries = (campaign.deliveries ?? []).map'));
  check('failures reuse the existing classifier, not a second one',
    API.includes('classifyMailError({ message: d.error, responseCode: d.providerCode })')
    && !API.includes('function classify'));
  check('retryability is surfaced per recipient', API.includes('retryable: f ? f.retryable : null'));
  check('outbox events are linked by campaign id',
    API.includes("e.metadata?.campaignId === id"));
  check('outbox rows are capped', API.includes('.slice(0, 100)'));
  check('the detail shows attempts and next retry',
    UI.includes('{d.attempts}') && UI.includes('fmt(d.nextRetryAt)'));

  console.log('\n── 4. Cancel ──');

  check('only pre-processing campaigns can be cancelled',
    API.includes("const CANCELLABLE: MailCampaignStatus[] = ['draft', 'scheduled']"));
  check('cancelling a running campaign is refused with a reason',
    API.includes('can no longer be cancelled') && API.includes('{ status: 409 }'));
  /* Cancellation only works because the claim refuses cancelled campaigns. */
  check('cron already skips cancelled campaigns',
    ENGINE.includes("campaign.status === 'cancelled'") && ENGINE.includes('Campaign is cancelled'));
  check('cancellation is audited',
    API.includes("action: 'mail.campaign.cancelled'"));
  check('cancellation asks for confirmation',
    UI.includes('Cancel this campaign?') && UI.includes('Keep scheduled'));
  check('the confirmation states it cannot be undone',
    UI.includes('It will not be sent. This cannot be undone.'));

  console.log('\n── 5. Duplicate ──');

  /* A duplicate that inherits sendAt would be picked up by cron immediately —
     a silent resend to the whole audience. */
  check('a duplicate lands as a draft with no send time',
    API.includes("status: 'draft'") && API.includes('sendAt: undefined'));
  check('a duplicate carries no delivery history or progress',
    API.includes('deliveries: undefined') && API.includes('progress: undefined'));
  check('a duplicate gets a new id and timestamps',
    API.includes('id: createCampaignId()') && API.includes('createdAt: now'));
  check('a duplicate is attributed to the acting admin',
    API.includes('createdBy: session.email'));
  check('duplication is audited', API.includes("action: 'mail.campaign.duplicated'"));
  check('the UI says a duplicate will not send by itself',
    UI.includes('will not send until you schedule it'));

  console.log('\n── 6. The UI tells the truth ──');

  /* The vocabulary rule this project keeps returning to. */
  check('acceptance is never called delivery',
    UI.includes('Accepted by provider') && !/\bDelivered\b/.test(UI));
  check('the inbox caveat is stated',
    /not\s+[\s\S]{0,40}confirmation that it reached an inbox/.test(UI)
    && UI.includes('does not claim delivery'));
  check('partial failure is its own status, not sent or failed',
    UI.includes("partially_failed: { word: 'Partially failed'"));
  check('processing is distinguished from sent',
    UI.includes("sending: { word: 'Processing'"));
  check('status is conveyed in words, not colour alone',
    UI.includes('function Badge') && UI.includes('{s.word}'));
  /* No retry affordance for something retrying cannot fix. */
  check('a permanent failure offers no retry, and says why',
    UI.includes('Permanent — will not be retried.')
    && !UI.includes('Retry now'));
  check('a pending recipient is shown as retry scheduled',
    UI.includes("'Retry scheduled'"));
  check('the provider error is preserved verbatim',
    UI.includes('{c.lastError}') && UI.includes('{d.error}'));
  check('an empty recipient table explains itself rather than implying failure',
    UI.includes('only unsuccessful recipients are recorded here'));

  console.log('\n── 7. States ──');

  /* An API failure rendered as an empty list reads as "nothing was ever sent". */
  check('an API failure is not rendered as an empty list',
    UI.includes("setError(data?.error || 'Unable to load campaigns.'); return;"));
  check('empty and filtered-empty are different messages',
    UI.includes('No campaigns yet.') && UI.includes('No campaigns match your filters.'));
  check('no outbox events has its own message',
    UI.includes('No outbox events recorded.'));
  check('loading state exists', UI.includes('Loading campaigns…'));
  check('errors are announced', UI.includes('role="alert"'));
  check('actions are announced', UI.includes('role="status"'));
  check('double submissions are prevented',
    UI.includes('if (acting) return;') && UI.includes('disabled={acting}'));
  check('there is no polling loop', !UI.includes('setInterval'));

  console.log('\n── 8. Layout and integration ──');

  check('tables scroll inside their own container',
    (UI.match(/overflow-x-auto/g) ?? []).length >= 2);
  check('long values wrap rather than widening the page',
    UI.includes('break-all') && UI.includes('truncate'));
  /* The nav grows each phase; pinning its exact union made this fail whenever
     a real section was added. What must hold is that Campaigns is mounted. */
  check('the campaigns tab is mounted',
    PANEL.includes('<MailCampaigns />')
    && /const \[view, setView\] = useState<[^>]*'campaigns'[^>]*>/.test(PANEL));
  /* Scoped to the mail nav — an unrelated Documents tab also uses 'templates'. */
  const mailNav = (/const \[view, setView\] = useState<[^>]*'campaigns'[^>]*>\([^)]*\)/.exec(PANEL) ?? [''])[0];
  /* 'drafts' joined the nav in Phase 7 and is a real section. */
  /* A deny-list of section names rots: each phase turns one of them real.
     The durable invariant is that every nav entry has a mounted component. */
  check('no placeholder tab is advertised', !PANEL.includes('Coming soon'));
  check('every mail nav entry has a mounted component',
    (mailNav.match(/'[a-z]+'/g) ?? []).every((m) => {
      const v = m.replace(/'/g, '');
      return PANEL.includes(`view === '${v}'`);
    }), mailNav);
  check('the campaign engine was not reimplemented',
    !API.includes('sendTrackedMail') && !API.includes('runLimited')
    && API.includes("from '@/lib/server/mail-campaigns'"));
  check('open buttons are labelled for assistive tech',
    UI.includes('aria-label={`Open campaign ${c.title}`}'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
