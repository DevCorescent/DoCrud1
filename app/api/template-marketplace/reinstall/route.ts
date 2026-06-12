import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { reinstallFromPurchase } from '@/lib/server/template-marketplace';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null) as any;
    const purchaseId = String(body?.purchaseId || '').trim();
    if (!purchaseId) return NextResponse.json({ error: 'Missing purchaseId' }, { status: 400 });
    const purchase = await reinstallFromPurchase({ buyer: session.user as any, purchaseId });
    return NextResponse.json({ purchase }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to reinstall.' }, { status: 400 });
  }
}

