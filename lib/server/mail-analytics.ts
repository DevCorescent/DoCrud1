/**
 * Mail analytics aggregation.
 *
 * This module computes NO new facts. Every number traces back to a record the
 * application already keeps, and the point of the file is to say which record:
 *
 *   attempted / accepted / failed / queued  -> email_outbox status
 *   opens / clicks                          -> email_outbox tracking counters
 *   failure kind / provider code            -> outbox stored classification,
 *                                              or derived from the stored
 *                                              provider error and LABELLED
 *   retry state                             -> campaign delivery records
 *   campaign identity and audience          -> the campaign store
 *
 * There is no analytics event stream, no counters table and no second write
 * path. Adding one would mean two systems that disagree the first time a send
 * fails halfway.
 *
 * Aggregation happens in the DATABASE where the data supports it. The one
 * exception is classifying historical failures that have no stored kind: that
 * needs the shared classifier, and reimplementing its rules as Mongo
 * aggregation operators would be exactly the second classification system §7
 * forbids. Those rows are fetched with a projection of just their error text,
 * bounded, and classified in Node.
 */
import { getDbPool, getMongoDb } from '@/lib/server/database';
import {
  emailOutboxPath, readJsonFile,
} from '@/lib/server/storage';
import {
  matchesOutboxFilter, OUTBOX_FILE_SCAN_LIMIT,
  type OutboundEmailEvent,
} from '@/lib/server/email-outbox';
import { buildOutboxQuery, type OutboxQueryFilter } from '@/lib/server/db/email-outbox-rows';
import { getMailCampaigns } from '@/lib/server/mail-campaigns';
import { MAX_DELIVERY_ATTEMPTS } from '@/lib/server/mail-provider';
import { outboxFailure, describeOutboxSource } from '@/lib/email/outbox-view';
import { zonedDayKey, zonedWeekKey } from '@/lib/email/schedule-time';
import {
  computeRates, rate, hasEnoughSample, EMPTY_COUNTS,
  type MailCounts, type MailRates,
} from '@/lib/email/mail-metrics';

const COL = 'email_outbox';

export type AnalyticsScope = 'production' | 'test' | 'all';
export type Granularity = 'day' | 'week';

export interface AnalyticsQuery {
  from: Date;
  to: Date;
  timezone: string;
  granularity: Granularity;
  scope: AnalyticsScope;
}

export interface SeriesPoint {
  bucket: string;
  attempted: number;
  accepted: number;
  failed: number;
}

export interface FailureKindStat {
  kind: string;
  count: number;
  /** Share of all failures in range. */
  share: number | null;
  retryable: number;
  permanent: number;
  /** How many of these were reconstructed rather than recorded. */
  derived: number;
}

export interface ProviderCodeStat {
  /** An SMTP reply code, or a network error token like ETIMEDOUT. */
  code: string;
  count: number;
  kind: string;
  retryable: boolean;
}

export interface CampaignStat {
  id: string;
  title: string;
  status: string;
  audienceDescription: string | null;
  sendAt: string | null;
  attempted: number;
  accepted: number;
  failed: number;
  pending: number;
  acceptanceRate: number | null;
  openRate: number | null;
  clickRate: number | null;
  /** False when the sample is too thin for the rates to mean anything. */
  rankable: boolean;
}

export interface SystemEmailStat {
  type: string;
  attempted: number;
  accepted: number;
  failed: number;
  failureRate: number | null;
  openRate: number | null;
  clickRate: number | null;
}

export interface RetryStats {
  /** Recipients awaiting another automatic attempt. */
  pendingRetries: number;
  /** Gave up: permanently failed, or the attempt budget ran out. */
  failedAfterRetries: number;
  retryExhausted: number;
  /**
   * Null, always, and deliberately: when a retry SUCCEEDS the campaign send
   * loop deletes the pending delivery record, so no evidence survives that the
   * recipient ever needed a retry. Reporting a number here would mean
   * inventing one.
   */
  succeededAfterRetry: null;
  averageAttempts: number | null;
  /** Deliveries that actually carry an attempt count. */
  attemptsRecorded: number;
  maxAttempts: number;
}

