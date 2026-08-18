'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePostReactions, PostReactionButton, PostReactionSummaryBar } from '@/components/social/PostReactionButton';
import { PostSocialProofRow } from '@/components/social/PostSocialProofRow';
import { useSearchTracker, SEARCH_CONTEXTS } from '@/lib/search-tracking';
import { sanitizeCtaUrl } from '@/lib/cta';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { PresenceDot } from '@/components/PresenceBadge';
import { PublishedFeedCard } from '@/components/feed/PublishedFeedCard';
import { feedCategoryTreatment, shouldShowFeedTitle } from '@/components/feed/feedCardTheme';
import {
  buildCategoryMetaChips,
  FeedMetaChipRow,
  getFeedDescription,
  hasFeedDescription,
  readFeedLabelledValue,
} from '@/components/feed/FeedCardMeta';
import { FeedCardMenu } from '@/components/feed/FeedCardMenu';
const PublishAnythingDialog = dynamic(() => import('@/components/PublishAnythingDialog'), { ssr: false });
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BarChart,
  BarChart2,
  BookMarked,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  Heart,
  Image as ImageIcon,
  Layers,
  ListChecks,
  MapPin,
  Megaphone,
  MessageSquare,
  Newspaper,
  Package,
  Play,
  Plus,
  Search,
  Send,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Terminal,
  ThumbsUp,
  TrendingUp,
  Trash2,
  User,
  Video,
  X,
  Zap,
} from 'lucide-react';

/* ─── active-filter chip ─────────────────────────────────────────── */
function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="flex shrink-0 items-center gap-1 rounded-full border border-white/[0.10] bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-medium text-white/55 transition hover:bg-white/[0.09] hover:text-white/80 active:scale-95"
    >
      {label}
      <X className="h-2.5 w-2.5 text-white/30" />
    </button>
  );
}

/* ─── toast ──────────────────────────────────────────────────────── */
type ToastEntry = { id: number; msg: string; type: 'success' | 'error' | 'info'; emoji?: string };
let _pushToast: ((t: Omit<ToastEntry, 'id'>) => void) | null = null;

function toast(msg: string, type: ToastEntry['type'] = 'success', emoji?: string) {
  _pushToast?.({ msg, type, emoji });
}

function ToastContainer() {
  const [list, setList] = useState<ToastEntry[]>([]);
  const ctr = useRef(0);
  const add = useCallback((t: Omit<ToastEntry, 'id'>) => {
    const id = ++ctr.current;
    setList(p => [...p.slice(-4), { ...t, id }]);
    setTimeout(() => setList(p => p.filter(x => x.id !== id)), 3000);
  }, []);
  useEffect(() => { _pushToast = add; return () => { _pushToast = null; }; }, [add]);
  if (typeof document === 'undefined' || list.length === 0) return null;
  return createPortal(
    <div className="fixed bottom-20 lg:bottom-6 right-4 z-[300] flex flex-col gap-2 items-end pointer-events-none">
      {list.map(t => (
        <div key={t.id} className={`flex items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-[12.5px] font-semibold shadow-2xl backdrop-blur-xl animate-in slide-in-from-right-4 fade-in duration-200 ${
          t.type === 'success' ? 'border-emerald-500/30 bg-[#0d1f14]/95 text-emerald-300'
          : t.type === 'error' ? 'border-red-500/30 bg-[#1f0d0d]/95 text-red-300'
          : 'border-white/20 bg-[#111114]/95 text-white/80'
        }`}>
          {t.emoji && <span className="text-[15px]">{t.emoji}</span>}
          {t.msg}
        </div>
      ))}
    </div>,
    document.body
  );
}

/* ─── cta tracking ───────────────────────────────────────────────── */
function trackCTA(ctaId: string, category: string) {
  fetch('/api/telemetry/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ event: 'cta_click', ctaId, category, surface: 'published_page' }),
  }).catch(() => {});
  try {
    const raw = localStorage.getItem('pub_cta_analytics') || '{}';
    const data = JSON.parse(raw) as Record<string, Record<string, number>>;
    data[category] ??= {};
    data[category][ctaId] = (data[category][ctaId] ?? 0) + 1;
    localStorage.setItem('pub_cta_analytics', JSON.stringify(data));
  } catch {}
}

/* ─── share helper ───────────────────────────────────────────────── */
async function shareItem(id: string, title: string) {
  const url = `${window.location.origin}/published/${id}`;
  if (navigator.share) {
    try { await navigator.share({ title, url }); return; } catch {}
  }
  await navigator.clipboard.writeText(url).catch(() => {});
  toast('Link copied to clipboard!', 'success', '🔗');
}

/* ─── trend types + storage helpers ─────────────────────────────── */
type TrendEntry = {
  count: number; trendedByViewer: boolean;
  category: string; title: string; chips: string[]; lastActive: number;
};
type TrendHistoryEntry = {
  postId: string; title: string; category: string; trendedAt: number; tags: string[];
};

const readTrends       = (): Record<string, TrendEntry>       => { try { return JSON.parse(localStorage.getItem('pub_trends')        || '{}'); } catch { return {}; } };
const readTagTrends    = (): Record<string, number>           => { try { return JSON.parse(localStorage.getItem('pub_tag_trends')    || '{}'); } catch { return {}; } };
const readCatTrends    = (): Record<string, number>           => { try { return JSON.parse(localStorage.getItem('pub_cat_trends')    || '{}'); } catch { return {}; } };
const readTrendHistory = (): TrendHistoryEntry[]              => { try { return JSON.parse(localStorage.getItem('pub_trend_history') || '[]'); } catch { return []; } };

/* ─── useTrend hook — server-backed for real items, localStorage for mocks ── */
function useTrend(item: PublishedItem): [number, boolean, () => Promise<void>] {
  const [count,   setCount]   = useState(() => {
    if (item.trendCount !== undefined) return item.trendCount;
    try { return (readTrends()[item.id]?.count ?? 0); } catch { return 0; }
  });
  const [trended, setTrended] = useState(() => {
    if (item.trendedByViewer !== undefined) return item.trendedByViewer;
    try { return (readTrends()[item.id]?.trendedByViewer ?? false); } catch { return false; }
  });
  const inFlight = useRef(false);

  useEffect(() => { if (item.trendCount !== undefined) setCount(item.trendCount); }, [item.trendCount]);
  useEffect(() => { if (item.trendedByViewer !== undefined) setTrended(item.trendedByViewer); }, [item.trendedByViewer]);

  const toggle = useCallback(async () => {
    if (inFlight.current) return;
    const next  = !trended;
    const delta = next ? 1 : -1;
    setTrended(next);
    setCount(c => Math.max(0, c + delta));

    if (item.isReal) {
      inFlight.current = true;
      try {
        const res = await fetch(`/api/published/${item.id}/trend`, { method: 'POST' });
        if (res.ok) {
          const d = await res.json() as { trended: boolean; trendCount: number };
          setTrended(d.trended);
          setCount(d.trendCount);
        } else {
          // revert
          setTrended(trended);
          setCount(c => Math.max(0, c - delta));
        }
      } catch {
        setTrended(trended);
        setCount(c => Math.max(0, c - delta));
      } finally { inFlight.current = false; }
    } else {
      // localStorage path for mock items
      try {
        const data   = readTrends();
        const stored = data[item.id] ?? { count: 0, trendedByViewer: false, category: item.category, title: item.title, chips: item.chips ?? [], lastActive: 0 };
        stored.count           = Math.max(0, stored.count + delta);
        stored.trendedByViewer = next;
        stored.lastActive      = Date.now();
        localStorage.setItem('pub_trends', JSON.stringify({ ...data, [item.id]: stored }));
      } catch {}
      try {
        const tagData = readTagTrends();
        [...(item.chips ?? []), item.category].forEach(t => { tagData[t] = Math.max(0, (tagData[t] ?? 0) + delta); });
        localStorage.setItem('pub_tag_trends', JSON.stringify(tagData));
      } catch {}
      try {
        const catData = readCatTrends();
        catData[item.category] = Math.max(0, (catData[item.category] ?? 0) + delta);
        localStorage.setItem('pub_cat_trends', JSON.stringify(catData));
      } catch {}
      if (next) try {
        const hist = readTrendHistory();
        hist.unshift({ postId: item.id, title: item.title, category: item.category, trendedAt: Date.now(), tags: item.chips ?? [] });
        localStorage.setItem('pub_trend_history', JSON.stringify(hist.slice(0, 200)));
      } catch {}
    }
  }, [item, trended]);

  return [count, trended, toggle];
}

/* ─── bookmark hook ──────────────────────────────────────────────── */
function useBookmark(itemId: string, category: string): [boolean, () => void] {
  const [saved, setSaved] = useState(() => {
    try { return Boolean(JSON.parse(localStorage.getItem('pub_bookmarks') || '{}')[itemId]); }
    catch { return false; }
  });
  const toggle = useCallback(() => {
    setSaved(prev => {
      const next = !prev;
      try {
        const data = JSON.parse(localStorage.getItem('pub_bookmarks') || '{}') as Record<string, unknown>;
        if (next) data[itemId] = { category, savedAt: Date.now() };
        else delete data[itemId];
        localStorage.setItem('pub_bookmarks', JSON.stringify(data));
      } catch {}
      trackCTA(next ? 'bookmark_save' : 'bookmark_remove', category);
      if (next) toast('Saved to bookmarks', 'success', '🔖');
      else toast('Removed from bookmarks', 'info', '🗑️');
      return next;
    });
  }, [itemId, category]);
  return [saved, toggle];
}

/* ─── action modal ───────────────────────────────────────────────── */
type ModalVariant = 'apply' | 'register' | 'connect';
const MODAL_CONFIG: Record<ModalVariant, { title: string; verb: string; emoji: string; successMsg: string }> = {
  apply:    { title: 'Apply Now',          verb: 'Submit Application', emoji: '💼', successMsg: 'Application sent! They will review and get back to you.' },
  register: { title: 'Register for Event', verb: 'Confirm Registration', emoji: '🎟️', successMsg: 'You\'re registered! Check your email for confirmation.' },
  connect:  { title: 'Send Connection',    verb: 'Send Request',       emoji: '🤝', successMsg: 'Connection request sent! They will review your profile.' },
};

