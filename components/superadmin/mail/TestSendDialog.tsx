'use client';

/**
 * The one test send dialog.
 *
 * It posts the CURRENT editor content to /api/super-admin/mail/test-send.
 * Not the saved draft, not the published version, not the template it was
 * opened from - the subject and body as they are on screen right now, which is
 * the only thing a test is useful for.
 *
 * It cannot reach an audience. There is a single address field, the request
 * carries one recipient, and the endpoint behind it does not import the
 * recipient engine. Nothing here can be pointed at "Everyone" by mistake.
 *
 * On results it says what actually happened. The provider ACCEPTED a message
 * or REJECTED it; whether an inbox received it is not something this
 * application can observe, so it never claims delivery.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type TestSendSource = 'compose' | 'draft' | 'template' | 'campaign' | 'system';

interface Outcome {
  ok: boolean;
  message: string;
  detail?: string;
  failureKind?: string;
  providerCode?: number;
  retryable?: boolean;
  advice?: string;
  duplicate?: boolean;
  unsupported?: string[];
}

export interface TestSendDialogProps {
  open: boolean;
  onClose: () => void;
  source: TestSendSource;
  type?: string;
  /** CURRENT editor content. */
  subject: string;
  html: string;
  preheader?: string;
  /** Shown so the admin can see which email is about to be tested. */
  contextLabel?: string;
  /** Blocks the send before a request is made (e.g. unsupported variables). */
  blockedReason?: string;
}

const BTN =
  'rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition '
  + 'hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 '
  + 'disabled:opacity-60';
const BTN_PRIMARY =
  'rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-zinc-950 transition hover:bg-amber-400 '
  + 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-60';
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
const INPUT =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 '
  + 'placeholder:text-zinc-600 outline-none focus-visible:ring-2 focus-visible:ring-amber-500';

/* Deliberately simple: the server validates properly. This only stops an
   obviously empty or malformed value from becoming a pointless round trip. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function TestSendDialog(props: TestSendDialogProps) {
  const { open, onClose, source, type, subject, html, preheader, contextLabel, blockedReason } = props;

  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /* Synchronous. `sending` is React state and does not update until the next
     render, so a fast double-click would pass the disabled check twice and
     send two messages. This ref is set before the await and is the guard that
     actually holds. */
  const busyRef = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    setOutcome(null);
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const send = useCallback(async () => {
    if (busyRef.current) return;
    const recipient = to.trim();
    if (!LOOKS_LIKE_EMAIL.test(recipient)) {
      setOutcome({ ok: false, message: 'Enter a valid test recipient address.' });
      return;
    }
    busyRef.current = true;
    setSending(true);
    setOutcome(null);
    try {
      const r = await fetch('/api/super-admin/mail/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        /* The content as it stands in the editor. The server re-renders it;
           no previewed HTML is forwarded from here. */
        body: JSON.stringify({ source, type, subject, html, preheader, recipient }),
      });
      const data = await r.json().catch(() => null);

      if (r.ok && data?.ok) {
        setOutcome({
          ok: true,
          message: data.message || 'The provider accepted the test message.',
          duplicate: data.duplicate === true,
        });
        return;
      }

      setOutcome({
        ok: false,
        message: data?.error || 'The test could not be sent.',
        detail: data?.detail,
        failureKind: data?.failureKind,
        providerCode: data?.providerCode,
        retryable: data?.retryable,
        advice: data?.advice,
        unsupported: data?.unsupported,
      });
    } catch {
      setOutcome({ ok: false, message: 'Could not reach the server.' });
    } finally {
      busyRef.current = false;
      setSending(false);
    }
  }, [to, source, type, subject, html, preheader]);

  if (!open) return null;

  const disabled = sending || !to.trim() || Boolean(blockedReason);

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center overflow-y-auto bg-black/75 p-3 sm:p-4"
      onClick={() => { if (!sending) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Send a test email"
        className="my-auto w-full max-w-md space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
        onClick={(e) => e.stopPropagation()}>

        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Send a test</h3>
          <p className="mt-1 text-[12px] text-zinc-400">
            Sends the subject and body exactly as they are in the editor right now, including
            unsaved changes. Variables are filled with sample data.
          </p>
        </div>

        {contextLabel && (
          <p className="truncate rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-[12px] text-zinc-300">
            {contextLabel}
          </p>
        )}

        {blockedReason && (
          <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
            {blockedReason}
          </p>
        )}

        <div>
          <label className={LABEL} htmlFor="ts-to">Test recipient</label>
          <input id="ts-to" ref={inputRef} type="email" className={INPUT} value={to} autoComplete="off"
            onChange={(e) => setTo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) { e.preventDefault(); void send(); } }}
            placeholder="you@example.com" />
          <p className="mt-1 text-[11px] text-zinc-500">
            One address. A test can never reach a campaign audience or a saved recipient list.
          </p>
        </div>

        {outcome && (
          <div role="status"
            className={`space-y-1 rounded-lg border px-3 py-2 text-[12px] ${
              outcome.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
            <p className="font-semibold">{outcome.message}</p>
            {outcome.detail && <p className="break-words text-zinc-300">{outcome.detail}</p>}
            {outcome.unsupported?.length ? (
              <p className="text-zinc-300">
                Unsupported: {outcome.unsupported.map((n) => `{{${n}}}`).join(', ')}
              </p>
            ) : null}
            {(outcome.failureKind || outcome.providerCode !== undefined) && (
              <p className="text-zinc-400">
                {outcome.failureKind && `Failure: ${outcome.failureKind}`}
                {outcome.providerCode !== undefined && ` · Provider code ${outcome.providerCode}`}
                {outcome.retryable !== undefined
                  && ` · ${outcome.retryable ? 'Retrying may help' : 'Retrying will not help'}`}
              </p>
            )}
            {outcome.advice && <p className="text-zinc-400">{outcome.advice}</p>}
            {outcome.ok && !outcome.duplicate && (
              /* The distinction that matters, stated every time. */
              <p className="text-zinc-400">
                Accepted by the provider. Check the inbox yourself to confirm it arrived — delivery
                is not something this panel can see.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={sending} className={BTN}>Cancel</button>
          <button type="button" onClick={() => void send()} disabled={disabled} className={BTN_PRIMARY}>
            {sending ? 'Sending test…' : 'Send test'}
          </button>
        </div>
      </div>
    </div>
  );
}
