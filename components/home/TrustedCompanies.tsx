'use client';

/**
 * "Top companies trust docrud" — the marquee above the homepage greeting.
 *
 * The label and every company come from the Super Admin homepage config
 * (`trustedCompanies`), so the row is edited from the panel and never from
 * this file. A company renders its uploaded logo when it has one and its name
 * as a wordmark when it does not — a missing logo is a real state, not a
 * broken image.
 *
 * The track is duplicated once and translated by exactly -50%, so the loop is
 * seamless whatever the row's width. It pauses on hover and honours
 * prefers-reduced-motion.
 */

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

export type TrustedCompany = {
  id: string;
  name: string;
  logoUrl: string;
  href: string;
  visible: boolean;
};

function CompanyMark({ company }: { company: TrustedCompany }) {
  const [failed, setFailed] = useState(false);

  const body = company.logoUrl && !failed ? (
    <img
      src={company.logoUrl}
      alt={company.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-5 w-auto max-w-[112px] object-contain opacity-80 transition-opacity hover:opacity-100 sm:h-6"
    />
  ) : (
    <span className="whitespace-nowrap text-[15px] font-bold tracking-[-0.01em] text-white/70 transition-colors hover:text-white/90 sm:text-[17px]">
      {company.name}
    </span>
  );

  if (!company.href) return <span className="flex shrink-0 items-center">{body}</span>;
  return (
    <a href={company.href} target="_blank" rel="noopener noreferrer nofollow"
      aria-label={company.name} className="flex shrink-0 items-center">
      {body}
    </a>
  );
}

export default function TrustedCompanies({
  label,
  items,
}: {
  label: string;
  items: TrustedCompany[];
}) {
  const companies = (items ?? []).filter((c) => c && c.visible !== false && (c.name || c.logoUrl));
  // No configured companies is a real state: the row simply does not render.
  if (companies.length === 0) return null;

  const row = (ariaHidden: boolean) => (
    <div className="flex shrink-0 items-center gap-8 pr-8 sm:gap-12 sm:pr-12" aria-hidden={ariaHidden || undefined}>
      {companies.map((c) => <CompanyMark key={`${ariaHidden ? 'b' : 'a'}-${c.id}`} company={c} />)}
    </div>
  );

  return (
    <section aria-label={label} className="w-full min-w-0">
      <style>{`
        @keyframes tc-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .tc-track { animation: tc-marquee 32s linear infinite; will-change: transform; }
        .tc-viewport:hover .tc-track { animation-play-state: paused; }
        @media (prefers-reduced-motion: reduce) { .tc-track { animation: none; } }
      `}</style>

      {label && (
        <p className="mb-3 flex items-center justify-center gap-1.5 text-center text-[11.5px] font-medium text-white/32">
          {label}
        </p>
      )}

      <div className="relative flex items-center gap-2">
        <Sparkles className="hidden h-3.5 w-3.5 shrink-0 text-amber-300/60 sm:block" aria-hidden />

        <div className="tc-viewport relative min-w-0 flex-1 overflow-hidden">
          {/* Edge fades, so marks enter and leave instead of being cut off. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[#08080A] to-transparent" aria-hidden />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#08080A] to-transparent" aria-hidden />
          <div className="flex w-max">
            <div className="tc-track flex w-max">
              {row(false)}
              {/* The duplicate is what makes -50% land exactly on the seam. */}
              {row(true)}
            </div>
          </div>
        </div>

        <Sparkles className="hidden h-3.5 w-3.5 shrink-0 text-amber-300/60 sm:block" aria-hidden />
      </div>
    </section>
  );
}
