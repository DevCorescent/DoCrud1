import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { getMailCampaigns } from '@/lib/server/mail-campaigns';
import { getEmailOutbox } from '@/lib/server/email-outbox';
import { sendTrackedMail } from '@/lib/server/mailer';
import { getStoredUsers } from '@/lib/server/auth';

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

    if (action === 'send_broadcast') {
      const { subject, htmlBody, textBody, audience } = data || {};
      if (!subject || !htmlBody) return NextResponse.json({ error: 'subject and htmlBody required' }, { status: 400 });

      const users = await getStoredUsers();
      let targets = users.filter((u) => u.isActive && u.email);
      if (audience === 'business') targets = targets.filter((u) => u.accountType === 'business');
      if (audience === 'individual') targets = targets.filter((u) => u.accountType === 'individual');
      if (audience === 'admins') targets = targets.filter((u) => u.role === 'admin');

      await appendSuperAdminAudit({
        action: 'broadcast_email_sent',
        details: { subject, audience, recipientCount: targets.length },
        ip: req.headers.get('x-forwarded-for') || undefined,
      });

      // Send in batches
      let sent = 0;
      for (const user of targets.slice(0, 500)) {
        await sendTrackedMail({
          policyKey: 'bulk_campaign',
          typeLabel: 'system',
          to: user.email,
          subject,
          text: textBody || subject,
          html: htmlBody,
          origin: req.nextUrl.origin,
        }).catch(() => null);
        sent++;
      }

      return NextResponse.json({ success: true, sent });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/mail POST]', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
