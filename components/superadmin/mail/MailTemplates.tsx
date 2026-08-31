'use client';

/**
 * Mail Center → Templates.
 *
 * A template is reusable CONTENT. It has no recipients, no schedule and no
 * send button, and nothing on this screen can dispatch an email.
 *
 * The editor is `RichEmailEditor` — the same component Compose uses. A second
 * editor would mean two sanitization surfaces, two sets of toolbar bugs, and
 * two places for the caret handling to regress.
 *
 * Saves carry a `revision`; a write built on a stale one comes back 409 and is
 * surfaced rather than silently discarding either version.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import RichEmailEditor from '@/components/superadmin/mail/RichEmailEditor';
import EmailPreviewDialog, { type PreviewMode } from '@/components/superadmin/mail/EmailPreviewDialog';
import TestSendDialog from '@/components/superadmin/mail/TestSendDialog';

import { describeFetchError } from '@/lib/email/session-error';
interface TemplateRow {
  id: string; name: string; category: string; subject: string;
  status: string; revision: number;
  createdBy: string; updatedBy: string; createdAt: string; updatedAt: string;
}
interface FullTemplate extends TemplateRow { html: string; text: string; preheader?: string }

const CARD = 'rounded-xl border border-zinc-800 bg-zinc-900/60 p-4';
const LABEL = 'mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
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

const CATEGORY_WORD: Record<string, string> = {
  marketing: 'Marketing', system: 'System', transactional: 'Transactional', general: 'General',
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

/* The client-side `{{variable}}` substitution that used to live here is gone.
   It carried its own sample values - John Doe, john@example.com - while the
   server used different ones, so the preview an admin approved was rendered by
   different code, with different data, from the email that would be sent.
   Both now come from the canonical renderer. */

