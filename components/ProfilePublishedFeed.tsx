'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { isInternalCtaUrl } from '@/lib/cta';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Download,
  ExternalLink,
  FileText,
  Heart,
  MessageSquare,
  Newspaper,
  Plus,
  Send,
  Share2,
  Terminal,
  TrendingUp,
  MapPin,
  Target,
  Trophy,
  User,
  Users,
  Zap,
  Clock,
  Tag,
  Sparkles,
  Globe,
  Megaphone,
  Briefcase,
  Star,
} from 'lucide-react';
import { REACTION_META, type ReactionType, type ReactionSummary } from '@/lib/reactions';
import { usePostReactions, PostReactionButton, PostReactionSummaryBar } from '@/components/social/PostReactionButton';

/* ─── types ─────────────────────────────────────────────────────── */
export type FeedItem = {
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
  featuredPlan?: string;
  isReal?: boolean;
  likesCount?: number;
  likedByViewer?: boolean;
  reactions?: ReactionSummary & { previewAvatars?: string[] };
  trendCount?: number;
  trendedByViewer?: boolean;
  commentsCount?: number;
  thumbnailUrl?: string;
  cta?: { label: string; url: string };
  applicationUrl?: string;
  uploadedByUserId?: string;
  uploadedByName?: string;
  videoUrl?: string;
  mimeType?: string | null;
  moderationStatus?: 'active' | 'suspended' | 'removed' | 'under_review';
  moderationNote?: string;
  reportCount?: number;
};

type CardComment = {
  id: string; author: string; text: string; createdAt: string;
  userId?: string; parentId?: string | null;
  likesCount: number; likedByViewer: boolean;
  replies?: CardComment[];
};

type ModalVariant = 'apply' | 'register';

/* ─── tag colours matching main feed ────────────────────────────── */
const TAG_CLS: Record<string, string> = {
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
  post:         'bg-rose-500/10 text-rose-400 border-rose-500/20',
  poll:         'bg-violet-500/10 text-violet-400 border-violet-500/20',
  survey:       'bg-amber-500/10 text-amber-400 border-amber-500/20',
  chart:        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  thread:       'bg-sky-500/10 text-sky-400 border-sky-500/20',
  video:        'bg-red-500/10 text-red-400 border-red-500/20',
  milestone:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  tutorial:     'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
};

const AVATAR_CLS = 'bg-white/[0.08] text-white/55 ring-1 ring-white/[0.07]';

/* ─── toast ──────────────────────────────────────────────────────── */
type ToastEntry = { id: number; msg: string; type: 'success' | 'error' | 'info'; emoji?: string };
let _profilePushToast: ((t: Omit<ToastEntry, 'id'>) => void) | null = null;

function toast(msg: string, type: ToastEntry['type'] = 'success', emoji?: string) {
  _profilePushToast?.({ msg, type, emoji });
}

function ToastContainer() {
  const [list, setList] = useState<ToastEntry[]>([]);
  const ctr = useRef(0);
  const add = useCallback((t: Omit<ToastEntry, 'id'>) => {
    const id = ++ctr.current;
    setList(p => [...p.slice(-4), { ...t, id }]);
    setTimeout(() => setList(p => p.filter(x => x.id !== id)), 3000);
  }, []);
  useEffect(() => { _profilePushToast = add; return () => { _profilePushToast = null; }; }, [add]);
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

/* ─── utilities ─────────────────────────────────────────────────── */
function trackCTA(ctaId: string, category: string) {
  try {
    const raw = localStorage.getItem('pub_cta_analytics') || '{}';
    const data = JSON.parse(raw) as Record<string, Record<string, number>>;
    data[category] ??= {};
    data[category][ctaId] = (data[category][ctaId] ?? 0) + 1;
    localStorage.setItem('pub_cta_analytics', JSON.stringify(data));
  } catch {}
}

async function shareItem(id: string, title: string) {
  const url = `${window.location.origin}/published/${id}`;
  if (navigator.share) {
    try { await navigator.share({ title, url }); return; } catch {}
  }
  await navigator.clipboard.writeText(url).catch(() => {});
  toast('Link copied to clipboard!', 'success', '🔗');
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)       return 'Just now';
  if (diff < 3_600_000)    return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)   return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7*86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short' });
}

const META_LINE_RE = /^(Registration URL|Shop URL|WhatsApp|Application URL)\s*:/i;
function getBodySnippet(raw: string, maxLen = 200): string {
  const cleaned = raw.replace(/https?:\/\/\S+/gi, '').replace(/\s{2,}/g, ' ').trim();
  const prose = cleaned.split(/\n+/).filter(l => l.trim() && !META_LINE_RE.test(l.trim())).join(' ').trim();
  return prose.length > maxLen ? `${prose.slice(0, maxLen).trimEnd()}…` : prose;
}

