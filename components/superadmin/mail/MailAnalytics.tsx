'use client';

/**
 * Mail Center -> Analytics.
 *
 * Reporting on what the mail system actually did. The vocabulary is the same
 * one the Outbox uses and is the thing most likely to erode in a later edit:
 * the provider ACCEPTING a message is the strongest evidence this application
 * has, so there is no "delivery rate" on this screen and no code path that
 * could render one.
 *
 * Two other rules shape almost every component below:
 *
 *   - A metric with no eligible data reads "Not available", never 0%. On a
 *     dashboard those look identical and mean opposite things.
 *   - Every figure is aggregated on the SERVER. The browser receives counts and
 *     buckets, never rows; an analytics page that downloads the log to add it
 *     up stops working exactly when the log becomes worth reading.
 *
 * The chart is hand-drawn SVG rather than a charting library: it renders three
 * series, and adding a dependency for that would be a poor trade.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface Counts {
  attempted: number; accepted: number; failed: number; queued: number;
  opened: number; clicked: number; totalOpens: number; totalClicks: number;
  permanentFailures: number; retryableFailures: number;
}
interface Rates {
  acceptanceRate: number | null; failureRate: number | null;
  openRate: number | null; clickRate: number | null;
  permanentFailureRate: number | null;
}
interface SeriesPoint { bucket: string; attempted: number; accepted: number; failed: number }
interface FailureKind {
  kind: string; count: number; share: number | null;
  retryable: number; permanent: number; derived: number;
}
interface ProviderCode { code: string; count: number; kind: string; retryable: boolean }
interface CampaignStat {
  id: string; title: string; status: string; audienceDescription: string | null;
  sendAt: string | null; attempted: number; accepted: number; failed: number;
  pending: number; acceptanceRate: number | null; openRate: number | null;
  clickRate: number | null; rankable: boolean;
}
interface SystemEmailStat {
  type: string; attempted: number; accepted: number; failed: number;
  failureRate: number | null; openRate: number | null; clickRate: number | null;
}
interface Analytics {
  range: { from: string; to: string; timezone: string; granularity: string };
  scope: string;
  counts: Counts;
  rates: Rates;
  previous: { counts: Counts; rates: Rates } | null;
  series: SeriesPoint[];
  failureKinds: FailureKind[];
  providerCodes: ProviderCode[];
  campaigns: CampaignStat[];
  systemEmails: SystemEmailStat[];
  retry: {
    pendingRetries: number; failedAfterRetries: number; retryExhausted: number;
    succeededAfterRetry: null; averageAttempts: number | null;
    attemptsRecorded: number; maxAttempts: number;
  };
  derivedClassifications: number;
  backend: string;
  complete: boolean;
  truncated: boolean;
  generatedAt: string;
  cached: boolean;
}

const CARD = 'rounded-xl border border-zinc-800 bg-zinc-900/60 p-4';
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
const HINT = 'mt-1 text-[11px] leading-relaxed text-zinc-500';
const INPUT =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 '
  + 'outline-none focus-visible:ring-2 focus-visible:ring-amber-500';
const BTN =
  'rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition '
  + 'hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 '
  + 'disabled:opacity-60';

const NOT_AVAILABLE = 'Not available';
const NOT_AVAILABLE_REASON = 'There is not enough eligible data to calculate this metric.';
const TRACKING_NOTE =
  'Open and click tracking can under-count because some email clients block images or tracking '
  + 'redirects. A recorded open means the tracking pixel was requested — not that a person read '
  + 'the email.';

const RANGES = [
  { value: '1', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];
const SCOPES = [
  { value: 'production', label: 'Production only' },
  { value: 'test', label: 'Tests only' },
  { value: 'all', label: 'All mail' },
];
const TIMEZONES = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Tokyo'];

/** A percentage, or the honest absence of one. Never 0% standing in for "none". */
const pct = (v: number | null) => (v === null ? NOT_AVAILABLE : `${v}%`);
const num = (v: number) => v.toLocaleString();

function Delta({ current, previous }: { current: number; previous: number | undefined }) {
  /* No baseline means no comparison. "Up 100%" from nothing is arithmetic, not
     information. */
  if (previous === undefined || previous <= 0) {
    return <span className="text-[11px] text-zinc-600">No prior period to compare</span>;
  }
  const change = Math.round(((current - previous) / previous) * 1000) / 10;
  const up = change > 0;
  return (
    <span className={`text-[11px] ${change === 0 ? 'text-zinc-500' : up ? 'text-emerald-400' : 'text-rose-400'}`}>
      {change === 0 ? 'No change' : `${up ? '+' : ''}${change}% vs previous period`}
    </span>
  );
}

