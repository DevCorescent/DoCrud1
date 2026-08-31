'use client';

/**
 * Mail Center → delivery health.
 *
 * The problem this replaces: a Mail Center whose headline number was
 * "Failed: 50" with no way to learn that all fifty were the same suspended
 * mailbox. An admin could not tell an application bug from a billing problem,
 * and the panel offered no route from the number to the cause.
 *
 * So the first thing on screen is which layer is broken — application, queue,
 * database, provider — and the failure count expands into the classified
 * reason and the remedy.
 *
 * Nothing here rounds a failure up into a success. If the provider is
 * suspended it says so, in those words, above the compose button.
 */
import { useCallback, useEffect, useState } from 'react';

type ProviderStatus = 'healthy' | 'degraded' | 'unavailable' | 'unconfigured';

interface Health {
  provider: {
    provider: string; host: string; port: number; secure: boolean;
    status: ProviderStatus; latencyMs: number | null; checkedAt: string;
    failure?: { kind: string; message: string; code?: number; retryable: boolean; advice: string };
  } | null;
  components: Record<string, string>;
  stats: {
    sentToday: number; failedToday: number;
    totalSent: number; totalFailed: number; totalQueued: number;
    acceptanceRate: number | null;
    opens: number; clicks: number;
    openRate: number | null; clickRate: number | null;
    lastSentAt: string | null; lastFailedAt: string | null;
  };
  failureGroups: { kind: string; advice: string; count: number; example: string }[];
}

const CARD = 'rounded-xl border border-zinc-800 bg-zinc-900/60 p-4';
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
const BTN =
  'rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition '
  + 'hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 '
  + 'disabled:opacity-60';

/** A metric the server could not compute must not render as zero. */
const metric = (v: number | null | undefined, suffix = '') =>
  v === null || v === undefined ? 'Not available' : `${v.toLocaleString()}${suffix}`;

const fmt = (iso: string | null) => {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString();
};

const STATUS_WORD: Record<ProviderStatus, { word: string; tone: string }> = {
  healthy: { word: 'Operational', tone: 'text-emerald-400' },
  degraded: { word: 'Degraded', tone: 'text-amber-400' },
  unavailable: { word: 'Unavailable', tone: 'text-rose-400' },
  unconfigured: { word: 'Not configured', tone: 'text-zinc-400' },
};

function Stat({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
      <p className={`truncate text-xl font-black tabular-nums ${tone ?? 'text-zinc-100'}`} title={value}>
        {value}
      </p>
      <p className={`mt-0.5 ${LABEL}`}>{label}</p>
    </div>
  );
}

