/**
 * Public, read-only slice of the feed configuration.
 *
 * Only the knobs the client genuinely needs to compose the feed are exposed —
 * ranking weights and other internals stay server-side.
 */
import { NextResponse } from 'next/server';
import { getFeedConfig } from '@/lib/server/feed-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const c = await getFeedConfig();
    return NextResponse.json({
      composition: c.composition,
      ads: { enabled: c.ads.enabled, minGap: c.ads.minGap, maxGap: c.ads.maxGap, maxPerFeed: c.ads.maxPerFeed },
      people: { enabled: c.people.enabled },
      jobs: { enabled: c.jobs.enabled },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[feed-config] GET error', error);
    // Composition must still work if config cannot be read.
    return NextResponse.json({}, { status: 200 });
  }
}
