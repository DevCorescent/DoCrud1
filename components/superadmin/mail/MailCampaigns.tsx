'use client';

/**
 * Mail Center → Campaigns.
 *
 * The operational view: what was sent, to whom, what the provider said, and
 * what happens next. Every figure comes from the campaign and outbox records.
 *
 * The vocabulary is load-bearing and is the thing most likely to erode in a
 * later edit: the provider ACCEPTING a message is not an inbox RECEIVING it.
 * Without delivery callbacks this application cannot know about delivery, so
 * it says "accepted by provider" and never "delivered".
 *
 * Two more distinctions kept deliberately visible:
 *  - a campaign where some recipients succeeded is `partially_failed`, not
 *    "failed" and not "sent";
 *  - a permanent failure shows no retry affordance at all, because offering
 *    "Retry" for a suspended mailbox invites an admin to waste attempts on
 *    something retrying cannot fix.
 */
import { useCallback, useEffect, useState } from 'react';
import EmailPreviewDialog from '@/components/superadmin/mail/EmailPreviewDialog';
import TestSendDialog from '@/components/superadmin/mail/TestSendDialog';

import { describeFetchError } from '@/lib/email/session-error';
interface CampaignRow {
  id: string; title: string; subject: string; status: string;
  audienceDescription: string | null; audiencePreviewCount: number | null;
  sendAt: string | null; scheduleTimezone: string | null;
  createdAt: string; createdBy: string | null; updatedAt: string;
  total: number | null; sent: number | null; failed: number | null;
  pendingRetry: number;
}
interface Delivery {
  to: string; attempts: number; status: string;
  failureKind: string | null; providerCode: number | null; error: string | null;
  retryable: boolean | null; advice: string | null;
  lastAttemptAt: string | null; nextRetryAt: string | null;
  providerEvent: string | null;
}
interface ProviderEventCounts {
  hardBounce: number; softBounce: number; complaint: number; suppressed: number;
}
interface Detail {
  campaign: CampaignRow & {
    html: string | null; text: string | null; lastError: string | null;
    passes: number; startedAt: string | null; finishedAt: string | null;
  };
  deliveries: Delivery[];
  providerEvents?: ProviderEventCounts;
  outbox: { to: string; status: string; createdAt: string; sentAt: string | null; error: string | null }[];
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

const STATUS: Record<string, { word: string; tone: string }> = {
  draft: { word: 'Draft', tone: 'text-zinc-400' },
  scheduled: { word: 'Scheduled', tone: 'text-sky-400' },
  sending: { word: 'Processing', tone: 'text-amber-400' },
  sent: { word: 'Sent', tone: 'text-emerald-400' },
  partially_failed: { word: 'Partially failed', tone: 'text-amber-400' },
  failed: { word: 'Failed', tone: 'text-rose-400' },
  cancelled: { word: 'Cancelled', tone: 'text-zinc-500' },
};

const num = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString();
const fmt = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

function Badge({ status }: { status: string }) {
  const s = STATUS[status] ?? { word: status, tone: 'text-zinc-300' };
  return (
    <span className={`whitespace-nowrap text-[12px] font-semibold ${s.tone}`}>
      <span aria-hidden>● </span>{s.word}
    </span>
  );
}

export default function MailCampaigns() {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [detail, setDetail] = useState<Detail | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<CampaignRow | null>(null);

  const load = useCallback(async (nextPage = page) => {
    setLoading(true); setError('');
    try {
      const r = await fetch(
        `/api/super-admin/mail/campaigns?page=${nextPage}`
        + `&q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}`,
        { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      /* An API failure must not render as "no campaigns" — that reads as
         "nothing was ever sent", which is a very different fact. */
      if (!r.ok) { setError(describeFetchError(r.status, data?.error, 'Unable to load campaigns.')); return; }
      setRows(data.campaigns); setPage(data.page);
      setTotalPages(data.totalPages); setTotal(data.total);
    } catch { setError('Could not reach the server.'); }
    finally { setLoading(false); }
  }, [page, query, status]);

  useEffect(() => { void load(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [status]);

  const openDetail = useCallback(async (id: string) => {
    setDetailLoading(true); setError('');
    try {
      const r = await fetch(`/api/super-admin/mail/campaigns?id=${encodeURIComponent(id)}`,
        { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(describeFetchError(r.status, data?.error, 'Campaign not found.')); return; }
      setDetail(data);
    } catch { setError('Could not reach the server.'); }
    finally { setDetailLoading(false); }
  }, []);

  const act = useCallback(async (id: string, action: 'cancel' | 'duplicate') => {
    if (acting) return; // no double submissions
    setActing(true); setError(''); setNotice('');
    try {
      const r = await fetch('/api/super-admin/mail/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok) { setError(data?.error || 'Unable to update the campaign.'); return; }
      setNotice(action === 'cancel'
        ? 'Campaign cancelled. It will not be sent.'
        : 'Campaign duplicated as a draft. It will not send until you schedule it.');
      setConfirmCancel(null);
      setDetail(null);
      await load(page);
    } catch { setError('Could not reach the server.'); }
    finally { setActing(false); }
  }, [acting, load, page]);

  /* ── Detail ── */
  if (detail) {
    const c = detail.campaign;
    const accepted = c.sent ?? 0;
    const failed = c.failed ?? 0;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setDetail(null)} className={BTN}>← All campaigns</button>
          <Badge status={c.status} />
        </div>

        <section className={CARD}>
          <h3 className="text-[15px] font-bold text-zinc-100">{c.title}</h3>
          <p className="mt-0.5 text-[12px] text-zinc-400">{c.subject}</p>
          <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {[
              ['Audience', c.audienceDescription ?? '—'],
              ['Created by', c.createdBy ?? '—'],
              ['Created', fmt(c.createdAt)],
              ['Scheduled', c.sendAt ? `${fmt(c.sendAt)}${c.scheduleTimezone ? ` (${c.scheduleTimezone})` : ''}` : '—'],
              ['Started', fmt(c.startedAt)],
              ['Completed', fmt(c.finishedAt)],
              ['Delivery passes', String(c.passes)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-[12px] text-zinc-500">{k}</dt>
                <dd className="min-w-0 break-words text-right text-[12px] text-zinc-200">{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Total recipients', num(c.total), 'text-zinc-100'],
            ['Accepted by provider', num(c.sent), 'text-emerald-400'],
            ['Failed', num(c.failed), failed ? 'text-rose-400' : 'text-zinc-100'],
            ['Pending retry', num(c.pendingRetry), c.pendingRetry ? 'text-amber-400' : 'text-zinc-100'],
          ].map(([label, value, tone]) => (
            <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
              <p className={`text-xl font-black tabular-nums ${tone}`}>{value}</p>
              <p className={`mt-0.5 ${LABEL}`}>{label}</p>
            </div>
          ))}
        </div>
        <p className={HINT}>
          &ldquo;Accepted by provider&rdquo; means the mail server took the message. It is not
          confirmation that it reached an inbox — this application has no delivery callbacks and
          does not claim delivery.
        </p>

        {c.lastError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
            <p className="text-[12px] font-semibold text-rose-300">Provider error</p>
            <p className="mt-1 break-words text-[12px] text-zinc-300">{c.lastError}</p>
          </div>
        )}

        {/* Provider events — what happened AFTER acceptance. Shown apart from
            failures on purpose: a bounced message was accepted and then
            bounced, which is not the same as one the provider refused. */}
        {detail.providerEvents && (
          detail.providerEvents.hardBounce + detail.providerEvents.softBounce
          + detail.providerEvents.complaint + detail.providerEvents.suppressed > 0
        ) && (
          <section className={CARD}>
            <p className={LABEL}>Provider events and suppression</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-4">
              {([
                ['Hard bounces', detail.providerEvents.hardBounce, 'text-orange-300'],
                ['Soft bounces', detail.providerEvents.softBounce, 'text-amber-300'],
                ['Complaints', detail.providerEvents.complaint, 'text-rose-300'],
                ['Suppressed', detail.providerEvents.suppressed, 'text-sky-300'],
              ] as const).map(([k, v, tone]) => (
                <div key={k}>
                  <p className={LABEL}>{k}</p>
                  <p className={`text-sm font-semibold ${v ? tone : 'text-zinc-400'}`}>{v}</p>
                </div>
              ))}
            </div>
            <p className={HINT}>
              These are separate from failures. A bounce or complaint means the provider accepted
              the message and reported a problem afterwards; a suppressed recipient was never
              sent to at all. Hard bounces and complaints add the address to the suppression list.
            </p>
          </section>
        )}

        <section className={CARD}>
          <p className={LABEL}>Recipient results</p>
          {detail.deliveries.length === 0 ? (
            <p className="mt-2 text-[12px] text-zinc-500">
              {accepted > 0
                ? 'Every recipient was accepted; only unsuccessful recipients are recorded here.'
                : 'No delivery events recorded.'}
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[11px]">
                <thead>
                  <tr className={LABEL}>
                    <th scope="col" className="py-1 pr-3 font-semibold">Recipient</th>
                    <th scope="col" className="py-1 pr-3 font-semibold">Status</th>
                    <th scope="col" className="py-1 pr-3 font-semibold">Attempts</th>
                    <th scope="col" className="py-1 pr-3 font-semibold">Failure</th>
                    <th scope="col" className="py-1 font-semibold">Next retry</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.deliveries.map((d) => (
                    <tr key={d.to} className="border-t border-zinc-900 align-top">
                      <td className="max-w-[180px] break-all py-1.5 pr-3 text-zinc-300">{d.to}</td>
                      <td className={`py-1.5 pr-3 font-semibold ${
                        d.status === 'pending' ? 'text-amber-400' : 'text-rose-400'}`}>
                        {d.status === 'pending' ? 'Retry scheduled' : 'Failed'}
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums text-zinc-400">{d.attempts}</td>
                      <td className="max-w-[220px] py-1.5 pr-3 text-zinc-400">
                        {d.failureKind && (
                          <span className="capitalize">{d.failureKind.replace('_', ' ')}</span>
                        )}
                        {d.providerCode ? ` · ${d.providerCode}` : ''}
                        {d.error && <span className="block break-words text-zinc-600">{d.error}</span>}
                        {/* No retry affordance for something retrying cannot fix. */}
                        {d.retryable === false && (
                          <span className="block text-zinc-500">Permanent — will not be retried.</span>
                        )}
                      </td>
                      <td className="py-1.5 text-zinc-400">{fmt(d.nextRetryAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={CARD}>
          <p className={LABEL}>Outbox events for this campaign</p>
          {detail.outbox.length === 0 ? (
            <p className="mt-2 text-[12px] text-zinc-500">No outbox events recorded.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {detail.outbox.slice(0, 25).map((e, i) => (
                <li key={`${e.to}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-900 py-1 last:border-0">
                  <span className="min-w-0 break-all text-[11px] text-zinc-300">{e.to}</span>
                  <span className={`text-[11px] font-semibold ${
                    e.status === 'sent' ? 'text-emerald-400' : e.status === 'failed' ? 'text-rose-400' : 'text-zinc-400'}`}>
                    {e.status}
                  </span>
                  <span className="text-[11px] text-zinc-600">{fmt(e.sentAt ?? e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {c.html && (
          <section className={CARD}>
            <p className={LABEL}>Email content</p>
            <p className={HINT}>
              This is the campaign&apos;s OWN stored content. Editing the template it came from
              cannot change it — a sent or scheduled campaign is immutable.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowPreview(true)} className={BTN}>
                Preview
              </button>
              <button type="button" onClick={() => setShowTest(true)} className={BTN}>
                Send test…
              </button>
            </div>
          </section>
        )}

        {/* The campaign's stored content, rendered by the same server pipeline
            that would send it - including the audience size, resolved on the
            server, and the warning that a send cannot be recalled. */}
        <EmailPreviewDialog
          open={showPreview && Boolean(c.html)}
          onClose={() => setShowPreview(false)}
          source="campaign"
          subject={c.subject}
          html={c.html ?? ''}
          campaignId={c.id}
        />

        <TestSendDialog
          open={showTest && Boolean(c.html)}
          onClose={() => setShowTest(false)}
          source="campaign"
          subject={c.subject}
          html={c.html ?? ''}
          contextLabel={c.title}
        />

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void act(c.id, 'duplicate')} disabled={acting}
            className={BTN}>Duplicate</button>
          {(c.status === 'scheduled' || c.status === 'draft') && (
            <button type="button" onClick={() => setConfirmCancel(c)} disabled={acting}
              className={BTN}>Cancel campaign</button>
          )}
        </div>
      </div>
    );
  }

  /* ── List ── */
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className={LABEL} htmlFor="mc-search">Search</label>
          <input id="mc-search" className={INPUT} value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void load(1); } }}
            placeholder="Subject, name or campaign id" />
        </div>
        <div>
          <label className={LABEL} htmlFor="mc-status">Status</label>
          <select id="mc-status" className={INPUT} value={status}
            onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v.word}</option>
            ))}
          </select>
        </div>
        <button type="button" onClick={() => void load(1)} disabled={loading} className={BTN}>
          {loading ? 'Loading…' : 'Search'}
        </button>
      </div>

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

      {loading && <p className="text-[12px] text-zinc-500" aria-live="polite">Loading campaigns…</p>}

      {!loading && rows.length === 0 && !error && (
        <div className={`${CARD} text-center`}>
          <p className="text-[13px] text-zinc-300">
            {query || status ? 'No campaigns match your filters.' : 'No campaigns yet.'}
          </p>
          <p className={HINT}>Create one from the Compose tab.</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[640px] text-left text-[12px]">
              <thead className="bg-zinc-900">
                <tr className={LABEL}>
                  <th scope="col" className="p-2.5 font-semibold">Campaign</th>
                  <th scope="col" className="p-2.5 font-semibold">Audience</th>
                  <th scope="col" className="p-2.5 font-semibold">Accepted</th>
                  <th scope="col" className="p-2.5 font-semibold">Failed</th>
                  <th scope="col" className="p-2.5 font-semibold">Scheduled</th>
                  <th scope="col" className="p-2.5 font-semibold">Status</th>
                  <th scope="col" className="p-2.5 font-semibold">Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-zinc-900 hover:bg-zinc-800/30">
                    <td className="max-w-[200px] p-2.5">
                      <span className="block truncate text-zinc-200">{c.title}</span>
                      <span className="block truncate text-[11px] text-zinc-500">{c.subject}</span>
                    </td>
                    <td className="max-w-[160px] truncate p-2.5 text-zinc-400">
                      {c.audienceDescription ?? '—'}
                    </td>
                    <td className="p-2.5 tabular-nums text-zinc-300">
                      {num(c.sent)}{c.total !== null ? ` / ${c.total}` : ''}
                    </td>
                    <td className={`p-2.5 tabular-nums ${c.failed ? 'text-rose-400' : 'text-zinc-300'}`}>
                      {num(c.failed)}
                    </td>
                    <td className="p-2.5 text-zinc-400">
                      {c.sendAt ? fmt(c.sendAt) : '—'}
                    </td>
                    <td className="p-2.5"><Badge status={c.status} /></td>
                    <td className="p-2.5">
                      <button type="button" onClick={() => void openDetail(c.id)}
                        disabled={detailLoading}
                        aria-label={`Open campaign ${c.title}`} className={BTN}>
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
              {total.toLocaleString()} campaign(s) · page {page} of {totalPages}
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

      {/* ── Cancel confirmation ── */}
      {confirmCancel && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setConfirmCancel(null)}>
          <div role="dialog" aria-modal="true" aria-label="Cancel campaign"
            className="w-full max-w-md space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-100">Cancel this campaign?</h3>
            <p className="text-[12px] text-zinc-300">{confirmCancel.title}</p>
            <p className="text-[12px] text-zinc-500">
              Scheduled {fmt(confirmCancel.sendAt)}
              {confirmCancel.scheduleTimezone ? ` (${confirmCancel.scheduleTimezone})` : ''}
            </p>
            <p className="text-[12px] text-amber-200">
              It will not be sent. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmCancel(null)} className={BTN}>
                Keep scheduled
              </button>
              <button type="button" onClick={() => void act(confirmCancel.id, 'cancel')}
                disabled={acting}
                className="rounded-lg bg-rose-500 px-3 py-1.5 text-[12px] font-bold text-zinc-950 transition hover:bg-rose-400 disabled:opacity-60">
                {acting ? 'Cancelling…' : 'Cancel campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
