'use client';

/**
 * My Jobs — one entry point for both sides of hiring.
 *
 * Same marketplace shell as /jobs, /jobs/post and /jobs/[id]: a 56px fixed
 * header with a back button, a rigid 100dvh frame and one scrolling column, so
 * managing a posting or an application never leaves the marketplace.
 *
 * ═══ ROLE ═══
 *
 * The tabs are NOT chosen from an account type. Docrud lets an individual post
 * a role and a company person apply for one, so deciding from `accountType`
 * would hide a section from someone who is actively using it. Instead we ask
 * both endpoints how much they hold and show what the person actually has —
 * two `pageSize=1` probes, which is cheap and always truthful.
 *
 * ═══ THEME ═══
 *
 * Every surface in here carries a light value and a `dark:` value. The page
 * this replaced was hard-coded to `bg-[#0A0A0C] text-white`, which meant white
 * text on a white card the moment the global toggle was set to light.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
import PostedJobs from './my/PostedJobs';
import Applicants from './my/Applicants';
import AppliedJobs from './my/AppliedJobs';
import { FOCUS, PRIMARY_BTN, Skeletons } from './my/ui';

type Tab = 'posted' | 'applied';

export default function MyJobsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab | null>(null);
  const [counts, setCounts] = useState<{ posted: number; applied: number } | null>(null);
  const [applicantsFor, setApplicantsFor] = useState<{ id: string; title: string } | null>(null);

  /**
   * Which section leads.
   *
   * Someone with postings and no applications lands on Posted; someone with
   * applications and no postings lands on Applied. A person with both, or
   * neither, lands on Posted — the section that has an action to offer.
   */
  const probe = useCallback(async () => {
    const read = async (url: string) => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) return 0;
        const body = await res.json().catch(() => null);
        return Number(body?.total) || 0;
      } catch { return 0; }
    };
    const [posted, applied] = await Promise.all([
      read('/api/hiring/jobs/mine?page=1&pageSize=1'),
      read('/api/me/applications?page=1&pageSize=1'),
    ]);
    setCounts({ posted, applied });
    setTab(posted === 0 && applied > 0 ? 'applied' : 'posted');
  }, []);

  useEffect(() => { probe(); }, [probe]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#f8fafc] text-slate-900 dark:bg-[#0A0A0C] dark:text-white">
      <header
        className="shrink-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#0A0A0C]/95"
        style={{ height: 56 }}
      >
        <div className="flex h-full items-center gap-3 px-3 sm:px-5 lg:px-8">
          <button onClick={() => router.back()} aria-label="Back"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-slate-300 bg-[#ffffff] text-slate-500 transition hover:bg-[#f8fafc] hover:text-slate-900 dark:border-white/[0.08] dark:bg-[rgba(255,255,255,0.04)] dark:text-white/48 dark:hover:bg-[rgba(255,255,255,0.08)] dark:hover:text-white ${FOCUS}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          <h1 className="truncate text-[15px] font-bold tracking-[-0.01em] text-slate-900 dark:text-white">
            My Jobs
          </h1>
          <Link href="/jobs/post" className={`${PRIMARY_BTN} ${FOCUS} ml-auto shrink-0`}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Post a Job</span>
            <span className="sr-only sm:hidden">Post a Job</span>
          </Link>
        </div>
      </header>

      {/* One scrolling column. `pb-28` keeps the last row clear of the app's
          fixed bottom navigation on phones. */}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl px-3 pb-28 pt-4 sm:px-5 lg:px-8">
          {tab === null ? (
            <Skeletons rows={3} />
          ) : applicantsFor ? (
            <Applicants job={applicantsFor} onBack={() => setApplicantsFor(null)} />
          ) : (
            <>
              <div role="tablist" aria-label="My Jobs sections"
                className="mb-4 flex gap-1 border-b border-slate-200 dark:border-white/[0.07]">
                <TabButton id="posted" active={tab === 'posted'} onClick={setTab}
                  label="Posted Jobs" count={counts?.posted} />
                <TabButton id="applied" active={tab === 'applied'} onClick={setTab}
                  label="Applied Jobs" count={counts?.applied} />
              </div>

              <Suspense fallback={<Skeletons rows={3} />}>
                {tab === 'posted'
                  ? <PostedJobs onViewApplicants={setApplicantsFor} />
                  : <AppliedJobs />}
              </Suspense>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function TabButton({ id, label, count, active, onClick }: {
  id: Tab;
  label: string;
  count?: number;
  active: boolean;
  onClick: (t: Tab) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onClick(id)}
      className={`${FOCUS} -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-semibold transition ${
        active
          ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white'
          : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-white/40 dark:hover:text-white/70'
      }`}
    >
      {label}
      {typeof count === 'number' && count > 0 ? (
        <span className="rounded-full bg-slate-200 px-1.5 py-px text-[10.5px] font-bold text-[#334155] dark:bg-[rgba(255,255,255,0.10)] dark:text-white/60">
          {count}
        </span>
      ) : null}
    </button>
  );
}