export interface AnalyticsResult {
  range: { from: string; to: string; timezone: string; granularity: Granularity };
  scope: AnalyticsScope;
  counts: MailCounts;
  rates: MailRates;
  previous: { counts: MailCounts; rates: MailRates } | null;
  series: SeriesPoint[];
  failureKinds: FailureKindStat[];
  providerCodes: ProviderCodeStat[];
  campaigns: CampaignStat[];
  systemEmails: SystemEmailStat[];
  retry: RetryStats;
  /** How many failure classifications were reconstructed, not recorded. */
  derivedClassifications: number;
  backend: 'mongo' | 'file';
  /** False when the store could not answer for the whole range. */
  complete: boolean;
  truncated: boolean;
  generatedAt: string;
}

/** The scope filter, expressed in the SAME terms the Outbox console uses. */
function scopeFilter(scope: AnalyticsScope): OutboxQueryFilter {
  if (scope === 'test') return { test: true };
  if (scope === 'production') return { test: false };
  return {};
}

/* ── Row-level accumulation ────────────────────────────────────────────────
   Shared by both backends so a figure cannot depend on which store answered. */

interface Accumulator {
  counts: MailCounts;
  series: Map<string, SeriesPoint>;
  failureKinds: Map<string, FailureKindStat>;
  providerCodes: Map<string, ProviderCodeStat>;
  campaigns: Map<string, MailCounts>;
  systemEmails: Map<string, MailCounts>;
  derived: number;
}

function newCounts(): MailCounts { return { ...EMPTY_COUNTS }; }

function newAccumulator(): Accumulator {
  return {
    counts: newCounts(),
    series: new Map(),
    failureKinds: new Map(),
    providerCodes: new Map(),
    campaigns: new Map(),
    systemEmails: new Map(),
    derived: 0,
  };
}

function bump(counts: MailCounts, ev: OutboundEmailEvent) {
  const accepted = ev.status === 'sent' || ev.status === 'tested';
  const failed = ev.status === 'failed';
  const queued = ev.status === 'queued';

  /* "Attempted" counts records the store holds, including ones still in
     flight; the acceptance and failure RATES divide by decided attempts only,
     which is where the distinction is enforced. */
  counts.attempted += 1;
  if (accepted) counts.accepted += 1;
  if (failed) counts.failed += 1;
  if (queued) counts.queued += 1;

  /* Permanence is the classifier's answer, not a guess from the status: a
     failed row says nothing on its own about whether retrying could help. */
  if (failed) {
    const failure = outboxFailure(ev);
    if (failure?.retryable) counts.retryableFailures += 1;
    else if (failure) counts.permanentFailures += 1;
  }

  const opens = Number(ev.tracking?.opens || 0);
  const clicks = Number(ev.tracking?.clicks || 0);
  counts.totalOpens += opens;
  counts.totalClicks += clicks;
  /* Only an accepted message can meaningfully have been opened, and counting
     MESSAGES rather than events is what keeps the rate at or below 100%. */
  if (accepted && opens > 0) counts.opened += 1;
  if (accepted && clicks > 0) counts.clicked += 1;
}

function accumulate(acc: Accumulator, ev: OutboundEmailEvent, q: AnalyticsQuery) {
  bump(acc.counts, ev);

  const when = new Date(ev.createdAt);
  const bucket = q.granularity === 'week'
    ? zonedWeekKey(when, q.timezone)
    : zonedDayKey(when, q.timezone);
  const point = acc.series.get(bucket)
    ?? { bucket, attempted: 0, accepted: 0, failed: 0 };
  point.attempted += 1;
  if (ev.status === 'sent' || ev.status === 'tested') point.accepted += 1;
  if (ev.status === 'failed') point.failed += 1;
  acc.series.set(bucket, point);

  if (ev.status === 'failed') {
    /* The SHARED derivation: stored classification when there is one, a
       reconstruction from the provider error otherwise, flagged either way. */
    const failure = outboxFailure(ev);
    if (failure) {
      if (failure.derived) acc.derived += 1;
      const k = acc.failureKinds.get(failure.kind)
        ?? { kind: failure.kind, count: 0, share: null, retryable: 0, permanent: 0, derived: 0 };
      k.count += 1;
      if (failure.retryable) k.retryable += 1; else k.permanent += 1;
      if (failure.derived) k.derived += 1;
      acc.failureKinds.set(failure.kind, k);

      /* Only codes that actually appear. Nothing is pre-seeded, so the table
         can never list a code this system has never seen. */
      const codeKey = failure.code !== undefined
        ? String(failure.code)
        : (/\b(ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ESOCKET|EAUTH)\b/.exec(failure.message)?.[1] ?? null);
      if (codeKey) {
        const c = acc.providerCodes.get(codeKey)
          ?? { code: codeKey, count: 0, kind: failure.kind, retryable: failure.retryable };
        c.count += 1;
        acc.providerCodes.set(codeKey, c);
      }
    }
  }

  const source = describeOutboxSource(ev);
  if (source.campaignId) {
    const c = acc.campaigns.get(source.campaignId) ?? newCounts();
    bump(c, ev);
    acc.campaigns.set(source.campaignId, c);
  }
  /* A test send may also name a system email type; it is a test first, and
     counting it here would put test traffic into transactional figures. */
  if (source.source === 'system_email' && source.systemEmailType) {
    const s = acc.systemEmails.get(source.systemEmailType) ?? newCounts();
    bump(s, ev);
    acc.systemEmails.set(source.systemEmailType, s);
  }
}

