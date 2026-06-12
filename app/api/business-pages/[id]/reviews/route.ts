export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAuthSession } from '@/lib/server/auth';
import { getBusinessPageById } from '@/lib/server/business-pages';
import { readJsonFile, writeJsonFile, businessReviewsPath } from '@/lib/server/storage';

interface Review {
  id: string; pageId: string; userId: string; userName: string;
  rating: number; title: string; body: string;
  helpful: number; helpedBy: string[]; createdAt: string;
}
interface Store { reviews: Review[] }

async function readStore(): Promise<Store> {
  return readJsonFile<Store>(businessReviewsPath, { reviews: [] });
}
async function writeStore(s: Store): Promise<void> {
  await writeJsonFile(businessReviewsPath, s);
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const store = await readStore();
    const reviews = store.reviews
      .filter(r => r.pageId === params.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    return NextResponse.json({ reviews, average: Math.round(avg * 10) / 10, total: reviews.length });
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

    const body = await req.json() as { rating?: number; title?: string; body?: string; action?: string; reviewId?: string };

    if (body.action === 'helpful' && body.reviewId) {
      const store = await readStore();
      const rev = store.reviews.find(r => r.id === body.reviewId);
      if (rev) {
        const idx = rev.helpedBy.indexOf(session.user.id);
        if (idx >= 0) { rev.helpedBy.splice(idx, 1); rev.helpful--; }
        else { rev.helpedBy.push(session.user.id); rev.helpful++; }
        await writeStore(store);
        return NextResponse.json({ review: rev });
      }
    }

    const rating = Number(body.rating ?? 0);
    if (rating < 1 || rating > 5) return NextResponse.json({ error: 'Rating 1–5 required' }, { status: 400 });
    if (!body.body?.trim()) return NextResponse.json({ error: 'Review text required' }, { status: 400 });

    const store = await readStore();
    const existing = store.reviews.findIndex(r => r.pageId === params.id && r.userId === session.user.id);
    const review: Review = {
      id: existing >= 0 ? store.reviews[existing].id : crypto.randomUUID(),
      pageId: params.id, userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Anonymous',
      rating, title: body.title?.trim() ?? '', body: body.body.trim(),
      helpful: existing >= 0 ? store.reviews[existing].helpful : 0,
      helpedBy: existing >= 0 ? store.reviews[existing].helpedBy : [],
      createdAt: existing >= 0 ? store.reviews[existing].createdAt : new Date().toISOString(),
    };
    if (existing >= 0) store.reviews[existing] = review;
    else store.reviews.unshift(review);
    await writeStore(store);
    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { searchParams } = req.nextUrl;
    const reviewId = searchParams.get('reviewId');
    const store = await readStore();
    const idx = store.reviews.findIndex(r => r.id === reviewId && r.pageId === params.id && r.userId === session.user.id);
    if (idx < 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    store.reviews.splice(idx, 1);
    await writeStore(store);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
