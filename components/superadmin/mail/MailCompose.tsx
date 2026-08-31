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
import EmailPreviewDialog from '@/components/superadmin/mail/EmailPreviewDialog';
import TestSendDialog from '@/components/superadmin/mail/TestSendDialog';
import RecipientPicker, {
  type Segment, type Resolution,
} from '@/components/superadmin/mail/RecipientPicker';
import { SUPPORTED_TIMEZONES } from '@/lib/email/schedule-time';

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

/* 'testing' and 'previewing' are gone: preview and test send are self-
   contained dialogs that own their own busy state, so the composer no longer
   has to model them. */
type Phase = 'editing' | 'saving' | 'confirming' | 'sending';


export default function MailCompose({ draftId: initialDraftId, onDraftSaved }: {
  draftId?: string | null;
  onDraftSaved?: () => void;
} = {}) {
  const [subject, setSubject] = useState('');
  const [preheader, setPreheader] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [html, setHtml] = useState('');
  const [draftId, setDraftId] = useState<string | null>(initialDraftId ?? null);
  /** Server revision this editor is based on; sent with every save. */
  const [revision, setRevision] = useState<number | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(Boolean(initialDraftId));
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  /* Monotonic id per save request. A response from an older request is
     discarded — request ORDER is not a safe proxy for recency. */
  const saveSeq = useRef(0);
  const savingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('editing');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  /** The last state written to the server, for a truthful dirty flag. */
  const [savedSnapshot, setSavedSnapshot] = useState('');

  /* Both dialogs read the CURRENT editor state through props, so there is
     nothing to keep in sync and no stale copy to preview or send. */
  const [showPreview, setShowPreview] = useState(false);
  const [showTest, setShowTest] = useState(false);

  /* The audience DEFINITION plus the count the server last reported for it.
     The count is display-only — it is never sent back as an input. */
  const [segment, setSegment] = useState<Segment | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  /* Template chooser. Using a template COPIES its content into this draft —
     no live link is kept, so editing the template later cannot rewrite an
     email that has already been sent. */
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; subject: string; category: string }[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);

  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [timezone, setTimezone] = useState(() => {
    try {
      const guess = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return SUPPORTED_TIMEZONES.includes(guess) ? guess : 'Asia/Kolkata';
    } catch { return 'Asia/Kolkata'; }
  });

  /* React state updates are asynchronous, so two clicks in the same tick both
     read the old `phase` and both post. Browser QA caught exactly that: a
     double-click created TWO campaigns. A ref flips synchronously. */
  const sendingRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const [staleWarning, setStaleWarning] = useState('');
  const [sendResult, setSendResult] = useState<string>('');

  useEffect(() => {
    if (!initialDraftId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/super-admin/mail/drafts?id=${encodeURIComponent(initialDraftId)}`,
          { cache: 'no-store' });
        const data = await r.json().catch(() => null);
        if (!r.ok || cancelled) { if (!cancelled) setError(data?.error || 'Unable to load draft.'); return; }
        const d = data.draft;
        setSubject(d.subject ?? ''); setHtml(d.html ?? '');
        setPreheader(d.preheader ?? ''); setReplyTo(d.replyTo ?? '');
        setRevision(d.revision ?? null);
        if (d.audience) setSegment(d.audience as Segment);
        if (d.scheduleAt) { setScheduleMode('later'); setScheduleAt(d.scheduleAt); }
        if (d.scheduleTimezone) setTimezone(d.scheduleTimezone);
        setSavedSnapshot(JSON.stringify({
          subject: d.subject ?? '', preheader: d.preheader ?? '',
          replyTo: d.replyTo ?? '', html: d.html ?? '',
        }));
      } catch { if (!cancelled) setError('Could not reach the server.'); }
      finally { if (!cancelled) setLoadingDraft(false); }
    })();
    return () => { cancelled = true; };
  }, [initialDraftId]);

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

  /**
   * The single save path, shared by autosave and the button.
   *
   * `silent` distinguishes a background autosave from an explicit save: only
   * the latter shows a notice, and only the latter reports "a subject is
   * required" as an error the admin must act on.
   */
  const persistDraft = useCallback(async (silent: boolean) => {
    if (savingRef.current) return false;   // synchronous: state updates too late
    if (!subject.trim()) {
      if (!silent) setError('A subject is required before saving.');
      return false;
    }
    savingRef.current = true;
    const seq = ++saveSeq.current;
    const attempted = snapshot;
    setAutosaveState('saving');
    if (!silent) { setPhase('saving'); setError(''); setNotice(''); }
    try {
      const r = await fetch('/api/super-admin/mail/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draftId, subject, html, preheader, replyTo,
          audience: segment ?? undefined,
          scheduleAt: scheduleMode === 'later' ? scheduleAt : undefined,
          scheduleTimezone: scheduleMode === 'later' ? timezone : undefined,
          revision: revision ?? undefined,
        }),
      });
      const data = await r.json().catch(() => null);
      /* A response from a superseded request must not touch state — otherwise
         a slow save can restore older content over a newer one. */
      if (seq !== saveSeq.current) return false;

      if (r.status === 409) {
        setAutosaveState('failed');
        setError('This draft was changed elsewhere. Reload it before saving again.');
        return false;
      }
      if (!r.ok) {
        setAutosaveState('failed');
        /* Never show "Saved" when the server refused. */
        if (!silent) setError(data?.error || 'Unable to save draft.');
        return false;
      }
      setDraftId(data.draft.id);
      setRevision(data.draft.revision ?? null);
      setSavedAt(new Date());
      setSavedSnapshot(attempted);
      setAutosaveState('saved');
      if (!silent) setNotice('Draft saved.');
      onDraftSaved?.();
      return true;
    } catch {
      if (seq === saveSeq.current) {
        setAutosaveState('failed');
        if (!silent) setError('Could not reach the server.');
      }
      return false;
    } finally {
      savingRef.current = false;
      if (!silent) setPhase('editing');
    }
  }, [subject, html, preheader, replyTo, draftId, snapshot, segment,
      scheduleMode, scheduleAt, timezone, revision, onDraftSaved]);

  const saveDraft = useCallback(() => persistDraft(false), [persistDraft]);

  /* Autosave: debounced, and only when something actually changed. Firing per
     keystroke would be a request per character. */
  useEffect(() => {
    if (!dirty || !subject.trim() || loadingDraft) return undefined;
    const t = setTimeout(() => { void persistDraft(true); }, 1200);
    return () => clearTimeout(t);
  }, [dirty, subject, loadingDraft, persistDraft]);

  /* Preview and test send are the shared dialogs. Compose used to own a
     preview fetch of its own, and its "Send test" posted to the SMTP
     diagnostic endpoint - which ignored this editor completely and mailed a
     fixed connection-test message instead of the email being written. */

  /**
   * Open the confirmation screen — after RE-RESOLVING the audience.
   *
   * The count shown when the picker was used may be minutes old, and users
   * sign up and deactivate in between. Confirming against a stale number is
   * how an admin approves "1,284" and sends to something else.
   */
  const openConfirm = useCallback(async () => {
    if (busy || !segment) return;
    setPhase('confirming'); setError(''); setStaleWarning(''); setSendResult('');
    try {
      const r = await fetch('/api/super-admin/mail/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Unable to resolve recipients.'); return; }
      if (data.final === 0) {
        setError('No valid recipients found. This audience cannot be sent to.');
        return;
      }
      if (resolution && data.final !== resolution.final) {
        setStaleWarning(
          `The audience changed since you previewed it — was ${resolution.final.toLocaleString()}, `
          + `now ${Number(data.final).toLocaleString()}. Review before sending.`,
        );
      }
      setResolution(data);
      setConfirmCount(data.final);
      setConfirming(true);
    } catch { setError('Could not reach the server.'); }
    finally { setPhase('editing'); }
  }, [busy, segment, resolution]);

  const confirmSend = useCallback(async () => {
    if (sendingRef.current || !segment) return; // a second click must not queue twice
    sendingRef.current = true;
    setPhase('sending'); setError('');
    try {
      const r = await fetch('/api/super-admin/mail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_broadcast',
          data: {
            subject,
            htmlBody: html,
            /* The DEFINITION, never a recipient list or a count. */
            segment,
            scheduleAt: scheduleMode === 'later' ? scheduleAt : undefined,
            timezone: scheduleMode === 'later' ? timezone : undefined,
          },
        }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Unable to create the campaign.'); return; }
      /* "Queued", not "sent": delivery happens in the background and may still
         fail at the provider. */
      setSendResult(scheduleMode === 'later'
        ? `Campaign scheduled for ${new Date(data.scheduledFor).toLocaleString()} `
          + `(${data.timezone ?? 'server time'}) — ${data.queued.toLocaleString()} recipients.`
        : `Campaign queued for ${data.queued.toLocaleString()} recipients. `
          + 'Delivery runs in the background; check the outbox for results.');
      setConfirming(false);
    } catch { setError('Could not reach the server.'); }
    finally { sendingRef.current = false; setPhase('editing'); }
  }, [segment, subject, html, scheduleMode, scheduleAt, timezone]);

  const openTemplates = useCallback(async () => {
    setShowTemplates(true); setTemplatesLoading(true); setError('');
    try {
      /* Archived templates are deliberately excluded from new campaigns. */
      const r = await fetch('/api/super-admin/mail/templates?status=active&page=1',
        { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Unable to load templates.'); return; }
      setTemplates(data.templates);
    } catch { setError('Could not reach the server.'); }
    finally { setTemplatesLoading(false); }
  }, []);

  const applyTemplate = useCallback(async (id: string) => {
    setTemplatesLoading(true); setError('');
    try {
      const r = await fetch(`/api/super-admin/mail/templates?id=${encodeURIComponent(id)}`,
        { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Template not found.'); return; }
      const t = data.template;
      /* A copy, not a reference. */
      setSubject(t.subject ?? '');
      setHtml(t.html ?? '');
      setPreheader(t.preheader ?? '');
      setShowTemplates(false);
      setPendingTemplate(null);
      setNotice('Template content copied into this email. Edits here do not change the template.');
    } catch { setError('Could not reach the server.'); }
    finally { setTemplatesLoading(false); }
  }, []);

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
          {/* "Saved" is never shown when the server refused the write. */}
          {autosaveState === 'saving' || phase === 'saving'
            ? <span className="text-zinc-400">Saving…</span>
            : autosaveState === 'failed'
              ? <span className="text-rose-400">Save failed — your changes are not stored</span>
            : dirty ? <span className="text-amber-400">Unsaved changes</span>
            : savedAt ? <span className="text-emerald-400">Saved {savedAt.toLocaleTimeString()}</span>
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

      {/* ── Recipients ── */}
      <section className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={LABEL}>Recipients</p>
            {segment && resolution ? (
              <>
                <p className="text-[13px] text-zinc-200">{resolution.description}</p>
                <p className="mt-0.5 text-[12px] text-zinc-400">
                  <span className="font-bold text-emerald-400">
                    {resolution.final.toLocaleString()}
                  </span>{' '}
                  final recipient{resolution.final === 1 ? '' : 's'}
                  {' · '}{resolution.excluded.toLocaleString()} excluded
                  {' · '}{resolution.invalid.toLocaleString()} invalid
                  {resolution.suppressed
                    ? ` · ${resolution.suppressed.toLocaleString()} suppressed` : ''}
                </p>
              </>
            ) : (
              <p className="text-[13px] text-zinc-500">No audience chosen yet.</p>
            )}
          </div>
          <button type="button" onClick={() => setShowPicker(true)} className={BTN}>
            {segment ? 'Change' : 'Choose recipients'}
          </button>
        </div>
        <p className={HINT}>
          Counts come from the server. The audience is stored as a definition and re-resolved when
          the campaign runs, so a scheduled email reaches whoever matches at that time.
        </p>
      </section>

      {/* ── Schedule ── */}
      <section className={CARD}>
        <p className={LABEL}>Delivery</p>
        <div className="flex flex-wrap gap-4">
          {(['now', 'later'] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-[13px] text-zinc-200">
              <input type="radio" name="schedule-mode" checked={scheduleMode === m}
                onChange={() => setScheduleMode(m)} className="h-4 w-4 accent-amber-500" />
              {m === 'now' ? 'Send now' : 'Schedule'}
            </label>
          ))}
        </div>
        {scheduleMode === 'later' && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="mc-when">Date and time</label>
              <input id="mc-when" type="datetime-local" className={INPUT} value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)} />
            </div>
            <div>
              <label className={LABEL} htmlFor="mc-tz">Timezone</label>
              <select id="mc-tz" className={INPUT} value={timezone}
                onChange={(e) => setTimezone(e.target.value)}>
                {SUPPORTED_TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <p className={`${HINT} sm:col-span-2`}>
              The time is interpreted in the timezone you choose, not the server&rsquo;s. Scheduled
              campaigns are sent by the server, so the browser can be closed.
            </p>
          </div>
        )}
      </section>

      {/* ── Body ── */}
      <section className={CARD}>
        <p className={LABEL}>Content</p>
        <RichEmailEditor value={html} onChange={setHtml} disabled={busy} />
      </section>

      {/* ── Test send ── */}
      <section className={CARD}>
        <p className={LABEL}>Send a test</p>
        <p className={HINT}>
          Sends the subject and body exactly as they stand in this editor, including unsaved
          changes, through the real mail pipeline. It is recorded in the outbox and goes only to the
          single address you enter — never to a campaign audience.
        </p>
        <button type="button" onClick={() => setShowTest(true)}
          disabled={busy || !subject.trim() || !html.trim()}
          title={!subject.trim() || !html.trim() ? 'Add a subject and a body first' : undefined}
          className={`${BTN} mt-2`}>
          Send test…
        </button>
      </section>

      {/* ── Actions ── */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/95 px-4 py-3 backdrop-blur">
        <p className="text-[12px] text-zinc-400">
          {dirty ? 'You have unsaved changes.' : 'All changes saved.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void openTemplates()} disabled={busy} className={BTN}>
            Use template
          </button>
          <button type="button" onClick={() => setShowPreview(true)} disabled={busy || !html.trim()}
            className={BTN}>
            Preview
          </button>
          <button type="button" onClick={() => void saveDraft()} disabled={busy || !subject.trim()}
            className={BTN}>
            {phase === 'saving' ? 'Saving…' : 'Save draft'}
          </button>
          <button type="button" onClick={() => void openConfirm()}
            disabled={busy || !segment || !subject.trim() || !html.trim()}
            title={!segment ? 'Choose recipients first' : undefined}
            className={BTN_PRIMARY}>
            {phase === 'confirming' ? 'Checking audience…'
              : scheduleMode === 'later' ? 'Review & schedule' : 'Review & send'}
          </button>
        </div>
      </div>
      {sendResult && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
          {sendResult}
        </p>
      )}

      {showTemplates && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={() => { setShowTemplates(false); setPendingTemplate(null); }}>
          <div role="dialog" aria-modal="true" aria-label="Choose a template"
            className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-800 bg-zinc-900"
            onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-zinc-800 px-4 py-3">
              <h3 className="text-sm font-semibold text-zinc-100">Use a template</h3>
              <p className={HINT}>
                The template&rsquo;s content is copied into this email. Later edits to the template
                do not affect what you send from here.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {templatesLoading && <p className="text-[12px] text-zinc-500" aria-live="polite">Loading…</p>}
              {!templatesLoading && templates.length === 0 && (
                <p className="text-[12px] text-zinc-500">No active templates yet.</p>
              )}
              {!templatesLoading && templates.map((t) => (
                <button key={t.id} type="button"
                  onClick={() => {
                    /* Replacing unsaved work needs a deliberate confirmation. */
                    if (subject.trim() || html.trim()) setPendingTemplate(t.id);
                    else void applyTemplate(t.id);
                  }}
                  className="mb-1 block w-full rounded-lg border border-zinc-800 p-2.5 text-left hover:bg-zinc-800/50">
                  <span className="block truncate text-[13px] text-zinc-100">{t.name}</span>
                  <span className="block truncate text-[11px] text-zinc-500">{t.subject}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end border-t border-zinc-800 px-4 py-3">
              <button type="button" onClick={() => setShowTemplates(false)} className={BTN}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {pendingTemplate && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPendingTemplate(null)}>
          <div role="dialog" aria-modal="true" aria-label="Replace content"
            className="w-full max-w-md space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-100">Replace current content?</h3>
            <p className="text-[12px] text-zinc-300">
              This email already has a subject or body. Using the template will overwrite them.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPendingTemplate(null)} className={BTN}>Cancel</button>
              <button type="button" onClick={() => void applyTemplate(pendingTemplate)}
                className={BTN_PRIMARY}>Replace</button>
            </div>
          </div>
        </div>
      )}

      {showPicker && (
        <RecipientPicker
          initial={segment}
          onCancel={() => setShowPicker(false)}
          onApply={(seg, res) => {
            setSegment(seg); setResolution(res); setShowPicker(false); setStaleWarning('');
          }}
        />
      )}

      {/* ── Confirmation: the count is re-resolved before this opens ── */}
      {confirming && resolution && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setConfirming(false)}>
          <div role="dialog" aria-modal="true" aria-label="Review and send"
            className="w-full max-w-lg space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-100">Review &amp; send</h3>

            {staleWarning && (
              <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
                {staleWarning}
              </p>
            )}

            <dl className="space-y-1.5 text-[12px]">
              {[
                ['Subject', subject || '(none)'],
                ['Audience', resolution.description],
                ['Final recipients', `${(confirmCount ?? resolution.final).toLocaleString()}`],
                ['Excluded', `${resolution.excluded.toLocaleString()}`],
                ['Invalid', `${resolution.invalid.toLocaleString()}`],
                /* Shown on the confirmation screen too: the admin approving a
                   send should see that some recipients opted out. */
                ['Suppressed', `${(resolution.suppressed ?? 0).toLocaleString()}`],
                ['Delivery', scheduleMode === 'later'
                  ? `${scheduleAt || '(no time set)'} · ${timezone}`
                  : 'Send now'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-zinc-500">{k}</dt>
                  <dd className="min-w-0 break-words text-right text-zinc-200">{v}</dd>
                </div>
              ))}
            </dl>

            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
              You are about to email {(confirmCount ?? resolution.final).toLocaleString()} recipient
              {(confirmCount ?? resolution.final) === 1 ? '' : 's'}. This cannot be undone.
            </p>

            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className={BTN}>Back</button>
              <button type="button" onClick={() => void confirmSend()}
                disabled={phase === 'sending'
                  || (scheduleMode === 'later' && !scheduleAt)}
                className={BTN_PRIMARY}>
                {phase === 'sending' ? 'Working…'
                  : scheduleMode === 'later'
                    ? `Schedule for ${(confirmCount ?? resolution.final).toLocaleString()} recipients`
                    : `Confirm & send to ${(confirmCount ?? resolution.final).toLocaleString()} recipients`}
              </button>
            </div>
          </div>
        </div>
      )}

      <EmailPreviewDialog
        open={showPreview}
        onClose={() => setShowPreview(false)}
        source={draftId ? 'draft' : 'compose'}
        subject={subject}
        html={html}
        preheader={preheader}
      />

      <TestSendDialog
        open={showTest}
        onClose={() => setShowTest(false)}
        source={draftId ? 'draft' : 'compose'}
        subject={subject}
        html={html}
        preheader={preheader}
        contextLabel={subject || '(no subject)'}
      />

    </div>
  );
}
