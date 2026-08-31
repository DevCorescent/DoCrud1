'use client';

/**
 * Recipient picker.
 *
 * THE INVARIANT: this component chooses an audience DEFINITION. It never
 * computes who is in it, never holds a recipient list, and never sends a count
 * to the server. Every number shown here came back from
 * `/api/super-admin/mail/recipients`, which resolved the definition against the
 * live user store. A count computed in a browser is unverifiable, and a
 * recipient list posted from a browser would let a crafted request mail anyone.
 *
 * User search is paginated server-side for the same reason it is everywhere
 * else in this panel: the user table is not something to load into a tab.
 *
 * Selections survive paging and searching, because losing them silently on
 * page 2 is how an admin ends up mailing the wrong people.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

export type AudienceMode = 'all' | 'individuals' | 'businesses' | 'filtered' | 'selected' | 'manual';

export interface Segment {
  mode: AudienceMode;
  userIds?: string[];
  emails?: string[];
  filters?: {
    accountType?: 'business' | 'individual';
    status?: 'active' | 'inactive';
    role?: string;
    createdWithinDays?: number;
    hasLoggedIn?: 'yes' | 'no';
    search?: string;
  };
}

export interface Resolution {
  description: string;
  selected: number;
  excluded: number;
  invalid: number;
  final: number;
  invalidSamples: string[];
}

interface UserRow {
  id: string; name: string; email: string; role: string;
  accountType: string; organizationName?: string; isActive: boolean;
}
interface PreviewRow {
  name: string; email: string; organizationName?: string; role: string;
  isActive: boolean; outcome: 'included' | 'excluded' | 'invalid'; reason: string;
}

const LABEL = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
const HINT = 'mt-1 text-[11px] leading-relaxed text-zinc-500';
const INPUT =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 '
  + 'placeholder:text-zinc-600 outline-none focus-visible:ring-2 focus-visible:ring-amber-500';
const BTN =
  'rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition '
  + 'hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 '
  + 'disabled:opacity-60';
const BTN_PRIMARY =
  'rounded-lg bg-amber-500 px-4 py-2 text-[12px] font-bold text-zinc-950 transition hover:bg-amber-400 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-60';

const MODES: { value: AudienceMode; label: string; blurb: string }[] = [
  { value: 'all', label: 'Everyone', blurb: 'All eligible accounts.' },
  { value: 'individuals', label: 'Individuals', blurb: 'Individual accounts only.' },
  { value: 'businesses', label: 'Businesses', blurb: 'Business accounts only.' },
  { value: 'filtered', label: 'Filter users', blurb: 'Build an audience from conditions.' },
  { value: 'selected', label: 'Selected users', blurb: 'Pick people individually.' },
  { value: 'manual', label: 'Manual addresses', blurb: 'Type addresses directly.' },
];

export default function RecipientPicker({
  initial, onCancel, onApply,
}: {
  initial: Segment | null;
  onCancel: () => void;
  onApply: (segment: Segment, resolution: Resolution) => void;
}) {
  const [mode, setMode] = useState<AudienceMode>(initial?.mode ?? 'all');
  const [filters, setFilters] = useState<NonNullable<Segment['filters']>>(initial?.filters ?? {});
  const [manualText, setManualText] = useState((initial?.emails ?? []).join('\n'));
  /* Keyed by id so a selection made on page 1 survives paging to page 3. */
  const [selected, setSelected] = useState<Map<string, UserRow>>(new Map());

  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [searching, setSearching] = useState(false);

  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState('');

  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [rowsLoading, setRowsLoading] = useState(false);

  const segment: Segment = useMemo(() => ({
    mode,
    filters: mode === 'filtered' ? filters : undefined,
    userIds: mode === 'selected' ? Array.from(selected.keys()) : undefined,
    emails: mode === 'manual'
      /* Comma, semicolon or newline — admins paste from anywhere. */
      ? manualText.split(/[\n,;]+/).map((e) => e.trim()).filter(Boolean)
      : undefined,
  }), [mode, filters, selected, manualText]);

  /* Changing the audience invalidates any count already on screen. Showing a
     stale number next to new conditions is how the wrong send gets approved. */
  useEffect(() => { setResolution(null); setRows(null); }, [segment]);

  const search = useCallback(async (nextPage = 1) => {
    setSearching(true); setError('');
    try {
      const r = await fetch(
        `/api/super-admin/mail/recipients?q=${encodeURIComponent(query)}&page=${nextPage}`,
        { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Unable to search users.'); return; }
      setUsers(data.users); setPage(data.page);
      setTotalPages(data.totalPages); setTotalUsers(data.total);
    } catch { setError('Could not reach the server.'); }
    finally { setSearching(false); }
  }, [query]);

  useEffect(() => {
    if (mode === 'selected') void search(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const resolve = useCallback(async (withRows = false) => {
    if (resolving) return;
    if (withRows) setRowsLoading(true); else setResolving(true);
    setError('');
    try {
      const r = await fetch('/api/super-admin/mail/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment, includeRows: withRows }),
      });
      const data = await r.json().catch(() => null);
      /* A failure is NOT zero recipients — those are different states, and
         conflating them invites "looks empty, must be fine". */
      if (!r.ok) { setError(data?.error || 'Unable to resolve recipients.'); return; }
      setResolution(data);
      if (withRows) setRows(data.rows ?? []);
    } catch { setError('Could not reach the server.'); }
    finally { setResolving(false); setRowsLoading(false); }
  }, [segment, resolving]);

  const toggle = (u: UserRow) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(u.id)) next.delete(u.id); else next.set(u.id, u);
      return next;
    });
  };

  const canApply = Boolean(resolution && resolution.final > 0);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label="Choose recipients"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-zinc-800 bg-zinc-900"
        onClick={(e) => e.stopPropagation()}>

        <div className="border-b border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-zinc-100">Choose recipients</h3>
          <p className={HINT}>
            The audience is resolved on the server. Counts shown here come from the live user
            records, not from this browser.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {/* ── Mode ── */}
          <fieldset>
            <legend className={LABEL}>Audience type</legend>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {MODES.map((m) => (
                <label key={m.value}
                  className={`flex cursor-pointer gap-2 rounded-lg border p-2.5 transition ${
                    mode === m.value ? 'border-amber-500/60 bg-amber-500/10' : 'border-zinc-800 hover:bg-zinc-800/50'}`}>
                  <input type="radio" name="audience-mode" value={m.value} checked={mode === m.value}
                    onChange={() => setMode(m.value)} className="mt-0.5 h-4 w-4 accent-amber-500" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-zinc-100">{m.label}</span>
                    <span className="block text-[11px] text-zinc-500">{m.blurb}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* ── Filters ── */}
          {mode === 'filtered' && (
            <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="rp-acct">Account type</label>
                <select id="rp-acct" className={INPUT} value={filters.accountType ?? ''}
                  onChange={(e) => setFilters({ ...filters, accountType: (e.target.value || undefined) as never })}>
                  <option value="">Any</option>
                  <option value="individual">Individual</option>
                  <option value="business">Business</option>
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor="rp-status">Status</label>
                <select id="rp-status" className={INPUT} value={filters.status ?? ''}
                  onChange={(e) => setFilters({ ...filters, status: (e.target.value || undefined) as never })}>
                  <option value="">Any</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor="rp-role">Role</label>
                <input id="rp-role" className={INPUT} value={filters.role ?? ''}
                  onChange={(e) => setFilters({ ...filters, role: e.target.value || undefined })}
                  placeholder="e.g. admin" />
              </div>
              <div>
                <label className={LABEL} htmlFor="rp-days">Registered within (days)</label>
                <input id="rp-days" className={INPUT} inputMode="numeric"
                  value={filters.createdWithinDays ?? ''}
                  onChange={(e) => setFilters({
                    ...filters,
                    createdWithinDays: e.target.value ? Number(e.target.value) : undefined,
                  })} placeholder="Any" />
              </div>
              <div>
                <label className={LABEL} htmlFor="rp-login">Has logged in</label>
                <select id="rp-login" className={INPUT} value={filters.hasLoggedIn ?? ''}
                  onChange={(e) => setFilters({ ...filters, hasLoggedIn: (e.target.value || undefined) as never })}>
                  <option value="">Any</option>
                  <option value="yes">Yes</option>
                  <option value="no">Never</option>
                </select>
              </div>
              <div>
                <label className={LABEL} htmlFor="rp-search">Name, email or organisation</label>
                <input id="rp-search" className={INPUT} value={filters.search ?? ''}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
                  placeholder="Contains…" />
              </div>
              <p className={`${HINT} sm:col-span-2`}>
                Only conditions backed by real user fields are offered. Location filters are absent
                because that data is not stored on a user.
              </p>
            </div>
          )}

          {/* ── Individual selection ── */}
          {mode === 'selected' && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className={LABEL} htmlFor="rp-q">Search users</label>
                  <input id="rp-q" className={INPUT} value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void search(1); } }}
                    placeholder="Name, email or organisation" />
                </div>
                <button type="button" onClick={() => void search(1)} disabled={searching} className={BTN}>
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </div>

              <div className="mt-3 max-h-56 overflow-y-auto rounded border border-zinc-800">
                {searching && <p className="p-3 text-[12px] text-zinc-500" aria-live="polite">Searching…</p>}
                {!searching && users.length === 0 && (
                  <p className="p-3 text-[12px] text-zinc-500">No users matched.</p>
                )}
                {!searching && users.map((u) => (
                  <label key={u.id}
                    className="flex cursor-pointer items-start gap-2 border-b border-zinc-900 p-2 last:border-0 hover:bg-zinc-800/40">
                    <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u)}
                      className="mt-0.5 h-4 w-4 accent-amber-500"
                      aria-label={`Select ${u.name || u.email}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] text-zinc-200">{u.name || '(no name)'}</span>
                      <span className="block truncate text-[11px] text-zinc-500">{u.email}</span>
                      <span className="block truncate text-[11px] text-zinc-600">
                        {u.role}{u.organizationName ? ` · ${u.organizationName}` : ''}
                        {u.isActive ? '' : ' · inactive'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-zinc-500">
                  {totalUsers.toLocaleString()} matched · page {page} of {totalPages}
                </span>
                <span className="flex gap-1">
                  <button type="button" className={BTN} disabled={page <= 1 || searching}
                    onClick={() => void search(page - 1)}>Previous</button>
                  <button type="button" className={BTN} disabled={page >= totalPages || searching}
                    onClick={() => void search(page + 1)}>Next</button>
                </span>
              </div>

              {selected.size > 0 && (
                <div className="mt-3 rounded border border-zinc-800 bg-black/30 p-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-zinc-200">
                      Selected: {selected.size}
                    </p>
                    <button type="button" className={BTN} onClick={() => setSelected(new Map())}>
                      Clear all
                    </button>
                  </div>
                  <ul className="mt-1.5 max-h-32 overflow-y-auto">
                    {Array.from(selected.values()).map((u) => (
                      <li key={u.id} className="flex items-center justify-between gap-2 py-0.5">
                        <span className="min-w-0 truncate text-[11px] text-zinc-400">
                          {u.name || u.email} · {u.email}
                        </span>
                        <button type="button" onClick={() => toggle(u)}
                          aria-label={`Remove ${u.email}`}
                          className="shrink-0 text-[12px] text-zinc-500 hover:text-rose-400">×</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* ── Manual addresses ── */}
          {mode === 'manual' && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <label className={LABEL} htmlFor="rp-manual">Addresses</label>
              <textarea id="rp-manual" rows={5} className={INPUT} value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={'one@example.com, two@example.com\nthree@example.com'} />
              <p className={HINT}>
                Separate with commas, semicolons or new lines. Duplicates and invalid addresses are
                identified when you preview — none are silently discarded.
              </p>
            </div>
          )}

          {/* ── Resolution ── */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={LABEL}>Audience preview</p>
              <span className="flex gap-2">
                <button type="button" onClick={() => void resolve(false)} disabled={resolving}
                  className={BTN}>
                  {resolving ? 'Resolving…' : 'Preview recipients'}
                </button>
                {resolution && (
                  <button type="button" onClick={() => void resolve(true)} disabled={rowsLoading}
                    className={BTN}>
                    {rowsLoading ? 'Loading…' : 'View recipients'}
                  </button>
                )}
              </span>
            </div>

            {error && (
              <p role="alert" className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[12px] text-rose-300">
                {error}
              </p>
            )}

            {!resolution && !error && (
              <p className={HINT}>
                Preview to see exactly how many people this reaches. Nothing can be sent until the
                server has resolved the audience.
              </p>
            )}

            {resolution && (
              <>
                <p className="mt-2 text-[12px] text-zinc-300">{resolution.description}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    ['Matched', resolution.selected, 'text-zinc-100'],
                    ['Excluded', resolution.excluded, resolution.excluded ? 'text-amber-400' : 'text-zinc-100'],
                    ['Invalid', resolution.invalid, resolution.invalid ? 'text-rose-400' : 'text-zinc-100'],
                    ['Final', resolution.final, 'text-emerald-400'],
                  ].map(([label, value, tone]) => (
                    <div key={String(label)} className="rounded border border-zinc-800 bg-black/30 px-2 py-1.5">
                      <p className={`text-lg font-black tabular-nums ${tone}`}>{Number(value).toLocaleString()}</p>
                      <p className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">{label}</p>
                    </div>
                  ))}
                </div>
                {/* Excluded people were never contacted — not a delivery failure. */}
                <p className={HINT}>
                  Excluded accounts are skipped before sending (inactive, no address, or duplicate).
                  They are not failed recipients.
                </p>
                {resolution.invalidSamples.length > 0 && (
                  <p className="mt-1 break-all text-[11px] text-rose-300">
                    Invalid: {resolution.invalidSamples.join(', ')}
                  </p>
                )}
                {resolution.final === 0 && (
                  <p role="alert" className="mt-2 text-[12px] font-semibold text-rose-300">
                    No valid recipients found. This audience cannot be sent to.
                  </p>
                )}
              </>
            )}

            {rows && (
              <div className="mt-3 max-h-64 overflow-auto rounded border border-zinc-800">
                <table className="w-full min-w-[460px] text-left text-[11px]">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                      <th scope="col" className="p-2 font-semibold">Name</th>
                      <th scope="col" className="p-2 font-semibold">Email</th>
                      <th scope="col" className="p-2 font-semibold">Result</th>
                      <th scope="col" className="p-2 font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.email}-${i}`} className="border-t border-zinc-900">
                        <td className="max-w-[120px] truncate p-2 text-zinc-300">{r.name || '—'}</td>
                        <td className="max-w-[160px] truncate p-2 text-zinc-400">{r.email || '—'}</td>
                        <td className={`p-2 font-semibold capitalize ${
                          r.outcome === 'included' ? 'text-emerald-400'
                            : r.outcome === 'invalid' ? 'text-rose-400' : 'text-amber-400'}`}>
                          {r.outcome}
                        </td>
                        <td className="p-2 text-zinc-500">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-4 py-3">
          <p className="text-[11px] text-zinc-500">
            {canApply
              ? `${resolution!.final.toLocaleString()} recipient(s) will be used.`
              : 'Preview the audience before applying it.'}
          </p>
          <span className="flex gap-2">
            <button type="button" onClick={onCancel} className={BTN}>Cancel</button>
            <button type="button" disabled={!canApply} className={BTN_PRIMARY}
              onClick={() => resolution && onApply(segment, resolution)}>
              Use this audience
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