type MetaChip = { icon: React.ReactNode; label: string; value: string };
const ic = (I: React.ComponentType<{ className?: string }>) => <I className="h-3 w-3" />;

function cleanBody(raw: string) {
  return raw
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(Apply\s*(URL|Link|Here)?|Problem\s*Statements?|Eligibility|About\s*Us|Description)\s*:[^:]*?(?=\s+\w[\w\s/]*:|$)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const KV_FIELDS: { re: RegExp; label: string; icon: React.ReactNode }[] = [
  { re: /(?:Job|Job\s*Title|Position|Role)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'ROLE',       icon: ic(Briefcase) },
  { re: /Company\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                           label: 'COMPANY',    icon: ic(Briefcase) },
  { re: /Hackathon\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                         label: 'HACKATHON',  icon: ic(Zap) },
  { re: /Organisers?\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                       label: 'ORGANISER',  icon: ic(User) },
  { re: /(?:Themes?(?:\s*[/]\s*Tracks?)?)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i, label: 'TRACKS',     icon: ic(Target) },
  { re: /Prize\s*Pool\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                      label: 'PRIZE POOL', icon: ic(Trophy) },
  { re: /(?:Salary|CTC|Stipend|Package)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,    label: 'SALARY',     icon: ic(Tag) },
  { re: /Team\s*Size\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                       label: 'TEAM SIZE',  icon: ic(Users) },
  { re: /(?:Location|City|Venue|Place)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,     label: 'LOCATION',   icon: ic(MapPin) },
  { re: /(?:Work\s*)?(?:Mode|Type)\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,         label: 'MODE',       icon: ic(MapPin) },
  { re: /Event\s*Dates?\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                    label: 'DATE',       icon: ic(CalendarDays) },
  { re: /(?:Registration\s*)?Deadline\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,      label: 'DEADLINE',   icon: ic(CalendarDays) },
  { re: /Experience\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                        label: 'EXPERIENCE', icon: ic(Star) },
  { re: /Skills?\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                           label: 'SKILLS',     icon: ic(Sparkles) },
  { re: /Industry\s*:\s*([^:\n]+?)(?=\s+\w[\w\s/]*:|$)/i,                          label: 'INDUSTRY',   icon: ic(Globe) },
];

function bylineChips(byline: string, category: string): MetaChip[] {
  const parts = byline.split(/\s*·\s*/).map(s => s.trim()).filter(Boolean);
  const chips: MetaChip[] = [];
  const cat = category.toLowerCase();
  if (cat === 'news' || cat === 'article') {
    const read = parts.find(p => /min read/i.test(p));
    if (read) chips.push({ icon: ic(Clock), label: 'READ TIME', value: read });
  } else if (cat === 'document') {
    parts.forEach(p => {
      if (/\d+\s*pages?/i.test(p))               chips.push({ icon: ic(FileText), label: 'PAGES',  value: p });
      else if (/\d+.*\b(mb|kb|gb)\b/i.test(p))  chips.push({ icon: ic(Star),    label: 'SIZE',   value: p });
      else if (/^(pdf|docx|xlsx|pptx)$/i.test(p)) chips.push({ icon: ic(FileText), label: 'FORMAT', value: p.toUpperCase() });
    });
  } else if (cat === 'job') {
    if (parts[0]) chips.push({ icon: ic(Briefcase), label: 'COMPANY',  value: parts[0] });
    if (parts[1]) chips.push({ icon: ic(Target),    label: 'TEAM',     value: parts[1] });
    if (parts[2]) chips.push({ icon: ic(MapPin),    label: 'LOCATION', value: parts[2] });
  } else if (cat === 'resume') {
    if (parts[0]) chips.push({ icon: ic(Briefcase), label: 'ROLE', value: parts[0] });
    const exp = parts.find(p => /yr|year|exp/i.test(p));
    if (exp) chips.push({ icon: ic(Star), label: 'EXPERIENCE', value: exp });
    const loc = parts.find(p => /,\s*[A-Z]{2}$/.test(p) || /\b(remote|bengaluru|mumbai|delhi|hyderabad|pune|chennai)\b/i.test(p));
    if (loc) chips.push({ icon: ic(MapPin), label: 'LOCATION', value: loc });
  } else if (cat === 'event') {
    if (parts[0]) chips.push({ icon: ic(User),         label: 'ORGANISER', value: parts[0] });
    if (parts[1]) chips.push({ icon: ic(MapPin),       label: 'VENUE',     value: parts[1] });
    if (parts[2]) chips.push({ icon: ic(CalendarDays), label: 'DATE',      value: parts[2] });
  } else if (cat === 'announcement') {
    if (parts[0]) chips.push({ icon: ic(Megaphone), label: 'FROM', value: parts[0] });
    const reach = parts.find(p => /sent to/i.test(p));
    if (reach) chips.push({ icon: ic(Users), label: 'REACHED', value: reach.replace(/sent to\s*/i, '') });
  } else if (cat === 'product') {
    const price = parts.find(p => /[₹$€£]/.test(p) || /month|annual|lpa/i.test(p));
    if (price) chips.push({ icon: ic(Tag), label: 'PRICING', value: price });
    const billing = parts.find(p => /billing|annual|monthly/i.test(p));
    if (billing && billing !== price) chips.push({ icon: ic(Star), label: 'BILLING', value: billing });
  } else if (cat === 'portfolio') {
    const clientPart = parts.find(p => /^client\s*:/i.test(p));
    if (clientPart) chips.push({ icon: ic(Briefcase), label: 'CLIENT', value: clientPart.replace(/^client\s*:\s*/i, '') });
    const work = parts.find(p => /(design|dev|engineering|ux|ui|research)/i.test(p));
    if (work) chips.push({ icon: ic(Sparkles), label: 'WORK TYPE', value: work });
    const year = parts.find(p => /^\d{4}$/.test(p.trim()));
    if (year) chips.push({ icon: ic(CalendarDays), label: 'YEAR', value: year });
  }
  return chips;
}

function buildChips(body: string, byline: string, category: string): MetaChip[] {
  const cleaned = cleanBody(body);
  const kvChips: MetaChip[] = [];
  for (const { re, label, icon } of KV_FIELDS) {
    const m = cleaned.match(re);
    if (m) {
      const val = m[1].trim();
      if (val && val.length < 60) kvChips.push({ icon, label, value: val });
    }
  }
  if (kvChips.length >= 2) return kvChips;
  return bylineChips(byline, category);
}

function BodyOrChips({ body, byline, category }: { body: string; byline: string; category: string }) {
  const chips = buildChips(body, byline, category).slice(0, 5);
  if (!chips.length) return (
    <p className="mt-1.5 text-[13px] leading-relaxed text-white/50 line-clamp-2">{getBodySnippet(body)}</p>
  );
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {chips.map(c => (
        <span key={c.label}
          className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-1.5 backdrop-blur-sm">
          <span className="text-white/40 shrink-0">{c.icon}</span>
          <span className="text-[9px] font-bold tracking-[0.12em] uppercase text-white/30">{c.label}</span>
          <span className="text-[12px] font-semibold text-white/80 max-w-[120px] truncate">{c.value}</span>
        </span>
      ))}
    </div>
  );
}

