'use client';

/**
 * Recommended jobs — a feed item.
 *
 * Uses the existing /api/public/hiring/jobs data and the existing /jobs/[id]
 * route. No new job system, no new API. Ranking prefers overlap between the
 * role and the viewer's own headline/skills when the profile provides them;
 * otherwise the most recent openings are shown.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Briefcase, MapPin } from 'lucide-react';

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
    <section className="rounded-[14px] border border-white/[0.07] bg-white/[0.02] px-3 py-3" aria-label="Recommended jobs">
      <div className="mb-2.5 flex items-center justify-between px-0.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.10em] text-white/28">
          <Briefcase className="h-3 w-3" /> Recommended jobs
        </span>
        <Link href="/jobs" className="text-[11px] font-semibold text-white/30 transition-colors hover:text-white/60">
          See all
        </Link>
      </div>

      {/* Responsive grid — fluid cards so nothing is clipped on mobile. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {jobs.map((j) => (
          <Link
            key={j.id}
            href={`/jobs/${j.id}`}
            className="flex min-w-0 flex-col rounded-[12px] border border-white/[0.08] bg-white/[0.025] p-3 transition-colors hover:border-white/[0.14]"
          >
            {typeof j.matchScore === 'number' && j.matchScore > 0 && (
              <span className="mb-1.5 inline-flex w-fit items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                {j.matchScore}% match
              </span>
            )}
            <span className="line-clamp-2 text-[12.5px] font-bold text-white/90">{j.title || 'Open role'}</span>
            <span className="mt-1 line-clamp-1 text-[11px] font-medium text-white/45">{j.organizationName || 'Docrud'}</span>
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
        className="mt-2.5 flex w-full items-center justify-center rounded-[11px] border border-white/[0.08] bg-white/[0.02] py-2 text-[11.5px] font-semibold text-white/45 transition-colors hover:border-white/[0.16] hover:text-white/70"
      >
        See all jobs →
      </Link>
    </section>
  );
}
