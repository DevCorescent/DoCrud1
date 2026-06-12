import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { listBuyerTemplatePurchases } from '@/lib/server/template-marketplace';
import { readJsonFile, templateMarketplaceItemsPath } from '@/lib/server/storage';
import type { TemplateMarketplaceItem } from '@/types/document';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const purchases = await listBuyerTemplatePurchases(session.user.id);
  const items = await readJsonFile<TemplateMarketplaceItem[]>(templateMarketplaceItemsPath, []);
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const enriched = purchases.map((p) => {
    const item = itemMap.get(p.itemId);
    return {
      ...p,
      item: item ? {
        id: item.id,
        name: item.templateSnapshot?.name,
        category: item.templateSnapshot?.category,
        coverImageDataUrl: item.coverImageDataUrl,
        sellerName: item.sellerName,
        priceInPaise: item.priceInPaise,
      } : null,
    };
  });
  return NextResponse.json({ purchases: enriched }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
