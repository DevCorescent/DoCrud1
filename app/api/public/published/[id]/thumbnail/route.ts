import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Legacy endpoint used by older clients.
 * Never load full Mongo blobs / base64 here — redirect to the lean thumbnail proxy
 * (which serves disk cache, R2 CDN, or migrates once).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ dataUrl: null }, { status: 400 });
    }
    // Permanent redirect so browsers / caches hit the fast path directly next time
    return NextResponse.redirect(new URL(`/api/public/thumbnail/${encodeURIComponent(id)}`, _req.url), {
      status: 307,
    });
  } catch {
    return NextResponse.json({ dataUrl: null });
  }
}
