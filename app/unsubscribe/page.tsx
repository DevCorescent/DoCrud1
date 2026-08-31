'use client';

/**
 * The page an unsubscribe link opens.
 *
 * It asks before acting. The link in an email is followed by spam filters,
 * security appliances and browser prefetchers, so a page that unsubscribed on
 * load would opt people out who never saw it. The button POSTs; nothing
 * happens until a person clicks it.
 *
 * Public by design - the token IS the authorisation - so it shows no account
 * data and never reveals whether the address is a registered user.
 */
import { Suspense, useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function UnsubscribeForm() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const busy = useRef(false);

  const submit = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setState('working');
    try {
      const r = await fetch('/api/mail/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.ok) {
        setState('error');
        setMessage(data?.error || 'This unsubscribe link is not valid.');
        return;
      }
      setState('done');
      setMessage(data.message);
      setNote(data.note ?? '');
    } catch {
      setState('error');
      setMessage('Could not reach the server. Please try again.');
    } finally {
      busy.current = false;
    }
  }, [token]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-bold text-slate-900">Unsubscribe</h1>

      {state === 'done' ? (
        <>
          <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </p>
          {note && <p className="text-sm text-slate-600">{note}</p>}
        </>
      ) : state === 'error' ? (
        <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {message}
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            Confirm that you no longer want to receive marketing emails from docrud.
          </p>
          <p className="text-sm text-slate-500">
            Security and account emails, such as verification codes, will still be sent.
          </p>
          <button type="button" onClick={() => void submit()}
            disabled={state === 'working' || !token}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {state === 'working' ? 'Unsubscribing…' : 'Unsubscribe me'}
          </button>
          {!token && (
            <p role="alert" className="text-sm text-rose-700">
              This unsubscribe link is not valid.
            </p>
          )}
        </>
      )}
    </main>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<main className="p-6 text-sm text-slate-600">Loading…</main>}>
      <UnsubscribeForm />
    </Suspense>
  );
}
