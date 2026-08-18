'use client';

/**
 * The one compact service card.
 *
 * Extracted from the service detail page's "More from this provider" strip so
 * discovery and detail render the same card instead of drifting into two
 * designs. Provider identity is optional: the detail page already names the
 * provider above the strip, discovery needs it on every card.
 *
 * Every field is rendered only when it actually exists on the Service record —
 * there are no placeholder ratings, booking counts or availability lines.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Star, MapPin } from 'lucide-react';
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

export function ServiceSummaryCard({ service }: { service: ServiceSummary }) {
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
