'use client';

/**
 * Mail Center → Drafts.
 *
 * A draft is unsent work, and the one thing this screen must never do is turn
 * one into a send. Editing opens the composer; sending still requires the
 * explicit Review step there. Duplicating copies content and audience but not
 * scheduling intent, so a copy cannot inherit a time someone chose for a
 * different message.
 *
 * An API failure renders as an error, never as "No drafts yet" — the second
 * reads as "your work was never saved", which is a very different claim.
 */
import { useCallback, useEffect, useState } from 'react';
import MailCompose from '@/components/superadmin/mail/MailCompose';

interface DraftRow {
  id: string; subject: string; updatedAt: string; updatedBy: string;
  createdAt: string; createdBy: string; revision: number;
  hasAttachments: boolean; audienceMode: string | null;
}

const CARD = 'rounded-xl border border-zinc-800 bg-zinc-900/60 p-4';
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
const HINT = 'mt-1 text-[11px] leading-relaxed text-zinc-500';
const INPUT =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 '
  + 'placeholder:text-zinc-600 outline-none focus-visible:ring-2 focus-visible:ring-amber-500';
const BTN =
  'rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition '
  + 'hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 '
  + 'disabled:opacity-60';
const BTN_PRIMARY =
  'rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-zinc-950 transition hover:bg-amber-400 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-60';

const AUDIENCE_WORD: Record<string, string> = {
  all: 'Everyone', individuals: 'Individuals', businesses: 'Businesses',
  filtered: 'Filtered', selected: 'Selected users', manual: 'Manual addresses',
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

export default function MailDrafts() {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [acting, setActing] = useState(false);

  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DraftRow | null>(null);

  const load = useCallback(async (nextPage = 1) => {
    setLoading(true); setError('');
    try {
      const r = await fetch(
        `/api/super-admin/mail/drafts?page=${nextPage}&q=${encodeURIComponent(query)}`,
        { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Unable to load drafts.'); return; }
      setRows(data.drafts); setPage(data.page);
      setTotalPages(data.totalPages); setTotal(data.total);
    } catch { setError('Could not reach the server.'); }
    finally { setLoading(false); }
  }, [query]);

  useEffect(() => { void load(1); }, [load]);

  const act = useCallback(async (id: string, action: 'delete' | 'duplicate') => {
    if (acting) return; // guards a double-click
    setActing(true); setError(''); setNotice('');
    try {
      const r = action === 'delete'
        ? await fetch(`/api/super-admin/mail/drafts?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        : await fetch('/api/super-admin/mail/drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'duplicate', id }),
          });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Unable to update the draft.'); return; }
      setNotice(action === 'delete'
        ? 'Draft deleted.'
        : 'Draft duplicated. The copy has no schedule and will not send on its own.');
      setConfirmDelete(null);
      await load(page);
    } catch { setError('Could not reach the server.'); }
    finally { setActing(false); }
  }, [acting, load, page]);

  /* Editing reuses the composer, so there is one editor and one save path. */
  if (editing !== null) {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => { setEditing(null); void load(page); }} className={BTN}>
          ← All drafts
        </button>
        <MailCompose draftId={editing || undefined} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className={LABEL} htmlFor="dr-search">Search drafts</label>
          <input id="dr-search" className={INPUT} value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void load(1); } }}
            placeholder="Subject" />
        </div>
        <button type="button" onClick={() => void load(1)} disabled={loading} className={BTN}>
          {loading ? 'Loading…' : 'Search'}
        </button>
        <button type="button" onClick={() => setEditing('')} className={BTN_PRIMARY}>
          New email
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
          {notice}
        </p>
      )}

      {loading && <p className="text-[12px] text-zinc-500" aria-live="polite">Loading drafts…</p>}

      {!loading && !error && rows.length === 0 && (
        <div className={`${CARD} text-center`}>
          <p className="text-[13px] text-zinc-300">
            {query ? 'No drafts match your search.' : 'No drafts yet.'}
          </p>
          <button type="button" onClick={() => setEditing('')} className={`${BTN_PRIMARY} mt-2`}>
            Create email
          </button>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[560px] text-left text-[12px]">
              <thead className="bg-zinc-900">
                <tr className={LABEL}>
                  <th scope="col" className="p-2.5 font-semibold">Subject</th>
                  <th scope="col" className="p-2.5 font-semibold">Audience</th>
                  <th scope="col" className="p-2.5 font-semibold">Modified</th>
                  <th scope="col" className="p-2.5 font-semibold">Created by</th>
                  <th scope="col" className="p-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="border-t border-zinc-900 hover:bg-zinc-800/30">
                    <td className="max-w-[220px] truncate p-2.5 text-zinc-200">
                      {d.subject || '(no subject)'}
                    </td>
                    <td className="p-2.5 text-zinc-400">
                      {d.audienceMode ? (AUDIENCE_WORD[d.audienceMode] ?? d.audienceMode) : 'Not chosen'}
                    </td>
                    <td className="p-2.5 text-zinc-400">{fmt(d.updatedAt)}</td>
                    <td className="max-w-[160px] truncate p-2.5 text-zinc-500">{d.createdBy}</td>
                    <td className="p-2.5">
                      <span className="flex flex-wrap gap-1">
                        <button type="button" onClick={() => setEditing(d.id)}
                          aria-label={`Edit draft ${d.subject}`} className={BTN}>Edit</button>
                        <button type="button" onClick={() => void act(d.id, 'duplicate')}
                          disabled={acting}
                          aria-label={`Duplicate draft ${d.subject}`} className={BTN}>Duplicate</button>
                        <button type="button" onClick={() => setConfirmDelete(d)}
                          disabled={acting}
                          aria-label={`Delete draft ${d.subject}`} className={BTN}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-500">
              {total.toLocaleString()} draft(s) · page {page} of {totalPages}
            </span>
            <span className="flex gap-1">
              <button type="button" className={BTN} disabled={page <= 1 || loading}
                onClick={() => void load(page - 1)}>Previous</button>
              <button type="button" className={BTN} disabled={page >= totalPages || loading}
                onClick={() => void load(page + 1)}>Next</button>
            </span>
          </div>
          <p className={HINT}>
            Drafts are never sent on their own. Sending or scheduling happens only from the review
            step inside the composer.
          </p>
        </>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setConfirmDelete(null)}>
          <div role="dialog" aria-modal="true" aria-label="Delete draft"
            className="w-full max-w-md space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-100">Delete this draft?</h3>
            <p className="text-[12px] text-zinc-300">{confirmDelete.subject || '(no subject)'}</p>
            <p className="text-[12px] text-amber-200">This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className={BTN}>Cancel</button>
              <button type="button" onClick={() => void act(confirmDelete.id, 'delete')}
                disabled={acting}
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-[12px] font-bold text-zinc-950 transition hover:bg-rose-400 disabled:opacity-60">
                {acting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
