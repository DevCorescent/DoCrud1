'use client';

/**
 * §22 Lead Management / §23 Lead Status — provider-facing Service Leads.
 *
 * Self-contained: mount it anywhere (its own route today, a profile sub-tab
 * later) and it fetches everything itself from /api/services/leads. Both lead
 * types share one list because there is one lead architecture — the type is a
 * badge, never a separate screen (§24).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft, Ban, Briefcase, Calendar, Check, Flag, Inbox, Loader2, Lock, Mail,
  MessageSquare, Paperclip, Phone, Search, ShieldCheck, User as UserIcon, X,
} from 'lucide-react';

/* ─── types (mirror the API contract) ──────────────────────────────────── */

type LeadType = 'enquiry' | 'booking';
type LeadStatus =
  | 'new' | 'contacted' | 'discussion' | 'quote_sent' | 'booking_requested'
  | 'accepted' | 'in_progress' | 'completed' | 'declined' | 'cancelled';

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New', contacted: 'Contacted', discussion: 'Discussion', quote_sent: 'Quote Sent',
  booking_requested: 'Booking Requested', accepted: 'Accepted', in_progress: 'In Progress',
  completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled',
};
const STATUS_ORDER: LeadStatus[] = [
  'new', 'contacted', 'discussion', 'quote_sent', 'booking_requested',
  'accepted', 'in_progress', 'completed', 'declined', 'cancelled',
];
const STATUS_TONE: Record<LeadStatus, string> = {
  new: 'border-violet-500/25 bg-violet-500/10 text-violet-300',
  contacted: 'border-sky-500/25 bg-sky-500/10 text-sky-300',
  discussion: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300',
  quote_sent: 'border-amber-500/25 bg-amber-500/10 text-amber-300',
  booking_requested: 'border-indigo-500/25 bg-indigo-500/10 text-indigo-300',
  accepted: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300',
  in_progress: 'border-blue-500/25 bg-blue-500/10 text-blue-300',
  completed: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200',
  declined: 'border-rose-500/25 bg-rose-500/10 text-rose-300',
  cancelled: 'border-white/[0.12] bg-white/[0.05] text-white/45',
};
const CONTACT_LABELS: Record<string, string> = { docrud_chat: 'Docrud chat', email: 'Email', phone: 'Phone' };

interface LeadRow {
  id: string; type: LeadType; status: LeadStatus;
  customerId: string; customerName: string; customerAvatarUrl?: string; customerHeadline?: string;
  serviceId: string; serviceTitle: string; requirement: string;
  budget?: { min?: number; max?: number; currency: string };
  timeline?: { startDate?: string; completionDate?: string };
  attachmentCount: number; contactMethod: string;
  packageName?: string; price?: number; conversationId?: string;
  noteCount: number; createdAt: string; updatedAt: string;
}

interface LeadDetail extends Omit<LeadRow, 'attachmentCount' | 'noteCount'> {
  attachments: Array<{ url: string; name: string }>;
  notes: Array<{ id: string; body: string; createdAt: string }>;
  companyInfo?: string; contactEmail?: string; contactPhone?: string;
  enquiryId?: string; bookingId?: string;
}

/* ─── helpers ──────────────────────────────────────────────────────────── */

function money(currency: string, n?: number) {
  if (n == null) return null;
  const sym = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `;
  return `${sym}${n.toLocaleString()}`;
}
function budgetLabel(b?: LeadRow['budget']) {
  if (!b || (b.min == null && b.max == null)) return null;
  if (b.min != null && b.max != null) return `${money(b.currency, b.min)} – ${money(b.currency, b.max)}`;
  if (b.min != null) return `${money(b.currency, b.min)}+`;
  return `Up to ${money(b.currency, b.max)}`;
}
function timelineLabel(t?: LeadRow['timeline']) {
  if (!t || (!t.startDate && !t.completionDate)) return null;
  return [t.startDate ? `from ${t.startDate}` : '', t.completionDate ? `by ${t.completionDate}` : '']
    .filter(Boolean).join(' · ');
}
function received(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function TypeBadge({ type }: { type: LeadType }) {
  const isBooking = type === 'booking';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] ${
      isBooking ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300' : 'border-violet-500/25 bg-violet-500/10 text-violet-300'
    }`}>
      {isBooking ? <Briefcase className="h-2.5 w-2.5" /> : <MessageSquare className="h-2.5 w-2.5" />}
      {isBooking ? 'Booking Request' : 'Enquiry'}
    </span>
  );
}

