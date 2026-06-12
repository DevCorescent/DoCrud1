import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getOriginForRequest } from '@/lib/server/request';
import { runDueMailCampaigns } from '@/lib/server/mail-campaigns';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const origin = getOriginForRequest(request);
    const results = await runDueMailCampaigns(origin);
    return NextResponse.json({ results });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to run due campaigns' }, { status: 500 });
  }
}