function ActionModal({
  variant, itemTitle, itemId, uploadedByUserId, onClose,
}: { variant: ModalVariant; itemTitle: string; itemId?: string; uploadedByUserId?: string; onClose: () => void }) {
  const cfg = MODAL_CONFIG[variant];
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [stage, setStage] = useState<'form' | 'success'>('form');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || !email.trim()) { toast('Name and email are required', 'error'); return; }
    setBusy(true);
    await new Promise(r => setTimeout(r, 800));
    // Track server-side if applicable
    if (itemId) {
      const endpoint = variant === 'apply' ? `/api/public/documents/${itemId}/apply` : `/api/public/documents/${itemId}/register`;
      fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, note }),
      }).catch(() => {});
    }
    setBusy(false);
    setStage('success');
    toast(cfg.successMsg, 'success', cfg.emoji);
  };

  const inputCls = 'h-10 w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-3.5 text-[13px] text-white placeholder:text-white/25 outline-none transition focus:border-white/25 focus:bg-white/[0.07]';

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/[0.10] bg-[#111114] shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-300"
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-[18px]">{cfg.emoji}</span>
            <div>
              <p className="text-[14px] font-bold text-white">{cfg.title}</p>
              <p className="text-[11px] text-white/35 line-clamp-1 mt-0.5">{itemTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/40 transition hover:text-white/70">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-5">
          {stage === 'form' ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.15em] text-white/30">Full Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className={inputCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.15em] text-white/30">Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" className={inputCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.15em] text-white/30">
                  {variant === 'apply' ? 'Cover Note' : variant === 'connect' ? 'Brief Introduction' : 'Message (optional)'}
                </label>
                <textarea
                  value={note} onChange={e => setNote(e.target.value)} rows={3}
                  placeholder={variant === 'apply' ? 'Why are you the right fit?' : variant === 'connect' ? 'A brief intro...' : 'Any questions or notes...'}
                  className="w-full resize-none rounded-xl border border-white/[0.10] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/25 outline-none transition focus:border-white/25"
                />
              </div>
              <button
                type="button"
                disabled={busy || !name.trim() || !email.trim()}
                onClick={() => void submit()}
                className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-[13px] font-bold text-slate-950 transition hover:bg-white/90 active:scale-[0.98] disabled:opacity-40"
              >
                {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/20 border-t-slate-950" /> : <Send className="h-3.5 w-3.5" />}
                {busy ? 'Sending…' : cfg.verb}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <div>
                <p className="text-[15px] font-bold text-white">Done!</p>
                <p className="mt-1 text-[12px] text-white/45">{cfg.successMsg}</p>
              </div>
              <button onClick={onClose} className="rounded-xl border border-white/[0.09] bg-white/[0.05] px-6 py-2 text-[12px] font-semibold text-white/60 transition hover:bg-white/[0.09]">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ─── cta analytics panel ────────────────────────────────────────── */
function CtaAnalyticsPanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Record<string, Record<string, number>>>({});
  useEffect(() => {
    try { setData(JSON.parse(localStorage.getItem('pub_cta_analytics') || '{}')); } catch {}
  }, []);

  const categories = Object.keys(data).filter(k => Object.values(data[k]).some(v => v > 0));
  const totalClicks = Object.values(data).flatMap(Object.values).reduce((a, b) => a + b, 0);

  const ctaLabel: Record<string, string> = {
    like_post: 'Liked', bookmark_save: 'Saved', bookmark_remove: 'Unsaved',
    share_item: 'Shared', apply_job: 'Applied', register_event: 'Registered',
    connect_resume: 'Connected', celebrate_milestone: 'Celebrated',
    read_article: 'Read', download_doc: 'Downloaded', watch_video: 'Watched',
    vote_poll: 'Voted', take_survey: 'Surveyed', trend_post: 'Trended',
  };

  /* colour accent per category */
  const catAccent = (cat: string): string => {
    const cls = TAG_CLS[cat] ?? TAG_CLS.all;
    const textCls = cls.split(' ').find(c => c.startsWith('text-')) ?? 'text-white/50';
    const map: Record<string, string> = {
      'text-amber-400': '#fbbf24', 'text-red-400': '#f87171',
      'text-violet-400': '#a78bfa', 'text-blue-400': '#60a5fa',
      'text-emerald-400': '#34d399', 'text-sky-400': '#38bdf8',
      'text-pink-400': '#f472b6', 'text-orange-400': '#fb923c',
      'text-purple-400': '#c084fc', 'text-rose-400': '#fb7185',
      'text-indigo-400': '#818cf8', 'text-yellow-400': '#facc15',
    };
    return map[textCls] ?? 'rgba(255,255,255,0.4)';
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* backdrop — click outside to close */}
      <div className="fixed inset-0 z-[180]" onClick={onClose} />

      {/* floating panel — appears above the CTA button in bottom-left */}
      <div
        className="fixed z-[190] w-72 overflow-hidden rounded-2xl border border-white/[0.08] shadow-2xl animate-in slide-in-from-bottom-3 fade-in duration-200"
        style={{
          bottom: '112px',
          left: '12px',
          background: 'rgba(10,10,14,0.96)',
          backdropFilter: 'blur(40px) saturate(180%)',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.04) inset, 0 24px 64px rgba(0,0,0,0.7)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/20">
              <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <div>
              <p className="text-[12px] font-bold text-white/85 leading-none">CTA Activity</p>
              <p className="text-[9.5px] text-white/30 mt-0.5 leading-none">Your interactions</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {totalClicks > 0 && (
              <span className="rounded-full bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 text-[10px] font-bold tabular-nums text-white/40">
                {totalClicks}
              </span>
            )}
            <button
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.04] text-white/30 transition hover:bg-white/[0.08] hover:text-white/70"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="p-4 max-h-[320px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categories.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 py-5 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <BarChart className="h-4.5 w-4.5 text-white/20" />
              </div>
              <div>
                <p className="text-[11.5px] font-semibold text-white/35">No activity yet</p>
                <p className="text-[10px] text-white/20 mt-0.5">Interact with posts to see your stats here</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {categories.map(cat => {
                const catData = data[cat];
                const catTotal = Object.values(catData).reduce((a, b) => a + b, 0);
                const accent = catAccent(cat);
                const maxVal = Math.max(...Object.values(catData), 1);
                const sorted = Object.entries(catData).sort((a, b) => b[1] - a[1]).slice(0, 5);

                return (
                  <div key={cat}>
                    {/* category header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
                        <span className="text-[10.5px] font-bold capitalize" style={{ color: accent }}>
                          {cat}
                        </span>
                      </div>
                      <span className="text-[9.5px] font-bold tabular-nums text-white/25">{catTotal} actions</span>
                    </div>

                    {/* action rows */}
                    <div className="space-y-1.5">
                      {sorted.map(([id, count]) => {
                        const pct = (count / maxVal) * 100;
                        return (
                          <div key={id} className="flex items-center gap-2.5">
                            <span className="w-[72px] shrink-0 truncate text-[10px] font-medium text-white/35">
                              {ctaLabel[id] ?? id.replace(/_/g, ' ')}
                            </span>
                            {/* bar */}
                            <div className="flex-1 h-[3px] rounded-full bg-white/[0.05] overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, background: accent, opacity: 0.65 }}
                              />
                            </div>
                            <span className="w-4 shrink-0 text-right text-[10px] font-bold tabular-nums text-white/40">
                              {count}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* footer */}
        {totalClicks > 0 && (
          <div className="border-t border-white/[0.05] px-4 py-2.5 flex items-center justify-between">
            <span className="text-[9.5px] text-white/20">Session activity only</span>
            <button
              onClick={() => {
                try { localStorage.removeItem('pub_cta_analytics'); setData({}); } catch {}
              }}
              className="text-[9.5px] font-semibold text-white/20 hover:text-red-400/70 transition"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}

/* ─── types ─────────────────────────────────────────────────────── */
type PublishedItem = {
  id: string;
  shareId?: string;
  category: string;
  badge: string;
  title: string;
  byline: string;
  body: string;
  chips?: string[];
  stats?: { v: string; l: string }[];
  postedAt: string;
  featured?: boolean;
  isReal?: boolean;
  /** Real poll results, sent with the feed for poll rows only. */
  poll?: { counts: number[]; total: number; viewerChoice: number | null };
  // media extras
  videoUrl?: string;
  mimeType?: string | null;
  likesCount?: number;
  likedByViewer?: boolean;
  trendCount?: number;
  trendedByViewer?: boolean;
  commentsCount?: number;
  thumbnailUrl?: string;
  applicationUrl?: string;
  uploadedByUserId?: string;
  uploadedByName?: string;
  /** Avatar/logo image URL for the author — user photo or company logo */
  avatarUrl?: string;
  /** If this was published by a business page, route clicks to /businesses/[slug] */
  businessPageSlug?: string;
  // gig-specific extras
  gigData?: GigItem;
};

type GigItem = {
  id: string;
  slug: string;
  ownerUserId: string;
  ownerName: string;
  summary: string;
  category: string;
  skills: string[];
  deliverables: string[];
  budgetLabel: string;
  timelineLabel?: string;
  engagementType: string;
  locationPreference: string;
  bidMode?: string;
  bidRules?: { minBidInRupees?: number; bidDeadlineAt?: string };
  connectCount: number;
  urgent?: boolean;
  createdAt: string;
};

/* ─── tabs ───────────────────────────────────────────────────────── */
const TABS = [
  { id: 'all',          label: 'All',       icon: SlidersHorizontal },
  { id: 'featured',     label: 'Featured',  icon: Sparkles },
  { id: 'news',         label: 'News',      icon: Newspaper },
  { id: 'article',      label: 'Articles',  icon: BookOpen },
  { id: 'document',     label: 'Docs',      icon: FileText },
  { id: 'portfolio',    label: 'Portfolio', icon: Layers },
  { id: 'announcement', label: 'Announce',  icon: Megaphone },
  { id: 'job',          label: 'Jobs',      icon: Briefcase },
  { id: 'resume',       label: 'Resumes',   icon: User },
  { id: 'product',      label: 'Products',  icon: Package },
  { id: 'event',        label: 'Events',    icon: CalendarDays },
  { id: 'hackathon',    label: 'Hackathons',icon: Terminal },
  { id: 'post',      label: 'Posts',      icon: ImageIcon     },
  { id: 'poll',      label: 'Polls',      icon: ListChecks    },
  { id: 'survey',    label: 'Surveys',    icon: ClipboardList },
  { id: 'chart',     label: 'Charts',     icon: BarChart2     },
  { id: 'thread',    label: 'Threads',    icon: MessageSquare },
  { id: 'video',     label: 'Videos',     icon: Video         },
  { id: 'milestone', label: 'Milestones', icon: Award         },
  { id: 'tutorial',  label: 'Tutorials',  icon: BookMarked    },
  { id: 'gig',          label: 'Gigs',      icon: Zap },
] as const;

type TabId = (typeof TABS)[number]['id'];

/* ─── colour maps ────────────────────────────────────────────────── */
const TAG_CLS: Record<string, string> = {
  featured:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
  news:         'bg-red-500/10 text-red-400 border-red-500/20',
  article:      'bg-violet-500/10 text-violet-400 border-violet-500/20',
  document:     'bg-slate-500/10 text-slate-300 border-slate-500/20',
  portfolio:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  announcement: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  job:          'bg-blue-500/10 text-blue-400 border-blue-500/20',
  resume:       'bg-sky-500/10 text-sky-400 border-sky-500/20',
  product:      'bg-purple-500/10 text-purple-400 border-purple-500/20',
  event:        'bg-pink-500/10 text-pink-400 border-pink-500/20',
  hackathon:    'bg-orange-500/10 text-orange-400 border-orange-500/20',
  gig:          'bg-white/[0.08] text-white/70 border-white/[0.10]',
  all:          'bg-white/10 text-white/70 border-white/10',
  post:      'bg-rose-500/10 text-rose-400 border-rose-500/20',
  poll:      'bg-violet-500/10 text-violet-400 border-violet-500/20',
  survey:    'bg-amber-500/10 text-amber-400 border-amber-500/20',
  chart:     'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  thread:    'bg-sky-500/10 text-sky-400 border-sky-500/20',
  video:     'bg-red-500/10 text-red-400 border-red-500/20',
  milestone: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  tutorial:  'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
};

const ACCENT_BAR: Record<string, string> = {
  news: 'bg-red-500', article: 'bg-violet-500', document: 'bg-slate-400',
  portfolio: 'bg-emerald-500', announcement: 'bg-amber-400', job: 'bg-blue-500',
  resume: 'bg-sky-400', product: 'bg-purple-500', event: 'bg-pink-500',
  hackathon: 'bg-orange-500',
  gig: 'bg-white/30',
  post: 'bg-rose-500', poll: 'bg-violet-500', survey: 'bg-amber-400',
  chart: 'bg-emerald-500', thread: 'bg-sky-400', video: 'bg-red-500',
  milestone: 'bg-yellow-400', tutorial: 'bg-indigo-500',
};

const FEAT_GLOW: Record<string, string> = {
  news:         'from-red-500/20 via-red-900/10',
  article:      'from-violet-500/20 via-violet-900/10',
  document:     'from-slate-400/15 via-slate-700/10',
  portfolio:    'from-emerald-500/20 via-emerald-900/10',
  announcement: 'from-amber-400/20 via-amber-800/10',
  job:          'from-blue-500/20 via-blue-900/10',
  resume:       'from-sky-400/20 via-sky-800/10',
  product:      'from-purple-500/20 via-purple-900/10',
  event:        'from-pink-500/20 via-pink-900/10',
  hackathon:    'from-orange-500/20 via-orange-900/10',
  gig:          'from-white/[0.06] via-white/[0.02]',
  post:      'from-rose-500/20 via-rose-900/10',
  poll:      'from-violet-500/20 via-violet-900/10',
  survey:    'from-amber-500/20 via-amber-900/10',
  chart:     'from-emerald-500/20 via-emerald-900/10',
  thread:    'from-sky-500/20 via-sky-900/10',
  video:     'from-red-500/20 via-red-900/10',
  milestone: 'from-yellow-500/20 via-yellow-900/10',
  tutorial:  'from-indigo-500/20 via-indigo-900/10',
};

/* ─── mock data (cleared — all content comes from DB) ───────────── */
const MOCK_ITEMS: PublishedItem[] = [];

const RECENT_COUNT = 6;

/* ─── mobile bottom-nav tabs ────────────────────────────────────── */
const MOBILE_NAV = [
  { id: 'all',      label: 'All',      icon: SlidersHorizontal },
  { id: 'featured', label: 'Featured', icon: Sparkles },
  { id: 'news',     label: 'News',     icon: Newspaper },
  { id: 'job',      label: 'Jobs',     icon: Briefcase },
  { id: 'gig',      label: 'Gigs',     icon: Zap },
] as const;

/* ─── structured body helpers ───────────────────────────────────── */
const META_LINE_RE = /^[A-Za-z][A-Za-z\s\/()]{1,28}:\s+.+$/;

/** Returns true if the string looks like inline "Key: Value Key2: Value2" metadata */
function isStructuredBody(text: string): boolean {
  return ((text.match(/\b[A-Z][A-Za-z][\w\s\/()]{1,22}:\s+/g) || []).length) >= 2;
}

/** Parse "Key: Value" pairs from a single-line structured string */
function parseBodyPairs(raw: string): { key: string; value: string }[] {
  const text = raw
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\d{4}-\d{2}-\d{2}(\s*[–\-]\s*\d{4}-\d{2}-\d{2})?/g, '')
    .replace(/\s+/g, ' ').trim();
  const pairs: { key: string; value: string }[] = [];
  const re = /([A-Z][A-Za-z][\w\s\/()]{1,22}):\s+([^:]+?)(?=\s+[A-Z][A-Za-z][\w\s\/()]{1,22}:|\s*$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const k = m[1].trim(); const v = m[2].trim();
    // Skip Registration URL, Deadline, Event Dates — noisy for card view
    if (/url|deadline|dates?$/i.test(k)) continue;
    if (v && v.length > 0 && v.length < 55) pairs.push({ key: k, value: v });
  }
  return pairs;
}

/** Strip metadata and return plain prose snippet */
function getBodySnippet(raw: string, maxLen = 180): string {
  if (isStructuredBody(raw)) {
    // Single-line structured metadata — strip all key labels
    const clean = raw
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\d{4}-\d{2}-\d{2}(\s*[–\-]\s*\d{4}-\d{2}-\d{2})?/g, '')
      .replace(/[A-Z][A-Za-z][\w\s\/()]{1,22}:\s+/g, '')
      .replace(/\s+/g, ' ').trim();
    return clean.length > maxLen ? `${clean.slice(0, maxLen).trimEnd()}…` : clean;
  }
  const prose = raw
    .split(/\n+/)
    .filter(l => l.trim() && !META_LINE_RE.test(l.trim()))
    .join(' ');
  return prose.length > maxLen ? `${prose.slice(0, maxLen).trimEnd()}…` : prose;
}

/** Renders body as structured key-value chips OR plain prose.
 *  `proseOnly` — Task 10: the card renders category metadata separately, so the
 *  body slot shows the description instead of a generic key-value dump. */
function BodyDisplay({ body, searchQuery = '', proseOnly = false }: { body: string; searchQuery?: string; proseOnly?: boolean }) {
  if (!body) return null;

  if (!proseOnly && isStructuredBody(body)) {
    const pairs = parseBodyPairs(body);
    if (pairs.length >= 2) {
      /* Icon hints for common keys */
      const KEY_ICON: Record<string, string> = {
        organiser: '👤', organizer: '👤', host: '👤', by: '👤',
        'themes / tracks': '🎯', themes: '🎯', tracks: '🎯', track: '🎯', topic: '🎯',
        'prize pool': '🏆', prize: '🏆', reward: '🏆',
        mode: '📍', venue: '📍', location: '📍',
        'team size': '👥', team: '👥',
        hackathon: '⚡', event: '📅',
        time: '🕐',
      };
      const getIcon = (k: string) => KEY_ICON[k.toLowerCase()] ?? '';

      return (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {pairs.slice(0, 7).map(({ key, value }) => (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {getIcon(key) && <span style={{ fontSize: 9, lineHeight: 1 }}>{getIcon(key)}</span>}
              <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: 'rgba(255,255,255,0.28)' }}>
                {key.length > 16 ? key.slice(0, 15) + '…' : key}
              </span>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.65)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                {value}
              </span>
            </span>
          ))}
        </div>
      );
    }
  }

  /* Plain prose */
  const snippet = proseOnly ? getFeedDescription(body) : getBodySnippet(body);
  if (!snippet) return null;
  return (
    <p className="mt-1.5 text-[13px] leading-relaxed text-white/50 line-clamp-3">
      {searchQuery ? highlight(snippet, searchQuery) : snippet}
    </p>
  );
}

/* ─── helpers ───────────────────────────────────────────────────── */
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)       return 'Just now';
  if (diff < 3_600_000)    return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)   return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7*86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short' });
}

function scoreItem(item: PublishedItem, q: string): number {
  const ql = q.toLowerCase();
  const terms = ql.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const t of terms) {
    if (item.title.toLowerCase().includes(t))  score += 10;
    if (item.badge.toLowerCase().includes(t))  score += 5;
    if (item.byline.toLowerCase().includes(t)) score += 3;
    if (item.body.toLowerCase().includes(t))   score += 2;
    if ((item.chips ?? []).some(c => c.toLowerCase().includes(t))) score += 4;
    if (item.category.toLowerCase().includes(t)) score += 3;
  }
  if (item.title.toLowerCase().includes(ql)) score += 8;
  if (item.isReal) score += 2;
  return score;
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q.trim()) return text;
  const terms = q.trim().split(/\s+/).filter(Boolean);
  const regex = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((p, i) =>
    regex.test(p)
      ? <mark key={i} className="rounded bg-amber-500/25 px-0.5 text-amber-200 not-italic">{p}</mark>
      : p
  );
}

/* ─── avatar — monochrome, no category colours ───────────────────── */
const AVATAR_CLS = 'bg-white/[0.08] text-white/55 ring-1 ring-white/[0.07]';

/* ─── Task 14 discovery readers ───────────────────────────────────────
 * All of these read fields the item already carries — the labelled body
 * lines the publish flow writes (and the cards display), existing gigData,
 * existing tags and the existing author name. Nothing is invented.
 */
/** City / venue / work location, '' when the item carries none. */
function itemLocation(item: PublishedItem): string {
  if (item.gigData?.locationPreference) return item.gigData.locationPreference;
  return readFeedLabelledValue(item.body ?? '', ['Job Location', 'Location', 'Venue', 'City']);
}
/** Employment / work type for jobs. */
function itemEmploymentType(item: PublishedItem): string {
  return readFeedLabelledValue(item.body ?? '', ['Employment Type', 'Job Type', 'Type', 'Work Mode', 'Mode']);
}
/** Tutorial difficulty — labelled body value, else the badge/tag convention. */
function itemTutorialLevel(item: PublishedItem): string {
  const labelled = readFeedLabelledValue(item.body ?? '', ['Difficulty', 'Level']);
  if (labelled) return labelled;
  return /beginner|intermediate|advanced/i.exec(`${item.badge} ${(item.chips ?? []).join(' ')}`)?.[0] ?? '';
}
/** Numeric price for products — labelled `Price:` first, then legacy byline. */
function itemPriceValue(item: PublishedItem): number {
  const raw = readFeedLabelledValue(item.body ?? '', ['Price', 'Pricing']) || item.byline;
  const m = raw.match(/[₹$€£]\s*([\d,]+)/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
}
/** Event start date from the labelled `Date:` / `Event Dates:` value. */
function itemEventDate(item: PublishedItem): Date | null {
  const raw = readFeedLabelledValue(item.body ?? '', ['Event Dates?', 'Date']);
  if (!raw) return null;
  const iso = raw.match(/\d{4}-\d{2}-\d{2}/);
  const d = new Date(iso ? iso[0] : raw.split(/\s*[–-]\s*/)[0]);
  return Number.isNaN(d.getTime()) ? null : d;
}
const eqi = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/* ─── trend button ───────────────────────────────────────────────── */
function TrendButton({ item }: { item: PublishedItem }) {
  const [count, trended, toggle] = useTrend(item);
  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        void toggle();
        if (!trended) toast('Trending! 🔥', 'success', '🔥');
        trackCTA('trend_post', item.category);
      }}
      className={`flex items-center gap-1.5 text-[12px] font-semibold transition-all ${trended ? 'text-orange-400' : 'text-white/30 hover:text-orange-400'}`}
    >
      <TrendingUp className={`h-4 w-4 transition-transform ${trended ? 'scale-110' : ''}`} />
      <span className="tabular-nums">{count > 0 ? (count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)) : ''}</span>
    </button>
  );
}

