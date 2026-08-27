'use client';

/**
 * "Top companies trust docrud" — the marquee above the homepage greeting.
 *
 * WHERE THE COMPANIES COME FROM: by default, the employers actually posting on
 * Docrud (/api/public/hiring-companies, derived from published hiring jobs), so
 * the row names real brands with live roles rather than a hardcoded list. Super
 * Admin can pin extra companies in the homepage config; pinned ones lead the
 * row and the live employers follow, de-duplicated by name.
 *
 * EACH MARK IS LOGO + NAME, scrolling together as one unit — the logo alone is
 * unreadable at this size for the many employers with no vendored asset, and a
 * verified logo beside its own name is what makes the row read as authentic. A
 * company with no logo shows its name alone; nothing is guessed and no broken
 * image is ever rendered.
 *
 * The track is duplicated once and translated by exactly -50%, so the loop is
 * seamless whatever the row's width. It pauses on hover and honours
 * prefers-reduced-motion.
 */

import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { logoKey } from '@/lib/company-logos';

export type TrustedCompany = {
  id: string;
  name: string;
  logoUrl: string;
  href: string;
  visible: boolean;
};

type HiringCompany = { name: string; logoUrl: string; jobCount: number };

function CompanyMark({ company }: { company: TrustedCompany }) {
  const [failed, setFailed] = useState(false);
  const showLogo = Boolean(company.logoUrl) && !failed;

  const body = (
    <span className="flex shrink-0 items-center gap-2.5">
      {showLogo && (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-white/[0.09] bg-white/[0.06] sm:h-8 sm:w-8">
          <img
            src={company.logoUrl}
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain p-1"
          />
        </span>
      )}
      <span className="whitespace-nowrap text-[15px] font-bold tracking-[-0.01em] text-white/70 transition-colors group-hover/mark:text-white/90 sm:text-[17px]">
        {company.name}
      </span>
    </span>
  );

  if (!company.href) return <span className="group/mark flex shrink-0 items-center">{body}</span>;
  return (
    <a href={company.href} target="_blank" rel="noopener noreferrer nofollow"
      aria-label={company.name} className="group/mark flex shrink-0 items-center">
      {body}
    </a>
  );
}

export default function TrustedCompanies({
  label,
  items,
  autoFromJobs = true,
}: {
  label: string;
  items: TrustedCompany[];
  /** Pull the employers currently posting jobs in behind the pinned list. */
  autoFromJobs?: boolean;
}) {
  const [hiring, setHiring] = useState<HiringCompany[]>([]);

  useEffect(() => {
    if (!autoFromJobs) return;
    let active = true;
    fetch('/api/public/hiring-companies', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && Array.isArray(data?.companies)) setHiring(data.companies);
      })
      .catch(() => { /* the pinned list still renders on its own */ });
    return () => { active = false; };
  }, [autoFromJobs]);

  const companies = useMemo(() => {
    const pinned = (items ?? []).filter((c) => c && c.visible !== false && (c.name || c.logoUrl));
    const seen = new Set(pinned.map((c) => logoKey(c.name)).filter(Boolean));

    const live: TrustedCompany[] = hiring
      .filter((c) => c?.name && !seen.has(logoKey(c.name)))
      .map((c) => ({ id: `hiring-${logoKey(c.name)}`, name: c.name, logoUrl: c.logoUrl, href: '', visible: true }));

    return [...pinned, ...live];
  }, [items, hiring]);

  // Nothing pinned and nobody hiring is a real state: the row does not render.
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
