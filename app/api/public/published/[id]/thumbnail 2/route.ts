import { NextRequest, NextResponse } from 'next/server';
import { getFileTransfers } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const transfers = await getFileTransfers();
    const t = transfers.find(
      (x) =>
        (x.id === id || x.shareId === id) &&
        x.directoryVisibility === 'public' &&
        x.authMode === 'public' &&
        !x.revokedAt,
    );
    if (!t) return NextResponse.json({ dataUrl: null });

    if (t.mimeType?.startsWith('image/')) {
      return NextResponse.json({ dataUrl: t.dataUrl ?? null, mimeType: t.mimeType });
    }

    if (t.mimeType === 'text/html' && t.dataUrl) {
      try {
        // dataUrl for html is stored as base64 data URI or raw base64
        let html = '';
        if (t.dataUrl.startsWith('data:')) {
          const b64 = t.dataUrl.split(',')[1] ?? '';
          html = Buffer.from(b64, 'base64').toString('utf8');
        } else {
          html = Buffer.from(t.dataUrl, 'base64').toString('utf8');
        }
        const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (match?.[1]) {
          return NextResponse.json({ dataUrl: match[1], mimeType: 'image/jpeg' });
        }
      } catch {
        // fall through
      }
    }

    return NextResponse.json({ dataUrl: null });
  } catch {
    return NextResponse.json({ dataUrl: null });
  }
}
