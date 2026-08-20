/**
 * Impression / click tracking. Server-side only.
 *
 * The client reports that an ad became visible or was clicked; the server
 * decides whether that counts. Impressions are de-duplicated per viewer per
 * ad within a window, so re-rendering cannot inflate the number.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { recordAdEvent } from '@/lib/server/ads';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { adId?: string; kind?: string } | null;
    const adId = typeof body?.adId === 'string' ? body.adId : '';
    const kind = body?.kind === 'click' ? 'click' : body?.kind === 'impression' ? 'impression' : null;
    if (!adId || !kind) return NextResponse.json({ ok: false }, { status: 400 });

    /* Viewer key: the signed-in user when available, otherwise a coarse hash of
       request headers. Never an identifier the client chooses. */
    const session = await getAuthSession().catch(() => null);
    const meId = session?.user ? await resolveSessionUserId(session).catch(() => null) : null;
    const viewer = meId
      ?? createHash('sha256')
        .update(`${req.headers.get('user-agent') ?? ''}|${req.headers.get('x-forwarded-for') ?? ''}`)
        .digest('hex').slice(0, 24);

    const counted = await recordAdEvent(adId, kind, viewer);
    return NextResponse.json({ ok: true, counted });
  } catch (error) {
    console.error('[ads/events] POST error', error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