function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] ${STATUS_TONE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function Avatar({ name, url }: { name: string; url?: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
  return (
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.05] flex items-center justify-center">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-[11px] font-bold text-white/45">{initials || <UserIcon className="h-4 w-4" />}</span>
      )}
    </div>
  );
}

/* ─── component ────────────────────────────────────────────────────────── */

export default function ServiceLeadsCenter() {
  const { status: authStatus } = useSession();

  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | LeadType>('all');

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<{ avatarUrl?: string; headline?: string; location?: string; href: string } | null>(null);
  const [detailConversation, setDetailConversation] = useState<{ href: string } | null>(null);
  const [allowed, setAllowed] = useState<LeadStatus[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [saving, setSaving] = useState<LeadStatus | null>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  /* §25 safety */
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<'spam' | 'abusive' | 'scam' | 'irrelevant' | 'other'>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contact, setContact] = useState<{ shareEmail: boolean; sharePhone: boolean; phone?: string } | null>(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [contactSaving, setContactSaving] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const res = await fetch(`/api/services/leads?${params.toString()}`);
      if (res.status === 401) { setUnauthorized(true); return; }
      const data = await res.json().catch(() => null) as { leads?: LeadRow[]; counts?: Record<string, number>; error?: string } | null;
      if (!res.ok) { setError(data?.error || 'Could not load your leads.'); return; }
      setUnauthorized(false);
      setLeads(data?.leads ?? []);
      setCounts(data?.counts ?? {});
    } catch {
      setError('Network error while loading leads.');
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, typeFilter]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (authStatus === 'unauthenticated') { setUnauthorized(true); setLoading(false); return; }
    const t = setTimeout(() => void loadLeads(), q ? 300 : 0);   // debounce typing
    return () => clearTimeout(t);
  }, [authStatus, loadLeads, q]);

  useEffect(() => {
    if (!openId) return;
    setDetailLoading(true);
    setDetailError('');
    fetch(`/api/services/leads/${openId}`)
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok) { setDetailError(d?.error || 'Could not load this lead.'); return; }
        setDetail(d.lead);
        setDetailCustomer(d.customer);
        setDetailConversation(d.conversation);
        setAllowed(d.allowedTransitions ?? []);
      })
      .catch(() => setDetailError('Network error while loading the lead.'))
      .finally(() => setDetailLoading(false));
  }, [openId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  async function changeStatus(next: LeadStatus) {
    if (!detail || saving) return;
    setSaving(next);
    try {
      const res = await fetch(`/api/services/leads/${detail.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json().catch(() => null) as { lead?: LeadDetail; allowedTransitions?: LeadStatus[]; error?: string } | null;
      if (!res.ok || !data?.lead) {
        setToast({ tone: 'err', text: data?.error || 'Could not update the status.' });
        return;
      }
      const updated = data.lead;
      setDetail(updated);
      setAllowed(data.allowedTransitions ?? []);
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? { ...l, status: updated.status, updatedAt: updated.updatedAt } : l)));
      setToast({ tone: 'ok', text: `Status updated to ${STATUS_LABELS[updated.status]}.` });
      void loadLeads();
    } catch {
      setToast({ tone: 'err', text: 'Network error. Status not changed.' });
    } finally {
      setSaving(null);
    }
  }

  const loadContactSettings = useCallback(async () => {
    const res = await fetch('/api/services/safety/contact-visibility');
    if (!res.ok) return;
    const d = await res.json().catch(() => null) as { settings?: { shareEmail: boolean; sharePhone: boolean; phone?: string }; accountEmail?: string } | null;
    if (d?.settings) setContact(d.settings);
    if (d?.accountEmail) setAccountEmail(d.accountEmail);
  }, []);

  useEffect(() => {
    if (authStatus === 'authenticated') void loadContactSettings();
  }, [authStatus, loadContactSettings]);

  async function saveContactSettings(patch: { shareEmail?: boolean; sharePhone?: boolean; phone?: string }) {
    setContactSaving(true);
    try {
      const res = await fetch('/api/services/safety/contact-visibility', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
      });
      const d = await res.json().catch(() => null) as { settings?: { shareEmail: boolean; sharePhone: boolean; phone?: string }; error?: string } | null;
      if (!res.ok || !d?.settings) { setToast({ tone: 'err', text: d?.error || 'Could not save contact settings.' }); return; }
      setContact(d.settings);
      setToast({ tone: 'ok', text: 'Contact sharing updated.' });
    } catch {
      setToast({ tone: 'err', text: 'Network error while saving contact settings.' });
    } finally {
      setContactSaving(false);
    }
  }

  async function submitReport() {
    if (!detail || safetyBusy) return;
    setSafetyBusy(true);
    try {
      const res = await fetch('/api/services/safety/report', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType: 'lead', targetId: detail.id, reason: reportReason, details: reportDetails.trim() || undefined }),
      });
      const d = await res.json().catch(() => null) as { message?: string; error?: string } | null;
      if (!res.ok) { setToast({ tone: 'err', text: d?.error || 'Could not submit the report.' }); return; }
      setReportOpen(false);
      setReportDetails('');
      setToast({ tone: 'ok', text: d?.message || 'Report submitted.' });
    } catch {
      setToast({ tone: 'err', text: 'Network error while reporting.' });
    } finally {
      setSafetyBusy(false);
    }
  }

  async function blockCustomer() {
    if (!detail || safetyBusy) return;
    if (!window.confirm(`Block ${detail.customerName}? They will no longer be able to send you enquiries or booking requests.`)) return;
    setSafetyBusy(true);
    try {
      const res = await fetch('/api/services/safety/block', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: detail.customerId }),
      });
      const d = await res.json().catch(() => null) as { error?: string } | null;
      if (!res.ok) { setToast({ tone: 'err', text: d?.error || 'Could not block this user.' }); return; }
      setToast({ tone: 'ok', text: `${detail.customerName} is blocked.` });
    } catch {
      setToast({ tone: 'err', text: 'Network error while blocking.' });
    } finally {
      setSafetyBusy(false);
    }
  }

  const filterChips = useMemo(() => ([
    { id: 'all' as const, label: 'All', count: counts.all ?? 0 },
    ...STATUS_ORDER.map((s) => ({ id: s, label: STATUS_LABELS[s], count: counts[s] ?? 0 })),
  ]), [counts]);

  /* ── unauthorized ── */
  if (unauthorized) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.04]">
          <Inbox className="h-5 w-5 text-white/30" />
        </div>
        <p className="text-[15px] font-bold text-white">Sign in to see your service leads</p>
        <p className="mt-2 text-[12.5px] text-white/40">Leads are private to the provider who received them.</p>
        <Link
          href="/login"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-[13px] px-6 text-[13px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {/* header */}
      <div className="mb-5">
        <h1 className="text-[20px] font-black tracking-tight text-white sm:text-[24px]">Service Leads</h1>
        <p className="mt-1 text-[12.5px] text-white/40">
          Every enquiry and booking request for your services, in one pipeline.
        </p>
        <Link
          href="/services/dashboard"
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-[10px] border border-white/[0.09] bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-white/55 transition hover:text-white"
        >
          View service dashboard
        </Link>
      </div>

      {/* §25 — what a customer may see once a request is accepted */}
      <div className="mb-4 rounded-[16px] border border-white/[0.07] bg-white/[0.02]">
        <button
          type="button" onClick={() => setContactOpen((v) => !v)} aria-expanded={contactOpen}
          className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
        >
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400/70" />
          <span className="flex-1 text-[12.5px] font-semibold text-white/70">Contact sharing</span>
          <span className="text-[11px] text-white/35">
            {contact
              ? contact.shareEmail || contact.sharePhone
                ? `${[contact.shareEmail ? 'Email' : '', contact.sharePhone ? 'Phone' : ''].filter(Boolean).join(' + ')} after acceptance`
                : 'Nothing shared'
              : '—'}
          </span>
        </button>
        {contactOpen && (
          <div className="space-y-3 border-t border-white/[0.06] px-4 py-3.5">
            <p className="text-[11.5px] leading-relaxed text-white/40">
              Conversations always start inside Docrud. Anything switched on here reaches a customer only
              after you move their lead to Accepted.
            </p>
            <label className="flex items-center gap-2.5">
              <input
                type="checkbox" checked={Boolean(contact?.shareEmail)} disabled={contactSaving}
                onChange={(e) => void saveContactSettings({ shareEmail: e.target.checked })}
                className="h-4 w-4 accent-violet-500"
              />
              <span className="text-[12px] text-white/65">Share my email{accountEmail ? ` (${accountEmail})` : ''}</span>
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox" checked={Boolean(contact?.sharePhone)} disabled={contactSaving || !contact?.phone}
                  onChange={(e) => void saveContactSettings({ sharePhone: e.target.checked })}
                  className="h-4 w-4 accent-violet-500"
                />
                <span className="text-[12px] text-white/65">Share my phone</span>
              </label>
              <input
                aria-label="Contact phone number" defaultValue={contact?.phone ?? ''} placeholder="+91 98765 43210"
                onBlur={(e) => { if (e.target.value.trim() !== (contact?.phone ?? '')) void saveContactSettings({ phone: e.target.value.trim() }); }}
                className="w-44 rounded-[10px] border border-white/[0.09] bg-white/[0.04] px-3 py-1.5 text-[12px] text-white placeholder-white/20 outline-none focus:border-violet-500/50"
              />
            </div>
            <p className="flex items-center gap-1.5 text-[10.5px] text-white/25">
              <Lock className="h-3 w-3" /> Nothing is shared before acceptance, and never on your public profile.
            </p>
          </div>
        )}
      </div>

      {/* search + type toggle */}
      <div className="mb-3 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leads"
            placeholder="Search customer, service or requirement…"
            className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] py-2.5 pl-9 pr-3 text-[13px] text-white placeholder-white/20 outline-none transition-all focus:border-violet-500/50"
          />
        </div>
        <div className="flex shrink-0 gap-1.5">
          {(['all', 'enquiry', 'booking'] as const).map((t) => (
            <button
              key={t} type="button" aria-pressed={typeFilter === t} onClick={() => setTypeFilter(t)}
              className={`rounded-[11px] border px-3 py-2 text-[11.5px] font-semibold transition ${
                typeFilter === t ? 'border-violet-500/40 bg-violet-500/10 text-white/85' : 'border-white/[0.07] bg-white/[0.03] text-white/40 hover:text-white/70'
              }`}
            >
              {t === 'all' ? 'All types' : t === 'enquiry' ? 'Enquiries' : 'Bookings'}
              {t !== 'all' && counts[t] ? <span className="ml-1 text-[9.5px] text-white/30">{counts[t]}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {/* status chips */}
      <div className="mb-4 -mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-2">
          {filterChips.map((chip) => (
            <button
              key={chip.id} type="button" aria-pressed={statusFilter === chip.id}
              onClick={() => setStatusFilter(chip.id as 'all' | LeadStatus)}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-2xl border px-3 py-1.5 text-[11px] font-semibold transition ${
                statusFilter === chip.id
                  ? 'border-white/[0.20] bg-white/[0.10] text-white/90'
                  : 'border-white/[0.07] bg-white/[0.03] text-white/38 hover:border-white/[0.12] hover:text-white/65'
              }`}
            >
              {chip.label}
              {chip.count > 0 && <span className="text-[9px] font-bold tabular-nums text-white/25">{chip.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* list */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-[104px] animate-pulse rounded-[18px] bg-white/[0.04]" />)}
        </div>
      ) : error ? (
        <div className="rounded-[20px] border border-rose-500/20 bg-rose-500/[0.06] p-8 text-center">
          <p className="text-[13px] text-rose-300">{error}</p>
          <button
            type="button" onClick={() => void loadLeads()}
            className="mt-4 rounded-[11px] border border-white/[0.10] bg-white/[0.05] px-4 py-2 text-[12px] font-semibold text-white/70 hover:text-white"
          >
            Try again
          </button>
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-14 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.04]">
            <Inbox className="h-5 w-5 text-white/30" />
          </div>
          <p className="text-[13.5px] text-white/45">
            {q || statusFilter !== 'all' || typeFilter !== 'all'
              ? 'No leads match these filters.'
              : 'You have not received any service enquiries yet.'}
          </p>
          {(q || statusFilter !== 'all' || typeFilter !== 'all') && (
            <button
              type="button" onClick={() => { setQ(''); setStatusFilter('all'); setTypeFilter('all'); }}
              className="mt-4 rounded-[11px] border border-white/[0.10] bg-white/[0.05] px-4 py-2 text-[12px] font-semibold text-white/70 hover:text-white"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {leads.map((lead) => {
            const budget = budgetLabel(lead.budget);
            const timeline = timelineLabel(lead.timeline);
            return (
              <li key={lead.id}>
                <button
                  type="button" onClick={() => setOpenId(lead.id)}
                  className="w-full rounded-[18px] border border-white/[0.06] bg-white/[0.02] p-4 text-left transition-all hover:border-white/[0.12] hover:bg-white/[0.04]"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={lead.customerName} url={lead.customerAvatarUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13.5px] font-bold text-white/90">{lead.customerName}</span>
                        <TypeBadge type={lead.type} />
                        <StatusBadge status={lead.status} />
                      </div>
                      <p className="mt-1 truncate text-[12px] font-semibold text-white/55">{lead.serviceTitle}</p>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-white/35">{lead.requirement}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-white/30">
                        <span>{received(lead.createdAt)}</span>
                        {budget && <span>· {budget}</span>}
                        {timeline && <span className="inline-flex items-center gap-1">· <Calendar className="h-2.5 w-2.5" />{timeline}</span>}
                        {lead.attachmentCount > 0 && <span className="inline-flex items-center gap-1">· <Paperclip className="h-2.5 w-2.5" />{lead.attachmentCount}</span>}
                        <span>· via {CONTACT_LABELS[lead.contactMethod] ?? lead.contactMethod}</span>
                        {lead.packageName && <span>· {lead.packageName}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* detail drawer */}
      {openId && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={() => { setOpenId(null); setDetail(null); }} />
          <div
            role="dialog" aria-modal="true" aria-label="Lead details"
            className="relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[24px] border border-white/[0.09] bg-[#0E0E10] shadow-[0_40px_100px_rgba(0,0,0,0.95)] sm:max-h-[88vh] sm:max-w-lg sm:rounded-[24px]"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
              <button
                type="button" onClick={() => { setOpenId(null); setDetail(null); }}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-white/45 transition hover:text-white/80 sm:hidden"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              <p className="hidden text-[13px] font-bold text-white sm:block">Lead details</p>
              <button
                type="button" aria-label="Close" onClick={() => { setOpenId(null); setDetail(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.06] transition hover:bg-white/[0.12]"
              >
                <X className="h-4 w-4 text-white/60" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {detailLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-white/30" /></div>
              ) : detailError ? (
                <p role="alert" className="rounded-[10px] border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">{detailError}</p>
              ) : detail ? (
                <div className="space-y-4">
                  {/* customer + type/status */}
                  <div className="flex items-start gap-3">
                    <Avatar name={detail.customerName} url={detailCustomer?.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <Link href={detailCustomer?.href ?? `/u/${detail.customerId}`} className="truncate text-[14px] font-bold text-white hover:text-white/80">
                        {detail.customerName}
                      </Link>
                      {detailCustomer?.headline && <p className="truncate text-[11.5px] text-white/35">{detailCustomer.headline}</p>}
                      {detailCustomer?.location && <p className="truncate text-[11px] text-white/25">{detailCustomer.location}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <TypeBadge type={detail.type} />
                      <StatusBadge status={detail.status} />
                    </div>
                  </div>

                  {/* facts */}
                  <div className="rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    {([
                      ['Service', detail.serviceTitle],
                      ['Type', detail.type === 'booking' ? 'Booking Request' : 'Enquiry'],
                      ['Package', detail.packageName ?? ''],
                      ['Price', detail.price != null ? money(detail.budget?.currency ?? 'INR', detail.price) ?? '' : ''],
                      ['Budget', budgetLabel(detail.budget) ?? ''],
                      ['Timeline', timelineLabel(detail.timeline) ?? ''],
                      ['Company', detail.companyInfo ?? ''],
                      ['Contact method', CONTACT_LABELS[detail.contactMethod] ?? detail.contactMethod],
                      ['Date received', new Date(detail.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })],
                    ] as Array<[string, string]>)
                      .filter(([, v]) => Boolean(v))
                      .map(([label, value]) => (
                        <div key={label} className="flex items-start justify-between gap-3 border-b border-white/[0.04] py-1.5 last:border-0">
                          <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/30">{label}</span>
                          <span className="break-words text-right text-[12px] text-white/70">{value}</span>
                        </div>
                      ))}
                  </div>

                  {/* requirement */}
                  <div className="rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/30">Requirement</span>
                    <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-white/65">{detail.requirement}</p>
                  </div>

                  {/* contact — only what the customer chose to share */}
                  {(detail.contactEmail || detail.contactPhone) && (
                    <div className="flex flex-wrap gap-2">
                      {detail.contactEmail && (
                        <a href={`mailto:${detail.contactEmail}`} className="inline-flex items-center gap-1.5 rounded-[10px] border border-blue-500/25 bg-blue-500/10 px-3 py-1.5 text-[11.5px] font-semibold text-blue-300 transition hover:bg-blue-500/20">
                          <Mail className="h-3 w-3" /> {detail.contactEmail}
                        </a>
                      )}
                      {detail.contactPhone && (
                        <a href={`tel:${detail.contactPhone}`} className="inline-flex items-center gap-1.5 rounded-[10px] border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[11.5px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20">
                          <Phone className="h-3 w-3" /> {detail.contactPhone}
                        </a>
                      )}
                    </div>
                  )}

                  {/* attachments */}
                  <div>
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/30">Attachments</span>
                    {detail.attachments?.length ? (
                      <ul className="mt-2 space-y-1.5">
                        {detail.attachments.map((f) => (
                          <li key={f.url}>
                            <a
                              href={f.url} target="_blank" rel="noreferrer"
                              className="flex items-center gap-2 rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[11.5px] text-white/60 transition hover:text-white"
                            >
                              <Paperclip className="h-3 w-3 shrink-0" /> <span className="truncate">{f.name}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-[11.5px] text-white/25">No attachments.</p>
                    )}
                  </div>

                  {/* conversation */}
                  {detailConversation ? (
                    <Link
                      href={detailConversation.href}
                      className="flex h-11 items-center justify-center gap-2 rounded-[13px] text-[13px] font-bold text-white transition active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                    >
                      <MessageSquare className="h-4 w-4" /> Open Conversation
                    </Link>
                  ) : (
                    <p className="text-[11.5px] text-white/25">No conversation was started for this lead.</p>
                  )}

                  {/* §23 status control */}
                  <div>
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/30">Update status</span>
                    {allowed.length === 0 ? (
                      <p className="mt-1.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[11.5px] text-white/40">
                        This lead is {STATUS_LABELS[detail.status].toLowerCase()} — its status is final.
                      </p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {STATUS_ORDER.filter((s) => allowed.includes(s)).map((s) => (
                          <button
                            key={s} type="button" disabled={saving !== null}
                            onClick={() => void changeStatus(s)}
                            className={`inline-flex items-center gap-1.5 rounded-[11px] border px-3 py-1.5 text-[11.5px] font-semibold transition disabled:opacity-50 ${STATUS_TONE[s]}`}
                          >
                            {saving === s ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 opacity-0" />}
                            {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* §25 — report or block the customer on this lead */}
                  <div className="border-t border-white/[0.06] pt-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button" onClick={() => setReportOpen((v) => !v)} disabled={safetyBusy}
                        className="inline-flex items-center gap-1.5 rounded-[11px] border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[11.5px] font-semibold text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        <Flag className="h-3 w-3" /> Report
                      </button>
                      <button
                        type="button" onClick={() => void blockCustomer()} disabled={safetyBusy}
                        className="inline-flex items-center gap-1.5 rounded-[11px] border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-[11.5px] font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
                      >
                        <Ban className="h-3 w-3" /> Block customer
                      </button>
                    </div>

                    {reportOpen && (
                      <div className="mt-2.5 space-y-2.5 rounded-[12px] border border-white/[0.08] bg-white/[0.03] p-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(['spam', 'abusive', 'scam', 'irrelevant', 'other'] as const).map((r) => (
                            <button
                              key={r} type="button" aria-pressed={reportReason === r} onClick={() => setReportReason(r)}
                              className={`rounded-[9px] border px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
                                reportReason === r
                                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-200'
                                  : 'border-white/[0.08] bg-white/[0.03] text-white/45 hover:text-white/70'
                              }`}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                        <textarea
                          rows={2} value={reportDetails} maxLength={1200} aria-label="Report details"
                          onChange={(e) => setReportDetails(e.target.value)}
                          placeholder="Anything else our team should know (optional)"
                          className="w-full resize-none rounded-[10px] border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-[12px] text-white placeholder-white/20 outline-none focus:border-violet-500/50"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button" onClick={() => setReportOpen(false)}
                            className="flex-1 rounded-[10px] border border-white/[0.09] px-3 py-1.5 text-[11.5px] font-semibold text-white/55 hover:text-white/80"
                          >
                            Cancel
                          </button>
                          <button
                            type="button" onClick={() => void submitReport()} disabled={safetyBusy}
                            className="flex-1 rounded-[10px] border border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-[11.5px] font-bold text-amber-200 disabled:opacity-50"
                          >
                            {safetyBusy ? 'Sending…' : 'Submit report'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {detail.notes?.length > 0 && (
                    <div>
                      <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/30">Notes</span>
                      <ul className="mt-2 space-y-1.5">
                        {detail.notes.map((n) => (
                          <li key={n.id} className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                            <p className="text-[12px] text-white/60">{n.body}</p>
                            <p className="mt-0.5 text-[10px] text-white/25">{received(n.createdAt)}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-[12px] border px-4 py-2.5 text-[12.5px] font-semibold shadow-lg ${
            toast.tone === 'ok' ? 'border-emerald-500/25 bg-emerald-500/15 text-emerald-200' : 'border-rose-500/25 bg-rose-500/15 text-rose-200'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
