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

type Phase = 'editing' | 'saving' | 'testing' | 'previewing' | 'confirming' | 'sending';

interface TestOutcome {
  ok: boolean;
  message: string;
  detail?: string;
  retryable?: boolean | null;
}

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

  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile' | 'text'>('desktop');

  const [testTo, setTestTo] = useState('');
  const [testOutcome, setTestOutcome] = useState<TestOutcome | null>(null);

  /* The audience DEFINITION plus the count the server last reported for it.
     The count is display-only — it is never sent back as an input. */
  const [segment, setSegment] = useState<Segment | null>(null);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [showPicker, setShowPicker] = useState(false);

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
