'use client';

/**
 * Mail Center → Overview.
 *
 * Every number here comes from `/api/super-admin/mail/health`, which reads the
 * real outbox and the real campaign store. Nothing is estimated, and a figure
 * the server could not compute renders as "Not available" rather than 0 —
 * "0 failures" and "we could not check" must never look the same.
 *
 * The vocabulary is deliberate and is the thing most likely to be eroded by a
 * later edit: the provider ACCEPTING a message is not the same as an inbox
 * RECEIVING it. Without provider delivery callbacks this application cannot
 * know about delivery, so it says "accepted" everywhere and never "delivered".
 */
import { useCallback, useEffect, useState } from 'react';

type ProviderStatus = 'healthy' | 'degraded' | 'unavailable' | 'unconfigured';

interface CampaignRow {
  id: string; title: string; subject: string; status: string;
  sendAt: string | null; updatedAt: string;
  total: number | null; sent: number | null; failed: number | null;
}
interface FailureRow {
  to: string; subject: string; createdAt: string;
  error: string | null; kind: string | null; retryable: boolean | null;
}
interface Health {
  provider: {
    provider: string; host: string; port: number; status: ProviderStatus;
    latencyMs: number | null; checkedAt: string;
    failure?: { kind: string; message: string; code?: number; retryable: boolean; advice: string };
  } | null;
  components: Record<string, string>;
  stats: {
    sentToday: number; sentWeek: number; sentMonth: number; failedToday: number;
    totalSent: number; totalFailed: number; totalQueued: number;
    acceptanceRate: number | null;
    openRate: number | null; clickRate: number | null;
    lastSentAt: string | null; lastFailedAt: string | null;
  };
  campaigns: {
    total: number; draft: number; scheduled: number; sending: number;
    sent: number; partiallyFailed: number; failed: number; pendingRetries: number;
    recent: CampaignRow[];
  };
  recentFailures: FailureRow[];
}

const CARD = 'rounded-xl border border-zinc-800 bg-zinc-900/60 p-4';
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
const BTN =
  'rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition '
  + 'hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 '
  + 'disabled:opacity-60';

const metric = (v: number | null | undefined, suffix = '') =>
  v === null || v === undefined ? 'Not available' : `${v.toLocaleString()}${suffix}`;

const fmt = (iso: string | null) => {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'Unknown' : d.toLocaleString();
};

const STATUS_TONE: Record<string, string> = {
  draft: 'text-zinc-400',
  scheduled: 'text-sky-400',
  sending: 'text-amber-400',
  sent: 'text-emerald-400',
  partially_failed: 'text-amber-400',
  failed: 'text-rose-400',
  cancelled: 'text-zinc-500',
};
const STATUS_WORD: Record<string, string> = {
  draft: 'Draft', scheduled: 'Scheduled', sending: 'Sending', sent: 'Sent',
  partially_failed: 'Partially failed', failed: 'Failed', cancelled: 'Cancelled',
};

function Stat({ value, label, tone, hint }: {
  value: string; label: string; tone?: string; hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
      <p className={`truncate text-xl font-black tabular-nums ${tone ?? 'text-zinc-100'}`} title={value}>
        {value}
      </p>
      <p className={`mt-0.5 ${LABEL}`}>{label}</p>
      {hint && <p className="mt-0.5 truncate text-[10px] text-zinc-600" title={hint}>{hint}</p>}
    </div>
  );
}

