'use client';

/**
 * Mail Center -> Suppression.
 *
 * Two kinds of record share this list and the difference matters more than
 * anything else on the screen: an ADMIN suppression is an operational decision
 * and can be lifted here, while an UNSUBSCRIBE is a person's own choice and
 * cannot. The store refuses the second case regardless of what this UI does;
 * the UI simply does not offer the button, so nobody is invited to try.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { describeFetchError } from '@/lib/email/session-error';
interface Row {
  email: string;
  reason: 'unsubscribe' | 'admin_suppressed' | 'hard_bounce' | 'complaint';
  /** Decided by the server from the same rule the store enforces. */
  removable: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  source: string;
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
  'rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-zinc-950 transition '
  + 'hover:bg-amber-400 disabled:opacity-60';

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

export default function MailSuppression() {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('all');
  const [active, setActive] = useState('true');

  const [newEmail, setNewEmail] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<Row | null>(null);

  /* Same discipline as Outbox and Analytics: an identical in-flight request is
     collapsed, a different one always goes out, only the newest writes state. */
  const requestSeq = useRef(0);
  const inFlightUrl = useRef<string | null>(null);
  const actingRef = useRef(false);

  const load = useCallback(async (nextPage = 1) => {
    const p = new URLSearchParams({ page: String(nextPage) });
    if (search.trim()) p.set('search', search.trim());
    if (reason !== 'all') p.set('reason', reason);
    if (active !== 'all') p.set('active', active);
    const url = `/api/super-admin/mail/suppression?${p}`;
    if (inFlightUrl.current === url) return;
    inFlightUrl.current = url;
    requestSeq.current += 1;
    const seq = requestSeq.current;
    setLoading(true); setError('');
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      if (seq !== requestSeq.current) return;
      if (!r.ok) { setError(describeFetchError(r.status, data?.error, 'Unable to load the suppression list.')); return; }
      setRows(data.records ?? []);
      setPage(data.page); setTotalPages(data.totalPages); setTotal(data.total);
    } catch {
      if (seq === requestSeq.current) setError('Could not reach the server.');
    } finally {
      if (inFlightUrl.current === url) inFlightUrl.current = null;
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [search, reason, active]);

  useEffect(() => { void load(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [reason, active]);

  const add = useCallback(async () => {
    if (actingRef.current) return;
    actingRef.current = true;
    setError(''); setNotice('');
    try {
      const r = await fetch('/api/super-admin/mail/suppression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim() }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(describeFetchError(r.status, data?.error, 'Unable to add that address.')); return; }
      setNotice(data.alreadySuppressed
        ? 'That address was already suppressed. Nothing changed.'
        : 'Address suppressed. Campaigns will no longer be sent to it.');
      setNewEmail('');
      await load(1);
    } catch { setError('Could not reach the server.'); }
    finally { actingRef.current = false; }
  }, [newEmail, load]);

  const remove = useCallback(async (row: Row) => {
    if (actingRef.current) return;
    actingRef.current = true;
    setError(''); setNotice('');
    try {
      const r = await fetch(
        `/api/super-admin/mail/suppression?email=${encodeURIComponent(row.email)}`,
        { method: 'DELETE' });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(describeFetchError(r.status, data?.error, 'Unable to remove that suppression.')); return; }
      setNotice('Suppression removed. Campaigns may be sent to this address again.');
      setConfirmRemove(null);
      await load(page);
    } catch { setError('Could not reach the server.'); }
    finally { actingRef.current = false; }
  }, [load, page]);

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <p className={LABEL}>Suppression list</p>
        <p className={HINT}>
          Addresses that must not receive campaign or marketing email. The send path checks this
          list again immediately before every send, including retries, so an address added here is
          protected even mid-campaign. Security and account emails — verification codes, password
          resets, account notices — are never suppressed.
        </p>
      </div>

      {/* Add */}
      <div className={CARD}>
        <label className={LABEL} htmlFor="sup-new">Suppress an address</label>
        <div className="flex flex-wrap gap-2">
          <input id="sup-new" type="email" className={`${INPUT} min-w-0 flex-1`} value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newEmail.trim()) { e.preventDefault(); void add(); } }}
            placeholder="person@example.com" />
          <button type="button" onClick={() => void add()} disabled={!newEmail.trim()}
            className={BTN_PRIMARY}>Suppress</button>
        </div>
        <p className={HINT}>Recorded as an administrative suppression, which can be lifted again.</p>
      </div>

      {/* Filters */}
      <div className={CARD}>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className={LABEL} htmlFor="sup-search">Search</label>
            <div className="flex gap-2">
              <input id="sup-search" className={INPUT} value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void load(1); } }}
                placeholder="Email address" />
              <button type="button" onClick={() => void load(1)} disabled={loading}
                className={BTN}>{loading ? '…' : 'Search'}</button>
            </div>
          </div>
          <div>
            <label className={LABEL} htmlFor="sup-reason">Reason</label>
            <select id="sup-reason" className={INPUT} value={reason}
              onChange={(e) => setReason(e.target.value)}>
              <option value="all">All reasons</option>
              <option value="unsubscribe">Unsubscribed</option>
              <option value="admin_suppressed">Admin suppressed</option>
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="sup-active">Status</label>
            <select id="sup-active" className={INPUT} value={active}
              onChange={(e) => setActive(e.target.value)}>
              <option value="true">Active</option>
              <option value="false">Lifted</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
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

      {!loading && rows.length === 0 && !error && (
        <div className={`${CARD} text-center`}>
          <p className="text-[13px] text-zinc-300">No suppressed addresses match these filters.</p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[620px] text-left text-[12px]">
              <thead className="bg-zinc-900">
                <tr className={LABEL}>
                  <th scope="col" className="p-2.5 font-semibold">Address</th>
                  <th scope="col" className="p-2.5 font-semibold">Reason</th>
                  <th scope="col" className="p-2.5 font-semibold">Status</th>
                  <th scope="col" className="p-2.5 font-semibold">Added</th>
                  <th scope="col" className="p-2.5 font-semibold">By</th>
                  <th scope="col" className="p-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.email} className="border-t border-zinc-900 hover:bg-zinc-800/30">
                    <td className="max-w-[220px] truncate p-2.5 text-zinc-200">{row.email}</td>
                    <td className="p-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        row.reason === 'unsubscribe' ? 'bg-sky-500/15 text-sky-300'
                          : row.reason === 'complaint' ? 'bg-rose-500/15 text-rose-300'
                            : row.reason === 'hard_bounce' ? 'bg-orange-500/15 text-orange-300'
                              : 'bg-zinc-700 text-zinc-300'}`}>
                        {row.reason === 'unsubscribe' ? 'Unsubscribed'
                          : row.reason === 'complaint' ? 'Complaint'
                            : row.reason === 'hard_bounce' ? 'Hard bounce'
                              : 'Admin suppressed'}
                      </span>
                    </td>
                    <td className="p-2.5 text-zinc-400">{row.active ? 'Active' : 'Lifted'}</td>
                    <td className="p-2.5 text-zinc-500">{fmt(row.createdAt)}</td>
                    <td className="max-w-[160px] truncate p-2.5 text-zinc-500">{row.createdBy}</td>
                    <td className="p-2.5">
                      {row.removable ? (
                        <button type="button" onClick={() => setConfirmRemove(row)}
                          aria-label={`Remove suppression for ${row.email}`}
                          className={BTN}>Remove</button>
                      ) : (
                        /* No affordance at all for an unsubscribe: offering a
                           button that always fails would be worse than none. */
                        <span className="text-[11px] text-zinc-600">
                          {!row.active ? '—'
                            : row.reason === 'complaint' ? 'Reported as spam'
                              : 'Recipient opted out'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-500">
              {total.toLocaleString()} address(es) · page {page} of {totalPages}
            </span>
            <span className="flex gap-1">
              <button type="button" className={BTN} disabled={page <= 1 || loading}
                onClick={() => void load(page - 1)}>Previous</button>
              <button type="button" className={BTN} disabled={page >= totalPages || loading}
                onClick={() => void load(page + 1)}>Next</button>
            </span>
          </div>
          <p className={HINT}>
            An unsubscribe or a spam complaint cannot be lifted from here — both are the
            recipient&apos;s own signal. A hard bounce can be lifted if the mailbox is restored.
          </p>
        </>
      )}

      {confirmRemove && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setConfirmRemove(null)}>
          <div role="dialog" aria-modal="true" aria-label="Remove suppression"
            className="w-full max-w-md space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-100">Remove this suppression?</h3>
            <p className="break-words text-[12px] text-zinc-300">{confirmRemove.email}</p>
            <p className="text-[12px] text-amber-200">
              Campaign email may be sent to this address again.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmRemove(null)} className={BTN}>Cancel</button>
              <button type="button" onClick={() => void remove(confirmRemove)}
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-[12px] font-bold text-zinc-950 hover:bg-rose-400">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
