export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getHeroBanners } from '@/lib/server/hero-banners';

/**
 * The hero's banners.
 *
 * The reading, the normalising and the one-minute cache all live in
 * lib/server/hero-banners.ts, because the homepage now renders the hero from a
 * server read on the page itself — see the note at the top of that file. This
 * route is what everything ELSE uses: a client that re-mounts the slider
 * without a fresh document, and the sponsored-ad serving path.
 *
 * Sharing the module means sharing its cache, so a hit here makes the next
 * page render free and the other way round.
 */
export async function GET() {
  const payload = await getHeroBanners();
  return NextResponse.json(payload, {
    headers: {
      /* Banners change when somebody edits them in Super Admin, which is rare.
         A minute of browser cache and a stale-while-revalidate window behind it
         means a second visit paints the hero from memory instead of waiting on
         a round trip. It matches the server-side TTL exactly, so the two
         cannot disagree about how old "fresh" is. */
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
}
