'use client';

/**
 * The one job card — the Jobs-side member of the shared discovery design system
 * (radii, colours, borders, hover mirror components/projects/ProjectSummaryCard).
 *
 * Information-focused, image-free by product decision: there is no reliable logo/
 * banner for every scraped job, so the card shows NO company DP, NO cover/banner
 * and NO image placeholder — never fake or random imagery. It communicates the
 * product USP instead: profile Match %, why-it-matches reasons, India-aware
 * location, honest source attribution, and a direct "Apply Now" to the REAL
 * original source (Ashby/Lever/Greenhouse) via the existing normalized applyUrl.
 *
 * Only real fields render — nothing is fabricated. The match score/reasons come
 * from the existing recommendation API; when absent, those elements simply don't
 * show. No new data model, API or application system is introduced.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, ArrowUpRight, CalendarClock, Check } from 'lucide-react';
import { isIndiaRelevant } from '@/lib/server/job-scraper/india';
import {
  EMPLOYMENT_TYPE_LABELS, EXPERIENCE_LABELS, JOB_STATUS_LABELS,
  jobDetailHref, formatPosted, formatJobLocation, jobSourceLabel, isValidApplyUrl,
} from '@/lib/jobs-ui';

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
  const experience = job.experienceLevel ? EXPERIENCE_LABELS[job.experienceLevel] ?? job.experienceLevel : null;
  const employment = job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType : null;
  const skills = ([...(job.preferredSkills ?? []), ...(job.targetRoleKeywords ?? [])].filter(Boolean)).slice(0, 4);
  const posted = formatPosted(job.createdAt);
  const locationLabel = formatJobLocation(job.location, job.workMode);
  const india = isIndiaRelevant(job.location || '');
  const source = jobSourceLabel(job.applyUrl);
  const canApply = isValidApplyUrl(job.applyUrl);
  const reasons = (job.matchReasons ?? []).filter(Boolean).slice(0, 4);
  const hasMatch = typeof job.matchScore === 'number';
  const status = job.status || 'published';
  const statusLabel = JOB_STATUS_LABELS[status] ?? status;

  // Shared design tokens (same language as ProjectSummaryCard).
  const outerBorder = 'rgba(255,255,255,0.09)';
  const cardBg = '#0d0d10';
  const hoverGlow = '0 16px 44px rgba(0,0,0,0.42)';
  const pillStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.55)' };
  const expStyle = { background: 'rgba(139,92,246,0.16)', border: '1px solid rgba(139,92,246,0.28)', color: '#c4b5fd' };
  const matchStyle = { background: 'rgba(16,185,129,0.16)', border: '1px solid rgba(16,185,129,0.32)', color: '#6ee7b7' };
  const statusStyle = status === 'published'
    ? { background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.28)', color: '#6ee7b7' }
    : status === 'draft'
      ? { background: 'rgba(245,158,11,0.16)', border: '1px solid rgba(245,158,11,0.30)', color: '#fcd34d' }
      : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.52)' };

  const open = () => router.push(detail);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="group h-full cursor-pointer"
      onClick={open} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
    >
      <div className="rounded-[20px] p-[1px] h-full transition-all duration-300 group-hover:-translate-y-[3px]" style={{ background: outerBorder }}>
        <div
          className="rounded-[19px] h-full flex flex-col p-4 sm:p-[18px] transition-shadow duration-300 group-hover:shadow-[var(--card-hover-glow)]"
          style={{ background: cardBg, '--card-hover-glow': hoverGlow } as React.CSSProperties}
        >
          {/* ── Header: Match % (USP) + Open/status badge ── */}
          <div className="flex items-center justify-between gap-2 mb-2.5">
            {hasMatch
              ? <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={matchStyle}>{job.matchScore}% Match</span>
              : <span />}
            <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold shrink-0" style={statusStyle}>{statusLabel}</span>
          </div>

          {/* ── Company (muted) → Job title (prominent) ── */}
          <p className="text-[11.5px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.42)' }}>
            {company}{source && <span style={{ color: 'rgba(255,255,255,0.30)' }}> · via {source}</span>}
          </p>
          <h3 className="mt-0.5 font-bold text-[15.5px] leading-snug text-white line-clamp-2">{job.title}</h3>

          {/* ── India-aware location · work mode ── */}
          {locationLabel && (
            <div className="flex items-center gap-1.5 mt-2 text-[12px]" style={{ color: india ? '#7ee0b8' : 'rgba(255,255,255,0.42)' }}>
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{locationLabel}</span>
            </div>
          )}

          {/* ── Experience + skills ── */}
          {(experience || skills.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {experience && <span className="rounded-full px-2.5 py-[3.5px] text-[10px] font-medium" style={expStyle}>{experience}</span>}
              {skills.map((s) => (
                <span key={s} className="rounded-full px-2.5 py-[3.5px] text-[10px] font-medium" style={pillStyle}>{s}</span>
              ))}
            </div>
          )}

          {/* ── Why this matches (only real, data-backed reasons) ── */}
          {hasMatch && reasons.length > 0 && (
            <div className="mt-3.5 rounded-[12px] px-3 py-2.5" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.14)' }}>
              <p className="text-[9.5px] font-bold uppercase tracking-[0.12em]" style={{ color: 'rgba(110,231,183,0.72)' }}>Why this matches you</p>
              <ul className="mt-1.5 flex flex-col gap-1">
                {reasons.map((r) => (
                  <li key={r} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: 'rgba(255,255,255,0.62)' }}>
                    <Check className="h-3 w-3 shrink-0" style={{ color: '#6ee7b7' }} />
                    <span className="truncate">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Footer: divider → posted + employment → actions ── */}
          <div className="mt-auto pt-3.5" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            {(posted || employment) && (
              <div className="flex items-center gap-2 mb-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.32)' }}>
                {posted && <span className="flex items-center gap-1 truncate"><CalendarClock className="h-3 w-3" />Posted {posted}</span>}
                {employment && <span className="ml-auto shrink-0 font-semibold" style={{ color: 'rgba(255,255,255,0.60)' }}>{employment}</span>}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Link
                href={detail} onClick={stop}
                className="flex-1 inline-flex items-center justify-center h-9 rounded-[11px] text-[12.5px] font-semibold transition-colors"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.78)' }}
              >
                View Job
              </Link>
              {canApply && (
                <a
                  href={job.applyUrl} target="_blank" rel="noopener noreferrer nofollow" onClick={stop}
                  aria-label={`Apply for ${job.title} on the original source`}
                  className="flex-1 inline-flex items-center justify-center gap-1 h-9 rounded-[11px] text-[12.5px] font-bold transition-colors"
                  style={{ background: '#ffffff', color: '#0A0A0C' }}
                >
                  Apply Now <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
