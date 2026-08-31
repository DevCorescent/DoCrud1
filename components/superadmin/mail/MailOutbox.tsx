'use client';

/**
 * Mail Center -> Outbox. The delivery log.
 *
 * This screen answers exactly one question - "what actually happened to this
 * email?" - and it is careful about the difference between what happened and
 * what someone hoped happened. The provider ACCEPTING a message is the
 * strongest evidence this application ever has; there are no delivery
 * callbacks, so the word "delivered" appears nowhere on this screen and there
 * is no code path that could produce it.
 *
 * It is a read-only audit view. No retry button, no resend, no bulk delete:
 * the retry state machine lives in the campaign send loop, and a second way to
 * trigger it - especially one that could re-attempt a permanent 535 - would be
 * a new source of truth for something that already has one.
 *
 * Everything is filtered and paged on the SERVER. Fetching the log and sorting
 * it in React works right up until the log is worth reading.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import EmailPreviewDialog from '@/components/superadmin/mail/EmailPreviewDialog';

import { describeFetchError } from '@/lib/email/session-error';
interface Row {
  id: string;
  createdAt: string;
  sentAt: string | null;
  to: string;
  subject: string;
  type: string;
  source: string;
  sourceLabel: string;
  isTest: boolean;
  campaignId: string | null;
  systemEmailType: string | null;
  status: string;
  statusLabel: string;
  attempts: number | null;
  failureKind: string | null;
  providerCode: number | null;
  retryable: boolean | null;
  messageId: string | null;
  providerEvent: string | null;
  providerEventAt: string | null;
  providerEventCode: number | null;
  opens: number;
  clicks: number;
}

interface Detail extends Row {
  sentBy: string | null;
  failedAt: string | null;
  lastOpenedAt: string | null;
  lastClickedAt: string | null;
  failure: {
    kind: string; code: number | null; retryable: boolean;
    advice: string; raw: string; derived: boolean;
  } | null;
  retry: { text: string; scheduled: boolean } | null;
  campaign: { id: string; title: string; status: string } | null;
  deliveryStatus: string | null;
  systemEmail: { type: string; name: string } | null;
  metadata: Record<string, string>;
  content: { available: boolean; source: string | null; campaignId: string | null };
}

const CARD = 'rounded-xl border border-zinc-800 bg-zinc-900/60 p-4';
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500';
const HINT = 'mt-1 text-[11px] leading-relaxed text-zinc-500';
const INPUT =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 '
  + 'placeholder:text-zinc-600 outline-none focus-visible:ring-2 focus-visible:ring-amber-500';
const BTN =
  'rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] font-medium text-zinc-200 transition '
  + 'hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 '
  + 'disabled:opacity-60';

const STATUS_STYLE: Record<string, string> = {
  accepted: 'bg-emerald-500/15 text-emerald-300',
  failed: 'bg-rose-500/15 text-rose-300',
  pending_retry: 'bg-amber-500/15 text-amber-300',
  processing: 'bg-sky-500/15 text-sky-300',
  blocked: 'bg-zinc-700 text-zinc-300',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'accepted', label: 'Accepted by provider' },
  { value: 'failed', label: 'Failed' },
  { value: 'processing', label: 'Processing' },
];
const SOURCE_OPTIONS = [
  { value: 'all', label: 'All sources' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'system_email', label: 'System email' },
  { value: 'test', label: 'Test' },
  { value: 'transactional', label: 'Transactional' },
];
const FAILURE_OPTIONS = [
  { value: 'all', label: 'Any failure' },
  { value: 'auth', label: 'Auth' },
  { value: 'connection', label: 'Connection' },
  { value: 'tls', label: 'TLS' },
  { value: 'rate_limit', label: 'Rate limit' },
  { value: 'recipient', label: 'Recipient' },
  { value: 'provider_rejected', label: 'Provider rejected' },
  { value: 'unknown', label: 'Unknown' },
];
/* Reported by the provider AFTER acceptance. Deliberately its own filter
   rather than a status: a bounced message was accepted, then bounced. */
