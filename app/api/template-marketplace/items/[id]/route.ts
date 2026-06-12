import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { deleteMarketplaceItem, ensureMarketplaceItemPreviewImages, getMarketplaceItem, trackMarketplaceItemOpen, updateMarketplaceItemStatus } from '@/lib/server/template-marketplace';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  const id = String(context?.params?.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  // Track marketplace opens (no personal data).
  await trackMarketplaceItemOpen({ itemId: id });
  const item = await ensureMarketplaceItemPreviewImages({ itemId: id }) || await getMarketplaceItem(id);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (item.status !== 'published') {
    const session = await getAuthSession();
    const isOwner = session?.user?.id && session.user.id === item.sellerUserId;
    const isAdmin = session?.user?.role === 'admin';
    if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ item }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const id = String(context?.params?.id || '').trim();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const body = await request.json().catch(() => null) as any;
    const status = body?.status === 'archived' ? 'archived' : body?.status === 'published' ? 'published' : '';
    if (!status) return NextResponse.json({ error: 'Missing status' }, { status: 400 });
    const updated = await updateMarketplaceItemStatus({ actor: session.user as any, itemId: id, status });
    return NextResponse.json({ item: updated }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update template.' }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const id = String(context?.params?.id || '').trim();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    const result = await deleteMarketplaceItem({ actor: session.user as any, itemId: id });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete template.' }, { status: 400 });
  }
}
