import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { createCampaignId, getMailCampaigns, upsertMailCampaign } from '@/lib/server/mail-campaigns';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const campaigns = await getMailCampaigns();
    return NextResponse.json({ campaigns });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load campaigns' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const payload = await request.json().catch(() => null) as any;
    const title = String(payload?.title || '').trim() || 'Bulk email';
    const subject = String(payload?.subject || '').trim();
    const text = String(payload?.text || '').trim();
    if (!subject || !text) return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });

    const now = new Date().toISOString();
    const campaign = await upsertMailCampaign({
      id: createCampaignId(),
      title,
      subject,
      text,
      html: payload?.html ? String(payload.html) : undefined,
      audience: payload?.audience && typeof payload.audience === 'object' ? payload.audience : { mode: 'all_users' },
      sendAt: payload?.sendAt ? String(payload.sendAt) : undefined,
      status: payload?.sendAt ? 'scheduled' : 'draft',
      createdAt: now,
      updatedAt: now,
      createdBy: session.user.email || 'admin',
    });

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}

