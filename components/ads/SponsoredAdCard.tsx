'use client';

/**
 * Sponsored ad — a feed item.
 *
 * Ads come from /api/ads/serve, which only returns campaigns the server
 * considers servable (approved, active, paid where required, inside their
 * window) and whose targeting the viewer matches. Nothing here can influence
 * eligibility.
 *
 * An impression is reported only when the card is actually visible, via a
 * one-shot IntersectionObserver — not merely because it rendered. The server
 * still de-duplicates, so a re-render cannot inflate the count.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

export type ServedAd = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  ctaLabel: string;
  ctaHref: string;
  advertiser: string;
  legacy: boolean;
};

/* One request per page load, shared by every ad slot in the feed. */
let adsPromise: Promise<ServedAd[]> | null = null;
function loadAds(): Promise<ServedAd[]> {
  if (!adsPromise) {
    adsPromise = fetch('/api/ads/serve')
      .then((r) => (r.ok ? r.json() : { ads: [] }))
      .then((d: { ads?: ServedAd[] }) => (Array.isArray(d.ads) ? d.ads : []))
      .catch(() => []);          // a failing ad service must not break the feed
  }
  return adsPromise;
}

function track(adId: string, kind: 'impression' | 'click') {
  try {
    const body = JSON.stringify({ adId, kind });
    // Clicks must survive the navigation that follows them.
    if (kind === 'click' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/ads/events', new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch('/api/ads/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
      .catch(() => {});
  } catch { /* tracking must never surface to the user */ }
}

export default function SponsoredAdCard({ adIndex = 0 }: { adIndex?: number }) {
  const [ad, setAd] = useState<ServedAd | null>(null);
  const [broken, setBroken] = useState(false);
  const done = useRef(false);
  const rootRef = useRef<HTMLElement>(null);
  const seen = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void loadAds().then((list) => {
      if (list.length === 0) return;
      setAd(list[adIndex % list.length]);
    });
  }, [adIndex]);

  /* Impression on real visibility, once. Legacy banners carry no counters, so
     they are not reported. */
  useEffect(() => {
    if (!ad || ad.legacy || !rootRef.current || seen.current) return;
    const el = rootRef.current;
    const obs = new IntersectionObserver((entries) => {
      const e = entries[0];
      if (e?.isIntersecting && e.intersectionRatio >= 0.5 && !seen.current) {
        seen.current = true;
        track(ad.id, 'impression');
        obs.disconnect();
      }
    }, { threshold: [0.5] });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ad]);

  if (!ad) return null;   // no eligible ad → no empty slot

  const inner = (
    <>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/25">Sponsored</span>
        {ad.advertiser && <span className="truncate text-[10.5px] text-white/25">{ad.advertiser}</span>}
      </div>
      {ad.imageUrl && !broken && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={ad.imageUrl}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="mb-2.5 h-32 w-full rounded-[10px] object-cover"
          data-no-invert
        />
      )}
      <p className="line-clamp-2 text-[13.5px] font-bold leading-snug text-white/90">{ad.title}</p>
      {ad.subtitle && <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-white/45">{ad.subtitle}</p>}
      {ad.ctaHref && (
        <span className="mt-3 inline-flex h-8 items-center gap-1.5 self-start rounded-[9px] border border-white/[0.12] bg-white/[0.05] px-3 text-[11.5px] font-semibold text-white/70">
          {ad.ctaLabel || 'View'} <ArrowRight className="h-3 w-3" />
        </span>
      )}
    </>
  );

  return (
    <section ref={rootRef} className="flex flex-col rounded-[14px] border border-white/[0.07] bg-white/[0.02] p-3" aria-label="Sponsored">
      {ad.ctaHref
        ? (
          <a
            href={ad.ctaHref}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={() => { if (!ad.legacy) track(ad.id, 'click'); }}
            className="flex flex-col"
          >
            {inner}
          </a>
        )
        : inner}
    </section>
  );
}
