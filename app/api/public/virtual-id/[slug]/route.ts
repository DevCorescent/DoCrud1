import { NextRequest, NextResponse } from 'next/server';
import { getPublicVirtualIdCard, recordVirtualIdEvent } from '@/lib/server/virtual-ids';

export const dynamic = 'force-dynamic';

function buildVisitorKey(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'guest';
  return `${forwarded}:${request.headers.get('user-agent') || 'unknown'}`.slice(0, 180);
}

export async function GET(_: NextRequest, { params }: { params: { slug: string } }) {
  const card = await getPublicVirtualIdCard(params.slug);
  if (!card) {
    return NextResponse.json({ error: 'Virtual ID not found.' }, { status: 404 });
  }
  return NextResponse.json(card);
}

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const payload = await request.json().catch(() => ({}));
  const type = payload?.type === 'scan' || payload?.type === 'download' ? payload.type : 'open';
  const updated = await recordVirtualIdEvent(params.slug, {
    type,
    source: payload?.source === 'qr' || payload?.source === 'download' ? payload.source : 'direct',
    visitorKey: buildVisitorKey(request),
    userAgent: request.headers.get('user-agent') || undefined,
  });
  if (!updated) {
    return NextResponse.json({ error: 'Virtual ID not found.' }, { status: 404 });
  }
  return NextResponse.json(updated.analytics);
}
