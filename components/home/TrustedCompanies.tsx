'use client';

/**
 * The company marquee above the homepage greeting.
 *
 * NO CAPTION BY DEFAULT — the row carries no heading text; the logos and names
 * are the message. Super Admin can still set one in the homepage config and it
 * renders above the row.
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
import { logoKey } from '@/lib/company-logos';
import { cachedJson } from '@/lib/client/request-cache';

export type TrustedCompany = {
  id: string;
  name: string;
  logoUrl: string;
  href: string;
  visible: boolean;
};

export type HiringCompany = { name: string; logoUrl: string; jobCount: number };

/* One element, not two nested ones. The outer wrapper and the inner row carried
   the same flex/shrink rules, so every mark cost a redundant span — 26 across
   the duplicated track. Merging them changes nothing visually: the merged class
   list is exactly the union the browser was already computing. */
const MARK = 'group/mark flex shrink-0 items-center gap-2.5';
const CHIP = 'flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-[8px] border border-white/[0.09] bg-white/[0.06] sm:h-8 sm:w-8';
const LABEL = 'whitespace-nowrap text-[15px] font-bold tracking-[-0.01em] text-white/70 transition-colors group-hover/mark:text-white/90 sm:text-[17px]';

function CompanyMark({ company, priority }: { company: TrustedCompany; priority: boolean }) {
  const [failed, setFailed] = useState(false);
  const showLogo = Boolean(company.logoUrl) && !failed;

  const body = (
    <>
      {showLogo && (
        <span className={CHIP}>
          {/* Intrinsic size matches the chip, so the row reserves its space
              before the logo arrives — a slow or failed logo cannot reflow the
              marquee mid-animation.

              The FIRST copy of the row is the one on screen at the top of the
              page, so it loads eagerly: `lazy` there defers an above-the-fold
              image until layout and makes the row pop in late. The duplicate is
              off-screen, so it stays lazy — and since both copies point at the
              same URL it costs no extra request either way. Low priority keeps
              logos from competing with more important resources. */}
          <img
            src={company.logoUrl}
            alt=""
            aria-hidden
            width={32}
            height={32}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority="low"
            decoding="async"
            onError={() => setFailed(true)}
            className="h-full w-full object-contain p-1"
          />
        </span>
      )}
      <span className={LABEL}>{company.name}</span>
    </>
  );

  if (!company.href) return <span className={MARK}>{body}</span>;
  return (
    <a href={company.href} target="_blank" rel="noopener noreferrer nofollow"
      aria-label={company.name} className={MARK}>
      {body}
    </a>
  );
}

export default function TrustedCompanies({
  label,
  items,
  autoFromJobs = true,
  initialCompanies = null,
}: {
  label: string;
  items: TrustedCompany[];
  /** Pull the employers currently posting jobs in behind the pinned list. */
  autoFromJobs?: boolean;
  /* Seeded by the server when the derived list was already warm there. The row
     then paints on first render instead of after a round trip — and this
     component skips its fetch entirely. Null means "not available cheaply", so
     the client fetch runs exactly as before. */
  initialCompanies?: HiringCompany[] | null;
}) {
  const [hiring, setHiring] = useState<HiringCompany[]>(initialCompanies ?? []);

  useEffect(() => {
    if (!autoFromJobs || initialCompanies) return;
    let active = true;
    cachedJson<{ companies?: HiringCompany[] }>('/api/public/hiring-companies')
      .then((data) => {
        if (active && Array.isArray(data?.companies)) setHiring(data.companies);
      })
      .catch(() => { /* the pinned list still renders on its own */ });
    return () => { active = false; };
  }, [autoFromJobs, initialCompanies]);

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

  const row = (duplicate: boolean) => (
    <div
      className={`flex shrink-0 items-center gap-8 pr-8 sm:gap-12 sm:pr-12${duplicate ? ' tc-dup' : ''}`}
      aria-hidden={duplicate || undefined}
    >
      {companies.map((c) => (
        <CompanyMark key={`${duplicate ? 'b' : 'a'}-${c.id}`} company={c} priority={!duplicate} />
      ))}
    </div>
  );

  return (
    <section aria-label={label || 'Companies hiring on Docrud'} className="w-full min-w-0">
      <style>{`
        @keyframes tc-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        /* transform only — the compositor handles it, so the loop never
           triggers layout or paint on the rest of the page. */
        .tc-track { animation: tc-marquee 32s linear infinite; will-change: transform; }
        .tc-viewport:hover .tc-track { animation-play-state: paused; }
        /* Scope the marquee's own paint/layout work so it cannot invalidate
           anything outside this box while it scrolls. */
        .tc-viewport { contain: layout paint; }
        @media (prefers-reduced-motion: reduce) {
          .tc-track { animation: none; }
          /* Nothing scrolls, so the second copy exists only to make the loop
             seamless — with the animation off it is dead DOM and dead image
             decodes. Halves the row for anyone on reduced motion. */
          .tc-dup { display: none; }
        }
      `}</style>

      {label && (
        <p className="mb-3 flex items-center justify-center gap-1.5 text-center text-[11.5px] font-medium text-white/32">
          {label}
        </p>
      )}

      {/* `flex-1`/`min-w-0` are gone with the flex row that held the icons —
          a block viewport simply fills the full width. */}
      <div className="tc-viewport relative overflow-hidden">
          {/* Edge fades, so marks enter and leave instead of being cut off.

              The colour must be the page's own background. It was #08080A
              while the homepage shell paints #0D0D0F, so the gradient ran to a
              colour DARKER than the page: instead of dissolving, a mark walked
              into a dark smudge and then stopped, which read as a hard cut at
              both ends. Same value as the shell (and globals.css's html
              background), so the fade now resolves into the page exactly.

              Kept as fixed overlays on the viewport, not on the track — they
              must stay at the edges while the marks travel underneath. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[#0D0D0F] to-transparent sm:w-16" aria-hidden />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#0D0D0F] to-transparent sm:w-16" aria-hidden />
          <div className="flex w-max">
            <div className="tc-track flex w-max">
              {row(false)}
              {/* The duplicate is what makes -50% land exactly on the seam. */}
              {row(true)}
            </div>
          </div>
      </div>
    </section>
  );
}
