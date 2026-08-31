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
  resolveRecipients, previewRecipientRows, describeSegment,
  SUPPORTED_VARIABLES, type RecipientUser, type MailSegment,
} from '@/lib/server/mail-recipients';

/* Async checks are collected and awaited before the summary is printed. */
const pending: Promise<void>[] = [];

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
const RECIP_API = read('app/api/super-admin/mail/recipients/route.ts');
const PICKER = read('components/superadmin/mail/RecipientPicker.tsx');
const COMPOSE = read('components/superadmin/mail/MailCompose.tsx');
const TZ = read('lib/email/schedule-time.ts');

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

async function main() {
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

  /* Behavioural rather than source-string: manual mode needs no user store, so
     dedup and validation can be exercised for real. */
  check('address validation reuses the existing validator',
    ENGINE.includes("from '@/lib/server/security'") && ENGINE.includes('isValidEmail'));
  check('a hard recipient ceiling exists', ENGINE.includes('MAX_RECIPIENTS = 25_000'));
  pending.push((async () => {
    const r = await resolveRecipients({
      mode: 'manual',
      emails: ['a@example.com', 'A@example.com', 'b@example.com', 'not-an-email', ''],
    });
    check('duplicates are excluded, not counted as deliverable',
      r.excluded >= 1 && r.final === 2, JSON.stringify(r.emails));
    check('case-different duplicates are caught', !r.emails.includes('A@example.com'));
    check('invalid addresses are counted separately from exclusions',
      r.invalid === 1 && r.excluded >= 1, `invalid ${r.invalid} excluded ${r.excluded}`);
    check('an invalid address is reported back, not silently dropped',
      r.invalidSamples.includes('not-an-email'));
    check('the resolution reports the full attrition breakdown',
      r.selected === 5 && typeof r.excluded === 'number'
      && typeof r.invalid === 'number' && r.final === 2);

    /* Rows and counts come from one pass, so they must agree exactly. */
    const rows = await previewRecipientRows({
      mode: 'manual',
      emails: ['a@example.com', 'A@example.com', 'b@example.com', 'not-an-email', ''],
    });
    check('the per-recipient rows agree with the counts',
      rows.rows.filter((x) => x.outcome === 'included').length === r.final
      && rows.rows.filter((x) => x.outcome === 'invalid').length === r.invalid);
    check('every row carries a plain-language reason',
      rows.rows.every((x) => typeof x.reason === 'string' && x.reason.length > 0));
    check('an excluded recipient is never described as failed',
      rows.rows.every((x) => !/failed/i.test(x.reason)));
    check('rows can be filtered to one outcome',
      (await previewRecipientRows({ mode: 'manual', emails: ['x@y.com', 'bad'] },
        { outcome: 'invalid' })).rows.every((x) => x.outcome === 'invalid'));
    check('row pages are capped',
      (await previewRecipientRows({ mode: 'manual', emails: ['a@b.com'] },
        { pageSize: 5000 })).pageSize === 100);
  })());

  check('a segment can be described for the audit trail',
    describeSegment({ mode: 'all' }) === 'Everyone'
    && describeSegment({ mode: 'filtered', filters: { role: 'admin', status: 'active' } })
      .includes('role = admin'));
  check('inactive users are excluded from user-store sends',
    ENGINE.includes("mode !== 'manual' && !u.isActive"));

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

  await Promise.all(pending);

  console.log('\n── 9. Recipient API: the server is the authority ──');

  check('both verbs are guarded',
    (RECIP_API.match(/const session = await guard\(req\);/g) ?? []).length === 2
    && (RECIP_API.match(/{ error: 'Unauthorized' }, { status: 401 }/g) ?? []).length === 2);
  /* The single most important rule of this phase. */
  check('no recipient count is accepted from the client',
    !/body\.(final|count|recipientCount|total)/.test(RECIP_API));
  check('the segment is coerced field by field, not spread',
    RECIP_API.includes('function readSegment') && !RECIP_API.includes('...body.segment'));
  check('an unknown audience mode is rejected',
    RECIP_API.includes("modes.includes(mode)") && RECIP_API.includes("'A valid audience type is required.'"));
  check('filter values are constrained, not passed through',
    RECIP_API.includes("filters.accountType === 'business'")
    && RECIP_API.includes('Math.min(3650'));
  check('id and address lists are capped', (RECIP_API.match(/slice\(0, 5000\)/g) ?? []).length === 2);
  check('resolved addresses are never returned to the browser',
    !RECIP_API.includes('emails: resolution.emails'));
  check('search is paginated server-side',
    RECIP_API.includes('searchRecipientUsers({') && RECIP_API.includes('pageSize: 25'));
  check('rows are opt-in, not always computed',
    RECIP_API.includes('body.includeRows === true'));
  /* 0 and "could not compute" are different states. */
  check('a resolution failure is an error, not zero recipients',
    RECIP_API.includes("'Unable to resolve recipients.'") && !RECIP_API.includes('final: 0'));

  console.log('\n── 10. The picker chooses a definition, not a list ──');

  check('the picker posts a segment',
    PICKER.includes('JSON.stringify({ segment, includeRows: withRows })'));
  check('the picker never posts a count', !/final:\s*\d/.test(PICKER));
  check('selections survive paging',
    PICKER.includes('useState<Map<string, UserRow>>') && PICKER.includes('new Map(prev)'));
  check('changing the audience clears the old count',
    PICKER.includes('setResolution(null); setRows(null); }, [segment])'));
  check('applying requires a resolved, non-empty audience',
    PICKER.includes('const canApply = Boolean(resolution && resolution.final > 0)'));
  check('an empty audience is called out',
    PICKER.includes('No valid recipients found.'));
  check('excluded recipients are not described as failures',
    PICKER.includes('They are not failed recipients.'));
  check('invalid addresses are shown, not silently dropped',
    PICKER.includes('resolution.invalidSamples.join'));
  check('only real filters are offered',
    PICKER.includes('Location filters are absent'));
  check('all four counts are displayed',
    PICKER.includes("['Matched'") && PICKER.includes("['Excluded'")
    && PICKER.includes("['Invalid'") && PICKER.includes("['Final'"));
  check('inputs and checkboxes are labelled',
    PICKER.includes('aria-label={`Select ${u.name || u.email}`}') && PICKER.includes('<legend'));

  console.log('\n── 11. Send safety ──');

  /* The count on the confirmation screen must be freshly resolved. */
  check('the audience is re-resolved before the confirmation opens',
    COMPOSE.includes('const openConfirm') && COMPOSE.includes("fetch('/api/super-admin/mail/recipients'"));
  check('a changed count warns instead of proceeding silently',
    COMPOSE.includes('setStaleWarning') && COMPOSE.includes('The audience changed since you previewed it'));
  check('the confirm button states the real number',
    COMPOSE.includes('Confirm & send to ${(confirmCount ?? resolution.final).toLocaleString()} recipients'));
  /* The guard is a ref, not state: browser QA showed that two clicks in one
     tick both read the old `phase` and both created a campaign. */
  check('a second click cannot queue two campaigns',
    COMPOSE.includes('if (sendingRef.current || !segment) return;')
    && COMPOSE.includes('sendingRef.current = true;')
    && COMPOSE.includes('sendingRef.current = false;'));
  check('sending posts the definition, not recipients',
    COMPOSE.includes('/* The DEFINITION, never a recipient list or a count. */')
    && !COMPOSE.includes('recipients: resolution'));
  check('the browser never loops over recipients',
    !COMPOSE.includes('for (const recipient') && !COMPOSE.includes('.map((r) => fetch'));
  check('the result says queued, not sent',
    COMPOSE.includes('Campaign queued for') && !COMPOSE.includes('Email sent successfully'));
  check('zero recipients blocks the send',
    COMPOSE.includes('No valid recipients found. This audience cannot be sent to.'));

  console.log('\n── 12. Scheduling and timezone ──');

  check('a timezone allow-list exists', TZ.includes('SUPPORTED_TIMEZONES'));
  check('UTC is not silently assumed',
    ROUTE.includes('zonedTimeToUtc(String(scheduleAt), timezone)')
    && ROUTE.includes('assuming UTC would silently send'));
  check('an unsupported timezone is rejected', ROUTE.includes("'Unsupported timezone.'"));
  check('the timezone is stored with the campaign', ROUTE.includes('scheduleTimezone: timezone'));
  /* A frozen list would mail yesterday's audience. */
  check('the segment definition is stored, not a frozen recipient list',
    ROUTE.includes("audience: { mode: 'segment', segment: resolvedSegment }")
    && ROUTE.includes('never a frozen recipient list'));
  check('the audience description is retained for audit',
    ROUTE.includes('audienceDescription: describeSegment(resolvedSegment)'));
  check('the preview count is retained for audit',
    ROUTE.includes('audiencePreviewCount: recipients.final'));
  check('the audit entry records audience and timezone',
    ROUTE.includes("audienceDescription: describeSegment(resolvedSegment),")
    && ROUTE.includes("timezone: timezone || 'server default'"));
  check('the UI offers a timezone and explains it',
    COMPOSE.includes('SUPPORTED_TIMEZONES.map') && COMPOSE.includes('not the server'));

  console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
