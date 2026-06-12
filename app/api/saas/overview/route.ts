import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getSaasOverview } from '@/lib/server/saas';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json(await getSaasOverview());
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load SaaS overview' }, { status: 500 });
  }
}