const PROVIDER_EVENT_OPTIONS = [
  { value: 'all', label: 'Any provider event' },
  { value: 'hard_bounce', label: 'Hard bounce' },
  { value: 'soft_bounce', label: 'Soft bounce' },
  { value: 'complaint', label: 'Complaint' },
];
const TEST_OPTIONS = [
  { value: 'all', label: 'Tests and production' },
  { value: 'only', label: 'Tests only' },
  { value: 'exclude', label: 'Production only' },
];
const RANGE_OPTIONS = [
  { value: 'all', label: 'Any time' },
  { value: '1', label: 'Today' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
];

const fmt = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

export default function MailOutbox({ onOpenCampaign }: {
  onOpenCampaign?: (campaignId: string) => void;
} = {}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [backend, setBackend] = useState<string>('');
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState('all');
  const [failureKind, setFailureKind] = useState('all');
  const [providerEvent, setProviderEvent] = useState('all');
  const [test, setTest] = useState('all');
  const [range, setRange] = useState('all');

  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string; campaignId: string } | null>(null);

  /* Monotonic request id rather than a busy flag.

     A plain `if (busy) return` DROPPED any search or page click that landed
     while a request was in flight - the button appeared to do nothing and the
     table kept showing the previous filter's rows. Discarding a user's action
     to avoid a duplicate request is the wrong trade.

     Every request is issued; only the LAST one is allowed to write state, so
     an earlier response arriving late cannot overwrite a newer result. Request
     order is not a safe proxy for recency. */
  const requestSeq = useRef(0);
  /* The URL of the request currently in flight.

     An IDENTICAL request already awaiting a response is collapsed - React's
     development double-mount would otherwise fire the first page twice, and a
     repeated click with unchanged filters can only produce the same rows. This
     is not the old busy flag: a request with DIFFERENT parameters always goes
     out, which is what the flag got wrong. */
  const inFlightUrl = useRef<string | null>(null);

  const buildQuery = useCallback((nextPage: number) => {
    const p = new URLSearchParams({ page: String(nextPage), limit: '25' });
    if (search.trim()) p.set('search', search.trim());
    if (status !== 'all') p.set('status', status);
    if (source !== 'all') p.set('source', source);
    if (failureKind !== 'all') p.set('failureKind', failureKind);
    if (providerEvent !== 'all') p.set('providerEvent', providerEvent);
    if (test !== 'all') p.set('test', test);
    if (range !== 'all') {
      const days = Number(range);
      p.set('from', new Date(Date.now() - days * 86400000).toISOString());
    }
    return p;
  }, [search, status, source, failureKind, providerEvent, test, range]);

  const load = useCallback(async (nextPage = 1) => {
    const url = `/api/super-admin/mail/outbox?${buildQuery(nextPage)}`;
    if (inFlightUrl.current === url) return;
    inFlightUrl.current = url;
    requestSeq.current += 1;
    const seq = requestSeq.current;
    setLoading(true); setError('');
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      /* A response from a superseded request is discarded rather than
         rendered - otherwise a slow early page could land after a fast later
         one and show the wrong filter's rows. */
      if (seq !== requestSeq.current) return;
      if (!r.ok) { setError(describeFetchError(r.status, data?.error, 'Unable to load the outbox.')); return; }
      setRows(data.events ?? []);
      setPage(data.page); setTotalPages(data.totalPages); setTotal(data.total);
      setBackend(data.backend); setTruncated(Boolean(data.truncated));
    } catch {
      if (seq === requestSeq.current) setError('Could not reach the server.');
    } finally {
      if (inFlightUrl.current === url) inFlightUrl.current = null;
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [buildQuery]);

  /* Re-runs when a filter changes; the search box waits for Enter or the
     button, so typing does not fire a request per keystroke. */
  useEffect(() => { void load(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [status, source, failureKind, providerEvent, test, range]);

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true); setError(''); setShowRaw(false);
    try {
      const r = await fetch(`/api/super-admin/mail/outbox?id=${encodeURIComponent(id)}`,
        { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(describeFetchError(r.status, data?.error, 'Record not found.')); return; }
      setDetail(data.event);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const openContent = useCallback(async (campaignId: string) => {
    try {
      const r = await fetch(`/api/super-admin/mail/campaigns?id=${encodeURIComponent(campaignId)}`,
        { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.campaign?.html) {
        setError('The campaign content is no longer available.');
        return;
      }
      setPreview({
        subject: data.campaign.subject,
        html: data.campaign.html,
        campaignId,
      });
    } catch { setError('Could not reach the server.'); }
  }, []);

  const exportUrl = `/api/super-admin/mail/outbox?${buildQuery(1)}&format=csv`;

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <p className={LABEL}>Delivery log</p>
        <p className={HINT}>
          Every send attempt this application made, and what the provider said about it.
          &ldquo;Accepted by provider&rdquo; means the provider took the message — it is not
          confirmation that it reached an inbox, and this panel has no way to observe that.
        </p>
      </div>

      {/* ── Filters ── */}
      <div className={CARD}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-3">
            <label className={LABEL} htmlFor="ob-search">Search</label>
            <div className="flex gap-2">
              <input id="ob-search" className={INPUT} value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void load(1); } }}
                placeholder="Recipient, subject, message id or campaign id" />
              <button type="button" onClick={() => void load(1)} disabled={loading} className={BTN}>
                {loading ? 'Loading…' : 'Search'}
              </button>
            </div>
          </div>

          <div>
            <label className={LABEL} htmlFor="ob-status">Status</label>
            <select id="ob-status" className={INPUT} value={status}
              onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="ob-source">Source</label>
            <select id="ob-source" className={INPUT} value={source}
              onChange={(e) => setSource(e.target.value)}>
              {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="ob-failure">Failure kind</label>
            <select id="ob-failure" className={INPUT} value={failureKind}
              onChange={(e) => setFailureKind(e.target.value)}>
              {FAILURE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="ob-provider-event">Provider event</label>
            <select id="ob-provider-event" className={INPUT} value={providerEvent}
              onChange={(e) => setProviderEvent(e.target.value)}>
              {PROVIDER_EVENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>))}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="ob-test">Test emails</label>
            <select id="ob-test" className={INPUT} value={test}
              onChange={(e) => setTest(e.target.value)}>
              {TEST_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="ob-range">Date</label>
            <select id="ob-range" className={INPUT} value={range}
              onChange={(e) => setRange(e.target.value)}>
              {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <a href={exportUrl} className={`${BTN} inline-block`} download>
              Export CSV
            </a>
          </div>
        </div>
        <p className={HINT}>
          Export includes only operational fields for the filter above — never credentials, tokens
          or verification codes.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </p>
      )}

      {truncated && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
          This store keeps only the most recent records, so older attempts may no longer be listed.
          A missing row does not mean the email was never attempted.
        </p>
      )}

      {loading && rows.length === 0 && (
        <p className="text-[12px] text-zinc-500" aria-live="polite">Loading the delivery log…</p>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className={`${CARD} text-center`}>
          <p className="text-[13px] text-zinc-300">No send attempts match these filters.</p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[720px] text-left text-[12px]">
              <thead className="bg-zinc-900">
                <tr className={LABEL}>
                  <th scope="col" className="p-2.5 font-semibold">Recipient</th>
                  <th scope="col" className="p-2.5 font-semibold">Subject</th>
                  <th scope="col" className="p-2.5 font-semibold">Source</th>
                  <th scope="col" className="p-2.5 font-semibold">Status</th>
                  <th scope="col" className="p-2.5 font-semibold">Attempts</th>
                  <th scope="col" className="p-2.5 font-semibold">Provider</th>
                  <th scope="col" className="p-2.5 font-semibold">Time</th>
                  <th scope="col" className="p-2.5 font-semibold">Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id} className="border-t border-zinc-900 hover:bg-zinc-800/30">
                    <td className="max-w-[180px] truncate p-2.5 text-zinc-200">{e.to}</td>
                    <td className="max-w-[200px] truncate p-2.5 text-zinc-300">
                      {e.subject || '(no subject)'}
                    </td>
                    <td className="p-2.5 text-zinc-400">
                      <span className="flex flex-wrap items-center gap-1">
                        {e.sourceLabel}
                        {e.isTest && (
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                            TEST
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        STATUS_STYLE[e.status] ?? 'bg-zinc-700 text-zinc-300'}`}>
                        {e.statusLabel}
                      </span>
                    </td>
                    <td className="p-2.5 tabular-nums text-zinc-400">{e.attempts ?? '—'}</td>
                    <td className="p-2.5 text-zinc-400">
                      {e.providerCode ? `${e.providerCode}` : '—'}
                      {e.failureKind ? ` · ${e.failureKind}` : ''}
                      {e.providerEvent && (
                        <span className="ml-1 rounded bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-bold text-orange-300">
                          {e.providerEvent === 'complaint' ? 'COMPLAINT'
                            : e.providerEvent === 'hard_bounce' ? 'HARD BOUNCE' : 'SOFT BOUNCE'}
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-zinc-500">{fmt(e.createdAt)}</td>
                    <td className="p-2.5">
                      <button type="button" onClick={() => void openDetail(e.id)}
                        disabled={detailLoading}
                        aria-label={`Open delivery record for ${e.to}`} className={BTN}>
                        {detailLoading ? '…' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-zinc-500">
              {total.toLocaleString()} attempt(s) · page {page} of {totalPages}
              {backend ? ` · ${backend} store` : ''}
            </span>
            <span className="flex gap-1">
              <button type="button" className={BTN} disabled={page <= 1 || loading}
                onClick={() => void load(page - 1)}>Previous</button>
              <button type="button" className={BTN} disabled={page >= totalPages || loading}
                onClick={() => void load(page + 1)}>Next</button>
            </span>
          </div>
        </>
      )}

      {/* ── Detail ── */}
      {detail && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/75 p-3 sm:p-4"
          onClick={() => setDetail(null)}>
          <div role="dialog" aria-modal="true" aria-label="Delivery record"
            className="my-auto w-full max-w-2xl space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
            onClick={(ev) => ev.stopPropagation()}>

            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-zinc-100">
                  {detail.subject || '(no subject)'}
                </p>
                <p className="truncate text-[12px] text-zinc-400">{detail.to}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  STATUS_STYLE[detail.status] ?? 'bg-zinc-700 text-zinc-300'}`}>
                  {detail.statusLabel}
                </span>
                <button type="button" onClick={() => setDetail(null)} className={BTN}>Close</button>
              </div>
            </div>

            {detail.isTest && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
                <strong>TEST</strong> — sent to a single test address from the Mail Center. Not part
                of production delivery statistics.
              </p>
            )}

            {/* Facts */}
            <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3 sm:grid-cols-2">
              {([
                ['Message id', detail.messageId ?? 'Not issued'],
                ['Source', detail.sourceLabel],
                ['Created', fmt(detail.createdAt)],
                ['Accepted at', fmt(detail.sentAt)],
                ['Last attempt', fmt(detail.failedAt ?? detail.sentAt)],
                ['Attempts', detail.attempts === null ? 'Not recorded' : String(detail.attempts)],
                ['Sent by', detail.sentBy ?? '—'],
                ['Type', detail.type],
              ] as const).map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <p className={LABEL}>{k}</p>
                  <p className="break-words text-[12px] text-zinc-300">{v}</p>
                </div>
              ))}
            </div>

            {/* Failure */}
            {detail.failure && (
              <div className="space-y-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                <p className={LABEL}>Provider failure</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <p className={LABEL}>Kind</p>
                    <p className="text-[12px] text-zinc-200">{detail.failure.kind}</p>
                  </div>
                  <div>
                    <p className={LABEL}>Provider code</p>
                    <p className="text-[12px] text-zinc-200">{detail.failure.code ?? '—'}</p>
                  </div>
                  <div>
                    <p className={LABEL}>Retryable</p>
                    <p className="text-[12px] text-zinc-200">
                      {detail.failure.retryable ? 'Yes' : 'No'}
                    </p>
                  </div>
                </div>
                {detail.failure.advice && (
                  <p className="text-[12px] text-zinc-300">{detail.failure.advice}</p>
                )}
                {detail.retry && (
                  <p className="text-[12px] text-amber-200">{detail.retry.text}</p>
                )}
                {detail.failure.derived && (
                  <p className="text-[11px] text-zinc-500">
                    This classification was derived from the recorded error text — it was not
                    stored when the failure happened.
                  </p>
                )}
                <button type="button" onClick={() => setShowRaw((v) => !v)}
                  aria-expanded={showRaw} className={BTN}>
                  {showRaw ? 'Hide provider response' : 'Show provider response'}
                </button>
                {showRaw && (
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-950 p-2 text-[11px] text-zinc-400">
                    {detail.failure.raw}
                  </pre>
                )}
              </div>
            )}

            {/* Provider event — after acceptance, never a "delivered" claim. */}
            {detail.providerEvent && (
              <div className="space-y-1 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
                <p className={LABEL}>Provider event</p>
                <p className="text-[12px] font-semibold text-orange-200">
                  {detail.providerEvent === 'complaint' ? 'Reported as spam by the recipient'
                    : detail.providerEvent === 'hard_bounce' ? 'Permanent bounce'
                      : 'Temporary bounce'}
                </p>
                <p className="text-[12px] text-zinc-300">
                  Reported {fmt(detail.providerEventAt)}
                  {detail.providerEventCode ? ` · code ${detail.providerEventCode}` : ''}
                </p>
                <p className={HINT}>
                  The provider accepted this message and reported the problem afterwards, so the
                  send itself is still recorded as accepted.
                  {detail.providerEvent !== 'soft_bounce'
                    && ' This address has been added to the suppression list.'}
                </p>
              </div>
            )}

            {/* Relationships */}
            {(detail.campaign || detail.systemEmail) && (
              <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className={LABEL}>Related</p>
                {detail.campaign && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[12px] text-zinc-300">
                      Campaign: {detail.campaign.title}
                      <span className="text-zinc-500"> · {detail.campaign.status}</span>
                      {detail.deliveryStatus && (
                        <span className="text-zinc-500"> · this recipient: {detail.deliveryStatus}</span>
                      )}
                    </p>
                    {onOpenCampaign && (
                      <button type="button" className={BTN}
                        onClick={() => { setDetail(null); onOpenCampaign(detail.campaign!.id); }}>
                        View campaign
                      </button>
                    )}
                  </div>
                )}
                {detail.systemEmail && (
                  <p className="text-[12px] text-zinc-300">
                    System email: {detail.systemEmail.name}
                    <span className="font-mono text-zinc-500"> ({detail.systemEmail.type})</span>
                  </p>
                )}
              </div>
            )}

            {/* Tracking */}
            <div className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <p className={LABEL}>Tracking</p>
              <p className="text-[12px] text-zinc-300">
                Opens recorded: {detail.opens} · Clicks recorded: {detail.clicks}
              </p>
              {(detail.lastOpenedAt || detail.lastClickedAt) && (
                <p className="text-[11px] text-zinc-500">
                  {detail.lastOpenedAt && `Last open ${fmt(detail.lastOpenedAt)}. `}
                  {detail.lastClickedAt && `Last click ${fmt(detail.lastClickedAt)}.`}
                </p>
              )}
              <p className={HINT}>
                Tracking under-counts: many clients block remote images and tracking redirects. A
                recorded open means the tracking pixel was requested — not that a person read the
                email.
              </p>
            </div>

            {/* Content */}
            <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <p className={LABEL}>Message content</p>
              {detail.content.available && detail.content.campaignId ? (
                <>
                  <button type="button" className={BTN}
                    onClick={() => void openContent(detail.content.campaignId!)}>
                    Preview content
                  </button>
                  <p className={HINT}>
                    Rendered from the campaign&apos;s own stored content through the same pipeline
                    that sends it.
                  </p>
                </>
              ) : (
                <p className={HINT}>
                  The delivery log records what was attempted, not the message body — so there is no
                  stored content for this attempt. Campaign sends can be previewed from their
                  campaign.
                </p>
              )}
            </div>

            {/* Metadata */}
            {Object.keys(detail.metadata).length > 0 && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className={LABEL}>Metadata</p>
                <dl className="mt-1 grid gap-1 sm:grid-cols-2">
                  {Object.entries(detail.metadata).map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="font-mono text-[11px] text-zinc-500">{k}</dt>
                      <dd className="break-words font-mono text-[11px] text-zinc-300">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content preview reuses the Phase 10 dialog: sandboxed iframe, server
          rendering, no script execution. */}
      <EmailPreviewDialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        source="campaign"
        subject={preview?.subject ?? ''}
        html={preview?.html ?? ''}
        campaignId={preview?.campaignId}
      />
    </div>
  );
}
