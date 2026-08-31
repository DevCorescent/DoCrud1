/**
 * Recipient engine + broadcast self-test.
 *
 * The failures worth catching here are the ones that mail the wrong people, or
 * tell the admin something untrue about what happened:
 *
 *  - a client-supplied recipient list being trusted,
 *  - a duplicate or invalid address being counted as deliverable,
 *  - an unresolved {{variable}} going out literally to thousands of people,
 *  - and the specific regression this pass fixed: reporting "sent" for messages
 *    that were only attempted.
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  matchesSegment, extractVariables, unknownVariables, renderVariables,
  SUPPORTED_VARIABLES, type RecipientUser, type MailSegment,
} from '@/lib/server/mail-recipients';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const ENGINE = read('lib/server/mail-recipients.ts');
const ROUTE = read('app/api/super-admin/mail/route.ts');
const CAMPAIGNS = read('lib/server/mail-campaigns.ts');
const PANEL = read('components/SuperAdminPanel.tsx');

/** Source assertions must look at code, not at comments describing old code. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ENGINE_CODE = code(ENGINE);
const ROUTE_CODE = code(ROUTE);

const user = (over: Partial<RecipientUser> = {}): RecipientUser => ({
  id: 'u1', email: 'a@example.com', name: 'Ada Lovelace', role: 'user',
  accountType: 'individual', isActive: true,
  createdAt: new Date().toISOString(), ...over,
});

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function main() {
  console.log('\n── 1. Segment matching ──');

  check('all matches everyone', matchesSegment(user(), { mode: 'all' }));
  check('individuals matches an individual',
    matchesSegment(user({ accountType: 'individual' }), { mode: 'individuals' }));
  check('individuals does not match a business',
    !matchesSegment(user({ accountType: 'business' }), { mode: 'individuals' }));
  check('businesses matches a business',
    matchesSegment(user({ accountType: 'business' }), { mode: 'businesses' }));
  check('selected matches only the listed ids',
    matchesSegment(user({ id: 'u7' }), { mode: 'selected', userIds: ['u7'] })
    && !matchesSegment(user({ id: 'u8' }), { mode: 'selected', userIds: ['u7'] }));
  /* Manual addresses are not drawn from the user store, so no user matches. */
  check('manual mode matches no stored user',
    !matchesSegment(user(), { mode: 'manual', emails: ['x@y.com'] }));

  console.log('\n── 2. Filters use fields that exist ──');

  const f = (filters: NonNullable<MailSegment['filters']>): MailSegment => ({ mode: 'filtered', filters });
  check('accountType filters',
    matchesSegment(user({ accountType: 'business' }), f({ accountType: 'business' }))
    && !matchesSegment(user({ accountType: 'individual' }), f({ accountType: 'business' })));
  check('active status filters',
    matchesSegment(user({ isActive: true }), f({ status: 'active' }))
    && !matchesSegment(user({ isActive: false }), f({ status: 'active' })));
  check('inactive status filters',
    matchesSegment(user({ isActive: false }), f({ status: 'inactive' })));
  check('role filters case-insensitively',
    matchesSegment(user({ role: 'Admin' }), f({ role: 'admin' })));
  check('recently-created filters',
    matchesSegment(user({ createdAt: daysAgo(3) }), f({ createdWithinDays: 7 }))
    && !matchesSegment(user({ createdAt: daysAgo(40) }), f({ createdWithinDays: 7 })));
  check('an unparseable createdAt does not match a date window',
    !matchesSegment(user({ createdAt: 'not-a-date' }), f({ createdWithinDays: 30 })));
  check('search matches name, email and organisation',
    matchesSegment(user({ name: 'Ada Lovelace' }), f({ search: 'lovelace' }))
    && matchesSegment(user({ email: 'ada@corp.com' }), f({ search: 'corp' }))
    && matchesSegment(user({ organizationName: 'Acme Ltd' }), f({ search: 'acme' })));
  check('conditions are ANDed',
    !matchesSegment(user({ accountType: 'individual', isActive: false }),
      f({ accountType: 'individual', status: 'active' })));
  /* Offering a filter with no backing field would silently match nobody. */
  check('no location filter is offered, because the field does not exist',
    !ENGINE_CODE.includes('country') && !ENGINE_CODE.includes('city'));

  console.log('\n── 3. The browser never decides who gets email ──');

  check('recipients are resolved from a segment, not an address list',
    ENGINE.includes('export async function resolveRecipients')
    && CAMPAIGNS.includes("audience.mode === 'segment'"));
  check('a campaign stores the segment description, not a frozen list',
    CAMPAIGNS.includes("| { mode: 'segment'; segment: MailSegment }"));
  check('the send path resolves recipients server-side',
    CAMPAIGNS.includes('await resolveRecipients(audience.segment)'));
  check('the preview and the send share one resolver',
    (ROUTE.match(/resolveRecipients\(/g) ?? []).length === 2);
  check('the API never takes a recipient email list from the client for broadcasts',
    !/data\.(to|recipients|emailList)/.test(ROUTE));
  check('server-side pagination exists for the user picker',
    ENGINE.includes('export async function searchRecipientUsers')
    && ENGINE.includes('pageSize') && ENGINE.includes('totalPages'));
  check('page size is capped so a client cannot request everything',
    ENGINE.includes('Math.min(Math.max(opts.pageSize ?? 25, 1), 100)'));
  check('pagination ordering is stable', ENGINE.includes('a.id.localeCompare(b.id)'));

  console.log('\n── 4. Personalisation ──');

  check('variables are extracted',
    JSON.stringify(extractVariables('Hi {{firstName}} {{lastName}}')) === '["firstName","lastName"]');
  check('a repeated variable is listed once',
    extractVariables('{{firstName}} {{firstName}}').length === 1);
  check('spacing inside the braces is tolerated',
    extractVariables('{{ firstName }}')[0] === 'firstName');
  check('an unsupported variable is reported',
    JSON.stringify(unknownVariables('Hello {{city}}')) === '["city"]');
  check('supported variables are not reported as unknown',
    unknownVariables(SUPPORTED_VARIABLES.map((v) => `{{${v}}}`).join(' ')).length === 0);
  const rendered = renderVariables('Hi {{firstName}}, {{email}}', user());
  check('variables are substituted', rendered === 'Hi Ada, a@example.com', rendered);
  check('a missing name falls back rather than rendering empty',
    renderVariables('Hi {{firstName}}', user({ name: '' })) === 'Hi there');
  /* Sending a literal "{{city}}" to thousands of people is the failure here. */
  check('an unknown variable is left intact so validation can block the send',
    renderVariables('Hi {{city}}', user()) === 'Hi {{city}}');
  check('company name resolves from the organisation field',
    renderVariables('{{companyName}}', user({ organizationName: 'Acme' })) === 'Acme');

  console.log('\n── 5. Deduplication and invalid addresses ──');

  check('duplicates are excluded, not counted as deliverable',
    ENGINE.includes('if (seen.has(u.email)) { excluded += 1; continue; }'));
  check('invalid addresses are counted separately from exclusions',
    ENGINE.includes('invalid += 1') && ENGINE.includes('excluded += 1'));
  check('address validation reuses the existing validator',
    ENGINE.includes("from '@/lib/server/security'") && ENGINE.includes('isValidEmail'));
  check('inactive users are excluded from user-store sends',
    ENGINE.includes("segment.mode !== 'manual' && !u.isActive"));
  check('a hard recipient ceiling exists', ENGINE.includes('MAX_RECIPIENTS = 25_000'));
  check('the resolution reports the full attrition breakdown',
    ENGINE.includes('selected,') && ENGINE.includes('excluded,')
    && ENGINE.includes('invalid,') && ENGINE.includes('final: emails.length'));

  console.log('\n── 6. The broadcast no longer lies ──');

  /* The regression: `await sendTrackedMail({...}).catch(() => null); sent++;`
     counted attempts, so a suspended mailbox still reported success. */
  check('the synchronous send loop is gone',
    !/for \(const user of targets\.slice\(0, 500\)\)/.test(ROUTE_CODE));
  check('the route no longer sends mail inside the request',
    !ROUTE_CODE.includes('sendTrackedMail'));
  check('the misleading `sent` field is gone from the response',
    !/success: true, sent\b/.test(ROUTE_CODE));
  check('the response reports queued, not sent', ROUTE.includes('queued: recipients.final'));
  check('the broadcast goes through the campaign system',
    ROUTE.includes('upsertMailCampaign') && ROUTE.includes("status: 'scheduled'"));
  check('it therefore inherits claim-based duplicate protection',
    CAMPAIGNS.includes('claimCampaign') && CAMPAIGNS.includes('CampaignAlreadyClaimedError'));
  check('an empty audience is refused rather than queued',
    ROUTE.includes('No deliverable recipients matched this audience.'));
  check('an invalid schedule is refused', ROUTE.includes("'Invalid schedule time.'"));
  check('the 500-recipient silent truncation is gone', !ROUTE_CODE.includes('slice(0, 500)'));
  check('the action is audited with the real counts',
    ROUTE.includes("action: 'broadcast_email_queued'") && ROUTE.includes('recipientCount: recipients.final'));

  console.log('\n── 7. Mass-mail safety in the UI ──');

  check('sending requires a recipient review step first',
    PANEL.includes('async function loadPreview()') && PANEL.includes('Review recipients'));
  check('the confirm button states the real recipient count',
    PANEL.includes('`Send to ${preview.final.toLocaleString()} recipients`'));
  check('the confirmation shows the attrition breakdown',
    PANEL.includes('Matched:') && PANEL.includes('Excluded:')
    && PANEL.includes('Invalid:') && PANEL.includes('Final:'));
  check('a second click cannot queue a second campaign',
    PANEL.includes('if (sending) return; // a second click must never queue a second campaign'));
  check('the send button is disabled while in flight',
    PANEL.includes('disabled={sending || preview.final === 0}'));
  check('sending to zero recipients is not possible',
    PANEL.includes('preview.final === 0'));
  /* The UI must not claim delivery either. */
  check('the UI says queued, not sent',
    PANEL.includes('Campaign queued for') && !PANEL.includes('`Sent to ${d.sent} recipients`'));
  check('the UI points the admin at the outbox for real results',
    PANEL.includes('check the outbox for results'));
  check('scheduling is offered and explained as server-side',
    PANEL.includes('type="datetime-local"') && PANEL.includes('browser can be closed'));

  console.log('\n── 8. Nothing existing was broken ──');

  check('the mail route is still super-admin guarded',
    ROUTE.includes('getSuperAdminSessionFromRequest')
    && ROUTE.includes("{ error: 'Unauthorized' }, { status: 401 }"));
  check('legacy audience strings still work',
    ROUTE.includes("audience === 'business'") && ROUTE.includes("audience === 'individual'")
    && ROUTE.includes("audience === 'admins'"));
  check('the legacy campaign audience modes still exist',
    CAMPAIGNS.includes("{ mode: 'all_users' }") && CAMPAIGNS.includes("{ mode: 'role'; role: string }")
    && CAMPAIGNS.includes("{ mode: 'emails'; emails: string[] }"));
  check('the shared mailer is still the only send path',
    (CAMPAIGNS.match(/await sender\(/g) ?? []).length === 1);
  check('the outbox view is unchanged', ROUTE.includes("view === 'outbox'"));
  check('no secret is referenced by the route',
    !/SMTP_PASSWORD|MONGODB_URI|CRON_SECRET|NEXTAUTH_SECRET/.test(ROUTE));
  check('the preview returns only names and addresses, not full user records',
    ROUTE.includes('sample: r.sample.map((u) => ({ name: u.name, email: u.email, accountType: u.accountType }))'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main();
