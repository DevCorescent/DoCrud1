/**
 * GET /api/super-admin/mail/outbox - the delivery log.
 *
 * Three shapes, one route:
 *   (no params)   a filtered, paginated page of the log
 *   ?id=          one attempt, with everything known about it
 *   ?format=csv   the CURRENT filter, exported
 *
 * What this route is for: answering "what actually happened to this email?".
 * Not "what did we intend to send" (that is Campaigns), not "what generates
 * this email" (System Emails), not "can the provider accept mail right now"
 * (Health). Keeping those four apart is what stops the outbox turning into a
 * second campaign manager with its own copy of everyone's data.
 *
 * It opens NO provider connection. Reading a log is not a reason to perform an
 * SMTP handshake, and an admin investigating a failure should not have to wait
 * on the very server that is failing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import {
  queryEmailOutbox, getEmailOutboxEventById, OUTBOX_MAX_PAGE_SIZE,
  type OutboxQueryFilter,
} from '@/lib/server/email-outbox';
import {
  describeOutboxSource, outboxDisplayStatus, outboxFailure, redactOutboxMetadata,
  describeRetry, OUTBOX_STATUS_LABEL,
} from '@/lib/email/outbox-view';
import { MAX_DELIVERY_ATTEMPTS } from '@/lib/server/mail-provider';
import { getMailCampaignById } from '@/lib/server/mail-campaigns';
import { getSystemEmailDefinition } from '@/lib/server/system-emails';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FAILURE_KINDS = [
  'auth', 'connection', 'tls', 'rate_limit', 'recipient', 'provider_rejected', 'unknown',
];
const EXPORT_MAX_ROWS = 5000;

/** Display statuses map onto stored ones; the UI never sends a stored name. */
const STATUS_FILTER: Record<string, string[]> = {
  accepted: ['sent', 'tested'],
  failed: ['failed'],
  processing: ['queued'],
};

function parseFilter(params: URLSearchParams): OutboxQueryFilter {
  const filter: OutboxQueryFilter = {};

  const status = params.get('status');
  if (status && status !== 'all') {
    /* Unknown values map to nothing rather than to everything: a typo must not
       silently widen the result set. */
    filter.status = STATUS_FILTER[status] ?? ['__none__'];
  }

  const source = params.get('source');
  if (source === 'campaign' || source === 'system_email'
      || source === 'test' || source === 'transactional') {
    filter.source = source;
  }

  const test = params.get('test');
  if (test === 'only') filter.test = true;
  else if (test === 'exclude') filter.test = false;

  const campaignId = params.get('campaignId');
  if (campaignId) filter.campaignId = campaignId;

  const systemEmail = params.get('systemEmail');
  if (systemEmail) filter.systemEmailType = systemEmail;

  const providerEvent = params.get('providerEvent');
  if (providerEvent === 'hard_bounce' || providerEvent === 'soft_bounce'
      || providerEvent === 'complaint') {
    filter.providerEvent = providerEvent;
  }

  const failureKind = params.get('failureKind');
  if (failureKind && FAILURE_KINDS.includes(failureKind)) filter.failureKind = failureKind;

  const providerCode = Number(params.get('providerCode'));
  if (Number.isInteger(providerCode) && providerCode > 0) filter.providerCode = providerCode;

  const search = (params.get('search') || '').trim();
  if (search) filter.search = search.slice(0, 200);

  const from = params.get('from');
  if (from) filter.from = from;
  const to = params.get('to');
  if (to) filter.to = to;

  return filter;
}

/**
 * Everything the console shows about one row.
 *
 * `pendingRetry` and the attempt count for a campaign row come from the
 * CAMPAIGN's delivery record, because that is where the retry state machine
 * lives. This route reads it; it does not keep a second copy and it does not
 * schedule anything.
 */
