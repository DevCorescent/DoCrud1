'use client';

/**
 * Public Jobs Feed — the browsable list of every published job.
 *
 * Reuses the existing aggregated endpoint /api/public/hiring/jobs (hiring-desk
 * jobs + business-page jobs projected into the same shape) and the existing
 * /jobs/[id] detail route. No new job system, no new data model, no hardcoded
 * jobs. This is the destination for "See all" and the browsable feed that was
 * previously missing.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BriefcaseBusiness, MapPin, Search, Building2 } from 'lucide-react';
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

export default function JobsFeedPage({ softwareName, accentLabel, settings }: JobsFeedPageProps) {
  const [jobs, setJobs] = useState<HiringJobPosting[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [employment, setEmployment] = useState('all');
  const [workMode, setWorkMode] = useState('all');

  useEffect(() => {
    let active = true;
    fetch('/api/public/hiring/jobs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load-failed'))))
      .then((d) => { if (active) setJobs(Array.isArray(d) ? d : []); })
      .catch(() => { if (active) { setError('We could not load jobs right now. Please try again.'); setJobs([]); } });
    return () => { active = false; };
  }, []);

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

  const selectCls = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400';

  return (
    <PublicSiteChrome softwareName={softwareName} accentLabel={accentLabel} settings={settings}>
      <section className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <BriefcaseBusiness className="h-3.5 w-3.5" /> Jobs
          </span>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Open roles on {softwareName}</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {jobs === null ? 'Loading openings…' : `${jobs.length} ${jobs.length === 1 ? 'role' : 'roles'} published`}
          </p>
        </header>

        {/* Search + filters */}
        <div className="mb-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, company, location, skills…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-slate-400"
              aria-label="Search jobs"
            />
          </div>
          <select value={employment} onChange={(e) => setEmployment(e.target.value)} className={selectCls} aria-label="Employment type">
            <option value="all">All types</option>
            {Object.entries(EMPLOYMENT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={workMode} onChange={(e) => setWorkMode(e.target.value)} className={selectCls} aria-label="Work mode">
            <option value="all">All modes</option>
            {Object.entries(WORKMODE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        {/* States */}
        {jobs === null ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-100/70" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <BriefcaseBusiness className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-800">
              {jobs.length === 0 ? 'No open roles yet' : 'No roles match your filters'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {jobs.length === 0 ? 'Check back soon — new roles appear here as companies publish them.' : 'Try clearing search or filters.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((job) => {
              const meta = [job.location, EMPLOYMENT_LABEL[job.employmentType || 'full_time'], WORKMODE_LABEL[job.workMode || 'hybrid']].filter(Boolean);
              const skills = (job.preferredSkills && job.preferredSkills.length ? job.preferredSkills : job.targetRoleKeywords) || [];
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="line-clamp-2 text-[15px] font-bold leading-snug text-slate-950 group-hover:text-slate-700">{job.title}</h2>
                    {timeAgo(job.createdAt) && <span className="shrink-0 whitespace-nowrap text-[11px] text-slate-400">{timeAgo(job.createdAt)}</span>}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-medium text-slate-600">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{job.organizationName || 'Docrud'}</span>
                  </p>
                  {meta.length > 0 && (
                    <p className="mt-2 flex items-center gap-1 text-[11.5px] text-slate-500">
                      {job.location && <MapPin className="h-3 w-3 shrink-0 text-slate-400" />}
                      <span className="truncate">{meta.join(' · ')}</span>
                    </p>
                  )}
                  {job.description && (
                    <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-slate-500">{job.description}</p>
                  )}
                  {skills.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {skills.slice(0, 3).map((s) => (
                        <span key={s} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10.5px] font-medium text-slate-600">{s}</span>
                      ))}
                      {skills.length > 3 && <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10.5px] text-slate-400">+{skills.length - 3}</span>}
                    </div>
                  )}
                  <span className="mt-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-slate-900 group-hover:gap-2">
                    View &amp; apply <span aria-hidden>&rarr;</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </PublicSiteChrome>
  );
}
