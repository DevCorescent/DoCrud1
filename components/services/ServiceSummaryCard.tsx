'use client';

/**
 * The one service card, in two presentations of the same data.
 *
 * Extracted from the service detail page's "More from this provider" strip so
 * discovery and detail render the same card instead of drifting into two
 * designs. Provider identity is optional: the detail page already names the
 * provider above the strip, discovery needs it on every card.
 *
 * `variant`:
 *   'compact'   — the original strip card (default). The detail page renders
 *                 this, so its appearance is unchanged.
 *   'discovery' — the /services grid card, drawn in the People page's visual
 *                 language (banner → overlapping avatar → identity block →
 *                 pills → stats footer). Same fields, same destinations.
 *
 * Every field is rendered only when it actually exists on the Service record —
 * there are no placeholder ratings, booking counts or availability lines.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Star, MapPin, ArrowUpRight } from 'lucide-react';
import { serviceCategory, formatServicePrice, formatDelivery, serviceDetailHref } from '@/lib/services-ui';

export type ServiceSummary = {
  id: string;
  title: string;
  tagline: string;
  category: string;
  subcategory?: string | null;
  pricingModel: string;
  basePrice: number;
  currency: string;
  imageUrl: string | null;
  /** Service-specific identity — independent of the provider's main profile. */
  coverImageUrl?: string | null;
  serviceImageUrl?: string | null;
  useMainProfileImage?: boolean;
  location?: string | null;
  workMode?: string | null;
  availability?: string | null;
  rating: number;
  reviewCount: number;
  /** Skills/tags the provider entered. Rendered only when non-empty. */
  tags?: string[];
  deliveryTime?: number | null;
  deliveryUnit?: string | null;
  provider?: { id: string; name: string; avatarUrl: string | null };
};