async function present(ev: Awaited<ReturnType<typeof getEmailOutboxEventById>>, detailed = false) {
  if (!ev) return null;
  const source = describeOutboxSource(ev);

  let delivery: {
    attempts?: number; nextRetryAt?: string | null; retryable?: boolean; status?: string;
  } | null = null;
  let campaign: { id: string; title: string; status: string } | null = null;

  if (source.campaignId) {
    const found = await getMailCampaignById(source.campaignId).catch(() => null);
    if (found) {
      campaign = { id: found.id, title: found.title, status: found.status };
      const d = (found.deliveries ?? []).find((x) => x.to === ev.to);
      if (d) {
        delivery = {
          attempts: d.attempts,
          nextRetryAt: d.nextRetryAt ?? null,
          retryable: d.nextRetryAt ? true : undefined,
          status: d.status,
        };
      }
    }
  }

  const pendingRetry = delivery?.status === 'pending' && Boolean(delivery.nextRetryAt);
  const displayStatus = outboxDisplayStatus(ev, { pendingRetry });
  const failure = outboxFailure(ev);

  const base = {
    id: ev.id,
    createdAt: ev.createdAt,
    sentAt: ev.sentAt ?? null,
    updatedAt: ev.updatedAt ?? null,
    to: ev.to,
    subject: ev.subject,
    type: ev.type,
    source: source.source,
    sourceLabel: source.label,
    isTest: source.isTest,
    campaignId: source.campaignId ?? null,
    systemEmailType: source.systemEmailType ?? null,
    status: displayStatus,
    /* The wording is decided in one place and shipped, so no client can
       relabel an accepted message as a delivered one. */
    statusLabel: OUTBOX_STATUS_LABEL[displayStatus],
    attempts: ev.attempts ?? delivery?.attempts ?? null,
    failureKind: failure?.kind ?? null,
    providerCode: failure?.code ?? null,
    retryable: failure?.retryable ?? null,
    messageId: ev.messageId ?? null,
    /* What the provider reported AFTER accepting the message. Separate from
       `status`, which records the hand-off itself. */
    providerEvent: ev.providerEvent ?? null,
    providerEventAt: ev.providerEventAt ?? null,
    providerEventCode: ev.providerEventCode ?? null,
    opens: Number(ev.tracking?.opens || 0),
    clicks: Number(ev.tracking?.clicks || 0),
  };

  if (!detailed) return base;

  const systemEmail = source.systemEmailType
    ? getSystemEmailDefinition(source.systemEmailType)
    : null;

  return {
    ...base,
    sentBy: ev.sentBy ?? null,
    failedAt: ev.failedAt ?? null,
    lastOpenedAt: ev.tracking?.lastOpenedAt ?? null,
    lastClickedAt: ev.tracking?.lastClickedAt ?? null,
    failure: failure
      ? {
          kind: failure.kind,
          code: failure.code ?? null,
          retryable: failure.retryable,
          advice: failure.advice,
          /* The provider's own words, kept verbatim for the collapsible
             section. The classifier already truncates it and never includes a
             credential. */
          raw: failure.message,
          /* Says whether this was recorded at the time or reconstructed. */
          derived: failure.derived,
        }
      : null,
    retry: failure
      ? describeRetry({
          attempts: ev.attempts ?? delivery?.attempts ?? 0,
          maxAttempts: MAX_DELIVERY_ATTEMPTS,
          retryable: failure.retryable,
          nextRetryAt: delivery?.nextRetryAt ?? null,
        })
      : null,
    campaign,
    deliveryStatus: delivery?.status ?? null,
    systemEmail: systemEmail ? { type: systemEmail.type, name: systemEmail.name } : null,
    /* Filtered on the way out, so a sender that records the wrong thing in
       future cannot leak it through this console. */
    metadata: redactOutboxMetadata(ev.metadata),
    /* The outbox does NOT store message bodies. Campaign rows can show the
       campaign's own stored content; everything else genuinely has none, and
       saying so beats rendering an empty frame. */
    content: campaign
      ? { available: true, source: 'campaign' as const, campaignId: campaign.id }
      : { available: false, source: null, campaignId: null },
  };
}

function toCsv(rows: Record<string, unknown>[]): string {
  const columns = [
    'createdAt', 'to', 'subject', 'source', 'status', 'attempts',
    'failureKind', 'providerCode', 'retryable', 'campaignId', 'isTest',
  ];
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    /* A leading =, +, - or @ is executed by spreadsheet software. Prefixing
       breaks that without altering the value a human reads. */
    const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return `"${guarded.replace(/"/g, '""')}"`;
  };
  return [
    columns.join(','),
    ...rows.map((r) => columns.map((c) => escape(r[c])).join(',')),
  ].join('\n');
}

export async function GET(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);

  /* ── One record ── */
  const id = searchParams.get('id');
  if (id) {
    const ev = await getEmailOutboxEventById(id).catch(() => null);
    if (!ev) return NextResponse.json({ error: 'Outbox record not found.' }, { status: 404 });
    return NextResponse.json({ event: await present(ev, true) });
  }

  const filter = parseFilter(searchParams);
  const direction = searchParams.get('direction') === 'asc' ? 'asc' : 'desc';

  /* ── Export ── */
  if (searchParams.get('format') === 'csv') {
    const result = await queryEmailOutbox({
      page: 1,
      limit: OUTBOX_MAX_PAGE_SIZE,
      direction,
      filter,
    });
    /* Paged through rather than read in one go, and hard-capped: an export is
       not a licence to load the entire audit trail into memory. */
    const rows: Record<string, unknown>[] = [];
    let page = 1;
    let more = result.total > 0;
    while (more && rows.length < EXPORT_MAX_ROWS) {
      const chunk = page === 1
        ? result
        : await queryEmailOutbox({ page, limit: OUTBOX_MAX_PAGE_SIZE, direction, filter });
      for (const ev of chunk.rows) {
        const presented = await present(ev);
        if (presented) rows.push(presented as Record<string, unknown>);
      }
      more = page < chunk.totalPages;
      page += 1;
    }
    return new NextResponse(toCsv(rows.slice(0, EXPORT_MAX_ROWS)), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="outbox.csv"',
      },
    });
  }

  /* ── A page of the log ── */
  const result = await queryEmailOutbox({
    page: Number(searchParams.get('page')) || 1,
    limit: Number(searchParams.get('limit')) || 25,
    direction,
    filter,
  });

  const events = [];
  for (const ev of result.rows) events.push(await present(ev));

  return NextResponse.json({
    events,
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
    backend: result.backend,
    /* Told to the UI so it can say the log may be incomplete rather than
       implying the absence of a row means the email was never attempted. */
    truncated: result.truncated,
    maxPageSize: OUTBOX_MAX_PAGE_SIZE,
  });
}
