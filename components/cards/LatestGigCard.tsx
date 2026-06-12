'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { MapPin, Share2, Star } from 'lucide-react';

import { Button } from '@/components/ui/button';

type GigLike = {
  id: string;
  slug: string;
  title: string;
  summary?: string;
  category: string;
  budgetLabel?: string;
  organizationName?: string;
  ownerName?: string;
  locationPreference?: string;
  updatedAt: string;
  createdAt: string;
  urgent?: boolean;
};

function formatRelativeTime(iso: string) {
  const ms = +new Date(iso);
  if (!Number.isFinite(ms)) return '';
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 2) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(ms));
}

function getCategoryTone(category: string) {
  const key = String(category || '').toLowerCase();
  if (key.includes('design')) {
    return { glow: 'from-fuchsia-500/35 via-indigo-500/18 to-sky-500/26', pill: 'bg-fuchsia-500/10 text-fuchsia-700' };
  }
  if (key.includes('marketing')) {
    return { glow: 'from-amber-500/35 via-rose-500/18 to-violet-500/22', pill: 'bg-amber-500/12 text-amber-800' };
  }
  if (key.includes('web') || key.includes('dev') || key.includes('engineer')) {
    return { glow: 'from-sky-500/32 via-indigo-500/18 to-emerald-500/22', pill: 'bg-sky-500/12 text-sky-700' };
  }
  return { glow: 'from-emerald-500/28 via-sky-500/16 to-indigo-500/22', pill: 'bg-emerald-500/12 text-emerald-800' };
}

function isGigNew(gig: GigLike) {
  const ms = +new Date(gig.createdAt || gig.updatedAt);
  return Number.isFinite(ms) && Date.now() - ms < 1000 * 60 * 60 * 36;
}

function isGigUrgent(gig: GigLike) {
  return Boolean((gig as any).urgent ?? (gig as any).featured);
}

function GigThumbnail(props: {
  title: string;
  glow: string;
  badge?: string;
  shareUrl: string;
  saved: boolean;
  onToggleSave: () => void;
  onShare: () => void;
}) {
  const { title, glow, badge, saved, onToggleSave, onShare } = props;
  return (
    <div className="relative">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5">
        {badge ? (
          <span className="inline-flex items-center rounded-full bg-[linear-gradient(135deg,rgba(245,158,11,0.95),rgba(251,191,36,0.92))] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-950 shadow-[0_10px_26px_rgba(2,6,23,0.22)]">
            {badge}
          </span>
        ) : null}
      </div>

      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onShare();
          }}
          aria-label="Share gig"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-black/35 text-white shadow-sm backdrop-blur-2xl transition hover:bg-black/45"
        >
          <Share2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleSave();
          }}
          aria-label={saved ? 'Unsave gig' : 'Save gig'}
          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border shadow-sm backdrop-blur-2xl transition ${
            saved
              ? 'border-amber-200/40 bg-[linear-gradient(135deg,rgba(245,158,11,0.98),rgba(251,191,36,0.92))] text-slate-950 hover:brightness-[0.98]'
              : 'border-white/10 bg-black/35 text-white hover:bg-black/45'
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${saved ? 'fill-slate-950 text-slate-950' : ''}`} />
        </button>
      </div>

      <div className="relative h-[92px] overflow-hidden rounded-[1.15rem] bg-[linear-gradient(135deg,rgba(2,6,23,0.98),rgba(15,23,42,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
        <div className={`pointer-events-none absolute -left-10 -top-8 h-44 w-44 rounded-full bg-gradient-to-br ${glow} opacity-95 blur-2xl`} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_26%,rgba(245,158,11,0.18),transparent_55%),radial-gradient(circle_at_78%_68%,rgba(99,102,241,0.18),transparent_60%)]" />
        <div className="relative flex h-full items-center justify-center px-10 text-center">
          <p className="line-clamp-2 text-[13px] font-semibold tracking-[-0.02em] text-white drop-shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
            {title}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LatestGigCard(props: {
  gig: GigLike;
  isAuthenticated: boolean;
  saved: boolean;
  onToggleSave: (gigId: string) => void;
  onRequestLogin?: () => void;
  onShareToast?: (message: string) => void;
}) {
  const { gig } = props;
  const tone = getCategoryTone(gig.category);
  const badge = isGigNew(gig) ? 'NEW' : (isGigUrgent(gig) ? 'URGENT' : undefined);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/gigs/${gig.slug}`;
  }, [gig.slug]);

  const onShare = async () => {
    if (!shareUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: gig.title, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        props.onShareToast?.('Link copied');
      }
    } catch {
      // ignore
    }
  };

  const orgName = gig.organizationName || gig.ownerName || 'docrud';

  return (
    <article className="group cloud-card-soft relative overflow-hidden rounded-[1.35rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(255,255,255,0.70))] p-3 shadow-[0_10px_32px_rgba(15,23,42,0.055)] backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:bg-white/88 hover:shadow-[0_14px_44px_rgba(15,23,42,0.08)]">
      <div className={`pointer-events-none absolute -left-12 top-0 h-full w-56 bg-gradient-to-br ${tone.glow} opacity-90 blur-2xl`} />
      <div className="relative">
        <Link href={`/gigs/${gig.slug}`} className="block">
          <GigThumbnail
            title={gig.title}
            glow={tone.glow}
            badge={badge}
            shareUrl={shareUrl}
            saved={props.saved}
            onToggleSave={() => props.onToggleSave(gig.id)}
            onShare={onShare}
          />
          <p className="mt-2 line-clamp-1 text-xs font-semibold text-slate-600">{orgName}</p>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{gig.summary || 'Open gig — view details and send a proposal.'}</p>
        </Link>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className={`truncate rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.pill}`}>{gig.category}</span>
          <span className="truncate rounded-full bg-slate-950/5 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{gig.budgetLabel || 'Discuss budget'}</span>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1 shadow-sm">
            <MapPin className="h-3.5 w-3.5" />
            <span className="capitalize">{String(gig.locationPreference || 'remote')}</span>
          </span>
          <span className="truncate rounded-full bg-white/70 px-2.5 py-1 shadow-sm">
            {formatRelativeTime(gig.updatedAt)}
          </span>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Button
            asChild
            type="button"
            className="h-9 flex-1 rounded-full bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"
            onClick={(event) => {
              if (props.isAuthenticated) return;
              event.preventDefault();
              props.onRequestLogin?.();
            }}
          >
            <Link href={`/gigs/${gig.slug}`}>Send proposal</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
