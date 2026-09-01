'use client';

/**
 * Phase 10 — the ranked applicant list for one job.
 *
 * Consumes GET /api/hiring/jobs/[jobId]/applicants, which ranks by ATS score
 * descending with a deterministic candidate-id tie-break and pages on the
 * server. This component is built for a job with 2,000 applicants:
 *
 *   · ONE request per page of 25. Never "load all, then filter".
 *   · NO per-row profile request. Every field on the card is already in the row.
 *   · NO résumé is touched until someone opens an applicant and clicks.
 *
 * The heading states the sort order, because a ranked list that does not say
 * it is ranked invites the reader to assume it is chronological.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileText } from 'lucide-react';
import {
  APPLICATION_STATUSES, STATUS_LABEL, atsMatchLabel, atsPercent, eligibilityLabel,
  eligibilityTone, formatDateTime, pageMeta, statusLabel, statusTone,
} from '@/lib/job-ui-status';
import {
  Avatar, Empty, ErrorNote, FAINT, FIELD, FOCUS, GHOST_BTN, MUTED, PANEL, Pager,
  Pill, Skeletons,
} from './ui';
import ApplicantDetail, { type ApplicantSubject } from './ApplicantDetail';

const MIN_ATS_STEPS = [
  { value: '', label: 'Any ATS Match' },
  { value: '80', label: 'ATS Match 80%+' },
  { value: '60', label: 'ATS Match 60%+' },
  { value: '40', label: 'ATS Match 40%+' },
];

const SORTS = [
  { value: 'ats', label: 'ATS Match (high to low)' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name (A–Z)' },
];

export default function Applicants({ job, onBack }: {
  job: { id: string; title: string };
  onBack: () => void;
}) {
  const [rows, setRows] = useState<ApplicantSubject[] | null>(null);
  const [meta, setMeta] = useState({ page: 1, pageSize: 25, total: 0 });
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('');
  const [minAts, setMinAts] = useState('');
  const [sort, setSort] = useState('ats');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ApplicantSubject | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const runId = useRef(0);

  const load = useCallback(async () => {
    const id = ++runId.current;
    setError('');
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '25', sort });
      if (debounced.trim()) qs.set('search', debounced.trim());
      if (status) qs.set('status', status);
      if (minAts) qs.set('minAts', minAts);
      const res = await fetch(
        `/api/hiring/jobs/${encodeURIComponent(job.id)}/applicants?${qs}`, { cache: 'no-store' });
      if (id !== runId.current) return;
      if (res.status === 401) { setError('Please sign in to view applicants.'); setRows([]); return; }
      if (res.status === 404) { setError('That job is not available to you.'); setRows([]); return; }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Unable to load applicants.');
      setRows(Array.isArray(body?.items) ? body.items : []);
      setMeta({ page: body?.page ?? 1, pageSize: body?.pageSize ?? 25, total: body?.total ?? 0 });
    } catch (e) {
      if (id !== runId.current) return;
      setError(e instanceof Error ? e.message : 'Unable to load applicants.');
      setRows([]);
    }
  }, [job.id, page, sort, debounced, status, minAts]);

  useEffect(() => { load(); }, [load]);

  const m = pageMeta(meta);
  const filtered = Boolean(debounced || status || minAts);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onBack} aria-label="Back to posted jobs"
          className={`${GHOST_BTN} ${FOCUS} h-8 w-8 shrink-0 px-0`}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14.5px] font-bold text-slate-900 dark:text-white">{job.title}</h2>
          {/* The order is stated in words. It is a match ranking, not a forecast. */}
          <p className={`mt-0.5 text-[11.5px] ${FAINT}`}>
            {m.total} {m.total === 1 ? 'applicant' : 'applicants'} · Sorted by ATS Match
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1 basis-full sm:basis-48">
          <span className="sr-only">Search applicants</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or skill" className={`${FIELD} ${FOCUS}`} />
        </label>
        <label className="min-w-0">
          <span className="sr-only">Filter by application status</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className={`${FIELD} ${FOCUS} w-auto pr-8`}>
            <option value="">All statuses</option>
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">Filter by minimum ATS Match</span>
          <select value={minAts} onChange={(e) => { setMinAts(e.target.value); setPage(1); }}
            className={`${FIELD} ${FOCUS} w-auto pr-8`}>
            {MIN_ATS_STEPS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">Sort applicants</span>
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className={`${FIELD} ${FOCUS} w-auto pr-8`}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <ErrorNote message={error} onRetry={load} />

      {rows === null ? <Skeletons /> : rows.length === 0 ? (
        <Empty
          title={filtered ? 'No applicants match those filters.' : 'No applications yet.'}
          hint={filtered
            ? 'Try widening the ATS Match range or clearing the status filter.'
            : 'Applicants will appear here, ranked by ATS Match, as soon as people apply.'}
        />
      ) : (
        <ul className="space-y-2.5">
          {rows.map((a) => (
            <li key={a.applicationId} className={`${PANEL} p-3.5`}>
              <div className="flex items-start gap-3">
                <Avatar name={a.candidateName} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-slate-900 dark:text-white">
                    {a.candidateName || 'Candidate'}
                  </p>
                  {a.headline ? (
                    <p className={`truncate text-[12px] ${MUTED}`}>{a.headline}</p>
                  ) : null}
                  {a.location ? (
                    <p className={`truncate text-[11.5px] ${FAINT}`}>{a.location}</p>
                  ) : null}
                </div>
                {/* The score reads as a match, in every viewport. */}
                <div className="shrink-0 text-right">
                  <p className="text-[16px] font-bold leading-none text-slate-900 dark:text-white">
                    {atsPercent(a.atsScore)}%
                  </p>
                  <p className={`mt-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] ${FAINT}`}>
                    ATS Match
                  </p>
                </div>
              </div>

              {a.skills && a.skills.length > 0 ? (
                <p className={`mt-2 truncate text-[11.5px] ${MUTED}`}>{a.skills.slice(0, 6).join(' · ')}</p>
              ) : null}

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <Pill tone={statusTone(a.status)}>{statusLabel(a.status)}</Pill>
                {a.eligibility ? (
                  <Pill tone={eligibilityTone(a.eligibility)}>{eligibilityLabel(a.eligibility)}</Pill>
                ) : null}
                {a.hasResume ? (
                  <span className={`inline-flex items-center gap-1 text-[11px] ${FAINT}`}>
                    <FileText className="h-3 w-3" aria-hidden /> Résumé
                  </span>
                ) : null}
                {formatDateTime(a.appliedAt) ? (
                  <span className={`text-[11px] ${FAINT}`}>Applied {formatDateTime(a.appliedAt)}</span>
                ) : null}
              </div>

              <div className="mt-2.5">
                <button type="button" onClick={() => setOpen({ ...a, jobTitle: job.title })}
                  aria-label={`Open ${a.candidateName || 'candidate'}, ${atsMatchLabel(a.atsScore)}`}
                  className={`${GHOST_BTN} ${FOCUS} w-full sm:w-auto`}>
                  View profile
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager page={m.page} pageSize={m.pageSize} total={m.total} onPage={setPage}
        label="Applicant pages" />

      <ApplicantDetail
        subject={open}
        viewer="employer"
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        onChanged={load}
      />
    </div>
  );
}