/* ─── right trending panel ───────────────────────────────────────── */
function TrendingPanel({
  allItems,
  onTagClick,
  onCategoryClick,
  setSortTrending,
}: {
  allItems: PublishedItem[];
  onTagClick: (tag: string) => void;
  onCategoryClick: (cat: string) => void;
  setSortTrending: () => void;
}) {
  const [trends,    setTrends]    = useState<Record<string, TrendEntry>>({});
  const [tagTrends, setTagTrends] = useState<Record<string, number>>({});
  const [catTrends, setCatTrends] = useState<Record<string, number>>({});
  const [history,   setHistory]   = useState<TrendHistoryEntry[]>([]);

  useEffect(() => {
    const load = () => {
      setTrends(readTrends());
      setTagTrends(readTagTrends());
      setCatTrends(readCatTrends());
      setHistory(readTrendHistory());
    };
    load();
    const iv = setInterval(load, 10_000);
    return () => clearInterval(iv);
  }, []);

  /* top news by total engagement (likes + comments + trends), real items only */
  const topNews = useMemo(() => {
    const eng = (i: PublishedItem) => (i.likesCount ?? 0) + (i.commentsCount ?? 0) + (i.trendCount ?? 0);
    return allItems
      .filter(i => i.category === 'news' && i.isReal)
      .sort((a, b) => eng(b) - eng(a))
      .slice(0, 4);
  }, [allItems]);

  /* top trending tags */
  const topTags = useMemo(() =>
    Object.entries(tagTrends).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 10),
    [tagTrends]
  );

  /* posts ranked by trend count */
  const topTrendingPosts = useMemo(() =>
    allItems
      .filter(i => (trends[i.id]?.count ?? 0) > 0)
      .sort((a, b) => (trends[b.id]?.count ?? 0) - (trends[a.id]?.count ?? 0))
      .slice(0, 5),
    [allItems, trends]
  );

  /* category distribution */
  const categoryStats = useMemo(() => {
    const counts: Record<string, number> = {};
    allItems.forEach(i => { counts[i.category] = (counts[i.category] ?? 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [allItems]);

  const totalTrends = Object.values(catTrends).reduce((a, b) => a + b, 0);

  return (
    <div className="h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="p-4 space-y-7 pb-20">

        {/* ── Top News ── */}
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-3">Top News</p>
          <div className="space-y-3.5">
            {topNews.length === 0 && <p className="text-[11px] text-white/20">No news yet</p>}
            {topNews.map((item, i) => {
              const eng = (item.likesCount ?? 0) + (item.commentsCount ?? 0) + (item.trendCount ?? 0);
              const label = feedLabel(item);
              return (
                <Link key={item.id} href={`/published/${item.shareId || item.id}`} className="group flex items-start gap-2.5">
                  <span className="text-[11px] font-bold text-white/20 tabular-nums mt-0.5 w-4 shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    {label ? (
                      <p className="text-[12px] font-semibold text-white/65 leading-snug line-clamp-2 group-hover:text-white transition-colors">{label}</p>
                    ) : null}
                    <p className={`text-[10.5px] text-white/25 ${label ? 'mt-0.5' : ''}`}>
                      {eng > 0 ? `${eng >= 1000 ? `${(eng / 1000).toFixed(1)}k` : eng} engagements · ` : ''}{timeAgo(item.postedAt)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ── Trending Now ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Trending</p>
              {totalTrends > 0 && (
                <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[9.5px] font-bold text-orange-400/80">
                  {totalTrends} 🔥
                </span>
              )}
            </div>
            {totalTrends > 0 && (
              <button
                type="button"
                onClick={setSortTrending}
                className="text-[10.5px] font-semibold text-orange-400/60 hover:text-orange-400 transition"
              >
                Sort feed →
              </button>
            )}
          </div>

          {topTrendingPosts.length > 0 ? (
            <div className="space-y-3.5 mb-4">
              {topTrendingPosts.map((item, i) => {
                const label = feedLabel(item);
                return (
                <Link key={item.id} href={`/published/${item.id}`} className="group flex items-start gap-2.5">
                  <span className="text-[11px] font-bold text-orange-400/40 tabular-nums mt-0.5 w-4 shrink-0">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    {label ? (
                      <p className="text-[12px] font-semibold text-white/65 leading-snug line-clamp-2 group-hover:text-white transition-colors">{label}</p>
                    ) : null}
                    <div className={`flex items-center gap-1 ${label ? 'mt-0.5' : ''}`}>
                      <TrendingUp className="h-3 w-3 text-orange-400/50" />
                      <span className="text-[10.5px] font-bold text-orange-400/60">{trends[item.id]?.count} trending</span>
                    </div>
                  </div>
                </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-white/20 mb-4 leading-relaxed">
              Hit 🔥 on any post to add it to trending. Top trends appear here.
            </p>
          )}

          {/* Top tags */}
          {topTags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {topTags.map(([tag, count]) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onTagClick(tag)}
                  className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] border border-white/[0.07] px-2.5 py-1 text-[10.5px] font-medium text-white/45 hover:bg-white/[0.09] hover:text-white/80 transition"
                >
                  #{tag}
                  <span className="text-orange-400/70 font-bold tabular-nums">{count}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-white/15">Trending tags show here once posts are trended.</p>
          )}
        </section>

        {/* ── Top Categories ── */}
        <section>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-3">Categories</p>
          <div className="space-y-1">
            {categoryStats.map(([cat, count]) => {
              const tab        = TABS.find(t => t.id === cat);
              const Icon       = tab?.icon ?? Newspaper;
              const trendCount = catTrends[cat] ?? 0;
              const maxCount   = Math.max(...categoryStats.map(([, c]) => c), 1);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onCategoryClick(cat)}
                  className="group w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-white/[0.04] transition"
                >
                  <Icon className="h-3.5 w-3.5 text-white/25 shrink-0" />
                  <span className="text-[12px] font-medium text-white/50 group-hover:text-white/80 transition flex-1 capitalize truncate">
                    {tab?.label ?? cat}
                  </span>
                  {/* mini bar */}
                  <div className="w-16 h-1 rounded-full bg-white/[0.05] overflow-hidden shrink-0">
                    <div className="h-full rounded-full bg-white/20" style={{ width: `${(count / maxCount) * 100}%` }} />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 min-w-[36px] justify-end">
                    {trendCount > 0 && (
                      <span className="flex items-center gap-0.5 text-[9.5px] font-bold text-orange-400/60">
                        <TrendingUp className="h-2.5 w-2.5" />{trendCount}
                      </span>
                    )}
                    <span className="text-[10.5px] font-semibold text-white/25 tabular-nums">{count}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Your Trend History ── */}
        {history.length > 0 && (
          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-3">Your Trends</p>
            <div className="space-y-3">
              {history.slice(0, 6).map((h, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <TrendingUp className="h-3.5 w-3.5 text-orange-400/35 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] font-semibold text-white/50 leading-snug line-clamp-1">
                      {isJunkTitle({ title: h.title }) ? (h.category || 'Post') : h.title}
                    </p>
                    <p className="text-[10px] text-white/22 mt-0.5 capitalize">{h.category} · {timeAgo(new Date(h.trendedAt).toISOString())}</p>
                  </div>
                </div>
              ))}
              {history.length > 6 && (
                <p className="text-[10.5px] text-white/20">+{history.length - 6} more in history</p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ─── hide filenames / generic defaults; photo caption = body only ── */
const JUNK_TITLE_RE = /\.\w{2,5}$/;
const GENERIC_TITLES = new Set(['post', 'poll', 'document', 'file', 'image', 'photo', 'video', 'survey', 'article', 'upload']);
function isJunkTitle(item: { title: string }): boolean {
  const t = item.title.trim().toLowerCase();
  return JUNK_TITLE_RE.test(t) || GENERIC_TITLES.has(t);
}
function hasRealCaption(body?: string): boolean {
  return Boolean(body && body.trim());
}
/** Sidebar label — posts: body/caption only, never title/filename. '' if nothing real. */
function feedLabel(item: { title: string; body?: string; category?: string }): string {
  if (item.category === 'post') {
    return hasRealCaption(item.body) ? getBodySnippet(item.body!, 80) : '';
  }
  if (!isJunkTitle(item)) return item.title;
  return hasRealCaption(item.body) ? getBodySnippet(item.body!, 80) : '';
}

/* ─── featured card — same structure as PublishedCard + featured badge ── */
function FeaturedCard({ item }: { item: PublishedItem }) {
  const [saved, toggleSaved] = useBookmark(item.id, item.category);
  const TabIcon = TABS.find(t => t.id === item.category)?.icon ?? Newspaper;

  const bylineParts = item.byline.split(' · ').map(s => s.trim());
  const authorName  = (item.uploadedByName || bylineParts[0]) ?? 'Docrud';
  const authorMeta  = bylineParts.slice(1).join(' · ');
  const initials    = authorName.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const profileHref = item.businessPageSlug
    ? `/businesses/${item.businessPageSlug}`
    : item.uploadedByUserId ? `/u/${item.uploadedByUserId}` : null;
  const avatarInner = item.avatarUrl
    ? <img src={item.avatarUrl} alt={authorName} className="h-full w-full rounded-full object-cover" />
    : (initials.slice(0, 2) || <TabIcon className="h-3.5 w-3.5 opacity-60" />);

  return (
    <article className="group py-5 px-4 sm:px-0">
      {/* ── header ── */}
      <div className="flex items-center gap-3 mb-3.5">
        {profileHref ? (
          <Link href={profileHref} onClick={e => e.stopPropagation()} className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold ${AVATAR_CLS} hover:opacity-80 transition`}>
            {avatarInner}
          </Link>
        ) : (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold ${AVATAR_CLS}`}>
            {avatarInner}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {profileHref ? (
              <Link href={profileHref} onClick={e => e.stopPropagation()} className="text-[13.5px] font-semibold text-white leading-tight truncate hover:text-white/80 transition">
                {authorName}
              </Link>
            ) : (
              <span className="text-[13.5px] font-semibold text-white leading-tight truncate">{authorName}</span>
            )}
            {/* Presence — green only while the author is genuinely online now. */}
            <PresenceDot userId={item.uploadedByUserId} size="sm" />
            {/* Featured badge — clean amber pill */}
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-[2.5px] text-[9px] font-bold uppercase tracking-[0.08em] shrink-0"
              style={{ background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.22)', color: 'rgba(253,224,71,0.85)' }}>
              <span style={{ fontSize: 8, lineHeight: 1 }}>✦</span> Featured
            </span>
          </div>
          <p className="text-[11px] text-white/35 mt-0.5 truncate">
            {item.badge}{authorMeta ? ` · ${authorMeta}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] text-white/25">{timeAgo(item.postedAt)}</span>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); toggleSaved(); }}
            className={`transition ${saved ? 'text-white/70' : 'text-white/25 hover:text-white/60'}`}
          >
            {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── thumbnail — full bleed, same as PublishedCard ── */}
      {item.thumbnailUrl && (
        <Link href={`/published/${item.id}`} className="block mb-3.5 -mx-4 sm:mx-0 sm:rounded-xl overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.thumbnailUrl} alt={item.category === 'post' || isJunkTitle(item) ? '' : item.title} className="w-full h-auto transition-transform duration-500 group-hover:scale-[1.01]" loading="lazy" decoding="async" />
        </Link>
      )}

      {/* ── content — photo posts: body/caption only, never title ── */}
      <Link href={`/published/${item.id}`} className="block">
        {item.category !== 'post' && !isJunkTitle(item) && (
          <h3 className="text-[15px] font-bold leading-snug tracking-tight text-white line-clamp-2 group-hover:text-white/85 transition-colors">
            {item.title}
          </h3>
        )}
        <BodyDisplay body={item.body} />
      </Link>

      {/* ── stats / chips ── */}
      {item.stats ? (
        <div className="mt-4 pt-4 border-t border-white/[0.06] flex items-center gap-5">
          {item.stats.slice(0, 3).map(s => (
            <div key={s.l}>
              <p className="text-[13px] font-bold text-white/80 tabular-nums">{s.v}</p>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-white/25 mt-0.5">{s.l}</p>
            </div>
          ))}
          <Link href={`/published/${item.id}`} className="ml-auto text-[11px] font-semibold text-white/25 opacity-0 group-hover:opacity-100 transition hover:text-white/60 flex items-center gap-1">
            Read <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      ) : item.chips ? (
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          {item.chips.slice(0, 5).map(c => (
            <span key={c} className="rounded-full bg-white/[0.05] border border-white/[0.07] px-2.5 py-0.5 text-[10.5px] text-white/38">{c}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

/* ─── upraise mini button ─────────────────────────────────────────── */
function UpraiseMiniButton({ itemId, uploadedByUserId, category }: { itemId: string; uploadedByUserId?: string; category: string }) {
  const [count, setCount] = useState(0);
  const [upraised, setUpraised] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uploadedByUserId) return;
    fetch(`/api/upraise/${uploadedByUserId}`)
      .then(r => r.json())
      .then((d: { count?: number; hasUpraised?: boolean }) => {
        setCount(d.count ?? 0);
        setUpraised(d.hasUpraised ?? false);
      })
      .catch(() => {});
  }, [uploadedByUserId]);

  const toggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!uploadedByUserId || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/upraise/${uploadedByUserId}`, { method: 'POST' });
      const d = await res.json() as { count?: number; upraised?: boolean };
      setCount(d.count ?? count);
      setUpraised(d.upraised ?? !upraised);
      trackCTA('upraise_profile', category);
      toast(d.upraised ? 'Profile upraised! 🚀' : 'Upraise removed', d.upraised ? 'success' : 'info', d.upraised ? '🚀' : '');
    } catch {
      toast('Failed to upraise', 'error');
    } finally {
      setBusy(false);
    }
  };

  const baseCls   = 'inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.10] px-3.5 text-[12px] font-semibold text-white/55 transition hover:border-white/[0.20] hover:text-white/90';
  const activeCls = 'inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.15] px-3.5 text-[12px] font-semibold text-white/80 transition';

  return (
    <button type="button" onClick={toggle} disabled={busy} className={upraised ? activeCls : baseCls}>
      <TrendingUp className="h-3.5 w-3.5" />
      Upraise {count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

/* ─── feed post card (Task 9 shared shell) ───────────────────────── */
function PublishedCard({ item, searchQuery }: { item: PublishedItem; searchQuery: string }) {
  const [saved, toggleSaved] = useBookmark(item.id, item.category);
  const [modal, setModal]    = useState<ModalVariant | null>(null);
  const rx1 = usePostReactions(
    item.id,
    { likesCount: item.likesCount, likedByViewer: item.likedByViewer, reactions: (item as { reactions?: import('@/components/social/PostReactionButton').PostReactionSummary }).reactions },
    { live: Boolean(item.isReal) },
  );
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(item.commentsCount ?? 0);
  const cat = item.category;
  /* Preserve pre-Task-9 URL construction on /published cards. */
  const detailHref = `/published/${item.id}`;

  useEffect(() => { if (item.commentsCount !== undefined) setCommentCount(item.commentsCount); }, [item.commentsCount]);

  const primCls  = 'inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-4 text-[12px] font-bold text-[#0D0D0F] transition hover:bg-white/90 active:scale-[0.98]';
  const ghostCls = 'inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.10] px-3.5 text-[12px] font-semibold text-white/55 transition hover:border-white/[0.20] hover:text-white/90';
  const iconCls  = 'flex h-8 w-8 items-center justify-center rounded-full text-white/35 transition hover:bg-white/[0.06] hover:text-white/70';

  const showTitle = shouldShowFeedTitle(cat, item.title);

  /* Task 10 — category-relevant metadata built from fields the item already has. */
  const catMeta = buildCategoryMetaChips({
    category: cat,
    title: item.title,
    body: item.body,
    byline: item.byline,
    chips: item.chips,
    stats: item.stats,
  });
  /* Adopt the Task 10 hierarchy (description + metadata) only when the item has
     both. Otherwise BodyDisplay keeps its existing rendering and no content is
     lost or duplicated. */
  const useCategoryMeta = catMeta.length > 0 && hasFeedDescription(item.body);

  return (
    <>
      {modal && <ActionModal variant={modal} itemTitle={item.title} itemId={item.id} uploadedByUserId={item.uploadedByUserId} onClose={() => setModal(null)} />}

      <PublishedFeedCard
        item={item}
        timeLabel={timeAgo(item.postedAt)}
        subtitle={`${item.badge} · ${timeAgo(item.postedAt)}`}
        detailHref={detailHref}
        showPresence
        headerRight={
          <>
            <button
              type="button"
              onClick={e => { e.stopPropagation(); toggleSaved(); }}
              className={`transition ${saved ? 'text-white/70' : 'text-white/25 hover:text-white/60'}`}
            >
              {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            </button>
            {/* Task 10 header options — existing handlers only */}
            <FeedCardMenu
              items={[
                { label: 'Share link', icon: <Share2 className="h-3.5 w-3.5" />, onSelect: () => { void shareItem(item.id, item.title); trackCTA('share_item', cat); } },
                { label: 'Open in new tab', icon: <ExternalLink className="h-3.5 w-3.5" />, onSelect: () => window.open(detailHref, '_blank', 'noopener,noreferrer') },
                { label: saved ? 'Remove bookmark' : 'Save', icon: saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />, onSelect: toggleSaved },
              ]}
            />
          </>
        }
        renderTitle={
          showTitle ? (
            <h3 className="text-[15px] font-bold leading-snug tracking-tight text-white line-clamp-2 transition-colors group-hover:text-white/85">
              {searchQuery ? highlight(item.title, searchQuery) : item.title}
            </h3>
          ) : null
        }
        /* Preserve BodyDisplay (structured chips OR highlighted prose). When
           category metadata is available it moves to the metadata section, so
           the body slot shows the description/summary instead. */
        renderMainBody={<BodyDisplay body={item.body} searchQuery={searchQuery} proseOnly={useCategoryMeta} />}
        renderMetadata={useCategoryMeta ? <FeedMetaChipRow chips={catMeta} /> : null}
        /* Social proof (from origin/main) — existing who-reacted modal and this
           card's existing comment panel. */
        beforeActions={
          <PostSocialProofRow
            postId={item.id}
            socialProof={(item as { socialProof?: import('@/lib/social-proof').PostSocialProof | null }).socialProof}
            onOpenComments={() => setCommentsOpen(true)}
          />
        }
        actions={
          <>
            <PostReactionButton c={rx1} />
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setCommentsOpen(v => !v); }}
              className={`flex items-center gap-1.5 text-[12px] font-semibold transition ${commentsOpen ? 'text-white/70' : 'text-white/30 hover:text-white/60'}`}
            >
              <MessageSquare className="h-4 w-4" />
              <span>{commentCount > 0 ? (commentCount >= 1000 ? `${(commentCount/1000).toFixed(1)}k` : String(commentCount)) : '0'}</span>
            </button>
            <TrendButton item={item} />
            <div className="flex items-center gap-2 ml-auto">
              {(cat === 'news' || cat === 'article') && (
                <Link href={detailHref} className={ghostCls} onClick={e => { e.stopPropagation(); trackCTA('read_article', cat); }}>
                  Read <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {cat === 'document' && (
                <>
                  <button type="button" onClick={e => { e.stopPropagation(); trackCTA('download_doc', cat); window.open(detailHref, '_blank'); }} className={ghostCls}>
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                  <button type="button" onClick={e => { e.stopPropagation(); window.open(detailHref, '_blank'); }} className={iconCls}>
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </>
              )}
              {cat === 'portfolio' && (
                <Link href={detailHref} className={ghostCls} onClick={e => { e.stopPropagation(); trackCTA('view_portfolio', cat); }}>
                  View Work <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {cat === 'announcement' && (
                <Link href={detailHref} className={ghostCls} onClick={e => e.stopPropagation()}>
                  Read <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {cat === 'job' && (
                <button type="button" onClick={e => {
                  e.stopPropagation(); trackCTA('apply_job', cat);
                  if (item.applicationUrl) {
                    try {
                      const raw = localStorage.getItem('pub_job_applications') || '[]';
                      const apps = JSON.parse(raw) as Array<{itemId: string; title: string; appliedAt: number; url: string}>;
                      apps.unshift({ itemId: item.id, title: item.title, appliedAt: Date.now(), url: item.applicationUrl });
                      localStorage.setItem('pub_job_applications', JSON.stringify(apps.slice(0, 200)));
                    } catch {}
                    window.open(item.applicationUrl, '_blank', 'noopener,noreferrer');
                    toast('Redirecting…', 'success', '💼');
                  } else setModal('apply');
                }} className={primCls}>
                  Apply Now <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
              {cat === 'resume' && (
                <>
                  <Link href={detailHref} className={ghostCls} onClick={e => e.stopPropagation()}>View Profile <ArrowRight className="h-3.5 w-3.5" /></Link>
                  <UpraiseMiniButton itemId={item.id} uploadedByUserId={item.uploadedByUserId} category={cat} />
                </>
              )}
              {cat === 'product' && (() => {
                const shopUrl  = item.body?.match(/^Shop URL:\s*(.+)$/im)?.[1]?.trim() || '';
                const whatsapp = item.body?.match(/^WhatsApp:\s*(.+)$/im)?.[1]?.trim() || '';
                return shopUrl ? (
                  <button type="button" onClick={e => { e.stopPropagation(); trackCTA('shop_product', cat); window.open(shopUrl, '_blank', 'noopener,noreferrer'); }} className={primCls}>
                    Shop Now <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                ) : whatsapp ? (
                  <button type="button" onClick={e => { e.stopPropagation(); window.open(`https://wa.me/${whatsapp.replace(/\D/g,'')}`, '_blank'); }} className={ghostCls}>
                    <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                  </button>
                ) : (
                  <Link href={detailHref} className={primCls} onClick={e => e.stopPropagation()}>View Product <ArrowRight className="h-3.5 w-3.5" /></Link>
                );
              })()}
              {cat === 'event' && (() => {
                const regUrl = item.body?.match(/^Registration URL:\s*(.+)$/im)?.[1]?.trim() || '';
                return (
                  <button type="button" onClick={e => {
                    e.stopPropagation(); trackCTA('register_event', cat);
                    try { const raw = localStorage.getItem('pub_registrations') || '[]'; const regs = JSON.parse(raw) as Array<{itemId:string;title:string;category:string;registeredAt:number}>; if (!regs.find(r=>r.itemId===item.id)){regs.unshift({itemId:item.id,title:item.title,category:cat,registeredAt:Date.now()});localStorage.setItem('pub_registrations',JSON.stringify(regs.slice(0,200)));} } catch {}
                    if (regUrl) { window.open(regUrl,'_blank','noopener,noreferrer'); toast('Redirecting…','success','🎟️'); } else setModal('register');
                  }} className={primCls}>Register <ArrowRight className="h-3.5 w-3.5" /></button>
                );
              })()}
              {cat === 'hackathon' && (() => {
                const regUrl = item.body?.match(/^Registration URL:\s*(.+)$/im)?.[1]?.trim() || '';
                return (
                  <button type="button" onClick={e => {
                    e.stopPropagation(); trackCTA('register_hackathon', cat);
                    try { const raw = localStorage.getItem('pub_registrations') || '[]'; const regs = JSON.parse(raw) as Array<{itemId:string;title:string;category:string;registeredAt:number}>; if (!regs.find(r=>r.itemId===item.id)){regs.unshift({itemId:item.id,title:item.title,category:cat,registeredAt:Date.now()});localStorage.setItem('pub_registrations',JSON.stringify(regs.slice(0,200)));} } catch {}
                    if (regUrl) { window.open(regUrl,'_blank','noopener,noreferrer'); toast('Redirecting…','success','🏆'); } else setModal('register');
                  }} className={primCls}>Register <ArrowRight className="h-3.5 w-3.5" /></button>
                );
              })()}
              {/* Only shown when a real playable source exists — never a fake player. */}
              {cat === 'video' && (() => {
                const src = sanitizeCtaUrl(item.videoUrl);
                if (!src) return null;
                return (
                  <a
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => { e.stopPropagation(); trackCTA('watch_video', cat); }}
                    className={primCls}
                  >
                    Watch <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                );
              })()}
              {/* Points at the existing publication page — no separate tutorial route exists. */}
              {cat === 'tutorial' && (
                <Link href={detailHref} className={primCls} onClick={e => { e.stopPropagation(); trackCTA('start_tutorial', cat); }}>
                  Start Tutorial <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {cat !== 'news' && cat !== 'article' && cat !== 'document' && cat !== 'portfolio' &&
               cat !== 'announcement' && cat !== 'job' && cat !== 'resume' && cat !== 'product' &&
               cat !== 'event' && cat !== 'hackathon' && cat !== 'tutorial' &&
               !(cat === 'video' && sanitizeCtaUrl(item.videoUrl)) && (
                <Link href={detailHref} className={ghostCls} onClick={e => e.stopPropagation()}>
                  Open <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
              <button type="button" onClick={e => { e.stopPropagation(); void shareItem(item.id, item.title); trackCTA('share_item', cat); }} className={iconCls}>
                <Share2 className="h-4 w-4" />
              </button>
            </div>
          </>
        }
        footer={
          commentsOpen && item.isReal ? (
            <CardCommentPanel
              item={item}
              onClose={() => setCommentsOpen(false)}
              onCommentCountChange={setCommentCount}
            />
          ) : null
        }
      />
    </>
  );
}


/* ─── gig card ──────────────────────────────────────────────────── */
function GigCard({ item }: { item: PublishedItem }) {
  const [saved, toggleSaved] = useBookmark(item.id, item.category);
  const [bidStage, setBidStage] = useState<'idle' | 'form' | 'success'>('idle');
  const [bidAmt, setBidAmt] = useState('');
  const [bidTimeline, setBidTimeline] = useState('');
  const [bidPitch, setBidPitch] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const g = item.gigData;
  /* Gigs published through the wizard carry no gigData (that comes from the gigs
     service). Without this fallback such a gig renders nothing at all, breaking
     "content appears in the feed using its category-specific card". The shared
     card already shows the gig's price/delivery/location metadata. */
  if (!g) return <PublishedCard item={item} searchQuery="" />;

  const engLabel = (e: string) => ({ one_time: 'One-time', ongoing: 'Ongoing', retainer: 'Retainer' }[e] ?? e);

  const displayName = item.uploadedByName || item.byline.split(' · ')[0] || 'Docrud User';
  const initials    = displayName.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const profileHref = item.businessPageSlug
    ? `/businesses/${item.businessPageSlug}`
    : item.uploadedByUserId ? `/u/${item.uploadedByUserId}` : null;

  const submitBid = async () => {
    if (!bidAmt || !bidPitch.trim()) { setErr('Amount and pitch are required.'); return; }
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/gigs/bids', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gigId: g.id, amountInRupees: Number(bidAmt), timelineLabel: bidTimeline, note: bidPitch }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      setBidStage('success');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to submit bid.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="group py-5 px-4 sm:px-0">
      {/* Author header */}
      <div className="flex items-center gap-3 mb-3.5">
        {profileHref ? (
          <Link href={profileHref} onClick={e => e.stopPropagation()} className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold ${AVATAR_CLS} hover:opacity-80 transition`}>
            {item.avatarUrl ? <img src={item.avatarUrl} alt={displayName} className="h-full w-full rounded-full object-cover" /> : initials}
          </Link>
        ) : (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold ${AVATAR_CLS}`}>
            {item.avatarUrl ? <img src={item.avatarUrl} alt={displayName} className="h-full w-full rounded-full object-cover" /> : initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {profileHref ? (
              <Link href={profileHref} onClick={e => e.stopPropagation()} className="text-[13.5px] font-semibold text-white leading-tight truncate hover:text-white/80 transition">{displayName}</Link>
            ) : (
              <span className="text-[13.5px] font-semibold text-white leading-tight truncate">{displayName}</span>
            )}
            {g.urgent && <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[9px] font-bold text-rose-400 shrink-0">Urgent</span>}
          </div>
          <p className="text-[11px] text-white/35 mt-0.5 truncate">
            {g.category} · {engLabel(g.engagementType)} · {timeAgo(g.createdAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); toggleSaved(); }}
          className={`transition shrink-0 ${saved ? 'text-white/70' : 'text-white/25 hover:text-white/60'}`}
        >
          {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </button>
      </div>

      {/* Title */}
      <Link href={`/gigs/${g.slug}`} className="block mb-2.5">
        <h3 className="text-[15px] font-bold leading-snug tracking-[-0.025em] text-white line-clamp-2 group-hover:text-white/85 transition-colors">{g.summary}</h3>
      </Link>

      {/* Meta */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/40 mb-3">
        {g.budgetLabel && <span className="font-semibold text-white/65">₹ {g.budgetLabel}</span>}
        {g.locationPreference && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{g.locationPreference}</span>}
        {g.timelineLabel && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{g.timelineLabel}</span>}
        {g.connectCount > 0 && <span>{g.connectCount} bids</span>}
      </div>

      {/* Skills */}
      {g.skills.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {g.skills.slice(0, 5).map(s => (
            <span key={s} className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-0.5 text-[10.5px] text-white/40">{s}</span>
          ))}
        </div>
      )}

      {/* Deliverables */}
      {g.deliverables.length > 0 && (
        <div className="space-y-1 mb-3">
          {g.deliverables.slice(0, 2).map((d, i) => (
            <div key={i} className="flex items-start gap-2 text-[11.5px] text-white/35">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-white/20" />{d}
            </div>
          ))}
        </div>
      )}

      {/* Bid rules */}
      {g.bidMode === 'bidding' && g.bidRules && (
        <div className="mb-3 rounded-[12px] border border-white/[0.05] bg-white/[0.025] px-3 py-2 text-[11px] text-white/35">
          Open bidding{g.bidRules.minBidInRupees ? ` · Min ₹${g.bidRules.minBidInRupees.toLocaleString('en-IN')}` : ''}
          {g.bidRules.bidDeadlineAt ? ` · Deadline ${new Date(g.bidRules.bidDeadlineAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
        </div>
      )}

      {/* Actions */}
      <div className="mt-3.5 pt-3.5 border-t border-white/[0.05]">
        {bidStage === 'idle' && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBidStage('form')}
              className="flex h-9 flex-1 items-center justify-center gap-2 rounded-[13px] bg-white text-[13px] font-bold text-[#0D0D0F] transition hover:bg-white/90 active:scale-[0.98]"
            >
              <Zap className="h-3.5 w-3.5" />
              {g.bidMode === 'bidding' ? 'Place a Bid' : 'Apply Now'}
            </button>
            <Link
              href={`/gigs/${g.slug}`}
              className="flex h-9 items-center justify-center rounded-[13px] border border-white/[0.08] bg-white/[0.04] px-4 text-[12px] font-semibold text-white/50 transition hover:bg-white/[0.07] hover:text-white/70"
            >
              Details
            </Link>
          </div>
        )}

        {bidStage === 'form' && (
          <div className="space-y-3">
            {g.bidMode === 'bidding' ? (
              <>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Your Bid (₹) *</label>
                  <input type="number" value={bidAmt} onChange={e => setBidAmt(e.target.value)}
                    placeholder={g.bidRules?.minBidInRupees ? `Min ₹${g.bidRules.minBidInRupees}` : 'Amount in ₹'}
                    className="h-9 w-full rounded-[11px] border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20" />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Timeline</label>
                  <input value={bidTimeline} onChange={e => setBidTimeline(e.target.value)}
                    placeholder="e.g. 2 weeks"
                    className="h-9 w-full rounded-[11px] border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20" />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Budget (₹)</label>
                <input type="number" value={bidAmt} onChange={e => setBidAmt(e.target.value)}
                  placeholder="Your expected amount"
                  className="h-9 w-full rounded-[11px] border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20" />
              </div>
            )}
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">Why you? *</label>
              <textarea value={bidPitch} onChange={e => setBidPitch(e.target.value)} rows={3}
                placeholder="Briefly explain your approach and why you're the right fit…"
                className="w-full resize-none rounded-[11px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-white/20 outline-none focus:border-white/20" />
            </div>
            {err && <p className="text-[11.5px] text-rose-300/70">{err}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy || !bidAmt || !bidPitch.trim()}
                onClick={() => void submitBid()}
                className="flex h-9 flex-1 items-center justify-center rounded-[11px] bg-white text-[13px] font-bold text-[#0D0D0F] transition hover:bg-white/90 disabled:opacity-40"
              >
                {busy ? 'Submitting…' : 'Submit'}
              </button>
              <button
                type="button"
                onClick={() => { setBidStage('idle'); setErr(''); }}
                className="h-9 rounded-[11px] border border-white/[0.08] bg-white/[0.04] px-4 text-[12px] font-semibold text-white/50 transition hover:bg-white/[0.07]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {bidStage === 'success' && (
          <div className="flex items-center gap-3 rounded-[13px] border border-white/[0.07] bg-white/[0.04] px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-white/50" />
            <div>
              <p className="text-[13px] font-semibold text-white/80">Submitted successfully</p>
              <p className="text-[11px] text-white/35">The poster will review your bid and get back to you.</p>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

/* ─── inline comment panel (shared by both card types) ──────────── */
type CardComment = {
  id: string;
  author: string;
  text: string;
  createdAt: string;
  userId?: string;
  parentId?: string | null;
  likesCount: number;
  likedByViewer: boolean;
  isOwner?: boolean;
  replies?: CardComment[];
};

function CardCommentPanel({
  item,
  onClose,
  onCommentCountChange,
}: {
  item: PublishedItem;
  onClose: () => void;
  onCommentCountChange?: (count: number) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [comments, setComments] = useState<CardComment[]>([]);
  const [loading, setLoading] = useState(true);

  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [replyTo, setReplyTo] = useState<{
    id: string;
    author: string;
  } | null>(null);

  const [replyText, setReplyText] = useState('');

  const [deletingCommentId, setDeletingCommentId] =
    useState<string | null>(null);

  /*
   * Convert flat comments from API into nested comments.
   */
const buildCommentTree = useCallback(
    (items: CardComment[]): CardComment[] => {
      const byId: Record<string, CardComment> = {};
      const roots: CardComment[] = [];

      for (const comment of items) {
        byId[comment.id] = {
          ...comment,
          replies: [],
        };
      }

      for (const comment of Object.values(byId)) {
        if (comment.parentId && byId[comment.parentId]) {
          byId[comment.parentId].replies!.push(comment);
        } else {
          roots.push(comment);
        }
      }

      return roots;
    },
    [],
  );

  /*
   * Count all comments including nested replies.
   */
  const countAllComments = useCallback(
    (list: CardComment[]): number => {
      return list.reduce(
        (total, comment) =>
          total +
          1 +
          (comment.replies
            ? countAllComments(comment.replies)
            : 0),
        0,
      );
    },
    [],
  );

  /*
   * Load comments.
   */
  useEffect(() => {
    let cancelled = false;

    if (!item.isReal) {
      setLoading(false);
      return;
    }

    setLoading(true);

    fetch(`/api/public/published/${item.id}/comments`, {
      method: 'GET',
      cache: 'no-store',
    })
      .then(async response => {
        if (!response.ok) {
          return { comments: [] };
        }

        return (await response.json()) as {
          comments?: CardComment[];
        };
      })
      .then(data => {
        if (cancelled) return;

        const incomingComments = Array.isArray(data.comments)
          ? data.comments
          : [];

        setComments(buildCommentTree(incomingComments));
      })
      .catch(() => {
        if (!cancelled) {
          setComments([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [item.id, item.isReal, buildCommentTree]);

  /*
   * Close panel when clicking outside.
   */
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener(
      'mousedown',
      handleOutsideClick,
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleOutsideClick,
      );
    };
  }, [onClose]);

  /*
   * Escape closes the panel.
   */
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  /*
   * Submit comment or reply.
   */
  const submitComment = useCallback(
    async (parentId?: string) => {
      const body = parentId
        ? replyText.trim()
        : text.trim();

      if (!body || submitting) {
        return;
      }

      if (!item.isReal) {
        toast(
          'Comments are unavailable for this post.',
          'info',
        );
        return;
      }

      setSubmitting(true);

      try {
        const response = await fetch(
          `/api/public/published/${item.id}/comments`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              text: body,
              ...(parentId ? { parentId } : {}),
            }),
          },
        );

        const data = (await response
          .json()
          .catch(() => null)) as
          | { comments?: CardComment[]; error?: string }
          | null;

        if (!response.ok) {
          toast(
            data?.error || 'Unable to add comment.',
            'error',
          );
          return;
        }

       const updatedComments = Array.isArray(
          data?.comments,
        )
          ? data.comments
          : [];

        const nextTree = buildCommentTree(updatedComments);
        setComments(nextTree);
        onCommentCountChange?.(
          countAllComments(nextTree),
        );

        if (parentId) {
          setReplyText('');
          setReplyTo(null);
        } else {
          setText('');
          inputRef.current?.focus();
        }
      } catch {
        toast(
          'Something went wrong while adding the comment.',
          'error',
        );
      } finally {
        setSubmitting(false);
      }
    },
 [
      buildCommentTree,
      countAllComments,
      item.id,
      item.isReal,
      onCommentCountChange,
      replyText,
      submitting,
      text,
    ],
  );

  /*
   * Like/unlike comment.
   */
  const likeComment = useCallback(
    async (commentId: string) => {
      if (!item.isReal) {
        return;
      }

      let previousLiked = false;

      const updateComments = (
        list: CardComment[],
      ): CardComment[] => {
        return list.map(comment => {
          if (comment.id === commentId) {
            previousLiked = comment.likedByViewer;

            const nextLiked =
              !comment.likedByViewer;

            return {
              ...comment,
              likedByViewer: nextLiked,
              likesCount: nextLiked
                ? comment.likesCount + 1
                : Math.max(
                    0,
                    comment.likesCount - 1,
                  ),
            };
          }

          if (comment.replies?.length) {
            return {
              ...comment,
              replies: updateComments(
                comment.replies,
              ),
            };
          }

          return comment;
        });
      };

      setComments(prev => updateComments(prev));

      try {
        const response = await fetch(
          `/api/public/published/${item.id}/comments/${commentId}/like`,
          {
            method: 'POST',
          },
        );

        if (!response.ok) {
          throw new Error('Like request failed');
        }

        const data = (await response.json()) as {
          liked?: boolean;
          likesCount?: number;
        };

        if (
          typeof data.liked === 'boolean' &&
          typeof data.likesCount === 'number'
        ) {
          const syncComments = (
            list: CardComment[],
          ): CardComment[] => {
            return list.map(comment => {
              if (comment.id === commentId) {
                return {
                  ...comment,
                  likedByViewer: data.liked!,
                  likesCount: Math.max(
                    0,
                    data.likesCount!,
                  ),
                };
              }

              if (comment.replies?.length) {
                return {
                  ...comment,
                  replies: syncComments(
                    comment.replies,
                  ),
                };
              }

              return comment;
            });
          };

          setComments(prev =>
            syncComments(prev),
          );
        }
      } catch {
        // Revert optimistic update.
        const revertComments = (
          list: CardComment[],
        ): CardComment[] => {
          return list.map(comment => {
            if (comment.id === commentId) {
              return {
                ...comment,
                likedByViewer: previousLiked,
                likesCount: previousLiked
                  ? comment.likesCount + 1
                  : Math.max(
                      0,
                      comment.likesCount - 1,
                    ),
              };
            }

            if (comment.replies?.length) {
              return {
                ...comment,
                replies: revertComments(
                  comment.replies,
                ),
              };
            }

            return comment;
          });
        };

        setComments(prev =>
          revertComments(prev),
        );

        toast(
          'Unable to update comment like.',
          'error',
        );
      }
    },
    [item.id, item.isReal],
  );

  /*
   * Delete comment.
   *
   * Backend must verify ownership.
   */
  const deleteComment = useCallback(
    async (commentId: string) => {
      if (
        deletingCommentId ||
        !item.isReal
      ) {
        return;
      }

      const confirmed = window.confirm(
        'Are you sure you want to delete this comment?',
      );

      if (!confirmed) {
        return;
      }

      setDeletingCommentId(commentId);

      try {
        const response = await fetch(
          `/api/public/published/${item.id}/comments/${commentId}`,
          {
            method: 'DELETE',
          },
        );

        const data = (await response
          .json()
          .catch(() => null)) as
          | {
              error?: string;
              comments?: CardComment[];
            }
          | null;

        if (!response.ok) {
          toast(
            data?.error ||
              'Unable to delete comment.',
            'error',
          );
          return;
        }

        /*
         * If backend returns updated comments,
         * use them. Otherwise remove locally.
         */
      if (Array.isArray(data?.comments)) {
          const nextTree = buildCommentTree(data.comments);
          setComments(nextTree);
          onCommentCountChange?.(
            countAllComments(nextTree),
          );
        } else {
          const removeComment = (
            list: CardComment[],
          ): CardComment[] => {
            return list
              .filter(
                comment =>
                  comment.id !== commentId,
              )
              .map(comment => ({
                ...comment,
                replies: comment.replies
                  ? removeComment(
                      comment.replies,
                    )
                  : [],
              }));
          };

          setComments(prev => {
            const next = removeComment(prev);
            onCommentCountChange?.(
              countAllComments(next),
            );
            return next;
          });
        }

        /*
         * Close reply box if deleting the
         * comment currently being replied to.
         */
        if (replyTo?.id === commentId) {
          setReplyTo(null);
          setReplyText('');
        }

        toast(
          'Comment deleted.',
          'success',
          '🗑️',
        );
      } catch {
        toast(
          'Something went wrong while deleting the comment.',
          'error',
        );
      } finally {
        setDeletingCommentId(null);
      }
    },
       [
      buildCommentTree,
      countAllComments,
      deletingCommentId,
      item.id,
      item.isReal,
      onCommentCountChange,
      replyTo?.id,
    ],
  );

  /*
   * Relative time.
   */
  const ago = useCallback((iso: string) => {
    const timestamp = new Date(iso).getTime();

    if (!Number.isFinite(timestamp)) {
      return '';
    }

    const difference =
      Math.max(0, Date.now() - timestamp);

    if (difference < 60_000) {
      return 'now';
    }

    if (difference < 3_600_000) {
      return `${Math.floor(
        difference / 60_000,
      )}m`;
    }

    if (difference < 86_400_000) {
      return `${Math.floor(
        difference / 3_600_000,
      )}h`;
    }

    return `${Math.floor(
      difference / 86_400_000,
    )}d`;
  }, []);

  /*
   * Render one comment recursively.
   */
  const renderComment = (
    comment: CardComment,
    depth = 0,
  ): React.ReactNode => {
    return (
      <div
        key={comment.id}
        className={
          depth > 0
            ? 'ml-7 mt-2'
            : 'mt-3'
        }
      >
        <div className="flex gap-2">
          {/* Avatar */}
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white/60">
            {(comment.author || 'AN')
              .slice(0, 2)
              .toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            {/* Header */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] font-semibold text-white/80">
                {comment.author}
              </span>

              <span className="text-[10px] text-white/25">
                {ago(comment.createdAt)}
              </span>
            </div>

            {/* Text */}
            <p className="mt-0.5 break-words text-[12px] leading-relaxed text-white/65">
              {comment.text}
            </p>

            {/* Actions */}
            <div className="mt-1 flex items-center gap-3">
              {/* Like */}
              <button
                type="button"
                onClick={() =>
                  void likeComment(comment.id)
                }
                className={`flex items-center gap-1 text-[10px] font-semibold transition ${
                  comment.likedByViewer
                    ? 'text-rose-400'
                    : 'text-white/25 hover:text-rose-400'
                }`}
                aria-label={
                  comment.likedByViewer
                    ? 'Unlike comment'
                    : 'Like comment'
                }
              >
                <Heart
                  className={`h-3 w-3 ${
                    comment.likedByViewer
                      ? 'fill-current'
                      : ''
                  }`}
                />

                {comment.likesCount > 0 && (
                  <span>
                    {comment.likesCount}
                  </span>
                )}
              </button>

              {/* Reply */}
              {depth === 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setReplyTo(
                      replyTo?.id ===
                        comment.id
                        ? null
                        : {
                            id: comment.id,
                            author:
                              comment.author,
                          },
                    )
                  }
                  className="text-[10px] font-semibold text-white/25 transition hover:text-white/55"
                >
                  Reply
                </button>
              )}

              {/* Delete — ONLY OWNER */}
              {comment.isOwner && (
                <button
                  type="button"
                  disabled={
                    deletingCommentId ===
                    comment.id
                  }
                  onClick={() =>
                    void deleteComment(
                      comment.id,
                    )
                  }
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/25 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Delete comment"
                  aria-label="Delete comment"
                >
                  {deletingCommentId ===
                  comment.id ? (
                    <span className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-red-400" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}

                  Delete
                </button>
              )}
            </div>

            {/* Reply input */}
            {replyTo?.id === comment.id && (
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  autoFocus
                  value={replyText}
                  onChange={event =>
                    setReplyText(
                      event.target.value,
                    )
                  }
                  onKeyDown={event => {
                    if (
                      event.key ===
                        'Enter' &&
                      !event.shiftKey
                    ) {
                      event.preventDefault();

                      void submitComment(
                        comment.id,
                      );
                    }

                    if (
                      event.key ===
                      'Escape'
                    ) {
                      setReplyTo(null);
                      setReplyText('');
                    }
                  }}
                  placeholder={`Reply to ${comment.author}…`}
                  className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.07] px-2.5 py-1.5 text-[11px] text-white outline-none placeholder:text-white/25 focus:border-white/20"
                />

                <button
                  type="button"
                  disabled={
                    !replyText.trim() ||
                    submitting
                  }
                  onClick={() =>
                    void submitComment(
                      comment.id,
                    )
                  }
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/50 transition hover:bg-white/20 disabled:opacity-30"
                  aria-label="Send reply"
                >
                  <Send className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Replies */}
        {comment.replies?.map(reply =>
          renderComment(
            reply,
            depth + 1,
          ),
        )}
      </div>
    );
  };

  return (
    <div
      ref={panelRef}
      className="mt-3 space-y-0.5 rounded-2xl border border-white/[0.08] bg-[#0f0f14] p-4"
    >
      {/* Comment list */}
      <div className="max-h-52 space-y-0.5 overflow-y-auto pr-0.5 scrollbar-none">
        {loading && (
          <p className="py-3 text-center text-[11px] text-white/30">
            Loading…
          </p>
        )}

        {!loading &&
          comments.length === 0 && (
            <p className="py-3 text-center text-[11px] text-white/25">
              No comments yet. Be the
              first!
            </p>
          )}

        {!loading &&
          comments.map(comment =>
            renderComment(comment),
          )}
      </div>

      {/* New comment */}
      <div className="mt-3 border-t border-white/[0.06] pt-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={event =>
              setText(event.target.value)
            }
            onKeyDown={event => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey
              ) {
                event.preventDefault();

                void submitComment();
              }
            }}
            placeholder="Write a comment…"
            disabled={
              submitting || !item.isReal
            }
            className="flex-1 rounded-xl border border-white/[0.07] bg-white/[0.07] px-3 py-2 text-[12px] text-white outline-none transition placeholder:text-white/25 focus:border-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          />

          <button
            type="button"
            disabled={
              !text.trim() ||
              submitting ||
              !item.isReal
            }
            onClick={() =>
              void submitComment()
            }
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60 transition hover:bg-white/20 disabled:opacity-30"
            aria-label="Send comment"
          >
            {submitting ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── post card — instagram-style ───────────────────────────────── */
function PostCard({ item, searchQuery }: { item: PublishedItem; searchQuery: string }) {
  const [liked, setLiked] = useState(item.likedByViewer ?? false);
  const rx2 = usePostReactions(
    item.id,
    { likesCount: item.likesCount, likedByViewer: item.likedByViewer, reactions: (item as { reactions?: import('@/components/social/PostReactionButton').PostReactionSummary }).reactions },
    { live: Boolean(item.isReal) },
  );
  const [bookmarked, toggleBookmarked] = useBookmark(item.id, item.category);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(item.commentsCount ?? 0);
  const likeStat    = item.stats?.find(s => s.l === 'likes');
  const localLikes  = (item.likesCount ?? parseInt(likeStat?.v?.replace(/[k,]/g, v => v === 'k' ? '000' : '') ?? '0', 10)) || 0;
  const [likeCount, setLikeCount] = useState(localLikes);
  const likeInFlight = useRef(false);
  // Use lean feed thumbnailUrl (R2 CDN or /api/public/thumbnail) — never refetch base64 blobs
  const thumbUrl = item.thumbnailUrl && !item.thumbnailUrl.startsWith('data:') ? item.thumbnailUrl : null;

  useEffect(() => { setLiked(item.likedByViewer ?? false); }, [item.likedByViewer]);
  useEffect(() => { setLikeCount(item.likesCount ?? localLikes); }, [item.likesCount]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (item.commentsCount !== undefined) setCommentCount(item.commentsCount); }, [item.commentsCount]);


  const displayName = item.uploadedByName || item.byline.split(' · ')[0];
  const initials    = displayName.split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()??'').join('');
  const profileHref = item.businessPageSlug
    ? `/businesses/${item.businessPageSlug}`
    : item.uploadedByUserId ? `/u/${item.uploadedByUserId}` : null;
  const postAvatarInner = item.avatarUrl
    ? <img src={item.avatarUrl} alt={displayName} className="h-full w-full rounded-full object-cover" loading="lazy" decoding="async" />
    : (initials || <ImageIcon className="h-3.5 w-3.5 opacity-60" />);

  return (
    <article className="group py-5 px-4 sm:px-0">
      {/* header */}
      <div className="flex items-center gap-3 mb-3.5">
        {/* clickable avatar */}
        {profileHref ? (
          <Link href={profileHref} onClick={e => e.stopPropagation()} className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold ${AVATAR_CLS} hover:opacity-80 transition`}>
            {postAvatarInner}
          </Link>
        ) : (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold ${AVATAR_CLS}`}>
            {postAvatarInner}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {/* clickable name */}
          {profileHref ? (
            <Link href={profileHref} onClick={e => e.stopPropagation()} className="text-[13.5px] font-semibold text-white hover:text-white/80 transition">
              {displayName}
            </Link>
          ) : (
            <span className="text-[13.5px] font-semibold text-white">{displayName}</span>
          )}
          {/* Presence — green only while the author is genuinely online now. */}
          <span className="ml-2 inline-flex align-middle"><PresenceDot userId={item.uploadedByUserId} size="sm" /></span>
          <p className="text-[11px] text-white/35 mt-0.5">{item.badge} · {timeAgo(item.postedAt)}</p>
        </div>
        <button type="button" onClick={e=>{e.stopPropagation();toggleBookmarked();}} className={`transition ${bookmarked?'text-white/70':'text-white/25 hover:text-white/60'}`}>
          {bookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </button>
      </div>

      {/* image — use feed thumbnailUrl (CDN / proxy), not per-card base64 fetch */}
      {thumbUrl && (
        <Link href={`/published/${item.id}`} className="block mb-3.5 -mx-4 sm:mx-0 sm:rounded-xl overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbUrl}
            alt=""
            /* Task 15 — same small-screen media cap as the shared card shell. */
            className="w-full h-auto max-h-[70vh] object-cover sm:max-h-none"
            loading="lazy"
            decoding="async"
          />
        </Link>
      )}

      {/* caption = body/notes only — never auto title/filename for photo posts */}
      <Link href={`/published/${item.id}`} className="block">
        {item.category !== 'post' && !isJunkTitle(item) && (
          <p className="text-[13.5px] font-semibold text-white leading-snug line-clamp-2 group-hover:text-white/85 transition-colors">
            {searchQuery ? highlight(item.title, searchQuery) : item.title}
          </p>
        )}
        {hasRealCaption(item.body) && (
          <p className={`text-[13px] leading-relaxed text-white/50 line-clamp-2 ${item.category !== 'post' && !isJunkTitle(item) ? 'mt-1.5' : ''}`}>
            {searchQuery ? highlight(getBodySnippet(item.body), searchQuery) : getBodySnippet(item.body)}
          </p>
        )}
      </Link>

      {/* Social proof — existing who-reacted modal, existing comment panel. */}
      <PostSocialProofRow
        postId={item.id}
        socialProof={(item as { socialProof?: import('@/lib/social-proof').PostSocialProof | null }).socialProof}
        onOpenComments={() => setCommentsOpen(true)}
      />

      {/* engagement */}
      <div className="flex items-center gap-4 mt-3.5 pt-3.5 border-t border-white/[0.05]">
        <PostReactionButton c={rx2} />
        <button
          type="button"
          onClick={e => { e.preventDefault(); e.stopPropagation(); setCommentsOpen(v => !v); }}
          className={`flex items-center gap-1.5 text-[12px] font-semibold transition ${commentsOpen ? 'text-white/70' : 'text-white/30 hover:text-white/60'}`}
        >
          <MessageSquare className="h-4 w-4" />
          {commentCount > 0 ? (commentCount >= 1000 ? `${(commentCount/1000).toFixed(1)}k` : String(commentCount)) : '0'}
        </button>
        <TrendButton item={item} />
        <button type="button" onClick={e=>{e.preventDefault();e.stopPropagation();void shareItem(item.id,item.title);trackCTA('share_item',item.category);}} className="text-white/30 hover:text-white/70 transition ml-auto">
          <Share2 className="h-4 w-4" />
        </button>
      </div>

    {/* inline comment panel */}
        {commentsOpen && item.isReal && (
          <CardCommentPanel
            item={item}
            onClose={() => setCommentsOpen(false)}
            onCommentCountChange={setCommentCount}
          />
        )}
      </article>
  );
}

/* ─── poll card ──────────────────────────────────────────────────── */
function PollCard({ item }: { item: PublishedItem }) {
  /* Results come from the server with the feed payload. Local state only ever
     holds what the server has confirmed — a vote is never shown as counted
     until the write succeeds. */
  const [counts, setCounts] = useState<number[]>(item.poll?.counts ?? []);
  const [total, setTotal] = useState(item.poll?.total ?? 0);
  const [voted, setVoted] = useState<number | null>(item.poll?.viewerChoice ?? null);
  const [saving, setSaving] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    setCounts(item.poll?.counts ?? []);
    setTotal(item.poll?.total ?? 0);
    setVoted(item.poll?.viewerChoice ?? null);
  }, [item.poll]);

  const options = (item.chips ?? []).map(o => o.split(/\s*·\s*/)[0].trim()).filter(Boolean);
  const isClosed = item.badge === 'Closed';
  const daysLeft = item.stats?.find(s => s.l === 'days left')?.v;
  /* Votes are only recorded against real publications. */
  const canVote = Boolean(item.isReal) && !isClosed && !saving;
  const showResults = voted !== null || isClosed;

  const castVote = async (index: number) => {
    if (!canVote) return;
    setSaving(true);
    setVoteError(null);
    try {
      const res = await fetch(`/api/published/${item.id}/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ option: index }),
      });
      if (res.status === 401) { setVoteError('Sign in to vote.'); return; }
      if (!res.ok) { setVoteError('Could not record your vote.'); return; }
      const data = await res.json() as { counts: number[]; total: number; viewerChoice: number | null };
      setCounts(data.counts);
      setTotal(data.total);
      setVoted(data.viewerChoice);
      trackCTA('vote_poll', 'poll');
    } catch {
      setVoteError('Could not record your vote.');
    } finally {
      setSaving(false);
    }
  };

  const topCount = counts.length ? Math.max(...counts) : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111116] border-white/[0.06] p-4 transition-all hover:border-white/[0.12] relative group">
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${isClosed ? 'border-white/[0.08] bg-white/[0.04] text-white/35' : 'bg-violet-500/10 text-violet-400 border-violet-500/20'}`}>
          <ListChecks className="h-2.5 w-2.5" />{item.badge}
        </span>
        {daysLeft && !isClosed && <span className="text-[10px] text-white/30">{daysLeft} days left</span>}
        <span className="ml-auto text-[10px] text-white/25">{total} {total === 1 ? 'vote' : 'votes'}</span>
      </div>
      <p className="text-[13.5px] font-bold leading-snug text-white tracking-[-0.02em] mb-3">{item.title}</p>
      <div className="space-y-2">
        {options.map((label, i) => {
          const count = counts[i] ?? 0;
          const pctNum = total > 0 ? Math.round((count / total) * 100) : 0;
          const isVoted = voted === i;
          const isWinner = showResults && count > 0 && count === topCount;
          return (
            <button
              key={i}
              type="button"
              disabled={!canVote}
              aria-pressed={isVoted}
              onClick={() => castVote(i)}
              className={`relative w-full overflow-hidden rounded-[10px] border text-left transition ${
                isVoted ? 'border-violet-500/30 bg-violet-500/10' :
                'border-white/[0.06] bg-white/[0.03] hover:border-white/[0.10] hover:bg-white/[0.05]'
              } ${canVote ? 'cursor-pointer' : 'cursor-default'}`}
            >
              {showResults && (
                <div
                  className={`absolute inset-y-0 left-0 ${isWinner ? 'bg-violet-500/15' : 'bg-white/[0.04]'}`}
                  style={{ width: `${pctNum}%` }}
                />
              )}
              <div className="relative flex items-center justify-between px-3 py-2">
                <span className={`text-[12px] font-semibold ${isVoted ? 'text-violet-300' : 'text-white/65'}`}>{label}</span>
                {showResults && (
                  <span className={`text-[11px] font-bold tabular-nums ${isWinner ? 'text-violet-300' : 'text-white/30'}`}>{pctNum}%</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {voteError && (
        <p className="mt-2.5 text-[10.5px] text-amber-400/80 text-center">{voteError}</p>
      )}
      {!voteError && voted !== null && (
        <p className="mt-2.5 text-[10.5px] text-violet-400/60 text-center">Your vote is saved. Tap it again to undo.</p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-white/35 line-clamp-2">{getBodySnippet(item.body)}</p>
      <Link
        href={`/published/${item.id}`}
        className="mt-3 flex items-center justify-end gap-1 text-[11px] font-semibold text-white/20 opacity-0 group-hover:opacity-100 transition hover:text-white/60"
      >
        View full poll <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

/* ─── survey card ────────────────────────────────────────────────── */
function SurveyCard({ item }: { item: PublishedItem }) {
  const responseStat = item.stats?.find(s => s.l === 'responses')?.v ?? '0';
  const questionStat = item.stats?.find(s => s.l === 'questions')?.v;
  const timeStat = item.chips?.find(c => c.includes('min'));
  const isOpen = item.badge !== 'Closed';
  return (
    <Link
      href={`/published/${item.id}`}
      className="group block overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-all hover:border-white/[0.12] hover:bg-[#13131b]"
      onClick={() => trackCTA('take_survey', 'survey')}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${isOpen ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'border-white/[0.08] text-white/35'}`}>
          <ClipboardList className="h-2.5 w-2.5" />{item.badge || 'Survey'}
        </span>
        {timeStat && <span className="text-[10px] text-white/30">~{timeStat}</span>}
        <span className="ml-auto text-[10px] text-white/25">{responseStat} responses</span>
      </div>
      <h3 className="text-[13.5px] font-bold leading-snug text-white tracking-[-0.02em] group-hover:text-amber-100/90 transition-colors">{item.title}</h3>
      <p className="mt-1.5 text-[11px] text-white/35">{item.byline}</p>
      <p className="mt-2.5 text-[12px] leading-relaxed text-white/45 line-clamp-2">{getBodySnippet(item.body)}</p>
      {item.chips && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.chips.slice(0,4).map(c => (
            <span key={c} className="rounded-lg border border-amber-500/10 bg-amber-500/[0.05] px-2 py-0.5 text-[10px] text-amber-400/60">{c}</span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-3">
        <div className="flex items-center gap-3 text-[11px] text-white/30">
          {questionStat && <span>{questionStat} questions</span>}
          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{responseStat}</span>
        </div>
        <span className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-[11px] font-semibold text-amber-400 transition group-hover:bg-amber-500/20">
          {isOpen ? 'Take Survey →' : 'View Results →'}
        </span>
      </div>
    </Link>
  );
}

/* ─── chart card ─────────────────────────────────────────────────── */
function ChartCard({ item }: { item: PublishedItem }) {
  const statLine = item.stats?.slice(0,2) ?? [];
  const bars = (item.chips ?? []).slice(0,4).map(c => {
    const m = c.match(/\+?(\d+)%/);
    return { label: c.split(' ')[0], pct: m ? parseInt(m[1]) : 40 };
  });
  const maxPct = Math.max(...bars.map(b => b.pct), 1);
  return (
    <Link
      href={`/published/${item.id}`}
      className="group block overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111116] border-white/[0.06] p-4 transition-all hover:border-white/[0.12] hover:bg-[#13131b]"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
          <BarChart2 className="h-2.5 w-2.5" />{item.badge}
        </span>
        <span className="ml-auto text-[10px] text-white/25">{timeAgo(item.postedAt)}</span>
      </div>
      <h3 className="text-[13px] font-bold leading-snug text-white tracking-[-0.02em] line-clamp-2">{item.title}</h3>
      <p className="mt-1 text-[10.5px] text-white/30">{item.byline}</p>
      {/* Mini bar chart */}
      {bars.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {bars.map((bar, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-20 shrink-0 truncate text-[9.5px] text-white/35">{bar.label}</span>
              <div className="flex-1 h-4 rounded-full bg-white/[0.04] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500/60 to-emerald-400/40"
                  style={{ width: `${(bar.pct / maxPct) * 100}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-[9.5px] font-bold tabular-nums text-emerald-400/70">+{bar.pct}%</span>
            </div>
          ))}
        </div>
      )}
      {statLine.length > 0 && (
        <div className="mt-3 flex gap-4 border-t border-white/[0.05] pt-3">
          {statLine.map(s => (
            <div key={s.l}>
              <p className="text-[12px] font-bold text-white/80 tabular-nums">{s.v}</p>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-white/25">{s.l}</p>
            </div>
          ))}
          <span className="ml-auto self-center inline-flex items-center gap-1 text-[11px] font-semibold text-white/20 opacity-0 group-hover:opacity-100 transition">
            Explore <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      )}
    </Link>
  );
}

/* ─── thread card — instagram-style ─────────────────────────────── */
function ThreadCard({ item, searchQuery }: { item: PublishedItem; searchQuery: string }) {
  const [threadBookmarked, toggleThreadBookmark] = useBookmark(item.id, item.category);
  const partsStat  = item.stats?.find(s => s.l === 'parts')?.v;
  const likesStat  = item.stats?.find(s => s.l === 'likes')?.v;
  const readsStat  = item.stats?.find(s => s.l === 'reads')?.v;
  const firstPoint = item.body.split('\n\n')[0] ?? item.body;

  const bylineParts  = item.byline.split(' · ').map(s => s.trim());
  const authorName   = (item.uploadedByName || bylineParts[0]) ?? 'Author';
  const initials     = authorName.split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()??'').join('');
  const threadHref   = item.businessPageSlug ? `/businesses/${item.businessPageSlug}` : item.uploadedByUserId ? `/u/${item.uploadedByUserId}` : null;
  const threadAvatar = item.avatarUrl
    ? <img src={item.avatarUrl} alt={authorName} className="h-full w-full rounded-full object-cover" />
    : (initials || <MessageSquare className="h-3.5 w-3.5 opacity-60" />);

  return (
    <article className="group py-5 px-4 sm:px-0">
      {/* header */}
      <div className="flex items-center gap-3 mb-3.5">
        {threadHref ? (
          <Link href={threadHref} onClick={e=>e.stopPropagation()} className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold ${AVATAR_CLS} hover:opacity-80 transition`}>
            {threadAvatar}
          </Link>
        ) : (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold ${AVATAR_CLS}`}>
            {threadAvatar}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {threadHref ? (
            <Link href={threadHref} onClick={e=>e.stopPropagation()} className="text-[13.5px] font-semibold text-white hover:text-white/80 transition">{authorName}</Link>
          ) : (
            <span className="text-[13.5px] font-semibold text-white">{authorName}</span>
          )}
          <p className="text-[11px] text-white/35 mt-0.5">
            {item.badge}{partsStat ? ` · ${partsStat} parts` : ''} · {timeAgo(item.postedAt)}
          </p>
        </div>
        <button type="button" onClick={e=>{e.stopPropagation();toggleThreadBookmark();}} className={`transition ${threadBookmarked?'text-white/70':'text-white/25 hover:text-white/60'}`}>
          {threadBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </button>
      </div>

      {/* content */}
      <Link href={`/published/${item.id}`} className="block">
        {!isJunkTitle(item) && (
          <h3 className="text-[15px] font-bold leading-snug tracking-tight text-white line-clamp-2 group-hover:text-white/85 transition-colors">
            {searchQuery ? highlight(item.title, searchQuery) : item.title}
          </h3>
        )}
        <p className={`text-[13px] leading-relaxed text-white/50 line-clamp-3 border-l-2 border-white/[0.08] pl-3 ${!isJunkTitle(item) ? 'mt-2' : ''}`}>
          {firstPoint}
        </p>
      </Link>

      {/* engagement */}
      <div className="flex items-center gap-4 mt-3.5 pt-3.5 border-t border-white/[0.05]">
        {readsStat && <span className="flex items-center gap-1.5 text-[12px] text-white/30"><Eye className="h-4 w-4" />{readsStat}</span>}
        {likesStat && <span className="flex items-center gap-1.5 text-[12px] text-white/30"><Heart className="h-4 w-4" />{likesStat}</span>}
        <Link href={`/published/${item.id}`} className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/35 hover:text-white/70 transition">
          Read thread <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

/* ─── video card ─────────────────────────────────────────────────── */
function VideoCard({ item, searchQuery }: { item: PublishedItem; searchQuery: string }) {
  const [saved, toggleVideoSave] = useBookmark(item.id, item.category);
  const [thumbError, setThumbError] = useState(false);
  const viewsStat = item.stats?.find(s => s.l === 'views')?.v;
  const duration = item.stats?.find(s => s.l === 'duration')?.v ?? item.chips?.find(c => /\d+[hm]/.test(c));

  const ytMatch = item.videoUrl?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  const ytId = ytMatch?.[1] ?? null;
  const vimeoMatch = item.videoUrl?.match(/vimeo\.com\/(\d+)/);
  const vimeoId = vimeoMatch?.[1] ?? null;
  const ytThumb = ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null;

  return (
    <div className="group overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111116] border-white/[0.06] transition-all hover:border-white/[0.12]">
      {/* thumbnail */}
      <Link href={`/published/${item.id}`} className="block relative h-36 w-full overflow-hidden">
        {ytThumb && !thumbError ? (
          <img
            src={ytThumb}
            alt={item.title}
            className="h-full w-full object-cover"
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-red-500/20 via-rose-500/10 to-orange-500/20 flex items-center justify-center">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(239,68,68,0.15),transparent_70%)]" />
          </div>
        )}
        {/* play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 border border-white/20 backdrop-blur-sm group-hover:bg-black/60 transition">
            <Play className="h-5 w-5 text-white fill-white ml-0.5" />
          </div>
        </div>
        {/* platform badge */}
        {ytId && (
          <span className="absolute top-2 left-2 rounded-md bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">YouTube</span>
        )}
        {vimeoId && !ytId && (
          <span className="absolute top-2 left-2 rounded-md bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white">Vimeo</span>
        )}
        {duration && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{duration}</span>
        )}
      </Link>
      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="inline-flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            <Video className="h-2.5 w-2.5" />{item.badge}
          </span>
          {viewsStat && <span className="ml-auto text-[10px] text-white/25">{viewsStat} views</span>}
        </div>
        <Link href={`/published/${item.id}`}>
          <h3 className="text-[13px] font-bold leading-snug text-white tracking-[-0.02em] line-clamp-2 hover:text-white/80 transition">
            {searchQuery ? highlight(item.title, searchQuery) : item.title}
          </h3>
        </Link>
        <p className="mt-1 text-[10.5px] text-white/30 line-clamp-1">{item.byline}</p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-white/40 line-clamp-2">{getBodySnippet(item.body)}</p>
        {item.chips && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {item.chips.slice(0,3).map(c => (
              <span key={c} className="rounded-lg bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/35">{c}</span>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-2 border-t border-white/[0.05] pt-3">
          <Link
            href={`/published/${item.id}`}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.07] border border-white/[0.08] text-[11.5px] font-semibold text-white/70 transition hover:bg-white/[0.11] hover:text-white"
          >
            <Play className="h-3 w-3 fill-current" /> Watch Now
          </Link>
          <button
            type="button"
            onClick={() => { toggleVideoSave(); trackCTA('watch_video', item.category); }}
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition ${saved ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-white/[0.08] bg-white/[0.04] text-white/35 hover:border-white/[0.13] hover:text-white/70'}`}
          >
            {saved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── milestone card — instagram-style ──────────────────────────── */
function MilestoneCard({ item, searchQuery }: { item: PublishedItem; searchQuery: string }) {
  const [celebrated, setCelebrated] = useState(false);
  const bylineParts  = item.byline.split(' · ').map(s => s.trim());
  const authorName   = (item.uploadedByName || bylineParts[0]) ?? 'Author';
  const authorMeta   = bylineParts.slice(1).join(' · ');
  const initials     = authorName.split(/\s+/).slice(0,2).map(w=>w[0]?.toUpperCase()??'').join('');
  const milestoneHref = item.businessPageSlug ? `/businesses/${item.businessPageSlug}` : item.uploadedByUserId ? `/u/${item.uploadedByUserId}` : null;
  const milestoneAvatar = item.avatarUrl
    ? <img src={item.avatarUrl} alt={authorName} className="h-full w-full rounded-full object-cover" />
    : (initials || <Award className="h-3.5 w-3.5 opacity-60" />);

  return (
    <article className="group py-5 px-4 sm:px-0">
      {/* header */}
      <div className="flex items-center gap-3 mb-3.5">
        {milestoneHref ? (
          <Link href={milestoneHref} onClick={e=>e.stopPropagation()} className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold ${AVATAR_CLS} hover:opacity-80 transition`}>
            {milestoneAvatar}
          </Link>
        ) : (
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold ${AVATAR_CLS}`}>
            {milestoneAvatar}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {milestoneHref ? (
            <Link href={milestoneHref} onClick={e=>e.stopPropagation()} className="text-[13.5px] font-semibold text-white hover:text-white/80 transition">{authorName}</Link>
          ) : (
            <span className="text-[13.5px] font-semibold text-white">{authorName}</span>
          )}
          <p className="text-[11px] text-white/35 mt-0.5">
            {item.badge}{authorMeta ? ` · ${authorMeta}` : ''} · {timeAgo(item.postedAt)}
          </p>
        </div>
      </div>

      {/* content */}
      <Link href={`/published/${item.id}`} className="block">
        <h3 className="text-[15px] font-bold leading-snug tracking-tight text-white line-clamp-2 group-hover:text-white/85 transition-colors">
          {searchQuery ? highlight(item.title, searchQuery) : item.title}
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/50 line-clamp-3">{getBodySnippet(item.body)}</p>
      </Link>

      {item.stats && (
        <div className="flex items-center gap-5 mt-3">
          {item.stats.slice(0,3).map(s => (
            <div key={s.l} className="flex items-baseline gap-1.5">
              <span className="text-[13.5px] font-bold text-white/75 tabular-nums">{s.v}</span>
              <span className="text-[9.5px] font-semibold uppercase tracking-widest text-white/25">{s.l}</span>
            </div>
          ))}
        </div>
      )}

      {/* engagement */}
      <div className="flex items-center gap-3 mt-3.5 pt-3.5 border-t border-white/[0.05]">
        <button
          type="button"
          onClick={e => {
            e.preventDefault(); e.stopPropagation();
            const next = !celebrated;
            setCelebrated(next);
            if (next) { toast('Celebrated! 🎉', 'success', '🏆'); trackCTA('celebrate_milestone', 'milestone'); }
          }}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 h-8 text-[12px] font-semibold transition ${
            celebrated ? 'bg-white/[0.10] text-white/80' : 'text-white/35 hover:text-white/70 hover:bg-white/[0.05]'
          }`}
        >
          🎉 {celebrated ? 'Celebrated!' : 'Celebrate'}
        </button>
        <button type="button" onClick={e=>{e.preventDefault();e.stopPropagation();void shareItem(item.id,item.title);trackCTA('share_item','milestone');}} className="flex h-8 w-8 items-center justify-center rounded-full text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition">
          <Share2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}

/* ─── tutorial card ──────────────────────────────────────────────── */
function TutorialCard({ item, searchQuery }: { item: PublishedItem; searchQuery: string }) {
  const stepsStat = item.stats?.find(s => s.l === 'steps')?.v;
  const readsStat = item.stats?.find(s => s.l === 'reads')?.v;
  const bookmarkStat = item.stats?.find(s => s.l === 'bookmarks')?.v;
  const difficultyColor: Record<string, string> = {
    Beginner:     'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    Intermediate: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    Advanced:     'bg-red-500/10 text-red-400 border-red-500/20',
  };
  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border border-white/[0.07] bg-[#111116] border-white/[0.06] p-4 transition-all hover:border-white/[0.12] hover:bg-[#13131b]">
      <Link href={`/published/${item.id}`} className="flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-3">
          <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${difficultyColor[item.badge] ?? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'}`}>
            <BookMarked className="h-2.5 w-2.5" />{item.badge}
          </span>
          {stepsStat && <span className="text-[10px] text-white/30">{stepsStat} steps</span>}
          <span className="ml-auto text-[10px] text-white/25">{timeAgo(item.postedAt)}</span>
        </div>
        <h3 className="text-[13.5px] font-bold leading-snug text-white tracking-[-0.02em] line-clamp-2 group-hover:text-white/90">
          {searchQuery ? highlight(item.title, searchQuery) : item.title}
        </h3>
        <p className="mt-1 text-[10.5px] text-white/30 line-clamp-1">{item.byline}</p>
        <p className="mt-2.5 text-[12px] leading-relaxed text-white/45 line-clamp-2 flex-1">{getBodySnippet(item.body)}</p>
        {item.chips && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {item.chips.slice(0,4).map(c => (
              <span key={c} className="rounded-lg bg-white/[0.05] border border-white/[0.06] px-2 py-0.5 text-[10px] text-white/35">{c}</span>
            ))}
          </div>
        )}
      </Link>
      <div className="mt-3 flex items-center gap-3 border-t border-white/[0.05] pt-3">
        {readsStat && <span className="flex items-center gap-1 text-[11px] text-white/25"><Eye className="h-3 w-3" />{readsStat}</span>}
        {bookmarkStat && <span className="flex items-center gap-1 text-[11px] text-white/25"><BookMarked className="h-3 w-3" />{bookmarkStat}</span>}
        <Link
          href={`/published/${item.id}`}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 text-[11.5px] font-semibold text-indigo-400 transition hover:bg-indigo-500/20 hover:text-indigo-300"
        >
          Start Learning <ArrowRight className="h-3 w-3" />
        </Link>
        <TutorialBookmarkButton itemId={item.id} category={item.category} />
      </div>
    </div>
  );
}

function TutorialBookmarkButton({ itemId, category }: { itemId: string; category: string }) {
  const [tBookmarked, toggleTBookmark] = useBookmark(itemId, category);
  return (
    <button
      type="button"
      onClick={e => { e.preventDefault(); e.stopPropagation(); toggleTBookmark(); }}
      className={`flex h-8 w-8 items-center justify-center rounded-xl border transition ${tBookmarked ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-white/[0.08] bg-white/[0.04] text-white/35 hover:border-white/[0.13] hover:text-white/70'}`}
    >
      {tBookmarked ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
    </button>
  );
}

/* ─── category section ──────────────────────────────────────────── */
function CategorySection({
  tab, items, searchQuery,
}: {
  tab: (typeof TABS)[number];
  items: PublishedItem[];
  searchQuery: string;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [searchQuery]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items;
    return items
      .map(i => ({ item: i, score: scoreItem(i, searchQuery) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.item);
  }, [items, searchQuery]);

  if (filtered.length === 0) return null;
  const shown = expanded ? filtered : filtered.slice(0, RECENT_COUNT);
  const colorCls = TAG_CLS[tab.id] ?? TAG_CLS.all;

  return (
    <section>
      {/* section header */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${colorCls}`}>
            <tab.icon className="h-3.5 w-3.5" />
          </div>
          <div>
            <h2 className="text-[13px] font-bold tracking-tight text-white">{tab.label}</h2>
            <p className="text-[10px] text-white/30">{filtered.length} published</p>
          </div>
        </div>
        {!expanded && filtered.length > RECENT_COUNT && (
          <span className="text-[10px] text-white/25">+{filtered.length - shown.length} more</span>
        )}
      </div>

      {/* feed layout: divide-y separator for post-style, 2-col grid for visual cards */}
      {tab.id === 'gig' ? (
        <div className="divide-y divide-white/[0.05]">
          {shown.map(item => <GigCard key={item.id} item={item} />)}
        </div>
      ) : tab.id === 'poll' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shown.map(item => <PollCard key={item.id} item={item} />)}
        </div>
      ) : tab.id === 'survey' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shown.map(item => <SurveyCard key={item.id} item={item} />)}
        </div>
      ) : tab.id === 'chart' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shown.map(item => <ChartCard key={item.id} item={item} />)}
        </div>
      ) : tab.id === 'video' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shown.map(item => <VideoCard key={item.id} item={item} searchQuery={searchQuery} />)}
        </div>
      ) : tab.id === 'tutorial' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shown.map(item => <TutorialCard key={item.id} item={item} searchQuery={searchQuery} />)}
        </div>
      ) : tab.id === 'post' ? (
        <div className="divide-y divide-white/[0.05]">
          {shown.map(item => <PostCard key={item.id} item={item} searchQuery={searchQuery} />)}
        </div>
      ) : tab.id === 'thread' ? (
        <div className="divide-y divide-white/[0.05]">
          {shown.map(item => <ThreadCard key={item.id} item={item} searchQuery={searchQuery} />)}
        </div>
      ) : tab.id === 'milestone' ? (
        <div className="divide-y divide-white/[0.05]">
          {shown.map(item => <MilestoneCard key={item.id} item={item} searchQuery={searchQuery} />)}
        </div>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          {shown.map(item => (
            <PublishedCard key={item.id} item={item} searchQuery={searchQuery} />
          ))}
        </div>
      )}

      {filtered.length > RECENT_COUNT && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/[0.09] bg-white/[0.04] px-5 py-2 text-xs font-medium text-white/55 transition hover:bg-white/[0.08] hover:text-white active:scale-95"
          >
            {expanded
              ? <>Show less <ChevronDown className="h-3.5 w-3.5 rotate-180" /></>
              : <>Show {filtered.length - RECENT_COUNT} more <ChevronDown className="h-3.5 w-3.5" /></>}
          </button>
        </div>
      )}
    </section>
  );
}

/* ─── search results ────────────────────────────────────────────── */
function SearchResults({ items, query }: { items: PublishedItem[]; query: string }) {
  const [limit, setLimit] = useState(12);
  const results = useMemo(() => {
    return items
      .map(i => ({ item: i, score: scoreItem(i, query) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.item);
  }, [items, query]);

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.04]">
          <Search className="h-7 w-7 text-white/20" />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-white">Nothing found</p>
          <p className="mt-1 text-sm text-white/35">No results for &quot;{query}&quot;</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-5 text-xs text-white/35">
        <span className="font-semibold text-white/70">{results.length}</span> result{results.length !== 1 ? 's' : ''} — sorted by relevance
      </p>
      <div className="divide-y divide-white/[0.05]">
        {results.slice(0, limit).map(item => (
          item.category === 'gig' ? <GigCard key={item.id} item={item} />
          : item.category === 'poll' ? <PollCard key={item.id} item={item} />
          : item.category === 'survey' ? <SurveyCard key={item.id} item={item} />
          : item.category === 'chart' ? <ChartCard key={item.id} item={item} />
          : item.category === 'post' ? <PostCard key={item.id} item={item} searchQuery={query} />
          : item.category === 'thread' ? <ThreadCard key={item.id} item={item} searchQuery={query} />
          : item.category === 'video' ? <VideoCard key={item.id} item={item} searchQuery={query} />
          : item.category === 'milestone' ? <MilestoneCard key={item.id} item={item} searchQuery={query} />
          : item.category === 'tutorial' ? <TutorialCard key={item.id} item={item} searchQuery={query} />
          : <PublishedCard key={item.id} item={item} searchQuery={query} />
        ))}
      </div>
      {results.length > limit && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => setLimit(l => l + 12)}
            className="inline-flex items-center gap-1.5 rounded-2xl border border-white/[0.09] bg-white/[0.04] px-5 py-2 text-xs font-medium text-white/55 transition hover:bg-white/[0.08] hover:text-white"
          >
            Load {Math.min(12, results.length - limit)} more <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE
═══════════════════════════════════════════════════════════════════ */
export default function PublishedPage() {
  const [activeTab, setActiveTab]       = useState<TabId>('all');
  const [search, setSearch]             = useState('');
  const trackSearch = useSearchTracker(SEARCH_CONTEXTS.PUBLISHED_FEED);
  const [sortBy, setSortBy]             = useState<'recent' | 'popular' | 'oldest' | 'alpha' | 'trending'>('recent');
  const [trendCounts, setTrendCounts]   = useState<Record<string, number>>({});
  const [trendDrawerOpen, setTrendDrawerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen]   = useState(false);
  const [publishOpen, setPublishOpen]   = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [realItems, setRealItems]       = useState<PublishedItem[]>([]);
  const [feedLoading, setFeedLoading]   = useState(true);
  const [serverPage, setServerPage]     = useState(1);
  const [serverHasMore, setServerHasMore] = useState(false);
  const [serverLoadingMore, setServerLoadingMore] = useState(false);
  const [gigItems, setGigItems]         = useState<PublishedItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(10);
  const loadMoreSentinelRef             = useRef<HTMLDivElement>(null);
  const feedScrollRef                   = useRef<HTMLDivElement>(null);
  const [tabBarVisible, setTabBarVisible] = useState(true);

  /* gig-specific filters */
  const [gigCat, setGigCat]           = useState('');
  const [gigEngagement, setGigEngagement] = useState('');
  const [gigLocation, setGigLocation] = useState('');
  const [gigBidMode, setGigBidMode]   = useState('');
  const [gigUrgent, setGigUrgent]     = useState(false);
  const [gigSort, setGigSort]         = useState<'recent' | 'bids'>('recent');

  // force pure matte black on html + body while on this page (overscroll areas included)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBgColor = html.style.backgroundColor;
    const prevHtmlBgImage = html.style.backgroundImage;
    const prevBodyBgColor = body.style.backgroundColor;
    const prevBodyBgImage = body.style.backgroundImage;
    html.style.backgroundColor = '#0D0D0F';
    html.style.backgroundImage = 'none';
    body.style.backgroundColor = '#0D0D0F';
    body.style.backgroundImage = 'none';
    return () => {
      html.style.backgroundColor = prevHtmlBgColor;
      html.style.backgroundImage = prevHtmlBgImage;
      body.style.backgroundColor = prevBodyBgColor;
      body.style.backgroundImage = prevBodyBgImage;
    };
  }, []);

  // default to Gigs tab when navigated with ?tab=gig
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const t = new URLSearchParams(window.location.search).get('tab') as TabId | null;
    if (t && TABS.some(tab => tab.id === t)) setActiveTab(t);
  }, []);

  /* reset gig filters when leaving gig tab */
  useEffect(() => {
    if (activeTab !== 'gig') {
      setGigCat(''); setGigEngagement(''); setGigLocation('');
      setGigBidMode(''); setGigUrgent(false); setGigSort('recent');
    }
  }, [activeTab]);


  const searchRef = useRef<HTMLInputElement>(null);

  /* sync trend counts from localStorage */
  useEffect(() => {
    const sync = () => {
      try {
        const data = readTrends();
        const counts: Record<string, number> = {};
        Object.entries(data).forEach(([id, v]) => { if (v.count > 0) counts[id] = v.count; });
        setTrendCounts(counts);
      } catch {}
    };
    sync();
    const iv = setInterval(sync, 10_000);
    return () => clearInterval(iv);
  }, []);

  /* fetch real published items — paginated */
  useEffect(() => {
    let alive = true;
    fetch('/api/public/published?limit=20&page=1')
      .then(r => r.ok ? r.json() : { items: [], hasMore: false })
      .then((d: { items: PublishedItem[]; hasMore?: boolean }) => {
        if (alive && Array.isArray(d.items)) {
          setRealItems(d.items);
          setServerHasMore(d.hasMore ?? false);
          setServerPage(1);
        }
        if (alive) setFeedLoading(false);
      })
      .catch(() => { if (alive) setFeedLoading(false); });
    return () => { alive = false; };
  }, []);

  /* fetch public gig listings */
  useEffect(() => {
    fetch('/api/public/gigs')
      .then(r => r.ok ? r.json() : { gigs: [] })
      .then((d: { gigs: GigItem[] }) => {
        if (!Array.isArray(d.gigs)) return;
        const mapped: PublishedItem[] = d.gigs.map((g) => ({
          id: `gig-${g.id}`,
          category: 'gig',
          badge: g.budgetLabel || 'Gig',
          title: g.summary ? `${g.summary.slice(0, 80)}${g.summary.length > 80 ? '…' : ''}` : g.category,
          byline: `${g.ownerName} · ${g.locationPreference} · ${g.engagementType.replace('_', '-')}`,
          body: g.deliverables?.join(', ') || g.skills?.join(', ') || '',
          chips: g.skills?.slice(0, 5),
          postedAt: g.createdAt,
          isReal: true,
          gigData: g,
        }));
        setGigItems(mapped);
      })
      .catch(() => {});
  }, []);

  /* derive unique filter option values from loaded gig data */
  const gigCategoryOptions = useMemo(() => {
    const seen = new Set<string>();
    gigItems.forEach(i => { if (i.gigData?.category) seen.add(i.gigData.category); });
    return Array.from(seen).sort();
  }, [gigItems]);

  const gigSkillOptions = useMemo(() => {
    const freq: Record<string, number> = {};
    gigItems.forEach(i => i.gigData?.skills.forEach(s => { freq[s] = (freq[s] ?? 0) + 1; }));
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s]) => s);
  }, [gigItems]);

  const [gigSkill, setGigSkill] = useState('');

  /* ── global content filters ── */
  const [dateRange, setDateRange]       = useState<'all'|'today'|'week'|'month'|'year'>('all');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [liveOnly, setLiveOnly]         = useState(false);
  /* news / article */
  const [readTime, setReadTime]         = useState('');
  /* document */
  const [docFileType, setDocFileType]   = useState('');
  /* job */
  const [jobWorkMode, setJobWorkMode]   = useState('');
  const [jobType, setJobType]           = useState('');
  const [salaryRange, setSalaryRange]   = useState('');
  /* event */
  const [eventType, setEventType]       = useState('');
  const [eventMode, setEventMode]       = useState('');
  const [upcomingOnly, setUpcomingOnly] = useState(false);
  /* hackathon */
  const [hackPrize, setHackPrize]       = useState('');
  const [hackFormat, setHackFormat]     = useState('');
  /* resume */
  const [resumeAvail, setResumeAvail]   = useState('');
  /* product */
  const [productPrice, setProductPrice] = useState('');

  /* Task 14 discovery filters — tags, location, creator, tutorial difficulty */
  const [tagFilter, setTagFilter]           = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [creatorFilter, setCreatorFilter]   = useState('');
  const [tutorialLevel, setTutorialLevel]   = useState('');

  const clearAllFilters = () => {
    setDateRange('all'); setSortBy('recent'); setFeaturedOnly(false); setLiveOnly(false);
    setReadTime(''); setDocFileType('');
    setJobWorkMode(''); setJobType(''); setSalaryRange('');
    setEventType(''); setEventMode(''); setUpcomingOnly(false);
    setHackPrize(''); setHackFormat('');
    setResumeAvail(''); setProductPrice('');
    setTagFilter(''); setLocationFilter(''); setCreatorFilter(''); setTutorialLevel('');
    setGigCat(''); setGigEngagement(''); setGigLocation('');
    setGigBidMode(''); setGigSkill(''); setGigUrgent(false); setGigSort('recent');
    setVisibleCount(10);
  };

  /* reset visible count on any filter/tab/sort/search change */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setVisibleCount(10); }, [
    activeTab, sortBy, search,
    dateRange, featuredOnly, liveOnly, readTime, docFileType,
    jobWorkMode, jobType, salaryRange, eventType, eventMode, upcomingOnly,
    hackPrize, hackFormat, resumeAvail, productPrice,
    tagFilter, locationFilter, creatorFilter, tutorialLevel,
    gigCat, gigEngagement, gigLocation, gigBidMode, gigSkill, gigUrgent,
  ]);

  /* filtered + sorted gig items */
  const filteredGigItems = useMemo(() => {
    let list = gigItems.filter(item => {
      const g = item.gigData;
      if (!g) return false;
      if (gigCat      && g.category          !== gigCat)      return false;
      if (gigEngagement && g.engagementType   !== gigEngagement) return false;
      if (gigLocation && g.locationPreference !== gigLocation) return false;
      if (gigBidMode  && g.bidMode            !== gigBidMode)  return false;
      if (gigSkill    && !g.skills.includes(gigSkill))         return false;
      if (gigUrgent   && !g.urgent)                            return false;
      return true;
    });
    if (gigSort === 'bids') {
      list = [...list].sort((a, b) => (b.gigData?.connectCount ?? 0) - (a.gigData?.connectCount ?? 0));
    }
    return list;
  }, [gigItems, gigCat, gigEngagement, gigLocation, gigBidMode, gigSkill, gigUrgent, gigSort]);

  const activeGigFilterCount = [gigCat, gigEngagement, gigLocation, gigBidMode, gigSkill].filter(Boolean).length
    + (gigUrgent ? 1 : 0) + (gigSort !== 'recent' ? 1 : 0);

  const activeGlobalFilterCount = [
    dateRange !== 'all', featuredOnly, liveOnly,
    readTime, docFileType, jobWorkMode, jobType, salaryRange,
    eventType, eventMode, upcomingOnly, hackPrize, hackFormat,
    resumeAvail, productPrice, sortBy !== 'recent',
    tagFilter, locationFilter, creatorFilter, tutorialLevel,
  ].filter(Boolean).length;

  const totalFilterCount = activeGlobalFilterCount + activeGigFilterCount;

  /* Task 14 — discovery options derived from the unfiltered pool, so choosing
     one value never removes the others from the list. Mirrors the existing
     gigCategoryOptions/gigSkillOptions pattern. */
  const discoveryOptions = useMemo(() => {
    const pool = [...realItems, ...gigItems, ...MOCK_ITEMS];
    const tally = (m: Map<string, number>, v?: string) => {
      const k = (v ?? '').trim();
      if (k && k.length < 28) m.set(k, (m.get(k) ?? 0) + 1);
    };
    const tags = new Map<string, number>();
    const locations = new Map<string, number>();
    const creators = new Map<string, number>();
    for (const it of pool) {
      (it.chips ?? []).forEach(c => tally(tags, c));
      (it.gigData?.skills ?? []).forEach(s => tally(tags, s));
      tally(locations, itemLocation(it));
      tally(creators, it.uploadedByName);
    }
    const top = (m: Map<string, number>, n: number) => {
      const rows: { v: string; c: number }[] = [];
      m.forEach((c, v) => rows.push({ v, c }));
      return rows.sort((a, b) => b.c - a.c || a.v.localeCompare(b.v)).slice(0, n).map(r => r.v);
    };
    return { tags: top(tags, 12), locations: top(locations, 8), creators: top(creators, 8) };
  }, [realItems, gigItems]);

  /* merge real + gigs + mock, real-first, deduped, all filters applied */
  const allItems = useMemo<PublishedItem[]>(() => {
    const merged = [...realItems, ...filteredGigItems, ...MOCK_ITEMS];
    const seen   = new Set<string>();
    let items = merged.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });

    /* date range */
    if (dateRange !== 'all') {
      const now = Date.now();
      const AGO = { today: 86_400_000, week: 7*86_400_000, month: 30*86_400_000, year: 365*86_400_000 } as const;
      const cutoff = now - AGO[dateRange];
      items = items.filter(i => new Date(i.postedAt).getTime() >= cutoff);
    }

    /* status flags */
    if (featuredOnly) items = items.filter(i => i.featured);
    if (liveOnly)     items = items.filter(i => i.isReal);

    /* Task 14 — tag / location / creator discovery (existing item data) */
    if (tagFilter) {
      items = items.filter(i =>
        (i.chips ?? []).some(c => eqi(c, tagFilter)) ||
        (i.gigData?.skills ?? []).some(s => eqi(s, tagFilter)));
    }
    if (locationFilter) items = items.filter(i => eqi(itemLocation(i), locationFilter));
    if (creatorFilter)  items = items.filter(i => eqi(i.uploadedByName ?? '', creatorFilter));

    /* category-specific */
    items = items.filter(item => {
      const cat = item.category;

      /* news/article → read time */
      if (readTime && (cat === 'news' || cat === 'article')) {
        const m = item.byline.match(/(\d+)\s*min/);
        const mins = m ? parseInt(m[1]) : 5;
        if (readTime === 'short'  && mins >= 5)           return false;
        if (readTime === 'medium' && (mins < 5 || mins > 15)) return false;
        if (readTime === 'long'   && mins <= 15)           return false;
      }

      /* document → file type */
      if (docFileType && cat === 'document') {
        const hay = `${item.title} ${item.byline} ${item.body}`.toLowerCase();
        if (docFileType === 'free' && !hay.includes('free')) return false;
        if (docFileType !== 'free' && !hay.includes(docFileType.toLowerCase())) return false;
      }

      /* job → work mode (labelled Type/Mode value first, then legacy badge/byline) */
      if (jobWorkMode && cat === 'job') {
        const hay = `${itemEmploymentType(item)} ${item.badge} ${item.byline}`.toLowerCase();
        if (!hay.includes(jobWorkMode.toLowerCase())) return false;
      }
      /* job → employment type */
      if (jobType && cat === 'job') {
        const hay = `${itemEmploymentType(item)} ${item.badge} ${item.byline}`.toLowerCase();
        if (!hay.includes(jobType.toLowerCase())) return false;
      }
      /* job → salary range */
      if (salaryRange && cat === 'job') {
        const m = `${item.byline} ${(item.chips ?? []).join(' ')}`.match(/[₹$]?(\d+)\s*[–\-]\s*(\d+)\s*L/i);
        const minSal = m ? parseInt(m[1]) : 0;
        if (salaryRange === 'entry'  && minSal >= 20) return false;
        if (salaryRange === 'mid'    && (minSal < 20 || minSal > 50)) return false;
        if (salaryRange === 'senior' && minSal <= 50) return false;
      }

      /* event → type */
      if (eventType && cat === 'event') {
        if (!item.badge.toLowerCase().includes(eventType.toLowerCase())) return false;
      }
      /* event → mode (labelled Mode/Venue value first, then legacy byline/chips) */
      if (eventMode && cat === 'event') {
        const hay = `${readFeedLabelledValue(item.body ?? '', ['Mode'])} ${itemLocation(item)} ${item.byline} ${(item.chips ?? []).join(' ')}`.toLowerCase();
        const isOnline = hay.includes('online') || hay.includes('zoom') || hay.includes('virtual');
        if (eventMode === 'online'   && !isOnline) return false;
        if (eventMode === 'inperson' && isOnline)  return false;
      }
      /* event → upcoming (labelled event date first, then legacy byline month) */
      if (upcomingOnly && cat === 'event') {
        const labelled = itemEventDate(item);
        if (labelled) {
          if (labelled < new Date()) return false;
        } else {
          const m = item.byline.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+/i);
          if (m) { const evDate = new Date(`${m[0]}, 2026`); if (evDate < new Date()) return false; }
        }
      }

      /* hackathon → prize */
      if (hackPrize && cat === 'hackathon') {
        const lM = item.badge.match(/[₹](\d+)L/i);
        const kM = item.badge.match(/\$(\d+)k/i);
        const lakh = lM ? parseInt(lM[1]) : kM ? parseInt(kM[1]) * 0.083 : 0;
        if (hackPrize === 'small'  && lakh >= 5)            return false;
        if (hackPrize === 'medium' && (lakh < 5 || lakh > 20)) return false;
        if (hackPrize === 'large'  && lakh <= 20)            return false;
      }
      /* hackathon → format */
      if (hackFormat && cat === 'hackathon') {
        const hay = `${item.byline} ${(item.chips ?? []).join(' ')}`.toLowerCase();
        const isOnline   = hay.includes('online');
        const isAsync    = hay.includes('async');
        if (hackFormat === 'online'   && !isOnline)              return false;
        if (hackFormat === 'async'    && !isAsync)               return false;
        if (hackFormat === 'inperson' && (isOnline || isAsync))  return false;
      }

      /* resume → availability */
      if (resumeAvail && cat === 'resume') {
        if (!item.badge.toLowerCase().includes(resumeAvail.toLowerCase())) return false;
      }

      /* tutorial → difficulty */
      if (tutorialLevel && cat === 'tutorial') {
        if (!eqi(itemTutorialLevel(item), tutorialLevel)) return false;
      }

      /* product → price (labelled Price: value first, then legacy byline) */
      if (productPrice && cat === 'product') {
        const price = itemPriceValue(item);
        if (productPrice === 'free'    && price > 0)             return false;
        if (productPrice === 'budget'  && (price === 0 || price > 999))   return false;
        if (productPrice === 'mid'     && (price < 1000 || price > 4999)) return false;
        if (productPrice === 'premium' && price < 5000)          return false;
      }

      return true;
    });

    return items;
  }, [
    realItems, filteredGigItems,
    dateRange, featuredOnly, liveOnly,
    readTime, docFileType,
    jobWorkMode, jobType, salaryRange,
    eventType, eventMode, upcomingOnly,
    hackPrize, hackFormat,
    resumeAvail, productPrice,
    tagFilter, locationFilter, creatorFilter, tutorialLevel,
  ]);

  const itemsByCategory = useMemo(() => {
    const map: Record<string, PublishedItem[]> = {};
    for (const item of allItems) {
      const cat = item.category || 'document';
      (map[cat] ??= []).push(item);
    }
    for (const k of Object.keys(map)) {
      if (sortBy === 'popular') {
        map[k] = [...map[k]].sort((a, b) => {
          const val = (x: PublishedItem) => parseFloat(
            x.stats?.find(s => s.l === 'reads' || s.l === 'downloads')
              ?.v?.replace(/[k,]/g, v => v === 'k' ? '000' : '') ?? '0'
          );
          return val(b) - val(a);
        });
      } else if (sortBy === 'oldest') {
        map[k] = [...map[k]].sort((a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime());
      } else if (sortBy === 'alpha') {
        map[k] = [...map[k]].sort((a, b) => a.title.localeCompare(b.title));
      } else if (sortBy === 'trending') {
        map[k] = [...map[k]].sort((a, b) => (trendCounts[b.id] ?? 0) - (trendCounts[a.id] ?? 0));
      } else {
        map[k] = [...map[k]].sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
      }
    }
    return map;
  }, [allItems, sortBy, trendCounts]);

  const visibleTabs  = TABS.filter(t => t.id !== 'all' && t.id !== 'featured');
  const isSearching  = search.trim().length > 0;
  const tabsToRender = useMemo(
    () => activeTab === 'all' || activeTab === 'featured' ? visibleTabs : visibleTabs.filter(t => t.id === activeTab),
    [activeTab, visibleTabs]
  );

  /* mixed chronological feed — all items regardless of category/featured, sorted by active sort */
  const mixedFeed = useMemo(() => {
    const pool = activeTab === 'all'
      ? allItems
      : activeTab === 'featured'
        ? allItems.filter(i => i.featured)
        : (itemsByCategory[activeTab] ?? []);
    const sorted = [...pool];
    if (sortBy === 'popular') {
      sorted.sort((a, b) => {
        const val = (x: PublishedItem) => parseInt(x.stats?.find(s => s.l === 'reads' || s.l === 'downloads')?.v?.replace(/[k,]/g, v => v === 'k' ? '000' : '') ?? '0');
        return val(b) - val(a);
      });
    } else if (sortBy === 'oldest') {
      sorted.sort((a, b) => new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime());
    } else if (sortBy === 'alpha') {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'trending') {
      sorted.sort((a, b) => (trendCounts[b.id] ?? 0) - (trendCounts[a.id] ?? 0));
    } else {
      sorted.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
    }
    return sorted;
  }, [allItems, itemsByCategory, activeTab, sortBy, trendCounts]);

  /* keep these for backward-compat with category-filtered sidebar counts */
  const featuredItems = useMemo(() => [], []);
  const nonFeaturedByCategory = useMemo(() => ({} as Record<string, PublishedItem[]>), []);

  /* IntersectionObserver — auto-load next batch when sentinel enters view */
  useEffect(() => {
    const el = loadMoreSentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleCount(c => c + 10); },
      { rootMargin: '200px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [mixedFeed]);

  /* Tab bar hide-on-scroll-down / show-on-scroll-up */
  useEffect(() => {
    const el = feedScrollRef.current;
    if (!el) return;
    let lastY = 0;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = el.scrollTop;
        const diff = y - lastY;
        if (Math.abs(diff) > 4) {
          setTabBarVisible(diff < 0 || y < 60);
          lastY = y;
        }
        ticking = false;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  /* Track search queries with result counts */
  useEffect(() => {
    if (!search.trim()) return;
    const searchLower = search.trim().toLowerCase();
    const count = mixedFeed.filter(i =>
      i.title.toLowerCase().includes(searchLower) ||
      i.body.toLowerCase().includes(searchLower) ||
      (i.chips ?? []).some(c => c.toLowerCase().includes(searchLower))
    ).length;
    trackSearch(search, count);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeTab]);

  /* ⌘K to focus search */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  /* sidebar nav item count */
  const tabCount = (id: string) =>
    id === 'all'      ? allItems.length :
    id === 'featured' ? allItems.filter(i => i.featured).length :
    (itemsByCategory[id]?.length ?? 0);

  /* sync URL when tab changes */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = activeTab === 'all' ? '/published' : `/published?tab=${activeTab}`;
    window.history.replaceState(null, '', url);
  }, [activeTab]);

  return (
    /* full-viewport flex container */
    <div className="flex h-[100dvh] overflow-hidden text-white" style={{ background: '#0D0D0F' }}>
      <ToastContainer />
      <PublishAnythingDialog open={publishOpen} onOpenChange={setPublishOpen} isAuthenticated={true} />

      {/* ── ambient glows (cool) ── */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <div className="absolute left-1/4 top-1/4 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/[0.04] blur-[160px]" />
        <div className="absolute right-0 bottom-0 h-[350px] w-[350px] rounded-full bg-violet-500/[0.03] blur-[130px]" />
      </div>

      {/* ══════════════════════════════════════
          DESKTOP SIDEBAR
      ══════════════════════════════════════ */}
      <aside className="hidden lg:flex w-56 xl:w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#0D0D0F]">

        {/* logo / title area */}
        <div className="px-4 py-5 border-b border-white/[0.05]">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-medium text-white/40 transition hover:text-white/70"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to app
          </Link>
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/25">Docrud</p>
            <h1 className="mt-0.5 text-lg font-bold tracking-tight text-white">Published</h1>
          </div>
          {/* live pill */}
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] text-white/35 tabular-nums">{allItems.length} items</span>
            {realItems.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {realItems.length} live
              </span>
            )}
          </div>
        </div>

        {/* nav list */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            const count    = tabCount(tab.id);
            const colorCls = TAG_CLS[tab.id] ?? TAG_CLS.all;
            const isFeaturedTab = tab.id === 'featured';
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTab(tab.id as TabId); setSearch(''); }}
                className={`group w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] font-medium transition-all ${
                  isActive
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-white/40 hover:bg-white/[0.04] hover:text-white/80'
                }`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  isActive
                    ? isFeaturedTab ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : colorCls
                    : 'border-white/[0.06] bg-transparent text-white/30 group-hover:border-white/[0.10] group-hover:text-white/50'
                }`}>
                  <tab.icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 text-left">{tab.label}</span>
                {count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums min-w-[18px] text-center ${
                    isActive ? 'bg-white/[0.12] text-white' : 'bg-white/[0.05] text-white/20'
                  }`}>{count}</span>
                )}
                {isFeaturedTab && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: isActive ? 'rgba(251,191,36,0.80)' : 'rgba(251,191,36,0.25)', flexShrink: 0, boxShadow: isActive ? '0 0 5px rgba(251,191,36,0.50)' : 'none' }} />
                )}
              </button>
            );
          })}
        </nav>

        {/* bottom: analytics portal (rendered in document.body) + publish CTA */}
        {analyticsOpen && <CtaAnalyticsPanel onClose={() => setAnalyticsOpen(false)} />}
        <div className="p-3 border-t border-white/[0.05] space-y-2">
          <button
            type="button"
            onClick={() => setAnalyticsOpen(o => !o)}
            className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-[11.5px] font-semibold transition ${
              analyticsOpen
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-white/[0.07] bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/70'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5 shrink-0" />
            My CTA Activity
          </button>
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            className="group flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.05] px-4 py-2.5 text-[11.5px] font-semibold text-white/55 transition hover:border-white/[0.18] hover:bg-white/[0.09] hover:text-white/85 active:scale-[0.98]"
          >
            <Plus className="h-3.5 w-3.5 transition-transform group-hover:rotate-90 duration-200" />
            Publish something
          </button>
        </div>
      </aside>

      {/* ══════════════════════════════════════
          MAIN CONTENT + RIGHT PANEL
      ══════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden min-w-0">
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">

        {/* ── Desktop top bar ── */}
        <header className="hidden lg:flex shrink-0 items-center gap-4 border-b border-white/[0.06] bg-[#0D0D0F]/85 px-5 py-3 backdrop-blur-xl">
          {/* breadcrumb */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {(() => {
              const t = TABS.find(x => x.id === activeTab)!;
              const colorCls = TAG_CLS[t.id] ?? TAG_CLS.all;
              return (
                <span className={`flex h-6 w-6 items-center justify-center rounded-lg border ${colorCls}`}>
                  <t.icon className="h-3 w-3" />
                </span>
              );
            })()}
            <h2 className="text-sm font-semibold text-white truncate">
              {activeTab === 'all' ? 'All Published' : TABS.find(t => t.id === activeTab)?.label}
            </h2>
          </div>

          {/* search */}
          <div className="relative w-72 xl:w-96">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search… (⌘K)"
              className="h-9 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] pl-9 pr-8 text-sm text-white placeholder:text-white/20 outline-none transition focus:border-white/[0.18] focus:bg-white/[0.06]"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Publish button — desktop top bar */}
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            className="group inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.05] px-3.5 py-2 text-[12px] font-semibold text-white/55 transition hover:border-white/[0.18] hover:bg-white/[0.09] hover:text-white/85 active:scale-[0.97]"
          >
            <Plus className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-90" />
            Publish
          </button>

          {/* sort cycle */}
          <button
            type="button"
            onClick={() => {
              const opts = ['recent', 'popular', 'oldest', 'alpha', 'trending'] as const;
              setSortBy(s => opts[(opts.indexOf(s as typeof opts[number]) + 1) % opts.length]);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-white/50 transition hover:bg-white/[0.08] hover:text-white"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="capitalize">{sortBy === 'recent' ? 'Newest' : sortBy === 'popular' ? 'Popular' : sortBy === 'oldest' ? 'Oldest' : sortBy === 'trending' ? '🔥 Trending' : 'A–Z'}</span>
          </button>

          {/* filter toggle */}
          <button
            type="button"
            onClick={() => setFiltersOpen(o => !o)}
            className={`relative inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition ${
              filtersOpen || totalFilterCount > 0
                ? 'border-white/[0.18] bg-white/[0.08] text-white'
                : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {totalFilterCount > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white text-[8px] font-bold text-slate-950 px-1">
                {totalFilterCount}
              </span>
            )}
          </button>
        </header>

        {/* ── Mobile header ── */}
        <header className="lg:hidden shrink-0 border-b border-white/[0.06] bg-[#0D0D0F]/90 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3">
            <Link
              href="/"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/55 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            {/* search bar */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search published…"
                className="h-10 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] pl-9 pr-9 text-[13px] text-white placeholder:text-white/25 outline-none transition focus:border-white/[0.18]"
              />
              {search ? (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9px] text-white/20 sm:block">⌘K</kbd>
              )}
            </div>

            {/* Publish button — mobile */}
            <button
              type="button"
              onClick={() => setPublishOpen(true)}
              className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.05] text-white/50 transition hover:border-white/[0.18] hover:text-white/85 active:scale-95"
              aria-label="Publish something"
            >
              <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
            </button>

            {/* trending drawer button — commented out for now */}
            {/* <button
              type="button"
              onClick={() => setTrendDrawerOpen(true)}
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${
                trendDrawerOpen
                  ? 'border-orange-500/30 bg-orange-500/10 text-orange-400'
                  : 'border-white/[0.08] bg-white/[0.04] text-white/45'
              }`}
            >
              <TrendingUp className="h-4 w-4" />
              {Object.keys(trendCounts).length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-orange-500 text-[7px] font-bold text-white">🔥</span>
              )}
            </button> */}

            {/* filter button */}
            <button
              type="button"
              onClick={() => setFiltersOpen(o => !o)}
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${
                filtersOpen || totalFilterCount > 0
                  ? 'border-white/20 bg-white/[0.09] text-white'
                  : 'border-white/[0.08] bg-white/[0.04] text-white/45'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              {totalFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white text-[8px] font-bold text-slate-950 px-1">
                  {totalFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Task 13 — filters stay horizontally scrollable on small screens
              instead of being compressed. Same TABS config, same activeTab
              state and the Task 11 category treatment for the active chip. */}
          <div
            style={{
              maxHeight: !isSearching && tabBarVisible ? '52px' : '0px',
              opacity:   !isSearching && tabBarVisible ? 1 : 0,
              overflow:  'hidden',
              transition: 'max-height 0.32s cubic-bezier(0.22,1,0.36,1), opacity 0.22s ease',
              willChange: 'max-height, opacity',
            }}
          >
            <div className="overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max gap-2">
                {TABS.map(tab => {
                  const isActive = tab.id === activeTab;
                  const count    = tabCount(tab.id);
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => { setActiveTab(tab.id as TabId); setSearch(''); }}
                      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-2xl border px-3 py-1.5 text-[11px] font-semibold transition ${
                        isActive
                          ? feedCategoryTreatment(tab.id).badgeCls
                          : 'border-white/[0.07] bg-white/[0.03] text-white/38 hover:border-white/[0.12] hover:text-white/65'
                      }`}
                    >
                      <tab.icon className="h-3 w-3 shrink-0" />
                      {tab.label}
                      {count > 0 && (
                        <span className={`text-[9px] font-bold tabular-nums ${isActive ? 'opacity-60' : 'text-white/20'}`}>{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </header>

        {/* ── Comprehensive filter panel (all tabs) ── */}
        <div
          className="shrink-0 overflow-hidden"
          style={{
            display: 'grid',
            gridTemplateRows: filtersOpen ? '1fr' : '0fr',
            transition: 'grid-template-rows 0.3s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <div className="overflow-hidden">
            <div className="border-b border-white/[0.06] bg-[#0b0c0f] px-4 lg:px-5 py-3 space-y-2">

              {/* ── Row: Time period ── */}
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Time</span>
                {([
                  {v:'all', l:'All time'}, {v:'today', l:'Today'},
                  {v:'week', l:'This week'}, {v:'month', l:'This month'}, {v:'year', l:'This year'},
                ] as const).map(opt => (
                  <button key={opt.v} type="button" onClick={() => setDateRange(opt.v)}
                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${dateRange === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                  >{opt.l}</button>
                ))}
              </div>

              {/* ── Row: Sort + Status ── */}
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Sort</span>
                {([
                  {v:'recent', l:'Newest'}, {v:'oldest', l:'Oldest'},
                  {v:'popular', l:'Popular'}, {v:'alpha', l:'A–Z'}, {v:'trending', l:'🔥 Trending'},
                ] as const).map(opt => (
                  <button key={opt.v} type="button" onClick={() => setSortBy(opt.v)}
                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${sortBy === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                  >{opt.l}</button>
                ))}
                <div className="h-3.5 w-px shrink-0 bg-white/[0.07]" />
                <button type="button" onClick={() => setFeaturedOnly(v => !v)}
                  className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${featuredOnly ? 'bg-amber-500/[0.12] border-amber-400/[0.25] text-amber-300/80' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                >
                  <Star className="h-3 w-3" />Featured only
                </button>
                <button type="button" onClick={() => setLiveOnly(v => !v)}
                  className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${liveOnly ? 'bg-emerald-500/[0.12] border-emerald-400/[0.25] text-emerald-300/80' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                >
                  <Globe className="h-3 w-3" />Live items only
                </button>
              </div>

              {/* ── NEWS / ARTICLE: read time ── */}
              {(activeTab === 'news' || activeTab === 'article' || activeTab === 'all') && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide border-t border-white/[0.04] pt-2">
                  <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Read</span>
                  {([{v:'',l:'Any'},{v:'short',l:'Quick <5 min'},{v:'medium',l:'5–15 min'},{v:'long',l:'Long >15 min'}] as const).map(opt => (
                    <button key={opt.v} type="button" onClick={() => setReadTime(opt.v)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${readTime === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{opt.l}</button>
                  ))}
                </div>
              )}

              {/* ── DOCUMENT: file type ── */}
              {(activeTab === 'document' || activeTab === 'all') && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide border-t border-white/[0.04] pt-2">
                  <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Type</span>
                  {([{v:'',l:'Any format'},{v:'PDF',l:'PDF'},{v:'DOCX',l:'Word'},{v:'XLSX',l:'Excel'},{v:'free',l:'Free'}] as const).map(opt => (
                    <button key={opt.v} type="button" onClick={() => setDocFileType(opt.v)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${docFileType === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{opt.l}</button>
                  ))}
                </div>
              )}

              {/* ── JOB: work mode + type + salary ── */}
              {(activeTab === 'job' || activeTab === 'all') && (
                <>
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide border-t border-white/[0.04] pt-2">
                    <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Work</span>
                    {([{v:'',l:'Any mode'},{v:'Remote',l:'Remote'},{v:'Hybrid',l:'Hybrid'},{v:'Onsite',l:'Onsite'}] as const).map(opt => (
                      <button key={opt.v} type="button" onClick={() => setJobWorkMode(opt.v)}
                        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${jobWorkMode === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                      >{opt.l}</button>
                    ))}
                    <div className="h-3.5 w-px shrink-0 bg-white/[0.07]" />
                    {([{v:'',l:'Any type'},{v:'Full-time',l:'Full-time'},{v:'Part-time',l:'Part-time'},{v:'Contract',l:'Contract'}] as const).map(opt => (
                      <button key={opt.v} type="button" onClick={() => setJobType(opt.v)}
                        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${jobType === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                      >{opt.l}</button>
                    ))}
                    <div className="h-3.5 w-px shrink-0 bg-white/[0.07]" />
                    {([{v:'',l:'Any salary'},{v:'entry',l:'<₹20 LPA'},{v:'mid',l:'₹20–50 LPA'},{v:'senior',l:'>₹50 LPA'}] as const).map(opt => (
                      <button key={opt.v} type="button" onClick={() => setSalaryRange(opt.v)}
                        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${salaryRange === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                      >{opt.l}</button>
                    ))}
                  </div>
                </>
              )}

              {/* ── EVENT: type + mode + upcoming ── */}
              {(activeTab === 'event' || activeTab === 'all') && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide border-t border-white/[0.04] pt-2">
                  <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Event</span>
                  {([{v:'',l:'All types'},{v:'Conference',l:'Conference'},{v:'Meetup',l:'Meetup'},{v:'Summit',l:'Summit'},{v:'Workshop',l:'Workshop'},{v:'Hacknight',l:'Hacknight'},{v:'Expo',l:'Expo'}] as const).map(opt => (
                    <button key={opt.v} type="button" onClick={() => setEventType(opt.v)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${eventType === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{opt.l}</button>
                  ))}
                  <div className="h-3.5 w-px shrink-0 bg-white/[0.07]" />
                  {([{v:'',l:'Anywhere'},{v:'online',l:'Online'},{v:'inperson',l:'In-person'}] as const).map(opt => (
                    <button key={opt.v} type="button" onClick={() => setEventMode(opt.v)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${eventMode === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{opt.l}</button>
                  ))}
                  <div className="h-3.5 w-px shrink-0 bg-white/[0.07]" />
                  <button type="button" onClick={() => setUpcomingOnly(v => !v)}
                    className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${upcomingOnly ? 'bg-sky-500/[0.12] border-sky-400/[0.25] text-sky-300/80' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                  >
                    <CalendarDays className="h-3 w-3" />Upcoming only
                  </button>
                </div>
              )}

              {/* ── HACKATHON: prize + format ── */}
              {(activeTab === 'hackathon' || activeTab === 'all') && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide border-t border-white/[0.04] pt-2">
                  <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Hack</span>
                  {([{v:'',l:'Any prize'},{v:'small',l:'<₹5L'},{v:'medium',l:'₹5–20L'},{v:'large',l:'>₹20L'}] as const).map(opt => (
                    <button key={opt.v} type="button" onClick={() => setHackPrize(opt.v)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${hackPrize === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{opt.l}</button>
                  ))}
                  <div className="h-3.5 w-px shrink-0 bg-white/[0.07]" />
                  {([{v:'',l:'Any format'},{v:'online',l:'Online'},{v:'inperson',l:'In-person'},{v:'async',l:'Async'}] as const).map(opt => (
                    <button key={opt.v} type="button" onClick={() => setHackFormat(opt.v)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${hackFormat === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{opt.l}</button>
                  ))}
                </div>
              )}

              {/* ── RESUME: availability ── */}
              {(activeTab === 'resume' || activeTab === 'all') && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide border-t border-white/[0.04] pt-2">
                  <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Avail</span>
                  {([{v:'',l:'Any status'},{v:'open',l:'Open to work'},{v:'freelance',l:'Freelance'},{v:'available',l:'Available'}] as const).map(opt => (
                    <button key={opt.v} type="button" onClick={() => setResumeAvail(opt.v)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${resumeAvail === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{opt.l}</button>
                  ))}
                </div>
              )}

              {/* ── PRODUCT: price range ── */}
              {(activeTab === 'product' || activeTab === 'all') && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide border-t border-white/[0.04] pt-2">
                  <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Price</span>
                  {([{v:'',l:'Any price'},{v:'free',l:'Free'},{v:'budget',l:'<₹1k'},{v:'mid',l:'₹1k–5k'},{v:'premium',l:'>₹5k'}] as const).map(opt => (
                    <button key={opt.v} type="button" onClick={() => setProductPrice(opt.v)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${productPrice === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{opt.l}</button>
                  ))}
                </div>
              )}

              {/* ── TUTORIAL: difficulty (Task 14) ── */}
              {(activeTab === 'tutorial' || activeTab === 'all') && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide border-t border-white/[0.04] pt-2">
                  <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Level</span>
                  {([{v:'',l:'Any level'},{v:'beginner',l:'Beginner'},{v:'intermediate',l:'Intermediate'},{v:'advanced',l:'Advanced'}] as const).map(opt => (
                    <button key={opt.v} type="button" onClick={() => setTutorialLevel(v => v === opt.v ? '' : opt.v)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${tutorialLevel === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{opt.l}</button>
                  ))}
                </div>
              )}

              {/* ── Task 14: tags / location / creator (from existing item data) ── */}
              {discoveryOptions.tags.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide border-t border-white/[0.04] pt-2">
                  <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Tags</span>
                  {[{v:'',l:'Any tag'}, ...discoveryOptions.tags.map(t => ({ v: t, l: t }))].map(opt => (
                    <button key={opt.v || 'any-tag'} type="button" onClick={() => setTagFilter(v => v === opt.v ? '' : opt.v)}
                      className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${tagFilter === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{opt.l}</button>
                  ))}
                </div>
              )}

              {discoveryOptions.locations.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide border-t border-white/[0.04] pt-2">
                  <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Where</span>
                  {[{v:'',l:'Anywhere'}, ...discoveryOptions.locations.map(l => ({ v: l, l }))].map(opt => (
                    <button key={opt.v || 'anywhere'} type="button" onClick={() => setLocationFilter(v => v === opt.v ? '' : opt.v)}
                      className={`shrink-0 flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${locationFilter === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{opt.v && <MapPin className="h-3 w-3" />}{opt.l}</button>
                  ))}
                </div>
              )}

              {discoveryOptions.creators.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide border-t border-white/[0.04] pt-2">
                  <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">By</span>
                  {[{v:'',l:'Anyone'}, ...discoveryOptions.creators.map(c => ({ v: c, l: c }))].map(opt => (
                    <button key={opt.v || 'anyone'} type="button" onClick={() => setCreatorFilter(v => v === opt.v ? '' : opt.v)}
                      className={`shrink-0 flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${creatorFilter === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >{opt.v && <User className="h-3 w-3" />}{opt.l}</button>
                  ))}
                </div>
              )}

              {/* ── GIG: all gig-specific filters ── */}
              {(activeTab === 'gig') && (
                <>
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide border-t border-white/[0.04] pt-2">
                    <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Cat</span>
                    {[{v:'',l:'All'}, ...gigCategoryOptions.map(c=>({v:c,l:c}))].map(opt => (
                      <button key={opt.v} type="button" onClick={() => setGigCat(c => c === opt.v ? '' : opt.v)}
                        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold capitalize whitespace-nowrap border transition-all duration-150 ${gigCat === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                      >{opt.l || 'All'}</button>
                    ))}
                    <div className="h-3.5 w-px shrink-0 bg-white/[0.07]" />
                    {(['recent','bids'] as const).map(opt => (
                      <button key={opt} type="button" onClick={() => setGigSort(opt)}
                        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${gigSort === opt ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                      >{opt === 'bids' ? 'Most Bids' : 'Recent'}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                    <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Eng</span>
                    {([['','Any'],['one_time','One-time'],['ongoing','Ongoing'],['retainer','Retainer']] as const).map(([val,label]) => (
                      <button key={val} type="button" onClick={() => setGigEngagement(v => v === val ? '' : val)}
                        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${gigEngagement === val ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                      >{label}</button>
                    ))}
                    <div className="h-3.5 w-px shrink-0 bg-white/[0.07]" />
                    {([['','Anywhere'],['remote','Remote'],['hybrid','Hybrid'],['onsite','Onsite']] as const).map(([val,label]) => (
                      <button key={val} type="button" onClick={() => setGigLocation(v => v === val ? '' : val)}
                        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap capitalize border transition-all duration-150 ${gigLocation === val ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                      >{label}</button>
                    ))}
                    <div className="h-3.5 w-px shrink-0 bg-white/[0.07]" />
                    {([['','All types'],['fixed','Fixed'],['bidding','Bidding']] as const).map(([val,label]) => (
                      <button key={val} type="button" onClick={() => setGigBidMode(v => v === val ? '' : val)}
                        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${gigBidMode === val ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                      >{label}</button>
                    ))}
                    <div className="h-3.5 w-px shrink-0 bg-white/[0.07]" />
                    <button type="button" onClick={() => setGigUrgent(v => !v)}
                      className={`shrink-0 flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap border transition-all duration-150 ${gigUrgent ? 'bg-amber-500/[0.12] border-amber-400/[0.25] text-amber-300/80' : 'border-white/[0.06] text-white/35 hover:border-white/[0.12] hover:text-white/65'}`}
                    >⚡ Urgent</button>
                  </div>
                  {gigSkillOptions.length > 0 && (
                    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                      <span className="shrink-0 w-8 text-[8px] font-bold uppercase tracking-[0.2em] text-white/20">Skill</span>
                      {[{v:'',l:'Any'}, ...gigSkillOptions.map(s=>({v:s,l:s}))].map(opt => (
                        <button key={opt.v} type="button" onClick={() => setGigSkill(s => s === opt.v ? '' : opt.v)}
                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap border transition-all duration-150 ${gigSkill === opt.v ? 'bg-white/[0.12] border-white/[0.18] text-white' : 'border-white/[0.06] text-white/30 hover:border-white/[0.12] hover:text-white/60'}`}
                        >{opt.l || 'Any'}</button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── Footer: count + clear all ── */}
              {totalFilterCount > 0 && (
                <div className="flex items-center justify-between border-t border-white/[0.04] pt-2">
                  <span className="text-[10px] text-white/25">
                    {totalFilterCount} filter{totalFilterCount > 1 ? 's' : ''} active · <span className="font-semibold text-white/45">{allItems.length}</span> result{allItems.length !== 1 ? 's' : ''}
                  </span>
                  <button type="button" onClick={clearAllFilters}
                    className="flex items-center gap-1 rounded-full border border-rose-500/[0.20] bg-rose-500/[0.08] px-3 py-1 text-[10.5px] font-semibold text-rose-300/70 transition hover:bg-rose-500/[0.14]"
                  >
                    <X className="h-3 w-3" />Clear all filters
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ── Active filter chip strip ── */}
        {totalFilterCount > 0 && !isSearching && (
          <div className="shrink-0 border-b border-white/[0.04] bg-[#0D0D0F] px-4 lg:px-5 py-2 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1.5 min-w-max">
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.18em] text-white/20 pr-1">Active</span>
              {sortBy !== 'recent' && <ActiveChip label={`Sort: ${sortBy === 'popular' ? 'Popular' : sortBy === 'oldest' ? 'Oldest' : sortBy === 'trending' ? '🔥 Trending' : 'A–Z'}`} onRemove={() => setSortBy('recent')} />}
              {dateRange !== 'all' && <ActiveChip label={{ today:'Today', week:'This week', month:'This month', year:'This year' }[dateRange]!} onRemove={() => setDateRange('all')} />}
              {featuredOnly && <ActiveChip label="Featured only" onRemove={() => setFeaturedOnly(false)} />}
              {liveOnly     && <ActiveChip label="Live items"    onRemove={() => setLiveOnly(false)} />}
              {readTime     && <ActiveChip label={`Read: ${readTime}`} onRemove={() => setReadTime('')} />}
              {docFileType  && <ActiveChip label={`Format: ${docFileType}`} onRemove={() => setDocFileType('')} />}
              {jobWorkMode  && <ActiveChip label={jobWorkMode}  onRemove={() => setJobWorkMode('')} />}
              {jobType      && <ActiveChip label={jobType}      onRemove={() => setJobType('')} />}
              {salaryRange  && <ActiveChip label={`Pay: ${salaryRange === 'entry' ? '<₹20L' : salaryRange === 'mid' ? '₹20–50L' : '>₹50L'}`} onRemove={() => setSalaryRange('')} />}
              {eventType    && <ActiveChip label={eventType}    onRemove={() => setEventType('')} />}
              {eventMode    && <ActiveChip label={eventMode === 'online' ? 'Online' : 'In-person'} onRemove={() => setEventMode('')} />}
              {upcomingOnly && <ActiveChip label="Upcoming only" onRemove={() => setUpcomingOnly(false)} />}
              {hackPrize    && <ActiveChip label={`Prize: ${hackPrize === 'small' ? '<₹5L' : hackPrize === 'medium' ? '₹5–20L' : '>₹20L'}`} onRemove={() => setHackPrize('')} />}
              {hackFormat   && <ActiveChip label={`Format: ${hackFormat}`} onRemove={() => setHackFormat('')} />}
              {resumeAvail  && <ActiveChip label={resumeAvail}  onRemove={() => setResumeAvail('')} />}
              {productPrice && <ActiveChip label={`Price: ${productPrice}`} onRemove={() => setProductPrice('')} />}
              {gigCat       && <ActiveChip label={`Gig: ${gigCat}`}    onRemove={() => setGigCat('')} />}
              {gigEngagement && <ActiveChip label={gigEngagement}       onRemove={() => setGigEngagement('')} />}
              {gigLocation  && <ActiveChip label={gigLocation}          onRemove={() => setGigLocation('')} />}
              {gigBidMode   && <ActiveChip label={gigBidMode}           onRemove={() => setGigBidMode('')} />}
              {gigSkill     && <ActiveChip label={`Skill: ${gigSkill}`} onRemove={() => setGigSkill('')} />}
              {gigUrgent    && <ActiveChip label="Urgent only"          onRemove={() => setGigUrgent(false)} />}
              <button type="button" onClick={clearAllFilters}
                className="shrink-0 ml-1 flex items-center gap-0.5 rounded-full border border-rose-500/[0.15] bg-rose-500/[0.07] px-2.5 py-0.5 text-[9.5px] font-semibold text-rose-300/60 transition hover:bg-rose-500/[0.12] hover:text-rose-300/80"
              >
                <X className="h-2.5 w-2.5" />Clear all
              </button>
            </div>
          </div>
        )}

        {/* ── Scrollable content area ── */}
        <div ref={feedScrollRef} className="flex-1 overflow-y-auto min-h-0 bg-[#0D0D0F]">
          <div className="py-4 px-0 sm:p-4 lg:py-6 lg:px-8 pb-24 lg:pb-10 space-y-10 max-w-3xl mx-auto w-full">

            {isSearching ? (
              <SearchResults items={allItems} query={search} />
            ) : feedLoading ? (
              <>
                <style>{`
                  @keyframes feed-shimmer {
                    0%   { background-position: -600px 0; }
                    100% { background-position: 600px 0; }
                  }
                  .feed-skel {
                    background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%);
                    background-size: 600px 100%;
                    animation: feed-shimmer 1.4s infinite linear;
                    border-radius: 6px;
                  }
                `}</style>
                <div className="divide-y divide-white/[0.05]">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="py-5 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <div className="feed-skel h-5 w-16 rounded-full" />
                        <div className="feed-skel h-3.5 w-24" />
                      </div>
                      <div className="feed-skel h-5 w-3/4" />
                      <div className="feed-skel h-4 w-full" />
                      <div className="feed-skel h-4 w-5/6" />
                      <div className="flex items-center gap-4 mt-1">
                        <div className="feed-skel h-3.5 w-10" />
                        <div className="feed-skel h-3.5 w-10" />
                        <div className="feed-skel h-3.5 w-10" />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : mixedFeed.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/[0.08] bg-white/[0.04]">
                  <Search className="h-7 w-7 text-white/20" />
                </div>
                <p className="text-[15px] font-semibold text-white">Nothing published yet{activeTab !== 'all' ? ' in this category' : ''}.</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-white/[0.05]">
                  {mixedFeed.slice(0, visibleCount).map(item =>
                    item.category === 'gig' && item.gigData
                      ? <GigCard key={item.id} item={item} />
                      : item.category === 'post'
                        ? <PostCard key={item.id} item={item} searchQuery="" />
                        : item.featured
                          ? <FeaturedCard key={item.id} item={item} />
                          : item.category === 'poll'
                            ? <PollCard key={item.id} item={item} />
                            : item.category === 'survey'
                              ? <SurveyCard key={item.id} item={item} />
                              : item.category === 'chart'
                                ? <ChartCard key={item.id} item={item} />
                                : <PublishedCard key={item.id} item={item} searchQuery="" />
                  )}
                </div>

                {/* ── Client-side show more (within loaded pages) ── */}
                {visibleCount < mixedFeed.length && (
                  <div ref={loadMoreSentinelRef} className="flex flex-col items-center gap-3 pt-4 pb-2">
                    <button
                      type="button"
                      onClick={() => setVisibleCount(c => c + 10)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.09] bg-white/[0.04] px-6 py-2.5 text-[12.5px] font-semibold text-white/55 transition-all hover:bg-white/[0.08] hover:text-white hover:border-white/[0.16] active:scale-[0.97]"
                    >
                      Show more
                      <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-bold text-white/40">
                        {Math.min(10, mixedFeed.length - visibleCount)}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </button>
                  </div>
                )}

                {/* ── Load next page from server ── */}
                {visibleCount >= mixedFeed.length && serverHasMore && (
                  <div className="flex flex-col items-center gap-3 pt-4 pb-2">
                    <button
                      type="button"
                      disabled={serverLoadingMore}
                      onClick={() => {
                        if (serverLoadingMore) return;
                        setServerLoadingMore(true);
                        const nextPage = serverPage + 1;
                        fetch(`/api/public/published?limit=20&page=${nextPage}`)
                          .then(r => r.ok ? r.json() : { items: [], hasMore: false })
                          .then((d: { items: PublishedItem[]; hasMore?: boolean }) => {
                            if (Array.isArray(d.items) && d.items.length > 0) {
                              setRealItems(prev => [...prev, ...d.items]);
                              setServerPage(nextPage);
                              setServerHasMore(d.hasMore ?? false);
                              setVisibleCount(c => c + d.items.length);
                            }
                          })
                          .catch(() => {})
                          .finally(() => setServerLoadingMore(false));
                      }}
                      className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.09] bg-white/[0.04] px-6 py-2.5 text-[12.5px] font-semibold text-white/55 transition-all hover:bg-white/[0.08] hover:text-white hover:border-white/[0.16] active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {serverLoadingMore ? (
                        <>
                          <svg className="h-3.5 w-3.5 animate-spin opacity-60" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                          </svg>
                          Loading…
                        </>
                      ) : (
                        <>
                          Load more posts
                          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* All loaded indicator */}
                {visibleCount >= mixedFeed.length && !serverHasMore && mixedFeed.length > 10 && (
                  <div className="flex items-center gap-3 pt-4 pb-2">
                    <div className="flex-1 h-px bg-white/[0.05]" />
                    <p className="text-[10.5px] text-white/20 shrink-0">All caught up</p>
                    <div className="flex-1 h-px bg-white/[0.05]" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Right Trending Panel (xl+) ── */}
      <aside className="hidden xl:flex w-72 2xl:w-80 shrink-0 flex-col border-l border-white/[0.06] bg-[#0D0D0F] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.05] shrink-0">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-orange-400/60" />
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">Live Feed</span>
          </div>
          {sortBy === 'trending' && (
            <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[9.5px] font-bold text-orange-400">🔥 On</span>
          )}
        </div>
        <TrendingPanel
          allItems={allItems}
          onTagClick={tag => setSearch(tag)}
          onCategoryClick={cat => { setActiveTab(cat as TabId); setSearch(''); }}
          setSortTrending={() => setSortBy('trending')}
        />
      </aside>
      </div>

      {/* ══════════════════════════════════════
          MOBILE TRENDING DRAWER
      ══════════════════════════════════════ */}
      {trendDrawerOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[150] flex flex-col justify-end xl:hidden"
          onClick={() => setTrendDrawerOpen(false)}
        >
          {/* backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />

          {/* sheet */}
          <div
            className="relative flex flex-col overflow-hidden rounded-t-3xl border-t border-white/[0.09] bg-[#111116] shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
            style={{ maxHeight: '85dvh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* handle + header */}
            <div className="shrink-0 px-4 pt-3 pb-0">
              {/* drag handle */}
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/[0.12]" />

              <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-orange-400/70" />
                  <span className="text-[14px] font-bold text-white">Live Feed</span>
                  {Object.keys(trendCounts).length > 0 && (
                    <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-400">
                      {Object.values(trendCounts).reduce((a, b) => a + b, 0)} 🔥
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setTrendDrawerOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/40 hover:text-white transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* scrollable content */}
            <div className="flex-1 overflow-hidden">
              <TrendingPanel
                allItems={allItems}
                onTagClick={tag => { setSearch(tag); setTrendDrawerOpen(false); }}
                onCategoryClick={cat => { setActiveTab(cat as TabId); setSearch(''); setTrendDrawerOpen(false); }}
                setSortTrending={() => { setSortBy('trending'); setTrendDrawerOpen(false); }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ══════════════════════════════════════
          MOBILE BOTTOM NAV — commented out (replaced by horizontal tab chips in header)
      ══════════════════════════════════════ */}
      {/* <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-white/[0.07] bg-[#0D0D0F]/95 backdrop-blur-2xl">
        <div className="flex">
          {MOBILE_NAV.map(tab => {
            const isActive = activeTab === tab.id;
            const isFeat   = tab.id === 'featured';
            const activeColor = isFeat ? 'text-amber-400/80' : 'text-white/75';
            const indicatorBg = isFeat ? 'bg-amber-400/60' : 'bg-white/40';
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setActiveTab(tab.id as TabId); setSearch(''); }}
                className="relative flex flex-1 flex-col items-center gap-1 py-3 transition-colors"
              >
                {isActive && (
                  <span className={`absolute top-0 left-1/2 h-[1.5px] w-6 -translate-x-1/2 rounded-full ${indicatorBg}`} />
                )}
                <tab.icon className={`h-5 w-5 transition-all ${isActive ? activeColor : 'text-white/28'}`} />
                <span className={`text-[9.5px] font-semibold tracking-wide transition-colors ${isActive ? activeColor : 'text-white/28'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
        <div className="h-safe-bottom" />
      </nav> */}
    </div>
  );
}