'use client';

/**
 * The one job card — the Jobs-side mirror of ProjectSummaryCard.
 *
 * Same language as the Projects/Services discovery card: a banner, an
 * overlapping avatar (the company initial), an identity block, pill metadata
 * and a footer. Sizes, radii, colours and breakpoints are taken from
 * components/projects/ProjectSummaryCard.tsx so the two grids read as one
 * product. Nothing in the Projects card is modified.
 *
 * Only real fields render — there are no placeholder salaries, locations or
 * dates, and no data model / API is introduced.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, ArrowUpRight, CalendarClock } from 'lucide-react';
import {
  EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, EXPERIENCE_LABELS, JOB_STATUS_LABELS,
  jobDetailHref, formatPosted,
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
};

const BANNER_GRADIENTS = [
  'linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%)',
  'linear-gradient(135deg,#0d1b0d 0%,#14532d 100%)',
  'linear-gradient(135deg,#1a0d2e 0%,#4c1d95 100%)',
  'linear-gradient(135deg,#1c0a0a 0%,#7f1d1d 100%)',
  'linear-gradient(135deg,#0d1a1a 0%,#134e4a 100%)',
  'linear-gradient(135deg,#1a150d 0%,#78350f 100%)',
  'linear-gradient(135deg,#0a0d1a 0%,#1e1b4b 100%)',
  'linear-gradient(135deg,#0f0a1a 0%,#581c87 100%)',
];

function CompanyAvatar({ name, size }: { name: string; size: number }) {
  const radius = size >= 52 ? 16 : 12;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="relative w-full h-full overflow-hidden flex items-center justify-center font-bold"
        style={{
          borderRadius: radius,
          fontSize: size >= 52 ? 15 : 13,
          background: 'rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.65)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
      >
        {(name || '?').trim().charAt(0).toUpperCase()}
      </div>
    </div>
  );
}

export function JobSummaryCard({ job }: { job: JobSummary }) {
  const router = useRouter();
  const detail = jobDetailHref(job.id);
  const company = job.organizationName || 'Company';
  const workMode = job.workMode ? WORK_MODE_LABELS[job.workMode] ?? job.workMode : null;
  const experience = job.experienceLevel ? EXPERIENCE_LABELS[job.experienceLevel] ?? job.experienceLevel : null;
  const employment = job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType : null;
  const skills = ([...(job.preferredSkills ?? []), ...(job.targetRoleKeywords ?? [])].filter(Boolean)).slice(0, 3);
  const posted = formatPosted(job.createdAt);
  const status = job.status || 'published';
  const isOpen = status === 'published';

  const bannerHash = Array.from(job.title).reduce((a, c) => a + c.charCodeAt(0), 0);
  const bannerStyle: React.CSSProperties = { background: BANNER_GRADIENTS[bannerHash % BANNER_GRADIENTS.length] };

  const outerBorder = 'rgba(255,255,255,0.09)';
  const cardBg = '#0d0d10';
  const hoverGlow = '0 24px 72px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.4)';

  const statusStyle = isOpen
    ? { background: 'rgba(16,185,129,0.22)', border: '1px solid rgba(16,185,129,0.35)', color: '#6ee7b7' }
    : status === 'draft'
      ? { background: 'rgba(245,158,11,0.20)', border: '1px solid rgba(245,158,11,0.34)', color: '#fcd34d' }
      : { background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.62)' };

  const pillStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.50)' };
  const expStyle = { background: 'rgba(139,92,246,0.16)', border: '1px solid rgba(139,92,246,0.28)', color: '#c4b5fd' };

  const open = () => router.push(detail);

  const banner = (height: number, badgeTop: string) => (
    <div className="relative shrink-0 rounded-t-[19px] overflow-hidden" style={{ height, ...bannerStyle }}>
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,0.06) 0%,rgba(0,0,0,0.72) 100%)' }} />
      <span className="absolute inset-0 flex items-center justify-center text-3xl opacity-30" aria-hidden>💼</span>
      <span className={`absolute ${badgeTop} right-3 rounded-full px-2.5 py-1 text-[9px] font-semibold backdrop-blur-md`} style={statusStyle}>
        {JOB_STATUS_LABELS[status] ?? status}
      </span>
    </div>
  );

  const identity = (titleSize: string, descSize: string) => (
    <div className="mt-3 min-w-0">
      <p className={`font-bold ${titleSize} leading-snug text-white line-clamp-2`}>{job.title}</p>
      {job.description && (
        <p className={`${descSize} leading-snug line-clamp-2 mt-[3px]`} style={{ color: 'rgba(255,255,255,0.45)' }}>
          {job.description}
        </p>
      )}
      {(job.location || workMode) && (
        <div className="flex items-center gap-1 mt-1.5 text-[10.5px]" style={{ color: 'rgba(255,255,255,0.30)' }}>
          {job.location && <MapPin className="h-2.5 w-2.5 shrink-0" />}
          <span className="truncate">{[job.location, workMode].filter(Boolean).join(' · ')}</span>
        </div>
      )}
    </div>
  );

  const pills = (size: string) => (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {experience && (
        <span className={`rounded-full px-2.5 py-[3.5px] ${size} font-medium`} style={expStyle}>{experience}</span>
      )}
      {skills.map(s => (
        <span key={s} className={`rounded-full px-2.5 py-[3.5px] ${size} font-medium`} style={pillStyle}>{s}</span>
      ))}
    </div>
  );

  const footer = (size: string, iconSize: string, pad: string) => (
    <div className={`flex items-center gap-3 mt-auto ${pad} ${size}`}
      style={{ borderTop: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.30)' }}>
      {posted && (
        <span className="flex items-center gap-1 truncate">
          <CalendarClock className={iconSize} />Posted {posted}
        </span>
      )}
      {employment && (
        <span className="ml-auto shrink-0 font-bold" style={{ color: 'rgba(255,255,255,0.92)' }}>{employment}</span>
      )}
    </div>
  );

  const actions = (
    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
      <Link
        href={detail}
        aria-label={`View job: ${job.title}`}
        className="flex items-center justify-center h-8 w-8 rounded-[10px] transition-all"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)' }}
      >
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );

  const companyLine = (size: string) => (
    <span className={`block ${size} font-semibold truncate`} style={{ color: 'rgba(255,255,255,0.50)' }}>{company}</span>
  );

  /* ── Mobile card ── */
  const mobileCard = (
    <div
      className="sm:hidden cursor-pointer active:scale-[0.985] transition-transform duration-150"
      onClick={open} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
    >
      <div className="rounded-[20px] p-[1px]" style={{ background: outerBorder }}>
        <div className="rounded-[19px] flex flex-col" style={{ background: cardBg }}>
          {banner(80, 'top-2.5')}
          <div className="px-4 pb-4" style={{ marginTop: -26, position: 'relative', zIndex: 1 }}>
            <div className="flex items-end gap-3">
              <div className="shrink-0 rounded-full" style={{ padding: 3, background: 'rgba(255,255,255,0.14)', boxShadow: '0 8px 28px rgba(0,0,0,0.55)' }}>
                <CompanyAvatar name={company} size={52} />
              </div>
              <div className="flex-1 min-w-0 pb-0.5 pt-[22px]">{companyLine('text-[11.5px]')}</div>
              <div className="pb-0.5 pt-[22px]">{actions}</div>
            </div>
            {identity('text-[14.5px]', 'text-[11.5px]')}
            {pills('text-[10px]')}
            {footer('text-[11px]', 'h-3 w-3', 'pt-3')}
          </div>
        </div>
      </div>
    </div>
  );

  /* ── Desktop grid card ── */
  const gridCard = (
    <div
      className="hidden sm:flex flex-col h-full cursor-pointer group"
      onClick={open} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
    >
      <div className="rounded-[20px] p-[1px] flex-1 flex flex-col transition-all duration-300 group-hover:-translate-y-[3px]" style={{ background: outerBorder }}>
        <div className="rounded-[19px] flex flex-col flex-1 transition-shadow duration-300 group-hover:shadow-[var(--card-hover-glow)]"
          style={{ background: cardBg, '--card-hover-glow': hoverGlow } as React.CSSProperties}>
          {banner(104, 'top-3')}
          <div className="flex flex-col flex-1 px-4" style={{ position: 'relative', zIndex: 1 }}>
            <div className="flex items-end justify-between gap-3" style={{ marginTop: -30 }}>
              <div className="shrink-0 rounded-full" style={{ padding: 3, background: 'rgba(255,255,255,0.14)', boxShadow: '0 10px 30px rgba(0,0,0,0.50)' }}>
                <CompanyAvatar name={company} size={58} />
              </div>
              <div className="pb-[3px]">{actions}</div>
            </div>
            <div className="mt-2.5 min-w-0">{companyLine('text-[11px]')}</div>
            {identity('text-[14.5px]', 'text-[12px]')}
            {pills('text-[9.5px]')}
            {footer('text-[10.5px]', 'h-2.5 w-2.5', 'pt-3 pb-4')}
          </div>
        </div>
      </div>
    </div>
  );

  return (<>{mobileCard}{gridCard}</>);
}
