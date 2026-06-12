'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { CheckCircle2, ChevronRight, Clipboard, Mail, Phone, Sparkles, Text, UserRound, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ResumeLeadStatus =
  | 'new'
  | 'contacted'
  | 'shortlisted'
  | 'interviewing'
  | 'offered'
  | 'hired'
  | 'closed'
  | 'rejected';

type ResumeLead = {
  id: string;
  resumeId: string;
  resumeSlug: string;
  candidate: {
    displayName: string;
    headline?: string;
    location?: string;
    category?: string;
    skills: string[];
    tags: string[];
    summary?: string;
  };
  contact: {
    email?: string;
    phone?: string;
    linkedin?: string;
    website?: string;
  };
  jdText?: string;
  match?: {
    score: number;
    compatibilityScore?: number;
    aiScore?: number;
    provider: string;
    rationale?: string;
    matchedSkills: string[];
  };
  status: ResumeLeadStatus;
  notes: Array<{ id: string; body: string; createdAt: string }>;
  connectCount: number;
  updatedAt: string;
  createdAt: string;
};

const STATUS_ORDER: ResumeLeadStatus[] = [
  'new',
  'contacted',
  'shortlisted',
  'interviewing',
  'offered',
  'hired',
  'closed',
  'rejected',
];

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
}

function scoreTone(score: number) {
  if (score >= 85) return 'bg-emerald-600 text-white';
  if (score >= 70) return 'bg-sky-600 text-white';
  if (score >= 55) return 'bg-amber-500 text-white';
  return 'bg-slate-700 text-white';
}

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // Ignore
  }
}