export default function MailOverview({ onOpenTab }: { onOpenTab?: (tab: string) => void }) {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      /* `provider=cached` avoids a ~5.5s SMTP handshake on first paint. The
         Health tab performs the live check when an admin asks for it. */
      const r = await fetch('/api/super-admin/mail/health?provider=cached', { cache: 'no-store' });
      if (!r.ok) {
        setError(r.status === 401 ? 'Session expired — sign in again.' : 'Could not load mail overview.');
        return;
      }
      setHealth(await r.json());
    } catch { setError('Could not reach the server.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  /* One read on mount, refreshed on demand. No polling. */
  useEffect(() => { void load(false); }, [load]);

  if (loading) {
    return <p className="text-sm text-zinc-500" aria-live="polite">Loading mail overview…</p>;
  }
  if (!health) {
    return (
      <div className={CARD}>
        <p role="alert" className="text-sm text-rose-400">{error || 'Mail overview unavailable.'}</p>
        <button type="button" onClick={() => void load(false)} className={`${BTN} mt-3`}>Retry</button>
      </div>
    );
  }

  const { stats, campaigns, provider } = health;
  const providerBroken = provider?.status === 'unavailable' || provider?.status === 'degraded';
  /* No check has run yet in this process. Saying nothing would read as
     healthy, so it is stated. */
  const providerUnknown = !provider;

  return (
    <div className="space-y-4">
      {/* Delivery is either possible or it is not; say so before anything else. */}
      {providerUnknown && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
          <p className="text-[13px] font-semibold text-zinc-300">
            <span aria-hidden>○ </span>Mail provider not checked yet
          </p>
          <p className="mt-1 text-[12px] text-zinc-500">
            Provider status is not shown here because checking it opens a live connection.
          </p>
          {onOpenTab && (
            <button type="button" onClick={() => onOpenTab('health')} className={`${BTN} mt-2`}>
              Check mail health
            </button>
          )}
        </div>
      )}

      {providerBroken && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3">
          <p className="text-[13px] font-bold text-rose-300">
            <span aria-hidden>● </span>Mail delivery is not working
          </p>
          <p className="mt-1 text-[12px] text-zinc-300">
            {provider?.failure?.advice
              ?? 'The mail provider is not accepting messages. Campaigns will queue and record real failures.'}
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            The application, database and queue are healthy — this is a provider problem.
          </p>
          {onOpenTab && (
            <button type="button" onClick={() => onOpenTab('health')} className={`${BTN} mt-2`}>
              Open mail health
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-zinc-500">
          Figures come from the outbox and campaign records. Last send {fmt(stats.lastSentAt)}.
        </p>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className={BTN}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </p>
      )}

      {/* ── Volume ── */}
      <div>
        <p className={`${LABEL} mb-2`}>Accepted by the provider</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Stat value={metric(stats.sentToday)} label="Today" />
          <Stat value={metric(stats.sentWeek)} label="Last 7 days" />
          <Stat value={metric(stats.sentMonth)} label="Last 30 days" />
          <Stat value={metric(stats.totalQueued)} label="Queued" />
          <Stat value={metric(stats.failedToday)} label="Failed today"
            tone={stats.failedToday ? 'text-rose-400' : undefined} />
          <Stat value={metric(stats.acceptanceRate, '%')} label="Acceptance rate"
            tone={stats.acceptanceRate !== null && stats.acceptanceRate < 90 ? 'text-amber-400' : undefined} />
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
          &ldquo;Accepted&rdquo; means the provider took the message. It is not proof of inbox
          delivery — this application has no delivery callbacks, so it does not claim delivery.
          Open and click rates ({metric(stats.openRate, '%')} / {metric(stats.clickRate, '%')}) come
          from the tracking pixel and rewritten links, and under-count clients that block images.
        </p>
      </div>

      {/* ── Campaigns ── */}
      <div>
        <p className={`${LABEL} mb-2`}>Campaigns</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Stat value={metric(campaigns.scheduled)} label="Scheduled" />
          <Stat value={metric(campaigns.sending)} label="Sending"
            tone={campaigns.sending ? 'text-amber-400' : undefined} />
          <Stat value={metric(campaigns.sent)} label="Sent" />
          <Stat value={metric(campaigns.partiallyFailed)} label="Partially failed"
            tone={campaigns.partiallyFailed ? 'text-amber-400' : undefined} />
          <Stat value={metric(campaigns.failed)} label="Failed"
            tone={campaigns.failed ? 'text-rose-400' : undefined} />
          <Stat value={metric(campaigns.pendingRetries)} label="Awaiting retry"
            hint="Recipients queued for another attempt" />
        </div>
      </div>

      {/* ── Recent campaigns ── */}
      <section className={CARD} aria-label="Recent campaigns">
        <p className={LABEL}>Recent campaigns</p>
        {campaigns.recent.length === 0 ? (
          <p className="mt-2 text-[12px] text-zinc-500">No campaigns yet.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[12px]">
              <thead>
                <tr className={LABEL}>
                  <th scope="col" className="py-1 pr-3 font-semibold">Campaign</th>
                  <th scope="col" className="py-1 pr-3 font-semibold">Status</th>
                  <th scope="col" className="py-1 pr-3 font-semibold">Accepted</th>
                  <th scope="col" className="py-1 pr-3 font-semibold">Failed</th>
                  <th scope="col" className="py-1 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.recent.map((c) => (
                  <tr key={c.id} className="border-t border-zinc-900">
                    <td className="max-w-[220px] truncate py-1.5 pr-3 text-zinc-200" title={c.subject}>
                      {c.title || c.subject}
                    </td>
                    <td className={`py-1.5 pr-3 font-semibold ${STATUS_TONE[c.status] ?? 'text-zinc-300'}`}>
                      {STATUS_WORD[c.status] ?? c.status}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums text-zinc-300">
                      {c.sent === null ? '—' : `${c.sent}${c.total !== null ? ` / ${c.total}` : ''}`}
                    </td>
                    <td className={`py-1.5 pr-3 tabular-nums ${c.failed ? 'text-rose-400' : 'text-zinc-300'}`}>
                      {c.failed === null ? '—' : c.failed}
                    </td>
                    <td className="py-1.5 text-zinc-500">{fmt(c.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Recent failures ── */}
      <section className={CARD} aria-label="Recent failures">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={LABEL}>Recent failures</p>
          {onOpenTab && health.recentFailures.length > 0 && (
            <button type="button" onClick={() => onOpenTab('health')} className={BTN}>
              View failure causes
            </button>
          )}
        </div>
        {health.recentFailures.length === 0 ? (
          <p className="mt-2 text-[12px] text-zinc-500">No failures recorded.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {health.recentFailures.map((f) => (
              <li key={`${f.to}-${f.createdAt}`} className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0 break-all text-[12px] text-zinc-200">{f.to}</span>
                  <span className="shrink-0 text-[11px] text-zinc-500">{fmt(f.createdAt)}</span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-zinc-500" title={f.subject}>{f.subject}</p>
                {f.error && (
                  <p className="mt-1 break-words text-[11px] text-rose-300">
                    {f.kind ? <span className="capitalize">{f.kind.replace('_', ' ')} · </span> : null}
                    {f.error}
                  </p>
                )}
                {f.retryable !== null && (
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {f.retryable
                      ? 'Temporary — will be retried automatically.'
                      : 'Permanent — will not be retried.'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