function Card({ label, value, description, unavailable, footer }: {
  label: string; value: string; description: string;
  unavailable?: boolean; footer?: React.ReactNode;
}) {
  return (
    <div className={CARD}>
      <p className={LABEL}>{label}</p>
      <p className={`mt-1 text-xl font-bold ${unavailable ? 'text-zinc-500' : 'text-zinc-100'}`}>
        {value}
      </p>
      <p className={HINT} title={description}>
        {unavailable ? NOT_AVAILABLE_REASON : description}
      </p>
      {footer && <div className="mt-1">{footer}</div>}
    </div>
  );
}

/**
 * Three series over time, drawn directly.
 *
 * Scaled to the largest value present, with a floor of 1 so an empty range
 * cannot divide by zero and produce NaN coordinates.
 */
function ActivityChart({ series, granularity }: { series: SeriesPoint[]; granularity: string }) {
  const width = 720;
  const height = 200;
  const pad = { top: 12, right: 12, bottom: 26, left: 40 };

  const max = Math.max(1, ...series.map((p) => p.attempted));
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;

  const line = (key: 'attempted' | 'accepted' | 'failed') => series
    .map((p, i) => {
      const x = pad.left + (series.length === 1 ? innerW / 2 : i * stepX);
      const y = pad.top + innerH - (p[key] / max) * innerH;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  if (series.length === 0) {
    return (
      <p className="py-8 text-center text-[12px] text-zinc-500">
        No send attempts in this range, so there is nothing to plot.
      </p>
    );
  }

  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}
        role="img" aria-label={`Mail activity by ${granularity}`}
        style={{ minWidth: 420 }}>
        {ticks.map((t, i) => {
          const y = pad.top + innerH - (t / max) * innerH;
          return (
            <g key={i}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y}
                stroke="#3f3f46" strokeWidth="1" strokeDasharray="3 3" />
              <text x={pad.left - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#71717a">
                {t}
              </text>
            </g>
          );
        })}
        <path d={line('attempted')} fill="none" stroke="#a1a1aa" strokeWidth="2" />
        <path d={line('accepted')} fill="none" stroke="#34d399" strokeWidth="2" />
        <path d={line('failed')} fill="none" stroke="#fb7185" strokeWidth="2" />
        {series.map((p, i) => {
          if (series.length > 12 && i % Math.ceil(series.length / 8) !== 0) return null;
          const x = pad.left + (series.length === 1 ? innerW / 2 : i * stepX);
          return (
            <text key={p.bucket} x={x} y={height - 8} textAnchor="middle" fontSize="9" fill="#71717a">
              {p.bucket.slice(5)}
            </text>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px]">
        <span className="text-zinc-400">— Attempted</span>
        <span className="text-emerald-400">— Accepted by provider</span>
        <span className="text-rose-400">— Failed</span>
      </div>
    </div>
  );
}

type CampaignSort = 'attempted' | 'accepted' | 'failed' | 'acceptanceRate' | 'openRate' | 'clickRate';

export default function MailAnalytics({ onOpenCampaign }: {
  onOpenCampaign?: (campaignId: string) => void;
} = {}) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [range, setRange] = useState('30');
  const [scope, setScope] = useState('production');
  const [timezone, setTimezone] = useState('UTC');
  const [granularity, setGranularity] = useState('day');
  const [sort, setSort] = useState<CampaignSort>('attempted');

  /* Same discipline as the Outbox: an identical in-flight request is
     collapsed, a different one always goes out, and only the newest response
     may write state. */
  const requestSeq = useRef(0);
  const inFlightUrl = useRef<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    const p = new URLSearchParams({ range, scope, timezone, granularity });
    if (refresh) p.set('refresh', '1');
    const url = `/api/super-admin/mail/analytics?${p}`;
    if (!refresh && inFlightUrl.current === url) return;
    inFlightUrl.current = url;
    requestSeq.current += 1;
    const seq = requestSeq.current;
    setLoading(true); setError('');
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const payload = await r.json().catch(() => null);
      if (seq !== requestSeq.current) return;
      if (!r.ok) { setError(payload?.error || 'Unable to load analytics.'); return; }
      setData(payload as Analytics);
    } catch {
      if (seq === requestSeq.current) setError('Could not reach the server.');
    } finally {
      if (inFlightUrl.current === url) inFlightUrl.current = null;
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [range, scope, timezone, granularity]);

  useEffect(() => { void load(); }, [load]);

  const campaigns = useMemo(() => {
    if (!data) return [];
    const rows = data.campaigns.slice();
    rows.sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      /* A campaign whose rate cannot be computed sorts last rather than being
         treated as zero and ranked below every real result. */
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (bv as number) - (av as number);
    });
    return rows;
  }, [data, sort]);

  const c = data?.counts;
  const r = data?.rates;
  const prev = data?.previous?.counts;

  return (
    <div className="space-y-4">
      {/* ── Controls ── */}
      <div className={CARD}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={LABEL} htmlFor="an-range">Date range</label>
            <select id="an-range" className={INPUT} value={range}
              onChange={(e) => setRange(e.target.value)}>
              {RANGES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="an-scope">Mail</label>
            <select id="an-scope" className={INPUT} value={scope}
              onChange={(e) => setScope(e.target.value)}>
              {SCOPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="an-tz">Timezone</label>
            <select id="an-tz" className={INPUT} value={timezone}
              onChange={(e) => setTimezone(e.target.value)}>
              {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="an-gran">Group by</label>
            <div className="flex gap-2">
              <select id="an-gran" className={INPUT} value={granularity}
                onChange={(e) => setGranularity(e.target.value)}>
                <option value="day">Day</option>
                <option value="week">Week</option>
              </select>
              <button type="button" onClick={() => void load(true)} disabled={loading}
                className={BTN}>
                {loading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
        <p className={HINT}>
          Days are grouped in {data?.range.timezone ?? timezone}. Figures come from the outbox,
          campaign delivery records and tracking events — the same records the Outbox console
          shows.
        </p>
      </div>

      {/* Viewing anything other than production must be unmistakable - and the
          banner is driven by the scope of the LOADED FIGURES, not by the
          dropdown. Reading the dropdown meant that during a scope change the
          banner already said "TEST" while the cards still showed the previous
          scope's numbers: a label and a set of figures that disagree is worse
          than either alone. */}
      {data && data.scope !== 'production' && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] font-semibold text-amber-200">
          {data.scope === 'test'
            ? 'Showing TEST sends only. These are not production traffic.'
            : 'Showing ALL mail, including test sends. Test traffic is mixed into these figures.'}
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </p>
      )}

      {data && !data.complete && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          These figures are incomplete: the store holds only its most recent records, so older
          attempts in this range are not counted. Treat the totals as a lower bound.
        </p>
      )}

      {loading && !data && (
        <p aria-live="polite" className="text-[12px] text-zinc-500">Aggregating on the server…</p>
      )}

      {data && c && r && (
        <>
          {/* ── Cards ── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card label="Messages attempted" value={num(c.attempted)}
              description="Send attempts recorded in the outbox for this range."
              footer={<Delta current={c.attempted} previous={prev?.attempted} />} />
            <Card label="Accepted by provider" value={num(c.accepted)}
              description="The provider took the message. This is not confirmation it reached an inbox."
              footer={<Delta current={c.accepted} previous={prev?.accepted} />} />
            <Card label="Acceptance rate" value={pct(r.acceptanceRate)}
              unavailable={r.acceptanceRate === null}
              description="Accepted divided by attempts the provider has answered." />
            <Card label="Failed" value={num(c.failed)}
              description="Attempts the provider refused."
              footer={<Delta current={c.failed} previous={prev?.failed} />} />
            <Card label="Failure rate" value={pct(r.failureRate)}
              unavailable={r.failureRate === null}
              description="Failed divided by attempts the provider has answered." />
            <Card label="Pending retries" value={num(data.retry.pendingRetries)}
              description="Recipients awaiting another automatic attempt, from campaign delivery records." />
            <Card label="Permanent failures" value={num(c.permanentFailures)}
              description="Failures the classifier says retrying cannot fix, such as a suspended mailbox or an unknown recipient." />
            <Card label="Open rate" value={pct(r.openRate)}
              unavailable={r.openRate === null}
              description={`${num(c.opened)} of ${num(c.accepted)} accepted messages recorded at least one open (${num(c.totalOpens)} opens in total).`} />
            <Card label="Click rate" value={pct(r.clickRate)}
              unavailable={r.clickRate === null}
              description={`${num(c.clicked)} of ${num(c.accepted)} accepted messages recorded at least one click (${num(c.totalClicks)} clicks in total).`} />
          </div>

          <p className={`${CARD} text-[11px] leading-relaxed text-zinc-500`}>{TRACKING_NOTE}</p>

          {/* ── Activity ── */}
          <div className={CARD}>
            <p className={LABEL}>Mail activity</p>
            <ActivityChart series={data.series} granularity={data.range.granularity} />
          </div>

          {/* ── Failures ── */}
          <div className={CARD}>
            <p className={LABEL}>Failure breakdown</p>
            {data.failureKinds.length === 0 ? (
              <p className={HINT}>No failures in this range.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[12px]">
                  <thead className="bg-zinc-900">
                    <tr className={LABEL}>
                      <th scope="col" className="p-2 font-semibold">Kind</th>
                      <th scope="col" className="p-2 font-semibold">Count</th>
                      <th scope="col" className="p-2 font-semibold">Share</th>
                      <th scope="col" className="p-2 font-semibold">Retryable</th>
                      <th scope="col" className="p-2 font-semibold">Permanent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.failureKinds.map((k) => (
                      <tr key={k.kind} className="border-t border-zinc-900">
                        <td className="p-2 text-zinc-200">{k.kind}</td>
                        <td className="p-2 tabular-nums text-zinc-300">{num(k.count)}</td>
                        <td className="p-2 tabular-nums text-zinc-400">{pct(k.share)}</td>
                        <td className="p-2 tabular-nums text-zinc-400">{num(k.retryable)}</td>
                        <td className="p-2 tabular-nums text-zinc-400">{num(k.permanent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data.derivedClassifications > 0 && (
              <p className={HINT}>
                {num(data.derivedClassifications)} of these classifications were derived from the
                stored provider error rather than recorded when the failure happened.
              </p>
            )}
          </div>

          {/* ── Provider codes ── */}
          <div className={CARD}>
            <p className={LABEL}>Provider response codes</p>
            {data.providerCodes.length === 0 ? (
              <p className={HINT}>No provider codes recorded in this range.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[440px] text-left text-[12px]">
                  <thead className="bg-zinc-900">
                    <tr className={LABEL}>
                      <th scope="col" className="p-2 font-semibold">Code</th>
                      <th scope="col" className="p-2 font-semibold">Count</th>
                      <th scope="col" className="p-2 font-semibold">Kind</th>
                      <th scope="col" className="p-2 font-semibold">Retryable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.providerCodes.map((p) => (
                      <tr key={p.code} className="border-t border-zinc-900">
                        <td className="p-2 font-mono text-zinc-200">{p.code}</td>
                        <td className="p-2 tabular-nums text-zinc-300">{num(p.count)}</td>
                        <td className="p-2 text-zinc-400">{p.kind}</td>
                        <td className="p-2 text-zinc-400">{p.retryable ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className={HINT}>Only codes this system has actually recorded are listed.</p>
          </div>

          {/* ── Retry ── */}
          <div className={CARD}>
            <p className={LABEL}>Retries</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ['Pending retries', num(data.retry.pendingRetries), false],
                ['Failed after retries', num(data.retry.failedAfterRetries), false],
                ['Retry exhausted', num(data.retry.retryExhausted), false],
                ['Average attempts',
                  data.retry.averageAttempts === null ? NOT_AVAILABLE : String(data.retry.averageAttempts),
                  data.retry.averageAttempts === null],
              ] as const).map(([k, v, un]) => (
                <div key={k}>
                  <p className={LABEL}>{k}</p>
                  <p className={`text-sm font-semibold ${un ? 'text-zinc-500' : 'text-zinc-200'}`}>{v}</p>
                </div>
              ))}
            </div>
            <p className={HINT}>
              Attempts come from campaign delivery records; records written before attempts were
              tracked are not counted ({num(data.retry.attemptsRecorded)} deliveries carry an
              attempt count). Messages that succeeded on a retry are{' '}
              <strong>{NOT_AVAILABLE.toLowerCase()}</strong>: the send loop clears a delivery record
              once it succeeds, so no evidence remains that a retry was ever needed.
            </p>
          </div>

          {/* ── Campaigns ── */}
          <div className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={LABEL}>Campaign performance</p>
              <div>
                <label className="sr-only" htmlFor="an-sort">Sort campaigns by</label>
                <select id="an-sort" className={INPUT} value={sort}
                  onChange={(e) => setSort(e.target.value as CampaignSort)}>
                  <option value="attempted">Sort by attempted</option>
                  <option value="accepted">Sort by accepted</option>
                  <option value="failed">Sort by failed</option>
                  <option value="acceptanceRate">Sort by acceptance rate</option>
                  <option value="openRate">Sort by open rate</option>
                  <option value="clickRate">Sort by click rate</option>
                </select>
              </div>
            </div>
            {campaigns.length === 0 ? (
              <p className={HINT}>No campaign sends in this range.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-[12px]">
                  <thead className="bg-zinc-900">
                    <tr className={LABEL}>
                      <th scope="col" className="p-2 font-semibold">Campaign</th>
                      <th scope="col" className="p-2 font-semibold">Audience</th>
                      <th scope="col" className="p-2 font-semibold">Attempted</th>
                      <th scope="col" className="p-2 font-semibold">Accepted</th>
                      <th scope="col" className="p-2 font-semibold">Failed</th>
                      <th scope="col" className="p-2 font-semibold">Pending</th>
                      <th scope="col" className="p-2 font-semibold">Acceptance</th>
                      <th scope="col" className="p-2 font-semibold">Opens</th>
                      <th scope="col" className="p-2 font-semibold">Clicks</th>
                      <th scope="col" className="p-2 font-semibold">Open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((cp) => (
                      <tr key={cp.id} className="border-t border-zinc-900 hover:bg-zinc-800/30">
                        <td className="max-w-[180px] p-2">
                          <span className="block truncate text-zinc-200">{cp.title}</span>
                          <span className="block truncate text-[11px] text-zinc-500">{cp.status}</span>
                        </td>
                        <td className="max-w-[140px] truncate p-2 text-zinc-400">
                          {cp.audienceDescription ?? '—'}
                        </td>
                        <td className="p-2 tabular-nums text-zinc-300">{num(cp.attempted)}</td>
                        <td className="p-2 tabular-nums text-zinc-300">{num(cp.accepted)}</td>
                        <td className="p-2 tabular-nums text-zinc-300">{num(cp.failed)}</td>
                        <td className="p-2 tabular-nums text-zinc-300">{num(cp.pending)}</td>
                        <td className="p-2 tabular-nums text-zinc-400">{pct(cp.acceptanceRate)}</td>
                        <td className="p-2 tabular-nums text-zinc-400">
                          {/* A rate over a handful of messages is not a
                              comparable figure, and is not shown as one. */}
                          {cp.rankable ? pct(cp.openRate)
                            : <span className="text-zinc-600" title="Too few accepted messages for this rate to be meaningful">Too few</span>}
                        </td>
                        <td className="p-2 tabular-nums text-zinc-400">
                          {cp.rankable ? pct(cp.clickRate)
                            : <span className="text-zinc-600">Too few</span>}
                        </td>
                        <td className="p-2">
                          {onOpenCampaign && (
                            <button type="button" className={BTN}
                              aria-label={`Open campaign ${cp.title}`}
                              onClick={() => onOpenCampaign(cp.id)}>View</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className={HINT}>
              Open and click figures are tracking metrics, not proof that anyone read a message.
              Campaigns with fewer than 20 accepted messages are not given a rate, because one
              recipient would move it by five points.
            </p>
          </div>

          {/* ── System emails ── */}
          <div className={CARD}>
            <p className={LABEL}>System emails</p>
            {data.systemEmails.length === 0 ? (
              <p className={HINT}>No transactional sends in this range.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-[12px]">
                  <thead className="bg-zinc-900">
                    <tr className={LABEL}>
                      <th scope="col" className="p-2 font-semibold">Type</th>
                      <th scope="col" className="p-2 font-semibold">Attempted</th>
                      <th scope="col" className="p-2 font-semibold">Accepted</th>
                      <th scope="col" className="p-2 font-semibold">Failed</th>
                      <th scope="col" className="p-2 font-semibold">Failure rate</th>
                      <th scope="col" className="p-2 font-semibold">Open rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.systemEmails.map((s) => (
                      <tr key={s.type} className="border-t border-zinc-900">
                        <td className="p-2 font-mono text-zinc-200">{s.type}</td>
                        <td className="p-2 tabular-nums text-zinc-300">{num(s.attempted)}</td>
                        <td className="p-2 tabular-nums text-zinc-300">{num(s.accepted)}</td>
                        <td className="p-2 tabular-nums text-zinc-300">{num(s.failed)}</td>
                        <td className="p-2 tabular-nums text-zinc-400">{pct(s.failureRate)}</td>
                        <td className="p-2 tabular-nums text-zinc-400">{pct(s.openRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-zinc-500">
            Aggregated on the server from the {data.backend} store
            {data.cached ? ' (cached briefly; use Refresh for current figures)' : ''}. To inspect an
            individual send attempt, use the Outbox.
          </p>
        </>
      )}
    </div>
  );
}
