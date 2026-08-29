'use client';

/**
 * My Jobs — the postings this member created, and what has happened to them.
 *
 * Same marketplace shell as /jobs, /jobs/post and /jobs/[id]: the 56px fixed
 * header with a back button, a rigid 100dvh frame and one scrolling column, so
 * managing a posting never leaves the marketplace.
 *
 * Every value is real: the list, the statuses and the application counts all
 * come from GET /api/hiring/jobs?scope=mine, which is server-scoped to jobs
 * this session created. Counts are tallied server-side from one applications
 * read — there is no request per row.
 *
 * Actions reuse the endpoints that already exist: editing opens the same
 * composer at /jobs/post?edit=<id>, and unpublish/delete call
 * DELETE /api/hiring/jobs. The server re-verifies ownership on every write, so
 * these controls are a convenience, never the thing that authorises the change.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowUpRight, Briefcase, EyeOff, Loader2, PencilLine, Plus, Trash2, Users,
} from 'lucide-react';
import { EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, formatJobLocation, formatPosted } from '@/lib/jobs-ui';

type MyJob = {
  id: string;
  title: string;
  organizationName: string;
  location: string;
  employmentType: string;
  workMode: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  applicationCount: number;
};

const PANEL = 'rounded-2xl border border-white/[0.07] bg-white/[0.02]';
const GHOST_BTN =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.10] bg-white/[0.04] px-3 text-[12.5px] font-semibold text-white/55 transition hover:bg-white/[0.08] hover:text-white/85 disabled:cursor-not-allowed disabled:opacity-60';

/** Published is the only publicly visible state; everything else reads as draft. */
function StatusPill({ status }: { status: string }) {
  const live = status === 'published';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[10.5px] font-semibold ${
      live
        ? 'border-emerald-400/25 bg-emerald-400/[0.10] text-emerald-200/90'
        : 'border-white/[0.10] bg-white/[0.04] text-white/45'
    }`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${live ? 'bg-emerald-400' : 'bg-white/30'}`} aria-hidden />
      {live ? 'Published' : 'Draft'}
    </span>
  );
}

export default function MyJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<MyJob[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/hiring/jobs?scope=mine', { cache: 'no-store' });
      if (response.status === 401) { router.push('/login'); return; }
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load your jobs.');
      setJobs(Array.isArray(payload?.jobs) ? payload.jobs : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load your jobs.');
      setJobs([]);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const remove = async (job: MyJob, mode: 'unpublish' | 'delete') => {
    if (busyId) return;
    setBusyId(job.id);
    setError('');
    try {
      const response = await fetch(
        `/api/hiring/jobs?id=${encodeURIComponent(job.id)}&mode=${mode}`,
        { method: 'DELETE' },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'That change could not be saved.');
      setConfirmDelete('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That change could not be saved.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#0A0A0C] text-white">
      <style>{`.no-sb::-webkit-scrollbar{display:none}.no-sb{scrollbar-width:none}`}</style>

      <header className="shrink-0 z-30 border-b border-white/[0.06]"
        style={{ height: 56, background: 'rgba(10,10,12,0.96)', backdropFilter: 'blur(20px) saturate(180%)' }}>
        <div className="flex h-full items-center gap-3 px-3 sm:px-5 lg:px-8">
          <button onClick={() => router.back()} aria-label="Back"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/48 transition-all hover:bg-white/[0.08] hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="truncate text-[15px] font-bold tracking-[-0.01em] text-white">My Jobs</span>
          <Link href="/jobs/post"
            className="ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-emerald-500 px-3.5 text-[12.5px] font-bold text-white transition hover:bg-emerald-400">
            <Plus className="h-3.5 w-3.5" /> Post a Job
          </Link>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-3 pb-20 pt-6 sm:px-5 lg:px-8">

          {error && (
            <p role="alert" className="mb-4 rounded-[12px] border border-rose-400/25 bg-rose-400/[0.07] px-3.5 py-2.5 text-[12.5px] font-medium text-rose-200/90">
              {error}
            </p>
          )}

          {jobs === null ? (
            <div className="flex items-center gap-2 px-1 py-10 text-[12.5px] text-white/28">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your jobs…
            </div>
          ) : jobs.length === 0 ? (
            <div className={`flex flex-col items-center px-6 py-14 text-center ${PANEL}`}>
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                <Briefcase className="h-5 w-5 text-white/25" />
              </span>
              <p className="text-[14px] font-bold text-white/70">You have not posted a job yet</p>
              <p className="mx-auto mt-1.5 max-w-[320px] text-[12.5px] leading-relaxed text-white/32">
                Post a role and it appears in the Jobs feed straight away, with applications arriving here.
              </p>
              <Link href="/jobs/post"
                className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-[13px] bg-emerald-500 px-5 text-[13px] font-bold text-white transition hover:bg-emerald-400">
                <Plus className="h-3.5 w-3.5" /> Post a Job
              </Link>
            </div>
          ) : (
            <ul className={`overflow-hidden ${PANEL}`}>
              {jobs.map((job) => {
                const meta = [
                  formatJobLocation(job.location, job.workMode as never),
                  EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType,
                  WORK_MODE_LABELS[job.workMode] ?? job.workMode,
                ].filter(Boolean).join(' · ');
                const posted = formatPosted(job.createdAt);

                return (
                  <li key={job.id} className="border-t border-white/[0.06] px-4 py-4 first:border-t-0 sm:px-5">
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/jobs/${job.id}`}
                            className="truncate text-[14px] font-bold text-white/90 transition hover:text-white">
                            {job.title}
                          </Link>
                          <StatusPill status={job.status} />
                        </div>
                        {meta && <p className="mt-1 truncate text-[12px] text-white/35">{meta}</p>}
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-white/28">
                          <span className="inline-flex items-center gap-1.5 text-white/45">
                            <Users className="h-3 w-3 shrink-0" />
                            {job.applicationCount} {job.applicationCount === 1 ? 'application' : 'applications'}
                          </span>
                          {posted && <span>Posted {posted}</span>}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/jobs/${job.id}`} className={GHOST_BTN}>
                          View <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                        <Link href={`/jobs/post?edit=${encodeURIComponent(job.id)}`} className={GHOST_BTN}>
                          <PencilLine className="h-3.5 w-3.5" /> Edit
                        </Link>
                        {job.status === 'published' && (
                          <button type="button" disabled={busyId === job.id}
                            onClick={() => remove(job, 'unpublish')} className={GHOST_BTN}>
                            {busyId === job.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <EyeOff className="h-3.5 w-3.5" />}
                            Unpublish
                          </button>
                        )}
                        <button type="button" disabled={busyId === job.id}
                          onClick={() => (confirmDelete === job.id ? remove(job, 'delete') : setConfirmDelete(job.id))}
                          className={`${GHOST_BTN} ${confirmDelete === job.id ? 'border-rose-400/35 bg-rose-400/[0.10] text-rose-200/90' : ''}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                          {/* Two-step: deleting a posting also detaches its applications. */}
                          {confirmDelete === job.id ? 'Confirm delete' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
