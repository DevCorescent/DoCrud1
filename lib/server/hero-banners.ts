/**
 * The hero's banners, read once and shared.
 *
 * ═══ WHY THIS IS NOT JUST THE API ROUTE ═══
 *
 * The homepage used to learn its hero from a client fetch of
 * /api/public/ad-banners, and that request left the browser 7.4 seconds into
 * the load — twenty-first in a queue of twenty-five, because it could not even
 * be issued until the 9,500-line homepage component had downloaded, parsed and
 * mounted. The hero is the first thing above the fold and it was the last
 * thing on the page to know what it was.
 *
 * The server already knows. `app/page.tsx` reads the theme, the homepage
 * config and the viewer's seeded counts before it renders, precisely so those
 * things do not cost a round trip after hydration; the banners belong in that
 * batch. This module is what both the page and the public route call, so the
 * hero cannot be one thing on the server and another in the browser.
 *
 * ═══ THE CACHE ═══
 *
 * Banners change when somebody edits them in Super Admin, which is rarely, and
 * this is on the critical path of every homepage render. One in-process cache,
 * a minute long, shared by both callers — so the page's read is free whenever
 * the route has just answered, and the other way round.
 */

import { readJsonFile, adBannersPath } from '@/lib/server/storage';
import { heroBannerIsShowable, normalizeHeroBanner, type HeroBanner } from '@/lib/hero-banner';

type Stored = HeroBanner[] | { heading?: string; banners: HeroBanner[] };

export interface HeroBannerPayload {
  banners: HeroBanner[];
  heading: string;
}

const TTL = 60_000;
let cache: { payload: HeroBannerPayload; at: number } | null = null;

/** Drop the cache. Called after a write so an admin sees their own edit on the
    next load rather than up to a minute later. */
export function invalidateHeroBanners(): void {
  cache = null;
}

/**
 * The banners a visitor should see: active, showable, in order.
 *
 * Normalised on the way out as well as the way in. A row written by an older
 * build has no motif, no mobile artwork and no colours, and both callers should
 * get a complete record rather than a set of `undefined`s to guess at. Anything
 * with neither a picture nor a colour is not a slide and is dropped here rather
 * than rendering an empty frame.
 */
export async function getHeroBanners(): Promise<HeroBannerPayload> {
  if (cache && Date.now() - cache.at < TTL) return cache.payload;

  try {
    const raw = await readJsonFile<Stored>(adBannersPath, []);
    const data = Array.isArray(raw) ? { banners: raw } : (raw ?? { banners: [] });
    const list = Array.isArray(data.banners) ? data.banners : [];

    const banners = list
      .map((b) => normalizeHeroBanner(b, b))
      .filter((b): b is HeroBanner => Boolean(b) && b!.active && heroBannerIsShowable(b!))
      .sort((a, b) => a.order - b.order);

    const payload: HeroBannerPayload = { banners, heading: data.heading ?? '' };
    cache = { payload, at: Date.now() };
    return payload;
  } catch (err) {
    console.error('[hero-banners]', err);
    /* Not cached: a read that failed should be retried on the next request,
       not remembered as "there are no banners" for a minute. */
    return { banners: [], heading: '' };
  }
}

/**
 * The artwork to preload, and the media query it applies to.
 *
 * Only the FIRST slide, and only the one shape that will actually be painted:
 * a preload for a picture the browser then does not use is a wasted download
 * and a console warning. The media attribute is the same 640px break the
 * stylesheet uses to choose between the two — see home-hero-slider.css.
 */
export function heroPreloads(banners: HeroBanner[]): Array<{ href: string; media: string }> {
  const first = banners[0];
  if (!first) return [];

  const wide = first.imageUrl;
  const tall = first.imageUrlMobile || first.imageUrl;
  if (!wide && !tall) return [];

  /* A data: URI is already in the HTML by the time this would matter — there
     is nothing to fetch, and preloading one only adds bytes to the head. */
  const real = (u: string) => Boolean(u) && !u.startsWith('data:');

  if (wide === tall) return real(wide) ? [{ href: wide, media: 'all' }] : [];

  const out: Array<{ href: string; media: string }> = [];
  if (real(wide)) out.push({ href: wide, media: '(min-width: 641px)' });
  if (real(tall)) out.push({ href: tall, media: '(max-width: 640px)' });
  return out;
}
