'use client';

/**
 * Service detail.
 *
 * Lives at /services/s/[serviceId] rather than /services/[serviceId] because
 * the single-segment slot under /services is already the provider catalogue
 * (/services/[userId]); two dynamic segments cannot share one level. The
 * identifier here is always the service id, never the provider's.
 *
 * Everything on the page comes from one request to /api/services/detail —
 * service, provider identity and the provider's other services — so there is
 * no per-field or per-related-service fetch.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, MapPin, Star, Clock, CalendarDays, Layers, ChevronDown } from 'lucide-react';
import { serviceCategory, formatServicePrice, formatDelivery, currencySymbol } from '@/lib/services-ui';
import { ServiceSummaryCard } from '@/components/services/ServiceSummaryCard';
import { EnquireDialog } from '@/components/services/EnquireDialog';
import { BookServiceDialog } from '@/components/services/BookServiceDialog';

type Pkg = {
  name: string; description: string; price: number;
  deliveryTime: number; deliveryUnit: string; features: string[];
};

type Detail = {
  service: {
    id: string; title: string; tagline: string; description: string;
    category: string; subcategory: string | null; tags: string[];
    pricingModel: string; basePrice: number; currency: string;
    packages: Pkg[] | null;
    deliveryTime: number | null; deliveryUnit: string | null;
    imageUrl: string | null; gallery: string[] | null;
    coverImageUrl: string | null; serviceImageUrl: string | null; useMainProfileImage: boolean;
    location: string | null; workMode: string | null; availability: string | null;
    faqs: Array<{ question: string; answer: string }> | null;
    featured: boolean; rating: number; reviewCount: number;
    bookingCount: number; createdAt: string;
  };
  provider: {
    id: string; name: string; avatarUrl: string | null;
    headline: string | null; bio: string | null; location: string | null;
    memberSince: string | null; activeServiceCount: number;
    rating: number | null; reviewCount: number; completedBookings: number;
  };
  otherServices: Array<{
    id: string; title: string; tagline: string; category: string; subcategory: string | null;
    pricingModel: string; basePrice: number; currency: string;
    imageUrl: string | null; coverImageUrl: string | null;
    serviceImageUrl: string | null; useMainProfileImage: boolean;
    location: string | null; workMode: string | null; availability: string | null;
    rating: number; reviewCount: number;
  }>;
};

/* Same avatar treatment the rest of Docrud uses: photo when there is one,
   initial when there is not, initial again if the photo fails to load. */
