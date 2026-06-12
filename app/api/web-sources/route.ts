import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getWebSourcesMeta, ingestWebSources, listWebSources } from '@/lib/server/web-sources';

export async function GET(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const metaOnly = searchParams.get('meta') === '1';
    const q = searchParams.get('q') || '';
    const category = searchParams.get('category') || '';
    const tags = (searchParams.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean);
    const limit = Number(searchParams.get('limit') || '24');
    const offset = Number(searchParams.get('offset') || '0');

    const meta = await getWebSourcesMeta({ ownerUserId: session.user.id });
    if (metaOnly) return NextResponse.json({ meta }, { status: 200 });

    const listing = await listWebSources({
      ownerUserId: session.user.id,
      q,
      category,
      tags,
      limit,
      offset,
    });

    return NextResponse.json({ ...listing, meta }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load sources';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await request.json().catch(() => null) as any;
    const urls = Array.isArray(payload?.urls) ? payload.urls.map(String) : [];
    if (!urls.length) {
      return NextResponse.json({ error: 'No URLs provided' }, { status: 400 });
    }

    const result = await ingestWebSources({
      urls,
      ownerUserId: session.user.id,
      maxPages: Number(payload?.maxPages || 4),
      extractMode: payload?.extractMode === 'compact' ? 'compact' : 'full',
      label: payload?.label ? String(payload.label) : undefined,
      category: payload?.category ? String(payload.category) : undefined,
      tags: Array.isArray(payload?.tags) ? payload.tags.map(String) : undefined,
      notes: payload?.notes ? String(payload.notes) : undefined,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to add sources';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
