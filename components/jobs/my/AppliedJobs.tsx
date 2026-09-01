'use client';

/**
 * Phase 10 — the roles this member applied to.
 *
 * Consumes GET /api/me/applications, which is scoped to the signed-in
 * candidate on the server and re-filters by candidate id as a second line of
 * defence. Paging and filtering are server-side.
 *
 * The score is shown as ATS MATCH. It says how closely this résumé lines up
 * with the description — not how likely the person is to be hired. Presenting
 * it as a chance would set an expectation nobody has made.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import Link from 'next/link';
import {
  APPLICATION_STATUSES, STATUS_LABEL, atsPercent, formatDateTime, pageMeta,
  statusLabel, statusTone,
} from '@/lib/job-ui-status';
import {
  Empty, ErrorNote, FAINT, FIELD, FOCUS, GHOST_BTN, MUTED, PANEL, PRIMARY_BTN,
  Pager, Pill, Skeletons,
} from './ui';
import ApplicantDetail, { type ApplicantSubject } from './ApplicantDetail';

interface AppliedRow {
  applicationId: string;
  jobId: string;
  jobTitle: string;
  organizationName: string;
  location?: string;
  status: string;
  appliedAt: string;
  updatedAt: string;
  atsScore: number;
  atsBand?: string;
  eligibility?: string;
  statusHistory: Array<{ from: string | null; to: string; changedAt: string }>;
}

export default function AppliedJobs() {
  const [rows, setRows] = useState<AppliedRow[] | null>(null);
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0 });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AppliedRow | null>(null);

  const runId = useRef(0);

  const load = useCallback(async () => {
    const id = ++runId.current;
    setError('');
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '20', sort });
      if (status) qs.set('status', status);
      const res = await fetch(`/api/me/applications?${qs}`, { cache: 'no-store' });
      if (id !== runId.current) return;
      if (res.status === 401) { setError('Please sign in to see your applications.'); setRows([]); return; }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Unable to load your applications.');
      setRows(Array.isArray(body?.items) ? body.items : []);
      setMeta({ page: body?.page ?? 1, pageSize: body?.pageSize ?? 20, total: body?.total ?? 0 });
    } catch (e) {
      if (id !== runId.current) return;
      setError(e instanceof Error ? e.message : 'Unable to load your applications.');
      setRows([]);
    }
  }, [page, sort, status]);

  useEffect(() => { load(); }, [load]);

  const m = pageMeta(meta);

  /* The detail sheet is the same component the employer uses, in candidate
     mode — one implementation of the timeline, stages and chat, so the two
     sides can never disagree about what happened. */
  const subject: ApplicantSubject | null = open ? {
    applicationId: open.applicationId,
    candidateName: open.jobTitle,
    headline: open.organizationName,
    location: open.location,
    atsScore: open.atsScore,
    atsBand: open.atsBand,
    eligibility: open.eligibility,
    status: open.status,
    appliedAt: open.appliedAt,
    jobTitle: open.jobTitle,
    organizationName: open.organizationName,
  } : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-0">
          <span className="sr-only">Filter applications by status</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className={`${FIELD} ${FOCUS} w-auto pr-8`}>
            <option value="">All statuses</option>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">Sort applications</span>
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className={`${FIELD} ${FOCUS} w-auto pr-8`}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="updated">Recently updated</option>
          </select>
        </label>
      </div>

      <ErrorNote message={error} onRetry={load} />

      {rows === null ? <Skeletons /> : rows.length === 0 ? (
        <Empty
          title={status ? 'No applications with that status.' : "You haven't applied to any jobs yet."}
          hint={status ? 'Try a different status filter.' : 'Roles you apply to will appear here with their status.'}
          action={status ? null : (
            <Link href="/jobs" className={`${PRIMARY_BTN} ${FOCUS}`}>
              <Search className="h-3.5 w-3.5" aria-hidden /> Browse jobs
            </Link>
          )}
        />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((a) => {
            const applied = formatDateTime(a.appliedAt);
            const updated = formatDateTime(a.updatedAt);
            return (
              <li key={a.applicationId} className={`${PANEL} p-4`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14px] font-bold text-slate-900 dark:text-white">{a.jobTitle}</h3>
                    <p className={`mt-0.5 truncate text-[12.5px] ${MUTED}`}>{a.organizationName}</p>
                    {a.location ? <p className={`truncate text-[11.5px] ${FAINT}`}>{a.location}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[16px] font-bold leading-none text-slate-900 dark:text-white">
                      {atsPercent(a.atsScore)}%
                    </p>
                    <p className={`mt-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] ${FAINT}`}>
                      ATS Match
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <Pill tone={statusTone(a.status)}>{statusLabel(a.status)}</Pill>
                  {applied ? <span className={`text-[11px] ${FAINT}`}>Applied {applied}</span> : null}
                  {updated && updated !== applied ? (
                    <span className={`text-[11px] ${FAINT}`}>· Updated {updated}</span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setOpen(a)} className={`${GHOST_BTN} ${FOCUS}`}>
                    View application
                  </button>
                  <Link href={`/jobs/${encodeURIComponent(a.jobId)}`} className={`${GHOST_BTN} ${FOCUS}`}>
                    View job
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pager page={m.page} pageSize={m.pageSize} total={m.total} onPage={setPage}
        label="Application pages" />

      <ApplicantDetail
        subject={subject}
        viewer="candidate"
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        onChanged={load}
      />
    </div>
  );
}