function Avatar({ src, name, size = 56 }: { src: string | null; name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const style = { width: size, height: size };
  if (!src || broken) {
    return (
      <div
        style={style}
        className="flex shrink-0 items-center justify-center rounded-full bg-white/[0.08] font-bold text-white/55 ring-1 ring-white/[0.07]"
      >
        <span style={{ fontSize: size * 0.4 }}>{initial}</span>
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt={name}
      style={style}
      onError={() => setBroken(true)}
      className="shrink-0 rounded-full object-cover ring-1 ring-white/[0.07]"
      data-no-invert
    />
  );
}

/* Fixed aspect box so the layout does not shift while an image loads, and a
   category-tinted placeholder when there is no image at all. */
function ServiceImage({ src, category, alt, className = '' }: { src: string | null; category: string; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const cat = serviceCategory(category);
  if (!src || broken) {
    return (
      <div className={`flex items-center justify-center bg-white/[0.03] ${className}`}>
        <span className="text-3xl opacity-40">{cat.icon}</span>
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} alt={alt} onError={() => setBroken(true)} className={`object-cover ${className}`} data-no-invert />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-white/[0.07] bg-[#0d0d10] p-5">
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">{title}</h2>
      {children}
    </section>
  );
}

export default function ServiceDetailPage() {
  const params = useParams();
  const serviceId = String(params?.serviceId ?? '');

  const [data, setData] = useState<Detail | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notfound' | 'error'>('loading');
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [enquireOpen, setEnquireOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch(`/api/services/detail?serviceId=${encodeURIComponent(serviceId)}`);
      if (res.status === 404) { setState('notfound'); return; }
      if (!res.ok) { setState('error'); return; }
      const json = (await res.json()) as Detail;
      setData(json);
      setActiveImage(json.service.coverImageUrl ?? json.service.imageUrl ?? json.service.gallery?.[0] ?? null);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [serviceId]);

  useEffect(() => { if (serviceId) void load(); }, [serviceId, load]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-[#0A0A0C] px-4 py-10">
        <div className="mx-auto max-w-5xl animate-pulse space-y-4">
          <div className="h-64 rounded-[20px] bg-white/[0.04]" />
          <div className="h-6 w-2/3 rounded bg-white/[0.04]" />
          <div className="h-24 rounded-[20px] bg-white/[0.04]" />
        </div>
      </div>
    );
  }

  if (state === 'notfound' || state === 'error') {
    const missing = state === 'notfound';
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0C] px-6 text-center text-white">
        <div className="max-w-sm">
          <p className="text-base font-semibold">{missing ? 'Service not found' : 'Could not load this service'}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-white/40">
            {missing
              ? 'This service may have been removed or is no longer available.'
              : 'Something went wrong loading this page.'}
          </p>
          {missing
            ? <Link href="/people" className="mt-4 inline-block text-sm text-white/40 underline hover:text-white">← Back to Docrud</Link>
            : <button type="button" onClick={() => void load()} className="mt-4 rounded-full bg-white px-4 py-2 text-[12px] font-bold text-[#0D0D0F] hover:bg-white/90">Try again</button>}
        </div>
      </div>
    );
  }

  if (!data) return null;
  const { service: s, provider: p, otherServices } = data;
  const cat = serviceCategory(s.category);
  const delivery = formatDelivery(s.deliveryTime, s.deliveryUnit);
  const catalogueHref = `/services/${p.id}`;
  const gallery = [s.coverImageUrl, s.imageUrl, ...(s.gallery ?? [])]
    .filter((u): u is string => Boolean(u))
    .filter((u, i, a) => a.indexOf(u) === i);
  const WORK_MODES: Record<string, string> = { remote: 'Remote', onsite: 'On-site', hybrid: 'Hybrid' };
  const AVAILABILITY: Record<string, string> = {
    available: 'Available now', limited: 'Limited availability', unavailable: 'Not taking work',
  };
  /* Service-specific image unless the provider opted into their main photo. */
  const identityImage = s.useMainProfileImage ? p.avatarUrl : (s.serviceImageUrl || p.avatarUrl);
  const memberSince = p.memberSince
    ? new Date(p.memberSince).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-white">
      {/* Sticky header — same 56px bar height the rest of the product uses. */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0A0A0C]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href={catalogueHref} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white/50 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Catalogue
          </Link>
          <span className="ml-auto truncate text-[12.5px] text-white/30">{cat.label}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Desktop: media + content left, provider/pricing rail right. */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-5">
            {/* ── media ── */}
            <div className="overflow-hidden rounded-[20px] border border-white/[0.07] bg-[#0d0d10]">
              <ServiceImage src={activeImage} category={s.category} alt={s.title} className="h-56 w-full sm:h-80" />
              {gallery.length > 1 && (
                <div className="flex gap-2 overflow-x-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {gallery.map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setActiveImage(url)}
                      aria-label="Show image"
                      className={`h-14 w-20 shrink-0 overflow-hidden rounded-lg border transition ${
                        activeImage === url ? 'border-white/40' : 'border-white/[0.08] hover:border-white/20'
                      }`}
                    >
                      <ServiceImage src={url} category={s.category} alt="" className="h-full w-full" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── title + identity ── */}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cat.bg} ${cat.color}`}>
                  <span aria-hidden>{cat.icon}</span>{cat.label}
                </span>
                {s.subcategory && (
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-white/55">
                    {s.subcategory}
                  </span>
                )}
                {s.featured && (
                  <span className="rounded-full border border-amber-200/[0.18] bg-amber-200/[0.10] px-2.5 py-0.5 text-[11px] font-semibold text-amber-200/90">
                    Featured
                  </span>
                )}
                {s.reviewCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[12px] text-white/50">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="font-semibold text-white/80">{s.rating.toFixed(1)}</span>
                    <span className="text-white/35">({s.reviewCount})</span>
                  </span>
                )}
                {/* Shown only when the provider actually supplied them. */}
                {s.location && (
                  <span className="inline-flex items-center gap-1 text-[12px] text-white/50">
                    <MapPin className="h-3.5 w-3.5" />{s.location}
                  </span>
                )}
                {s.workMode && WORK_MODES[s.workMode] && (
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-white/55">
                    {WORK_MODES[s.workMode]}
                  </span>
                )}
                {s.availability && AVAILABILITY[s.availability] && (
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                    s.availability === 'available'
                      ? 'border-emerald-200/[0.18] bg-emerald-200/[0.10] text-emerald-200/90'
                      : s.availability === 'limited'
                        ? 'border-amber-200/[0.18] bg-amber-200/[0.10] text-amber-200/90'
                        : 'border-white/[0.10] bg-white/[0.05] text-white/45'
                  }`}>{AVAILABILITY[s.availability]}</span>
                )}
              </div>

              <h1 className="mt-2.5 text-[22px] font-bold leading-tight tracking-[-0.02em] sm:text-[26px]">{s.title}</h1>
              {s.tagline && <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/50">{s.tagline}</p>}

              <Link href={catalogueHref} className="mt-3.5 inline-flex items-center gap-2.5 rounded-full border border-white/[0.07] bg-white/[0.02] py-1.5 pl-1.5 pr-4 transition hover:border-white/[0.14] hover:bg-white/[0.05]">
                <Avatar src={identityImage} name={p.name} size={28} />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold text-white/85">{p.name}</span>
                  {p.headline && <span className="block truncate text-[11px] text-white/35">{p.headline}</span>}
                </span>
              </Link>

              {s.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.tags.map((t) => (
                    <span key={t} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-white/50">{t}</span>
                  ))}
                </div>
              )}
            </div>

            {s.description && (
              <Section title="About this service">
                <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-white/60">{s.description}</p>
              </Section>
            )}

            {/* Packages render only when the provider actually created them.
               The section is absent otherwise — never an empty Basic/Standard/Premium shell. */}
            {s.packages && (
              <Section title="Packages">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {s.packages.map((pkg) => (
                    <div key={pkg.name} className="rounded-[14px] border border-white/[0.07] bg-white/[0.02] p-4">
                      <p className="text-[13px] font-bold text-white">{pkg.name}</p>
                      <p className="mt-1 text-[17px] font-bold tracking-[-0.02em] text-white">
                        {currencySymbol(s.currency)}{pkg.price.toLocaleString()}
                      </p>
                      {pkg.description && <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/45">{pkg.description}</p>}
                      {pkg.deliveryTime > 0 && (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-white/45">
                          <Clock className="h-3.5 w-3.5" />{pkg.deliveryTime} {pkg.deliveryUnit} delivery
                        </p>
                      )}
                      {pkg.features?.length > 0 && (
                        <ul className="mt-2.5 space-y-1">
                          {pkg.features.map((f) => (
                            <li key={f} className="flex gap-1.5 text-[11.5px] leading-relaxed text-white/55">
                              <span className="text-white/25">·</span>{f}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {s.faqs && (
              <Section title="FAQs">
                <div className="divide-y divide-white/[0.06]">
                  {s.faqs.map((f, i) => (
                    <div key={f.question} className="py-2.5 first:pt-0 last:pb-0">
                      <button
                        type="button"
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        aria-expanded={openFaq === i}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <span className="text-[13px] font-semibold text-white/80">{f.question}</span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-white/30 transition ${openFaq === i ? 'rotate-180' : ''}`} />
                      </button>
                      {openFaq === i && <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-white/50">{f.answer}</p>}
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* ── right rail: pricing + provider ── */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-[20px] border border-white/[0.07] bg-[#0d0d10] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Pricing</p>
              <p className="mt-1.5 text-[24px] font-bold tracking-[-0.02em]">{formatServicePrice(s)}</p>
              {delivery && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-white/50">
                  <Clock className="h-3.5 w-3.5" />Delivery in {delivery}
                </p>
              )}
              {/* Two distinct choices: ask a question, or propose work. */}
              <button
                type="button"
                onClick={() => setBookOpen(true)}
                className="mt-4 w-full rounded-full bg-white px-4 py-2.5 text-[12.5px] font-bold text-[#0D0D0F] transition hover:bg-white/90"
              >
                Book Service
              </button>
              <button
                type="button"
                onClick={() => setEnquireOpen(true)}
                className="mt-2 w-full rounded-full border border-white/[0.12] bg-white/[0.03] px-4 py-2.5 text-[12.5px] font-bold text-white/75 transition hover:bg-white/[0.07]"
              >
                Enquire
              </button>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-white/30">
                Booking requests are confirmed by the provider. Nothing is charged.
              </p>
            </div>

            <div className="rounded-[20px] border border-white/[0.07] bg-[#0d0d10] p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Provider</p>
              <div className="mt-3 flex items-center gap-3">
                <Avatar src={p.avatarUrl} name={p.name} size={48} />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold">{p.name}</p>
                  {p.headline && <p className="truncate text-[11.5px] text-white/40">{p.headline}</p>}
                </div>
              </div>

              {p.bio && <p className="mt-3 line-clamp-4 text-[12.5px] leading-relaxed text-white/50">{p.bio}</p>}

              <div className="mt-3 space-y-1.5">
                {p.location && (
                  <p className="inline-flex items-center gap-1.5 text-[12px] text-white/45"><MapPin className="h-3.5 w-3.5" />{p.location}</p>
                )}
                {memberSince && (
                  <p className="inline-flex items-center gap-1.5 text-[12px] text-white/45"><CalendarDays className="h-3.5 w-3.5" />Member since {memberSince}</p>
                )}
                <p className="inline-flex items-center gap-1.5 text-[12px] text-white/45">
                  <Layers className="h-3.5 w-3.5" />{p.activeServiceCount} active {p.activeServiceCount === 1 ? 'service' : 'services'}
                </p>
                {p.rating !== null && (
                  <p className="inline-flex items-center gap-1.5 text-[12px] text-white/45">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {p.rating.toFixed(1)} across {p.reviewCount} {p.reviewCount === 1 ? 'review' : 'reviews'}
                  </p>
                )}
              </div>

              <Link
                href={catalogueHref}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-[12.5px] font-bold text-[#0D0D0F] transition hover:bg-white/90"
              >
                View Full Catalogue <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </aside>
        </div>

        {/* The specification asks for an explicit message here rather than a
            silently missing section. */}
        {otherServices.length === 0 && (
          <p className="mt-6 rounded-[20px] border border-white/[0.07] bg-[#0d0d10] px-5 py-6 text-center text-[12.5px] text-white/40">
            This is currently the only service offered by this provider.
          </p>
        )}

        {/* ── other services by the same provider ── */}
        {otherServices.length > 0 && (
          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-bold tracking-[-0.01em]">More from {p.name}</h2>
              <Link href={catalogueHref} className="shrink-0 text-[12px] font-semibold text-white/40 transition hover:text-white">View all →</Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {otherServices.map((o) => (
                <ServiceSummaryCard key={o.id} service={o} />
              ))}
            </div>
          </section>
        )}
      </main>

      {bookOpen && (
        <BookServiceDialog
          serviceId={s.id}
          serviceTitle={s.title}
          providerName={p.name}
          packages={s.packages}
          pricing={{ pricingModel: s.pricingModel, basePrice: s.basePrice, currency: s.currency }}
          onClose={() => setBookOpen(false)}
        />
      )}

      {enquireOpen && (
        <EnquireDialog
          serviceId={s.id}
          serviceTitle={s.title}
          providerName={p.name}
          onClose={() => setEnquireOpen(false)}
        />
      )}
    </div>
  );
}
