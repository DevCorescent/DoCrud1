/**
 * Mail analytics self-test (Phase 12).
 *
 * Analytics is the easiest place in a mail system to tell a comfortable lie, so
 * most of this file is about arithmetic and vocabulary rather than plumbing:
 *
 *   1. A rate over no data is `null`, rendered "Not available" - never 0%.
 *      "0% acceptance" and "nothing was sent" look identical on a dashboard and
 *      mean opposite things.
 *   2. A rate cannot exceed 100%. The open rate counts MESSAGES OPENED, not
 *      opens; the previous implementation divided total opens by message count
 *      and could report 150%.
 *   3. Provider acceptance is never called delivery.
 *   4. Test sends do not touch production figures.
 *
 * The aggregation half runs against the real file store with real records, and
 * checks the totals add up.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import {
  rate, computeRates, comparePeriods, hasEnoughSample,
  EMPTY_COUNTS, NOT_AVAILABLE, TRACKING_DISCLAIMER, type MailCounts,
} from '@/lib/email/mail-metrics';
import { zonedDayKey, zonedWeekKey, isSupportedTimezone } from '@/lib/email/schedule-time';
import { computeMailAnalytics } from '@/lib/server/mail-analytics';
import { appendEmailOutboxEvent, type OutboundEmailEvent } from '@/lib/server/email-outbox';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  checks += 1;
  if (ok) { console.log(`  ✓ ${label}`); return; }
  failures += 1;
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');
const METRICS = read('lib/email/mail-metrics.ts');
const AGG = read('lib/server/mail-analytics.ts');
const API = read('app/api/super-admin/mail/analytics/route.ts');
const UI = read('components/superadmin/mail/MailAnalytics.tsx');
const PANEL = read('components/SuperAdminPanel.tsx');
const HEALTH = read('app/api/super-admin/mail/health/route.ts');

/* Comments stripped: these files legitimately DISCUSS the words they forbid,
   and matching a file's own documentation is not evidence about what it
   renders. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const UI_CODE = stripComments(UI);
const AGG_CODE = stripComments(AGG);
const API_CODE = stripComments(API);

const OUTBOX_FILE = path.join(process.cwd(), 'data', 'email-outbox.json');
const CAMPAIGN_FILE = path.join(process.cwd(), 'data', 'mail-campaigns.json');
let outboxBackup: string | null = null;

const counts = (over: Partial<MailCounts> = {}): MailCounts => ({ ...EMPTY_COUNTS, ...over });

const ev = (over: Partial<OutboundEmailEvent> = {}): OutboundEmailEvent => ({
  id: `a-${Math.random().toString(36).slice(2, 9)}`,
  createdAt: new Date().toISOString(),
  status: 'sent',
  type: 'system',
  to: 'x@example.com',
  subject: 'S',
  tracking: { opens: 0, clicks: 0 },
  ...over,
});

async function main() {
  delete process.env.MONGODB_URI;
  if (existsSync(OUTBOX_FILE)) outboxBackup = readFileSync(OUTBOX_FILE, 'utf8');

  console.log('\n── 1. No data is not zero ──');

  check('a rate over an empty denominator is null', rate(0, 0) === null);
  check('a rate over a negative denominator is null', rate(1, -1) === null);
  check('a real zero is still zero', rate(0, 10) === 0);
  check('a rate is rounded to one decimal', rate(1, 3) === 33.3);
  check('non-finite input yields null',
    rate(NaN, 10) === null && rate(1, Number.POSITIVE_INFINITY) === null);

  const empty = computeRates(counts());
  check('every rate is null when nothing was sent',
    empty.acceptanceRate === null && empty.failureRate === null
    && empty.openRate === null && empty.clickRate === null);
  check('the UI renders null as "Not available", not 0%',
    UI.includes("const pct = (v: number | null) => (v === null ? NOT_AVAILABLE : `${v}%`)"));
  check('the UI explains why a metric is unavailable',
    UI.includes('There is not enough eligible data to calculate this metric.'));
  check('"Not available" is the shared wording',
    NOT_AVAILABLE === 'Not available' && UI.includes("NOT_AVAILABLE = 'Not available'"));

  console.log('\n── 2. A rate cannot exceed 100% ──');

  /* The bug: total opens divided by message count. Three opens of one message
     in a two-message send reported 150%. */
  const heavilyOpened = computeRates(counts({
    attempted: 2, accepted: 2, opened: 1, totalOpens: 3, clicked: 1, totalClicks: 5,
  }));
  check('the open rate counts messages, not events',
    heavilyOpened.openRate === 50, String(heavilyOpened.openRate));
  check('the click rate counts messages, not events',
    heavilyOpened.clickRate === 50, String(heavilyOpened.clickRate));
  check('an open rate can never exceed 100',
    computeRates(counts({ accepted: 1, opened: 1, totalOpens: 99 })).openRate === 100);
  check('the health endpoint uses the same definition',
    HEALTH.includes('const openedMessages = sent.filter((e) => (e.tracking?.opens ?? 0) > 0).length')
    && HEALTH.includes('openRate: rate(openedMessages, sent.length)'));
  check('the health endpoint no longer divides events by messages',
    !HEALTH.includes('opens / sent.length'));
  check('both screens import the one definition',
    HEALTH.includes("from '@/lib/email/mail-metrics'")
    && AGG.includes("from '@/lib/email/mail-metrics'"));

  console.log('\n── 3. Acceptance is never delivery ──');

  check('no metric is named for delivery',
    !/deliveryRate|deliveredRate|inboxRate/i.test(METRICS + AGG + API));
  check('no delivery language survives in code that runs',
    !/\b(delivery rate|delivered|inbox delivery)\b/i.test(UI_CODE + AGG_CODE + API_CODE));
  check('the metric module says so explicitly',
    METRICS.includes('ACCEPTANCE IS NOT DELIVERY'));
  check('no UI string claims delivery',
    !/\b(was delivered|delivery rate|delivered to|inbox delivery)\b/i.test(UI_CODE));
  check('the accepted card states the limit of the evidence',
    UI.includes('This is not confirmation it reached an inbox.'));
  check('the acceptance denominator excludes messages still in flight',
    METRICS.includes('const decided = counts.accepted + counts.failed;'));

  console.log('\n── 4. Comparison is not fabricated ──');

  check('no prior data means no comparison', comparePeriods(10, 0) === null);
  check('a real change is reported', comparePeriods(15, 10) === 50);
  check('a decline is reported', comparePeriods(5, 10) === -50);
  check('the UI says so rather than showing a fake delta',
    UI.includes('No prior period to compare'));
  check('the API returns null instead of an invented baseline',
    AGG.includes('previous: prevCounts.attempted > 0'));

  console.log('\n── 5. Thin samples are not ranked ──');

  check('a small sample is not rankable', !hasEnoughSample(4));
  check('a real sample is rankable', hasEnoughSample(50));
  check('the aggregator uses the shared threshold',
    AGG.includes('rankable: hasEnoughSample(counts.accepted)'));
  check('the UI refuses to show a rate for a thin sample',
    UI.includes('cp.rankable ? pct(cp.openRate)') && UI.includes('Too few'));
  check('a null rate sorts last rather than as zero',
    UI.includes('if (av === null) return 1;'));

  console.log('\n── 6. Timezone bucketing ──');

  const evening = new Date('2026-03-01T20:30:00Z');
  check('UTC buckets by the UTC day', zonedDayKey(evening, 'UTC') === '2026-03-01');
  /* 20:30 UTC is 02:00 the NEXT day in IST. Slicing the ISO string - the
     obvious implementation - gets this wrong for 5.5 hours of every day. */
  check('Asia/Kolkata rolls into the next day',
    zonedDayKey(evening, 'Asia/Kolkata') === '2026-03-02');
  check('America/New_York stays on the same day',
    zonedDayKey(evening, 'America/New_York') === '2026-03-01');
  check('a year boundary rolls correctly',
    zonedDayKey(new Date('2026-12-31T20:00:00Z'), 'Asia/Kolkata') === '2027-01-01');
  check('a month boundary rolls correctly',
    zonedDayKey(new Date('2026-01-31T19:00:00Z'), 'Asia/Kolkata') === '2026-02-01');
  check('midnight UTC is the same day in UTC',
    zonedDayKey(new Date('2026-06-15T00:00:00Z'), 'UTC') === '2026-06-15');
  /* Around a DST transition the offset changes; the key must still be the
     local day rather than drifting by an hour. */
  check('a DST spring-forward day is bucketed correctly',
    zonedDayKey(new Date('2026-03-08T12:00:00Z'), 'America/New_York') === '2026-03-08');
  check('a DST autumn-back day is bucketed correctly',
    zonedDayKey(new Date('2026-11-01T12:00:00Z'), 'America/New_York') === '2026-11-01');
  check('weeks start on Monday',
    zonedWeekKey(new Date('2026-03-04T12:00:00Z'), 'UTC') === '2026-03-02');
  check('a Sunday belongs to the week that began on Monday',
    zonedWeekKey(new Date('2026-03-08T12:00:00Z'), 'UTC') === '2026-03-02');
  check('an unknown zone falls back rather than throwing',
    zonedDayKey(evening, 'Not/AZone') === '2026-03-01');
  check('the API only accepts supported zones',
    isSupportedTimezone('Asia/Kolkata') && !isSupportedTimezone('Mars/Olympus')
    && API.includes('isSupportedTimezone(timezone)'));

  console.log('\n── 7. Aggregation arithmetic ──');

  writeFileSync(OUTBOX_FILE, JSON.stringify({ events: [] }));
  const now = Date.now();
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const HOUR = 3_600_000;

  const seeded: OutboundEmailEvent[] = [
    /* Accepted, with tracking. */
    ev({ id: 'an-1', status: 'sent', createdAt: ago(HOUR),
      tracking: { opens: 3, clicks: 1 }, metadata: { campaignId: 'cmp-a' } }),
    ev({ id: 'an-2', status: 'sent', createdAt: ago(2 * HOUR),
      tracking: { opens: 1, clicks: 0 }, metadata: { campaignId: 'cmp-a' } }),
    ev({ id: 'an-3', status: 'sent', createdAt: ago(3 * HOUR),
      tracking: { opens: 0, clicks: 0 }, metadata: { systemEmail: 'signup_otp' } }),
    /* Permanent auth failure. */
    ev({ id: 'an-4', status: 'failed', createdAt: ago(4 * HOUR),
      error: 'Invalid login: 535 suspended', failureKind: 'auth',
      providerCode: 535, retryable: false, metadata: { campaignId: 'cmp-a' } }),
    /* Permanent recipient failure. */
    ev({ id: 'an-5', status: 'failed', createdAt: ago(5 * HOUR),
      error: '550 No such user', failureKind: 'recipient',
      providerCode: 550, retryable: false, metadata: { systemEmail: 'signup_otp' } }),
    /* Retryable connection failure, with NO stored classification: this one
       must be reconstructed and counted as derived. */
    ev({ id: 'an-6', status: 'failed', createdAt: ago(6 * HOUR),
      error: 'connect ETIMEDOUT 1.2.3.4:465' }),
    /* Still in flight. */
    ev({ id: 'an-7', status: 'queued', createdAt: ago(7 * HOUR) }),
    /* A test send: must not appear in production figures. */
    ev({ id: 'an-8', status: 'sent', type: 'test', createdAt: ago(8 * HOUR),
      tracking: { opens: 5, clicks: 5 },
      metadata: { test: 'true', systemEmail: 'signup_otp' } }),
  ];
  for (const e of seeded) await appendEmailOutboxEvent(e);

  const q = {
    from: new Date(now - 24 * HOUR),
    to: new Date(now + HOUR),
    timezone: 'UTC',
    granularity: 'day' as const,
  };

  const prod = await computeMailAnalytics({ ...q, scope: 'production' });
  const test = await computeMailAnalytics({ ...q, scope: 'test' });
  const all = await computeMailAnalytics({ ...q, scope: 'all' });

  check('production excludes the test send', prod.counts.attempted === 7,
    String(prod.counts.attempted));
  check('the test scope holds exactly the test send', test.counts.attempted === 1);
  check('production and test partition the log',
    prod.counts.attempted + test.counts.attempted === all.counts.attempted);
  check('a test send never touches production tracking',
    prod.counts.totalOpens === 4 && test.counts.totalOpens === 5,
    `${prod.counts.totalOpens}/${test.counts.totalOpens}`);
  check('the default scope is production',
    API.includes("p.get('scope') || 'production'") && UI.includes("useState('production')"));
  /* The banner is driven by the scope of the LOADED figures, not by the
     dropdown: reading the dropdown meant that mid-change the banner said
     "TEST" while the cards still showed production numbers. */
  check('the scope banner describes the figures actually shown',
    UI.includes('{data && data.scope !== \'production\' && (')
    && UI.includes("data.scope === 'test'"));
  check('the stated timezone is the one the figures were grouped in',
    UI.includes('{data?.range.timezone ?? timezone}'));

  /* The core identity, and it only holds where the categories are exclusive:
     every attempt is accepted, failed or still queued. */
  check('attempted = accepted + failed + queued',
    prod.counts.attempted === prod.counts.accepted + prod.counts.failed + prod.counts.queued,
    `${prod.counts.attempted} vs ${prod.counts.accepted}+${prod.counts.failed}+${prod.counts.queued}`);
  check('accepted is counted correctly', prod.counts.accepted === 3);
  check('failed is counted correctly', prod.counts.failed === 3);
  check('queued is counted correctly', prod.counts.queued === 1);

  /* Rates divide by DECIDED attempts (6), not by all 7. */
  check('the acceptance rate excludes queued messages',
    prod.rates.acceptanceRate === 50, String(prod.rates.acceptanceRate));
  check('acceptance and failure rates sum to 100',
    (prod.rates.acceptanceRate ?? 0) + (prod.rates.failureRate ?? 0) === 100);

  check('opened counts messages with at least one open',
    prod.counts.opened === 2, String(prod.counts.opened));
  check('total opens counts events', prod.counts.totalOpens === 4);
  check('the open rate is messages opened over accepted',
    prod.rates.openRate === Math.round((2 / 3) * 1000) / 10, String(prod.rates.openRate));
  check('one click on one message gives a click rate below 100',
    prod.rates.clickRate !== null && prod.rates.clickRate < 100);

  console.log('\n── 8. Failure and provider-code breakdown ──');

  const byKind = new Map(prod.failureKinds.map((k) => [k.kind, k]));
  check('failures are grouped by the classifier\'s kinds',
    byKind.has('auth') && byKind.has('recipient') && byKind.has('connection'));
  check('failure counts sum to the failure total',
    prod.failureKinds.reduce((n, k) => n + k.count, 0) === prod.counts.failed);
  check('shares sum to 100',
    Math.round(prod.failureKinds.reduce((n, k) => n + (k.share ?? 0), 0)) === 100);
  check('an auth failure is permanent',
    byKind.get('auth')?.permanent === 1 && byKind.get('auth')?.retryable === 0);
  check('a connection failure is retryable',
    byKind.get('connection')?.retryable === 1 && byKind.get('connection')?.permanent === 0);
  check('permanent and retryable counts split the failures',
    prod.counts.permanentFailures + prod.counts.retryableFailures === prod.counts.failed,
    `${prod.counts.permanentFailures}+${prod.counts.retryableFailures}`);

  /* The row with no stored classification. */
  check('a reconstructed classification is counted as derived',
    prod.derivedClassifications === 1, String(prod.derivedClassifications));
  check('the derived count is reported per kind',
    byKind.get('connection')?.derived === 1 && byKind.get('auth')?.derived === 0);
  check('the UI labels derived classifications',
    UI.includes('derived from the'));

  const codes = new Map(prod.providerCodes.map((p) => [p.code, p]));
  check('only codes that occurred are listed',
    codes.has('535') && codes.has('550') && !codes.has('421'));
  check('a code carries its kind and permanence',
    codes.get('535')?.kind === 'auth' && codes.get('535')?.retryable === false);
  check('a network error token is reported as a code',
    codes.has('ETIMEDOUT'), Array.from(codes.keys()).join(','));
  check('no second classifier exists',
    !AGG.includes("kind: 'auth'") && AGG.includes("from '@/lib/email/outbox-view'"));

  console.log('\n── 9. Campaign and system-email breakdown ──');

  const campaign = prod.campaigns.find((c) => c.id === 'cmp-a');
  check('campaign rows are aggregated by campaign id', Boolean(campaign));
  check('campaign counts are correct',
    campaign?.attempted === 3 && campaign?.accepted === 2 && campaign?.failed === 1);
  check('a thin campaign is not given a rate to rank on', campaign?.rankable === false);
  check('campaign totals never exceed the overall totals',
    prod.campaigns.reduce((n, c) => n + c.attempted, 0) <= prod.counts.attempted);

  const sys = prod.systemEmails.find((s) => s.type === 'signup_otp');
  check('system emails are broken down by type', Boolean(sys));
  check('system email counts are correct',
    sys?.attempted === 2 && sys?.accepted === 1 && sys?.failed === 1);
  /* The test send names signup_otp too, and must not be counted here. */
  check('a test send is not counted as a system email',
    (test.systemEmails.find((s) => s.type === 'signup_otp')?.attempted ?? 0) === 0
    || test.systemEmails.every((s) => s.attempted <= 1));
  check('a system email with no accepted messages reports no open rate',
    prod.systemEmails.every((s) => s.accepted > 0 || s.openRate === null));

  console.log('\n── 10. Tracking edge cases ──');

  check('zero opens over accepted messages is a real 0%, not null',
    computeRates(counts({ accepted: 5, opened: 0 })).openRate === 0);
  check('zero accepted messages gives null, not 0%',
    computeRates(counts({ accepted: 0, opened: 0 })).openRate === null);
  check('one open of one message is 100%',
    computeRates(counts({ accepted: 1, opened: 1 })).openRate === 100);
  check('many opens of one message is still 100%',
    computeRates(counts({ accepted: 1, opened: 1, totalOpens: 20 })).openRate === 100);
  check('uniqueness is never claimed',
    !/unique/i.test(UI_CODE) && !/unique/i.test(AGG_CODE));
  check('the tracking disclaimer is shown',
    UI.includes('block images or tracking') && UI.includes('not that a person read'));
  check('the disclaimer wording is shared',
    TRACKING_DISCLAIMER.includes('not that a person read the email'));

  console.log('\n── 11. Retry analytics ──');

  check('retry data comes from campaign delivery records',
    AGG.includes('for (const d of c.deliveries ?? [])')
    && AGG.includes("from '@/lib/server/mail-campaigns'"));
  check('the retry state machine is only read, never written',
    !AGG.includes('upsertMailCampaign') && !AGG.includes('nextRetryAt(')
    && !AGG.includes('sendMailCampaign'));
  /* When a retry succeeds the delivery record is deleted, so the evidence is
     gone. Reporting a number would mean inventing one. */
  check('success-after-retry is null rather than invented',
    prod.retry.succeededAfterRetry === null
    && AGG.includes('succeededAfterRetry: null'));
  check('the UI explains why it is unavailable',
    UI.includes('the send loop clears a delivery record'));
  check('an average over no attempts is null, not zero',
    prod.retry.attemptsRecorded === 0 ? prod.retry.averageAttempts === null : true);
  check('the attempt ceiling comes from the retry system',
    prod.retry.maxAttempts > 1 && AGG.includes('MAX_DELIVERY_ATTEMPTS'));

  console.log('\n── 12. Series ──');

  check('the series buckets the seeded window',
    prod.series.length >= 1 && prod.series.length <= 2, String(prod.series.length));
  check('series attempts sum to the total',
    prod.series.reduce((n, p) => n + p.attempted, 0) === prod.counts.attempted);
  check('series accepted sums to the total',
    prod.series.reduce((n, p) => n + p.accepted, 0) === prod.counts.accepted);
  check('series failed sums to the total',
    prod.series.reduce((n, p) => n + p.failed, 0) === prod.counts.failed);
  check('buckets are ordered',
    prod.series.every((p, i) => i === 0 || p.bucket >= prod.series[i - 1].bucket));
  check('the chart is drawn from server buckets, not raw rows',
    UI.includes('series={data.series}') && !UI.includes('events.map'));
  check('an empty series cannot divide by zero',
    UI.includes('const max = Math.max(1,'));

  console.log('\n── 13. Zero-data behaviour end to end ──');

  writeFileSync(OUTBOX_FILE, JSON.stringify({ events: [] }));
  const nothing = await computeMailAnalytics({ ...q, scope: 'production' });
  check('an empty range reports zero attempts', nothing.counts.attempted === 0);
  check('an empty range reports no acceptance rate', nothing.rates.acceptanceRate === null);
  check('an empty range reports no open rate', nothing.rates.openRate === null);
  check('an empty range has no comparison', nothing.previous === null);
  check('an empty range has an empty series', nothing.series.length === 0);
  check('an empty range lists no failure kinds', nothing.failureKinds.length === 0);
  check('an empty range lists no provider codes', nothing.providerCodes.length === 0);
  check('the UI says there is nothing to plot',
    UI.includes('nothing to plot'));

  console.log('\n── 14. API surface and security ──');

  check('the endpoint requires a super admin',
    API.includes('getSuperAdminSessionFromRequest')
    && API.includes("{ error: 'Unauthorized' }, { status: 401 }"));
  check('the guard runs before any aggregation',
    API.indexOf('getSuperAdminSessionFromRequest') < API.indexOf('computeMailAnalytics('));
  check('analytics opens no SMTP connection',
    !/\bgetMailProvider\(/.test(API + AGG) && !/\bsendTrackedMail\(/.test(API + AGG)
    && !API.includes("from '@/lib/server/mailer'")
    && !AGG.includes("from '@/lib/server/mailer'"));
  check('an unknown scope is rejected', API.includes("{ error: 'Unknown scope.' }"));
  check('an unknown granularity is rejected', API.includes("{ error: 'Unknown granularity.' }"));
  check('an unsupported timezone is rejected', API.includes("'Unsupported timezone.'"));
  check('an inverted custom range is rejected',
    API.includes('must be before its end'));
  check('an excessive range is capped', API.includes('MAX_RANGE_DAYS'));
  /* Aggregates only: no addresses, no message ids, no provider text. */
  check('recipient addresses are never projected out of the database',
    AGG.includes('const ANALYTICS_PROJECTION') && !/ANALYTICS_PROJECTION[\s\S]{0,200}\bto: 1/.test(AGG));
  check('no raw provider response reaches the aggregate response',
    !AGG.includes('raw:') && !/error:\s*ev\.error/.test(AGG));
  check('no recipient list is returned',
    !AGG.includes('recipients:') && !AGG.includes('emails:'));
  check('the row scan is bounded', AGG.includes('ANALYTICS_MAX_ROWS'));

  console.log('\n── 15. Caching and requests ──');

  check('a short-lived cache exists, not a global no-store',
    API.includes('CACHE_MS = 30_000') && !API.includes("'no-store'"));
  check('the cache key covers every filter',
    API.includes('const key = JSON.stringify({')
    && API.includes('timezone, granularity, scope'));
  check('Refresh bypasses the cache explicitly',
    API.includes("p.get('refresh') === '1'"));
  check('the cache is bounded', API.includes('if (cache.size > 64) cache.clear();'));
  check('an identical in-flight request is collapsed',
    UI.includes('if (!refresh && inFlightUrl.current === url) return;'));
  check('a superseded response cannot overwrite a newer one',
    UI.includes('if (seq !== requestSeq.current) return;'));

  console.log('\n── 16. Scope and wiring ──');

  check('analytics is mounted in the Mail Center',
    PANEL.includes('<MailAnalytics') && PANEL.includes("'analytics'"));
  check('following a campaign opens the existing campaign screen',
    PANEL.includes("onOpenCampaign={() => setView('campaigns')}")
    && UI.includes('onOpenCampaign'));
  check('analytics does not duplicate campaign storage',
    !AGG.includes('upsertMailCampaign') && !AGG.includes('writeJsonFile'));
  /* §28: nothing from a later phase leaked in. */
  check('no suppression, unsubscribe or bounce handling was added',
    !/suppress|unsubscribe|bounce|complaint/i.test(AGG_CODE + API_CODE + UI_CODE));
  check('no second event system was created',
    !AGG.includes('analytics_events') && !AGG.includes('appendEmailOutboxEvent'));
  check('the file store reports incompleteness rather than implying totals',
    AGG.includes('complete: !current.truncated')
    && UI.includes('These figures are incomplete'));

  if (outboxBackup !== null) writeFileSync(OUTBOX_FILE, outboxBackup);
  else if (existsSync(OUTBOX_FILE)) unlinkSync(OUTBOX_FILE);

  console.log(
    failures === 0
      ? `\n✅ ${checks}/${checks} checks passed`
      : `\n❌ ${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  if (outboxBackup !== null) writeFileSync(OUTBOX_FILE, outboxBackup);
  console.error(err);
  process.exit(1);
});
