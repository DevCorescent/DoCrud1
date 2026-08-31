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
        };
      });

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
        },
        deliveries,
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
