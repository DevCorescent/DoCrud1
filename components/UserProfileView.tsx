'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Briefcase,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  Pause,
  Play,
  RefreshCw,
  Star,
  Trash2,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────── */
interface PublishedItem {
  id: string;
  title: string;
  fileName?: string;
  category?: string;
  tags?: string[];
  visibility: 'public' | 'private';
  sizeLabel?: string;
  openCount?: number;
  interestedCount?: number;
  updatedAt: string;
  createdAt: string;
  href: string;
}

interface InterestedUser {
  id: string;
  name: string;
  markedAt: string;
}

interface GigBidEntry {
  id: string;
  gigId: string;
  gigTitle?: string;
  gigSlug?: string;
  bidderUserId?: string;
  bidderName?: string;
  bidderEmail?: string;
  bidderOrganization?: string;
  amountInRupees: number;
  currency: 'INR';
  timelineLabel?: string;
  note: string;
  status: 'submitted' | 'shortlisted' | 'accepted' | 'rejected' | 'withdrawn';
  createdAt: string;
  updatedAt: string;
}

interface GigListingEntry {
  id: string;
  slug: string;
  title: string;
  summary?: string;
  category: string;
  skills?: string[];
  deliverables?: string[];
  budgetLabel?: string;
  timelineLabel?: string;
  engagementType?: string;
  locationPreference?: string;
  bidMode?: string;
  bidRules?: { minBidInRupees?: number; bidDeadlineAt?: string };
  status: 'draft' | 'published' | 'paused' | 'closed';
  visibility: 'public' | 'private';
  connectCount?: number;
  interests?: string[];
  urgent?: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ─── Props ─────────────────────────────────────────────────── */
interface UserProfileViewProps {
  userName?: string;
  userEmail?: string;
  userId?: string;
}

/* ─── Helpers ───────────────────────────────────────────────── */
function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function getInitial(name?: string, email?: string) {
  return (name || email || '?').charAt(0).toUpperCase();
}

function categoryLabel(cat?: string) {
  if (!cat) return 'File';
  const map: Record<string, string> = {
    news: 'News', article: 'Article', document: 'Document', portfolio: 'Portfolio',
    announcement: 'Announcement', job: 'Job', resume: 'Resume', product: 'Product',
    event: 'Event', hackathon: 'Hackathon', gig: 'Gig',
  };
  return map[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
}

function engagementLabel(e?: string) {
  const m: Record<string, string> = { one_time: 'One-time', ongoing: 'Ongoing', retainer: 'Retainer' };
  return e ? (m[e] ?? e) : '';
}

const gigStatusConfig: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'text-white/40 bg-white/[0.04]' },
  published: { label: 'Live',      cls: 'text-white/80 bg-white/[0.08]' },
  paused:    { label: 'Paused',    cls: 'text-white/50 bg-white/[0.05]' },
  closed:    { label: 'Closed',    cls: 'text-white/30 bg-white/[0.03]' },
};

const bidStatusConfig: Record<string, { label: string; cls: string }> = {
  submitted:   { label: 'Submitted',   cls: 'text-white/50 bg-white/[0.05]' },
  shortlisted: { label: 'Shortlisted', cls: 'text-white/80 bg-white/[0.08]' },
  accepted:    { label: 'Accepted',    cls: 'text-white bg-white/[0.10]' },
  rejected:    { label: 'Rejected',    cls: 'text-rose-300/70 bg-white/[0.03]' },
  withdrawn:   { label: 'Withdrawn',   cls: 'text-white/30 bg-white/[0.03]' },
};

/* ─── Shimmer skeleton ───────────────────────────────────────── */
function Shimmer({ className }: { className?: string }) {
  return <div className={['relative overflow-hidden rounded-xl bg-white/[0.04]', className].join(' ')}><div className="absolute inset-y-0 -left-full w-full animate-[shimmerSlide_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" /></div>;
}
function CardSkeleton() {
  return (
    <div className="space-y-3 rounded-[18px] border border-white/[0.06] bg-white/[0.03] p-5">
      <Shimmer className="h-4 w-2/3" />
      <Shimmer className="h-3 w-1/3" />
      <Shimmer className="h-3 w-1/4" />
    </div>
  );
}

