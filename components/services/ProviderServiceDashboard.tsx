'use client';

/**
 * §36 Provider Service Dashboard — a read-only summary over data that already
 * exists. Every figure comes from /api/services/dashboard, which composes the
 * existing service, lead, booking and §35 analytics helpers.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { BarChart3, Briefcase, Inbox, Layers, Loader2 } from 'lucide-react';

interface DashboardData {
  services: { active: number; paused: number; draft: number; draftSupported: boolean; total: number };
  leads: { newEnquiries: number; bookingRequests: number; activeDiscussions: number; total: number };
  bookings: { requested: number; accepted: number; inProgress: number; completed: number; cancelled: number; total: number };
  performance: {
    serviceViews: number; catalogueViews: number; saves: number; enquiries: number;
    bookingRequests: number; conversionRate: number; impressions: number;
    completedServices: number; available: boolean;
  };
}

function Stat({ label, value, hint, tone = 'default' }: { label: string; value: string | number; hint?: string; tone?: 'default' | 'muted' }) {
  return (
    <div className="rounded-[14px] border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
      <p className={`text-[20px] font-black tabular-nums leading-none ${tone === 'muted' ? 'text-white/35' : 'text-white'}`}>{value}</p>
      <p className="mt-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/35">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-white/25">{hint}</p>}
    </div>
  );
}

function Section({
  title, icon, children, action,
}: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-[18px] border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-white/40">{icon}</span>
        <h2 className="flex-1 text-[13px] font-bold text-white/80">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function ProviderServiceDashboard() {
  const { status } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/services/dashboard');
      if (res.status === 401) { setUnauthorized(true); return; }
      const d = await res.json().catch(() => null) as (DashboardData & { error?: string }) | null;
      if (!res.ok || !d) { setError(d?.error || 'Could not load your dashboard.'); return; }
      setData(d);
    } catch {
      setError('Network error while loading the dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') { setUnauthorized(true); setLoading(false); return; }
    void load();
  }, [status, load]);

  if (unauthorized) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[14px] border border-white/[0.08] bg-white/[0.04]">
          <BarChart3 className="h-5 w-5 text-white/30" />
        </div>
        <p className="text-[15px] font-bold text-white">Sign in to see your service dashboard</p>
        <p className="mt-2 text-[12.5px] text-white/40">It shows only the services, leads and bookings on your own account.</p>
        <Link href="/login" className="mt-5 inline-flex h-11 items-center justify-center rounded-[13px] px-6 text-[13px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-5">
        <h1 className="text-[20px] font-black tracking-tight text-white sm:text-[24px]">Service Dashboard</h1>
        <p className="mt-1 text-[12.5px] text-white/40">Your services, leads, bookings and performance at a glance.</p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-[10px] border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">{error}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-white/30" /></div>
      ) : !data ? null : (
        <div className="space-y-3.5">
          <Section title="Services" icon={<Layers className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Stat label="Active" value={data.services.active} />
              <Stat
                label="Draft"
                value={data.services.draftSupported ? data.services.draft : '—'}
                hint={data.services.draftSupported ? undefined : 'Not in the service model yet'}
                tone={data.services.draftSupported ? 'default' : 'muted'}
              />
              <Stat label="Paused" value={data.services.paused} hint="Unpublished" />
            </div>
          </Section>

          <Section
            title="Leads" icon={<Inbox className="h-4 w-4" />}
            action={(
              <Link href="/services/leads" className="rounded-[9px] border border-white/[0.09] px-2.5 py-1 text-[11px] font-semibold text-white/45 transition hover:text-white">
                Open leads
              </Link>
            )}
          >
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Stat label="New enquiries" value={data.leads.newEnquiries} />
              <Stat label="Booking requests" value={data.leads.bookingRequests} />
              <Stat label="Active discussions" value={data.leads.activeDiscussions} />
            </div>
          </Section>

          <Section title="Bookings" icon={<Briefcase className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat label="Requested" value={data.bookings.requested} />
              <Stat label="Accepted" value={data.bookings.accepted} />
              <Stat label="In progress" value={data.bookings.inProgress} />
              <Stat label="Completed" value={data.bookings.completed} />
            </div>
          </Section>

          <Section title="Performance" icon={<BarChart3 className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Stat label="Service views" value={data.performance.serviceViews} />
              <Stat label="Catalogue views" value={data.performance.catalogueViews} />
              <Stat label="Saves" value={data.performance.saves} />
              <Stat label="Enquiries" value={data.performance.enquiries} />
              <Stat label="Booking requests" value={data.performance.bookingRequests} />
              <Stat label="Conversion rate" value={`${data.performance.conversionRate}%`} hint="Bookings ÷ views" />
            </div>
            <p className="mt-2.5 text-[10.5px] text-white/25">
              {data.performance.impressions} impressions → {data.performance.serviceViews} views → {data.performance.enquiries} enquiries
              → {data.performance.bookingRequests} requests → {data.bookings.accepted + data.bookings.completed} accepted
              → {data.performance.completedServices} completed
            </p>
          </Section>
        </div>
      )}
    </div>
  );
}
