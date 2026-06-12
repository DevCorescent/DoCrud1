import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { listMarketplaceItems, updateMarketplaceItemStatus, deleteMarketplaceItem } from '@/lib/server/template-marketplace';
import { getStoredUsers } from '@/lib/server/auth';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const query = searchParams.get('q') || '';
  const limit = parseInt(searchParams.get('limit') || '200');

  try {
    const [result, users] = await Promise.all([
      listMarketplaceItems({ q: query, limit, sort: 'recent' }).catch(() => ({ items: [], total: 0 })),
      getStoredUsers(),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));

    type Item = {
      id: string; title: string; description?: string; category?: string;
      status: string; priceInPaise?: number; sellerUserId?: string;
      purchaseCount?: number; openCount?: number; rating?: number; reviewCount?: number;
      createdAt?: string; updatedAt?: string; tags?: string[];
    };

    const items = ((result as { items?: Item[] }).items || []) as Item[];
    const now = Date.now();
    const day30 = now - 30 * 86400000;
    const day7 = now - 7 * 86400000;

    // Stats
    const published = items.filter((i) => i.status === 'published').length;
    const draft = items.filter((i) => i.status === 'draft').length;
    const underReview = items.filter((i) => i.status === 'under_review').length;
    const totalRevenuePaise = items.reduce((s, i) => s + ((i.purchaseCount || 0) * (i.priceInPaise || 0)), 0);

    // Category distribution
    const categories: Record<string, number> = {};
    items.forEach((i) => { const c = i.category || 'Other'; categories[c] = (categories[c] || 0) + 1; });

    // Price distribution
    const free = items.filter((i) => !i.priceInPaise || i.priceInPaise === 0).length;
    const paid = items.length - free;

    // Top items by purchases
    const topItems = [...items]
      .sort((a, b) => (b.purchaseCount || 0) - (a.purchaseCount || 0))
      .slice(0, 15)
      .map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        status: i.status,
        priceInPaise: i.priceInPaise,
        purchases: i.purchaseCount || 0,
        opens: i.openCount || 0,
        rating: i.rating,
        sellerName: i.sellerUserId ? userMap.get(i.sellerUserId)?.name || i.sellerUserId : '—',
        sellerEmail: i.sellerUserId ? userMap.get(i.sellerUserId)?.email || '' : '',
        createdAt: i.createdAt,
      }));

    // Recent items
    const recentItems = [...items]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 20)
      .map((i) => ({
        id: i.id,
        title: i.title,
        category: i.category,
        status: i.status,
        priceInPaise: i.priceInPaise,
        purchases: i.purchaseCount || 0,
        sellerName: i.sellerUserId ? userMap.get(i.sellerUserId)?.name || i.sellerUserId : '—',
        sellerEmail: i.sellerUserId ? userMap.get(i.sellerUserId)?.email || '' : '',
        createdAt: i.createdAt,
        sellerUserId: i.sellerUserId,
      }));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        total: items.length,
        published,
        draft,
        underReview,
        free,
        paid,
        totalRevenuePaise,
        new7d: items.filter((i) => i.createdAt && new Date(i.createdAt).getTime() >= day7).length,
        new30d: items.filter((i) => i.createdAt && new Date(i.createdAt).getTime() >= day30).length,
      },
      categories,
      topItems,
      recentItems,
    });
  } catch (err) {
    console.error('[super-admin/marketplace-overview GET]', err);
    return NextResponse.json({ error: 'Failed to load marketplace data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, itemId, sellerUserId } = await req.json() as { action: string; itemId?: string; sellerUserId?: string };

    if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 });

    await appendSuperAdminAudit({
      action: `marketplace_${action}`,
      targetType: 'marketplace_item',
      targetId: itemId,
      ip: req.headers.get('x-forwarded-for') || undefined,
    });

    const saActor = { id: 'super-admin', email: session.email || 'super-admin', role: 'admin', name: 'Super Admin' } as Parameters<typeof updateMarketplaceItemStatus>[0]['actor'];

    if (action === 'unpublish') {
      await updateMarketplaceItemStatus({ actor: saActor, itemId, status: 'archived' });
      return NextResponse.json({ success: true });
    }

    if (action === 'delete' && sellerUserId) {
      await deleteMarketplaceItem({ actor: saActor, itemId });
      return NextResponse.json({ success: true });
    }

    if (action === 'approve') {
      await updateMarketplaceItemStatus({ actor: saActor, itemId, status: 'published' });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/marketplace-overview POST]', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
