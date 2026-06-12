import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getOriginForRequest } from '@/lib/server/request';
import { sendMailCampaign } from '@/lib/server/mail-campaigns';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const origin = getOriginForRequest(request);
    const result = await sendMailCampaign(ctx.params.id, origin, session.user.email || 'admin');
    return NextResponse.json({ result });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to send campaign' }, { status: 500 });
  }
}

