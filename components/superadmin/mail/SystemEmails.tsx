'use client';

/**
 * Mail Center → System emails.
 *
 * These are the emails the application sends by itself. Editing here changes
 * the real thing — but only after Publish: senders read the published version,
 * so a half-written draft never reaches a user.
 *
 * Only emails whose sender actually reads this configuration are listed. A
 * screen that edits settings nothing consumes is worse than no screen, because
 * it looks like it worked.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import RichEmailEditor from '@/components/superadmin/mail/RichEmailEditor';
import EmailPreviewDialog, { type PreviewMode } from '@/components/superadmin/mail/EmailPreviewDialog';
import TestSendDialog from '@/components/superadmin/mail/TestSendDialog';

interface EmailRow {
  type: string; name: string; trigger: string; sender: string; required: boolean;
  customised: boolean; published: boolean; hasUnpublishedChanges: boolean;
  updatedAt: string | null; updatedBy: string | null; publishedAt: string | null;
  revision: number;
}
interface Definition {
  type: string; name: string; trigger: string; sender: string;
  variables: string[]; sampleValues: Record<string, string>;
  required: boolean; defaultSubject: string; defaultHtml: string;
}

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

const fmt = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

export default function SystemEmails() {
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [editing, setEditing] = useState<string | null>(null);
  const [def, setDef] = useState<Definition | null>(null);
  const [subject, setSubject] = useState('');
  const [html, setHtml] = useState('');
  const [revision, setRevision] = useState<number | null>(null);
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [loadingOne, setLoadingOne] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [preview, setPreview] = useState<'off' | PreviewMode>('off');
  const [showTest, setShowTest] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/super-admin/mail/system-emails', { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Unable to load system emails.'); return; }
      setRows(data.emails);
    } catch { setError('Could not reach the server.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const open = useCallback(async (type: string) => {
    setEditing(type); setLoadingOne(true); setError(''); setNotice(''); setPreview('off');
    try {
      const r = await fetch(`/api/super-admin/mail/system-emails?type=${encodeURIComponent(type)}`,
        { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Unknown system email.'); return; }
      setDef(data.definition);
      setSubject(data.draft.subject);
      setHtml(data.draft.html);
      setRevision(data.config?.revision ?? null);
      setUnsupported(data.unsupported ?? []);
    } catch { setError('Could not reach the server.'); }
    finally { setLoadingOne(false); }
  }, []);

  const post = useCallback(async (body: Record<string, unknown>, success: string) => {
    if (busyRef.current) return null;          // synchronous double-click guard
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/super-admin/mail/system-emails', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => null);
      if (r.status === 409) {
        setError('This system email was changed by another administrator. Reload before saving.');
        return null;
      }
      if (!r.ok) {
        /* A provider rejection is reported with its classification, never
           rounded up to success. */
        setError([
          data?.error || 'Something went wrong.',
          data?.providerCode ? `SMTP ${data.providerCode}` : null,
          data?.retryable === false ? 'This failure is permanent.' : null,
          data?.advice,
        ].filter(Boolean).join(' · '));
        if (Array.isArray(data?.unsupported)) setUnsupported(data.unsupported);
        return null;
      }
      setNotice(success);
      if (data.config) setRevision(data.config.revision);
      if (Array.isArray(data.unsupported)) setUnsupported(data.unsupported);
      return data;
    } catch { setError('Could not reach the server.'); return null; }
    finally { busyRef.current = false; setBusy(false); }
  }, []);

  /* The inline `{{variable}}` substitution that used to live here is gone. It
     was a second resolver running in the browser over the server's HTML; the
     shared dialog asks the server to resolve, so preview and send agree by
     construction rather than by two functions happening to match. */

  /* ── Editor ── */
  if (editing !== null) {
    const blocked = unsupported.length > 0;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => { setEditing(null); void load(); }} className={BTN}>
            ← All system emails
          </button>
          <span aria-live="polite" className="text-[12px]">
            {busy ? <span className="text-zinc-400">Working…</span>
              : notice ? <span className="text-emerald-400">{notice}</span> : null}
          </span>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {error}
          </p>
        )}

        {loadingOne || !def ? (
          <p className="text-sm text-zinc-500" aria-live="polite">Loading system email…</p>
        ) : (
          <>
            <section className={CARD}>
              <h3 className="text-[15px] font-bold text-zinc-100">{def.name}</h3>
              <p className={HINT}>Sent when: {def.trigger}</p>
              <p className={HINT}>
                Editing changes the real email, but only after you publish. Until then the
                application keeps using the previously published version.
              </p>
              {def.required && (
                <p className="mt-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-400">
                  This system email is required by the application and cannot be disabled.
                </p>
              )}
            </section>

            <section className={CARD}>
              <label className={LABEL} htmlFor="se-subject">Subject</label>
              <input id="se-subject" className={INPUT} value={subject}
                onChange={(e) => setSubject(e.target.value)} />
              <p className={`${LABEL} mt-3`}>Variables for this email</p>
              <div className="flex flex-wrap gap-1.5">
                {def.variables.map((v) => (
                  <button key={v} type="button"
                    onClick={() => setHtml((h) => `${h}<span>{{${v}}}</span>`)}
                    aria-label={`Insert ${v} variable`}
                    className="rounded border border-zinc-700 px-2 py-1 font-mono text-[11px] text-amber-300 hover:bg-zinc-800">
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
              <p className={HINT}>
                Only these are available here — they come from what this sender actually provides.
              </p>
              {blocked && (
                <p role="alert" className="mt-2 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-[12px] text-rose-300">
                  Unsupported variable{unsupported.length === 1 ? '' : 's'}:{' '}
                  {unsupported.map((u) => `{{${u}}}`).join(', ')}. These cannot be resolved, so
                  publishing is blocked.
                </p>
              )}
            </section>

            <section className={CARD}>
              <p className={LABEL}>Content</p>
              <RichEmailEditor value={html} onChange={setHtml} disabled={busy} />
            </section>

            <section className={CARD}>
              <p className={LABEL}>Send a test</p>
              <p className={HINT}>
                Sends exactly what is in the editor right now — not the saved draft and not the
                published version — through the same path production uses. Variables are filled with
                obvious sample values, never a real code, and it goes to one address only.
              </p>
              <button type="button" onClick={() => setShowTest(true)}
                disabled={busy || !subject.trim() || !html.trim()}
                className={`${BTN} mt-2`}>
                Send test…
              </button>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap gap-2">
                {(['desktop', 'mobile', 'text'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setPreview(m)}
                    className={`${BTN} capitalize`}>{m === 'text' ? 'Text' : m} preview</button>
                ))}
                <button type="button" onClick={() => setConfirmReset(true)} disabled={busy}
                  className={BTN}>Reset to default</button>
              </span>
              <span className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} className={BTN}
                  onClick={() => void post({ type: editing, subject, html, revision: revision ?? undefined },
                    'Draft saved. The live email is unchanged until you publish.')}>
                  {busy ? 'Saving…' : 'Save draft'}
                </button>
                <button type="button" disabled={busy || blocked} className={BTN_PRIMARY}
                  title={blocked ? 'Remove unsupported variables first' : undefined}
                  onClick={async () => {
                    const saved = await post(
                      { type: editing, subject, html, revision: revision ?? undefined },
                      'Draft saved.');
                    if (saved) await post({ type: editing, action: 'publish' },
                      'Published. The application now uses this version.');
                  }}>
                  Publish
                </button>
              </span>
            </div>
          </>
        )}

        <EmailPreviewDialog
          open={preview !== 'off' && Boolean(def)}
          onClose={() => setPreview('off')}
          source="system"
          type={editing ?? undefined}
          subject={subject}
          html={html}
          initialMode={preview === 'off' ? 'desktop' : preview}
        />

        <TestSendDialog
          open={showTest && Boolean(def)}
          onClose={() => setShowTest(false)}
          source="system"
          type={editing ?? undefined}
          subject={subject}
          html={html}
          contextLabel={def?.name}
          blockedReason={unsupported.length
            ? `Remove unsupported variables first: ${unsupported.map((u) => `{{${u}}}`).join(', ')}`
            : undefined}
        />

        {confirmReset && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setConfirmReset(false)}>
            <div role="dialog" aria-modal="true" aria-label="Reset to default"
              className="w-full max-w-md space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
              onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-zinc-100">
                Restore the application&rsquo;s original email content?
              </h3>
              <p className="text-[12px] text-zinc-300">
                The built-in content is loaded as a draft. The live email does not change until you
                publish.
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmReset(false)} className={BTN}>Cancel</button>
                <button type="button" disabled={busy} className={BTN_PRIMARY}
                  onClick={async () => {
                    const r = await post({ type: editing, action: 'reset' }, '');
                    setConfirmReset(false);
                    /* Reopen FIRST — `open` clears the notice, so setting it
                       beforehand meant the confirmation vanished instantly. */
                    if (r && editing) await open(editing);
                    if (r) setNotice('Default content restored as a draft. Publish to make it live.');
                  }}>Reset</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── List ── */
  return (
    <div className="space-y-4">
      <p className={HINT}>
        Emails the application sends automatically. Only emails whose sender reads this
        configuration appear here.
      </p>

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

      {loading && <p className="text-[12px] text-zinc-500" aria-live="polite">Loading system emails…</p>}

      {!loading && !error && rows.length === 0 && (
        <div className={`${CARD} text-center`}>
          <p className="text-[13px] text-zinc-300">No editable system emails are registered.</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[620px] text-left text-[12px]">
            <thead className="bg-zinc-900">
              <tr className={LABEL}>
                <th scope="col" className="p-2.5 font-semibold">Email</th>
                <th scope="col" className="p-2.5 font-semibold">Trigger</th>
                <th scope="col" className="p-2.5 font-semibold">Status</th>
                <th scope="col" className="p-2.5 font-semibold">Published</th>
                <th scope="col" className="p-2.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.type} className="border-t border-zinc-900 hover:bg-zinc-800/30">
                  <td className="max-w-[200px] p-2.5">
                    <span className="block truncate text-zinc-200">{e.name}</span>
                    <span className="block truncate text-[11px] text-zinc-600">{e.sender}</span>
                  </td>
                  <td className="max-w-[220px] p-2.5 text-zinc-400">{e.trigger}</td>
                  <td className="p-2.5">
                    {e.hasUnpublishedChanges
                      ? <span className="font-semibold text-amber-400">● Unpublished changes</span>
                      : e.published
                        ? <span className="font-semibold text-emerald-400">● Customised</span>
                        : <span className="text-zinc-500">○ Built-in default</span>}
                  </td>
                  <td className="p-2.5 text-zinc-400">{fmt(e.publishedAt)}</td>
                  <td className="p-2.5">
                    <button type="button" onClick={() => void open(e.type)}
                      aria-label={`Edit ${e.name}`} className={BTN}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
