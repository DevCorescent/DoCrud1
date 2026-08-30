'use client';

/**
 * ATS evaluation history — /ats/history.
 *
 * Reads GET /api/ats/reports, which scopes every query by the session's own
 * userId, so this page can only ever show the caller's evaluations. Opening a
 * row fetches that one report and renders it with the SAME components the
 * evaluator uses, so a saved report and a fresh one cannot drift apart.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import {
  displayScore, errorMessageForStatus, formatHistoryDate, NETWORK_ERROR_MESSAGE,
  scoreTone, TONE_CLASSES, type AtsApiResponse,
} from './ats-view-model';
import AtsResultsModal from './AtsResultsModal';

const PANEL = 'rounded-2xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-white/[0.03]';
const MUTED = 'text-slate-600 dark:text-white/45';

interface HistoryRow {
  id: string;
  jobTitle: string;
  resumeName: string | null;
  overallScore: number;
  label: string;
  createdAt: string;
}

const PAGE_SIZE = 20;

export default function AtsHistoryPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [openId, setOpenId] = useState<string | null>(null);
  const [openReport, setOpenReport] = useState<AtsApiResponse | null>(null);
  const [openLoading, setOpenLoading] = useState(false);

  const load = useCallback(async (nextOffset: number) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/ats/reports?limit=${PAGE_SIZE}&offset=${nextOffset}`, { cache: 'no-store' });
      if (!response.ok) { setError(errorMessageForStatus(response.status)); return; }
      const data = await response.json();
      setRows(data.items ?? []);
      setTotal(data.total ?? 0);
      setOffset(nextOffset);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(0); }, [load]);

  /* `?report=<id>` deep-links one saved report — how the profile's
     "View Full Analysis" arrives here. A query parameter rather than a new
     route, because this page already renders a report inline and a second
     route would be a second place to keep in step. The id is only ever used
     to ASK the server for a report; ownership is enforced there, so an id
     belonging to someone else simply returns 404. */
  const requestedReport = searchParams?.get('report') ?? null;
  useEffect(() => {
    if (requestedReport) void open(requestedReport);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedReport]);

  const open = useCallback(async (id: string) => {
    setOpenId(id);
    setOpenReport(null);
    setOpenLoading(true);
    try {
      const response = await fetch(`/api/ats/reports/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!response.ok) { setError(errorMessageForStatus(response.status)); setOpenId(null); return; }
      const data = await response.json();
      setOpenReport(data.result as AtsApiResponse);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
      setOpenId(null);
    } finally {
      setOpenLoading(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/ats/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok) { setError(errorMessageForStatus(response.status)); return; }
      if (openId === id) { setOpenId(null); setOpenReport(null); }
      await load(offset);
    } catch {
      setError(NETWORK_ERROR_MESSAGE);
    }
  }, [load, offset, openId]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#08080b] dark:text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">

        <header className="mb-6">
          <Link
            href="/ats/evaluate"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-sky-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-sky-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to the evaluator
          </Link>
          <h1 className="mt-3 text-[26px] font-bold tracking-[-0.02em] sm:text-[30px]">ATS evaluation history</h1>
          <p className={`mt-1.5 text-[13.5px] ${MUTED}`}>
            Every evaluation you have run, newest first. Only you can see these.
          </p>
        </header>

        <div aria-live="polite">
          {error && (
            <p role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>

        {loading && rows.length === 0 && (
          <div className={`${PANEL} h-40 animate-pulse`} aria-hidden />
        )}

        {!loading && rows.length === 0 && !error && (
          <section className={`${PANEL} px-6 py-14 text-center`}>
            <h2 className="text-[17px] font-bold">No evaluations yet</h2>
            <p className={`mx-auto mt-2 max-w-md text-[13px] leading-relaxed ${MUTED}`}>
              Run your first evaluation and it will appear here.
            </p>
            <Link
              href="/ats/evaluate"
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-[13px] font-bold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-white dark:text-[#020617]"
            >
              Evaluate a resume
            </Link>
          </section>
        )}

        {rows.length > 0 && (
          <ul className="space-y-2.5">
            {rows.map((row) => {
              const tone = scoreTone(row.overallScore);
              return (
                <li key={row.id} className={`${PANEL} p-4`}>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-bold">{row.jobTitle}</p>
                      <p className={`mt-1 truncate text-[12px] ${MUTED}`}>
                        {row.resumeName ? `Resume: ${row.resumeName}` : 'Resume: uploaded for this evaluation'}
                        {' · '}{formatHistoryDate(row.createdAt)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className={`text-[22px] font-bold leading-none tabular-nums ${TONE_CLASSES[tone].text}`}>
                        {displayScore(row.overallScore)}%
                      </p>
                      <p className={`mt-1 text-[11.5px] font-semibold ${MUTED}`}>{row.label}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void open(row.id)}
                        aria-haspopup="dialog"
                        className="rounded-xl border border-slate-300 px-3 py-2 text-[12.5px] font-semibold transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.12] dark:hover:bg-white/[0.06]"
                      >
                        Open report
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(row.id)}
                        aria-label={`Delete the evaluation for ${row.jobTitle}`}
                        className="rounded-xl border border-slate-300 p-2 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.12] dark:hover:bg-white/[0.06]"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>

                  {/* A saved report opens in the SAME dialog the evaluator
                      uses, so a stored report and a fresh one are presented
                      identically. Only the loading line stays inline. */}
                  {openId === row.id && openLoading && (
                    <p className={`mt-3 flex items-center gap-2 border-t border-slate-200 pt-3 text-[13px] dark:border-white/[0.07] ${MUTED}`}>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading report…
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <AtsResultsModal
          open={Boolean(openReport)}
          result={openReport}
          jobTitle={rows.find((r) => r.id === openId)?.jobTitle}
          onClose={() => { setOpenId(null); setOpenReport(null); }}
        />

        {total > PAGE_SIZE && (
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => void load(Math.max(0, offset - PAGE_SIZE))}
              className="rounded-xl border border-slate-300 px-4 py-2 text-[12.5px] font-semibold transition hover:bg-slate-100 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.12] dark:hover:bg-white/[0.06]"
            >
              Previous
            </button>
            <span className={`text-[12px] tabular-nums ${MUTED}`}>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= total || loading}
              onClick={() => void load(offset + PAGE_SIZE)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-[12.5px] font-semibold transition hover:bg-slate-100 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/[0.12] dark:hover:bg-white/[0.06]"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
