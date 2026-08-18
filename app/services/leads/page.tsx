'use client';

/**
 * Service Leads — the provider's pipeline.
 *
 * Two views over the same ownership-scoped endpoint: leads received for the
 * signed-in person's own services, and requests they have sent themselves.
 * Status can only be changed on received leads, and only by the provider who
 * owns them — the server enforces that regardless of what this page sends.
 *
 * Note on routing: this is a static segment under /services, so it takes
 * precedence over the /services/[userId] catalogue. A provider whose user id
 * were literally "leads" would be shadowed; ids in this system are uuids or
 * short tokens, so that is theoretical rather than real.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Inbox, Send } from 'lucide-react';
import { LEAD_STATUSES, LEAD_STATUS_LABELS, LEAD_STATUS_BADGE, type LeadStatus } from '@/lib/service-lead-status';
import { currencySymbol, serviceDetailHref } from '@/lib/services-ui';

type Lead = {
  id: string; reference: string; source: 'enquiry' | 'booking';
  serviceId: string; serviceTitle: string;
  requester: { name: string; avatarUrl: string | null };
  requirement: string;
  budget: string | null; timeline: string | null;
  contactMethod: string | null; phone: string | null; company: string | null;
  packageName: string | null; price: number | null; currency: string | null;
  status: LeadStatus; createdAt: string;
};

function Avatar({ src, name }: { src: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[12px] font-bold text-white/55 ring-1 ring-white/[0.07]">
        {(name || '?').trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} alt="" onError={() => setBroken(true)} className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/[0.07]" data-no-invert />
  );
}

function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${LEAD_STATUS_BADGE[status]}`}>
      {LEAD_STATUS_LABELS[status]}
    </span>
  );
}

export default function ServiceLeadsPage() {
  const [box, setBox] = useState<'received' | 'sent'>('received');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'unauth'>('loading');
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setRowError(null);
    try {
      const res = await fetch(`/api/services/leads?box=${box}`);
      if (res.status === 401) { setState('unauth'); return; }
      if (!res.ok) { setState('error'); return; }
      const data = await res.json() as { leads: Lead[] };
      setLeads(data.leads);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [box]);

  useEffect(() => { void load(); }, [load]);

  const changeStatus = async (leadId: string, status: LeadStatus) => {
    setSavingId(leadId);
    setRowError(null);
    try {
      const res = await fetch('/api/services/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, status }),
      });
      if (!res.ok) { setRowError('Could not update that lead.'); return; }
      const data = await res.json() as { lead: Lead };
      // Replace from the server's answer, never from the optimistic guess.
      setLeads(prev => prev.map(l => (l.id === data.lead.id ? data.lead : l)));
    } catch {
      setRowError('Could not update that lead.');
    } finally {
      setSavingId(null);
    }
  };

  /* Counts come from the loaded set, so the filter never hides its own tab. */
  const counts = useMemo(() => {
    const out: Partial<Record<LeadStatus, number>> = {};
    for (const l of leads) out[l.status] = (out[l.status] ?? 0) + 1;
    return out;
  }, [leads]);

  const shown = filter === 'all' ? leads : leads.filter(l => l.status === filter);

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-white">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#0A0A0C]/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <h1 className="text-[15px] font-bold tracking-[-0.01em]">Service Leads</h1>
          {state === 'ready' && (
            <span className="ml-auto shrink-0 text-[12px] text-white/30">{leads.length} total</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-5">
        <div className="flex gap-1.5">
          {([['received', 'Received', Inbox], ['sent', 'Sent', Send]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => { setBox(id); setFilter('all'); }}
              aria-pressed={box === id}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                box === id ? 'border-white/25 bg-white/[0.08] text-white' : 'border-white/[0.08] text-white/55 hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>

        {state === 'ready' && leads.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilter('all')}
              aria-pressed={filter === 'all'}
              className={`rounded-full border px-2.5 py-1 text-[11.5px] transition ${
                filter === 'all' ? 'border-white/25 bg-white/[0.08] text-white' : 'border-white/[0.08] text-white/50 hover:bg-white/[0.04]'
              }`}
            >
              All {leads.length}
            </button>
            {LEAD_STATUSES.filter(s => counts[s]).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                aria-pressed={filter === s}
                className={`rounded-full border px-2.5 py-1 text-[11.5px] transition ${
                  filter === s ? 'border-white/25 bg-white/[0.08] text-white' : 'border-white/[0.08] text-white/50 hover:bg-white/[0.04]'
                }`}
              >
                {LEAD_STATUS_LABELS[s]} {counts[s]}
              </button>
            ))}
          </div>
        )}

        {rowError && (
          <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/[0.07] px-3 py-2.5">
            <p className="text-[12.5px] text-red-200/90">{rowError}</p>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {state === 'loading' && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-[20px] border border-white/[0.07] bg-[#0d0d10]" />
          ))}

          {state === 'unauth' && (
            <div className="rounded-[20px] border border-white/[0.07] bg-[#0d0d10] py-16 text-center">
              <p className="text-[14px] font-semibold">Sign in to see your leads</p>
              <Link href="/onboarding" className="mt-3 inline-block rounded-full bg-white px-4 py-2 text-[12px] font-bold text-[#0D0D0F] hover:bg-white/90">Sign in</Link>
            </div>
          )}

          {state === 'error' && (
            <div className="rounded-[20px] border border-white/[0.07] bg-[#0d0d10] py-16 text-center">
              <p className="text-[14px] font-semibold">Couldn&apos;t load leads.</p>
              <button type="button" onClick={() => void load()} className="mt-3 rounded-full bg-white px-4 py-2 text-[12px] font-bold text-[#0D0D0F] hover:bg-white/90">Try again</button>
            </div>
          )}

          {state === 'ready' && shown.length === 0 && (
            <div className="rounded-[20px] border border-white/[0.07] bg-[#0d0d10] py-16 text-center">
              <p className="text-[14px] font-semibold">
                {leads.length === 0
                  ? (box === 'received' ? 'No leads yet' : 'You haven\'t sent any requests yet')
                  : 'No leads with this status'}
              </p>
              <p className="mx-auto mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-white/40">
                {leads.length === 0
                  ? (box === 'received'
                      ? 'Enquiries and booking requests for your services appear here.'
                      : 'Enquiries and bookings you send appear here.')
                  : 'Try a different status.'}
              </p>
            </div>
          )}

          {state === 'ready' && shown.map(lead => (
            <article key={lead.id} className="rounded-[20px] border border-white/[0.07] bg-[#0d0d10] p-4">
              <div className="flex items-start gap-3">
                <Avatar src={lead.requester.avatarUrl} name={lead.requester.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[13.5px] font-bold text-white">{lead.requester.name}</p>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      lead.source === 'booking'
                        ? 'border-amber-200/[0.18] bg-amber-200/[0.10] text-amber-200/90'
                        : 'border-sky-200/[0.18] bg-sky-200/[0.10] text-sky-200/90'
                    }`}>
                      {lead.source === 'booking' ? 'Booking' : 'Enquiry'}
                    </span>
                    <StatusBadge status={lead.status} />
                  </div>

                  <p className="mt-0.5 truncate text-[12px] text-white/40">
                    <Link href={serviceDetailHref(lead.serviceId)} className="hover:text-white/70">{lead.serviceTitle}</Link>
                    {' · '}{lead.reference}
                    {' · '}{new Date(lead.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>

                  <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-white/60">{lead.requirement}</p>

                  {/* Only facts the record actually holds. */}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/40">
                    {lead.packageName && <span>Package: <span className="text-white/60">{lead.packageName}</span></span>}
                    {lead.price !== null && lead.currency && (
                      <span>Price: <span className="text-white/60">{currencySymbol(lead.currency)}{lead.price.toLocaleString()}</span></span>
                    )}
                    {lead.source === 'enquiry' && lead.budget && <span>Budget: <span className="text-white/60">{lead.budget}</span></span>}
                    {lead.timeline && <span>Timeline: <span className="text-white/60">{lead.timeline}</span></span>}
                    {lead.contactMethod && <span>Contact: <span className="text-white/60">{lead.contactMethod}</span></span>}
                    {lead.phone && <span>Phone: <span className="text-white/60">{lead.phone}</span></span>}
                    {lead.company && <span>Company: <span className="text-white/60">{lead.company}</span></span>}
                  </div>

                  {/* Status is the provider's to set, so it is offered only on
                      received leads. The server refuses it either way. */}
                  {box === 'received' && (
                    <div className="mt-3 flex items-center gap-2">
                      <label htmlFor={`st-${lead.id}`} className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">Status</label>
                      <select
                        id={`st-${lead.id}`}
                        value={lead.status}
                        disabled={savingId === lead.id}
                        onChange={e => void changeStatus(lead.id, e.target.value as LeadStatus)}
                        className="h-8 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-[12px] text-white/75 focus:border-white/25 focus:outline-none disabled:opacity-50"
                      >
                        {LEAD_STATUSES.map(s => (
                          <option key={s} value={s} className="bg-[#0d0d10]">{LEAD_STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      {savingId === lead.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />}
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