/** Fixed-height box so the grid never shifts while images load. */
function CardImage({ src, category, alt }: { src: string | null; category: string; alt: string }) {
  const [broken, setBroken] = useState(false);
  const cat = serviceCategory(category);
  if (!src || broken) {
    return (
      <div className="flex h-28 w-full items-center justify-center bg-white/[0.03]">
        <span className="text-3xl opacity-40" aria-hidden>{cat.icon}</span>
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      className="h-28 w-full object-cover"
      data-no-invert
    />
  );
}

function ProviderAvatar({ src, name, size = 'sm' }: { src: string | null; name: string; size?: 'sm' | 'lg' }) {
  const [broken, setBroken] = useState(false);
  const box = size === 'lg' ? 'h-9 w-9 text-[13px]' : 'h-5 w-5 text-[9px]';
  const ring = size === 'lg' ? 'ring-2 ring-[#0d0d10]' : 'ring-1 ring-white/[0.07]';
  if (!src || broken) {
    return (
      <span className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-white/[0.10] font-bold text-white/60 ${ring}`}>
        {(name || '?').trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      onError={() => setBroken(true)}
      className={`${box} shrink-0 rounded-full object-cover ${ring}`}
      data-no-invert
    />
  );
}

const WORK_MODE_LABELS: Record<string, string> = { remote: 'Remote', onsite: 'On-site', hybrid: 'Hybrid' };
const AVAILABILITY_LABELS: Record<string, string> = {
  available: 'Available now', limited: 'Limited availability', unavailable: 'Not taking work',
};

/* ─── Compact card (service detail page's provider strip) ─────────────
   The original card, unchanged. The detail page renders this variant. */
function CompactCard({ service }: { service: ServiceSummary }) {
  const cat = serviceCategory(service.category);
  /* Cover falls back to the service image, then to a category placeholder. */
  const cover = service.coverImageUrl || service.imageUrl;
  /* The service's own image wins unless the provider opted into their main
     profile photo. Neither is substituted for the other silently. */
  const identityImage = service.useMainProfileImage
    ? (service.provider?.avatarUrl ?? null)
    : (service.serviceImageUrl || service.provider?.avatarUrl || null);
  const workMode = service.workMode ? WORK_MODE_LABELS[service.workMode] : null;
  const availability = service.availability ? AVAILABILITY_LABELS[service.availability] : null;
  const delivery = formatDelivery(service.deliveryTime, service.deliveryUnit);
  const tags = (service.tags ?? []).filter(Boolean).slice(0, 3);
  const detail = serviceDetailHref(service.id);

  /* Hierarchy follows the specification: cover → identity → title →
     description → category/skills → rating · delivery → price → actions. */
  return (
    <div className="group flex flex-col overflow-hidden rounded-[20px] border border-white/[0.07] bg-[#0d0d10] transition hover:border-white/[0.14]">
      <div className="relative">
        <Link href={detail} className="block">
          <CardImage src={cover} category={service.category} alt={service.title} />
        </Link>
        {/* Identity overlaps the cover edge so the provider-service
            relationship reads immediately, as the specification asks. */}
        {service.provider && (
          <div className="absolute -bottom-4 left-3.5">
            <ProviderAvatar src={identityImage} name={service.provider.name} size="lg" />
          </div>
        )}
      </div>

      <div className={`flex flex-1 flex-col p-3.5 ${service.provider ? 'pt-5' : ''}`}>
        {service.provider && (
          <Link
            href={`/services/${service.provider.id}`}
            className="mb-1.5 inline-flex min-w-0 items-center text-[11.5px] font-semibold text-white/55 transition hover:text-white"
          >
            <span className="truncate">{service.provider.name}</span>
          </Link>
        )}

        <Link href={detail} className="block">
          <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-white/90">{service.title}</p>
          {service.tagline && (
            <p className="mt-1 line-clamp-1 text-[11.5px] text-white/40">{service.tagline}</p>
          )}
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cat.bg} ${cat.color}`}>
            <span aria-hidden>{cat.icon}</span>{cat.label}
          </span>
          {/* Subcategory sits with the category, only when one was chosen. */}
          {service.subcategory && (
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/50">
              {service.subcategory}
            </span>
          )}
          {/* Skills/tags, only when the provider entered any. */}
          {tags.map(t => (
            <span key={t} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/45">{t}</span>
          ))}
        </div>

        {/* Rating · location · delivery — each only when the record has it. */}
        {(service.reviewCount > 0 || service.location || workMode || delivery) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/40">
            {service.reviewCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span className="font-semibold text-white/70">{service.rating.toFixed(1)}</span>
                ({service.reviewCount})
              </span>
            )}
            {service.location && (
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{service.location}</span>
            )}
            {workMode && <span>{workMode}</span>}
            {delivery && <span>Delivery {delivery}</span>}
          </div>
        )}

        {availability && (
          <span className={`mt-2 inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            service.availability === 'available'
              ? 'border-emerald-200/[0.18] bg-emerald-200/[0.10] text-emerald-200/90'
              : service.availability === 'limited'
                ? 'border-amber-200/[0.18] bg-amber-200/[0.10] text-amber-200/90'
                : 'border-white/[0.10] bg-white/[0.05] text-white/45'
          }`}>
            {availability}
          </span>
        )}

        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/[0.05] pt-2.5">
          <span className="text-[12.5px] font-bold text-white">{formatServicePrice(service)}</span>
          <Link href={detail} className="shrink-0 text-[11.5px] font-semibold text-white/50 transition hover:text-white">
            View Service →
          </Link>
        </div>

        {/* The specification requires every card to reach the provider's full
            catalogue — a real destination, so never a dead control. */}
        {service.provider && (
          <Link
            href={`/services/${service.provider.id}`}
            className="mt-2 block rounded-full border border-white/[0.10] py-1.5 text-center text-[11.5px] font-semibold text-white/60 transition hover:bg-white/[0.06] hover:text-white"
          >
            View Full Catalogue
          </Link>
        )}
      </div>
    </div>
  );
}