/* ─── Bid row inside a gig card ─────────────────────────────── */
function BidRow({ bid, onAction }: { bid: GigBidEntry; onAction: (id: string, status: GigBidEntry['status']) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const sc = bidStatusConfig[bid.status] ?? bidStatusConfig.submitted;
  const isActive = bid.status === 'submitted' || bid.status === 'shortlisted';

  const act = async (status: GigBidEntry['status']) => {
    setBusy(true);
    await onAction(bid.id, status);
    setBusy(false);
  };

  return (
    <div className="rounded-[14px] border border-white/[0.05] bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-white/80">{bid.bidderName || bid.bidderEmail || 'Bidder'}</span>
            {bid.bidderOrganization && (
              <span className="text-[11px] text-white/30">· {bid.bidderOrganization}</span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-white/40">
            <span className="font-semibold text-white/60">₹{bid.amountInRupees.toLocaleString('en-IN')}</span>
            {bid.timelineLabel && <span>{bid.timelineLabel}</span>}
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(bid.createdAt)}</span>
          </div>
          {bid.note && <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-white/30">{bid.note}</p>}
        </div>
        <span className={['shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-semibold', sc.cls].join(' ')}>
          {sc.label}
        </span>
      </div>

      {isActive && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.04] pt-3">
          {bid.status === 'submitted' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act('shortlisted')}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.05] px-3 text-[11px] font-semibold text-white/60 transition hover:bg-white/[0.09] hover:text-white disabled:opacity-40"
            >
              Shortlist
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('accepted')}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-white px-3 text-[11px] font-bold text-[#0D0D0F] transition hover:bg-white/90 disabled:opacity-40"
          >
            <CheckCircle2 className="h-3 w-3" /> Accept
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('rejected')}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-[11px] font-semibold text-rose-300/60 transition hover:bg-white/[0.05] hover:text-rose-300/90 disabled:opacity-40"
          >
            <X className="h-3 w-3" /> Reject
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Gig listing card ───────────────────────────────────────── */
function GigCard({
  gig,
  incomingBids,
  onStatusChange,
  onBidAction,
  onDelete,
}: {
  gig: GigListingEntry;
  incomingBids: GigBidEntry[];
  onStatusChange: (id: string, status: GigListingEntry['status']) => Promise<void>;
  onBidAction: (bidId: string, status: GigBidEntry['status']) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [bidsOpen, setBidsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const sc = gigStatusConfig[gig.status] ?? gigStatusConfig.draft;
  const myBids = incomingBids.filter((b) => b.gigId === gig.id);
  const pendingBids = myBids.filter((b) => b.status === 'submitted' || b.status === 'shortlisted');

  const changeStatus = async (status: GigListingEntry['status']) => {
    setBusy(true);
    await onStatusChange(gig.id, status);
    setBusy(false);
  };

  const deleteListing = async () => {
    setBusy(true);
    await onDelete(gig.id);
    setBusy(false);
    setConfirmDelete(false);
  };

  return (
    <div className="overflow-hidden rounded-[20px] border border-white/[0.07] bg-white/[0.03] transition hover:border-white/[0.10]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={['rounded-md px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', sc.cls].join(' ')}>
              {sc.label}
            </span>
            {gig.engagementType && (
              <span className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-white/35">
                {engagementLabel(gig.engagementType)}
              </span>
            )}
            {gig.urgent && (
              <span className="rounded-md bg-white/[0.08] px-2 py-0.5 text-[10px] font-bold text-white/70">
                Urgent
              </span>
            )}
          </div>

          <h3 className="mt-2 text-[15px] font-bold leading-snug text-white">{gig.title}</h3>
          {gig.summary && <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-white/40">{gig.summary}</p>}

          <div className="mt-3 flex flex-wrap gap-3 text-[11.5px] text-white/35">
            {gig.category && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{gig.category}</span>}
            {gig.budgetLabel && <span className="flex items-center gap-1 font-semibold text-white/55">₹ {gig.budgetLabel}</span>}
            {gig.locationPreference && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{gig.locationPreference}</span>}
            {gig.timelineLabel && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{gig.timelineLabel}</span>}
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Posted {formatDate(gig.createdAt)}</span>
          </div>

          {gig.skills && gig.skills.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {gig.skills.slice(0, 6).map((s) => (
                <span key={s} className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-0.5 text-[10.5px] text-white/45">{s}</span>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
          <div className="text-right">
            <div className="text-[22px] font-bold text-white">{myBids.length}</div>
            <div className="text-[10px] text-white/30">total bids</div>
          </div>
          {pendingBids.length > 0 && (
            <div className="rounded-full border border-white/[0.08] bg-white/[0.05] px-2.5 py-0.5 text-[10px] font-semibold text-white/60">
              {pendingBids.length} pending
            </div>
          )}
        </div>
      </div>

      {/* Bid mode info */}
      {gig.bidMode === 'bidding' && gig.bidRules && (
        <div className="mx-5 mb-4 rounded-[12px] border border-white/[0.05] bg-white/[0.025] px-4 py-2.5 text-[11.5px] text-white/40">
          Open bidding
          {gig.bidRules.minBidInRupees ? ` · Min ₹${gig.bidRules.minBidInRupees.toLocaleString('en-IN')}` : ''}
          {gig.bidRules.bidDeadlineAt ? ` · Deadline ${formatDate(gig.bidRules.bidDeadlineAt)}` : ''}
        </div>
      )}

      {/* Deliverables */}
      {gig.deliverables && gig.deliverables.length > 0 && (
        <div className="mx-5 mb-4">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/20">Deliverables</p>
          <div className="flex flex-col gap-1">
            {gig.deliverables.slice(0, 3).map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-[11.5px] text-white/40">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-white/20" />{d}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] px-5 py-3.5">
        <div className="flex flex-wrap gap-2">
          {/* Status toggles */}
          {gig.status === 'published' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void changeStatus('paused')}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
            >
              <Pause className="h-3 w-3" /> Pause
            </button>
          )}
          {gig.status === 'paused' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void changeStatus('published')}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
            >
              <Play className="h-3 w-3" /> Resume
            </button>
          )}
          {(gig.status === 'draft' || gig.status === 'paused') && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void changeStatus('published')}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg bg-white px-3 text-[11px] font-bold text-[#0D0D0F] transition hover:bg-white/90 disabled:opacity-40"
            >
              <Play className="h-3 w-3" /> {gig.status === 'draft' ? 'Publish' : 'Resume'}
            </button>
          )}
          {gig.status !== 'closed' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void changeStatus('closed')}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-[11px] font-semibold text-white/35 transition hover:bg-white/[0.06] hover:text-white/60 disabled:opacity-40"
            >
              <X className="h-3 w-3" /> Close
            </button>
          )}
          {gig.status === 'closed' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void changeStatus('draft')}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
            >
              <RefreshCw className="h-3 w-3" /> Reopen
            </button>
          )}

          {/* Delete with confirmation */}
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-[11px] font-semibold text-rose-300/50 transition hover:bg-white/[0.05] hover:text-rose-300/80"
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-white/40">Confirm?</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void deleteListing()}
                className="inline-flex h-7 items-center gap-1 rounded-lg bg-rose-500/20 px-3 text-[11px] font-bold text-rose-300 transition hover:bg-rose-500/30 disabled:opacity-40"
              >
                Yes, delete
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-[11px] font-semibold text-white/40 transition hover:bg-white/[0.06]"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Bids toggle */}
        {myBids.length > 0 && (
          <button
            type="button"
            onClick={() => setBidsOpen((v) => !v)}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-[11px] font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white"
          >
            {bidsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {myBids.length} Bid{myBids.length !== 1 ? 's' : ''}
            {pendingBids.length > 0 && (
              <span className="ml-0.5 rounded-full bg-white/[0.10] px-1.5 py-px text-[9px] font-bold text-white/70">
                {pendingBids.length} new
              </span>
            )}
          </button>
        )}
      </div>

      {/* Bids panel */}
      {bidsOpen && myBids.length > 0 && (
        <div className="border-t border-white/[0.05] px-5 pb-5 pt-4">
          <p className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/25">Incoming bids</p>
          <div className="space-y-3">
            {myBids.map((bid) => (
              <BidRow key={bid.id} bid={bid} onAction={onBidAction} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Interested users panel for a single post ───────────────── */
function InterestedUsersPanel({ postId, postTitle }: { postId: string; postTitle: string }) {
  const [open, setOpen]           = useState(false);
  const [users, setUsers]         = useState<InterestedUser[]>([]);
  const [loading, setLoading]     = useState(false);
  const [fetched, setFetched]     = useState(false);

  const load = async () => {
    if (fetched) { setOpen(v => !v); return; }
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch(`/api/published/${postId}/interested-users`);
      if (res.ok) {
        const d = await res.json() as { users: InterestedUser[] };
        setUsers(d.users);
        setFetched(true);
      }
    } catch {} finally { setLoading(false); }
  };

  const ago = (iso: string) => {
    const d = Date.now() - new Date(iso).getTime();
    if (d < 3_600_000)  return `${Math.floor(d / 60_000)}m ago`;
    if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
    return `${Math.floor(d / 86_400_000)}d ago`;
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void load()}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400/70 hover:text-amber-400 transition"
      >
        <Star className="h-3 w-3" />
        {open ? 'Hide interested' : 'View interested users'}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          {loading && <p className="text-[11px] text-white/30 py-2 text-center">Loading…</p>}
          {!loading && users.length === 0 && (
            <p className="text-[11px] text-white/25 py-2 text-center">No one has marked interest yet.</p>
          )}
          {!loading && users.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/25 mb-2">
                {users.length} interested · {postTitle}
              </p>
              {users.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-[9px] font-bold text-amber-400">
                      {u.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-[12px] font-medium text-white/75">{u.name}</span>
                  </div>
                  <span className="text-[10px] text-white/25">{ago(u.markedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function UserProfileView({ userName, userEmail, userId }: UserProfileViewProps) {
  const [activeTab, setActiveTab] = useState<'published' | 'gigs' | 'bids'>('published');

  /* Published */
  const [publishedItems, setPublishedItems] = useState<PublishedItem[]>([]);
  const [loadingPublished, setLoadingPublished] = useState(true);
  const [publishedError, setPublishedError] = useState('');

  /* Gigs workspace */
  const [ownGigs, setOwnGigs] = useState<GigListingEntry[]>([]);
  const [incomingBids, setIncomingBids] = useState<GigBidEntry[]>([]);
  const [outgoingBids, setOutgoingBids] = useState<GigBidEntry[]>([]);
  const [loadingGigs, setLoadingGigs] = useState(true);
  const [gigsError, setGigsError] = useState('');

  /* ── Fetch published ── */
  useEffect(() => {
    let cancelled = false;
    setLoadingPublished(true);
    fetch('/api/recent-publishes?limit=50')
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setPublishedItems(Array.isArray(d?.items) ? d.items : []); })
      .catch(() => { if (!cancelled) setPublishedError('Failed to load published items.'); })
      .finally(() => { if (!cancelled) setLoadingPublished(false); });
    return () => { cancelled = true; };
  }, []);

  /* ── Fetch gigs workspace ── */
  const refreshGigs = useCallback(() => {
    setLoadingGigs(true);
    return fetch('/api/gigs')
      .then((r) => r.json())
      .then((d) => {
        setOwnGigs(d?.ownListings ?? []);
        setIncomingBids(d?.incomingBids ?? []);
        setOutgoingBids(d?.outgoingBids ?? []);
      })
      .catch(() => setGigsError('Failed to load gigs.'))
      .finally(() => setLoadingGigs(false));
  }, []);

  useEffect(() => { void refreshGigs(); }, [refreshGigs]);

  /* ── Gig status update ── */
  const handleGigStatusChange = async (id: string, status: GigListingEntry['status']) => {
    const gig = ownGigs.find((g) => g.id === id);
    if (!gig) return;
    const res = await fetch('/api/gigs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, title: gig.title, summary: gig.summary, category: gig.category, status }),
    });
    if (res.ok) {
      setOwnGigs((prev) => prev.map((g) => g.id === id ? { ...g, status } : g));
    }
  };

  /* ── Gig delete ── */
  const handleGigDelete = async (id: string) => {
    const res = await fetch(`/api/gigs?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) setOwnGigs((prev) => prev.filter((g) => g.id !== id));
  };

  /* ── Bid action (accept / reject / shortlist) ── */
  const handleBidAction = async (bidId: string, status: GigBidEntry['status']) => {
    const res = await fetch('/api/gigs/bids', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: bidId, status }),
    });
    if (res.ok) {
      setIncomingBids((prev) => prev.map((b) => b.id === bidId ? { ...b, status } : b));
    }
  };

  const initial = getInitial(userName, userEmail);
  const displayName = userName || userEmail?.split('@')[0] || 'User';

  const tabs = [
    { id: 'published' as const, label: 'Published', Icon: FileText, count: publishedItems.length },
    { id: 'gigs' as const, label: 'My Gigs', Icon: Zap, count: ownGigs.length },
    { id: 'bids' as const, label: 'Bids & Applications', Icon: Briefcase, count: outgoingBids.length },
  ];

  return (
    <div className="min-h-screen overflow-y-auto bg-[#0D0D0F] px-4 py-10 sm:px-8">

      {/* Ambient blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        <div className="absolute left-1/3 top-1/4 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-white/[0.018] blur-[130px]" />
        <div className="absolute right-1/4 bottom-1/3 h-[400px] w-[400px] rounded-full bg-slate-400/[0.025] blur-[110px]" />
      </div>

      <div className="mx-auto max-w-3xl space-y-8">

        {/* ── Profile header ── */}
        <div className="flex items-center gap-5">
          <div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-2xl border border-white/[0.10] bg-white/[0.07] text-2xl font-bold text-white shadow-[0_0_30px_rgba(255,255,255,0.04)]">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] font-bold tracking-[-0.03em] text-white">{displayName}</h1>
            {userEmail && <p className="mt-0.5 truncate text-[13px] text-white/40">{userEmail}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] text-white/45">
                <User className="h-3 w-3" /> Member
              </span>
              {userId && (
                <Link
                  href={`/u/${userId}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-[11px] text-white/45 hover:text-white/70 hover:border-white/[0.14] transition-colors"
                >
                  <ExternalLink className="h-3 w-3" /> View public profile
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Published', value: loadingPublished ? '—' : publishedItems.length, Icon: FileText },
            { label: 'Gig listings', value: loadingGigs ? '—' : ownGigs.length, Icon: Zap },
            { label: 'Bids placed', value: loadingGigs ? '—' : outgoingBids.length, Icon: Briefcase },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="rounded-[16px] border border-white/[0.06] bg-white/[0.03] p-4 text-center">
              <Icon className="mx-auto mb-2 h-4 w-4 text-white/25" />
              <div className="text-[20px] font-bold text-white">{value}</div>
              <div className="mt-0.5 text-[11px] text-white/35">{label}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-1">
          {tabs.map(({ id, label, Icon, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={[
                'flex flex-1 items-center justify-center gap-1.5 rounded-[11px] py-2.5 text-[12px] font-semibold transition',
                activeTab === id ? 'bg-white/[0.08] text-white shadow-[0_1px_0_rgba(255,255,255,0.04)]' : 'text-white/35 hover:text-white/60',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
              {count > 0 && (
                <span className={['rounded-full px-1.5 py-px text-[10px] font-bold', activeTab === id ? 'bg-white/[0.10] text-white/70' : 'bg-white/[0.05] text-white/30'].join(' ')}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Published tab ── */}
        {activeTab === 'published' && (
          <div className="space-y-3">
            {loadingPublished ? (
              Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
            ) : publishedError ? (
              <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.03] p-5 text-sm text-rose-300/70">{publishedError}</div>
            ) : publishedItems.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[18px] border border-white/[0.06] bg-white/[0.03] py-16 text-center">
                <FileText className="h-9 w-9 text-white/15" />
                <p className="text-[14px] font-semibold text-white/40">Nothing published yet</p>
                <p className="text-[12px] text-white/25">Use "Publish anything" from the homepage to share your first item.</p>
              </div>
            ) : (
              publishedItems.map((item) => (
                <div key={item.id} className="group rounded-[18px] border border-white/[0.06] bg-white/[0.03] p-5 transition hover:border-white/[0.10] hover:bg-white/[0.05]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-white/[0.08] bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                          {categoryLabel(item.category)}
                        </span>
                        <span className={['rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', item.visibility === 'public' ? 'text-white/50 bg-white/[0.05]' : 'text-white/25 bg-white/[0.03]'].join(' ')}>
                          {item.visibility}
                        </span>
                      </div>
                      <p className="mt-2 truncate text-[14px] font-semibold text-white">{item.title}</p>
                      <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-white/30">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(item.createdAt)}</span>
                        {item.sizeLabel && <span>{item.sizeLabel}</span>}
                        {(item.openCount ?? 0) > 0 && <span>{item.openCount} view{item.openCount !== 1 ? 's' : ''}</span>}
                        {(item.interestedCount ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-amber-400/70">
                            <Star className="h-3 w-3" />{item.interestedCount} interested
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      href={item.href}
                      className="shrink-0 flex items-center gap-1.5 rounded-[11px] border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold text-white/50 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      View <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                  {(item.category === 'event' || item.category === 'hackathon') && (
                    <InterestedUsersPanel postId={item.id} postTitle={item.title} />
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Gigs tab ── */}
        {activeTab === 'gigs' && (
          <div className="space-y-4">
            {loadingGigs ? (
              Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
            ) : gigsError ? (
              <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.03] p-5 text-sm text-rose-300/70">{gigsError}</div>
            ) : ownGigs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[18px] border border-white/[0.06] bg-white/[0.03] py-16 text-center">
                <Zap className="h-9 w-9 text-white/15" />
                <p className="text-[14px] font-semibold text-white/40">No gig listings yet</p>
                <p className="text-[12px] text-white/25">Use "Publish anything" and select Gig to post your first listing.</p>
              </div>
            ) : (
              ownGigs.map((gig) => (
                <GigCard
                  key={gig.id}
                  gig={gig}
                  incomingBids={incomingBids}
                  onStatusChange={handleGigStatusChange}
                  onBidAction={handleBidAction}
                  onDelete={handleGigDelete}
                />
              ))
            )}
          </div>
        )}

        {/* ── Bids & Applications tab ── */}
        {activeTab === 'bids' && (
          <div className="space-y-3">
            {loadingGigs ? (
              Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)
            ) : gigsError ? (
              <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.03] p-5 text-sm text-rose-300/70">{gigsError}</div>
            ) : outgoingBids.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-[18px] border border-white/[0.06] bg-white/[0.03] py-16 text-center">
                <Briefcase className="h-9 w-9 text-white/15" />
                <p className="text-[14px] font-semibold text-white/40">No bids placed yet</p>
                <p className="text-[12px] text-white/25">Browse gig listings and place your first bid to see it here.</p>
              </div>
            ) : (
              outgoingBids.map((bid) => {
                const sc = bidStatusConfig[bid.status] ?? bidStatusConfig.submitted;
                return (
                  <div key={bid.id} className="rounded-[18px] border border-white/[0.06] bg-white/[0.03] p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-white">{bid.gigTitle || 'Gig'}</p>
                        <div className="mt-1.5 flex flex-wrap gap-3 text-[11.5px] text-white/40">
                          <span className="font-semibold text-white/60">₹{bid.amountInRupees.toLocaleString('en-IN')}</span>
                          {bid.timelineLabel && <span>{bid.timelineLabel}</span>}
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatDate(bid.createdAt)}</span>
                        </div>
                        {bid.note && <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-white/30">{bid.note}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className={['rounded-lg px-2.5 py-1 text-[10px] font-semibold', sc.cls].join(' ')}>
                          {sc.label}
                        </span>
                        {(bid.status === 'submitted' || bid.status === 'shortlisted') && (
                          <button
                            type="button"
                            onClick={() => void handleBidAction(bid.id, 'withdrawn')}
                            className="text-[10.5px] text-white/25 transition hover:text-white/50"
                          >
                            Withdraw
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>
    </div>
  );
}
