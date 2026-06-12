import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getBusinessPageById, getPageProducts, createProduct } from '@/lib/server/business-pages';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const products = await getPageProducts(params.id);
    return NextResponse.json({ products });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const page = await getBusinessPageById(params.id);
    if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (page.ownerUserId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json() as { name?: string; description?: string; price?: string; category?: string; imageUrl?: string; productUrl?: string };
    if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

    const product = await createProduct({ id: randomUUID(), pageId: params.id, name: body.name.trim(), ...body });
    return NextResponse.json({ product }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
