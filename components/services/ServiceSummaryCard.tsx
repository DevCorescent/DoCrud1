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
import { Star } from 'lucide-react';
import { serviceCategory, formatServicePrice, serviceDetailHref } from '@/lib/services-ui';

export type ServiceSummary = {
  id: string;
  title: string;
  tagline: string;
  category: string;
  pricingModel: string;
  basePrice: number;
  currency: string;
  imageUrl: string | null;
  rating: number;
  reviewCount: number;
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

function ProviderAvatar({ src, name }: { src: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[9px] font-bold text-white/55 ring-1 ring-white/[0.07]">
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
      className="h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-white/[0.07]"
      data-no-invert
    />
  );
}

export function ServiceSummaryCard({ service }: { service: ServiceSummary }) {
  const cat = serviceCategory(service.category);
  return (
    <div className="group flex flex-col overflow-hidden rounded-[20px] border border-white/[0.07] bg-[#0d0d10] transition hover:border-white/[0.14]">
      <Link href={serviceDetailHref(service.id)} className="block">
        <CardImage src={service.imageUrl} category={service.category} alt={service.title} />
      </Link>

      <div className="flex flex-1 flex-col p-3.5">
        <Link href={serviceDetailHref(service.id)} className="block">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cat.bg} ${cat.color}`}>
            <span aria-hidden>{cat.icon}</span>{cat.label}
          </span>
          <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-snug text-white/90">{service.title}</p>
          {service.tagline && (
            <p className="mt-1 line-clamp-1 text-[11.5px] text-white/40">{service.tagline}</p>
          )}
        </Link>

        {/* Provider is its own link so the card can reach the catalogue
            without nesting an anchor inside the service link. */}
        {service.provider && (
          <Link
            href={`/services/${service.provider.id}`}
            className="mt-2.5 inline-flex min-w-0 items-center gap-1.5 text-[11.5px] text-white/45 transition hover:text-white/80"
          >
            <ProviderAvatar src={service.provider.avatarUrl} name={service.provider.name} />
            <span className="truncate">{service.provider.name}</span>
          </Link>
        )}

        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/[0.05] pt-2.5">
          <span className="text-[12.5px] font-bold text-white">{formatServicePrice(service)}</span>
          {/* Ratings appear only once a service has been reviewed. */}
          {service.reviewCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-white/40">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-white/70">{service.rating.toFixed(1)}</span>
              ({service.reviewCount})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
