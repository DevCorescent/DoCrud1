'use client';

/**
 * The one job card — drawn in the SAME language as components/BusinessDirectory's
 * BusinessCard so the Jobs directory reads as the same product as Businesses:
 * a flat rounded-2xl glass card (no gradient border, no lift/glow), an initials
 * avatar for the company, the identity block, tag pills, location and a footer
 * with the actions. Job-specific features are preserved — profile Match %,
 * why-it-matches reasons, honest source attribution and a direct Apply to the
 * original ATS via the existing applyUrl.
 *
 * Image-free by product decision: no company logo/banner is fetched — only the
 * deterministic initials box Businesses itself uses as its logo fallback. Only
 * real fields render; nothing is fabricated.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, ArrowUpRight, Check, ArrowRight } from 'lucide-react';
import {
  EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS,
  jobDetailHref, formatPosted, formatJobLocation, jobSourceLabel, isValidApplyUrl,
} from '@/lib/jobs-ui';
import { isIndiaRelevant } from '@/lib/server/job-scraper/india';

export type JobSummary = {
  id: string;
  title: string;
  organizationName?: string;
  description?: string;
  location?: string | null;
  department?: string | null;
  employmentType?: string | null;
  workMode?: string | null;
  experienceLevel?: string | null;
  preferredSkills?: string[];
  targetRoleKeywords?: string[];
  status?: string;
  createdAt?: string;
  applyUrl?: string;
  /** Present only in the profile-matched "Recommended for You" context. */
  matchScore?: number;
  matchReasons?: string[];
};

export function JobSummaryCard({ job }: { job: JobSummary }) {
  const router = useRouter();
  const detail = jobDetailHref(job.id);
  const company = job.organizationName || 'Company';
  const initials = company.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'C';
  const employment = job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType : null;
  const workMode = job.workMode ? WORK_MODE_LABELS[job.workMode] ?? job.workMode : null;
  const experience = job.experienceLevel ? EXPERIENCE_LABELS[job.experienceLevel] ?? job.experienceLevel : null;
  const skills = (job.preferredSkills ?? []).filter(Boolean).slice(0, 3);
  const posted = formatPosted(job.createdAt);
  const locationLabel = formatJobLocation(job.location, job.workMode);
  const india = isIndiaRelevant(job.location || '');
  const source = jobSourceLabel(job.applyUrl);
  const canApply = isValidApplyUrl(job.applyUrl);
  const reasons = (job.matchReasons ?? []).filter(Boolean).slice(0, 3);
  const hasMatch = typeof job.matchScore === 'number';

  const open = () => router.push(detail);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="group block cursor-pointer"
      onClick={open} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
    >
      <article className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.035]">
        <div className="p-4 sm:p-5">
          {/* header: company initials + identity + match badge */}
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.05] text-[13px] font-bold text-white/60">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <h3 className="min-w-0 flex-1 text-[15px] font-bold leading-tight tracking-tight text-white transition-colors group-hover:text-white/90 line-clamp-2">
                  {job.title}
                </h3>
                {hasMatch && (
                  <span className="shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/[0.12] px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    {job.matchScore}% Match
                  </span>
                )}
              </div>
              <p className="mt-1 truncate text-[12px] font-semibold text-white/45">
                {company}{source && <span className="text-white/30"> · via {source}</span>}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">Open</span>
                {employment && (
                  <span className="inline-flex items-center rounded-full border border-white/[0.10] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/50">{employment}</span>
                )}
                {workMode && (
                  <span className="inline-flex items-center rounded-full border border-white/[0.10] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/50">{workMode}</span>
                )}
                {experience && (
                  <span className="inline-flex items-center rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-300">{experience}</span>
                )}
              </div>
            </div>
          </div>

          {/* location */}
          {locationLabel && (
            <div className="mt-3 flex items-center gap-1.5 text-[12px]" style={{ color: india ? '#7ee0b8' : 'rgba(255,255,255,0.35)' }}>
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{locationLabel}</span>
            </div>
          )}

          {/* skills */}
          {skills.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <span key={s} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10.5px] font-medium text-white/45">{s}</span>
              ))}
            </div>
          )}

          {/* why this matches (real reasons only) */}
          {hasMatch && reasons.length > 0 && (
            <div className="mt-3 rounded-xl border border-emerald-500/[0.14] bg-emerald-500/[0.05] px-3 py-2.5">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-emerald-300/70">Why this matches you</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {reasons.map((r) => (
                  <li key={r} className="flex items-center gap-1.5 text-[11.5px] text-white/60">
                    <Check className="h-3 w-3 shrink-0 text-emerald-400" />
                    <span className="truncate">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* footer: meta + actions */}
          <div className="mt-4 flex items-center gap-x-4 gap-y-2 border-t border-white/[0.05] pt-3.5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/30">
              {posted && <span className="truncate">Posted {posted}</span>}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Link
                href={detail} onClick={stop}
                className="inline-flex items-center gap-1 rounded-full border border-white/[0.10] bg-white/[0.04] px-3 py-1 text-[11.5px] font-semibold text-white/55 transition hover:border-white/[0.18] hover:bg-white/[0.08] hover:text-white/90"
              >
                View <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              {canApply && (
                <a
                  href={job.applyUrl} target="_blank" rel="noopener noreferrer nofollow" onClick={stop}
                  aria-label={`Apply for ${job.title} on the original source`}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[11.5px] font-bold text-[#0A0A0C] transition hover:bg-white/90"
                >
                  Apply <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
