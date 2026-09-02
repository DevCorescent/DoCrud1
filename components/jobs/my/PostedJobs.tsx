'use client';

/**
 * Phase 10 — the postings this member owns.
 *
 * Consumes GET /api/hiring/jobs/mine. SEARCH, FILTER, SORT AND PAGING ARE ALL
 * SENT TO THE SERVER — nothing is filtered in the browser. An employer with
 * 400 postings must not download 400 rows to type in a search box, and the
 * counts shown on each row are tallied server-side from one applications read,
 * so a page of 20 jobs is one request, not twenty-one.
 *
 * Editing reuses the existing composer at /jobs/post?edit=<id>. There is no
 * second job editor.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, PencilLine, Plus, Trash2, Users } from 'lucide-react';
import {
  formatSalaryRange, formatDateOnly, pageMeta, removalCopy, removalOutcome,
} from '@/lib/job-ui-status';
import { EMPLOYMENT_TYPE_LABELS, WORK_MODE_LABELS, formatJobLocation } from '@/lib/jobs-ui';
import {
  DANGER_BTN, Empty, ErrorNote, FAINT, FIELD, FOCUS, GHOST_BTN, MUTED, PANEL,
  PRIMARY_BTN, Pager, Pill, Sheet, Skeletons,
} from './ui';

interface JobRow {
  id: string;
  title: string;
  organizationName: string;
  location?: string;
  workMode?: string;
  employmentType?: string;
  status: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  applicantCount: number;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
}

/**
 * The query the parent's probe issues, so its response can seed this panel.
 * These MUST match the defaults below — a seed produced by a different query
 * would show the wrong rows.
 */
export const SEED_PAGE_SIZE = 20;
export const SEED_SORT = 'newest';

export interface PostedSeed {
  items: unknown[];
  page: number;
  pageSize: number;
  total: number;
}

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'applicants', label: 'Most applicants' },
  { value: 'updated', label: 'Recently updated' },
] as const;

