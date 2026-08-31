'use client';

/**
 * Mail Center → Compose.
 *
 * Deliberately split: `RichEmailEditor` owns the editing surface, this owns
 * composer state and the server round-trips. Phases 5–10 (recipient picker,
 * scheduling, templates) plug in here without touching the editor.
 *
 * Two rules this screen must not break:
 *
 * 1. NOTHING IS SENT FROM THE BROWSER. Test sends go to the existing
 *    /api/super-admin/mail/test endpoint, which uses the same MailProvider and
 *    the same outbox as a real campaign. There is no SMTP in this file.
 *
 * 2. IT NEVER CLAIMS A SEND SUCCEEDED. The endpoint reports the provider's
 *    actual answer, including a classified failure, and that is what is shown.
 *    A suspended mailbox produces "delivery unavailable", never "test sent".
 *
 * The preview renders the server's sanitized HTML — the exact bytes a
 * recipient would get — so an admin cannot approve something different from
 * what is delivered.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RichEmailEditor from '@/components/superadmin/mail/RichEmailEditor';

const CARD = 'rounded-xl border border-zinc-800 bg-zinc-900/60 p-4';
const LABEL = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
const HINT = 'mt-1 text-[11px] leading-relaxed text-zinc-500';
const INPUT =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 '
  + 'placeholder:text-zinc-600 outline-none focus-visible:ring-2 focus-visible:ring-amber-500';
const BTN =
  'rounded-lg border border-zinc-700 px-3 py-2 text-[12px] font-semibold text-zinc-200 transition '
  + 'hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 '
  + 'disabled:opacity-60';
const BTN_PRIMARY =
  'rounded-lg bg-amber-500 px-4 py-2 text-[12px] font-bold text-zinc-950 transition hover:bg-amber-400 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-60';

const SUBJECT_MAX = 200;

type Phase = 'editing' | 'saving' | 'testing' | 'previewing';

interface TestOutcome {
  ok: boolean;
  message: string;
  detail?: string;
  retryable?: boolean | null;
}

export default function MailCompose() {
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [html, setHtml] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('editing');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  /** The last state written to the server, for a truthful dirty flag. */
  const [savedSnapshot, setSavedSnapshot] = useState('');

  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile' | 'text'>('desktop');

  const [testTo, setTestTo] = useState('');
  const [testOutcome, setTestOutcome] = useState<TestOutcome | null>(null);

  const busy = phase !== 'editing';
  const snapshot = useMemo(
    () => JSON.stringify({ subject, preheader, replyTo, html }),
    [subject, preheader, replyTo, html],
  );
  const dirty = snapshot !== savedSnapshot && Boolean(subject || html);

  /* Guards a real navigation away. An in-panel tab switch is React state and
     never reaches this — the banner below covers that. */
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const saveDraft = useCallback(async () => {
    if (busy) return;
    if (!subject.trim()) { setError('A subject is required before saving.'); return; }
    setPhase('saving'); setError(''); setNotice('');
    try {
      const r = await fetch('/api/super-admin/mail/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: draftId, subject, html, preheader, replyTo }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Unable to save draft.'); return; }
      setDraftId(data.draft.id);
      setSavedAt(new Date());
      setSavedSnapshot(snapshot);
      setNotice('Draft saved.');
    } catch { setError('Could not reach the server.'); }
    finally { setPhase('editing'); }
  }, [busy, subject, html, preheader, replyTo, draftId, snapshot]);

  /* Preview asks the SERVER for the sanitized body, so what is shown is what
     would actually be sent — not a second rendering path that could differ. */
  const openPreview = useCallback(async () => {
    if (busy) return;
    setPhase('previewing'); setError('');
    try {
      const r = await fetch('/api/super-admin/mail/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, subject }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Unable to build preview.'); return; }
      setPreviewHtml(data.html);
      setPreviewText(data.text);
      setShowPreview(true);
    } catch { setError('Could not reach the server.'); }
    finally { setPhase('editing'); }
  }, [busy, html, subject]);

  const sendTest = useCallback(async () => {
    if (busy) return;
    if (!testTo.trim()) { setError('Enter a test recipient.'); return; }
    setPhase('testing'); setError(''); setTestOutcome(null);
    try {
      const r = await fetch('/api/super-admin/mail/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: testTo.trim() }),
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data?.ok) {
        setTestOutcome({ ok: true, message: 'The provider accepted the test message.' });
      } else {
        /* The provider's own answer, verbatim. Never rounded up to success. */
        setTestOutcome({
          ok: false,
          message: data?.stage === 'verify'
            ? 'Mail delivery unavailable — the provider refused the connection.'
            : 'The provider rejected the test message.',
          detail: [data?.providerCode ? `SMTP ${data.providerCode}` : null, data?.error, data?.hint]
            .filter(Boolean).join(' · '),
          retryable: data?.retryable ?? null,
        });
      }
    } catch { setError('Could not reach the server.'); }
    finally { setPhase('editing'); }
  }, [busy, testTo]);

  const subjectOver = subject.length > SUBJECT_MAX;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-zinc-100">Compose email</h3>
          <p className={HINT}>
            Content is sanitized on the server before it is stored, previewed or sent.
          </p>
        </div>
        <span aria-live="polite" className="text-[12px]">
          {phase === 'saving' ? <span className="text-zinc-400">Saving…</span>
            : dirty ? <span className="text-amber-400">Unsaved changes</span>
            : savedAt ? <span className="text-emerald-400">Draft saved {savedAt.toLocaleTimeString()}</span>
            : null}
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </p>
      )}
      {notice && !error && (
        <p aria-live="polite" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
          {notice}
        </p>
      )}

      {/* ── Headers ── */}
      <section className={CARD}>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="min-w-0">
            <span className={LABEL}>From</span>
            <input readOnly aria-readonly value="Configured sender identity (Mail settings)"
              className={`${INPUT} cursor-not-allowed text-zinc-500`} />
            <p className={HINT}>
              The sender comes from the server&rsquo;s mail configuration. It cannot be set here, so a
              campaign cannot be sent from an address the domain does not authorise.
            </p>
          </div>
          <div className="min-w-0">
            <label className={LABEL} htmlFor="mc-replyto">Reply-to (optional)</label>
            <input id="mc-replyto" className={INPUT} value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)} placeholder="support@docrud.com" />
            <p className={HINT}>Where replies go, if different from the sender.</p>
          </div>

          <div className="min-w-0 lg:col-span-2">
            <div className="flex items-baseline justify-between gap-2">
              <label className={LABEL} htmlFor="mc-subject">Subject</label>
              <span className={`text-[11px] tabular-nums ${subjectOver ? 'text-rose-400' : 'text-zinc-600'}`}>
                {subject.length}/{SUBJECT_MAX}
              </span>
            </div>
            <input id="mc-subject" className={INPUT} value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What the recipient sees in their inbox" />
            {subjectOver && (
              <p role="alert" className="mt-1 text-[11px] text-rose-400">
                The subject is longer than {SUBJECT_MAX} characters.
              </p>
            )}
          </div>

          <div className="min-w-0 lg:col-span-2">
            <label className={LABEL} htmlFor="mc-preheader">Preview text (optional)</label>
            <input id="mc-preheader" className={INPUT} value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              placeholder="The line most clients show after the subject" />
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <section className={CARD}>
        <p className={LABEL}>Content</p>
        <RichEmailEditor value={html} onChange={setHtml} disabled={busy} />
      </section>

      {/* ── Test send ── */}
      <section className={CARD}>
        <p className={LABEL}>Send a test</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor="mc-test">Test recipient</label>
            <input id="mc-test" className={INPUT} value={testTo} type="email"
              onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
          </div>
          <button type="button" onClick={() => void sendTest()} disabled={busy || !testTo.trim()}
            className={BTN}>
            {phase === 'testing' ? 'Sending…' : 'Send test'}
          </button>
        </div>
        <p className={HINT}>
          Goes through the real mail pipeline and is recorded in the outbox. It is sent only to the
          address above — never to a campaign audience.
        </p>
        {testOutcome && (
          <div role="status" className={`mt-2 rounded-lg border px-3 py-2 text-[12px] ${
            testOutcome.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-300'}`}>
            <p className="font-semibold">{testOutcome.message}</p>
            {testOutcome.detail && <p className="mt-1 break-words text-zinc-300">{testOutcome.detail}</p>}
            {testOutcome.retryable === false && (
              <p className="mt-1 text-zinc-400">
                This failure is permanent — retrying will not help until it is fixed at the provider.
              </p>
            )}
            {testOutcome.ok && (
              <p className="mt-1 text-zinc-400">
                Accepted by the provider. That is not confirmation it reached the inbox.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── Actions ── */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/95 px-4 py-3 backdrop-blur">
        <p className="text-[12px] text-zinc-400">
          {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void openPreview()} disabled={busy || !html.trim()}
            className={BTN}>
            {phase === 'previewing' ? 'Building…' : 'Preview'}
          </button>
          <button type="button" onClick={() => void saveDraft()} disabled={busy || !subject.trim()}
            className={BTN_PRIMARY}>
            {phase === 'saving' ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </div>
      <p className={HINT}>
        Choosing recipients and sending or scheduling a campaign are not part of this screen yet.
        A draft saved here is what those steps will use.
      </p>

      {/* ── Preview ── */}
      {showPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowPreview(false)}>
          <div role="dialog" aria-modal="true" aria-label="Email preview"
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl border border-zinc-800 bg-zinc-900"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">{subject || '(no subject)'}</p>
                <p className="truncate text-[11px] text-zinc-500">{preheader}</p>
              </div>
              <div className="flex items-center gap-1">
                {(['desktop', 'mobile', 'text'] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setPreviewMode(m)}
                    aria-pressed={previewMode === m}
                    className={`rounded-md px-2.5 py-1 text-[12px] capitalize transition ${
                      previewMode === m ? 'bg-amber-500 font-semibold text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800'}`}>
                    {m}
                  </button>
                ))}
                <button type="button" onClick={() => setShowPreview(false)}
                  className="ml-1 rounded-md px-2.5 py-1 text-[12px] text-zinc-400 hover:bg-zinc-800">
                  Close
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-950 p-4">
              {previewMode === 'text' ? (
                <pre className="whitespace-pre-wrap break-words text-[12px] text-zinc-300">{previewText}</pre>
              ) : (
                <div className={`mx-auto bg-white p-4 text-black ${previewMode === 'mobile' ? 'max-w-[390px]' : 'max-w-[640px]'}`}>
                  {/* Server-sanitized HTML — the same bytes that would be sent. */}
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              )}
            </div>
            <p className="border-t border-zinc-800 px-4 py-2 text-[11px] text-zinc-500">
              Rendered from the server-sanitized body. Real clients vary — this is an approximation
              of layout, not a guarantee of how every client will display it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