/* ─── hooks ─────────────────────────────────────────────────────── */
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

function useTrend(item: FeedItem): [number, boolean, () => Promise<void>] {
  const [count, setCount]     = useState(item.trendCount ?? 0);
  const [trended, setTrended] = useState(item.trendedByViewer ?? false);
  const inFlight              = useRef(false);

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
          setTrended(d.trended); setCount(d.trendCount);
        } else { setTrended(trended); setCount(c => Math.max(0, c - delta)); }
      } catch { setTrended(trended); setCount(c => Math.max(0, c - delta)); }
      finally { inFlight.current = false; }
    }
  }, [item, trended]);

  return [count, trended, toggle];
}

/* ─── action modal ───────────────────────────────────────────────── */
const MODAL_CONFIG: Record<ModalVariant, { title: string; verb: string; emoji: string; successMsg: string }> = {
  apply:    { title: 'Apply Now',          verb: 'Submit Application',    emoji: '💼', successMsg: 'Application sent!' },
  register: { title: 'Register for Event', verb: 'Confirm Registration', emoji: '🎟️', successMsg: "You're registered!" },
};

function ActionModal({ variant, itemTitle, itemId, onClose }: {
  variant: ModalVariant; itemTitle: string; itemId?: string; onClose: () => void;
}) {
  const cfg = MODAL_CONFIG[variant];
  const [name, setName]   = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote]   = useState('');
  const [stage, setStage] = useState<'form' | 'success'>('form');
  const [busy, setBusy]   = useState(false);

  const submit = async () => {
    if (!name.trim() || !email.trim()) { toast('Name and email are required', 'error'); return; }
    setBusy(true);
    await new Promise(r => setTimeout(r, 600));
    if (itemId) {
      const ep = variant === 'apply' ? `/api/public/documents/${itemId}/apply` : `/api/public/documents/${itemId}/register`;
      fetch(ep, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email, note }) }).catch(() => {});
    }
    setBusy(false); setStage('success');
    toast(cfg.successMsg, 'success', cfg.emoji);
  };

  const inp = 'h-10 w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-3.5 text-[13px] text-white placeholder:text-white/25 outline-none transition focus:border-white/25 focus:bg-white/[0.07]';

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-md rounded-[24px] border border-white/[0.10] bg-[#0f0f14] p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        {stage === 'success' ? (
          <div className="py-6 text-center space-y-3">
            <div className="text-5xl">{cfg.emoji}</div>
            <p className="text-[18px] font-bold text-white">{cfg.successMsg}</p>
            <button type="button" onClick={onClose} className="mt-2 h-10 px-6 rounded-full bg-white text-[13px] font-bold text-black hover:bg-white/90 transition">Done</button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-[17px] font-bold text-white">{cfg.title}</p>
            <p className="text-[12px] text-white/40 -mt-2 line-clamp-2">{itemTitle}</p>
            <input className={inp} placeholder="Your full name *" value={name} onChange={e => setName(e.target.value)} />
            <input className={inp} placeholder="Email address *" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            <textarea rows={2} className="w-full rounded-xl border border-white/[0.10] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/25 outline-none transition focus:border-white/25 resize-none" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)} />
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="flex-1 h-10 rounded-full border border-white/[0.10] text-[13px] font-semibold text-white/50 hover:text-white/80 transition">Cancel</button>
              <button type="button" disabled={busy || !name.trim() || !email.trim()} onClick={() => void submit()}
                className="flex-1 h-10 rounded-full bg-white text-[13px] font-bold text-black disabled:opacity-40 transition hover:bg-white/90">
                {busy ? '…' : cfg.verb}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ─── trend button ───────────────────────────────────────────────── */
