import { NextRequest, NextResponse } from 'next/server';
import { getPublicCertificate, recordCertificateEvent } from '@/lib/server/certificates';

export const dynamic = 'force-dynamic';

function buildVisitorKey(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'guest';
  return `${forwarded}:${request.headers.get('user-agent') || 'unknown'}`.slice(0, 180);
}

export async function GET(_: NextRequest, { params }: { params: { slug: string } }) {
  const record = await getPublicCertificate(params.slug);
  if (!record) {
    return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 });
  }
  return NextResponse.json(record);
}

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const payload = await request.json().catch(() => ({}));
  const type = payload?.type === 'download' || payload?.type === 'verify' ? payload.type : 'open';
  const updated = await recordCertificateEvent(params.slug, {
    type,
    source: payload?.source === 'qr' || payload?.source === 'download' ? payload.source : 'direct',
    visitorKey: buildVisitorKey(request),
    userAgent: request.headers.get('user-agent') || undefined,
  });
  if (!updated) {
    return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 });
  }
  return NextResponse.json(updated.analytics);
}
