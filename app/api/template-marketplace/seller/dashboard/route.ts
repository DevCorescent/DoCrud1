import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getTemplateAnalytics, listSellerIncome, listSellerPublishedTemplates } from '@/lib/server/template-marketplace';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const scope = (searchParams.get('scope') || 'published').trim();
  const itemId = (searchParams.get('itemId') || '').trim();
  const status = (searchParams.get('status') || 'all').trim() as any;

  if (scope === 'income') {
    const records = await listSellerIncome({
      sellerUserId: session.user.id,
      status: status === 'pending' || status === 'paid_out' || status === 'void' ? status : 'all',
      itemId: itemId || undefined,
      limit: 400,
    });
    const totals = records.reduce(
      (acc, r) => {
        acc.gross += r.grossAmountInPaise;
        acc.commission += r.commissionAmountInPaise;
        acc.net += r.sellerNetAmountInPaise;
        if (r.status === 'pending') acc.pending += r.sellerNetAmountInPaise;
        return acc;
      },
      { gross: 0, commission: 0, net: 0, pending: 0 },
    );
    return NextResponse.json({ records, totals }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  if (scope === 'analytics') {
    if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
    const items = await listSellerPublishedTemplates(session.user.id);
    const owns = items.some((i) => i.id === itemId);
    if (!owns && session.user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const analytics = await getTemplateAnalytics({ itemId });
    return NextResponse.json({ analytics }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }

  const items = await listSellerPublishedTemplates(session.user.id);
  return NextResponse.json({ items }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