function TrendButton({ item }: { item: FeedItem }) {
  const [count, trended, toggle] = useTrend(item);
  return (
    <button type="button"
      onClick={e => { e.stopPropagation(); void toggle(); if (!trended) toast('Trending! 🔥', 'success', '🔥'); trackCTA('trend_post', item.category); }}
      className={`flex items-center gap-1.5 text-[12px] font-semibold transition-all ${trended ? 'text-orange-400' : 'text-white/30 hover:text-orange-400'}`}
    >
      <TrendingUp className={`h-4 w-4 transition-transform ${trended ? 'scale-110' : ''}`} />
      <span className="tabular-nums">{count > 0 ? (count >= 1000 ? `${(count/1000).toFixed(1)}k` : String(count)) : ''}</span>
    </button>
  );
}

/* ─── inline comment panel ───────────────────────────────────────── */
function CommentPanel({ item, onClose, onCountChange }: {
  item: FeedItem; onClose: () => void; onCountChange: (n: number) => void;
}) {
  const [comments, setComments] = useState<CardComment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo]   = useState<{ id: string; author: string } | null>(null);
  const [replyText, setReplyText] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const nest = (cs: CardComment[]) => {
    const byId: Record<string, CardComment> = {};
    const roots: CardComment[] = [];
    cs.forEach(c => { byId[c.id] = { ...c, replies: [] }; });
    Object.values(byId).forEach(c => {
      if (c.parentId && byId[c.parentId]) byId[c.parentId].replies!.push(c);
      else roots.push(c);
    });
    return roots;
  };

  useEffect(() => {
    fetch(`/api/public/published/${item.id}/comments`)
      .then(r => r.ok ? r.json() : { comments: [] })
      .then((d: { comments: CardComment[] }) => { setComments(nest(d.comments)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [item.id]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const countAll = (cs: CardComment[]): number => cs.reduce((a, c) => a + 1 + countAll(c.replies ?? []), 0);

  const submit = async (parentId?: string) => {
    const body = parentId ? replyText.trim() : text.trim();
    if (!body) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/published/${item.id}/comments`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: body, parentId }),
      });
      if (res.ok) {
        const d = await res.json() as { comments: CardComment[] };
        const nested = nest(d.comments);
        setComments(nested);
        onCountChange(countAll(nested));
        if (parentId) { setReplyText(''); setReplyTo(null); }
        else setText('');
      }
    } catch {} finally { setSubmitting(false); }
  };

  const likeComment = async (commentId: string) => {
    const toggle = (cs: CardComment[]): CardComment[] => cs.map(c => {
      if (c.id === commentId) {
        const next = !c.likedByViewer;
        return { ...c, likedByViewer: next, likesCount: next ? c.likesCount + 1 : Math.max(0, c.likesCount - 1) };
      }
      if (c.replies?.length) return { ...c, replies: toggle(c.replies) };
      return c;
    });
    setComments(prev => toggle(prev));
    await fetch(`/api/public/published/${item.id}/comments/${commentId}/like`, { method: 'POST' }).catch(() => {});
  };

  const ago = (iso: string) => {
    const d = Date.now() - new Date(iso).getTime();
    if (d < 60000) return 'now';
    if (d < 3600000) return `${Math.floor(d/60000)}m`;
    if (d < 86400000) return `${Math.floor(d/3600000)}h`;
    return `${Math.floor(d/86400000)}d`;
  };

  const renderComment = (c: CardComment, depth = 0): React.ReactNode => (
    <div key={c.id} className={depth > 0 ? 'ml-7 mt-2' : 'mt-3'}>
      <div className="flex gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-bold text-white/60">
          {c.author.slice(0,2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-semibold text-white/80">{c.author}</span>
            <span className="text-[10px] text-white/25">{ago(c.createdAt)}</span>
          </div>
          <p className="text-[12px] text-white/65 leading-relaxed mt-0.5 break-words">{c.text}</p>
          <div className="flex items-center gap-3 mt-1">
            <button type="button" onClick={() => void likeComment(c.id)}
              className={`flex items-center gap-1 text-[10px] font-semibold transition ${c.likedByViewer ? 'text-rose-400' : 'text-white/25 hover:text-rose-400'}`}>
              <Heart className={`h-3 w-3 ${c.likedByViewer ? 'fill-current' : ''}`} />
              {c.likesCount > 0 && <span>{c.likesCount}</span>}
            </button>
            {depth === 0 && (
              <button type="button"
                onClick={() => setReplyTo(replyTo?.id === c.id ? null : { id: c.id, author: c.author })}
                className="text-[10px] text-white/25 hover:text-white/55 font-semibold transition">
                Reply
              </button>
            )}
          </div>
          {replyTo?.id === c.id && (
            <div className="flex items-center gap-1.5 mt-2">
              <input autoFocus value={replyText} onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(c.id); } if (e.key === 'Escape') { setReplyTo(null); setReplyText(''); } }}
                placeholder={`Reply to ${c.author}…`}
                className="flex-1 rounded-lg bg-white/[0.07] px-2.5 py-1.5 text-[11px] text-white placeholder-white/25 outline-none border border-white/[0.08] focus:border-white/20"
              />
              <button type="button" disabled={!replyText.trim() || submitting} onClick={() => void submit(c.id)}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/50 hover:bg-white/20 disabled:opacity-30 transition">
                <Send className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      </div>
      {c.replies?.map(r => renderComment(r, depth + 1))}
    </div>
  );

  return (
    <div ref={panelRef} className="mt-3 rounded-2xl border border-white/[0.08] bg-[#0f0f14] p-4">
      <div className="max-h-52 overflow-y-auto pr-0.5 [scrollbar-width:none]">
        {loading && <p className="text-[11px] text-white/30 py-3 text-center">Loading…</p>}
        {!loading && comments.length === 0 && (
          <p className="text-[11px] text-white/25 py-3 text-center">No comments yet. Be the first!</p>
        )}
        {!loading && comments.map(c => renderComment(c))}
      </div>
      <div className="border-t border-white/[0.06] pt-3 mt-3">
        <div className="flex items-center gap-2">
          <input ref={undefined} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(); } }}
            placeholder="Write a comment…"
            className="flex-1 rounded-xl bg-white/[0.07] px-3 py-2 text-[12px] text-white placeholder-white/25 outline-none border border-white/[0.07] focus:border-white/20 transition"
          />
          <button type="button" disabled={!text.trim() || submitting} onClick={() => void submit()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 disabled:opacity-30 transition">
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── main feed card ─────────────────────────────────────────────── */
export function FeedCard({ item, isOwn, onDelete }: { item: FeedItem; isOwn: boolean; onDelete?: () => void }) {
  const [saved, toggleSaved]       = useBookmark(item.id, item.category);
  const [modal, setModal]          = useState<ModalVariant | null>(null);
  const [liked, setLiked]          = useState(item.likedByViewer ?? false);
  const [likeCount, setLikeCount]  = useState(item.likesCount ?? 0);
  /* One shared controller — same hook every other post surface uses. */
  const rx = usePostReactions(
    item.id,
    { likesCount: item.likesCount, likedByViewer: item.likedByViewer, reactions: item.reactions },
    { live: Boolean(item.isReal), onError: (m) => toast(m, 'error') },
  );
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(item.commentsCount ?? 0);
  const likeInFlight               = useRef(false);
  const cat                        = item.category;

  useEffect(() => { setLiked(item.likedByViewer ?? false); }, [item.likedByViewer]);
  useEffect(() => { setLikeCount(item.likesCount ?? 0); }, [item.likesCount]);
  useEffect(() => { if (item.commentsCount !== undefined) setCommentCount(item.commentsCount); }, [item.commentsCount]);

  const displayName = item.uploadedByName || item.byline.split(' · ')[0] || 'User';
  const initials    = displayName.split(/\s+/).slice(0,2).map(w => w[0]?.toUpperCase() ?? '').join('');
  const authorMeta  = item.byline.split(' · ').slice(1).join(' · ');

  const primCls  = 'inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-4 text-[12px] font-bold text-[#0D0D0F] transition hover:bg-white/90 active:scale-[0.98]';
  const ghostCls = 'inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.10] px-3.5 text-[12px] font-semibold text-white/55 transition hover:border-white/[0.20] hover:text-white/90';
  const iconCls  = 'flex h-8 w-8 items-center justify-center rounded-full text-white/35 transition hover:bg-white/[0.06] hover:text-white/70';

  const tagCls = TAG_CLS[cat] ?? 'bg-white/[0.07] text-white/45 border-white/[0.08]';

  const fmtCount = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n);

  return (
    <>
      {modal && <ActionModal variant={modal} itemTitle={item.title} itemId={item.id} onClose={() => setModal(null)} />}

      <article
        className="group py-5 border-b border-white/[0.05] last:border-0"
        onDoubleClick={rx.onBodyDoubleTap}
        onTouchEnd={rx.onBodyDoubleTap}
      >
        {/* header */}
        <div className="flex items-center gap-3 mb-3.5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${AVATAR_CLS}`}>
            {initials.slice(0,2) || <Newspaper className="h-3.5 w-3.5 opacity-60" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-semibold text-white leading-tight truncate">{displayName}</span>
              <span className={`hidden sm:inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tagCls}`}>
                {item.badge || cat}
              </span>
            </div>
            <p className="text-[11px] text-white/35 mt-0.5 truncate">
              {authorMeta ? `${authorMeta} · ` : ''}{timeAgo(item.postedAt)}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Moderation status badges — visible to the post owner */}
            {isOwn && item.moderationStatus === 'suspended' && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2.5 py-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M4.93 4.93l14.14 14.14"/></svg>
                Suspended
              </span>
            )}
            {isOwn && item.moderationStatus === 'under_review' && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-0.5">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                Under Review
              </span>
            )}
            {isOwn && item.moderationStatus === 'removed' && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500 bg-zinc-700/30 border border-zinc-600/20 rounded-full px-2.5 py-0.5">Removed</span>
            )}
            {isOwn && (!item.moderationStatus || item.moderationStatus === 'active') && (item.reportCount ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-full px-2.5 py-0.5">
                {item.reportCount} report{(item.reportCount ?? 0) > 1 ? 's' : ''}
              </span>
            )}
            {isOwn && (
              <Link href={`/published/${item.id}`} target="_blank"
                className="hidden sm:flex items-center gap-1 text-[11px] text-white/25 hover:text-white/60 transition border border-white/[0.07] rounded-full px-2.5 py-1">
                <ExternalLink className="h-3 w-3" /> View
              </Link>
            )}
            <button type="button" onClick={e => { e.stopPropagation(); toggleSaved(); }}
              className={`transition ${saved ? 'text-white/70' : 'text-white/25 hover:text-white/60'}`}>
              {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* thumbnail */}
        {item.thumbnailUrl && (
          <Link href={`/published/${item.id}`} className="block mb-3.5 -mx-0 rounded-xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.thumbnailUrl} alt={item.category === 'post' ? '' : item.title}
              className="w-full h-auto transition-transform duration-500 group-hover:scale-[1.01]" />
          </Link>
        )}

        {/* content */}
        {/* content — photo posts: body/caption only, never auto title */}
        <Link href={`/published/${item.id}`} className="block">
          {item.category !== 'post' && !/\.\w{2,5}$/i.test(item.title.trim()) && !['post', 'poll', 'document', 'file', 'image', 'photo', 'video', 'survey', 'article', 'upload'].includes(item.title.trim().toLowerCase()) && (
            <h3 className="text-[15px] font-bold leading-snug tracking-tight text-white line-clamp-2 group-hover:text-white/85 transition-colors">
              {item.title}
            </h3>
          )}
          {item.body?.trim() && <BodyOrChips body={item.body} byline={item.byline} category={item.category} />}
        </Link>


        {/* Call to action — a real link, outside the card's own <Link> so the
            click goes to the destination rather than the post. */}
        {item.cta?.url && item.cta.label && (
          <div className="mt-3">
            <a
              href={item.cta.url}
              {...(isInternalCtaUrl(item.cta.url) ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
              aria-label={item.cta.label}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex max-w-full items-center gap-1.5 rounded-[11px] border border-white/[0.14] bg-white/[0.08] px-3.5 py-2 text-[12.5px] font-semibold text-white/85 transition duration-150 hover:border-white/[0.22] hover:bg-white/[0.13] hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <span className="min-w-0 break-words text-left">{item.cta.label}</span>
              <span aria-hidden className="shrink-0">&rarr;</span>
            </a>
          </div>
        )}

        {/* chips */}
        {item.chips && item.chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {item.chips.slice(0,5).map(c => (
              <span key={c} className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] text-white/40">{c}</span>
            ))}
            {item.chips.length > 5 && (
              <span className="rounded-full bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-white/20">+{item.chips.length - 5}</span>
            )}
          </div>
        )}

        {/* stats */}
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

        {/* Reaction summary — compact: top three glyphs plus the total. */}
        <PostReactionSummaryBar c={rx} postId={item.id} fmtCount={fmtCount} />

        {/* engagement row */}
        <div className="flex items-center gap-3 mt-3.5 pt-3.5 border-t border-white/[0.05]" onClick={e => e.preventDefault()}>
          {/* like / reactions — shared component */}
          <PostReactionButton c={rx} />

          {/* comments */}
          <button type="button"
            onClick={e => { e.stopPropagation(); setCommentsOpen(v => !v); }}
            className={`flex items-center gap-1.5 text-[12px] font-semibold transition ${commentsOpen ? 'text-white/70' : 'text-white/30 hover:text-white/60'}`}>
            <MessageSquare className="h-4 w-4" />
            <span>{commentCount > 0 ? fmtCount(commentCount) : '0'}</span>
          </button>

          {/* trend */}
          <TrendButton item={item} />

          {/* category CTAs */}
          <div className="flex items-center gap-2 ml-auto">
            {(cat === 'news' || cat === 'article' || cat === 'announcement') && (
              <Link href={`/published/${item.id}`} className={ghostCls} onClick={e => e.stopPropagation()}>
                Read <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            {cat === 'document' && (
              <button type="button" onClick={e => { e.stopPropagation(); window.open(`/published/${item.id}`, '_blank'); }} className={ghostCls}>
                <Download className="h-3.5 w-3.5" /> Download
              </button>
            )}
            {cat === 'portfolio' && (
              <Link href={`/published/${item.id}`} className={ghostCls} onClick={e => e.stopPropagation()}>
                View Work <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            {cat === 'job' && (
              <button type="button" className={primCls}
                onClick={e => {
                  e.stopPropagation(); trackCTA('apply_job', cat);
                  if (item.applicationUrl) {
                    try {
                      const apps = JSON.parse(localStorage.getItem('pub_job_applications') || '[]') as Array<{itemId:string;title:string;appliedAt:number;url:string}>;
                      apps.unshift({ itemId: item.id, title: item.title, appliedAt: Date.now(), url: item.applicationUrl });
                      localStorage.setItem('pub_job_applications', JSON.stringify(apps.slice(0, 200)));
                    } catch {}
                    window.open(item.applicationUrl, '_blank', 'noopener,noreferrer');
                  } else setModal('apply');
                }}>
                Apply Now <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            {cat === 'resume' && (
              <Link href={`/published/${item.id}`} className={ghostCls} onClick={e => e.stopPropagation()}>
                View Profile <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            {cat === 'product' && (() => {
              const shopUrl = item.body?.match(/^Shop URL:\s*(.+)$/im)?.[1]?.trim() || '';
              return shopUrl ? (
                <button type="button" className={primCls} onClick={e => { e.stopPropagation(); window.open(shopUrl, '_blank', 'noopener,noreferrer'); }}>
                  Shop Now <ExternalLink className="h-3.5 w-3.5" />
                </button>
              ) : (
                <Link href={`/published/${item.id}`} className={primCls} onClick={e => e.stopPropagation()}>
                  View Product <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              );
            })()}
            {(cat === 'event' || cat === 'hackathon') && (
              <button type="button" className={primCls}
                onClick={e => {
                  e.stopPropagation(); trackCTA(cat === 'event' ? 'register_event' : 'register_hackathon', cat);
                  try {
                    const regUrl = item.body?.match(/^Registration URL:\s*(.+)$/im)?.[1]?.trim() || '';
                    const raw = localStorage.getItem('pub_registrations') || '[]';
                    const regs = JSON.parse(raw) as Array<{itemId:string;title:string;category:string;registeredAt:number}>;
                    if (!regs.find(r => r.itemId === item.id)) {
                      regs.unshift({ itemId: item.id, title: item.title, category: cat, registeredAt: Date.now() });
                      localStorage.setItem('pub_registrations', JSON.stringify(regs.slice(0, 200)));
                    }
                    if (regUrl) { window.open(regUrl, '_blank', 'noopener,noreferrer'); toast('Redirecting…', 'success', cat === 'event' ? '🎟️' : '🏆'); }
                    else setModal('register');
                  } catch { setModal('register'); }
                }}>
                Register <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            {!['news','article','document','portfolio','announcement','job','resume','product','event','hackathon'].includes(cat) && (
              <Link href={`/published/${item.id}`} className={ghostCls} onClick={e => e.stopPropagation()}>
                Open <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
            <button type="button" className={iconCls}
              onClick={e => { e.stopPropagation(); void shareItem(item.id, item.title); trackCTA('share_item', cat); }}>
              <Share2 className="h-4 w-4" />
            </button>
            {onDelete && (
              <button type="button"
                onClick={e => { e.stopPropagation(); onDelete(); }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-red-400/40 transition hover:bg-red-500/10 hover:text-red-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* inline comments */}
        {commentsOpen && item.isReal && (
          <CommentPanel item={item} onClose={() => setCommentsOpen(false)} onCountChange={n => setCommentCount(n)} />
        )}
      </article>
    </>
  );
}

/* ─── skeleton ───────────────────────────────────────────────────── */
function CardSkeleton() {
  return (
    <div className="py-5 border-b border-white/[0.05] animate-pulse">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-white/[0.06]" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-32 rounded-full bg-white/[0.06]" />
          <div className="h-2.5 w-24 rounded-full bg-white/[0.04]" />
        </div>
      </div>
      <div className="h-48 w-full rounded-xl bg-white/[0.04] mb-4" />
      <div className="space-y-2">
        <div className="h-4 w-3/4 rounded-full bg-white/[0.06]" />
        <div className="h-3 w-full rounded-full bg-white/[0.04]" />
        <div className="h-3 w-2/3 rounded-full bg-white/[0.04]" />
      </div>
    </div>
  );
}

/* ─── main exported component ────────────────────────────────────── */
export default function ProfilePublishedFeed({
  userId,
  isOwn,
  onPublish,
}: {
  userId: string;
  isOwn: boolean;
  onPublish?: () => void;
}) {
  const [items, setItems]   = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    fetch('/api/public/published')
      .then(r => r.ok ? r.json() : { items: [] })
      .then((d: { items: FeedItem[] }) => {
        setItems((d.items ?? []).filter(it => it.uploadedByUserId === userId));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div>
      <ToastContainer />

      {loading && (
        <div>
          {[1,2,3].map(i => <CardSkeleton key={i} />)}
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] py-16 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.04]">
            <FileText className="h-6 w-6 text-white/20" />
          </div>
          <p className="text-[14px] font-semibold text-white/30">
            {isOwn ? 'No posts published yet' : 'Nothing published yet'}
          </p>
          {isOwn && (
            <>
              <p className="text-[12px] text-white/18 mt-1.5">
                Share your work with the community — docs, events, jobs, and more.
              </p>
              {onPublish && (
                <button type="button" onClick={onPublish}
                  className="mt-5 inline-flex items-center gap-2 h-9 px-5 rounded-full text-[12.5px] font-bold transition-all"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', boxShadow: '0 3px 14px rgba(99,102,241,0.35)' }}>
                  <Plus className="h-3.5 w-3.5" /> Publish your first post
                </button>
              )}
            </>
          )}
        </div>
      )}

      {!loading && items.length > 0 && (
        <div>
          {items.map(item => <FeedCard key={item.id} item={item} isOwn={isOwn} />)}
        </div>
      )}
    </div>
  );
}
