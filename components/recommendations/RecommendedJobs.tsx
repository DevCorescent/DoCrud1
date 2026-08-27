'use client';

/**
 * Recommended jobs — a feed item.
 *
 * Uses the existing /api/public/hiring/jobs data and the existing /jobs/[id]
 * route. No new job system, no new API. Ranking prefers overlap between the
 * role and the viewer's own headline/skills when the profile provides them;
 * otherwise the most recent openings are shown.
 *
 * BACKGROUND IS APPROVED AND FROZEN. The warm cream→peach band matches a
 * reference the user signed off on. It is a SQUARE-CORNERED full-width band, not
 * a rounded card and not a floating panel — no radius, no outer shadow. Do not
 * recolour, round, or "improve" it, including from a later screenshot showing
 * something else; only an explicit override reopens it.
 *
 * The cards keep an opaque #141416 (the value their translucent fill already
 * resolved to over the feed ground) so they stay unambiguously dark against the
 * warm band instead of absorbing its colour.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Briefcase, MapPin } from 'lucide-react';
import { getCompanyLogo } from '@/lib/company-logos';
import { companyHue } from '@/lib/jobs-ui';

type PublicJob = {
  id: string;
  title?: string;
  organizationName?: string;
  location?: string;
  employmentType?: string;
  createdAt?: string;
  /** Present only when the viewer has a profile; computed server-side. */
  matchScore?: number;
  matchReasons?: string[];
};

/**
 * The employer's real mark, by exactly the rules the rest of the jobs surface
 * uses: the verified logo from the curated registry when there is one, the
 * company's initials on a stable hued chip when there is not. Never a guessed
 * logo, never a broken image.
 */
function CompanyMark({ company }: { company: string }) {
  const logo = getCompanyLogo(company);
  const [failed, setFailed] = useState(false);
  const box = 'h-5 w-5 shrink-0 overflow-hidden rounded-[6px]';

  if (logo && !failed) {
    return (
      <span className={`${box} flex items-center justify-center border border-white/[0.10] bg-white/[0.06]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo.src} alt="" aria-hidden width={20} height={20}
          loading="lazy" decoding="async" onError={() => setFailed(true)}
          className="h-full w-full object-contain p-[2px]" />
      </span>
    );
  }

  const initials = company.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'C';
  const hue = companyHue(company);
  return (
    <span className={`${box} flex items-center justify-center text-[8.5px] font-bold`} aria-hidden
      style={{
        background: `hsl(${hue} 45% 18%)`,
        border: `1px solid hsl(${hue} 45% 32% / 0.5)`,
        color: `hsl(${hue} 60% 78%)`,
      }}>
      {initials}
    </span>
  );
}

export default function RecommendedJobs() {
  const [jobs, setJobs] = useState<PublicJob[] | null>(null);
  const fetched = useRef(false);

  /* One request. Ranking and the card cap are decided server-side from the
     viewer's profile and the Superadmin-configured weights. */
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    fetch('/api/recommendations/jobs')
      .then((r) => (r.ok ? r.json() : { jobs: [] }))
      .then((d: { jobs?: PublicJob[] }) => setJobs(Array.isArray(d.jobs) ? d.jobs : []))
      .catch(() => setJobs([]));   // a failing jobs service must not break the feed
  }, []);

  if (!jobs || jobs.length === 0) return null;

  return (
    <section
      className="relative overflow-hidden px-3 py-3.5"
      style={{
        /* Warm cream easing into peach — a gradient, not a flat fill, so the
           band has direction instead of reading as a block of colour. */
        background: 'linear-gradient(163deg, #FBE8D5 0%, #F9DEC4 34%, #F6CCA4 70%, #F2BE91 100%)',
        /* Bright inner lip along the top edge; no outer shadow, which would
           read as a floating card and this band is deliberately not one. */
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.55)',
      }}
      aria-label="Recommended jobs"
    >
      {/* Warm halo behind the cards plus two soft corner highlights — what gives
          the band depth instead of a flat wash. Decorative, never interactive.
          `overflow-hidden` on the section clips it to the band's own box; it is
          not there to round anything, and the section stays square-cornered. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 70% at 50% 58%, rgba(238,146,74,0.30) 0%, rgba(238,146,74,0.10) 45%, transparent 72%),'
            + 'radial-gradient(38% 26% at 88% 10%, rgba(255,255,255,0.55) 0%, transparent 70%),'
            + 'radial-gradient(42% 30% at 92% 88%, rgba(255,255,255,0.38) 0%, transparent 72%)',
        }}
      />

      <div className="relative mb-2.5 flex items-center justify-between px-0.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.10em] text-[#3B2517]">
          <Briefcase className="h-3 w-3" /> Recommended jobs
        </span>
        <Link href="/jobs" className="text-[11px] font-semibold text-[#D2691E] transition-colors hover:text-[#B4551A]">
          See all
        </Link>
      </div>

      {/* Responsive grid — fluid cards so nothing is clipped on mobile. */}
      <div className="relative grid grid-cols-2 gap-2 sm:grid-cols-3">
        {jobs.map((j) => (
          <Link
            key={j.id}
            href={`/jobs/${j.id}`}
            className="flex min-w-0 flex-col rounded-2xl border border-white/[0.08] bg-[#141416] p-3 transition-colors hover:border-white/[0.14]"
          >
            {typeof j.matchScore === 'number' && j.matchScore > 0 && (
              <span className="mb-1.5 inline-flex w-fit items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                {j.matchScore}% match
              </span>
            )}
            <span className="line-clamp-2 text-[12.5px] font-bold text-white/90">{j.title || 'Open role'}</span>
            <span className="mt-1 flex min-w-0 items-center gap-1.5">
              <CompanyMark company={j.organizationName || 'Docrud'} />
              <span className="line-clamp-1 text-[11px] font-medium text-white/45">{j.organizationName || 'Docrud'}</span>
            </span>
            {j.matchReasons && j.matchReasons.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {j.matchReasons.slice(0, 2).map((reason) => (
                  <li key={reason} className="flex items-center gap-1 text-[10px] text-white/40">
                    <span aria-hidden className="text-emerald-400">✓</span>
                    <span className="truncate">{reason}</span>
                  </li>
                ))}
              </ul>
            )}
            {(j.location || j.employmentType) && (
              <span className="mt-auto flex items-center gap-1 pt-2 text-[10.5px] text-white/30">
                {j.location && <MapPin className="h-2.5 w-2.5 shrink-0" />}
                <span className="truncate">{[j.location, j.employmentType].filter(Boolean).join(' · ')}</span>
              </span>
            )}
          </Link>
        ))}
      </div>

      <Link
        href="/jobs"
        className="relative mt-2.5 flex w-full items-center justify-center py-2 text-[11.5px] font-bold text-[#D2691E] transition-colors hover:text-[#B4551A]"
      >
        See all jobs →
      </Link>
    </section>
  );
}