/* ═══ Discovery card ═══════════════════════════════════════════════════
   The /services grid card, drawn in the People page's visual language:
   a banner, an avatar overlapping its lower edge, an identity block, pill
   metadata and a stats footer. Sizes, radii, colours and breakpoints are
   taken from app/people/page.tsx so the two grids read as one product.

   The content is entirely service-specific and every existing destination
   is preserved — the card opens the service detail, and the provider name
   and the "Catalogue" action both open the provider's full catalogue. */

/* People's fallback banner palette, hashed per item so a provider's cards
   are not all the same colour when no cover image was uploaded. */
const BANNER_GRADIENTS = [
  'linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%)',
  'linear-gradient(135deg,#0d1b0d 0%,#14532d 100%)',
  'linear-gradient(135deg,#1a0d2e 0%,#4c1d95 100%)',
  'linear-gradient(135deg,#1c0a0a 0%,#7f1d1d 100%)',
  'linear-gradient(135deg,#0d1a1a 0%,#134e4a 100%)',
  'linear-gradient(135deg,#1a150d 0%,#78350f 100%)',
  'linear-gradient(135deg,#0a0d1a 0%,#1e1b4b 100%)',
  'linear-gradient(135deg,#0f0a1a 0%,#581c87 100%)',
];

/** People's avatar atom: circular ring wrapper around a squircle image. */
function DiscoveryAvatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  const [broken, setBroken] = useState(false);
  const radius = size >= 52 ? 16 : 12;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="relative w-full h-full overflow-hidden flex items-center justify-center font-bold"
        style={{
          borderRadius: radius,
          fontSize: size >= 52 ? 15 : 13,
          background: 'rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.65)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        {src && !broken
          /* eslint-disable-next-line @next/next/no-img-element */
          ? <img src={src} alt="" onError={() => setBroken(true)} className="w-full h-full object-cover" data-no-invert />
          : (name || '?').trim().charAt(0).toUpperCase()}
      </div>
    </div>
  );
}

