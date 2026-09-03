'use client';

/**
 * Manage Companies — the Super Admin panel behind the strip's Manage button.
 *
 * Glass over a dimmed page, a small close control top-right, Escape to close,
 * and a focus trap — the same modal behaviour the rest of the app uses.
 *
 * ═══ ORDER IS MANUAL ═══
 *
 * The sequence here IS the sequence on the homepage. Job count is shown as
 * INFORMATION beside each row; it never sorts anything. Drag a row, or use the
 * up/down controls — which exist because drag alone is unusable on a phone and
 * unreachable from a keyboard.
 *
 * Nothing is authorized here. The browser sends the intent; the server decides
 * whether this caller may write it, and a non-admin's PATCH is refused there.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Loader2, Search, Trash2, X } from 'lucide-react';
import {
  formatCompanyJobCount, type CompanyExplorerEntry, type CompanyExplorerTile,
} from '@/lib/company-explorer';
import CompanyLogo from './CompanyLogo';
import CompanyLogoUploader from './CompanyLogoUploader';

interface Payload {
  items: CompanyExplorerEntry[];
  available: CompanyExplorerTile[];
}

export default function CompanyExplorerManageModal({
  onClose, onSaved,
}: { onClose: () => void; onSaved: () => void }) {
  const [items, setItems] = useState<CompanyExplorerEntry[] | null>(null);
  const [available, setAvailable] = useState<CompanyExplorerTile[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  /* Which row's logo panel is open, and the marks already uploaded. Local to
     this modal — nothing global learns about an admin's open panel. */
  const [logoFor, setLogoFor] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Record<string, string>>({});
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  /** The marks Super Admin has uploaded, so a row can say which it is using. */
  const loadUploaded = useCallback(async () => {
    try {
      const res = await fetch('/api/super-admin/company-logo', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as { logos?: Array<{ id: string; url: string }> };
      setUploaded(Object.fromEntries((data.logos ?? []).map((l) => [l.id, l.url])));
    } catch { /* the panel still works; a row just cannot show "uploaded" */ }
  }, []);

  useEffect(() => { void loadUploaded(); }, [loadUploaded]);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/super-admin/company-explorer', { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        setError('You are not signed in as a super admin.'); setItems([]); return;
      }
      const body = (await res.json().catch(() => null)) as Payload | null;
      if (!res.ok || !body) throw new Error('Unable to load companies.');
      setItems(body.items ?? []);
      setAvailable(body.available ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load companies.');
      setItems([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Escape, focus trap, body-scroll lock, focus restored on close. */
  useEffect(() => {
    restoreRef.current = (document.activeElement as HTMLElement) ?? null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const f = Array.from(root.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      cancelAnimationFrame(raf);
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  const save = async (next: CompanyExplorerEntry[]) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/super-admin/company-explorer', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: next.map((c, i) => ({ ...c, order: i })) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || 'That change could not be saved.');
      setItems(body?.items ?? next);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That change could not be saved.');
      /* Re-read rather than keep an optimistic list the server rejected. */
      load();
    } finally { setBusy(false); }
  };

  const move = (id: string, dir: -1 | 1) => {
    if (!items) return;
    const i = items.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    setItems(next); save(next);
  };
  const drop = (targetId: string) => {
    if (!items || !dragId || dragId === targetId) return;
    const from = items.findIndex((c) => c.id === dragId);
    const to = items.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next); setDragId(null); save(next);
  };
  const toggle = (id: string) => {
    if (!items) return;
    const next = items.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c));
    setItems(next); save(next);
  };
  const remove = (id: string) => {
    if (!items) return;
    const next = items.filter((c) => c.id !== id);
    setItems(next); save(next);
  };
  const setWebsite = (id: string, websiteUrl: string) => {
    if (!items) return;
    setItems(items.map((c) => (c.id === id ? { ...c, websiteUrl } : c)));
  };
  /* Saved on blur, not on every keystroke — a PATCH per character would be a
     write per letter, and the resolver invalidates that company on each one. */
  const commitWebsite = () => { if (items) save(items); };

  const add = (c: CompanyExplorerTile) => {
    if (!items || items.some((i) => i.id === c.id)) return;   // never a duplicate
    const next = [...items, { id: c.id, name: c.name, order: items.length, visible: true }];
    setItems(next); setQuery(''); save(next);
  };

  const configured = new Set((items ?? []).map((c) => c.id));
  const countOf = (id: string) => available.find((a) => a.id === id)?.jobCount ?? 0;
  const logoOf  = (id: string) => available.find((a) => a.id === id)?.logoUrl ?? '';
  const q = query.trim().toLowerCase();
  const addable = available.filter((c) => !configured.has(c.id) && (!q || c.name.toLowerCase().includes(q)));

  const ROW = 'flex items-center gap-2.5 rounded-xl px-2.5 py-2';
  const ROW_STYLE = { background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' };
  const ICON_BTN = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition disabled:opacity-30';
  const ICON_STYLE = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)' };

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center p-0 sm:items-center sm:p-4"
      style={{ background: 'rgba(6,6,8,0.60)', backdropFilter: 'blur(3px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef} role="dialog" aria-modal="true" aria-label="Manage companies" tabIndex={-1}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl outline-none sm:max-h-[86dvh] sm:max-w-lg sm:rounded-2xl"
        style={{ background: 'rgba(18,18,22,0.78)', backdropFilter: 'blur(28px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 24px 70px rgba(0,0,0,0.55)' }}
      >
        <div className="flex shrink-0 items-start gap-3 px-4 py-3.5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-bold text-white">Manage Companies</p>
            <p className="mt-0.5 text-[11.5px]" style={{ color: 'rgba(255,255,255,0.42)' }}>
              Add, remove or reorder companies in Company Explorer
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition"
            style={ICON_STYLE}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {error ? (
            <p role="alert" className="mb-3 rounded-xl px-3 py-2 text-[12px] font-medium"
              style={{ background: 'rgba(251,113,133,0.10)', border: '1px solid rgba(251,113,133,0.25)', color: 'rgba(253,164,175,0.95)' }}>
              {error}
            </p>
          ) : null}

          <p className="mb-2 text-[9.5px] font-bold uppercase tracking-[0.12em]"
            style={{ color: 'rgba(255,255,255,0.28)' }}>
            In the explorer — this order is the homepage order
          </p>

          {items === null ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded-xl" style={ROW_STYLE} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="rounded-xl px-3 py-4 text-center text-[12px]"
              style={{ ...ROW_STYLE, color: 'rgba(255,255,255,0.40)' }}>
              No companies yet. Add one below and it appears on the homepage.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((c, i) => (
                <li key={c.id} className={`${ROW} flex-wrap`} style={ROW_STYLE}
                  draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(c.id)}
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab"
                    style={{ color: 'rgba(255,255,255,0.25)' }} aria-hidden />
                  <span className="w-4 shrink-0 text-[10px] font-bold tabular-nums"
                    style={{ color: 'rgba(255,255,255,0.30)' }}>{i + 1}</span>
                  <CompanyLogo name={c.name} logoUrl={logoOf(c.id)} size={22} rounded={7} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold"
                    style={{ color: c.visible ? 'rgba(255,255,255,0.86)' : 'rgba(255,255,255,0.38)' }}>
                    {c.name}
                  </span>
                  <span className="shrink-0 text-[10px] font-bold tabular-nums"
                    style={{ color: 'rgba(255,255,255,0.32)' }}>
                    {formatCompanyJobCount(countOf(c.id))}
                  </span>
                  {/* Keyboard- and touch-reachable reordering; drag is the shortcut. */}
                  <button type="button" onClick={() => move(c.id, -1)} disabled={i === 0 || busy}
                    aria-label={`Move ${c.name} up`} className={ICON_BTN} style={ICON_STYLE}>
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => move(c.id, 1)} disabled={i === items.length - 1 || busy}
                    aria-label={`Move ${c.name} down`} className={ICON_BTN} style={ICON_STYLE}>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <button type="button" onClick={() => toggle(c.id)} disabled={busy}
                    aria-label={c.visible ? `Hide ${c.name}` : `Show ${c.name}`}
                    className="shrink-0 rounded-full px-2 py-[3px] text-[9.5px] font-bold transition"
                    style={c.visible
                      ? { background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.28)', color: 'rgba(110,231,183,0.95)' }
                      : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.40)' }}>
                    {c.visible ? 'Visible' : 'Hidden'}
                  </button>
                  {/* Opens this company's logo panel. Uploading is what makes
                      the mark authoritative everywhere it is shown. */}
                  <button type="button" onClick={() => setLogoFor(logoFor === c.id ? null : c.id)}
                    disabled={busy}
                    aria-label={`${uploaded[c.id] ? 'Replace' : 'Upload'} logo for ${c.name}`}
                    aria-expanded={logoFor === c.id}
                    className="shrink-0 rounded-full px-2 py-[3px] text-[9.5px] font-bold transition"
                    style={uploaded[c.id]
                      ? { background: 'rgba(167,139,250,0.13)', border: '1px solid rgba(167,139,250,0.30)', color: 'rgb(196,181,253)' }
                      : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.40)' }}>
                    {uploaded[c.id] ? '\u2713 Logo' : 'Logo'}
                  </button>
                  {/* Removes it from the EXPLORER only — the company, its jobs
                      and its applications are untouched. */}
                  <button type="button" onClick={() => remove(c.id)} disabled={busy}
                    aria-label={`Remove ${c.name} from the explorer`} className={ICON_BTN} style={ICON_STYLE}>
                    <Trash2 className="h-3 w-3" />
                  </button>

                  {logoFor === c.id && (
                    <div className="w-full">
                      <CompanyLogoUploader
                        companyId={c.id}
                        companyName={c.name}
                        currentLogoUrl={uploaded[c.id] || logoOf(c.id)}
                        hasUpload={Boolean(uploaded[c.id])}
                        onChanged={() => { void loadUploaded(); }}
                      />
                    </div>
                  )}

                  {/* THE ONLY DOMAIN SOURCE IN THE SYSTEM. No ATS provider
                      reports a company website, and one is never derived from
                      the name — a guessed domain that resolves would render
                      another company's mark. Set this and the resolver looks
                      for that origin's favicon; leave it and the row keeps its
                      initials, which is the correct answer. */}
                  <label className="col-span-full mt-1 block w-full basis-full">
                    <span className="sr-only">{c.name} website</span>
                    <input
                      type="url"
                      value={c.websiteUrl ?? ''}
                      onChange={(e) => setWebsite(c.id, e.target.value)}
                      onBlur={commitWebsite}
                      placeholder="https://company.com — optional, enables logo lookup"
                      className="h-7 w-full rounded-lg px-2 text-[11px] outline-none"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.70)' }}
                    />
                  </label>
                </li>
              ))}
            </ul>
          )}

          <p className="mb-2 mt-5 text-[9.5px] font-bold uppercase tracking-[0.12em]"
            style={{ color: 'rgba(255,255,255,0.28)' }}>
            Add a company
          </p>
          <label className="relative mb-2 block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              style={{ color: 'rgba(255,255,255,0.28)' }} aria-hidden />
            <span className="sr-only">Search companies</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search companies…"
              className="h-9 w-full rounded-xl pl-8 pr-3 text-[12.5px] outline-none"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff' }} />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {addable.length === 0 ? (
              <p className="text-[11.5px]" style={{ color: 'rgba(255,255,255,0.34)' }}>
                {query ? 'No companies match that search.' : 'Every company is already in the explorer.'}
              </p>
            ) : addable.slice(0, 40).map((c) => (
              <button key={c.id} type="button" onClick={() => add(c)} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[11px] font-semibold transition"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.62)' }}>
                <CompanyLogo name={c.name} logoUrl={c.logoUrl} size={20} rounded={6} />
                {c.name}
                <span className="tabular-nums" style={{ color: 'rgba(255,255,255,0.30)' }}>
                  {formatCompanyJobCount(c.jobCount)}
                </span>
              </button>
            ))}
          </div>

          {busy ? (
            <p className="mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.40)' }}>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Saving…
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
