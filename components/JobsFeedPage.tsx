'use client';

/**
 * Public Jobs Feed — the browsable list of every published job.
 *
 * UI only: this reuses the same public-site chrome, container, panel/card
 * tokens, typography and slate/white palette as the other public pages
 * (PublicSiteChrome + PublicHiringJobPage) so /jobs visually belongs to DoCrud.
 * Data flow is unchanged: the aggregated /api/public/hiring/jobs endpoint, the
 * existing /jobs/[id] detail route, and the same search + employment/work-mode
 * filtering. No new fields, no matching data on the public feed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BriefcaseBusiness, Building2, MapPin, Search, ArrowRight, RotateCw } from 'lucide-react';
import PublicSiteChrome from '@/components/PublicSiteChrome';
import { HiringJobPosting, LandingSettings } from '@/types/document';

type JobsFeedPageProps = {
  softwareName: string;
  accentLabel: string;
  settings: LandingSettings;
};

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', internship: 'Internship', freelance: 'Freelance',
};
const WORKMODE_LABEL: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1mo ago' : `${months}mo ago`;
}

const PANEL = 'rounded-[1.4rem] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)]';
const CONTROL = 'h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-200';

export default function JobsFeedPage({ softwareName, accentLabel, settings }: JobsFeedPageProps) {
  const [jobs, setJobs] = useState<HiringJobPosting[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [employment, setEmployment] = useState('all');
  const [workMode, setWorkMode] = useState('all');

  const load = useCallback(() => {
    setError('');
    setJobs(null);
    let active = true;
    fetch('/api/public/hiring/jobs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load-failed'))))
      .then((d) => { if (active) setJobs(Array.isArray(d) ? d : []); })
      .catch(() => { if (active) { setError('We could not load jobs right now.'); setJobs([]); } });
    return () => { active = false; };
  }, []);

  useEffect(() => load(), [load]);

  const filtered = useMemo(() => {
    if (!jobs) return [];
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (employment !== 'all' && (j.employmentType || 'full_time') !== employment) return false;
      if (workMode !== 'all' && (j.workMode || 'hybrid') !== workMode) return false;
      if (!q) return true;
      const hay = `${j.title} ${j.organizationName} ${j.location || ''} ${(j.preferredSkills || []).join(' ')} ${(j.targetRoleKeywords || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [jobs, query, employment, workMode]);

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Hero */}
        <section className="px-1 sm:px-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <BriefcaseBusiness className="h-3.5 w-3.5" /> Jobs
          </span>
          <h1 className="mt-3 text-[1.75rem] font-semibold tracking-[-0.02em] text-slate-950 sm:text-[2.15rem]">Find your next opportunity</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-slate-500">
            Discover roles published across {softwareName} — from company hiring desks and business pages — and apply in a couple of clicks.
          </p>
        </section>

        {/* Search + filters */}
        <section className={`${PANEL} p-3 sm:p-3.5`}>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, company, location or skill"
                aria-label="Search jobs"
                className={`${CONTROL} w-full pl-10 pr-3`}
              />
            </div>
            <select value={employment} onChange={(e) => setEmployment(e.target.value)} aria-label="Filter by employment type" className={CONTROL}>
              <option value="all">All types</option>
              {Object.entries(EMPLOYMENT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} aria-label="Filter by work mode" className={CONTROL}>
              <option value="all">All modes</option>
              {Object.entries(WORKMODE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </section>

        {/* Results header */}
        <div className="flex items-baseline justify-between px-1 sm:px-2">
          <h2 className="text-[15px] font-semibold text-slate-900">Open roles</h2>
          <span className="text-[13px] text-slate-500" aria-live="polite">
            {jobs === null ? 'Loading…' : `${filtered.length} ${filtered.length === 1 ? 'opportunity' : 'opportunities'}`}
          </span>
        </div>

        {/* States + grid */}
        {jobs === null ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-[1.25rem] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
                <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="mt-4 h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                <div className="mt-5 h-3 w-full animate-pulse rounded bg-slate-100" />
                <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className={`${PANEL} flex flex-col items-center gap-3 p-10 text-center`}>
            <p className="text-sm font-semibold text-slate-800">{error}</p>
            <button
              type="button"
              onClick={() => load()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
            >
              <RotateCw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className={`${PANEL} p-12 text-center`}>
            <BriefcaseBusiness className="mx-auto h-9 w-9 text-slate-300" aria-hidden />
            <p className="mt-3 text-[15px] font-semibold text-slate-800">No jobs found</p>
            <p className="mt-1 text-sm text-slate-500">
              {jobs.length === 0 ? 'New roles appear here as companies publish them — check back soon.' : 'Try changing your search or filters.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((job) => {
              const meta = [
                EMPLOYMENT_LABEL[job.employmentType || 'full_time'],
                WORKMODE_LABEL[job.workMode || 'hybrid'],
                job.experienceLevel ? job.experienceLevel[0].toUpperCase() + job.experienceLevel.slice(1) : '',
              ].filter(Boolean);
              const skills = (job.preferredSkills && job.preferredSkills.length ? job.preferredSkills : job.targetRoleKeywords) || [];
              const posted = timeAgo(job.createdAt);
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group flex h-full flex-col rounded-[1.25rem] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_18px_45px_rgba(15,23,42,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                    <span className="truncate">{job.organizationName || softwareName}</span>
                  </p>
                  <h3 className="mt-1.5 line-clamp-2 text-[16px] font-bold leading-snug text-slate-950 transition-colors group-hover:text-slate-700">{job.title}</h3>

                  <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-slate-500">
                    {job.location && (
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />{job.location}</span>
                    )}
                    {job.location && meta.length > 0 && <span aria-hidden className="text-slate-300">·</span>}
                    <span className="text-slate-500">{meta.join(' · ')}</span>
                  </p>

                  {job.description && (
                    <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-slate-600">{job.description}</p>
                  )}

                  {skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {skills.slice(0, 3).map((s) => (
                        <span key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">{s}</span>
                      ))}
                      {skills.length > 3 && <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-400">+{skills.length - 3}</span>}
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3.5">
                    <span className="text-[11px] text-slate-400">{posted ? `Posted ${posted}` : 'Recently posted'}</span>
                    <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-slate-900 transition-all group-hover:gap-1.5">
                      View &amp; apply <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </PublicSiteChrome>
  );
}
