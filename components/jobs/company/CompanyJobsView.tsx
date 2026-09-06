'use client';

/**
 * One company's jobs, ranked by the viewer's match.
 *
 * Same marketplace shell as /jobs and /jobs/my. The ranking is NOT done here —
 * the route returns jobs already ordered by the existing engine, and this file
 * renders that order without re-sorting. A second opinion formed in the browser
 * would quietly disagree with the server that produced it.
 *
 * INSIGHTS ARE OMITTED WHEN THEY CANNOT BE COMPUTED. A signed-out visitor, or
 * one with no profile signals, gets the job list with no scores and no
 * "Your Avg. Match" panel — rather than a panel filled with zeroes that look
 * like a verdict.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { formatCompanyJobCount } from '@/lib/company-explorer';
import CompanyLogo from './CompanyLogo';
import { getJobMatchLabel, jobMatchTokenClasses } from '@/lib/job-match-tone';
import { EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, formatJobLocation, formatPosted } from '@/lib/jobs-ui';

interface Job {
  id: string; title: string; location?: string; employmentType?: string;
  workMode?: string; experienceLevel?: string; preferredSkills?: string[];
  createdAt?: string; matchScore?: number; matchReasons?: string[];
}
interface Payload {
  company: { id: string; name: string; logoUrl: string; jobCount: number };
  insights: { averageMatch: number; topMatch: number; scoredJobs: number } | null;
  jobs: Job[];
  /* The route has always returned these; this view simply never read them,
     which is why a company showing "40+ jobs" only ever rendered the first
     twenty and offered no way to reach the rest. */
  page: number;
  pageSize: number;
  total: number;
}

const PANEL = 'rounded-2xl border border-white/[0.07] bg-white/[0.02]';

