'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  MapPin,
  Send,
  Share2,
  Shield,
  Users,
  Zap,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────── */
interface GigListing {
  id: string;
  slug: string;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  organizationName?: string;
  title: string;
  summary: string;
  category: string;
  interests: string[];
  skills: string[];
  deliverables: string[];
  budgetLabel: string;
  timelineLabel?: string;
  engagementType: 'one_time' | 'ongoing' | 'retainer';
  locationPreference: 'remote' | 'hybrid' | 'onsite';
  contactPreference: string;
  visibility: 'public' | 'private';
  status: 'draft' | 'published' | 'paused' | 'closed';
  urgent?: boolean;
  bidMode?: 'fixed' | 'bidding';
  bidRules?: { minBidInRupees?: number; allowCounterOffer?: boolean; bidDeadlineAt?: string };
  connectCount: number;
  acceptedBid?: { bidId: string; bidderName: string; acceptedAt: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface UserBid {
  id: string;
  status: 'submitted' | 'shortlisted' | 'accepted' | 'rejected' | 'withdrawn';
  amountInRupees: number;
  timelineLabel?: string;
  note: string;
}

interface PageData {
  gig: GigListing;
  bidCount: number;
  acceptedBidCount: number;
  userBid: UserBid | null;
  related: GigListing[];
}

/* ─── Helpers ───────────────────────────────────────────────────── */
function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}
function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  if (d < 7 * 86_400_000) return `${Math.floor(d / 86_400_000)}d ago`;
  return fmt(iso);
}
const engLabel = (e: string) => ({ one_time: 'One-time project', ongoing: 'Ongoing', retainer: 'Retainer' }[e] ?? e);
const locLabel = (l: string) => ({ remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' }[l] ?? l);

const bidStatusCfg: Record<string, { label: string; cls: string }> = {
  submitted:   { label: 'Bid submitted — under review',  cls: 'text-white/60 bg-white/[0.05] border-white/[0.07]' },
  shortlisted: { label: "You've been shortlisted",       cls: 'text-white/80 bg-white/[0.08] border-white/[0.10]' },
  accepted:    { label: 'Your bid was accepted',          cls: 'text-white bg-white/[0.10] border-white/[0.14]' },
  rejected:    { label: 'Bid not selected',               cls: 'text-rose-300/70 bg-white/[0.03] border-white/[0.05]' },
  withdrawn:   { label: 'You withdrew this bid',          cls: 'text-white/30 bg-white/[0.02] border-white/[0.04]' },
};

/* ─── Shimmer ────────────────────────────────────────────────────── */
function Shimmer({ className }: { className?: string }) {
  return (
    <div className={['relative overflow-hidden rounded-xl bg-white/[0.04]', className].join(' ')}>
      <div className="absolute inset-y-0 -left-full w-full animate-[shimmerSlide_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
    </div>
  );
}

/* ─── Related gig mini-card ─────────────────────────────────────── */
function RelatedCard({ gig }: { gig: GigListing }) {
  return (
    <Link
      href={`/gigs/${gig.slug}`}
      className="group flex flex-col gap-3 rounded-[18px] border border-white/[0.06] bg-white/[0.03] p-4 transition hover:border-white/[0.11] hover:bg-white/[0.05]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-md border border-white/[0.07] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/40">{gig.category}</span>
        {gig.urgent && <span className="rounded-md bg-white/[0.07] px-2 py-0.5 text-[10px] font-bold text-white/60">Urgent</span>}
      </div>
      <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-white/80 transition group-hover:text-white">{gig.summary}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-semibold text-white/55">₹ {gig.budgetLabel}</span>
        <ArrowRight className="h-3.5 w-3.5 text-white/20 transition group-hover:translate-x-0.5 group-hover:text-white/50" />
      </div>
    </Link>
  );
}

/* ─── Main page ─────────────────────────────────────────────────── */
export default function GigDetailPage() {
  const params = useParams();
  const slug = typeof params?.slug === 'string' ? params.slug : Array.isArray(params?.slug) ? params.slug[0] : '';
  const { data: session } = useSession();
  const router = useRouter();

  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  /* Bid form state */
  const [bidStage, setBidStage] = useState<'idle' | 'form' | 'success'>('idle');
  const [bidAmt, setBidAmt] = useState('');
  const [bidTimeline, setBidTimeline] = useState('');
  const [bidPitch, setBidPitch] = useState('');
  const [bidErr, setBidErr] = useState('');
  const [bidBusy, setBidBusy] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [localUserBid, setLocalUserBid] = useState<UserBid | null>(null);
  const [copied, setCopied] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`/api/public/gigs/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json() as Promise<PageData>;
      })
      .then((d) => {
        if (!d) return;
        setData(d);
        setLocalUserBid(d.userBid);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  const submitBid = async () => {
    if (!session) { router.push(`/login?next=/gigs/${slug}`); return; }
    if (!bidAmt || !bidPitch.trim()) { setBidErr('Bid amount and pitch are required.'); return; }
    setBidBusy(true); setBidErr('');
    try {
      const res = await fetch('/api/gigs/bids', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          gigId: data!.gig.id,
          amountInRupees: Number(bidAmt),
          timelineLabel: bidTimeline.trim() || undefined,
          note: bidPitch.trim(),
        }),
      });
      const result = await res.json() as { id?: string; error?: string };
      if (!res.ok) throw new Error(result.error || 'Failed to submit bid');
      const newBid: UserBid = {
        id: result.id ?? '',
        status: 'submitted',
        amountInRupees: Number(bidAmt),
        timelineLabel: bidTimeline.trim() || undefined,
        note: bidPitch.trim(),
      };
      setLocalUserBid(newBid);
      setBidStage('success');
      setData((prev) => prev ? { ...prev, bidCount: prev.bidCount + 1 } : prev);
    } catch (e) {
      setBidErr(e instanceof Error ? e.message : 'Failed to submit bid.');
    } finally {
      setBidBusy(false);
    }
  };

  const withdrawBid = async () => {
    if (!localUserBid) return;
    setWithdrawBusy(true);
    try {
      await fetch('/api/gigs/bids', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: localUserBid.id, status: 'withdrawn' }),
      });
      setLocalUserBid((prev) => prev ? { ...prev, status: 'withdrawn' } : prev);
      setData((prev) => prev ? { ...prev, bidCount: Math.max(0, prev.bidCount - 1) } : prev);
    } finally {
      setWithdrawBusy(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const scrollToForm = () => {
    setBidStage('form');
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D0D0F] px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <Shimmer className="mb-8 h-4 w-24" />
          <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
            <div className="space-y-5">
              <Shimmer className="h-8 w-3/4" />
              <Shimmer className="h-4 w-1/2" />
              <Shimmer className="h-36 w-full" />
              <Shimmer className="h-24 w-full" />
              <Shimmer className="h-24 w-full" />
            </div>
            <div className="space-y-4">
              <Shimmer className="h-28 w-full rounded-[20px]" />
              <Shimmer className="h-56 w-full rounded-[20px]" />
              <Shimmer className="h-24 w-full rounded-[20px]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0D0D0F] text-white">
        <Zap className="h-10 w-10 text-white/15" />
        <p className="text-lg font-semibold text-white/60">Gig not found</p>
        <p className="text-sm text-white/30">This listing may have been removed or made private.</p>
        <Link
          href="/published?tab=gig"
          className="mt-2 inline-flex items-center gap-2 rounded-[12px] border border-white/[0.10] bg-white/[0.05] px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/[0.09]"
        >
          <ArrowLeft className="h-4 w-4" /> Browse gigs
        </Link>
      </div>
    );
  }

  const { gig, bidCount, related } = data;
  const isClosed = gig.status === 'closed' || gig.status === 'paused';
  const hasAccepted = Boolean(gig.acceptedBid);
  const canBid = !isClosed && !hasAccepted;
  const isOwner = session?.user?.id === gig.ownerUserId;
  const activeBid = localUserBid && localUserBid.status !== 'withdrawn';
  const bidCfg = localUserBid ? (bidStatusCfg[localUserBid.status] ?? bidStatusCfg.submitted) : null;

  return (
    <div className="min-h-screen bg-[#0D0D0F] text-white">

      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        <div className="absolute left-1/3 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-white/[0.018] blur-[150px]" />
        <div className="absolute right-0 bottom-1/3 h-[400px] w-[400px] rounded-full bg-slate-400/[0.025] blur-[120px]" />
      </div>

      {/* ── Top nav ── */}
      <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#0D0D0F]/85 backdrop-blur-2xl">
        <div className="mx-auto flex h-12 max-w-5xl items-center gap-3 px-4 sm:px-8">
          <Link
            href="/published?tab=gig"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white/40 transition hover:text-white/80"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All gigs
          </Link>
          <div className="mx-2 h-4 w-px bg-white/[0.08]" />
          <span className="truncate text-[12px] text-white/25 max-w-[200px] sm:max-w-sm">
            {gig.summary?.slice(0, 60)}{(gig.summary?.length ?? 0) > 60 ? '…' : ''}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3 text-[11.5px] font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white"
            >
              <Share2 className="h-3.5 w-3.5" />
              {copied ? 'Copied!' : 'Share'}
            </button>
            {!isOwner && canBid && !activeBid && (
              <button
                type="button"
                onClick={scrollToForm}
                className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-white px-4 text-[11.5px] font-bold text-[#0D0D0F] transition hover:bg-white/90 active:scale-95"
              >
                <Zap className="h-3.5 w-3.5" />
                {gig.bidMode === 'bidding' ? 'Place bid' : 'Apply'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_340px]">

          {/* ══ LEFT COLUMN ══ */}
          <div className="min-w-0 space-y-8">

            {/* Hero section */}
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {gig.urgent && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.07] px-3 py-0.5 text-[11px] font-bold text-white/80">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/80" /> Urgent
                  </span>
                )}
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-white/45">{gig.category}</span>
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-white/45">{engLabel(gig.engagementType)}</span>
                <span className={[
                  'ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                  isClosed ? 'text-white/25 bg-white/[0.03]' : hasAccepted ? 'text-white/50 bg-white/[0.06]' : 'text-white/60 bg-white/[0.06]',
                ].join(' ')}>
                  {isClosed ? gig.status : hasAccepted ? 'Filled' : 'Open'}
                </span>
              </div>

              <h1 className="text-[22px] font-bold leading-[1.3] tracking-[-0.03em] text-white sm:text-[26px]">
                {gig.summary}
              </h1>

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-white/40">
                <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{locLabel(gig.locationPreference)}</span>
                {gig.timelineLabel && <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{gig.timelineLabel}</span>}
                <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{bidCount} bid{bidCount !== 1 ? 's' : ''} so far</span>
                <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Posted {timeAgo(gig.createdAt)}</span>
              </div>
            </div>

            {/* Focus / interest areas */}
            {gig.interests.length > 0 && (
              <section>
                <h2 className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.22em] text-white/25">Focus Areas</h2>
                <div className="flex flex-wrap gap-2">
                  {gig.interests.map((item) => (
                    <span key={item} className="rounded-[10px] border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 text-[12.5px] font-medium text-white/55">{item}</span>
                  ))}
                </div>
              </section>
            )}

            {/* Required skills */}
            {gig.skills.length > 0 && (
              <section>
                <h2 className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.22em] text-white/25">Required Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {gig.skills.map((s) => (
                    <span key={s} className="rounded-full border border-white/[0.09] bg-white/[0.05] px-3 py-1 text-[12.5px] font-semibold text-white/60">{s}</span>
                  ))}
                </div>
              </section>
            )}

            {/* Deliverables */}
            {gig.deliverables.length > 0 && (
              <section>
                <h2 className="mb-4 text-[10.5px] font-bold uppercase tracking-[0.22em] text-white/25">What You'll Deliver</h2>
                <div className="space-y-2.5">
                  {gig.deliverables.map((d, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-white/30" />
                      <p className="text-[13.5px] leading-relaxed text-white/65">{d}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Bidding rules block */}
            {gig.bidMode === 'bidding' && gig.bidRules && (
              <section className="rounded-[18px] border border-white/[0.07] bg-white/[0.03] p-5">
                <h2 className="mb-4 text-[10.5px] font-bold uppercase tracking-[0.22em] text-white/25">Bidding Rules</h2>
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                  {gig.bidRules.minBidInRupees ? (
                    <div>
                      <p className="text-[10.5px] text-white/30">Minimum bid</p>
                      <p className="mt-1 text-[18px] font-bold text-white">₹{gig.bidRules.minBidInRupees.toLocaleString('en-IN')}</p>
                    </div>
                  ) : null}
                  {gig.bidRules.bidDeadlineAt ? (
                    <div>
                      <p className="text-[10.5px] text-white/30">Bid deadline</p>
                      <p className="mt-1 text-[15px] font-bold text-white">{fmt(gig.bidRules.bidDeadlineAt)}</p>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-[10.5px] text-white/30">Counter offers</p>
                    <p className="mt-1 text-[15px] font-bold text-white">{gig.bidRules.allowCounterOffer ? 'Allowed' : 'Not allowed'}</p>
                  </div>
                </div>
              </section>
            )}

            {/* Accepted bid notice */}
            {hasAccepted && gig.acceptedBid && (
              <div className="flex items-center gap-3 rounded-[16px] border border-white/[0.10] bg-white/[0.06] px-5 py-4">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-white/60" />
                <div>
                  <p className="text-[13.5px] font-semibold text-white/80">This gig has been filled</p>
                  <p className="mt-0.5 text-[12px] text-white/35">Accepted {timeAgo(gig.acceptedBid.acceptedAt)}</p>
                </div>
              </div>
            )}

            {/* ── Bid / Apply area ── */}
            <div ref={formRef}>
              {isOwner ? (
                <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.03] px-5 py-5">
                  <p className="text-[13.5px] font-semibold text-white/70">You posted this gig.</p>
                  <p className="mt-1 text-[12.5px] text-white/35">Manage bids, status and details from your profile.</p>
                  <Link
                    href="/profile"
                    className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/55 transition hover:text-white"
                  >
                    Go to My Profile <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ) : activeBid && bidCfg ? (
                /* Existing bid status */
                <div className={['rounded-[18px] border px-5 py-5', bidCfg.cls].join(' ')}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-semibold">{bidCfg.label}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-[12.5px] opacity-70">
                        <span>₹{localUserBid!.amountInRupees.toLocaleString('en-IN')}</span>
                        {localUserBid!.timelineLabel && <span>{localUserBid!.timelineLabel}</span>}
                      </div>
                      {localUserBid!.note && (
                        <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed opacity-55">{localUserBid!.note}</p>
                      )}
                    </div>
                    {(localUserBid!.status === 'submitted' || localUserBid!.status === 'shortlisted') && (
                      <button
                        type="button"
                        disabled={withdrawBusy}
                        onClick={() => void withdrawBid()}
                        className="shrink-0 rounded-[10px] border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 text-[11.5px] font-semibold text-white/40 transition hover:bg-white/[0.09] hover:text-white/70 disabled:opacity-40"
                      >
                        {withdrawBusy ? 'Withdrawing…' : 'Withdraw'}
                      </button>
                    )}
                  </div>
                </div>
              ) : !canBid ? (
                <div className="rounded-[18px] border border-white/[0.06] bg-white/[0.03] px-5 py-5 text-center">
                  <p className="text-[13.5px] text-white/40">
                    This gig is no longer accepting {gig.bidMode === 'bidding' ? 'bids' : 'applications'}.
                  </p>
                </div>
              ) : bidStage === 'idle' ? (
                <button
                  type="button"
                  onClick={scrollToForm}
                  className="flex h-12 w-full items-center justify-center gap-2.5 rounded-[16px] bg-white text-[14px] font-bold text-[#0D0D0F] shadow-[0_0_40px_rgba(255,255,255,0.07)] transition hover:bg-white/90 active:scale-[0.98]"
                >
                  <Zap className="h-4 w-4" />
                  {gig.bidMode === 'bidding' ? 'Place a Bid' : 'Apply Now'}
                </button>
              ) : bidStage === 'success' ? (
                <div className="rounded-[18px] border border-white/[0.10] bg-white/[0.05] px-5 py-8 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.07]">
                    <CheckCircle2 className="h-6 w-6 text-white/60" />
                  </div>
                  <p className="text-[15px] font-bold text-white">Submitted successfully</p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-white/40">
                    The poster will review your {gig.bidMode === 'bidding' ? 'bid' : 'application'} and get back to you.
                  </p>
                  <p className="mt-1.5 text-[11.5px] text-white/25">
                    Track it in{' '}
                    <Link href="/profile" className="underline underline-offset-2 transition hover:text-white/50">
                      My Profile → Bids &amp; Applications
                    </Link>
                  </p>
                </div>
              ) : (
                /* Bid form */
                <div className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-6 sm:p-7">
                  <div className="mb-6 flex items-center justify-between">
                    <h3 className="text-[16px] font-bold text-white">
                      {gig.bidMode === 'bidding' ? 'Place Your Bid' : 'Apply for This Gig'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => { setBidStage('idle'); setBidErr(''); }}
                      className="text-[12px] text-white/30 transition hover:text-white/60"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="space-y-5">
                    {/* Context bar */}
                    <div className="rounded-[13px] border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-[12.5px] text-white/40">
                      {gig.bidMode === 'bidding'
                        ? `Budget posted: ₹ ${gig.budgetLabel}${gig.bidRules?.minBidInRupees ? ` · Min bid: ₹${gig.bidRules.minBidInRupees.toLocaleString('en-IN')}` : ''}`
                        : `Budget: ₹ ${gig.budgetLabel}`}
                    </div>

                    <div>
                      <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-white/30">
                        Your {gig.bidMode === 'bidding' ? 'Bid' : 'Expected Budget'} (₹) *
                      </label>
                      <input
                        type="number"
                        value={bidAmt}
                        onChange={(e) => setBidAmt(e.target.value)}
                        placeholder={gig.bidRules?.minBidInRupees ? `Min ₹${gig.bidRules.minBidInRupees.toLocaleString('en-IN')}` : 'Amount in ₹'}
                        className="h-11 w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] px-4 text-[14px] text-white placeholder:text-white/20 outline-none transition focus:border-white/20 focus:ring-2 focus:ring-white/[0.06]"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-white/30">
                        Proposed Timeline
                      </label>
                      <input
                        value={bidTimeline}
                        onChange={(e) => setBidTimeline(e.target.value)}
                        placeholder="e.g. 2 weeks, 1 month"
                        className="h-11 w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] px-4 text-[14px] text-white placeholder:text-white/20 outline-none transition focus:border-white/20 focus:ring-2 focus:ring-white/[0.06]"
                      />
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/30">
                          Pitch — Why you? *
                        </label>
                        <span className="text-[10.5px] text-white/20">{bidPitch.length} / 1000</span>
                      </div>
                      <textarea
                        value={bidPitch}
                        onChange={(e) => setBidPitch(e.target.value.slice(0, 1000))}
                        rows={5}
                        placeholder="Describe your approach, relevant experience, and why you'd deliver this well…"
                        className="w-full resize-none rounded-[13px] border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[14px] leading-relaxed text-white placeholder:text-white/20 outline-none transition focus:border-white/20 focus:ring-2 focus:ring-white/[0.06]"
                      />
                    </div>

                    {bidErr && (
                      <div className="rounded-[11px] border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-[12.5px] text-rose-300/70">
                        {bidErr}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={bidBusy || !bidAmt || !bidPitch.trim()}
                      onClick={() => void submitBid()}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-[13px] bg-white text-[14px] font-bold text-[#0D0D0F] transition hover:bg-white/90 disabled:opacity-40 active:scale-[0.98]"
                    >
                      <Send className="h-4 w-4" />
                      {bidBusy ? 'Submitting…' : gig.bidMode === 'bidding' ? 'Submit Bid' : 'Submit Application'}
                    </button>

                    {!session && (
                      <p className="text-center text-[12px] text-white/30">
                        <Link href={`/login?next=/gigs/${slug}`} className="font-semibold text-white/55 underline underline-offset-2 hover:text-white/80">
                          Sign in
                        </Link>{' '}required to submit
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Related gigs */}
            {related.length > 0 && (
              <section>
                <h2 className="mb-4 text-[10.5px] font-bold uppercase tracking-[0.22em] text-white/25">Similar Gigs</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {related.map((g) => <RelatedCard key={g.id} gig={g} />)}
                </div>
              </section>
            )}
          </div>

          {/* ══ RIGHT COLUMN (sticky) ══ */}
          <div className="space-y-4 lg:sticky lg:top-[60px] lg:self-start">

            {/* Budget */}
            <div className="rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-5">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/25">Budget</p>
              <p className="mt-2 text-[30px] font-bold tracking-[-0.03em] text-white">₹ {gig.budgetLabel}</p>
              {gig.bidMode === 'bidding' && (
                <p className="mt-1 text-[12px] text-white/35">Open to bids — submit your rate</p>
              )}
            </div>

            {/* Gig details */}
            <div className="overflow-hidden rounded-[20px] border border-white/[0.07] bg-white/[0.03]">
              {[
                { Icon: Briefcase, label: 'Category',   value: gig.category },
                { Icon: Globe,     label: 'Engagement', value: engLabel(gig.engagementType) },
                { Icon: MapPin,    label: 'Location',   value: locLabel(gig.locationPreference) },
                gig.timelineLabel ? { Icon: Clock, label: 'Timeline', value: gig.timelineLabel } : null,
                { Icon: Users,    label: 'Bids so far', value: `${bidCount}` },
                { Icon: Shield,   label: 'Contact via', value: gig.contactPreference },
              ].filter(Boolean).map((row, i) => {
                const R = row!.Icon;
                return (
                  <div key={i} className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-3.5 last:border-0">
                    <R className="h-3.5 w-3.5 shrink-0 text-white/25" />
                    <span className="flex-1 text-[12.5px] text-white/40">{row!.label}</span>
                    <span className="text-[12.5px] font-semibold capitalize text-white/70">{row!.value}</span>
                  </div>
                );
              })}
            </div>

            {/* Posted by */}
            <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-5">
              <p className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/25">Posted by</p>
              <Link href={`/u/${gig.ownerUserId}`} className="flex items-center gap-3 group">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.07] text-[16px] font-bold text-white group-hover:border-white/[0.20] transition-colors">
                  {gig.ownerName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-white/80 group-hover:text-white transition-colors">{gig.ownerName}</p>
                  {gig.organizationName && (
                    <p className="truncate text-[11.5px] text-white/35">{gig.organizationName}</p>
                  )}
                </div>
              </Link>
              <div className="mt-3 text-[11.5px] text-white/25">
                Listed {timeAgo(gig.createdAt)} · Updated {timeAgo(gig.updatedAt)}
              </div>
            </div>

            {/* Sticky CTA */}
            {!isOwner && canBid && !activeBid && (
              <button
                type="button"
                onClick={scrollToForm}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-white text-[14px] font-bold text-[#0D0D0F] shadow-[0_0_30px_rgba(255,255,255,0.07)] transition hover:bg-white/90 active:scale-[0.98]"
              >
                <Zap className="h-4 w-4" />
                {gig.bidMode === 'bidding' ? 'Place a Bid' : 'Apply Now'}
              </button>
            )}

            {/* Share */}
            <button
              type="button"
              onClick={copyLink}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[14px] border border-white/[0.08] bg-white/[0.04] text-[12.5px] font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white"
            >
              <Share2 className="h-3.5 w-3.5" />
              {copied ? 'Link copied!' : 'Share this gig'}
            </button>

            <Link
              href="/published?tab=gig"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-[14px] border border-white/[0.06] bg-transparent text-[12.5px] font-semibold text-white/30 transition hover:border-white/[0.10] hover:text-white/60"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Browse all gigs
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
