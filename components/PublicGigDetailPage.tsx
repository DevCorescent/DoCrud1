'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  BriefcaseBusiness,
  Clock3,
  FileText,
  Gavel,
  Home,
  LifeBuoy,
  ListChecks,
  MapPin,
  MessageCircle,
  Loader2,
  Share2,
  Sparkles,
  Star,
  Wrench,
} from 'lucide-react';
import type { GigListing, LandingSettings } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface PublicGigDetailPageProps {
  settings: LandingSettings;
  softwareName: string;
  accentLabel: string;
  gig: GigListing;
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently updated';
  const diffHours = Math.max(0, Math.round((Date.now() - date.getTime()) / 3600000));
  if (diffHours < 1) return 'Updated just now';
  if (diffHours < 24) return `Updated ${diffHours}h ago`;
  return `Updated ${Math.round(diffHours / 24)}d ago`;
}

async function shareOrCopy(url: string) {
  if (typeof window === 'undefined') return;
  const nav: any = navigator;
  try {
    if (nav?.share) {
      await nav.share({ url });
      return;
    }
  } catch {
    // ignore and try clipboard
  }
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(url);
      return;
    }
  } catch {
    // ignore
  }
}

export default function PublicGigDetailPage({
  softwareName,
  accentLabel,
  gig,
}: PublicGigDetailPageProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);

  const [connectOpen, setConnectOpen] = useState(false);
  const [note, setNote] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallBusy, setPaywallBusy] = useState(false);
  const [paywallError, setPaywallError] = useState('');
  const [paywallPurchaseId, setPaywallPurchaseId] = useState('');
  const [paywallMode, setPaywallMode] = useState<'one_time' | 'monthly_pass'>('one_time');
  const [bidOpen, setBidOpen] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [bidTimeline, setBidTimeline] = useState('');
  const [bidNote, setBidNote] = useState('');
  const [bidLoading, setBidLoading] = useState(false);
  const [bidFeedback, setBidFeedback] = useState('');
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState('');

  const [activeTab, setActiveTab] = useState<'overview' | 'deliverables' | 'skills' | 'activity'>('overview');

  const tabItems = useMemo(() => ([
    { id: 'overview' as const, label: 'Overview', icon: FileText, tone: 'from-indigo-500/16 via-sky-500/10 to-emerald-500/14' },
    { id: 'deliverables' as const, label: 'Deliverables', icon: ListChecks, tone: 'from-amber-500/16 via-rose-500/10 to-fuchsia-500/14' },
    { id: 'skills' as const, label: 'Skills', icon: Wrench, tone: 'from-emerald-500/16 via-teal-500/10 to-sky-500/14' },
    { id: 'activity' as const, label: 'Activity', icon: Sparkles, tone: 'from-fuchsia-500/16 via-violet-500/10 to-indigo-500/16' },
  ]), []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('docrud:gigs:saved');
      const next = raw ? (JSON.parse(raw) as unknown) : [];
      const ids = Array.isArray(next) ? (next.filter((id) => typeof id === 'string') as string[]) : [];
      setSaved(ids.includes(gig.id));
    } catch {
      setSaved(false);
    }
  }, [gig.id]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const toggleSaved = () => {
    try {
      const raw = window.localStorage.getItem('docrud:gigs:saved');
      const next = raw ? (JSON.parse(raw) as unknown) : [];
      const ids = Array.isArray(next) ? (next.filter((id) => typeof id === 'string') as string[]) : [];
      const updated = ids.includes(gig.id) ? ids.filter((id) => id !== gig.id) : [gig.id, ...ids];
      window.localStorage.setItem('docrud:gigs:saved', JSON.stringify(updated));
      setSaved(updated.includes(gig.id));
      setToast(updated.includes(gig.id) ? 'Saved.' : 'Removed.');
    } catch {
      setSaved((c) => !c);
    }
  };

  const loadRazorpayScript = async () => {
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
  };

  const startCheckout = async (mode: 'one_time' | 'monthly_pass') => {
    if (!isAuthenticated) {
      setPaywallError('Login required to purchase Gigs Connect.');
      return;
    }
    setPaywallBusy(true);
    setPaywallError('');
    try {
      const orderResponse = await fetch('/api/gigs/connect/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const orderPayload = await orderResponse.json().catch(() => null);
      if (!orderResponse.ok) throw new Error(orderPayload?.error || 'Unable to create checkout.');

      const loaded = await loadRazorpayScript();
      if (!loaded || !(window as any).Razorpay) throw new Error('Razorpay checkout script could not be loaded on this device.');

      setPaywallPurchaseId(String(orderPayload.purchaseId || ''));
      setPaywallMode(mode);

      const instance = new (window as any).Razorpay({
        key: orderPayload.keyId,
        amount: orderPayload.amountInPaise,
        currency: 'INR',
        name: 'docrud',
        description: mode === 'monthly_pass' ? 'Gigs Connect monthly pass' : 'Gigs Connect (one-time)',
        order_id: orderPayload.order?.id,
        handler: async (gatewayPayload: Record<string, string>) => {
          try {
            const verifyResponse = await fetch('/api/gigs/connect/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...gatewayPayload,
                purchaseId: orderPayload.purchaseId,
                mode,
              }),
            });
            const verifyPayload = await verifyResponse.json().catch(() => null);
            if (!verifyResponse.ok) throw new Error(verifyPayload?.error || 'Payment verification failed.');
            setPaywallOpen(false);
            // Retry connect after payment success
            await submitConnect();
          } catch (verificationError) {
            setPaywallError(verificationError instanceof Error ? verificationError.message : 'Payment verification failed.');
          } finally {
            setPaywallBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaywallBusy(false);
          },
        },
        prefill: {
          name: session?.user?.name || '',
          email: session?.user?.email || '',
        },
        notes: {
          product: 'gig_connect',
          mode,
          gigId: gig.id,
        },
        theme: { color: '#0f172a' },
      });
      instance.open();
    } catch (error) {
      setPaywallError(error instanceof Error ? error.message : 'Unable to start checkout.');
      setPaywallBusy(false);
    }
  };

  const submitConnect = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!note.trim()) {
      setFeedback('Add a short intro before sending your request.');
      return;
    }
    try {
      setLoading(true);
      setFeedback('');
      const response = await fetch('/api/gigs/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gigId: gig.id,
          note: note.trim(),
          portfolioUrl: portfolioUrl.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 402 && payload?.paywall) {
          setPaywallError(payload?.error || 'Gigs Connect required.');
          setPaywallOpen(true);
          return;
        }
        throw new Error(payload?.error || 'Unable to connect right now.');
      }
      setToast('Request sent.');
      setConnectOpen(false);
      setNote('');
      setPortfolioUrl('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to connect right now.');
    } finally {
      setLoading(false);
    }
  };

  const submitBid = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    const amount = Math.round(Number(bidAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      setBidFeedback('Enter a valid bid amount.');
      return;
    }
    if (!bidNote.trim()) {
      setBidFeedback('Add a short note for the gig owner.');
      return;
    }
    try {
      setBidLoading(true);
      setBidFeedback('');
      const response = await fetch('/api/gigs/bids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gigId: gig.id,
          amountInRupees: amount,
          timelineLabel: bidTimeline.trim() || undefined,
          note: bidNote.trim(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to submit bid right now.');
      }
      setToast('Bid submitted.');
      setBidOpen(false);
      setBidAmount('');
      setBidTimeline('');
      setBidNote('');
    } catch (error) {
      setBidFeedback(error instanceof Error ? error.message : 'Unable to submit bid right now.');
    } finally {
      setBidLoading(false);
    }
  };

  const openConnect = () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    setFeedback('');
    setConnectOpen(true);
  };

  const openBid = () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    setBidFeedback('');
    setBidOpen(true);
  };

  const showBid = (gig.bidMode || 'fixed') === 'bidding';
  const showTimeline = Boolean(gig.timelineLabel);
  const premiumButtonClass =
    'h-10 rounded-xl bg-[linear-gradient(135deg,rgba(2,6,23,0.98),rgba(15,23,42,0.96),rgba(120,53,15,0.22))] text-white shadow-[0_18px_40px_rgba(2,6,23,0.22)] hover:opacity-95';

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_18%_12%,rgba(99,102,241,0.16),transparent_55%),radial-gradient(circle_at_82%_6%,rgba(34,211,238,0.14),transparent_52%),radial-gradient(circle_at_70%_86%,rgba(16,185,129,0.12),transparent_55%),linear-gradient(180deg,rgba(245,248,255,1),rgba(255,255,255,1))]">
      <div className="pointer-events-none absolute -left-24 top-20 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-indigo-400/20 via-sky-400/10 to-emerald-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -top-16 h-[30rem] w-[30rem] rounded-full bg-gradient-to-br from-fuchsia-400/16 via-amber-400/10 to-cyan-400/14 blur-3xl" />
      <div className="mx-auto flex max-w-[1500px] gap-4 px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
        <aside className="hidden w-64 shrink-0 flex-col rounded-[1.25rem] border border-slate-200/70 bg-white/70 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] backdrop-blur xl:flex">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.12)]">
              <BriefcaseBusiness className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">Gigs</p>
              <p className="truncate text-xs text-slate-500">Directory</p>
            </div>
          </div>

          <nav className="mt-4 space-y-1">
            <Link href="/" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-950/5">
              <Home className="h-4 w-4 text-slate-500" />
              Home
            </Link>
            <Link href="/gigs" className="flex items-center gap-3 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.10)]">
              <BriefcaseBusiness className="h-4 w-4 text-white" />
              Explore
            </Link>
            {isAuthenticated ? (
              <Link href="/workspace?tab=gigs" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-950/5">
                <Sparkles className="h-4 w-4 text-slate-500" />
                Workspace
              </Link>
            ) : null}
          </nav>

          <div className="mt-auto">
            <div className="mt-4 rounded-xl border border-slate-200/70 bg-white/70 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                  {(session?.user?.name || session?.user?.email || softwareName || 'D').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{session?.user?.name || softwareName}</p>
                  <p className="truncate text-xs text-slate-500">{session?.user?.email || accentLabel}</p>
                </div>
              </div>
            </div>
            <Link href="/contact" className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-950/5">
              <LifeBuoy className="h-4 w-4 text-slate-500" />
              Help
            </Link>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="rounded-[1.5rem] border border-slate-200/70 bg-white/70 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] backdrop-blur sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-500">
                  <Link href="/gigs" className="hover:text-slate-950">Gigs</Link>
                  <span className="px-2 text-slate-300">›</span>
                  <span className="text-slate-950">{gig.title}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  className={`${premiumButtonClass} px-4 text-sm font-semibold`}
                  onClick={() => void shareOrCopy(`${window.location.origin}/gigs/${gig.slug}`).then(() => setToast('Link copied.'))}
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </Button>
                <Button type="button" className={`${premiumButtonClass} px-4 text-sm font-semibold`} onClick={toggleSaved}>
                  <Star className={`mr-2 h-4 w-4 ${saved ? 'fill-white text-white' : ''}`} />
                  {saved ? 'Saved' : 'Save'}
                </Button>
                {showBid ? (
                  <Button type="button" className={`${premiumButtonClass} px-4 text-sm font-semibold`} onClick={openBid}>
                    <Gavel className="mr-2 h-4 w-4" />
                    Place bid
                  </Button>
                ) : (
                  <Button type="button" className={`${premiumButtonClass} px-4 text-sm font-semibold`} onClick={openConnect}>
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Send proposal
                  </Button>
                )}
              </div>
            </div>

            {toast ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                {toast}
              </div>
            ) : null}

            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
              <div className="relative border-b border-slate-200 bg-[linear-gradient(135deg,rgba(2,6,23,0.98),rgba(15,23,42,0.95),rgba(120,53,15,0.22))] px-5 py-7 text-white">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_24%,rgba(245,158,11,0.22),transparent_55%),radial-gradient(circle_at_76%_68%,rgba(99,102,241,0.22),transparent_60%)]" />
                <div className="relative">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100/90">
                    {gig.organizationName || gig.ownerName}
                  </p>
                  <p className="mt-3 text-center text-[1.5rem] font-semibold tracking-[-0.05em] sm:text-[1.85rem]">
                    {gig.title}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/90">{gig.category}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/90">{gig.engagementType.replace('_', ' ')}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/90">{gig.budgetLabel}</span>
                  </div>
                </div>
              </div>

              <div className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-sky-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">{gig.category}</span>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">{gig.visibility}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">{gig.engagementType.replace('_', ' ')}</span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                  <Clock3 className="h-3.5 w-3.5" />
                  {formatRelativeTime(gig.updatedAt)}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                  <MapPin className="h-3.5 w-3.5" />
                  {gig.locationPreference} delivery
                </span>
              </div>

              <div className="mt-4">
                <h1 className="sr-only">{gig.title}</h1>
                <p className="mt-3 max-w-3xl text-[15px] leading-8 text-slate-600">{gig.summary}</p>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(239,246,255,1),rgba(255,255,255,1))] p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                  <span className="absolute right-3 top-3 rounded-full bg-sky-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm">
                    Budget
                  </span>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Budget</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{gig.budgetLabel}</p>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(240,253,250,1),rgba(255,255,255,1))] p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                  <span className="absolute right-3 top-3 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm">
                    Timeline
                  </span>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Timeline</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{showTimeline ? gig.timelineLabel : 'Flexible'}</p>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(254,252,232,1),rgba(255,255,255,1))] p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                  <span className="absolute right-3 top-3 rounded-full bg-amber-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm">
                    Replies
                  </span>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Responses</p>
                  <p className="mt-2 text-sm font-semibold text-slate-950">{gig.connectCount}</p>
                </div>
              </div>

              <div className="mt-4 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
                  {tabItems.map((t) => {
                    const active = activeTab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveTab(t.id)}
                        className={`group inline-flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold shadow-sm transition ${
                          active
                            ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.16)]'
                            : 'border border-white/60 bg-white/70 text-slate-700 hover:bg-white/90 hover:shadow-[0_16px_40px_rgba(15,23,42,0.06)]'
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-2xl transition ${
                            active ? 'bg-white/10' : `bg-gradient-to-br ${t.tone} ring-1 ring-white/70`
                          }`}
                        >
                          <t.icon className={`h-4 w-4 ${active ? 'text-white' : 'text-slate-800'}`} />
                        </span>
                        <span className="whitespace-nowrap">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
                <div className="space-y-4">
                  {activeTab === 'overview' ? (
                    <>
                      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(249,250,251,1))] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                        <span className="absolute right-4 top-4 rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200 shadow-sm">
                          Brief
                        </span>
                        <p className="text-sm font-semibold text-slate-950">What you’ll do</p>
                        <p className="mt-2 text-sm leading-7 text-slate-600">{gig.summary}</p>
                      </div>
                      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(240,249,255,1),rgba(255,255,255,1))] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                        <span className="absolute right-4 top-4 rounded-full bg-sky-700 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm">
                          Tags
                        </span>
                        <p className="text-sm font-semibold text-slate-950">Interests</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {gig.interests.map((interest) => (
                            <span key={interest} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                              {interest}
                            </span>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : null}

                  {activeTab === 'deliverables' ? (
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(254,252,232,1),rgba(255,255,255,1))] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                      <span className="absolute right-4 top-4 rounded-full bg-amber-700 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm">
                        Checklist
                      </span>
                      <p className="text-sm font-semibold text-slate-950">Expected deliverables</p>
                      <div className="mt-4 grid gap-3">
                        {gig.deliverables.map((item, index) => (
                          <div key={`${gig.id}-deliverable-${index}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {activeTab === 'skills' ? (
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(240,253,250,1),rgba(255,255,255,1))] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                      <span className="absolute right-4 top-4 rounded-full bg-emerald-700 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm">
                        Stack
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {gig.skills.map((skill) => (
                          <span key={`gig-skill-${skill}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {activeTab === 'activity' ? (
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,241,242,1),rgba(255,255,255,1))] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                      <span className="absolute right-4 top-4 rounded-full bg-rose-700 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm">
                        Live
                      </span>
                      <div className="grid gap-2 text-sm text-slate-700">
                        <p><span className="font-semibold text-slate-950">{gig.connectCount}</span> connection requests</p>
                        <p>{formatRelativeTime(gig.updatedAt)}</p>
                        <p className="capitalize">Visibility <span className="font-semibold text-slate-950">{gig.visibility}</span></p>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4">
                  {showBid ? (
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(2,6,23,0.97),rgba(15,23,42,0.94))] p-5 text-white shadow-[0_20px_55px_rgba(2,6,23,0.18)]">
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.22),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(99,102,241,0.22),transparent_60%)]" />
                      <span className="absolute right-4 top-4 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200 shadow-sm">
                        Premium
                      </span>
                      <div className="relative">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-white">Bidding open</p>
                        <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-200">
                          LIVE
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-slate-100/90">
                        Submit a clean bid with your expected timeline. Login is required to keep spam out.
                      </p>
                      <div className="mt-3 space-y-2 text-sm text-slate-200">
                        {gig.bidRules?.minBidInRupees ? (
                          <p>Min bid: <span className="font-semibold text-white">₹{gig.bidRules.minBidInRupees}</span></p>
                        ) : null}
                        {gig.bidRules?.bidDeadlineAt ? (() => {
                          const date = new Date(gig.bidRules!.bidDeadlineAt!);
                          if (Number.isNaN(date.getTime())) return null;
                          return (
                            <p>
                              Deadline:{' '}
                              <span className="font-semibold text-white">
                                {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date)}
                              </span>
                            </p>
                          );
                        })() : null}
                      </div>
                      <Button type="button" className={`mt-4 w-full ${premiumButtonClass} text-sm font-semibold`} onClick={openBid}>
                        <Gavel className="mr-2 h-4 w-4" />
                        Place bid
                      </Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(2,6,23,0.97),rgba(15,23,42,0.94))] p-5 text-white shadow-[0_20px_55px_rgba(2,6,23,0.18)]">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(245,158,11,0.22),transparent_55%),radial-gradient(circle_at_78%_80%,rgba(34,211,238,0.18),transparent_60%)]" />
                    <span className="absolute right-4 top-4 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200 shadow-sm">
                      Direct
                    </span>
                    <div className="relative">
                   <p className="flex items-center gap-2 text-sm font-semibold bg-gradient-to-r from-white to-yellow-400 bg-clip-text text-transparent">
  <Sparkles className="w-4 h-4 text-yellow-400" />
  Connect directly
