import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { deleteMailCampaign, getMailCampaignById, upsertMailCampaign, type MailCampaignStatus } from '@/lib/server/mail-campaigns';

const MAIL_CAMPAIGN_STATUSES: MailCampaignStatus[] = ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'];

function isMailCampaignStatus(value: string): value is MailCampaignStatus {
  return (MAIL_CAMPAIGN_STATUSES as string[]).includes(value);
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const campaign = await getMailCampaignById(ctx.params.id);
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ campaign });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load campaign' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const campaign = await getMailCampaignById(ctx.params.id);
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const payload = await request.json().catch(() => null) as any;
    const nextStatus = (() => {
      if (payload?.status === undefined) return campaign.status;
      const candidate = String(payload.status);
      return isMailCampaignStatus(candidate) ? candidate : campaign.status;
    })();
    const next = await upsertMailCampaign({
      ...campaign,
      title: payload?.title !== undefined ? String(payload.title) : campaign.title,
      subject: payload?.subject !== undefined ? String(payload.subject) : campaign.subject,
      text: payload?.text !== undefined ? String(payload.text) : campaign.text,
      html: payload?.html !== undefined ? String(payload.html || '') : campaign.html,
      audience: payload?.audience && typeof payload.audience === 'object' ? payload.audience : campaign.audience,
      sendAt: payload?.sendAt !== undefined ? (payload.sendAt ? String(payload.sendAt) : undefined) : campaign.sendAt,
      status: nextStatus,
      lastError: payload?.lastError !== undefined ? String(payload.lastError || '') : campaign.lastError,
      createdBy: campaign.createdBy || session.user.email || 'admin',
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    });

    return NextResponse.json({ campaign: next });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    await deleteMailCampaign(ctx.params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}
