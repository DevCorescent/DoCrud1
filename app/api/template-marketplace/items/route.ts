import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { listMarketplaceItems, publishTemplateToMarketplace } from '@/lib/server/template-marketplace';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').trim();
  const category = (searchParams.get('category') || '').trim();
  const limit = Number(searchParams.get('limit') || 24);
  const page = Number(searchParams.get('page') || 1);
  const sort = (searchParams.get('sort') || 'recent').trim();

  const payload = await listMarketplaceItems({
    q,
    category,
    limit: Number.isFinite(limit) ? limit : 24,
    ...(Number.isFinite(page) ? { page } : {}),
    ...(sort ? { sort } : {}),
  } as any);
  return NextResponse.json(payload, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null) as any;
    const templateId = String(body?.templateId || '').trim();
    const priceInPaise = Number(body?.priceInPaise || 0);
    const tags = body?.tags;
    const coverImageDataUrl = body?.coverImageDataUrl ? String(body.coverImageDataUrl) : undefined;
    const exampleData = body?.exampleData && typeof body.exampleData === 'object' ? body.exampleData : undefined;

    if (!templateId) return NextResponse.json({ error: 'Template is required.' }, { status: 400 });
    if (!Number.isFinite(priceInPaise) || priceInPaise < 0) return NextResponse.json({ error: 'Invalid price.' }, { status: 400 });

    const item = await publishTemplateToMarketplace({
      seller: session.user as any,
      templateId,
      priceInPaise,
      tags,
      coverImageDataUrl,
      exampleData,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to publish template.' }, { status: 400 });
  }
}