export default function MailHealthPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [showFailures, setShowFailures] = useState(false);

  const load = useCallback(async (force = false) => {
    if (force) setChecking(true); else setLoading(true);
    setError('');
    try {
      const r = await fetch(`/api/super-admin/mail/health${force ? '?force=1' : ''}`, { cache: 'no-store' });
      if (!r.ok) {
        setError(r.status === 401 ? 'Session expired — sign in again.' : 'Could not load mail health.');
        return;
      }
      setHealth(await r.json());
    } catch { setError('Could not reach the server.'); }
    finally { setLoading(false); setChecking(false); }
  }, []);

  /* One read on mount. No polling: verifying opens a real SMTP connection. */
  useEffect(() => { void load(false); }, [load]);

  if (loading) {
    return <p className="text-sm text-zinc-500" aria-live="polite">Loading mail health…</p>;
  }
  if (!health) {
    return (
      <div className={CARD}>
        <p role="alert" className="text-sm text-rose-400">{error || 'Mail health unavailable.'}</p>
        <button type="button" onClick={() => void load(false)} className={`${BTN} mt-3`}>Retry</button>
      </div>
    );
  }

  const p = health.provider;
  const status: ProviderStatus = p?.status ?? 'unconfigured';
  const s = STATUS_WORD[status];
  const broken = status === 'unavailable' || status === 'degraded';
  const { stats } = health;

  return (
    <div className="space-y-4">
      {/* ── Delivery health, above everything else ── */}
      <section className={`rounded-xl border p-4 ${
        status === 'healthy' ? 'border-emerald-500/30 bg-emerald-500/5'
          : status === 'unavailable' ? 'border-rose-500/40 bg-rose-500/10'
          : status === 'degraded' ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-zinc-800 bg-zinc-900/60'}`}
        aria-label="Mail delivery health">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={LABEL}>Mail delivery</p>
            <p className={`mt-1 text-[15px] font-bold ${s.tone}`}>
              <span aria-hidden>● </span>{s.word}
              {broken && <span className="ml-2 text-[12px] font-semibold text-rose-300">Action required</span>}
            </p>
            {p && (
              <p className="mt-1 text-[12px] text-zinc-400">
                {p.provider} · {p.host || 'no host'}:{p.port || '—'}
                {p.latencyMs !== null && status === 'healthy' ? ` · ${p.latencyMs} ms` : ''}
              </p>
            )}
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Last checked {fmt(p?.checkedAt ?? null)}
            </p>
          </div>
          <button type="button" onClick={() => void load(true)} disabled={checking} className={BTN}>
            {checking ? 'Checking…' : 'Check provider'}
          </button>
        </div>

        {p?.failure && (
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <p className="text-[12px] font-semibold text-rose-300">
              {p.failure.code ? `SMTP ${p.failure.code} · ` : ''}{p.failure.kind.replace('_', ' ')}
            </p>
            <p className="mt-1 break-words text-[12px] text-zinc-300">{p.failure.message}</p>
            <p className="mt-1.5 text-[12px] text-amber-300">{p.failure.advice}</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {p.failure.retryable
                ? 'Classified as temporary — queued mail will be retried automatically.'
                : 'Classified as permanent — retrying will not help until this is fixed.'}
            </p>
          </div>
        )}

        {/* Which layer is actually broken. */}
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          {Object.entries(health.components).map(([name, value]) => {
            const ok = value === 'healthy';
            return (
              <li key={name} className="text-[12px]">
                <span aria-hidden className={ok ? 'text-emerald-400' : 'text-rose-400'}>● </span>
                <span className="capitalize text-zinc-400">{name}</span>{' '}
                <span className={`font-semibold ${ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {ok ? 'Healthy' : STATUS_WORD[value as ProviderStatus]?.word ?? value}
                </span>
              </li>
            );
          })}
        </ul>
        {broken && (
          <p className="mt-2 text-[12px] text-zinc-300">
            The application, queue and database are working. Mail is failing at the provider, so
            campaigns will queue and record real failures rather than being delivered.
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </p>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <Stat value={metric(stats.sentToday)} label="Accepted today" />
        <Stat value={metric(stats.failedToday)} label="Failed today"
          tone={stats.failedToday ? 'text-rose-400' : undefined} />
        <Stat value={metric(stats.totalQueued)} label="Queued" />
        <Stat value={metric(stats.acceptanceRate, '%')} label="Acceptance rate"
          tone={stats.acceptanceRate !== null && stats.acceptanceRate < 90 ? 'text-amber-400' : undefined} />
        <Stat value={metric(stats.openRate, '%')} label="Open rate" />
        <Stat value={metric(stats.clickRate, '%')} label="Click rate" />
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-500">
        &ldquo;Accepted&rdquo; means the provider took the message — not that it reached an inbox.
        Without provider delivery callbacks the application cannot confirm inbox delivery, and this
        panel will not claim otherwise. Open and click rates come from the existing tracking pixel
        and link rewriting, so they under-count clients that block images.
      </p>

      {/* ── Failures, explorable ── */}
      <section className={CARD}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={LABEL}>Failures</p>
            <p className={`mt-1 text-xl font-black tabular-nums ${stats.totalFailed ? 'text-rose-400' : 'text-zinc-100'}`}>
              {metric(stats.totalFailed)}
            </p>
            <p className="text-[11px] text-zinc-500">Last failure {fmt(stats.lastFailedAt)}</p>
          </div>
          {health.failureGroups.length > 0 && (
            <button type="button" onClick={() => setShowFailures((v) => !v)}
              aria-expanded={showFailures} className={BTN}>
              {showFailures ? 'Hide causes' : `View ${health.failureGroups.length} cause${health.failureGroups.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>

        {showFailures && (
          <ul className="mt-3 space-y-2">
            {health.failureGroups.map((g) => (
              <li key={g.kind + g.example} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-[12px] font-semibold text-zinc-200">
                  <span className="tabular-nums text-rose-400">{g.count.toLocaleString()}</span>{' '}
                  message{g.count === 1 ? '' : 's'} · <span className="capitalize">{g.kind.replace('_', ' ')}</span>
                </p>
                <p className="mt-1 break-words text-[11px] text-zinc-400">{g.example}</p>
                <p className="mt-1 text-[11px] text-amber-300">{g.advice}</p>
              </li>
            ))}
          </ul>
        )}
        {stats.totalFailed > 0 && health.failureGroups.length === 0 && (
          <p className="mt-2 text-[11px] text-zinc-500">
            No error text was recorded for these failures.
          </p>
        )}
      </section>
    </div>
  );
}
