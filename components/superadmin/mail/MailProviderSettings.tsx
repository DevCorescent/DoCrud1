'use client';

/**
 * Mail Center -> Provider.
 *
 * What the mail provider is, whether it is working, and the two sender fields
 * that are safe to change from a browser. Everything else is read-only and
 * says WHERE it is configured, rather than offering a control that would
 * pretend the browser could change it.
 *
 * No credential is displayed, not even masked: the page shows whether one is
 * present and nothing more. A mask is still a disclosure - it reveals length
 * and confirms existence - and this screen has no reason to reveal either.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { describeFetchError } from '@/lib/email/session-error';

interface Overview {
  provider: {
    type: string; host: string; port: number; encryption: string;
    requiresAuth: boolean; credentialPresent: boolean; usernamePresent: boolean;
    configured: boolean;
  };
  sender: { fromName: string; fromEmail: string; replyTo: string };
  editable: string[];
  configuredExternally: Record<string, boolean>;
  health: {
    status: string; checkedAt: string | null; failureKind: string | null;
    providerCode: number | null; retryable: boolean | null;
    advice: string | null; message: string | null;
  } | null;
  activity: {
    lastAcceptedAt: string | null; lastFailedAt: string | null;
    lastFailureKind: string | null; lastFailureCode: number | null;
    lastFailureRetryable: boolean | null; lastFailureAdvice: string | null;
  };
}

const CARD = 'rounded-xl border border-zinc-800 bg-zinc-900/60 p-4';
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
const HINT = 'mt-1 text-[11px] leading-relaxed text-zinc-500';
const INPUT =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 '
  + 'placeholder:text-zinc-600 outline-none focus-visible:ring-2 focus-visible:ring-amber-500';
const READONLY =
  'w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-400';
const BTN =
  'rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition '
  + 'hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 '
  + 'disabled:opacity-60';
const BTN_PRIMARY =
  'rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-zinc-950 transition '
  + 'hover:bg-amber-400 disabled:opacity-60';

const STATUS_STYLE: Record<string, string> = {
  healthy: 'bg-emerald-500/15 text-emerald-300',
  degraded: 'bg-amber-500/15 text-amber-300',
  unavailable: 'bg-rose-500/15 text-rose-300',
  unconfigured: 'bg-zinc-700 text-zinc-300',
};
const STATUS_WORD: Record<string, string> = {
  healthy: 'Provider will accept mail',
  degraded: 'Degraded',
  unavailable: 'Provider unavailable',
  unconfigured: 'Not configured',
};

const fmt = (iso: string | null) => {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Never' : d.toLocaleString();
};

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <label className={LABEL}>{label}</label>
      <p className={READONLY}>{value}</p>
      {note && <p className={HINT}>{note}</p>}
    </div>
  );
}

export default function MailProviderSettings() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [saving, setSaving] = useState(false);

  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<Overview['health'] | null>(null);

  /* One ref PER ACTION.
     A single shared flag meant that clicking Save while a provider check was
     still running - and a live check is a ~14s handshake - silently dropped
     the save with no error and no feedback. The two are independent
     operations and must not block each other. Each still guards its own
     double-click. */
  const savingRef = useRef(false);
  const checkingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await fetch('/api/super-admin/mail/provider', { cache: 'no-store' });
      const payload = await r.json().catch(() => null);
      if (!r.ok) {
        setError(describeFetchError(r.status, payload?.error, 'Unable to load provider settings.'));
        return;
      }
      const overview = payload as Overview;
      setData(overview);
      setFromName(overview.sender.fromName);
      setReplyTo(overview.sender.replyTo);
    } catch { setError('Could not reach the server.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/super-admin/mail/provider', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromName, replyTo }),
      });
      const payload = await r.json().catch(() => null);
      if (!r.ok) {
        setError(describeFetchError(r.status, payload?.error, 'Unable to save.'));
        return;
      }
      setNotice('Sender identity saved. New messages will use it.');
      await load();
    } catch { setError('Could not reach the server.'); }
    finally { savingRef.current = false; setSaving(false); }
  }, [fromName, replyTo, load]);

  const check = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true; setChecking(true); setError(''); setCheckResult(null);
    try {
      const r = await fetch('/api/super-admin/mail/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check' }),
      });
      const payload = await r.json().catch(() => null);
      if (!r.ok) {
        setError(describeFetchError(r.status, payload?.error, 'The check could not be run.'));
        return;
      }
      setCheckResult(payload as Overview['health']);
    } catch { setError('Could not reach the server.'); }
    finally { checkingRef.current = false; setChecking(false); }
  }, []);

  const health = checkResult ?? data?.health ?? null;
  const dirty = Boolean(data)
    && (fromName !== data!.sender.fromName || replyTo !== data!.sender.replyTo);

  return (
    <div className="space-y-4">
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
      {loading && !data && (
        <p aria-live="polite" className="text-[12px] text-zinc-500">Loading provider settings…</p>
      )}

      {data && (
        <>
          {/* Status */}
          <div className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className={LABEL}>Provider</p>
                <p className="text-sm font-semibold text-zinc-100">
                  {data.provider.type} · {data.provider.host}
                </p>
              </div>
              <span className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  health ? (STATUS_STYLE[health.status] ?? 'bg-zinc-700 text-zinc-300')
                    : 'bg-zinc-700 text-zinc-300'}`}>
                  {health ? (STATUS_WORD[health.status] ?? health.status) : 'Not checked yet'}
                </span>
                <button type="button" onClick={() => void check()} disabled={checking}
                  className={BTN}>
                  {checking ? 'Checking…' : 'Check provider'}
                </button>
              </span>
            </div>
            <p className={HINT}>
              {data.provider.configured
                ? 'The provider is configured.'
                : 'The provider is not fully configured — mail cannot be sent.'}
              {' '}Last checked {fmt(health?.checkedAt ?? null)}. Opening the Mail Center does not
              open a connection; this check does.
            </p>

            {health?.failureKind && (
              <div className="mt-2 space-y-1 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                <p className="text-[12px] font-semibold text-rose-300">
                  {health.status === 'unavailable' ? 'The provider refused the connection.'
                    : 'The provider reported a problem.'}
                </p>
                <p className="text-[12px] text-zinc-300">
                  {health.failureKind}
                  {health.providerCode ? ` · code ${health.providerCode}` : ''}
                  {health.retryable !== null
                    ? ` · ${health.retryable ? 'retrying may help' : 'retrying will not help'}` : ''}
                </p>
                {health.advice && <p className="text-[12px] text-zinc-400">{health.advice}</p>}
                {health.message && (
                  <p className="break-words text-[11px] text-zinc-500">{health.message}</p>
                )}
              </div>
            )}
          </div>

          {/* Configuration — read only */}
          <div className={CARD}>
            <p className={LABEL}>Connection</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Row label="Host" value={data.provider.host}
                note={data.configuredExternally.host ? 'Set by SMTP_HOST' : 'Stored configuration'} />
              <Row label="Port" value={String(data.provider.port)}
                note={data.configuredExternally.port ? 'Set by SMTP_PORT' : 'Stored configuration'} />
              <Row label="Encryption" value={data.provider.encryption} />
              <Row label="Authentication"
                value={data.provider.requiresAuth ? 'Required' : 'Not required'} />
              <Row label="Username"
                value={data.provider.usernamePresent ? 'Configured' : 'Not configured'}
                note="The username itself is not shown here." />
              {/* Presence only. A mask still discloses length and existence. */}
              <Row label="Password"
                value={data.provider.credentialPresent ? 'Configured' : 'Not configured'}
                note="Credentials are never displayed or editable from this screen." />
            </div>
            <p className={`${HINT} mt-3`}>
              Connection settings are read-only here. Changing a host, port or credential is a
              deployment action — update the environment configuration and redeploy. This page
              cannot change them, and does not pretend to.
            </p>
          </div>

          {/* Sender identity — the only editable part */}
          <div className={CARD}>
            <p className={LABEL}>Sender identity</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="pv-from-name">From name</label>
                <input id="pv-from-name" className={INPUT} value={fromName}
                  onChange={(e) => setFromName(e.target.value)} maxLength={120} />
              </div>
              <Row label="From address" value={data.sender.fromEmail}
                note={data.configuredExternally.credential
                  ? 'Must match the authenticated mailbox — change it with the credentials.'
                  : 'Must match the authenticated mailbox.'} />
              <div>
                <label className={LABEL} htmlFor="pv-reply-to">Reply-to (optional)</label>
                <input id="pv-reply-to" type="email" className={INPUT} value={replyTo}
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="replies@example.com" />
                <p className={HINT}>Leave empty to have replies go to the from address.</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void save()} disabled={saving || !dirty}
                className={BTN_PRIMARY}>
                {saving ? 'Saving…' : 'Save sender identity'}
              </button>
              {dirty && <span className="text-[11px] text-amber-300">Unsaved changes.</span>}
            </div>
          </div>

          {/* Recent activity */}
          <div className={CARD}>
            <p className={LABEL}>Recent provider activity</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className={LABEL}>Last accepted by provider</p>
                <p className="text-[12px] text-zinc-300">{fmt(data.activity.lastAcceptedAt)}</p>
              </div>
              <div>
                <p className={LABEL}>Last provider failure</p>
                <p className="text-[12px] text-zinc-300">
                  {fmt(data.activity.lastFailedAt)}
                  {data.activity.lastFailureKind ? ` · ${data.activity.lastFailureKind}` : ''}
                  {data.activity.lastFailureCode ? ` · ${data.activity.lastFailureCode}` : ''}
                </p>
              </div>
            </div>
            {data.activity.lastFailureAdvice && (
              <p className={HINT}>{data.activity.lastFailureAdvice}</p>
            )}
            <p className={HINT}>
              &ldquo;Accepted&rdquo; means the provider took the message. This application has no
              delivery callbacks, so it is not proof that anything reached an inbox. Individual
              attempts are in the Outbox.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