export default function MailTemplates() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [variables, setVariables] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [acting, setActing] = useState(false);
  const actingRef = useRef(false);

  /* Editor state. `editing === ''` is a new template. */
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', subject: '', preheader: '', category: 'general', html: '',
  });
  const [revision, setRevision] = useState<number | null>(null);
  const [loadingOne, setLoadingOne] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [preview, setPreview] = useState<'off' | PreviewMode>('off');
  const [showTest, setShowTest] = useState(false);
  /** The template currently OPEN (distinct from the list filter above), so an
      archived one cannot be test-sent. */
  const [editingStatus, setEditingStatus] = useState<'active' | 'archived'>('active');
  const [confirmDelete, setConfirmDelete] = useState<TemplateRow | null>(null);

  const load = useCallback(async (nextPage = 1) => {
    setLoading(true); setError('');
    try {
      const r = await fetch(
        `/api/super-admin/mail/templates?page=${nextPage}&q=${encodeURIComponent(query)}`
        + `&category=${encodeURIComponent(category)}&status=${encodeURIComponent(status)}`,
        { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      /* An API failure is not "no templates" — the second implies none were
         ever created. */
      if (!r.ok) { setError(describeFetchError(r.status, data?.error, 'Unable to load templates.')); return; }
      setRows(data.templates); setPage(data.page);
      setTotalPages(data.totalPages); setTotal(data.total);
      setVariables(data.variables ?? []);
    } catch { setError('Could not reach the server.'); }
    finally { setLoading(false); }
  }, [query, category, status]);

  useEffect(() => { void load(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [category, status]);

  const openEditor = useCallback(async (id: string) => {
    setEditing(id); setError(''); setNotice(''); setUnknown([]); setPreview('off');
    if (!id) {
      setForm({ name: '', subject: '', preheader: '', category: 'general', html: '' });
      setRevision(null);
      setEditingStatus('active');
      return;
    }
    setLoadingOne(true);
    try {
      const r = await fetch(`/api/super-admin/mail/templates?id=${encodeURIComponent(id)}`,
        { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Template not found.'); return; }
      const t: FullTemplate = data.template;
      setForm({
        name: t.name, subject: t.subject, preheader: t.preheader ?? '',
        category: t.category, html: t.html,
      });
      setRevision(t.revision);
      setEditingStatus(t.status === 'archived' ? 'archived' : 'active');
      setUnknown(data.unknown ?? []);
    } catch { setError('Could not reach the server.'); }
    finally { setLoadingOne(false); }
  }, []);

  const save = useCallback(async () => {
    if (savingRef.current) return;      // synchronous: state updates too late
    if (!form.name.trim()) { setError('A template name is required.'); return; }
    if (!form.subject.trim()) { setError('A subject is required.'); return; }
    savingRef.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/super-admin/mail/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing || undefined, ...form, revision: revision ?? undefined,
        }),
      });
      const data = await r.json().catch(() => null);
      if (r.status === 409) {
        setError('This template was changed by another administrator. Reload the latest version before saving.');
        return;
      }
      /* Never report Saved when the server refused. */
      if (!r.ok) { setError(data?.error || 'Unable to save template.'); return; }
      setEditing(data.template.id);
      setRevision(data.template.revision);
      setUnknown(data.unknown ?? []);
      setNotice('Template saved.');
    } catch { setError('Could not reach the server.'); }
    finally { savingRef.current = false; setSaving(false); }
  }, [form, editing, revision]);

  const act = useCallback(async (id: string, action: 'duplicate' | 'archive' | 'restore' | 'delete') => {
    if (actingRef.current) return;
    actingRef.current = true; setActing(true); setError(''); setNotice('');
    try {
      const r = action === 'delete'
        ? await fetch(`/api/super-admin/mail/templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
        : await fetch('/api/super-admin/mail/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, id }),
          });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Unable to update the template.'); return; }
      setNotice({
        duplicate: 'Template duplicated.',
        archive: 'Template archived. Existing campaigns and drafts are unaffected.',
        restore: 'Template restored.',
        delete: 'Template deleted. Campaigns already sent from it are unaffected.',
      }[action]);
      setConfirmDelete(null);
      await load(page);
    } catch { setError('Could not reach the server.'); }
    finally { actingRef.current = false; setActing(false); }
  }, [load, page]);

  /* Preview is the shared dialog: it fetches its own canonical render from the
     CURRENT form values, so unsaved edits are what gets previewed. */

  const insertVariable = (v: string) => {
    /* Appending to the body is unambiguous; guessing a caret position inside
       another component's DOM is not. */
    setForm((f) => ({ ...f, html: `${f.html}<span>{{${v}}}</span>` }));
  };

  /* ── Editor ── */
  if (editing !== null) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => { setEditing(null); void load(page); }} className={BTN}>
            ← All templates
          </button>
          <span aria-live="polite" className="text-[12px]">
            {saving ? <span className="text-zinc-400">Saving…</span>
              : notice ? <span className="text-emerald-400">{notice}</span> : null}
          </span>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {error}
          </p>
        )}

        {loadingOne ? (
          <p className="text-sm text-zinc-500" aria-live="polite">Loading template…</p>
        ) : (
          <>
            <section className={CARD}>
              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <label className={LABEL} htmlFor="tpl-name">Template name</label>
                  <input id="tpl-name" className={INPUT} value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Welcome email" />
                </div>
                <div>
                  <label className={LABEL} htmlFor="tpl-cat">Category</label>
                  <select id="tpl-cat" className={INPUT} value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {Object.entries(CATEGORY_WORD).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className={LABEL} htmlFor="tpl-subject">Subject</label>
                  <input id="tpl-subject" className={INPUT} value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="Welcome to Docrud, {{firstName}}" />
                </div>
                <div className="lg:col-span-2">
                  <label className={LABEL} htmlFor="tpl-pre">Preview text (optional)</label>
                  <input id="tpl-pre" className={INPUT} value={form.preheader}
                    onChange={(e) => setForm({ ...form, preheader: e.target.value })} />
                </div>
              </div>
            </section>

            <section className={CARD}>
              <p className={LABEL}>Available variables</p>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((v) => (
                  <button key={v} type="button" onClick={() => insertVariable(v)}
                    aria-label={`Insert ${v} variable`}
                    className="rounded border border-zinc-700 px-2 py-1 font-mono text-[11px] text-amber-300 hover:bg-zinc-800">
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
              <p className={HINT}>
                Resolved per recipient when a campaign runs. The preview substitutes fixed sample
                values — sample data is never used as an audience.
              </p>
              {unknown.length > 0 && (
                <p role="alert" className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[12px] text-rose-300">
                  Unknown variable{unknown.length === 1 ? '' : 's'}: {unknown.map((u) => `{{${u}}}`).join(', ')}.
                  These cannot be resolved and will block sending.
                </p>
              )}
            </section>

            <section className={CARD}>
              <p className={LABEL}>Content</p>
              <RichEmailEditor value={form.html} onChange={(html) => setForm((f) => ({ ...f, html }))}
                disabled={saving} />
            </section>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap gap-2">
                {(['desktop', 'mobile', 'text'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setPreview(m)}
                    className={`${BTN} capitalize`}>{m === 'text' ? 'Text' : m} preview</button>
                ))}
                <button type="button" onClick={() => setShowTest(true)}
                  disabled={!form.subject.trim() || !form.html.trim()}
                  className={BTN}>Send test…</button>
              </span>
              <button type="button" onClick={() => void save()} disabled={saving} className={BTN_PRIMARY}>
                {saving ? 'Saving…' : 'Save template'}
              </button>
            </div>
          </>
        )}

        <EmailPreviewDialog
          open={preview !== 'off'}
          onClose={() => setPreview('off')}
          source="template"
          subject={form.subject}
          html={form.html}
          preheader={form.preheader}
          initialMode={preview === 'off' ? 'desktop' : preview}
        />

        <TestSendDialog
          open={showTest}
          onClose={() => setShowTest(false)}
          source="template"
          subject={form.subject}
          html={form.html}
          preheader={form.preheader}
          contextLabel={form.name || '(unnamed template)'}
          /* An archived template is not something to be mailing, even as a
             test. Reactivate it first, deliberately. */
          blockedReason={editingStatus === 'archived'
            ? 'This template is archived. Restore it before sending a test.'
            : unknown.length
              ? `Remove unsupported variables first: ${unknown.map((u) => `{{${u}}}`).join(', ')}`
              : undefined}
        />
      </div>
    );
  }

  /* ── List ── */
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className={LABEL} htmlFor="tpl-search">Search templates</label>
          <input id="tpl-search" className={INPUT} value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void load(1); } }}
            placeholder="Name or subject" />
        </div>
        <div>
          <label className={LABEL} htmlFor="tpl-fcat">Category</label>
          <select id="tpl-fcat" className={INPUT} value={category}
            onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {Object.entries(CATEGORY_WORD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="tpl-fstatus">Status</label>
          <select id="tpl-fstatus" className={INPUT} value={status}
            onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <button type="button" onClick={() => void load(1)} disabled={loading} className={BTN}>
          {loading ? 'Loading…' : 'Search'}
        </button>
        <button type="button" onClick={() => void openEditor('')} className={BTN_PRIMARY}>
          Create template
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

      {loading && <p className="text-[12px] text-zinc-500" aria-live="polite">Loading templates…</p>}

      {!loading && !error && rows.length === 0 && (
        <div className={`${CARD} text-center`}>
          <p className="text-[13px] text-zinc-300">
            {query || category || status ? 'No templates match your search.' : 'No email templates yet.'}
          </p>
          <button type="button" onClick={() => void openEditor('')} className={`${BTN_PRIMARY} mt-2`}>
            Create template
          </button>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[620px] text-left text-[12px]">
              <thead className="bg-zinc-900">
                <tr className={LABEL}>
                  <th scope="col" className="p-2.5 font-semibold">Template</th>
                  <th scope="col" className="p-2.5 font-semibold">Category</th>
                  <th scope="col" className="p-2.5 font-semibold">Status</th>
                  <th scope="col" className="p-2.5 font-semibold">Updated</th>
                  <th scope="col" className="p-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-t border-zinc-900 hover:bg-zinc-800/30">
                    <td className="max-w-[220px] p-2.5">
                      <span className="block truncate text-zinc-200">{t.name}</span>
                      <span className="block truncate text-[11px] text-zinc-500">{t.subject}</span>
                    </td>
                    <td className="p-2.5 text-zinc-400">{CATEGORY_WORD[t.category] ?? t.category}</td>
                    <td className={`p-2.5 font-semibold ${t.status === 'archived' ? 'text-zinc-500' : 'text-emerald-400'}`}>
                      {t.status === 'archived' ? 'Archived' : 'Active'}
                    </td>
                    <td className="p-2.5 text-zinc-400">{fmt(t.updatedAt)}</td>
                    <td className="p-2.5">
                      <span className="flex flex-wrap gap-1">
                        <button type="button" onClick={() => void openEditor(t.id)}
                          aria-label={`Edit template ${t.name}`} className={BTN}>Edit</button>
                        <button type="button" onClick={() => void act(t.id, 'duplicate')} disabled={acting}
                          aria-label={`Duplicate template ${t.name}`} className={BTN}>Duplicate</button>
                        <button type="button" disabled={acting}
                          onClick={() => void act(t.id, t.status === 'archived' ? 'restore' : 'archive')}
                          aria-label={`${t.status === 'archived' ? 'Restore' : 'Archive'} template ${t.name}`}
                          className={BTN}>{t.status === 'archived' ? 'Restore' : 'Archive'}</button>
                        <button type="button" onClick={() => setConfirmDelete(t)} disabled={acting}
                          aria-label={`Delete template ${t.name}`} className={BTN}>Delete</button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-500">
              {total.toLocaleString()} template(s) · page {page} of {totalPages}
            </span>
            <span className="flex gap-1">
              <button type="button" className={BTN} disabled={page <= 1 || loading}
                onClick={() => void load(page - 1)}>Previous</button>
              <button type="button" className={BTN} disabled={page >= totalPages || loading}
                onClick={() => void load(page + 1)}>Next</button>
            </span>
          </div>
          <p className={HINT}>
            Templates are content only. Using one copies it into a draft, so editing a template
            never changes an email that has already been sent.
          </p>
        </>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setConfirmDelete(null)}>
          <div role="dialog" aria-modal="true" aria-label="Delete template"
            className="w-full max-w-md space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-100">Delete this template?</h3>
            <p className="text-[12px] text-zinc-300">{confirmDelete.name}</p>
            <p className="text-[12px] text-amber-200">
              This cannot be undone. Campaigns and drafts already created from it are unaffected.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className={BTN}>Cancel</button>
              <button type="button" onClick={() => void act(confirmDelete.id, 'delete')} disabled={acting}
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