export default function CompanyJobsView({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');

  const [loadingMore, setLoadingMore] = useState(false);

  /* `page` 1 replaces what is on screen; anything higher APPENDS. Paging that
     swapped the list would make someone lose their place every time they asked
     for more of it. */
  const load = useCallback(async (page = 1) => {
    setError('');
    if (page > 1) setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/company-explorer/${encodeURIComponent(companyId)}/jobs?page=${page}`,
        { cache: 'no-store' },
      );
      if (res.status === 404) { setError('That company has no open jobs on DoCrud.'); return; }
      const body = await res.json().catch(() => null);
      if (!res.ok || !body) throw new Error(body?.error || 'Unable to load this company.');
      const next = body as Payload;
      setData((prev) => (page > 1 && prev
        ? { ...next, jobs: [...prev.jobs, ...next.jobs] }
        : next));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load this company.');
    } finally {
      setLoadingMore(false);
    }
  }, [companyId]);

  useEffect(() => { load(1); }, [load]);

  const shown = data?.jobs.length ?? 0;
  const hasMore = Boolean(data && shown < data.total);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#0A0A0C] text-white">
      <header className="z-30 shrink-0 border-b border-white/[0.06]"
        style={{ height: 56, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px) saturate(180%)' }}>
        <div className="flex h-full items-center gap-3 px-3 sm:px-5 lg:px-8">
          <button onClick={() => router.back()} aria-label="Back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/48 transition hover:bg-white/[0.08] hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="truncate text-[15px] font-bold tracking-[-0.01em]">
            {data?.company.name ?? 'Company'}
          </span>
          <Link href="/jobs"
            className="ml-auto inline-flex h-9 shrink-0 items-center rounded-[10px] bg-white px-3.5 text-[12.5px] font-bold text-[#0b1220] transition hover:bg-white/90">
            All jobs
          </Link>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl px-3 pb-28 pt-4 sm:px-5 lg:px-8">
          {error ? (
            <div className={`${PANEL} flex flex-col items-center gap-3 px-6 py-14 text-center`}>
              <p className="text-[14px] font-semibold text-white/80">{error}</p>
              <Link href="/jobs"
                className="inline-flex h-9 items-center rounded-[10px] bg-white px-3.5 text-[12.5px] font-bold text-[#0b1220]">
                Browse all jobs
              </Link>
            </div>
          ) : !data ? (
            <div className="space-y-3">
              <div className={`${PANEL} h-[104px] animate-pulse`} />
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${PANEL} h-[78px] animate-pulse`} />)}
            </div>
          ) : (
            <>
              <section className={`${PANEL} p-4`}>
                <div className="flex items-start gap-3">
                  <CompanyLogo name={data.company.name} logoUrl={data.company.logoUrl} size={48} rounded={14} />
                  <div className="min-w-0 flex-1">
                    <h1 className="truncate text-[16px] font-bold">{data.company.name}</h1>
                    <p className="mt-0.5 text-[12.5px] text-white/45">
                      {formatCompanyJobCount(data.company.jobCount)}
                    </p>
                  </div>
                </div>

                {/* Computed from the scores actually produced. Absent when there
                    are none — never a placeholder. */}
                {data.insights ? (
                  <dl className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                      <dt className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/25">
                        Your avg. match
                      </dt>
                      <dd className="mt-1 text-[17px] font-bold tabular-nums">{data.insights.averageMatch}%</dd>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                      <dt className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/25">
                        Top match
                      </dt>
                      <dd className="mt-1 text-[17px] font-bold tabular-nums">{data.insights.topMatch}%</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-3 text-[11.5px] leading-relaxed text-white/30">
                    Add skills or upload a résumé to your profile and these roles will be matched against it.
                  </p>
                )}
              </section>

              <p className="mb-2 mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                Jobs · {data.insights ? 'best match first' : 'newest first'}
              </p>

              <ul className="space-y-2.5">
                {data.jobs.map((job) => {
                  const facts = [
                    formatJobLocation(job.location, job.workMode),
                    job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType : '',
                    job.workMode ? WORK_MODE_LABELS[job.workMode] ?? job.workMode : '',
                  ].filter(Boolean);
                  return (
                    <li key={job.id} className={`${PANEL} p-4`}>
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <h2 className="text-[14px] font-bold leading-snug">
                            <Link href={`/jobs/${encodeURIComponent(job.id)}`} className="hover:underline underline-offset-2">
                              {job.title}
                            </Link>
                          </h2>
                          {facts.length > 0 && (
                            <p className="mt-1 text-[12px] text-white/45">{facts.join(' · ')}</p>
                          )}
                        </div>
                        {typeof job.matchScore === 'number' && (
                          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${jobMatchTokenClasses(job.matchScore)}`}>
                            {job.matchScore}% Match
                            <span className="sr-only"> — {getJobMatchLabel(job.matchScore)} match</span>
                          </span>
                        )}
                      </div>

                      {job.preferredSkills && job.preferredSkills.length > 0 && (
                        <p className="mt-2 truncate text-[11.5px] text-white/38">
                          {job.preferredSkills.join(' · ')}
                        </p>
                      )}

                      <div className="mt-3 flex items-center gap-3">
                        {job.createdAt && (
                          <span className="text-[11px] text-white/28">{formatPosted(job.createdAt)}</span>
                        )}
                        <Link href={`/jobs/${encodeURIComponent(job.id)}`}
                          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-white/[0.10] bg-white/[0.04] px-3 text-[12px] font-semibold text-white/60 transition hover:bg-white/[0.08] hover:text-white/90">
                          View job <ArrowUpRight className="h-3 w-3" aria-hidden />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* ── How far through the list you are, and how to see more ──
                  Both matter: without the count, "20 shown" of a company
                  advertising 40+ jobs looks like the rest failed to load,
                  which is exactly how this read before. */}
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-[11.5px] text-white/45 tabular-nums">
                  Showing {shown} of {data.total} {data.total === 1 ? 'role' : 'roles'}
                </p>
                {hasMore && (
                  <button
                    type="button"
                    onClick={() => load(data.page + 1)}
                    disabled={loadingMore}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.14] bg-white/[0.06] px-4 text-[12.5px] font-semibold text-white/80 transition hover:border-white/25 hover:bg-white/[0.11] hover:text-white disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : `Load ${Math.min(data.pageSize, data.total - shown)} more`}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
