import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import {
  getMailCampaigns, upsertMailCampaign, createCampaignId,
} from '@/lib/server/mail-campaigns';
import {
  resolveRecipients, describeSegment, type MailSegment,
} from '@/lib/server/mail-recipients';
import { zonedTimeToUtc, SUPPORTED_TIMEZONES } from '@/lib/email/schedule-time';
import { getEmailOutbox } from '@/lib/server/email-outbox';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') || 'campaigns';
  const limit = Math.min(300, parseInt(searchParams.get('limit') || '100'));

  try {
    if (view === 'outbox') {
      const outbox = await getEmailOutbox(limit).catch(() => []);
      return NextResponse.json({ outbox });
    }

    const [campaigns, outbox] = await Promise.all([
      getMailCampaigns().catch(() => []),
      getEmailOutbox(50).catch(() => []),
    ]);

    const recentOutbox = outbox.slice(0, 20);
    const totalSent = outbox.filter((e: { status?: string }) => e.status === 'sent').length;
    const totalFailed = outbox.filter((e: { status?: string }) => e.status === 'failed').length;

    return NextResponse.json({ campaigns, recentOutbox, stats: { totalSent, totalFailed, totalCampaigns: campaigns.length } });
  } catch (err) {
    console.error('[super-admin/mail GET]', err);
    return NextResponse.json({ error: 'Failed to load mail data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, data } = await req.json();

    if (action === 'preview_recipients') {
      /* Powers the confirmation screen. Resolving on the server means the
         number the admin confirms is produced by the same code that will
         choose the addresses, not by a browser-side guess. */
      const segment: MailSegment = data?.segment ?? (
        data?.audience === 'business' ? { mode: 'businesses' }
          : data?.audience === 'individual' ? { mode: 'individuals' }
          : data?.audience === 'admins' ? { mode: 'filtered', filters: { role: 'admin', status: 'active' } }
          : { mode: 'filtered', filters: { status: 'active' } }
      );
      const r = await resolveRecipients(segment);
      return NextResponse.json({
        selected: r.selected,
        excluded: r.excluded,
        invalid: r.invalid,
        final: r.final,
        /* Names and addresses only — never the full user record. */
        sample: r.sample.map((u) => ({ name: u.name, email: u.email, accountType: u.accountType })),
        invalidSamples: r.invalidSamples,
      });
    }

    if (action === 'send_broadcast') {
      /* REWRITTEN. The previous implementation sent up to 500 messages
         synchronously inside this request and reported success like this:

             await sendTrackedMail({...}).catch(() => null);
             sent++;

         `sent` counted ATTEMPTS. Every failure was swallowed, so with the
         mailbox suspended the panel told the admin "Sent to 500 recipients"
         while nothing was delivered. It also silently dropped everyone past
         the 500th, and bypassed the campaign system entirely — no claim
         protection, so a double-click sent the whole broadcast twice.

         It now creates a campaign and hands it to the scheduled runner, which
         already has claim-based duplicate protection, honest per-recipient
         failure accounting and retry. This request returns immediately with a
         resolved recipient count instead of blocking on SMTP. */
      const { subject, htmlBody, textBody, audience, segment, scheduleAt } = data || {};
      if (!subject || !htmlBody) {
        return NextResponse.json({ error: 'subject and htmlBody required' }, { status: 400 });
      }

      /* A segment is resolved on the server. The legacy audience strings are
         still accepted so existing callers keep working. */
      const resolvedSegment: MailSegment = segment ?? (
        audience === 'business' ? { mode: 'businesses' }
          : audience === 'individual' ? { mode: 'individuals' }
          : audience === 'admins' ? { mode: 'filtered', filters: { role: 'admin', status: 'active' } }
          : { mode: 'filtered', filters: { status: 'active' } }
      );

      const recipients = await resolveRecipients(resolvedSegment);
      if (recipients.final === 0) {
        return NextResponse.json(
          { error: 'No deliverable recipients matched this audience.' }, { status: 400 });
      }

      /* Scheduled campaigns are picked up by /api/cron/mail, so they send with
         no browser open. An immediate send is simply one that is already due.

         The wall-clock time is interpreted in the ADMIN'S stated timezone, not
         the server's and not the browser's. "6am tomorrow" means 6am where the
         admin is; assuming UTC would silently send at 11:30am IST. */
      const timezone = typeof data?.timezone === 'string' ? data.timezone : '';
      let when: Date;
      if (scheduleAt) {
        if (timezone && !SUPPORTED_TIMEZONES.includes(timezone)) {
          return NextResponse.json({ error: 'Unsupported timezone.' }, { status: 400 });
        }
        const converted = timezone
          ? zonedTimeToUtc(String(scheduleAt), timezone)
          : new Date(String(scheduleAt));
        if (!converted || Number.isNaN(converted.getTime())) {
          return NextResponse.json({ error: 'Invalid schedule time.' }, { status: 400 });
        }
        when = converted;
      } else {
        when = new Date();
      }

      const campaign = await upsertMailCampaign({
        id: createCampaignId(),
        title: String(subject).slice(0, 120),
        subject: String(subject),
        text: String(textBody || subject),
        html: String(htmlBody),
        audience: { mode: 'segment', segment: resolvedSegment },
        /* The DEFINITION is stored, never a frozen recipient list: a campaign
           scheduled for tomorrow must mail whoever matches tomorrow. The
           description and the preview count are kept alongside it so the audit
           trail records what the admin was told at the time. */
        audienceDescription: describeSegment(resolvedSegment),
        audiencePreviewCount: recipients.final,
        scheduleTimezone: timezone || undefined,
        sendAt: when.toISOString(),
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: session.email,
      });

      await appendSuperAdminAudit({
        action: 'broadcast_email_queued',
        targetType: 'campaign',
        targetId: campaign.id,
        details: {
          subject,
          audience: resolvedSegment.mode,
          audienceDescription: describeSegment(resolvedSegment),
          recipientCount: recipients.final,
          excluded: recipients.excluded,
          invalid: recipients.invalid,
          scheduledFor: campaign.sendAt,
          timezone: timezone || 'server default',
        },
        ip: req.headers.get('x-forwarded-for') || undefined,
      });

      return NextResponse.json({
        success: true,
        campaignId: campaign.id,
        /* Deliberately NOT called `sent`: nothing has been delivered yet, and
           the old field name is exactly what made the panel lie. */
        queued: recipients.final,
        excluded: recipients.excluded,
        invalid: recipients.invalid,
        audienceDescription: describeSegment(resolvedSegment),
        scheduledFor: campaign.sendAt,
        timezone: timezone || undefined,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/mail POST]', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