/* ── Reading rows ──────────────────────────────────────────────────────────
   Only the fields analytics needs, and never the whole collection. */

/* An inclusion projection, so anything NOT listed - the recipient address and
   the message id among them - never leaves the database for an aggregate view.
   Mongo rejects mixing inclusions with exclusions, so `to: 0` would be both an
   error and unnecessary. */
const ANALYTICS_PROJECTION = {
  _id: 0, createdAt: 1, status: 1, type: 1, error: 1,
  failureKind: 1, providerCode: 1, retryable: 1, attempts: 1,
  tracking: 1, metadata: 1,
} as const;

/** Ceiling on rows examined for one request. */
export const ANALYTICS_MAX_ROWS = 50_000;

async function readRows(
  q: AnalyticsQuery, from: Date, to: Date,
): Promise<{ rows: OutboundEmailEvent[]; backend: 'mongo' | 'file'; truncated: boolean }> {
  const filter: OutboxQueryFilter = {
    ...scopeFilter(q.scope),
    from: from.toISOString(),
    to: to.toISOString(),
  };

  if (getDbPool()) {
    const db = await getMongoDb();
    if (db) {
      const docs = await db.collection(COL)
        /* Indexed on createdAt; projected so recipient addresses and message
           bodies never leave the database for an aggregate view. */
        .find(buildOutboxQuery(filter) as never, { projection: ANALYTICS_PROJECTION as never })
        .limit(ANALYTICS_MAX_ROWS + 1)
        .toArray();
      const truncated = docs.length > ANALYTICS_MAX_ROWS;
      return {
        rows: (truncated ? docs.slice(0, ANALYTICS_MAX_ROWS) : docs) as unknown as OutboundEmailEvent[],
        backend: 'mongo',
        truncated,
      };
    }
  }

  const state = await readJsonFile<{ events: OutboundEmailEvent[] }>(
    emailOutboxPath, { events: [] }).catch(() => ({ events: [] as OutboundEmailEvent[] }));
  const events = Array.isArray(state?.events) ? state.events : [];
  return {
    rows: events.filter((ev) => matchesOutboxFilter(ev, filter)),
    backend: 'file',
    /* The local store keeps only the newest rows, so a range that reaches
       further back than the cap cannot be answered completely. */
    truncated: events.length >= OUTBOX_FILE_SCAN_LIMIT,
  };
}

/* ── Retry, from the campaign delivery records ─────────────────────────────
   The retry state machine is not touched, only read. */

