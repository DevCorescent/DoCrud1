import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getItemRatingSummary, listItemReviews, upsertReview } from '@/lib/server/template-marketplace';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const itemId = String(searchParams.get('itemId') || '').trim();
  if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
  const [reviews, rating] = await Promise.all([listItemReviews(itemId), getItemRatingSummary(itemId)]);
  return NextResponse.json({ reviews, rating }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null) as any;
    const itemId = String(body?.itemId || '').trim();
    const rating = Number(body?.rating || 0);
    const title = body?.title ? String(body.title) : undefined;
    const message = body?.body ? String(body.body) : undefined;
    if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
    const review = await upsertReview({ itemId, buyer: session.user as any, rating, title, body: message });
    return NextResponse.json({ review }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save review.' }, { status: 400 });
  }
}

