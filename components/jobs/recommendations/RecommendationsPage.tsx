'use client';

/**
 * Phase 11 — Recommended for You.
 *
 * Consumes GET /api/recommendations/jobs?scope=personalized, which is the ONLY
 * authority here. That endpoint ranks the jobs, excludes the ones this member
 * already applied to, scores them with the Phase 6 ATS engine and decides
 * eligibility with Phase 5.
 *
 * THIS FILE RANKS NOTHING. Rows are rendered in the order they arrive and are
 * never re-sorted, re-scored or re-filtered — a second opinion formed in the
 * browser would quietly disagree with the engine that produced the order.
 *
 * Same marketplace shell as /jobs, /jobs/my and /jobs/[id]: a 56px fixed header,
 * a rigid 100dvh frame and one scrolling column, in both colour modes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { pageMeta } from '@/lib/job-ui-status';
import {
  Empty, ErrorNote, FAINT, FOCUS, MUTED, PANEL, Pager, PRIMARY_BTN, Skeletons,
} from '../my/ui';
import RecommendationCard, { type RecommendationRow } from './RecommendationCard';
import MatchBreakdown from './MatchBreakdown';

/** What went wrong, in words the reader can act on. */
function errorFor(status: number): string {
  if (status === 401) return 'Please sign in to see jobs recommended for you.';
  if (status === 403) return 'You do not have access to recommendations.';
  if (status === 404) return 'Recommendations are not available right now.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500) return 'Recommendations are temporarily unavailable. Please try again.';
  return 'Unable to load your recommendations.';
}

export default function RecommendationsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<RecommendationRow[] | null>(null);
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0 });
  const [scored, setScored] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [explain, setExplain] = useState<RecommendationRow | null>(null);

  /* A slow response for an abandoned page must never overwrite a newer one. */
  const runId = useRef(0);

  const load = useCallback(async () => {
    const id = ++runId.current;
    setError('');
    try {
      const res = await fetch(
        `/api/recommendations/jobs?scope=personalized&page=${page}&pageSize=20`,
        { cache: 'no-store' },
      );
      if (id !== runId.current) return;
      if (!res.ok) { setError(errorFor(res.status)); setRows([]); return; }

      const body = await res.json().catch(() => null);
      if (id !== runId.current) return;
      /* A 200 carrying something that is not a list is a FAILURE, not an empty
         feed. Rendering "no recommendations" for a malformed response would
         tell the member their profile matched nothing when nobody looked. */
      if (!body || !Array.isArray(body.items)) {
        setError('Recommendations came back in an unexpected format.');
        setRows([]);
        return;
      }
      setRows(body.items as RecommendationRow[]);
      setMeta({ page: body.page ?? 1, pageSize: body.pageSize ?? 20, total: body.total ?? 0 });
      setScored(body.scored !== false);
    } catch {
      if (id !== runId.current) return;
      setError('Could not reach the server. Check your connection and try again.');
      setRows([]);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const m = pageMeta(meta);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#f8fafc] text-slate-900 dark:bg-[#0A0A0C] dark:text-white">
      <header
        className="shrink-0 z-30 border-b border-slate-200 bg-[rgba(255,255,255,0.95)] backdrop-blur-xl dark:border-white/[0.06] dark:bg-[rgba(10,10,12,0.95)]"
        style={{ height: 56 }}
      >
        <div className="flex h-full items-center gap-3 px-3 sm:px-5 lg:px-8">
          <button onClick={() => router.back()} aria-label="Back"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-slate-300 bg-[#ffffff] text-slate-500 transition hover:bg-[#f8fafc] hover:text-slate-900 dark:border-white/[0.08] dark:bg-[rgba(255,255,255,0.04)] dark:text-white/48 dark:hover:bg-[rgba(255,255,255,0.08)] dark:hover:text-white ${FOCUS}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
          <h1 className="truncate text-[15px] font-bold tracking-[-0.01em] text-slate-900 dark:text-white">
            Recommended for You
          </h1>
          <Link href="/jobs" className={`${PRIMARY_BTN} ${FOCUS} ml-auto shrink-0`}>
            All jobs
          </Link>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl px-3 pb-28 pt-4 sm:px-5 lg:px-8">

          {/* Shown only when the server said it could not score this member —
              never as a guess about how complete their profile is. */}
          {rows !== null && !scored && !error ? (
            <div className={`${PANEL} mb-3 flex flex-wrap items-center gap-3 p-4`}>
              <Sparkles className="h-4 w-4 shrink-0 text-slate-500 dark:text-white/40" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-slate-900 dark:text-white">
                  Improve your recommendations
                </p>
                <p className={`mt-0.5 text-[12px] leading-relaxed ${MUTED}`}>
                  Add your skills or upload a résumé and these roles will be matched against them.
                </p>
              </div>
              <Link href="/profile" className={`${PRIMARY_BTN} ${FOCUS}`}>Update profile</Link>
            </div>
          ) : null}

          {rows !== null && rows.length > 0 ? (
            <p className={`mb-2 text-[11.5px] ${FAINT}`}>
              {m.total} {m.total === 1 ? 'role' : 'roles'} matched to your profile
            </p>
          ) : null}

          <ErrorNote message={error} onRetry={load} />

          {rows === null ? (
            /* Skeletons match the real card height, so nothing jumps when the
               data lands. */
            <Skeletons rows={4} />
          ) : rows.length === 0 && !error ? (
            <Empty
              title="No jobs match your profile yet."
              hint="As new roles are posted they will be matched against your skills and experience. Adding more detail to your profile widens what can be matched."
              action={<Link href="/profile" className={`${PRIMARY_BTN} ${FOCUS}`}>Update profile</Link>}
            />
          ) : (
            <ul className="space-y-3">
              {rows.map((job) => (
                <RecommendationCard key={job.id} job={job} onExplain={setExplain} />
              ))}
            </ul>
          )}

          <Pager page={m.page} pageSize={m.pageSize} total={m.total} onPage={setPage}
            label="Recommendation pages" />
        </div>
      </main>

      <MatchBreakdown job={explain} open={Boolean(explain)} onClose={() => setExplain(null)} />
    </div>
  );
}
