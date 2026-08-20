/**
 * Public ad serving.
 *
 * Returns only ads the server considers servable — approved, active, paid
 * where required, inside their window — and, when targeting is enabled, only
 * those whose targeting the viewer actually matches. Viewer signals are read
 * from the session's own profile; the client cannot supply them.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getProfileFields } from '@/lib/server/user-profiles';
import { getFeedConfig } from '@/lib/server/feed-config';
import {
  expireDueAds, getAllSponsoredAds, getLegacyAds, isServable, scoreAdForViewer, type ViewerSignals,
} from '@/lib/server/ads';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const config = await getFeedConfig();
    if (!config.ads.enabled) {
      return NextResponse.json({ ads: [] }, { headers: { 'Cache-Control': 'no-store' } });
    }

    await expireDueAds();

    const section = (new URL(req.url).searchParams.get('section') || '').trim() || undefined;

    /* Viewer signals come from the stored profile, never from the request. */
    let signals: ViewerSignals = { domain: '', profession: '', skills: [], location: '', section };
    const session = await getAuthSession();
    const meId = session?.user ? await resolveSessionUserId(session).catch(() => null) : null;
    if (meId) {
      const p = await getProfileFields(meId, ['headline', 'location', 'skills']).catch(() => null);
      signals = {
        domain: String((p as { headline?: unknown } | null)?.headline ?? ''),
        profession: String((p as { headline?: unknown } | null)?.headline ?? ''),
        skills: Array.isArray((p as { skills?: unknown } | null)?.skills)
          ? ((p as { skills: unknown[] }).skills).map((s) => String(s))
          : [],
        location: String((p as { location?: unknown } | null)?.location ?? ''),
        section,
      };
    }

    const [own, legacy] = await Promise.all([getAllSponsoredAds(), getLegacyAds()]);
    const now = Date.now();

    const eligible = [...own, ...legacy]
      .filter((a) => isServable(a, now))
      .map((ad) => ({ ad, score: scoreAdForViewer(ad, signals, config.ads.targetingEnabled) }))
      .filter((x): x is { ad: typeof own[number]; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score || Date.parse(b.ad.createdAt) - Date.parse(a.ad.createdAt))
      .slice(0, Math.max(0, config.ads.maxPerFeed))
      .map(({ ad }) => ({
        id: ad.id,
        title: ad.title,
        subtitle: ad.subtitle ?? '',
        imageUrl: ad.imageUrl,
        ctaLabel: ad.ctaLabel ?? '',
        ctaHref: ad.ctaHref ?? '',
        advertiser: ad.ownerName ?? 'Docrud',
        legacy: !!ad.legacy,
      }));

    return NextResponse.json({ ads: eligible }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[ads/serve] GET error', error);
    // A failing ad service must never break the feed.
    return NextResponse.json({ ads: [] }, { status: 200 });
  }
}