const STATES = [
  { value: '', label: 'All postings' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
] as const;

export default function PostedJobs({ onViewApplicants, seed }: {
  onViewApplicants: (job: { id: string; title: string }) => void;
  /** The parent's first-page response, reused instead of re-requesting it. */
  seed?: PostedSeed | null;
}) {
  /* Seeded rows render immediately; without a seed the panel loads as before. */
  const [rows, setRows] = useState<JobRow[] | null>(
    seed ? (seed.items as JobRow[]) : null,
  );
  const [meta, setMeta] = useState(
    seed
      ? { page: seed.page, pageSize: seed.pageSize, total: seed.total }
      : { page: 1, pageSize: 20, total: 0 },
  );
  /* A seed answers the FIRST load only. Every later load — a filter, a sort, a
     page change, or a refresh after closing a job — must go to the server, or
     the list would show what was true when the page opened. */
  const seedUsed = useRef(Boolean(seed));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [state, setState] = useState('');
  const [sort, setSort] = useState<string>('newest');
  const [page, setPage] = useState(1);

  const [pending, setPending] = useState<JobRow | null>(null);
  const [busy, setBusy] = useState(false);

  /* One request per settled keystroke burst, not one per character. */
  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  /* A slow response for an abandoned filter must never overwrite a newer one. */
  const runId = useRef(0);

  const load = useCallback(async () => {
    /* The parent already fetched exactly this query; skip the duplicate. */
    if (seedUsed.current) { seedUsed.current = false; return; }
    const id = ++runId.current;
    setError('');
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '20', sort });
      if (debounced.trim()) qs.set('search', debounced.trim());
      if (state) qs.set('state', state);
      const res = await fetch(`/api/hiring/jobs/mine?${qs}`, { cache: 'no-store' });
      if (id !== runId.current) return;
      if (res.status === 401) { setError('Please sign in to see your posted jobs.'); setRows([]); return; }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'Unable to load your posted jobs.');
      setRows(Array.isArray(body?.items) ? body.items : []);
      setMeta({ page: body?.page ?? 1, pageSize: body?.pageSize ?? 20, total: body?.total ?? 0 });
    } catch (e) {
      if (id !== runId.current) return;
      setError(e instanceof Error ? e.message : 'Unable to load your posted jobs.');
      setRows([]);
    }
  }, [page, sort, debounced, state]);

  useEffect(() => { load(); }, [load]);

  /**
   * Close or delete.
   *
   * We ASK for the mode the dialog offered, then report the mode the SERVER
   * says it used. Those differ whenever an application arrives between the
   * dialog opening and the button being pressed, and the server is right.
   */
  const remove = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setError('');
    try {
      const mode = pending.applicantCount === 0 ? 'delete' : 'unpublish';
      const res = await fetch(`/api/hiring/jobs/${encodeURIComponent(pending.id)}?mode=${mode}`,
        { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'That change could not be saved.');
      setNotice(removalOutcome(body ?? {}));
      setPending(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That change could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const copy = pending ? removalCopy(pending.applicantCount) : null;
  const m = pageMeta(meta);

  return (
    <div className="space-y-3">
      {/* Filters. On phones they wrap to full width and stay tappable. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1 basis-full sm:basis-56">
          <span className="sr-only">Search your posted jobs</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title or location" className={`${FIELD} ${FOCUS}`} />
        </label>
        <label className="min-w-0">
          <span className="sr-only">Filter by posting state</span>
          <select value={state} onChange={(e) => { setState(e.target.value); setPage(1); }}
            className={`${FIELD} ${FOCUS} w-auto pr-8`}>
            {STATES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">Sort posted jobs</span>
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className={`${FIELD} ${FOCUS} w-auto pr-8`}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      <ErrorNote message={error} onRetry={load} />
      {notice ? (
        <p role="status"
          className="rounded-[12px] border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] font-medium text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/[0.08] dark:text-emerald-200/90">
          {notice}
        </p>
      ) : null}

      {rows === null ? <Skeletons /> : rows.length === 0 ? (
        <Empty
          title={debounced || state ? 'No postings match those filters.' : "You haven't posted any jobs yet."}
          hint={debounced || state
            ? 'Try a different search, or clear the filters.'
            : 'Post a role and it will appear here with its applicants.'}
          action={debounced || state ? null : (
            <Link href="/jobs/post" className={`${PRIMARY_BTN} ${FOCUS}`}>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Post a job
            </Link>
          )}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((job) => {
            const salary = formatSalaryRange(job);
            const posted = formatDateOnly(job.createdAt);
            const updated = formatDateOnly(job.updatedAt);
            const facts = [
              formatJobLocation(job.location, job.workMode),
              job.employmentType ? EMPLOYMENT_TYPE_LABELS[job.employmentType] ?? job.employmentType : '',
              job.workMode ? WORK_MODE_LABELS[job.workMode] ?? job.workMode : '',
              salary ?? '',
            ].filter(Boolean);

            return (
              <li key={job.id} className={`${PANEL} p-4`}>
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[14.5px] font-bold text-slate-900 dark:text-white">{job.title}</h3>
                    <p className={`mt-0.5 truncate text-[12.5px] ${MUTED}`}>{job.organizationName}</p>
                  </div>
                  <Pill tone={job.isActive ? 'positive' : 'neutral'}>
                    {job.isActive ? 'Active' : 'Closed'}
                  </Pill>
                </div>

                {facts.length > 0 ? (
                  <p className={`mt-2 text-[12.5px] ${MUTED}`}>{facts.join(' · ')}</p>
                ) : null}

                <p className={`mt-1 text-[11.5px] ${FAINT}`}>
                  {posted ? `Posted ${posted}` : null}
                  {posted && updated && updated !== posted ? ' · ' : null}
                  {updated && updated !== posted ? `Updated ${updated}` : null}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {/* The applicant count is the primary action: it is why an
                      employer opens this page at all. */}
                  <button type="button" onClick={() => onViewApplicants(job)}
                    className={`${GHOST_BTN} ${FOCUS}`}>
                    <Users className="h-3.5 w-3.5" aria-hidden />
                    {job.applicantCount} {job.applicantCount === 1 ? 'applicant' : 'applicants'}
                  </button>
                  <Link href={`/jobs/${encodeURIComponent(job.id)}`} className={`${GHOST_BTN} ${FOCUS}`}>
                    View
                  </Link>
                  <Link href={`/jobs/post?edit=${encodeURIComponent(job.id)}`} className={`${GHOST_BTN} ${FOCUS}`}>
                    <PencilLine className="h-3.5 w-3.5" aria-hidden /> Edit
                  </Link>
                  <button type="button" onClick={() => { setNotice(''); setPending(job); }}
                    className={`${GHOST_BTN} ${FOCUS} ml-auto`}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {job.applicantCount > 0 ? 'Close' : 'Delete'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Pager page={m.page} pageSize={m.pageSize} total={m.total}
        onPage={setPage} label="Posted jobs pages" />

      <Sheet open={Boolean(pending)} title={copy?.title ?? ''} onClose={() => !busy && setPending(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPending(null)} disabled={busy}
              className={`${GHOST_BTN} ${FOCUS}`}>Cancel</button>
            <button type="button" onClick={remove} disabled={busy} className={`${DANGER_BTN} ${FOCUS}`}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              {copy?.confirmLabel}
            </button>
          </div>
        }>
        <p className={`text-[13px] leading-relaxed ${MUTED}`}>{copy?.body}</p>
      </Sheet>
    </div>
  );
}
