import { NextRequest, NextResponse } from 'next/server';
import { listMarketplaceItemsBySeller } from '@/lib/server/template-marketplace';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  const sellerUserId = String(context?.params?.id || '').trim();
  if (!sellerUserId) return NextResponse.json({ error: 'Missing seller id' }, { status: 400 });
  const items = await listMarketplaceItemsBySeller({ sellerUserId, limit: 60 });
  return NextResponse.json({ items }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

