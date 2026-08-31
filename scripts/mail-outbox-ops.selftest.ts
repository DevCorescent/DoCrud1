/**
 * Outbox operations self-test (Phase 11).
 *
 * The outbox is an audit trail, so the properties worth testing are mostly
 * about restraint: that it does not overstate what it knows, does not leak
 * what it happens to be holding, and does not grow a second way to change
 * anything.
 *
 * Three claims dominate:
 *
 *   1. The word "delivered" never appears. SMTP acceptance is the strongest
 *      evidence this application has, and the vocabulary has to say so.
 *   2. Filtering and paging happen on the SERVER, and the two storage backends
 *      agree about what a filter means - a test send counted as production on
 *      one backend and not the other would corrupt every figure downstream.
 *   3. Nothing here can send, retry, resend or delete. The retry state machine
 *      already exists in the campaign loop; a second trigger for it would be a
 *      second source of truth.
 *
 * The query half runs against the real file store with real records.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import {
  queryEmailOutbox, appendEmailOutboxEvent, getEmailOutboxEventById,
  matchesOutboxFilter, OUTBOX_MAX_PAGE_SIZE,
  type OutboundEmailEvent,
} from '@/lib/server/email-outbox';
import { buildOutboxQuery } from '@/lib/server/db/email-outbox-rows';
import {
  describeOutboxSource, outboxDisplayStatus, outboxFailure, redactOutboxMetadata,
  describeRetry, OUTBOX_STATUS_LABEL, REDACTED,
} from '@/lib/email/outbox-view';
import { MAX_DELIVERY_ATTEMPTS } from '@/lib/server/mail-provider';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

const VIEW = read('lib/email/outbox-view.ts');
const OUTBOX_LIB = read('lib/server/email-outbox.ts');
const ROWS = read('lib/server/db/email-outbox-rows.ts');
const API = read('app/api/super-admin/mail/outbox/route.ts');
const UI = read('components/superadmin/mail/MailOutbox.tsx');
const PANEL = read('components/SuperAdminPanel.tsx');
const MAILER = read('lib/server/mailer.ts');

const FILE = path.join(process.cwd(), 'data', 'email-outbox.json');
let backup: string | null = null;

const ev = (over: Partial<OutboundEmailEvent> = {}): OutboundEmailEvent => ({
  id: `t-${Math.random().toString(36).slice(2, 9)}`,
  createdAt: new Date().toISOString(),
  status: 'sent',
  type: 'system',
  to: 'someone@example.com',
  subject: 'Subject',
  tracking: { opens: 0, clicks: 0 },
  ...over,
});

async function main() {
  delete process.env.MONGODB_URI;
  if (existsSync(FILE)) backup = readFileSync(FILE, 'utf8');

  console.log('\n── 1. Acceptance is not delivery ──');

  /* The single most important property in this phase. */
  check('no display label says "delivered"',
    !Object.values(OUTBOX_STATUS_LABEL).some((v) => /deliver/i.test(v)));
  check('an accepted send is called accepted',
    OUTBOX_STATUS_LABEL.accepted === 'Accepted by provider');
  check('the API ships the label rather than letting a client choose one',
    API.includes('statusLabel: OUTBOX_STATUS_LABEL[displayStatus]'));
  /* Checked as rendered words, not as source: the files legitimately DISCUSS
     the word while forbidding it. */
  const renderedClaims = [
    /['"`][^'"`]*\bdelivered to\b/i,
    /['"`][^'"`]*\bwas delivered\b/i,
    /['"`][^'"`]*\bDelivery confirmed\b/i,
  ];
  check('no UI string claims delivery',
    !renderedClaims.some((rx) => rx.test(UI)));
  check('the UI states that acceptance is not arrival',
    /it is not\s+confirmation that it reached an inbox/.test(UI));
  check('a mapped status exists for every stored state',
    outboxDisplayStatus(ev({ status: 'sent' })) === 'accepted'
    && outboxDisplayStatus(ev({ status: 'tested' })) === 'accepted'
    && outboxDisplayStatus(ev({ status: 'queued' })) === 'processing'
    && outboxDisplayStatus(ev({ status: 'failed', error: 'x' })) === 'failed');
  /* A policy block never reached the provider; calling it a provider failure
     would send an admin to investigate a server that was never contacted. */
  check('a policy block is distinguished from a provider failure',
    outboxDisplayStatus(ev({
      status: 'failed', error: 'Mail disabled by admin policy (bulk_campaign).',
    })) === 'blocked');
  check('a pending retry is only claimed when one is scheduled',
    outboxDisplayStatus(ev({ status: 'failed', error: 'x' }), { pendingRetry: true })
      === 'pending_retry');

  console.log('\n── 2. Source derivation ──');

  check('a campaign row is attributed to its campaign',
    describeOutboxSource(ev({ metadata: { campaignId: 'cmp-1' } })).source === 'campaign');
  check('a system email row names its type',
    describeOutboxSource(ev({ metadata: { systemEmail: 'signup_otp' } })).systemEmailType
      === 'signup_otp');
  check('a transactional row falls through to transactional',
    describeOutboxSource(ev({})).source === 'transactional');
  /* Precedence matters: a test send also records a system email type, and
     counting it as one would put test traffic into production figures. */
  check('a test send is a TEST first, even when it names a system email',
    describeOutboxSource(ev({
      type: 'test', metadata: { test: 'true', systemEmail: 'signup_otp' },
    })).source === 'test');
  check('the test flag is exposed for excluding tests from statistics',
    describeOutboxSource(ev({ metadata: { test: 'true' } })).isTest === true
    && describeOutboxSource(ev({ metadata: { campaignId: 'c' } })).isTest === false);

  console.log('\n── 3. Failure classification and provenance ──');

  const recorded = outboxFailure(ev({
    status: 'failed', error: 'Invalid login: 535 suspended',
    failureKind: 'auth', providerCode: 535, retryable: false,
  }));
  check('a recorded classification is used as recorded',
    recorded?.kind === 'auth' && recorded.code === 535 && recorded.retryable === false);
  check('a recorded classification is not labelled derived', recorded?.derived === false);

  /* Rows written before this phase have no stored classification. */
  const derived = outboxFailure(ev({
    status: 'failed', error: 'Invalid login: 535 mailbox is in a suspended status',
  }));
  check('an older row is classified from its error text',
    derived?.kind === 'auth' && derived.code === 535 && derived.retryable === false);
  check('a reconstructed classification says it was derived', derived?.derived === true);
  check('the UI discloses that provenance',
    UI.includes('derived from the recorded error text'));

  const timeout = outboxFailure(ev({ status: 'failed', error: 'connect ETIMEDOUT 1.2.3.4:465' }));
  check('a connection timeout is retryable',
    timeout?.kind === 'connection' && timeout.retryable === true,
    `${timeout?.kind}/${timeout?.retryable}`);
  /* The bug this covers: the classifier's connection rules read the node error
     CODE, which does not survive into the stored message - so reconstruction
     silently downgraded every timeout to "unknown". */
  check('a network code is recovered from the stored text',
    outboxFailure(ev({ status: 'failed', error: 'connect ECONNREFUSED 1.2.3.4:465' }))?.kind
      === 'connection'
    && outboxFailure(ev({ status: 'failed', error: 'getaddrinfo ENOTFOUND smtp.x' }))?.kind
      === 'connection');
  const bad = outboxFailure(ev({ status: 'failed', error: '550 No such user here' }));
  check('a 550 recipient rejection is NOT retryable',
    bad?.kind === 'recipient' && bad.code === 550 && bad.retryable === false);
  check('an accepted row has no failure', outboxFailure(ev({ status: 'sent' })) === null);
  /* The property is that no classification DECISION is made here. The module
     recovers a network code token so the shared classifier's own branches can
     run - it never assigns a kind, a retryability or an advice string itself. */
  check('the classifier is the shared one, not a second copy',
    VIEW.includes("from '@/lib/server/mail-provider'")
    && VIEW.includes('classifyMailError(')
    /* No literal kind assignment, and no advice authored locally. */
    && !/kind: '(auth|connection|tls|rate_limit|recipient|provider_rejected|unknown)'/.test(VIEW)
    && !/advice: '/.test(VIEW)
    && !/retryable: (true|false),/.test(VIEW));
  check('the sender records the classification it already computed',
    MAILER.includes('const failure = classifyMailError(err);')
    && MAILER.includes('failureKind: failure.kind')
    && MAILER.includes('retryable: failure.retryable'));

  console.log('\n── 4. Retry wording ──');

  check('a permanent failure offers no retry',
    describeRetry({ attempts: 1, maxAttempts: 4, retryable: false }).text
      === 'Permanent — will not be retried');
  check('a permanent failure is not described as scheduled',
    describeRetry({ attempts: 1, maxAttempts: 4, retryable: false }).scheduled === false);
  check('a scheduled retry names the attempt and the time',
    describeRetry({ attempts: 1, maxAttempts: 4, retryable: true, nextRetryAt: 'T' })
      .text.includes('Attempt 1 of 4'));
  check('an exhausted budget says so',
    describeRetry({ attempts: 4, maxAttempts: 4, retryable: true })
      .text.includes('retries exhausted'));
  check('the attempt ceiling comes from the retry system, not a literal',
    API.includes('maxAttempts: MAX_DELIVERY_ATTEMPTS') && MAX_DELIVERY_ATTEMPTS > 1);
  /* Section 10: the console must not become a second way to trigger sending. */
  check('there is no retry, resend or delete control',
    !/>\s*Retry\s*</.test(UI) && !/>\s*Resend\s*</.test(UI)
    && !UI.includes('Retry all') && !UI.includes('Delete all'));
  check('the console cannot mutate anything',
    !UI.includes("method: 'POST'") && !UI.includes("method: 'DELETE'")
    && !API.includes('export async function POST')
    && !API.includes('export async function DELETE'));

  console.log('\n── 5. Secrets never leave ──');

  const redacted = redactOutboxMetadata({
    campaignId: 'cmp-1', otp: '123456', resetToken: 'abc', apiKey: 'k',
    smtpPassword: 'p', sessionId: 's', purpose: 'email_verification',
  });
  check('an OTP value is redacted', redacted.otp === REDACTED);
  check('a token is redacted', redacted.resetToken === REDACTED);
  check('an api key is redacted', redacted.apiKey === REDACTED);
  check('a password is redacted', redacted.smtpPassword === REDACTED);
  check('a session id is redacted', redacted.sessionId === REDACTED);
  check('operational keys survive',
    redacted.campaignId === 'cmp-1' && redacted.purpose === 'email_verification');
  check('the API redacts on the way out',
    API.includes('metadata: redactOutboxMetadata(ev.metadata)'));
  check('the raw metadata object is never returned unfiltered',
    !API.includes('metadata: ev.metadata'));
  check('the export carries no metadata at all',
    !API.includes("'metadata'") || !/columns = \[[^\]]*metadata/.test(API));

  console.log('\n── 6. The query runs on the server ──');

  writeFileSync(FILE, JSON.stringify({ events: [] }));

  const now = Date.now();
  const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const seed: OutboundEmailEvent[] = [
    ev({ id: 'a-accepted', status: 'sent', to: 'alice@example.com', subject: 'Welcome',
      createdAt: iso(1000), messageId: '<m1@x>', metadata: { campaignId: 'cmp-1' } }),
    ev({ id: 'b-failed-535', status: 'failed', to: 'bob@example.com', subject: 'Codes',
      createdAt: iso(2000), error: 'Invalid login: 535 suspended', failureKind: 'auth',
      providerCode: 535, retryable: false, metadata: { systemEmail: 'signup_otp' } }),
    ev({ id: 'c-failed-550', status: 'failed', to: 'carol@example.com', subject: 'Notice',
      createdAt: iso(3000), error: '550 No such user', failureKind: 'recipient',
      providerCode: 550, retryable: false, metadata: { campaignId: 'cmp-1' } }),
    ev({ id: 'd-timeout', status: 'failed', to: 'dan@example.com', subject: 'Retryable',
      createdAt: iso(4000), error: 'connect ETIMEDOUT', failureKind: 'connection',
      providerCode: undefined, retryable: true, metadata: { campaignId: 'cmp-2' } }),
    ev({ id: 'e-test', status: 'failed', type: 'test', to: 'qa@example.com',
      subject: '[TEST] Probe', createdAt: iso(5000), error: '535 suspended',
      failureKind: 'auth', providerCode: 535, retryable: false,
      metadata: { test: 'true', source: 'system', systemEmail: 'signup_otp' } }),
    ev({ id: 'f-queued', status: 'queued', to: 'erin@example.com', subject: 'Pending',
      createdAt: iso(600000) }),
    ev({ id: 'g-old', status: 'sent', to: 'frank@example.com', subject: 'Ancient',
      createdAt: new Date(now - 40 * 86400000).toISOString() }),
  ];
  for (const e of seed) await appendEmailOutboxEvent(e);

  const all = await queryEmailOutbox({ page: 1, limit: 50 });
  check('every seeded record is queryable', all.total === seed.length, String(all.total));
  check('the newest attempt is first', all.rows[0].id === 'a-accepted', all.rows[0]?.id);
  check('the file store reports which backend answered', all.backend === 'file');

  const page1 = await queryEmailOutbox({ page: 1, limit: 3 });
  const page2 = await queryEmailOutbox({ page: 2, limit: 3 });
  check('pagination returns the requested page size', page1.rows.length === 3);
  check('the total counts matches, not the page', page1.total === seed.length);
  check('page count is derived from the total',
    page1.totalPages === Math.ceil(seed.length / 3));
  check('a second page returns different records',
    page2.rows.every((r) => !page1.rows.some((x) => x.id === r.id)));
  /* A page size is a request, not an instruction. */
  check('an absurd page size is capped',
    (await queryEmailOutbox({ page: 1, limit: 10_000 })).limit === OUTBOX_MAX_PAGE_SIZE);
  check('a nonsense page number falls back to the first',
    (await queryEmailOutbox({ page: -5, limit: 10 })).page === 1);

  console.log('\n── 7. Search and filters ──');

  check('search matches a recipient',
    (await queryEmailOutbox({ filter: { search: 'carol@example.com' } })).total === 1);
  check('search matches a subject',
    (await queryEmailOutbox({ filter: { search: 'Welcome' } })).total === 1);
  check('search matches a message id',
    (await queryEmailOutbox({ filter: { search: '<m1@x>' } })).total === 1);
  check('search matches a campaign id',
    (await queryEmailOutbox({ filter: { search: 'cmp-1' } })).total === 2);
  check('search is case-insensitive',
    (await queryEmailOutbox({ filter: { search: 'WELCOME' } })).total === 1);
  /* A search term is user input reaching a regex on the Mongo path. */
  check('a regex metacharacter is treated as a literal',
    (await queryEmailOutbox({ filter: { search: '.*' } })).total === 0);

  check('status filters to accepted',
    (await queryEmailOutbox({ filter: { status: ['sent', 'tested'] } })).total === 2);
  check('status filters to failed',
    (await queryEmailOutbox({ filter: { status: ['failed'] } })).total === 4);
  check('failure kind filters',
    (await queryEmailOutbox({ filter: { failureKind: 'recipient' } })).total === 1);
  check('provider code filters',
    (await queryEmailOutbox({ filter: { providerCode: 535 } })).total === 2);
  check('campaign id filters',
    (await queryEmailOutbox({ filter: { campaignId: 'cmp-1' } })).total === 2);
  check('system email type filters',
    (await queryEmailOutbox({ filter: { systemEmailType: 'signup_otp' } })).total === 2);

  check('source filters to campaigns',
    (await queryEmailOutbox({ filter: { source: 'campaign' } })).total === 3);
  check('source filters to system emails',
    (await queryEmailOutbox({ filter: { source: 'system_email' } })).total === 1);
  check('source filters to transactional',
    (await queryEmailOutbox({ filter: { source: 'transactional' } })).total === 2);
  check('source filters to tests',
    (await queryEmailOutbox({ filter: { source: 'test' } })).total === 1);

  const testsOnly = await queryEmailOutbox({ filter: { test: true } });
  const productionOnly = await queryEmailOutbox({ filter: { test: false } });
  check('tests can be isolated', testsOnly.total === 1 && testsOnly.rows[0].id === 'e-test');
  check('production excludes every test row',
    productionOnly.total === seed.length - 1
    && !productionOnly.rows.some((r) => r.id === 'e-test'));
  /* Section 13: the two must partition the log exactly. */
  check('tests and production partition the log without overlap',
    testsOnly.total + productionOnly.total === all.total);

  const recent = await queryEmailOutbox({
    filter: { from: new Date(now - 7 * 86400000).toISOString() },
  });
  check('a date range excludes older attempts',
    recent.total === seed.length - 1 && !recent.rows.some((r) => r.id === 'g-old'));

  check('filters combine as AND, never widening each other',
    (await queryEmailOutbox({
      filter: { status: ['failed'], source: 'campaign', search: 'carol' },
    })).total === 1);
  check('a search cannot pull in a row the source filter excluded',
    (await queryEmailOutbox({ filter: { source: 'campaign', search: 'qa@example.com' } }))
      .total === 0);

  console.log('\n── 8. Both backends agree ──');

  /* The in-memory predicate and the Mongo query are two implementations of one
     intent, so the risk is that they diverge silently. */
  check('the file predicate and the Mongo query are both exported for comparison',
    typeof matchesOutboxFilter === 'function' && typeof buildOutboxQuery === 'function');
  for (const [label, filter] of [
    ['tests only', { test: true }],
    ['production only', { test: false }],
    ['campaign source', { source: 'campaign' as const }],
    ['system email source', { source: 'system_email' as const }],
    ['transactional source', { source: 'transactional' as const }],
  ] as const) {
    const q = JSON.stringify(buildOutboxQuery(filter));
    check(`${label}: the Mongo query constrains rather than widening`,
      !q.includes('"$or":[]') && q.length > 2, q.slice(0, 90));
  }
  check('production-only excludes both the flag and the row type on Mongo',
    JSON.stringify(buildOutboxQuery({ test: false })).includes('"$ne":"true"')
    && JSON.stringify(buildOutboxQuery({ test: false })).includes('"$ne":"test"'));
  check('the same test definition is used on both paths',
    matchesOutboxFilter(ev({ type: 'test' }), { test: true })
    && matchesOutboxFilter(ev({ metadata: { test: 'true' } }), { test: true })
    && !matchesOutboxFilter(ev({ type: 'test' }), { test: false }));

  console.log('\n── 9. One record ──');

  const one = await getEmailOutboxEventById('b-failed-535');
  check('a record is readable by id', one?.id === 'b-failed-535');
  check('an unknown id resolves to null, not a throw',
    (await getEmailOutboxEventById('nope')) === null);
  check('the API answers an unknown id with a 404',
    API.includes("{ error: 'Outbox record not found.' }, { status: 404 }"));

  console.log('\n── 10. API surface ──');

  check('the endpoint requires a super admin',
    API.includes('getSuperAdminSessionFromRequest')
    && API.includes("{ error: 'Unauthorized' }, { status: 401 }"));
  check('the guard runs before any query',
    API.indexOf('getSuperAdminSessionFromRequest') < API.indexOf('queryEmailOutbox('));
  /* Section 19 and 23: reading a log must not touch the provider. */
  check('loading the outbox opens no SMTP connection',
    !/\bgetMailProvider\(/.test(API) && !/\bsendTrackedMail\(/.test(API)
    && !API.includes("from '@/lib/server/mailer'")
    && !API.includes("from '@/lib/server/smtp-transport'"));
  check('the panel no longer fetches the outbox itself',
    !PANEL.includes("view=outbox") && PANEL.includes('<MailOutbox'));
  check('the UI pages on the server rather than in React',
    UI.includes("p.set('search'") && !UI.includes('.sort((a, b)'));
  /* A busy flag used to DROP a search or page click that arrived while a
     request was in flight: the button silently did nothing and the table kept
     showing the previous filter. Every request is now issued, and only the
     newest response is allowed to write state. */
  check('a click during an in-flight request is not dropped',
    !UI.includes('if (busyRef.current) return;')
    && UI.includes('requestSeq.current += 1;'));
  check('a superseded response cannot overwrite a newer one',
    UI.includes('if (seq !== requestSeq.current) return;'));
  /* Collapsing an IDENTICAL in-flight request is not the old flag: a request
     with different parameters always goes out. */
  check('an identical in-flight request is collapsed, not every click',
    UI.includes('if (inFlightUrl.current === url) return;')
    && UI.includes('const url = `/api/super-admin/mail/outbox?'));
  check('an unknown status filter matches nothing rather than everything',
    API.includes("STATUS_FILTER[status] ?? ['__none__']"));
  check('the search term is length-limited before it reaches the store',
    API.includes('search.slice(0, 200)'));
  check('the failure filter is restricted to known kinds',
    API.includes('FAILURE_KINDS.includes(failureKind)'));

  console.log('\n── 11. Export ──');

  check('the export is capped', API.includes('EXPORT_MAX_ROWS'));
  check('the export pages rather than loading everything at once',
    API.includes('while (more && rows.length < EXPORT_MAX_ROWS)'));
  check('the export carries operational fields only',
    API.includes("'createdAt', 'to', 'subject', 'source', 'status', 'attempts'"));
  check('no secret-bearing column is exported',
    !/columns = \[[^\]]*(otp|token|password|metadata)/i.test(API));
  /* A CSV cell beginning with =, + or @ is executed by spreadsheet software. */
  check('formula injection is neutralised',
    API.includes("/^[=+\\-@]/.test(s)"));
  check('quotes are escaped rather than stripped',
    API.includes(`replace(/"/g, '""')`));

  console.log('\n── 12. Relationships stay where they belong ──');

  check('retry state is read from the campaign, not copied',
    API.includes('getMailCampaignById(source.campaignId)')
    && API.includes('found.deliveries ?? []'));
  check('the outbox stores no retry schedule of its own',
    !OUTBOX_LIB.includes('nextRetryAt'));
  check('the system email definition comes from its own registry',
    API.includes('getSystemEmailDefinition(source.systemEmailType)'));
  check('following a campaign opens the EXISTING campaign screen',
    UI.includes('onOpenCampaign') && PANEL.includes("onOpenCampaign={() => setView('campaigns')}"));
  check('the console does not re-implement campaign management',
    !UI.includes('audience') && !UI.includes('Schedule') && !UI.includes('sendAt'));

  console.log('\n── 13. Content preview is safe ──');

  check('the preview reuses the Phase 10 dialog',
    UI.includes("import EmailPreviewDialog"));
  check('the console renders no email HTML itself',
    !UI.includes('dangerouslySetInnerHTML') && !UI.includes('srcDoc'));
  /* The outbox does not store bodies; saying so beats an empty frame. */
  check('an attempt with no stored content says so rather than faking one',
    API.includes('content: campaign') && /there is no\s+stored content/.test(UI));

  console.log('\n── 14. Tracking is described honestly ──');

  check('counters are labelled as recorded, not as reads',
    UI.includes('Opens recorded') && UI.includes('Clicks recorded'));
  check('under-counting is disclosed',
    UI.includes('Tracking under-counts'));
  /* Matched across a line wrap: the sentence is long enough that the source
     breaks it, and a plain substring would fail on formatting alone. */
  check('an open is not claimed to be a human reading the email',
    /not that a person read the\s+email/.test(UI));
  check('no UI text calls an open a "read"', !/\bmarked as read\b/i.test(UI));

  console.log('\n── 15. Concurrency is not regressed ──');

  writeFileSync(FILE, JSON.stringify({ events: [] }));
  await Promise.all(Array.from({ length: 10 }, (_, i) =>
    appendEmailOutboxEvent(ev({ id: `race-${i}`, subject: `Race ${i}` }))));
  const raced = await queryEmailOutbox({ page: 1, limit: 50 });
  check('ten concurrent appends all persist', raced.total === 10, String(raced.total));
  check('the append lock is still the shared helper',
    OUTBOX_LIB.includes('withStorageLock(OUTBOX_LOCK, operation)'));
  check('the query path takes no lock and cannot block writers',
    !/queryEmailOutbox[\s\S]{0,900}withOutboxLock/.test(OUTBOX_LIB));

  console.log('\n── 16. Indexes ──');

  check('the console\'s queries are indexed',
    ROWS.includes('outbox_recent') && ROWS.includes('outbox_status_recent')
    && ROWS.includes('outbox_campaign_recent'));
  check('index creation cannot fail a query',
    ROWS.includes('index creation failed; queries still work'));
  check('count and fetch use the same query',
    ROWS.includes('col.countDocuments(query as never)'));

  if (backup !== null) writeFileSync(FILE, backup);
  else if (existsSync(FILE)) unlinkSync(FILE);

  console.log(
    failures === 0
      ? `\n✅ ${checks}/${checks} checks passed`
      : `\n❌ ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  if (backup !== null) writeFileSync(FILE, backup);
  console.error(err);
  process.exit(1);
});
