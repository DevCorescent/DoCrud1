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
  /** Card background colour (hex) or '' for the default dark-glass card. */
  backgroundColor: string;
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

  /* When a custom background is set, the card is no longer dark, so the white
     copy would vanish on a light colour. Pick ink or paper from the background's
     luminance (sRGB, the usual >0.6 split) and derive the muted variants from
     that. Without a custom background the original white palette is kept. */
  const ink = (() => {
    const hex = ad.backgroundColor;
    if (!hex) return null;
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const dark = lum > 0.6;   // light background → dark ink
    return dark
      ? { strong: 'rgba(17,17,17,0.92)', mid: 'rgba(17,17,17,0.62)', faint: 'rgba(17,17,17,0.45)', border: 'rgba(0,0,0,0.14)', chip: 'rgba(0,0,0,0.05)', cardBorder: 'rgba(0,0,0,0.10)' }
      : { strong: 'rgba(255,255,255,0.92)', mid: 'rgba(255,255,255,0.55)', faint: 'rgba(255,255,255,0.35)', border: 'rgba(255,255,255,0.14)', chip: 'rgba(255,255,255,0.06)', cardBorder: 'rgba(255,255,255,0.14)' };
  })();

  const inner = (
    <>
      <div className="mb-3 flex items-center justify-between">
        {/* Lowercase and quiet — a label, not a shout. */}
        <span className="text-[11.5px] font-medium" style={{ color: ink ? ink.mid : 'rgba(255,255,255,0.52)' }}>sponsored</span>
        {ad.advertiser && <span className="truncate text-[11px]" style={{ color: ink ? ink.faint : 'rgba(255,255,255,0.30)' }}>{ad.advertiser}</span>}
      </div>
      {ad.imageUrl && !broken && (
        /* Original aspect ratio, preserved: width fills the card and height
           follows intrinsically (width:100% / height:auto). No fixed height and
           no max-height — a height cap would force the <img> box to a different
           ratio and letterbox the creative, which is exactly what must not
           happen. object-contain is kept as a harmless guarantee against
           distortion should any future container constrain both axes. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={ad.imageUrl}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="mb-2.5 block h-auto w-full rounded-[10px] object-contain"
          data-no-invert
        />
      )}
      <p className="line-clamp-2 text-[13.5px] font-bold leading-snug" style={{ color: ink ? ink.strong : 'rgba(255,255,255,0.90)' }}>{ad.title}</p>
      {ad.subtitle && <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed" style={{ color: ink ? ink.mid : 'rgba(255,255,255,0.45)' }}>{ad.subtitle}</p>}
      {ad.ctaHref && (
        <span
          className="mt-3 inline-flex h-8 items-center gap-1.5 self-start rounded-[9px] border px-3 text-[11.5px] font-semibold"
          style={{
            color: ink ? ink.strong : 'rgba(255,255,255,0.70)',
            borderColor: ink ? ink.border : 'rgba(255,255,255,0.12)',
            background: ink ? ink.chip : 'rgba(255,255,255,0.05)',
          }}
        >
          {ad.ctaLabel || 'View'} <ArrowRight className="h-3 w-3" />
        </span>
      )}
    </>
  );

  return (
    <section
      ref={rootRef}
      className="flex flex-col"
      /* Same module language as People you may know: a square band of the
         feed, black first, glass second, a trace of purple. Two hairlines
         instead of an outline, and no drop shadow — both are what would make
         it read as a floating card again. Authored dark-only: the homepage
         shell is inverted for light mode in globals.css, so a second light
         palette here would invert into dark-on-dark. */
      style={
        ad.backgroundColor && ink
          ? {
              /* Premium card (reference look): the chosen colour fills a
                 rounded, softly-bordered, subtly-shadowed box with padding
                 around the creative. Horizontal margin insets it so the
                 rounded corners read as a card floating in the feed rather
                 than a full-bleed band. The colour surrounds the image; the
                 image itself is never touched. */
              margin: '16px 12px',
              padding: 16,
              borderRadius: 16,
              background: ad.backgroundColor,
              border: `1px solid ${ink.cardBorder}`,
              boxShadow: '0 6px 22px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.06)',
            }
          : {
              /* Fallback — existing ads with no colour keep the exact original
                 full-bleed dark-glass band. Unchanged. */
              margin: '18px 0',
              padding: 16,
              borderRadius: 0,
              borderTop: '1px solid rgba(170,140,240,0.07)',
              borderBottom: '1px solid rgba(170,140,240,0.07)',
              background: [
                'radial-gradient(circle at 18% 0%, rgba(150,110,255,0.065), transparent 42%)',
                'radial-gradient(circle at 88% 100%, rgba(120,90,220,0.035), transparent 48%)',
                'linear-gradient(135deg, rgba(8,8,11,0.98) 0%, rgba(20,15,30,0.96) 50%, rgba(8,8,11,0.99) 100%)',
              ].join(', '),
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035)',
            }
      }
      aria-label="Sponsored"
    >
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
