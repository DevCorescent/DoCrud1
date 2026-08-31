/**
 * Super Admin campaign list, detail, cancel and duplicate.
 *
 * The existing /api/admin/mail/campaigns routes are guarded by the NextAuth
 * `role === 'admin'` session; the Mail Center runs on the Super Admin session.
 * Rather than loosen either guard, this exposes the same campaign functions
 * behind the guard this panel actually uses. No campaign logic is reimplemented
 * here — everything delegates to lib/server/mail-campaigns.ts.
 *
 * GET             paginated list, with search and status filter
 * GET ?id=        one campaign, with per-recipient delivery records
 * POST cancel     stop a scheduled campaign before it starts
 * POST duplicate  copy a campaign into a new scheduled-but-not-due draft
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import {
  getMailCampaigns, getMailCampaignById, upsertMailCampaign, createCampaignId,
  type MailCampaign, type MailCampaignStatus,
} from '@/lib/server/mail-campaigns';
import { getEmailOutbox } from '@/lib/server/email-outbox';
import { classifyMailError } from '@/lib/server/mail-provider';

import {
  validateRecurrence, nextOccurrence, describeRecurrence, type MailRecurrence,
} from '@/lib/email/recurrence';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

async function guard(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  return session.valid ? session : null;
}

/** Only the fields the list needs — never the body or the delivery records. */
function toListRow(c: MailCampaign) {
  return {
    id: c.id,
    title: c.title,
    subject: c.subject,
    status: c.status,
    audienceDescription: c.audienceDescription ?? null,
    audiencePreviewCount: c.audiencePreviewCount ?? null,
    sendAt: c.sendAt ?? null,
    scheduleTimezone: c.scheduleTimezone ?? null,
    createdAt: c.createdAt,
    createdBy: c.createdBy ?? null,
    updatedAt: c.updatedAt,
    total: c.progress?.total ?? null,
    sent: c.progress?.sent ?? null,
    failed: c.progress?.failed ?? null,
    pendingRetry: (c.deliveries ?? []).filter((d) => d.status === 'pending').length,
    /* One-time or recurring, and the state of the schedule. */
    isRecurring: Boolean(c.recurrence),
    recurrenceStatus: c.recurrenceState?.status ?? null,
    recurrenceSummary: c.recurrence ? describeRecurrence(c.recurrence) : null,
    nextRunAt: c.recurrenceState?.nextRunAt ?? null,
    lastRunAt: c.recurrenceState?.lastRunAt ?? null,
  };
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const id = params.get('id');

  try {
    if (id) {
      const campaign = await getMailCampaignById(id);
      if (!campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

      const deliveries = (campaign.deliveries ?? []).map((d) => {
        /* Reuse the one classifier so the detail page and the send loop
           describe a failure identically. */
        const f = d.error ? classifyMailError({ message: d.error, responseCode: d.providerCode }) : null;
        return {
          to: d.to,
          attempts: d.attempts,
          status: d.status,
          failureKind: d.failureKind ?? f?.kind ?? null,
          providerCode: d.providerCode ?? f?.code ?? null,
          error: d.error ?? null,
          retryable: f ? f.retryable : null,
          advice: f?.advice ?? null,
          lastAttemptAt: d.lastAttemptAt ?? null,
          nextRetryAt: d.nextRetryAt ?? null,
          /* Reported by the provider AFTER acceptance. Kept apart from
             `failureKind`, which describes a send that never got through. */
          providerEvent: d.providerEvent ?? null,
        };
      });

      /* Counted separately from failures, because they are a different thing:
         the provider took these messages and reported the problem later. */
      const providerEvents = {
        hardBounce: deliveries.filter((d) => d.providerEvent === 'hard_bounce').length,
        softBounce: deliveries.filter((d) => d.providerEvent === 'soft_bounce').length,
        complaint: deliveries.filter((d) => d.providerEvent === 'complaint').length,
        suppressed: campaign.progress?.suppressed ?? 0,
      };

      /* Outbox rows for this campaign, so "accepted" is evidenced rather than
         asserted. Capped — the campaign detail is not a log viewer. */
      const outbox = (await getEmailOutbox(500).catch(() => []))
        .filter((e) => e.metadata?.campaignId === id)
        .slice(0, 100)
        .map((e) => ({
          to: e.to, status: e.status, createdAt: e.createdAt,
          sentAt: e.sentAt ?? null, error: e.error ?? null,
        }));

      return NextResponse.json({
        campaign: {
          ...toListRow(campaign),
          html: campaign.html ?? null,
          text: campaign.text ?? null,
          lastError: campaign.lastError ?? null,
          passes: campaign.passes ?? 0,
          audience: campaign.audience,
          startedAt: campaign.progress?.startedAt ?? null,
          finishedAt: campaign.progress?.finishedAt ?? null,
          recurrence: campaign.recurrence ?? null,
          /* Occurrence history is metadata; the deliveries behind each run
             stay in the outbox, which is still the only delivery log. */
          occurrences: campaign.recurrenceState?.occurrences ?? [],
        },
        deliveries,
        providerEvents,
        outbox,
      });
    }

    const all = await getMailCampaigns();
    const search = (params.get('q') ?? '').trim().toLowerCase();
    const status = params.get('status') ?? '';
    const page = Math.max(1, Number(params.get('page')) || 1);

    let rows = all;
    if (status) rows = rows.filter((c) => c.status === status);
    if (search) {
      rows = rows.filter((c) =>
        c.title.toLowerCase().includes(search)
        || c.subject.toLowerCase().includes(search)
        || c.id.toLowerCase().includes(search));
    }

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const start = (page - 1) * PAGE_SIZE;

    return NextResponse.json({
      campaigns: rows.slice(start, start + PAGE_SIZE).map(toListRow),
      total, page, totalPages,
      counts: {
        scheduled: all.filter((c) => c.status === 'scheduled').length,
        sending: all.filter((c) => c.status === 'sending').length,
        sent: all.filter((c) => c.status === 'sent').length,
        partially_failed: all.filter((c) => c.status === 'partially_failed').length,
        failed: all.filter((c) => c.status === 'failed').length,
        cancelled: all.filter((c) => c.status === 'cancelled').length,
      },
    });
  } catch (error) {
    console.error('[super-admin/mail/campaigns GET]', error);
    return NextResponse.json({ error: 'Unable to load campaigns.' }, { status: 500 });
  }
}

/** States a campaign can still be stopped from. */
const CANCELLABLE: MailCampaignStatus[] = ['draft', 'scheduled'];

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }

  const id = String(body.id ?? '');
  const action = String(body.action ?? '');
  if (!id) return NextResponse.json({ error: 'A campaign id is required.' }, { status: 400 });

  const campaign = await getMailCampaignById(id);
  if (!campaign) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });

  try {
    /* ── Recurrence controls ────────────────────────────────────────────
       PAUSE keeps the definition and its history but stops future
       occurrences. RESUME recomputes the next run from NOW, so a campaign
       paused for a month does not fire for every occurrence it missed. CANCEL
       is permanent; the history stays visible and cron never picks it up. */
    if (action === 'pause_recurrence' || action === 'resume_recurrence'
        || action === 'cancel_recurrence') {
      if (!campaign.recurrence || !campaign.recurrenceState) {
        return NextResponse.json({ error: 'This campaign does not repeat.' }, { status: 400 });
      }
      const state = campaign.recurrenceState;
      if (state.status === 'cancelled') {
        return NextResponse.json(
          { error: 'This recurrence was cancelled and cannot be changed.' }, { status: 409 });
      }

      let nextState = state;
      let nextSendAt = campaign.sendAt;

      if (action === 'pause_recurrence') {
        nextState = { ...state, status: 'paused' };
      } else if (action === 'resume_recurrence') {
        /* From NOW, never from the paused occurrence. */
        const next = nextOccurrence(campaign.recurrence, new Date());
        nextState = {
          ...state,
          status: next ? 'active' : 'completed',
          nextRunAt: next ? next.toISOString() : null,
        };
        nextSendAt = next ? next.toISOString() : undefined;
      } else {
        nextState = { ...state, status: 'cancelled', nextRunAt: null };
        nextSendAt = undefined;
      }

      await upsertMailCampaign({
        ...campaign,
        /* A paused or cancelled recurrence must not look "scheduled": the
           runner also checks the recurrence status, so this is belt and
           braces rather than the only guard. */
        status: nextState.status === 'active' ? 'scheduled' : 'cancelled',
        sendAt: nextSendAt,
        claimToken: undefined,
        recurrenceState: nextState,
      });
      await appendSuperAdminAudit({
        action: `mail.campaign.${action}`,
        targetType: 'mail_campaign',
        targetId: id,
        details: { status: nextState.status, nextRunAt: nextState.nextRunAt ?? 'none' },
      }).catch(() => {});
      return NextResponse.json({
        ok: true, recurrenceStatus: nextState.status, nextRunAt: nextState.nextRunAt ?? null,
      });
    }

    /* Changing the schedule recomputes `nextRunAt` on the SERVER. A browser
       supplied value is never trusted - it is the one field that decides when
       real mail goes out. */
    if (action === 'update_recurrence') {
      if (!campaign.recurrence) {
        return NextResponse.json({ error: 'This campaign does not repeat.' }, { status: 400 });
      }
      const validation = validateRecurrence(body.recurrence);
      if (!validation.valid) {
        return NextResponse.json(
          { error: 'That schedule is not valid.', errors: validation.errors }, { status: 400 });
      }
      const recurrence = body.recurrence as MailRecurrence;
      const next = nextOccurrence(recurrence, new Date());
      if (!next) {
        return NextResponse.json(
          { error: 'That schedule has no future occurrence.' }, { status: 400 });
      }
      await upsertMailCampaign({
        ...campaign,
        recurrence,
        status: 'scheduled',
        sendAt: next.toISOString(),
        recurrenceState: {
          /* History is preserved unchanged: editing a schedule must not
             rewrite what past occurrences did. */
          ...(campaign.recurrenceState ?? { status: 'active' }),
          status: 'active',
          nextRunAt: next.toISOString(),
        },
      });
      await appendSuperAdminAudit({
        action: 'mail.campaign.recurrence_updated',
        targetType: 'mail_campaign',
        targetId: id,
        details: { schedule: describeRecurrence(recurrence), nextRunAt: next.toISOString() },
      }).catch(() => {});
      return NextResponse.json({
        ok: true, nextRunAt: next.toISOString(), summary: describeRecurrence(recurrence),
      });
    }

    if (action === 'cancel') {
      /* Only before processing starts. Cancelling mid-send would leave some
         recipients mailed and the rest not, with no record of the boundary —
         and `claimCampaign` already refuses to claim a cancelled campaign, so
         cron skips it from here on. */
      if (!CANCELLABLE.includes(campaign.status)) {
        return NextResponse.json(
          { error: `A campaign that is ${campaign.status} can no longer be cancelled.` },
          { status: 409 },
        );
      }
      await upsertMailCampaign({ ...campaign, status: 'cancelled', claimToken: undefined });
      await appendSuperAdminAudit({
        action: 'mail.campaign.cancelled',
        targetType: 'mail_campaign',
        targetId: id,
        details: { subject: campaign.subject, audience: campaign.audienceDescription },
      }).catch(() => {});
      return NextResponse.json({ ok: true, status: 'cancelled' });
    }

    if (action === 'duplicate') {
      /* A copy, never a resend: it lands as a draft with no send time, so it
         cannot be picked up by cron until someone schedules it. */
      const now = new Date().toISOString();
      const copy = await upsertMailCampaign({
        ...campaign,
        id: createCampaignId(),
        title: `${campaign.title} (copy)`,
        status: 'draft',
        sendAt: undefined,
        claimToken: undefined,
        claimedAt: undefined,
        deliveries: undefined,
        passes: 0,
        progress: undefined,
        lastError: undefined,
        createdAt: now,
        updatedAt: now,
        createdBy: session.email,
      });
      await appendSuperAdminAudit({
        action: 'mail.campaign.duplicated',
        targetType: 'mail_campaign',
        targetId: copy.id,
        details: { copiedFrom: id, subject: copy.subject },
      }).catch(() => {});
      return NextResponse.json({ ok: true, campaign: toListRow(copy) });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('[super-admin/mail/campaigns POST]', error);
    return NextResponse.json({ error: 'Unable to update the campaign.' }, { status: 500 });
  }
}