function DiscoveryCard({ service }: { service: ServiceSummary }) {
  const router = useRouter();
  const cat = serviceCategory(service.category);

  /* Field derivation is identical to the compact card — same rules, so the
     two variants can never disagree about what a service is. */
  const cover = service.coverImageUrl || service.imageUrl;
  const identityImage = service.useMainProfileImage
    ? (service.provider?.avatarUrl ?? null)
    : (service.serviceImageUrl || service.provider?.avatarUrl || null);
  const workMode = service.workMode ? WORK_MODE_LABELS[service.workMode] : null;
  const availability = service.availability ? AVAILABILITY_LABELS[service.availability] : null;
  const delivery = formatDelivery(service.deliveryTime, service.deliveryUnit);
  const tags = (service.tags ?? []).filter(Boolean).slice(0, 3);
  const detail = serviceDetailHref(service.id);
  const catalogue = service.provider ? `/services/${service.provider.id}` : null;

  const [coverBroken, setCoverBroken] = useState(false);
  const bannerHash = Array.from(service.title).reduce((a, c) => a + c.charCodeAt(0), 0);
  const bannerStyle: React.CSSProperties = cover && !coverBroken
    ? { backgroundImage: `url(${cover})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: BANNER_GRADIENTS[bannerHash % BANNER_GRADIENTS.length] };

  const outerBorder = 'rgba(255,255,255,0.09)';
  const cardBg = '#0d0d10';
  const hoverGlow = '0 24px 72px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.4)';

  /* Availability takes the slot People gives "Open to Work" — a single
     status badge in the banner's top-right corner. */
  const availabilityStyle = service.availability === 'available'
    ? { background: 'rgba(16,185,129,0.22)', border: '1px solid rgba(16,185,129,0.35)', color: '#6ee7b7' }
    : service.availability === 'limited'
      ? { background: 'rgba(245,158,11,0.20)', border: '1px solid rgba(245,158,11,0.34)', color: '#fcd34d' }
      : { background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.62)' };

  const pillStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.50)' };

  const open = () => router.push(detail);

  /* Preloads the image only to learn whether it is usable, so a broken cover
     falls back to a gradient instead of a torn box. */
  const coverProbe = cover && !coverBroken ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={cover} alt="" onError={() => setCoverBroken(true)} className="hidden" aria-hidden data-no-invert />
  ) : null;

  const banner = (height: number, badgeTop: string) => (
    <div className="relative shrink-0 rounded-t-[19px] overflow-hidden" style={{ height, ...bannerStyle }}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,0.06) 0%,rgba(0,0,0,0.72) 100%)' }} />
      {(!cover || coverBroken) && (
        <span className="absolute inset-0 flex items-center justify-center text-3xl opacity-30" aria-hidden>{cat.icon}</span>
      )}
      {availability && (
        <span className={`absolute ${badgeTop} right-3 rounded-full px-2.5 py-1 text-[9px] font-semibold backdrop-blur-md`} style={availabilityStyle}>
          {availability}
        </span>
      )}
    </div>
  );

  const identity = (titleSize: string, taglineSize: string) => (
    <div className="mt-3 min-w-0">
      <p className={`font-bold ${titleSize} leading-snug text-white line-clamp-2`}>{service.title}</p>
      {service.tagline && (
        <p className={`${taglineSize} leading-snug truncate mt-[3px]`} style={{ color: 'rgba(255,255,255,0.45)' }}>
          {service.tagline}
        </p>
      )}
      {(service.location || workMode) && (
        <div className="flex items-center gap-1 mt-1.5 text-[10.5px]" style={{ color: 'rgba(255,255,255,0.30)' }}>
          {service.location && <MapPin className="h-2.5 w-2.5 shrink-0" />}
          <span className="truncate">{[service.location, workMode].filter(Boolean).join(' · ')}</span>
        </div>
      )}
    </div>
  );

  const pills = (size: string) => (
    <div className="flex flex-wrap gap-1.5 mt-3">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-[3.5px] ${size} font-medium ${cat.bg} ${cat.color}`}>
        <span aria-hidden>{cat.icon}</span>{cat.label}
      </span>
      {service.subcategory && (
        <span className={`rounded-full px-2.5 py-[3.5px] ${size} font-medium`} style={pillStyle}>{service.subcategory}</span>
      )}
      {tags.map(t => (
        <span key={t} className={`rounded-full px-2.5 py-[3.5px] ${size} font-medium`} style={pillStyle}>{t}</span>
      ))}
    </div>
  );

  const footer = (size: string, iconSize: string, pad: string) => (
    <div className={`flex items-center gap-3 mt-auto ${pad} ${size}`}
      style={{ borderTop: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.30)' }}>
      {service.reviewCount > 0 && (
        <span className="flex items-center gap-1">
          <Star className={`${iconSize} fill-amber-400 text-amber-400`} />
          <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.62)' }}>{service.rating.toFixed(1)}</span>
          <span className="opacity-70">({service.reviewCount})</span>
        </span>
      )}
      {delivery && <span className="truncate opacity-80">Delivery {delivery}</span>}
      <span className="ml-auto shrink-0 font-bold" style={{ color: 'rgba(255,255,255,0.92)' }}>
        {formatServicePrice(service)}
      </span>
    </div>
  );

  /* Actions mirror People's cluster: a labelled pill plus an open-arrow.
     Both are real destinations and both stop the card's own click. */
  const actions = (
    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
      {catalogue && (
        <Link
          href={catalogue}
          aria-label={`View ${service.provider!.name}'s full catalogue`}
          className="h-8 px-3 rounded-[10px] text-[11.5px] font-semibold flex items-center transition-all"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.62)' }}
        >
          Catalogue
        </Link>
      )}
      <Link
        href={detail}
        aria-label={`View service: ${service.title}`}
        className="flex items-center justify-center h-8 w-8 rounded-[10px] transition-all"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)' }}
      >
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );

  const providerLine = (size: string) =>
    service.provider && catalogue ? (
      <Link
        href={catalogue}
        onClick={(e) => e.stopPropagation()}
        className={`block ${size} font-semibold truncate transition-colors hover:text-white`}
        style={{ color: 'rgba(255,255,255,0.50)' }}
      >
        {service.provider.name}
      </Link>
    ) : null;

  /* ── Mobile card ── */
  const mobileCard = (
    <div
      className="sm:hidden cursor-pointer active:scale-[0.985] transition-transform duration-150"
      onClick={open}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
    >
      <div className="rounded-[20px] p-[1px]" style={{ background: outerBorder }}>
        <div className="rounded-[19px] flex flex-col" style={{ background: cardBg }}>
          {banner(80, 'top-2.5')}

          <div className="px-4 pb-4" style={{ marginTop: -26, position: 'relative', zIndex: 1 }}>
            <div className="flex items-end gap-3">
              <div className="shrink-0 rounded-full" style={{
                padding: 3, background: 'rgba(255,255,255,0.14)', boxShadow: '0 8px 28px rgba(0,0,0,0.55)',
              }}>
                <DiscoveryAvatar src={identityImage} name={service.provider?.name ?? service.title} size={52} />
              </div>
              <div className="flex-1 min-w-0 pb-0.5 pt-[22px]">{providerLine('text-[11.5px]')}</div>
              <div className="pb-0.5 pt-[22px]">{actions}</div>
            </div>

            {identity('text-[14.5px]', 'text-[11.5px]')}
            {pills('text-[10px]')}
            {footer('text-[11px]', 'h-3 w-3', 'pt-3')}
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Desktop grid card ── */
  const gridCard = (
    <div
      className="hidden sm:flex flex-col h-full cursor-pointer group"
      onClick={open}
      role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
    >
      <div className="rounded-[20px] p-[1px] flex-1 flex flex-col transition-all duration-300 group-hover:-translate-y-[3px]"
        style={{ background: outerBorder }}>
        <div className="rounded-[19px] flex flex-col flex-1 transition-shadow duration-300 group-hover:shadow-[var(--card-hover-glow)]"
          style={{ background: cardBg, '--card-hover-glow': hoverGlow } as React.CSSProperties}>
          {banner(104, 'top-3')}

          <div className="flex flex-col flex-1 px-4" style={{ position: 'relative', zIndex: 1 }}>
            <div className="flex items-end justify-between gap-3" style={{ marginTop: -30 }}>
              <div className="shrink-0 rounded-full" style={{
                padding: 3, background: 'rgba(255,255,255,0.14)', boxShadow: '0 10px 30px rgba(0,0,0,0.50)',
              }}>
                <DiscoveryAvatar src={identityImage} name={service.provider?.name ?? service.title} size={58} />
              </div>
              <div className="pb-[3px]">{actions}</div>
            </div>

            <div className="mt-2.5 min-w-0">{providerLine('text-[11px]')}</div>
            {identity('text-[14.5px]', 'text-[12px]')}
            {pills('text-[9.5px]')}
            {footer('text-[10.5px]', 'h-2.5 w-2.5', 'pt-3 pb-4')}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {coverProbe}
      {mobileCard}
      {gridCard}
    </>
  );
}

/* ─── Public entry point ─────────────────────────────────────────────── */
export function ServiceSummaryCard({
  service, variant = 'compact',
}: {
  service: ServiceSummary;
  variant?: 'compact' | 'discovery';
}) {
  return variant === 'discovery' ? <DiscoveryCard service={service} /> : <CompactCard service={service} />;
}