</p>
                    <p className="mt-2 text-sm leading-7 text-slate-100/90">
                      Login is required before we open direct outreach. That keeps the flow cleaner for both the gig owner and the person applying.
                    </p>
                    <Button type="button" className={`mt-4 w-full ${premiumButtonClass} text-sm font-semibold`} onClick={openConnect}>
                      Send proposal
                    </Button>
                    <div className="mt-4 space-y-2 text-sm text-slate-200">
                      <p className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" /> {formatRelativeTime(gig.updatedAt)}</p>
                      <p className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" /> {gig.locationPreference} delivery</p>
                    </div>
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(249,250,251,1))] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                    <span className="absolute right-4 top-4 rounded-full bg-violet-700 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white shadow-sm">
                      Owner
                    </span>
                    <p className="text-sm font-semibold text-slate-950">Posted by</p>
                    <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-slate-950">{gig.organizationName || gig.ownerName}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Contact preference: <span className="font-semibold capitalize text-slate-800">{gig.contactPreference}</span>
                    </p>
                    <Button asChild variant="outline" className="mt-4 h-10 w-full rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      <Link href="/workspace?tab=gigs">Open gigs studio</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>

          <div className="mt-4 xl:hidden">
            <Link href="/gigs" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
              <BriefcaseBusiness className="h-4 w-4 text-slate-500" />
              Back to gigs
            </Link>
          </div>
        </main>
      </div>

      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent className="max-w-xl overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/85 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <div className="border-b border-white/60 px-5 pb-4 pt-5">
              <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-slate-950">
                Send proposal for {gig.title}
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-600">
                Keep it short. This goes straight into the owner&apos;s gigs inbox inside docrud.
              </p>
            </div>
          </DialogHeader>
          <div className="space-y-4 px-5 py-5">
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="min-h-[130px] w-full rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none"
              placeholder="Share your approach, milestones, and expected start window."
            />
            <Input
              value={portfolioUrl}
              onChange={(event) => setPortfolioUrl(event.target.value)}
              placeholder="Portfolio or proof-of-work link (optional)"
              className="rounded-[1.1rem] border-slate-200 bg-white"
            />
            {feedback ? <p className="text-sm text-slate-600">{feedback}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setConnectOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className={`${premiumButtonClass} px-4 text-sm font-semibold`} onClick={submitConnect} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Send proposal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={bidOpen} onOpenChange={setBidOpen}>
        <DialogContent className="max-w-xl overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/85 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <div className="border-b border-white/60 px-5 pb-4 pt-5">
              <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-slate-950">
                Place bid for {gig.title}
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-600">
                Add your bid amount and timeline, then include a short note about how you would approach this work.
              </p>
            </div>
          </DialogHeader>
          <div className="space-y-4 px-5 py-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                value={bidAmount}
                onChange={(event) => setBidAmount(event.target.value)}
                placeholder="Bid amount (INR)"
                className="rounded-[1.1rem] border-slate-200 bg-white"
                inputMode="numeric"
              />
              <Input
                value={bidTimeline}
                onChange={(event) => setBidTimeline(event.target.value)}
                placeholder="Timeline label (optional)"
                className="rounded-[1.1rem] border-slate-200 bg-white"
              />
            </div>
            <textarea
              value={bidNote}
              onChange={(event) => setBidNote(event.target.value)}
              className="min-h-[130px] w-full rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none"
              placeholder="How would you approach this work, and what makes you a strong fit?"
            />
            {bidFeedback ? <p className="text-sm text-slate-600">{bidFeedback}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setBidOpen(false)}>
                Cancel
              </Button>
              <Button type="button" className={`${premiumButtonClass} px-4 text-sm font-semibold`} onClick={submitBid} disabled={bidLoading}>
                {bidLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Gavel className="mr-2 h-4 w-4" />}
                Submit bid
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={paywallOpen} onOpenChange={setPaywallOpen}>
        <DialogContent className="max-w-lg overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/85 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-slate-950">
              Gigs Connect required
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 grid gap-3">
            <p className="text-sm leading-6 text-slate-600">
              Sending proposals is paywalled to keep the gigs inbox high-signal. Purchase a one-time proposal or a monthly pass.
            </p>

            {paywallError ? (
              <div className="rounded-[1.1rem] border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
                {paywallError}
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => startCheckout('one_time')}
                className="group rounded-[1.4rem] border border-white/70 bg-white/70 p-4 text-left shadow-[0_18px_50px_rgba(15,23,42,0.06)] transition hover:bg-white hover:shadow-[0_22px_60px_rgba(15,23,42,0.08)]"
                disabled={paywallBusy}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">One-time</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">₹49</p>
                <p className="mt-1 text-sm text-slate-600">1 proposal credit (30 days).</p>
                <p className="mt-3 text-xs font-semibold text-slate-700">Pay once</p>
              </button>
              <button
                type="button"
                onClick={() => startCheckout('monthly_pass')}
                className="group rounded-[1.4rem] border border-white/70 bg-[linear-gradient(135deg,rgba(37,99,235,0.14),rgba(168,85,247,0.12))] p-4 text-left shadow-[0_18px_50px_rgba(37,99,235,0.10)] transition hover:shadow-[0_22px_60px_rgba(37,99,235,0.14)]"
                disabled={paywallBusy}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Monthly pass</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-semibold text-slate-700">
                    <Sparkles className="h-3.5 w-3.5" />
                    Best value
                  </span>
                </div>
                <p className="mt-2 text-lg font-semibold text-slate-950">₹199</p>
                <p className="mt-1 text-sm text-slate-600">30 proposal credits for 30 days.</p>
                <p className="mt-3 text-xs font-semibold text-slate-700">Get pass</p>
              </button>
            </div>
            <Button type="button" className="h-10 rounded-xl bg-slate-950 text-sm font-semibold text-white hover:bg-slate-900" onClick={() => setPaywallOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