async function retryStats(scope: AnalyticsScope): Promise<{
  retry: RetryStats;
  pendingByCampaign: Map<string, number>;
}> {
  const pendingByCampaign = new Map<string, number>();
  const retry: RetryStats = {
    pendingRetries: 0,
    failedAfterRetries: 0,
    retryExhausted: 0,
    succeededAfterRetry: null,
    averageAttempts: null,
    attemptsRecorded: 0,
    maxAttempts: MAX_DELIVERY_ATTEMPTS,
  };

  /* Campaigns are production sends; a test send never creates one, so the
     test-only scope has no retry data of its own to report. */
  if (scope === 'test') return { retry, pendingByCampaign };

  const campaigns = await getMailCampaigns().catch(() => []);
  let attemptSum = 0;

  for (const c of campaigns) {
    let pending = 0;
    for (const d of c.deliveries ?? []) {
      if (typeof d.attempts === 'number' && d.attempts > 0) {
        retry.attemptsRecorded += 1;
        attemptSum += d.attempts;
      }
      if (d.status === 'pending' && d.nextRetryAt) {
        retry.pendingRetries += 1;
        pending += 1;
      } else if (d.status === 'failed') {
        if ((d.attempts ?? 0) > 1) retry.failedAfterRetries += 1;
        if ((d.attempts ?? 0) >= MAX_DELIVERY_ATTEMPTS) retry.retryExhausted += 1;
      }
    }
    if (pending > 0) pendingByCampaign.set(c.id, pending);
  }

  /* An average over nothing is not zero. */
  retry.averageAttempts = retry.attemptsRecorded > 0
    ? Math.round((attemptSum / retry.attemptsRecorded) * 100) / 100
    : null;

  return { retry, pendingByCampaign };
}

/* ── The public entry point ────────────────────────────────────────────────*/

export async function computeMailAnalytics(q: AnalyticsQuery): Promise<AnalyticsResult> {
  const span = q.to.getTime() - q.from.getTime();

  const [current, previousRows, { retry, pendingByCampaign }, campaignRecords] = await Promise.all([
    readRows(q, q.from, q.to),
    /* The equivalent preceding window, for comparison. Same length, so the
       two figures are comparable rather than merely adjacent. */
    readRows(q, new Date(q.from.getTime() - span), q.from),
    retryStats(q.scope),
    getMailCampaigns().catch(() => []),
  ]);

  const acc = newAccumulator();
  for (const ev of current.rows) accumulate(acc, ev, q);

  const prevCounts = newCounts();
  for (const ev of previousRows.rows) bump(prevCounts, ev);

  const failureKinds = Array.from(acc.failureKinds.values())
    .map((k) => ({ ...k, share: rate(k.count, acc.counts.failed) }))
    .sort((a, b) => b.count - a.count);

  const providerCodes = Array.from(acc.providerCodes.values())
    .sort((a, b) => b.count - a.count);

  const byId = new Map(campaignRecords.map((c) => [c.id, c]));
  const campaigns: CampaignStat[] = Array.from(acc.campaigns.entries())
    .map(([id, counts]) => {
      const record = byId.get(id);
      const rates = computeRates(counts);
      return {
        id,
        title: record?.title ?? id,
        status: record?.status ?? 'unknown',
        audienceDescription: record?.audienceDescription ?? null,
        sendAt: record?.sendAt ?? null,
        attempted: counts.attempted,
        accepted: counts.accepted,
        failed: counts.failed,
        /* Pending comes from the campaign's delivery records, which own retry
           state - not from the outbox. */
        pending: pendingByCampaign.get(id) ?? 0,
        acceptanceRate: rates.acceptanceRate,
        openRate: rates.openRate,
        clickRate: rates.clickRate,
        /* One definition of "enough data to rank on", shared with the UI. */
        rankable: hasEnoughSample(counts.accepted),
      };
    })
    .sort((a, b) => b.attempted - a.attempted);

  const systemEmails: SystemEmailStat[] = Array.from(acc.systemEmails.entries())
    .map(([type, counts]) => {
      const rates = computeRates(counts);
      return {
        type,
        attempted: counts.attempted,
        accepted: counts.accepted,
        failed: counts.failed,
        failureRate: rates.failureRate,
        openRate: rates.openRate,
        clickRate: rates.clickRate,
      };
    })
    .sort((a, b) => b.attempted - a.attempted);

  const series = Array.from(acc.series.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));

  return {
    range: {
      from: q.from.toISOString(),
      to: q.to.toISOString(),
      timezone: q.timezone,
      granularity: q.granularity,
    },
    scope: q.scope,
    counts: acc.counts,
    rates: computeRates(acc.counts),
    /* Null rather than a fabricated baseline when the preceding window holds
       nothing to compare against. */
    previous: prevCounts.attempted > 0
      ? { counts: prevCounts, rates: computeRates(prevCounts) }
      : null,
    series,
    failureKinds,
    providerCodes,
    campaigns,
    systemEmails,
    retry,
    derivedClassifications: acc.derived,
    backend: current.backend,
    complete: !current.truncated,
    truncated: current.truncated,
    generatedAt: new Date().toISOString(),
  };
}