async function loadRazorpayScript() {
  if (typeof window === 'undefined') return false;
  if ((window as any).Razorpay) return true;
  return new Promise<boolean>((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function formatCurrency(amountInPaise: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format((amountInPaise || 0) / 100);
}

export default function TalentLeadsCenter() {
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';

  const [limitsLoading, setLimitsLoading] = useState(true);
  const [limits, setLimits] = useState<{
    talentDirectory: { included: boolean; maxPerCycle: number; used: number; remaining: number; extraCredits: number; topup?: { unitAmountInPaise: number; minQuantity: number; maxQuantity: number } };
    subscription: null | { planName?: string; upgradeRequired?: boolean; currentPeriodEnd?: string };
  } | null>(null);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupQuantity, setTopupQuantity] = useState('');
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupError, setTopupError] = useState('');

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | ResumeLeadStatus>('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [leads, setLeads] = useState<ResumeLead[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [resumeBusy, setResumeBusy] = useState(false);

  const selected = useMemo(
    () => leads.find((lead) => lead.id === selectedId) || null,
    [leads, selectedId],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      setMessage('Login required.');
      setLeads([]);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setMessage('');

    const timeout = window.setTimeout(async () => {
      try {
        const url = new URL('/api/talent/leads', window.location.origin);
        if (q.trim()) url.searchParams.set('q', q.trim());
        if (statusFilter) url.searchParams.set('status', statusFilter);
        url.searchParams.set('limit', '60');
        const response = await fetch(url.toString(), { cache: 'no-store', signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (!active) return;
        if (!response.ok) throw new Error(payload?.error || 'Unable to load leads.');
        const list = Array.isArray(payload?.leads) ? payload.leads : [];
        setLeads(list);
        if (!selectedId && list[0]?.id) setSelectedId(list[0].id);
      } catch (error) {
        if (!active) return;
        setLeads([]);
        setMessage(error instanceof Error ? error.message : 'Unable to load leads.');
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }, 240);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [isAuthenticated, q, refreshTick, selectedId, statusFilter]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (typeof document === 'undefined') return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setRefreshTick((tick) => tick + 1);
    }, 18_000);
    return () => window.clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLimitsLoading(false);
      setLimits(null);
      return;
    }

    let active = true;
    const controller = new AbortController();
    setLimitsLoading(true);

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/connect/limits', { cache: 'no-store', signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (!active) return;
        if (!response.ok) throw new Error(payload?.error || 'Unable to load limits.');
        setLimits(payload);
      } catch {
        if (!active) return;
        setLimits(null);
      } finally {
        if (!active) return;
        setLimitsLoading(false);
      }
    }, 200);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [isAuthenticated, refreshTick]);

  const setLeadStatus = async (leadId: string, next: ResumeLeadStatus) => {
    setMessage('');
    try {
      const response = await fetch(`/api/talent/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to update lead.');
      setLeads((current) => current.map((lead) => (lead.id === leadId ? { ...lead, status: next, updatedAt: new Date().toISOString() } : lead)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update lead.');
    }
  };

  const addLeadNote = async (leadId: string, note: string) => {
    const trimmed = note.trim();
    if (!trimmed) return;
    setMessage('');
    try {
      const response = await fetch(`/api/talent/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: trimmed }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to add note.');
      setLeads((current) => current.map((lead) => (
        lead.id === leadId
          ? {
              ...lead,
              notes: [{ id: String(Date.now()), body: trimmed, createdAt: new Date().toISOString() }, ...lead.notes].slice(0, 40),
              updatedAt: new Date().toISOString(),
            }
          : lead
      )));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add note.');
    }
  };

  const downloadLeadResume = async (leadId: string) => {
    setResumeBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/talent/leads/${leadId}/resume`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Unable to fetch resume.');
      const url = String(payload?.resumeDataUrl || '');
      const fileName = String(payload?.fileName || 'resume');
      if (!url.startsWith('data:')) throw new Error('Resume download is not available.');
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to download resume.');
    } finally {
      setResumeBusy(false);
    }
  };

  const header = (
    <div className="cloud-panel rounded-[1.8rem] border border-white/60 bg-white/75 p-5 shadow-[0_18px_44px_rgba(148,163,184,0.12)] backdrop-blur-2xl sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Talent leads</p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">Lead manager</h2>
        </div>
        <Button asChild type="button" className="rounded-full bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800">
          <Link href="/talent">Open Talent Directory</Link>
        </Button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="relative">
          <Text className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search candidates, skills, tags, or JD text"
            className="h-11 w-full rounded-full border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,248,255,0.72))] pl-11 pr-4 text-sm font-semibold text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_36px_rgba(148,163,184,0.10)] outline-none backdrop-blur-2xl transition placeholder:text-slate-500 focus:border-slate-300"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter((e.target.value || '') as any)}
          className="h-11 w-full rounded-full border border-white/70 bg-white/70 px-4 text-sm font-semibold text-slate-800 outline-none backdrop-blur-2xl sm:w-[220px]"
        >
          <option value="">All stages</option>
          {STATUS_ORDER.map((item) => (
            <option key={`status-${item}`} value={item}>
              {item.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  const detailCard = (lead: ResumeLead) => (
    <div className="grid gap-4">
      <div className="cloud-panel rounded-[1.8rem] border border-white/60 bg-white/75 p-5 shadow-[0_18px_44px_rgba(148,163,184,0.12)] backdrop-blur-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white">
                <Workflow className="h-3.5 w-3.5" />
                {lead.status.replace(/_/g, ' ')}
              </span>
              {typeof lead.match?.score === 'number' ? (
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${scoreTone(lead.match.score)}`}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {typeof lead.match.aiScore === 'number' ? `AI ${lead.match.aiScore}%` : `${lead.match.score}% fit`}
                </span>
              ) : null}
            </div>
            <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{lead.candidate.displayName}</h3>
            {lead.candidate.headline ? (
              <p className="mt-2 text-sm font-semibold text-slate-700">{lead.candidate.headline}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
              {lead.candidate.category ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/70 px-3 py-1">
                  {lead.candidate.category}
                </span>
              ) : null}
              {lead.candidate.location ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/70 px-3 py-1">
                  <UserRound className="h-3.5 w-3.5" />
                  {lead.candidate.location}
                </span>
              ) : null}
              <span className="text-slate-300">·</span>
              <span>Updated {formatDate(lead.updatedAt)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild type="button" variant="outline" className="h-10 rounded-full border-0 bg-white/70 px-4 text-[12px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] hover:bg-white hover:text-slate-950">
              <Link href={`/talent/${lead.resumeSlug}`} target="_blank" rel="noreferrer">
                Open profile
                <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="rounded-full bg-white/70 p-1">
              <TabsTrigger value="overview" className="rounded-full px-4">Overview</TabsTrigger>
              <TabsTrigger value="contact" className="rounded-full px-4">Contact</TabsTrigger>
              <TabsTrigger value="notes" className="rounded-full px-4">Notes</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.6rem] border border-white/60 bg-white/55 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Progress</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {STATUS_ORDER.map((item) => (
                    <button
                      key={`stage-${item}`}
                      type="button"
                      onClick={() => void setLeadStatus(lead.id, item)}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                        lead.status === item
                          ? 'bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)]'
                          : 'bg-white/70 text-slate-700 hover:bg-white hover:text-slate-950'
                      }`}
                    >
                      {lead.status === item ? <CheckCircle2 className="h-4 w-4" /> : null}
                      {item.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-white/60 bg-white/55 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">JD matching</p>
                {lead.match?.rationale ? (
                  <>
                    <p className="mt-3 text-sm leading-6 text-slate-700">{lead.match.rationale}</p>
                    {typeof lead.match.compatibilityScore === 'number' ? (
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        Compatibility: {lead.match.compatibilityScore}%{typeof lead.match.aiScore === 'number' ? ` · AI: ${lead.match.aiScore}%` : ''}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-600">No JD snapshot saved for this lead.</p>
                )}

                {lead.match?.matchedSkills?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lead.match.matchedSkills.slice(0, 10).map((skill) => (
                      <span key={`m-${skill}`} className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-700">
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="contact" className="mt-4">
            <div className="rounded-[1.6rem] border border-white/60 bg-white/55 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Contact & files</p>
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-full border-0 bg-white/70 px-4 text-[12px] font-semibold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)] hover:bg-white hover:text-slate-950"
                  onClick={() => void downloadLeadResume(lead.id)}
                  disabled={resumeBusy}
                >
                  {resumeBusy ? 'Preparing…' : 'Download resume'}
                </Button>
              </div>
              <div className="grid gap-2 text-sm font-semibold text-slate-800">
                {lead.contact.email ? (
                  <div className="flex items-center justify-between gap-2 rounded-[1.1rem] border border-white/70 bg-white/70 px-3 py-2">
                    <span className="inline-flex min-w-0 items-center gap-2 truncate">
                      <Mail className="h-4 w-4 text-slate-600" />
                      <span className="truncate">{lead.contact.email}</span>
                    </span>
                    <button type="button" onClick={() => void copyToClipboard(lead.contact.email!)} className="rounded-full bg-slate-950/10 p-2 text-slate-700 hover:bg-slate-950/15" aria-label="Copy email">
                      <Clipboard className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
                {lead.contact.phone ? (
                  <div className="flex items-center justify-between gap-2 rounded-[1.1rem] border border-white/70 bg-white/70 px-3 py-2">
                    <span className="inline-flex min-w-0 items-center gap-2 truncate">
                      <Phone className="h-4 w-4 text-slate-600" />
                      <span className="truncate">{lead.contact.phone}</span>
                    </span>
                    <button type="button" onClick={() => void copyToClipboard(lead.contact.phone!)} className="rounded-full bg-slate-950/10 p-2 text-slate-700 hover:bg-slate-950/15" aria-label="Copy phone">
                      <Clipboard className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
                {!lead.contact.email && !lead.contact.phone && !lead.contact.linkedin && !lead.contact.website ? (
                  <p className="text-sm text-slate-600">No contact fields were shared on this profile.</p>
                ) : null}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <div className="rounded-[1.6rem] border border-white/60 bg-white/55 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
              <div className="grid gap-3">
                <NoteComposer onSubmit={(note) => addLeadNote(lead.id, note)} />
                <div className="grid gap-2">
                  {lead.notes?.length ? (
                    lead.notes.slice(0, 14).map((note) => (
                      <div key={note.id} className="rounded-[1.3rem] border border-white/70 bg-white/70 p-4 text-sm leading-6 text-slate-700">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{formatDate(note.createdAt)}</p>
                        <p className="mt-2 whitespace-pre-wrap">{note.body}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[1.3rem] border border-white/70 bg-white/70 p-4 text-sm text-slate-600">
                      No notes yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {header}

      {message ? (
        <div className="cloud-panel rounded-[1.5rem] border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          {message}
        </div>
      ) : null}

      <div className="cloud-panel rounded-[1.8rem] border border-white/60 bg-white/75 p-5 shadow-[0_18px_44px_rgba(148,163,184,0.12)] backdrop-blur-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Talent Directory limits</p>
            <p className="mt-2 text-lg font-semibold tracking-[-0.02em] text-slate-950">
              {limitsLoading ? 'Loading…' : limits?.talentDirectory?.included ? `${limits.talentDirectory.remaining} remaining` : 'Not included'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {limits?.talentDirectory?.topup?.unitAmountInPaise ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  setTopupError('');
                  setTopupQuantity(String(limits?.talentDirectory?.topup?.minQuantity || 0));
                  setTopupOpen(true);
                }}
              >
                Buy credits
              </Button>
            ) : null}
            {limits?.subscription?.upgradeRequired ? (
              <Link href="/billing" className="inline-flex">
                <Button className="rounded-full bg-slate-950 text-white hover:bg-slate-800">
                  Renew
                </Button>
              </Link>
            ) : (
              <Link href="/pricing" className="inline-flex">
                <Button variant="outline" className="rounded-full">
                  Upgrade
                </Button>
              </Link>
            )}
          </div>
        </div>

        {!limitsLoading && limits ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.4rem] border border-white/70 bg-white/70 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Cycle quota</p>
              <p className="mt-2 text-base font-semibold text-slate-950">
                {limits.talentDirectory.used}/{limits.talentDirectory.maxPerCycle || 0}
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-white/70 bg-white/70 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Remaining</p>
              <p className="mt-2 text-base font-semibold text-slate-950">
                {limits.talentDirectory.remaining}
              </p>
            </div>
            <div className="rounded-[1.4rem] border border-white/70 bg-white/70 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Add-on credits</p>
              <p className="mt-2 text-base font-semibold text-slate-950">
                {limits.talentDirectory.extraCredits}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={topupOpen} onOpenChange={(next) => {
        if (topupBusy) return;
        setTopupOpen(next);
      }}>
        <DialogContent className="cloud-panel w-[min(94vw,30rem)] overflow-hidden rounded-[1.8rem] border border-white/70 bg-white/90 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <div className="border-b border-white/60 px-5 pb-4 pt-5">
              <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-slate-950">
                Buy Talent credits
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="px-5 py-5 space-y-4">
            <div className="rounded-[1.4rem] border border-white/70 bg-white/70 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Quantity</p>
              <input
                value={topupQuantity}
                onChange={(e) => setTopupQuantity(e.target.value)}
                inputMode="numeric"
                className="mt-3 w-full rounded-[1.1rem] border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-slate-300"
                placeholder="Enter credits"
              />
              {limits?.talentDirectory?.topup ? (
                <p className="mt-2 text-xs text-slate-500">
                  Min {limits.talentDirectory.topup.minQuantity} · Max {limits.talentDirectory.topup.maxQuantity} · {formatCurrency(limits.talentDirectory.topup.unitAmountInPaise)} / credit
                </p>
              ) : null}
            </div>

            {topupError ? (
              <div className="rounded-[1.4rem] border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-900">
                {topupError}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setTopupOpen(false)}
                disabled={topupBusy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                disabled={topupBusy || !limits?.talentDirectory?.topup?.unitAmountInPaise}
                onClick={async () => {
                  const cfg = limits?.talentDirectory?.topup;
                  if (!cfg) return;
                  const quantity = Math.round(Number(topupQuantity || 0));
                  if (!Number.isFinite(quantity) || quantity < cfg.minQuantity) {
                    setTopupError(`Minimum purchase is ${cfg.minQuantity} credits.`);
                    return;
                  }
                  if (quantity > cfg.maxQuantity) {
                    setTopupError(`Maximum purchase is ${cfg.maxQuantity} credits.`);
                    return;
                  }
                  setTopupBusy(true);
                  setTopupError('');
                  try {
                    const orderResponse = await fetch('/api/resumes/connect/create-order', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ mode: 'one_time', quantity }),
                    });
                    const orderPayload = await orderResponse.json().catch(() => null);
                    if (!orderResponse.ok) throw new Error(orderPayload?.error || 'Unable to create checkout.');

                    const loaded = await loadRazorpayScript();
                    if (!loaded || !(window as any).Razorpay) throw new Error('Razorpay checkout script could not be loaded on this device.');

                    const instance = new (window as any).Razorpay({
                      key: orderPayload.keyId,
                      amount: orderPayload.amountInPaise,
                      currency: orderPayload.currency || 'INR',
                      name: 'docrud',
                      description: 'Talent Directory credits',
                      order_id: orderPayload.order?.id,
                      handler: async (gatewayPayload: Record<string, string>) => {
                        try {
                          const verifyResponse = await fetch('/api/resumes/connect/verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              ...gatewayPayload,
                              purchaseId: orderPayload.purchaseId,
                              mode: orderPayload.mode,
                            }),
                          });
                          const verifyPayload = await verifyResponse.json().catch(() => null);
                          if (!verifyResponse.ok) throw new Error(verifyPayload?.error || 'Payment verification failed.');
                          setTopupOpen(false);
                          setRefreshTick((tick) => tick + 1);
                        } catch (verificationError) {
                          setTopupError(verificationError instanceof Error ? verificationError.message : 'Payment verification failed.');
                        } finally {
                          setTopupBusy(false);
                        }
                      },
                      modal: {
                        ondismiss: () => {
                          setTopupBusy(false);
                        },
                      },
                      theme: { color: '#0f172a' },
                    });

                    instance.on('payment.failed', (...args: unknown[]) => {
                      const event = args[0] as { error?: { description?: string; reason?: string } } | undefined;
                      setTopupBusy(false);
                      setTopupError(event?.error?.description || event?.error?.reason || 'Payment failed.');
                    });
                    instance.open();
                  } catch (error) {
                    setTopupBusy(false);
                    setTopupError(error instanceof Error ? error.message : 'Unable to start checkout.');
                  }
                }}
              >
                {topupBusy ? 'Opening…' : 'Checkout'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <div className="cloud-panel rounded-[1.8rem] border border-white/60 bg-white/75 p-4 shadow-[0_18px_44px_rgba(148,163,184,0.12)] backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-2 px-1 pb-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Leads</p>
            <span className="rounded-full bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
              {leads.length} items
            </span>
          </div>
          {loading ? (
            <div className="rounded-[1.4rem] border border-white/70 bg-white/70 p-4 text-sm text-slate-600">
              Loading leads…
            </div>
          ) : leads.length ? (
            <div className="grid gap-2">
              {leads.map((lead) => {
                const active = lead.id === selectedId;
                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(lead.id);
                      if (window.innerWidth < 1024) setDetailOpen(true);
                    }}
                    className={`group w-full rounded-[1.4rem] border px-4 py-3 text-left transition ${
                      active
                        ? 'border-slate-950 bg-slate-950 text-white shadow-[0_18px_44px_rgba(15,23,42,0.14)]'
                        : 'border-white/70 bg-white/70 text-slate-800 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-semibold ${active ? 'text-white' : 'text-slate-950'}`}>
                          {lead.candidate.displayName}
                        </p>
                        <p className={`mt-1 truncate text-xs font-semibold ${active ? 'text-white/75' : 'text-slate-500'}`}>
                          {lead.candidate.category || 'Candidate'} · {lead.status.replace(/_/g, ' ')}
                        </p>
                      </div>
                      {typeof lead.match?.score === 'number' ? (
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${active ? 'bg-white/12 text-white' : scoreTone(lead.match.score)}`}>
                          {typeof lead.match.aiScore === 'number' ? `${lead.match.aiScore}%` : `${lead.match.score}%`}
                        </span>
                      ) : null}
                    </div>
                    {lead.candidate.summary ? (
                      <p className={`mt-2 line-clamp-2 text-xs leading-5 ${active ? 'text-white/70' : 'text-slate-600'}`}>
                        {lead.candidate.summary}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[1.4rem] border border-white/70 bg-white/70 p-4 text-sm text-slate-600">
              No leads yet. Unlock contact from a Talent profile and it will appear here automatically.
            </div>
          )}
        </div>

        <div className="hidden lg:block">
          {selected ? detailCard(selected) : (
            <div className="cloud-panel rounded-[1.8rem] border border-white/60 bg-white/75 p-6 text-sm text-slate-600 shadow-[0_18px_44px_rgba(148,163,184,0.12)] backdrop-blur-2xl">
              Select a lead to see details.
            </div>
          )}
        </div>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="cloud-panel max-h-[92vh] w-[min(96vw,52rem)] overflow-y-auto rounded-[1.8rem] border border-white/70 bg-white/85 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <div className="border-b border-white/60 px-5 pb-4 pt-5">
              <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-slate-950">
                Lead details
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="px-5 py-4">
            {selected ? detailCard(selected) : (
              <div className="rounded-[1.4rem] border border-white/70 bg-white/70 p-4 text-sm text-slate-600">
                Select a lead.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoteComposer(props: { onSubmit: (note: string) => void }) {
  const [value, setValue] = useState('');

  return (
    <div className="rounded-[1.3rem] border border-white/70 bg-white/70 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">New note</p>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Example: Sent intro email, waiting for availability. Next follow-up on Tuesday."
        className="mt-3 min-h-[90px] w-full resize-none rounded-[1.1rem] border border-white/70 bg-white/80 px-4 py-3 text-sm leading-6 text-slate-900 outline-none backdrop-blur-2xl placeholder:text-slate-500 focus:border-slate-300"
      />
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => setValue('')}
        >
          Clear
        </Button>
        <Button
          type="button"
          className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
          onClick={() => {
            props.onSubmit(value);
            setValue('');
          }}
          disabled={!value.trim()}
        >
          Add note
        </Button>
      </div>
    </div>
  );
}
