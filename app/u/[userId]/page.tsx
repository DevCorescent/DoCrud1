'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import VerifiedBadge from '@/components/VerifiedBadge';
import PublicFaceBadge, { PublicFaceStarIcon, PUBLIC_FACE_CATEGORY_LABELS } from '@/components/PublicFaceBadge';
import PublicFaceApplicationForm from '@/components/PublicFaceApplicationForm';
import FeaturePostPanel from '@/components/FeaturePostPanel';
import ProfilePublishedFeed from '@/components/ProfilePublishedFeed';
import { PresenceBadge } from '@/components/PresenceBadge';
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  Briefcase,
  Check,
  Clock,
  Copy,
  Edit2,
  ExternalLink,
  Eye,
  FileText,
  GraduationCap,
  Github,
  Globe,
  Instagram,
  KeyRound,
  Link2,
  Linkedin,
  Lock,
  LogOut,
  MapPin,
  MessageSquare,
  Plus,
  Share2,
  Shield,
  TrendingUp,
  Trophy,
  Twitter,
  UserCheck,
  UserPlus,
  X,
  Youtube,
  Zap,
  CheckCircle2,
  CreditCard,
  Heart,
  Move,
  Laptop,
  Palette,
  Receipt,
  RefreshCw,
  Rocket,
  Save,
  Settings2,
  Smartphone,
  Star,
  ThumbsUp,
  AlertTriangle,
  CheckCircle,
  Mail,
  PauseCircle,
  Trash2,
  Upload,
  RotateCcw,
  Loader2,
  Sparkles,
  Building2,
  BadgeCheck,
  Users,
  PenLine,
} from 'lucide-react';

/* ─── BusinessPagesTab ──────────────────────────────────────────────── */
interface BizPageSummary {
  id: string; slug: string; name: string; tagline?: string; industry: string;
  logoUrl?: string; followerCount: number; jobCount: number; postCount: number;
  verified: boolean; status: string; createdAt: string;
}

function BusinessPagesTab({ userId, isOwnProfile }: { userId: string; isOwnProfile: boolean }) {
  const [pages, setPages] = React.useState<BizPageSummary[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch(`/api/business-pages?ownerUserId=${userId}&limit=50&sortBy=newest`)
      .then((r) => r.json())
      .then((d: { pages?: BizPageSummary[] }) => setPages(d.pages || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const INDUSTRY_COLORS: Record<string, string> = {
    technology: '#818cf8', finance: '#34d399', healthcare: '#f472b6',
    legal: '#fbbf24', education: '#60a5fa', manufacturing: '#fb923c',
    retail: '#a78bfa', real_estate: '#2dd4bf', media: '#f87171', consulting: '#c084fc',
  };

  if (loading) {
    return (
      <div className="flex gap-4 flex-wrap mt-2">
        {[1,2,3].map((i) => <div key={i} className="h-[130px] w-[280px] rounded-[16px] bg-white/[0.03] border border-white/[0.06] animate-pulse" />)}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[15px] font-bold text-white/80">
          {isOwnProfile ? 'My Business Pages' : 'Business Pages'}
          {pages.length > 0 && <span className="ml-2 text-[12px] font-normal text-white/30">{pages.length} page{pages.length !== 1 ? 's' : ''}</span>}
        </h3>
        {isOwnProfile && (
          <Link href="/businesses/create" className="flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[12px] font-semibold text-white/60 border border-white/[0.09] bg-white/[0.04] hover:bg-white/[0.08] hover:text-white/80 transition-all">
            <Plus className="w-3 h-3" /> New Page
          </Link>
        )}
      </div>

      {pages.length === 0 ? (
        <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-14 text-center">
          <div className="w-14 h-14 rounded-[16px] bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-6 h-6 text-white/20" />
          </div>
          <p className="text-[14px] font-semibold text-white/35 mb-2">{isOwnProfile ? 'No business pages yet' : 'No business pages'}</p>
          {isOwnProfile && (
            <>
              <p className="text-[13px] text-white/22 mb-5">Create a page to showcase your company, post jobs, and share updates.</p>
              <Link href="/businesses/create" className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] font-bold text-white bg-gradient-to-r from-indigo-500 to-violet-500 hover:opacity-90 transition-opacity">
                <Plus className="w-3.5 h-3.5" /> Create Business Page
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pages.map((page) => {
            const accentColor = INDUSTRY_COLORS[page.industry] || 'rgba(255,255,255,0.4)';
            return (
              <div key={page.id} className="group relative rounded-[16px] border border-white/[0.07] bg-white/[0.025] overflow-hidden hover:border-white/[0.12] hover:bg-white/[0.04] transition-all">
                {/* Accent strip */}
                <div className="h-[3px]" style={{ background: `linear-gradient(90deg,${accentColor}55,transparent)` }} />

                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Logo */}
                    <div className="w-11 h-11 rounded-[11px] border border-white/[0.08] flex-shrink-0 flex items-center justify-center text-[16px] font-bold text-white/60 overflow-hidden"
                      style={{ background: page.logoUrl ? `url(${page.logoUrl}) center/cover` : `linear-gradient(135deg,${accentColor}28,${accentColor}15)` }}>
                      {!page.logoUrl && page.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[13.5px] font-bold text-white/88 truncate">{page.name}</p>
                        {page.verified && <BadgeCheck className="w-3.5 h-3.5 flex-shrink-0" style={{ color: accentColor }} />}
                      </div>
                      {page.tagline && <p className="text-[11.5px] text-white/35 truncate mt-0.5">{page.tagline}</p>}
                      <span className="inline-block mt-1.5 text-[10px] font-700 px-2 py-0.5 rounded-full" style={{ color: accentColor, background: `${accentColor}15`, border: `1px solid ${accentColor}22` }}>
                        {page.industry.charAt(0).toUpperCase() + page.industry.slice(1)}
                      </span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex gap-3 mt-3 pt-3 border-t border-white/[0.05]">
                    <div className="flex items-center gap-1.5 text-[11px] text-white/35">
                      <Users className="w-3 h-3" /> {page.followerCount.toLocaleString()}
                    </div>
                    {page.jobCount > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-white/35">
                        <Briefcase className="w-3 h-3" /> {page.jobCount} jobs
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-[11px] text-white/35">
                      <PenLine className="w-3 h-3" /> {page.postCount} posts
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-3">
                    <Link href={`/businesses/${page.slug}`}
                      className="flex-1 text-center py-1.5 rounded-[8px] text-[11.5px] font-semibold text-white/55 border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] hover:text-white/75 transition-all">
                      View Page
                    </Link>
                    {isOwnProfile && (
                      <Link href={`/businesses/${page.slug}/edit`}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-[8px] text-[11.5px] font-semibold border transition-all"
                        style={{ color: accentColor, borderColor: `${accentColor}30`, background: `${accentColor}0d` }}>
                        <Edit2 className="w-3 h-3" /> Edit
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── types ─────────────────────────────────────────────────────────── */
interface ConnectionCard {
  id: string; name: string; headline?: string; avatarUrl?: string;
  location?: string; accountType?: string; isFollowing: boolean;
}

interface UserProfileData {
  headline?: string;
  bio?: string;
  location?: string;
  website?: string;
  avatarUrl?: string;
  avatarPosition?: string;
  bannerUrl?: string;
  coverGradient?: string;
  coverPosition?: string;
  skills?: string[];
  experience?: Array<{ title: string; company: string; period: string; desc?: string }>;
  education?: Array<{ degree: string; school: string; year?: string }>;
  achievements?: Array<{ title: string; desc?: string }>;
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    github?: string;
    instagram?: string;
    youtube?: string;
  };
  openToWork?: boolean;
  pronouns?: string;
  updatedAt?: string;
  docrudGo?: boolean;
  docrudGoPurchasedAt?: string;
  publicFace?: {
    category: string;
    approvedAt: string;
  };
  resumeFiles?: Array<{
    id: string;
    fileName: string;
    url: string;
    uploadedAt: string;
    atsScore?: {
      score: number;
      grade: string;
      breakdown: { contact: number; summary: number; skills: number; experience: number; education: number; achievements: number };
      tips: string[];
    };
    parsedData?: {
      headline?: string | null;
      bio?: string | null;
      location?: string | null;
      website?: string | null;
      skills?: string[];
      experience?: Array<{ title: string; company: string; period: string; desc?: string }>;
      education?: Array<{ degree: string; school: string; year?: string }>;
      achievements?: Array<{ title: string; desc?: string }>;
      socialLinks?: { linkedin?: string | null; github?: string | null; twitter?: string | null };
    };
  }>;
}

interface ProfileStats {
  followers: number;
  following: number;
  publishedCount: number;
  gigsCount: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
}

interface GigCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  skills: string[];
  budgetLabel: string;
  timelineLabel?: string;
  engagementType: string;
  locationPreference: string;
  connectCount: number;
  createdAt: string;
}

interface ProfileResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    accountType?: string;
    createdAt: string;
  };
  profile: UserProfileData;
  stats: ProfileStats;
  isFollowing: boolean;
  isOwnProfile: boolean;
  recentPublished: unknown[];
  recentGigs: GigCard[];
}

/* ─── gradient helpers ───────────────────────────────────────────────── */
const COVER_GRADIENTS = [
  'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
  'linear-gradient(135deg, #0d0d0d, #1a1a2e, #16213e)',
  'linear-gradient(135deg, #1a0533, #0d0d2b, #040d21)',
  'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
  'linear-gradient(135deg, #16001e, #2a0845, #160029)',
  'linear-gradient(135deg, #000000, #0a0a0a, #1c1c1c)',
  'linear-gradient(135deg, #0a0a0a, #1a0a00, #0f0500)',
  'linear-gradient(135deg, #020024, #090979, #00d4ff22)',
];

function getGradient(userId: string) {
  return COVER_GRADIENTS[userId.charCodeAt(0) % COVER_GRADIENTS.length];
}

function getInitials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

/* ─── publisher tracking panel ──────────────────────────────────────── */
const APP_STATUS_ORDER = ['applied', 'pending', 'shortlisted', 'hired', 'rejected'] as const;
type AppStatus = typeof APP_STATUS_ORDER[number];

const STATUS_META: Record<string, { label: string; color: string; dot: string; pillBg: string; pillText: string; icon: string }> = {
  applied:     { label: 'Applied',      color: 'text-blue-400',    dot: 'bg-blue-400',    pillBg: 'rgba(59,130,246,0.12)',  pillText: '#60a5fa', icon: '📨' },
  pending:     { label: 'Under Review', color: 'text-amber-400',   dot: 'bg-amber-400',   pillBg: 'rgba(245,158,11,0.12)',  pillText: '#fbbf24', icon: '⏳' },
  shortlisted: { label: 'Shortlisted',  color: 'text-violet-400',  dot: 'bg-violet-400',  pillBg: 'rgba(139,92,246,0.12)', pillText: '#a78bfa', icon: '⭐' },
  hired:       { label: 'Hired! 🎉',    color: 'text-emerald-400', dot: 'bg-emerald-400', pillBg: 'rgba(16,185,129,0.12)', pillText: '#34d399', icon: '🎉' },
  rejected:    { label: 'Not Selected', color: 'text-rose-400',    dot: 'bg-rose-400',    pillBg: 'rgba(244,63,94,0.10)',  pillText: '#fb7185', icon: '✕' },
};

const CAT_ICON: Record<string, string> = {
  event: '📅', hackathon: '💻', job: '💼', article: '📄', document: '📋',
  portfolio: '🖼️', product: '🛍️', announcement: '📢', news: '📰',
  post: '📝', poll: '📊', survey: '📋', video: '🎥', resume: '👤',
  milestone: '🏆', tutorial: '📚', thread: '💬', chart: '📈',
};

function PublisherTrackingPanel() {
  type SubTab = 'overview' | 'registrations' | 'applications' | 'bookmarks' | 'activity';
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [registrations, setRegistrations] = useState<Array<{itemId: string; title: string; category: string; registeredAt: number}>>([]);
  const [applications, setApplications]   = useState<Array<{itemId: string; title: string; appliedAt: number; url: string}>>([]);
  const [ctaData, setCtaData]             = useState<Record<string, Record<string, number>>>({});
  const [bookmarks, setBookmarks]         = useState<Record<string, {category: string; savedAt: number}>>({});
  const [appStatuses, setAppStatuses]     = useState<Record<string, AppStatus>>({});
  const [appNotes, setAppNotes]           = useState<Record<string, string>>({});
  const [expandedApp, setExpandedApp]     = useState<string | null>(null);

  useEffect(() => {
    try { setRegistrations(JSON.parse(localStorage.getItem('pub_registrations') || '[]')); } catch {}
    try { setApplications(JSON.parse(localStorage.getItem('pub_job_applications') || '[]')); } catch {}
    try { setCtaData(JSON.parse(localStorage.getItem('pub_cta_analytics') || '{}')); } catch {}
    try { setBookmarks(JSON.parse(localStorage.getItem('pub_bookmarks') || '{}')); } catch {}
    try { setAppStatuses(JSON.parse(localStorage.getItem('pub_app_statuses') || '{}')); } catch {}
    try { setAppNotes(JSON.parse(localStorage.getItem('pub_app_notes') || '{}')); } catch {}
  }, []);

  const updateAppStatus = (itemId: string, status: AppStatus) => {
    const next = { ...appStatuses, [itemId]: status };
    setAppStatuses(next);
    try { localStorage.setItem('pub_app_statuses', JSON.stringify(next)); } catch {}
  };
  const updateAppNote = (itemId: string, note: string) => {
    const next = { ...appNotes, [itemId]: note };
    setAppNotes(next);
    try { localStorage.setItem('pub_app_notes', JSON.stringify(next)); } catch {}
  };
  const removeRegistration = (itemId: string) => {
    const next = registrations.filter(r => r.itemId !== itemId);
    setRegistrations(next);
    try { localStorage.setItem('pub_registrations', JSON.stringify(next)); } catch {}
  };
  const removeApplication = (itemId: string) => {
    const next = applications.filter(a => a.itemId !== itemId);
    setApplications(next);
    try { localStorage.setItem('pub_job_applications', JSON.stringify(next)); } catch {}
  };

  const totalCta    = Object.values(ctaData).flatMap(Object.values).reduce((a, b) => a + b, 0);
  const bookmarkList = Object.entries(bookmarks).sort((a, b) => b[1].savedAt - a[1].savedAt);
  const hirings     = applications.filter(a => (appStatuses[a.itemId] || 'applied') === 'hired').length;
  const shortlisted = applications.filter(a => (appStatuses[a.itemId] || 'applied') === 'shortlisted').length;

  const subTabs: { id: SubTab; label: string; count?: number }[] = [
    { id: 'overview',      label: 'Overview' },
    { id: 'registrations', label: 'Registrations', count: registrations.length },
    { id: 'applications',  label: 'Applications',  count: applications.length },
    { id: 'bookmarks',     label: 'Saved',          count: bookmarkList.length },
    { id: 'activity',      label: 'Activity',       count: totalCta || undefined },
  ];

  const fmt    = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtRel = (ms: number) => {
    const d = Math.floor((Date.now() - ms) / 86400000);
    if (d === 0) return 'Today';
    if (d === 1) return 'Yesterday';
    if (d < 7)  return `${d}d ago`;
    if (d < 30) return `${Math.floor(d / 7)}w ago`;
    return fmt(ms);
  };

  /* ── stat card helper ── */
  const StatCard = ({ label, value, sub, onClick }: { label: string; value: number; sub: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}
      className="group text-left rounded-[14px] border border-white/[0.07] bg-white/[0.025] p-4 hover:bg-white/[0.04] hover:border-white/[0.11] transition-all">
      <p className="text-[28px] font-black tabular-nums text-white/90 leading-none mb-1.5" style={{ letterSpacing: '-0.04em' }}>{value}</p>
      <p className="text-[12px] font-semibold text-white/55">{label}</p>
      <p className="text-[10.5px] text-white/28 mt-0.5">{sub}</p>
      <div className="mt-3 flex items-center justify-between">
        <div className="h-px flex-1 bg-white/[0.07] rounded-full overflow-hidden">
          <div className="h-full bg-white/30 rounded-full transition-all" style={{ width: value > 0 ? '100%' : '0%' }} />
        </div>
        <ExternalLink className="ml-3 h-3 w-3 text-white/15 group-hover:text-white/35 transition shrink-0" />
      </div>
    </button>
  );

  /* ── empty state helper ── */
  const EmptyState = ({ message, sub, href, cta }: { message: string; sub: string; href: string; cta: string }) => (
    <div className="py-14 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.03]">
        <TrendingUp className="h-5 w-5 text-white/15" />
      </div>
      <p className="text-[13.5px] font-semibold text-white/35">{message}</p>
      <p className="text-[11.5px] text-white/20 mt-1.5 max-w-[240px] mx-auto leading-relaxed">{sub}</p>
      <a href={href}
        className="mt-5 inline-flex items-center gap-1.5 h-8 px-4 rounded-[10px] text-[11.5px] font-semibold text-white/45 hover:text-white/75 transition border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]">
        {cta} <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );

  return (
    <div className="rounded-[20px] border border-white/[0.08] bg-[#0f0f11] overflow-hidden">

      {/* ── Sub-nav ── */}
      <div className="flex items-center border-b border-white/[0.06] px-1 overflow-x-auto [scrollbar-width:none]">
        {subTabs.map(t => (
          <button key={t.id} type="button" onClick={() => setSubTab(t.id)}
            className={`relative flex shrink-0 items-center gap-2 px-4 py-3.5 text-[12px] font-semibold whitespace-nowrap transition-colors ${
              subTab === t.id ? 'text-white/90' : 'text-white/30 hover:text-white/55'
            }`}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`rounded-full px-1.5 py-px text-[9px] font-bold tabular-nums ${
                subTab === t.id ? 'bg-white/10 text-white/50' : 'bg-white/[0.05] text-white/22'
              }`}>{t.count}</span>
            )}
            {subTab === t.id && <span className="absolute bottom-0 inset-x-4 h-px rounded-full bg-white/40" />}
          </button>
        ))}
        <div className="flex-1" />
        <a href="/published" target="_blank" rel="noopener noreferrer"
          className="mr-2 shrink-0 flex items-center gap-1.5 h-7 px-3 rounded-[8px] text-[11px] font-medium text-white/25 hover:text-white/55 hover:bg-white/[0.05] border border-white/[0.06] transition">
          <ExternalLink className="h-3 w-3" /> Feed
        </a>
      </div>

      {/* ── Content ── */}
      <div className="p-5">

        {/* ═══ OVERVIEW ═══ */}
        {subTab === 'overview' && (
          <div className="space-y-5">
            {/* KPI grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Registrations" value={registrations.length}
                sub={`${registrations.filter(r => r.registeredAt > Date.now() - 30*86400000).length} this month`}
                onClick={() => setSubTab('registrations')} />
              <StatCard label="Applications" value={applications.length}
                sub={hirings > 0 ? `${hirings} offer${hirings > 1 ? 's' : ''} received` : shortlisted > 0 ? `${shortlisted} shortlisted` : 'Track your pipeline'}
                onClick={() => setSubTab('applications')} />
              <StatCard label="Saved Items" value={bookmarkList.length}
                sub="Bookmarked posts"
                onClick={() => setSubTab('bookmarks')} />
              <StatCard label="Interactions" value={totalCta}
                sub={`${Object.keys(ctaData).length} content categor${Object.keys(ctaData).length === 1 ? 'y' : 'ies'}`}
                onClick={() => setSubTab('activity')} />
            </div>

            {/* Application pipeline */}
            {applications.length > 0 && (
              <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.02] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/25 mb-4">Application Pipeline</p>
                <div className="flex items-end gap-1">
                  {[...APP_STATUS_ORDER.filter(s => s !== 'rejected'), 'rejected'].map(s => {
                    const count = applications.filter(a => (appStatuses[a.itemId] || 'applied') === s).length;
                    const meta  = STATUS_META[s];
                    const isRej = s === 'rejected';
                    return (
                      <div key={s} className="flex-1 text-center">
                        <div className="mx-auto mb-1.5 flex h-7 items-center justify-center rounded-[6px] text-[10px] font-bold tabular-nums"
                          style={{
                            background: count > 0 ? (isRej ? 'rgba(244,63,94,0.08)' : meta.pillBg) : 'rgba(255,255,255,0.025)',
                            color: count > 0 ? (isRej ? '#fb7185' : meta.pillText) : 'rgba(255,255,255,0.15)',
                            border: `1px solid ${count > 0 ? (isRej ? 'rgba(251,113,133,0.15)' : meta.pillText + '20') : 'rgba(255,255,255,0.04)'}`,
                          }}>
                          {count > 0 ? count : '—'}
                        </div>
                        <p className="text-[8.5px] font-medium text-white/18 truncate">{isRej ? 'Declined' : meta.label.replace('! 🎉','')}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty */}
            {registrations.length === 0 && applications.length === 0 && bookmarkList.length === 0 && totalCta === 0 && (
              <EmptyState
                message="No activity recorded yet"
                sub="Register for events, apply to jobs, and bookmark content on the Published Feed — it all appears here."
                href="/published"
                cta="Browse Published Feed"
              />
            )}

            {/* Recent */}
            {(registrations.length > 0 || applications.length > 0) && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/22 mb-2">Recent Activity</p>
                {[
                  ...registrations.slice(0, 3).map(r => ({ type: 'reg' as const, title: r.title, cat: r.category, ms: r.registeredAt, id: r.itemId })),
                  ...applications.slice(0, 2).map(a => ({ type: 'app' as const, title: a.title, cat: 'job', ms: a.appliedAt, id: a.itemId })),
                ].sort((a, b) => b.ms - a.ms).slice(0, 5).map((item, i) => (
                  <a key={i} href={`/published/${item.id}`}
                    className="group flex items-center gap-3 rounded-[11px] border border-white/[0.04] bg-white/[0.015] px-3.5 py-2.5 hover:bg-white/[0.04] hover:border-white/[0.08] transition-all">
                    <span className="shrink-0 text-[14px]">{CAT_ICON[item.cat] || '📄'}</span>
                    <p className="flex-1 min-w-0 text-[12px] font-medium text-white/60 truncate group-hover:text-white/85 transition-colors">{item.title}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                      item.type === 'reg'
                        ? 'bg-white/[0.06] text-white/40'
                        : 'bg-white/[0.06] text-white/40'
                    }`}>{item.type === 'reg' ? 'Registered' : 'Applied'}</span>
                    <span className="shrink-0 text-[10px] text-white/20 tabular-nums">{fmtRel(item.ms)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ REGISTRATIONS ═══ */}
        {subTab === 'registrations' && (
          registrations.length === 0
            ? <EmptyState message="No registrations yet" sub="Register for events or hackathons from the Published Feed." href="/published" cta="Browse Events" />
            : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-3 px-3 pb-2">
                  {['#', 'Event', 'Date', 'Status', ''].map((h, i) => (
                    <span key={i} className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/20">{h}</span>
                  ))}
                </div>
                {registrations.slice().reverse().map((r, i) => (
                  <a key={i} href={`/published/${r.itemId}`}
                    className="group grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 rounded-[12px] border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 hover:bg-white/[0.04] hover:border-white/[0.09] transition-all">
                    <span className="text-[10px] font-medium tabular-nums text-white/20 w-4">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-white/75 truncate group-hover:text-white/90 transition-colors">{r.title}</p>
                      <p className="text-[10px] text-white/28 mt-0.5 capitalize">{r.category}</p>
                    </div>
                    <span className="text-[10px] text-white/25 whitespace-nowrap">{fmt(r.registeredAt)}</span>
                    <span className="rounded-full px-2.5 py-0.5 text-[9.5px] font-semibold bg-white/[0.06] text-white/40 border border-white/[0.07] whitespace-nowrap">
                      {r.registeredAt > Date.now() ? 'Upcoming' : 'Registered'}
                    </span>
                    <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); removeRegistration(r.itemId); }}
                      className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.07] text-white/20 hover:text-white/60 hover:border-white/[0.15] transition-all">
                      <X className="h-3 w-3" />
                    </button>
                  </a>
                ))}
              </div>
            )
        )}

        {/* ═══ APPLICATIONS ═══ */}
        {subTab === 'applications' && (
          applications.length === 0
            ? <EmptyState message="No applications tracked" sub="Apply to jobs from the Published Feed to track them here." href="/published" cta="Browse Jobs" />
            : (
              <div className="space-y-2">
                {applications.slice().reverse().map((a, i) => {
                  const statusKey: AppStatus = (appStatuses[a.itemId] || 'applied') as AppStatus;
                  const meta       = STATUS_META[statusKey] || STATUS_META.applied;
                  const isExpanded = expandedApp === a.itemId;
                  const note       = appNotes[a.itemId] || '';
                  const order      = APP_STATUS_ORDER.filter(s => s !== 'rejected');
                  const curIdx     = order.indexOf(statusKey as typeof order[number]);
                  return (
                    <div key={i} className="rounded-[14px] border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                      {/* Main row */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <span className="shrink-0 w-4 text-[10px] font-medium tabular-nums text-white/20">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-white/80 truncate">{a.title}</p>
                          <p className="text-[10px] text-white/28 mt-0.5">{fmtRel(a.appliedAt)} · {fmt(a.appliedAt)}</p>
                        </div>
                        {/* Status select */}
                        <select value={statusKey} onChange={e => updateAppStatus(a.itemId, e.target.value as AppStatus)}
                          className="shrink-0 h-7 rounded-[8px] border px-2 text-[10.5px] font-semibold outline-none cursor-pointer appearance-none"
                          style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <option value="applied">Applied</option>
                          <option value="pending">Under Review</option>
                          <option value="shortlisted">Shortlisted</option>
                          <option value="hired">Hired</option>
                          <option value="rejected">Not Selected</option>
                        </select>
                        <div className="flex items-center gap-1 shrink-0">
                          {a.url && (
                            <a href={a.url} target="_blank" rel="noopener noreferrer"
                              className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-white/[0.06] text-white/20 hover:text-white/60 hover:bg-white/[0.05] transition">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          <button type="button" onClick={() => setExpandedApp(isExpanded ? null : a.itemId)}
                            className={`flex h-7 w-7 items-center justify-center rounded-[8px] border border-white/[0.06] transition ${isExpanded ? 'bg-white/[0.07] text-white/55' : 'text-white/20 hover:text-white/55 hover:bg-white/[0.04]'}`}>
                            <svg className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                          </button>
                          <button type="button" onClick={() => removeApplication(a.itemId)}
                            className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-white/[0.06] text-white/15 hover:text-white/50 transition">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {/* Progress bar */}
                      {statusKey !== 'rejected' && (
                        <div className="px-4 pb-3">
                          <div className="flex items-center">
                            {order.map((s, idx) => {
                              const isPast   = idx < curIdx;
                              const isActive = s === statusKey;
                              return (
                                <React.Fragment key={s}>
                                  <div className={`h-1 w-1 rounded-full transition-all ${
                                    isActive ? 'bg-white/70 scale-125' : isPast ? 'bg-white/40' : 'bg-white/[0.10]'
                                  }`} />
                                  {idx < order.length - 1 && (
                                    <div className={`flex-1 h-px mx-1 rounded-full transition-all ${isPast ? 'bg-white/25' : 'bg-white/[0.07]'}`} />
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </div>
                          <div className="flex mt-1">
                            {order.map((s, idx) => (
                              <div key={s} className={`flex-1 text-[8px] font-medium ${idx === 0 ? 'text-left' : idx === order.length-1 ? 'text-right' : 'text-center'} ${s === statusKey ? 'text-white/45' : 'text-white/18'}`}>
                                {STATUS_META[s].label.replace('! 🎉','')}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {statusKey === 'rejected' && (
                        <p className="px-4 pb-3 text-[10.5px] text-white/25">Not selected for this role</p>
                      )}

                      {/* Notes */}
                      {isExpanded && (
                        <div className="border-t border-white/[0.05] px-4 py-3">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/22 mb-2">Notes</p>
                          <textarea value={note} onChange={e => updateAppNote(a.itemId, e.target.value)} rows={2}
                            placeholder="Interview dates, contacts, next steps…"
                            className="w-full rounded-[10px] border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-[12px] text-white/65 placeholder:text-white/18 outline-none focus:border-white/[0.15] transition resize-none" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
        )}

        {/* ═══ BOOKMARKS ═══ */}
        {subTab === 'bookmarks' && (
          bookmarkList.length === 0
            ? <EmptyState message="Nothing saved yet" sub="Bookmark any post on the Published Feed to save it here." href="/published" cta="Browse Feed" />
            : (
              <div className="space-y-1.5">
                {bookmarkList.map(([id, bm], i) => (
                  <a key={id} href={`/published/${id}`}
                    className="group flex items-center gap-3 rounded-[12px] border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5 hover:bg-white/[0.04] hover:border-white/[0.09] transition-all">
                    <span className="shrink-0 w-4 text-[10px] font-medium tabular-nums text-white/18">{i + 1}</span>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-white/[0.04] text-[13px]">{CAT_ICON[bm.category] || '📄'}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-white/65 truncate group-hover:text-white/85 transition-colors">{(bm as any).title || `${id.slice(0, 12)}…`}</p>
                      <p className="text-[10px] text-white/25 mt-0.5 capitalize">{bm.category} · {fmt(bm.savedAt)}</p>
                    </div>
                    <ExternalLink className="shrink-0 h-3.5 w-3.5 text-white/12 group-hover:text-white/35 transition" />
                  </a>
                ))}
              </div>
            )
        )}

        {/* ═══ ACTIVITY ═══ */}
        {subTab === 'activity' && (
          totalCta === 0
            ? <EmptyState message="No interactions recorded" sub="Like, share, and engage with content on the Published Feed to see your activity here." href="/published" cta="Browse Feed" />
            : (
              <div className="space-y-4">
                {/* Summary row */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Total', value: totalCta },
                    { label: 'Categories', value: Object.keys(ctaData).length },
                    { label: 'Action Types', value: Object.values(ctaData).flatMap(Object.keys).filter((v,i,a) => a.indexOf(v)===i).length },
                  ].map(s => (
                    <div key={s.label} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                      <p className="text-[22px] font-black tabular-nums text-white/80" style={{ letterSpacing: '-0.03em' }}>{s.value}</p>
                      <p className="text-[10px] font-medium text-white/28 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Category breakdown */}
                <div className="space-y-1.5">
                  {Object.entries(ctaData)
                    .filter(([, v]) => Object.values(v).some(n => n > 0))
                    .sort((a, b) => Object.values(b[1]).reduce((x,y)=>x+y,0) - Object.values(a[1]).reduce((x,y)=>x+y,0))
                    .map(([cat, actions]) => {
                      const catTotal = Object.values(actions).reduce((s, v) => s + v, 0);
                      const maxCount = Math.max(...Object.values(actions));
                      return (
                        <div key={cat} className="rounded-[13px] border border-white/[0.05] bg-white/[0.02] px-4 py-3.5">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[14px]">{CAT_ICON[cat] || '📄'}</span>
                              <span className="text-[12px] font-semibold text-white/60 capitalize">{cat}</span>
                            </div>
                            <span className="text-[10px] tabular-nums text-white/25">{catTotal}</span>
                          </div>
                          <div className="space-y-2">
                            {Object.entries(actions).sort((a, b) => b[1] - a[1]).map(([action, count]) => (
                              <div key={action} className="flex items-center gap-2.5">
                                <span className="w-5 shrink-0 text-[10px] font-semibold tabular-nums text-right text-white/30">{count}</span>
                                <div className="flex-1 h-1 rounded-full bg-white/[0.05] overflow-hidden">
                                  <div className="h-full rounded-full bg-white/25 transition-all" style={{ width: `${(count / maxCount) * 100}%` }} />
                                </div>
                                <span className="shrink-0 text-[10.5px] text-white/28 truncate max-w-[130px]">{CTA_LABELS[action] || action.replace(/_/g, ' ')}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )
        )}

      </div>
    </div>
  );
}

/* ─── shimmer skeleton ───────────────────────────────────────────────── */
function Shimmer({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded-[10px] bg-white/[0.06] ${className}`}
    />
  );
}

function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-[#0D0D0F] text-white">
      <header className="sticky top-0 z-40 h-14 bg-[#0D0D0F]/80 backdrop-blur-xl border-b border-white/[0.05] flex items-center px-4 md:px-8 gap-4">
        <Shimmer className="h-8 w-8 rounded-[10px]" />
        <Shimmer className="h-4 w-32" />
      </header>
      <div className="h-52 md:h-64 w-full animate-pulse bg-white/[0.04]" />
      <div className="-mt-16 px-4 md:px-8 lg:px-16 xl:px-24 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end gap-4 mb-6">
          <Shimmer className="h-28 w-28 md:h-36 md:w-36 shrink-0 rounded-[28px]" />
          <div className="flex-1 pb-2 space-y-3">
            <Shimmer className="h-7 w-56" />
            <Shimmer className="h-4 w-40" />
            <Shimmer className="h-3 w-24" />
          </div>
        </div>
        <div className="flex gap-6 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <Shimmer key={i} className="h-12 w-20" />
          ))}
        </div>
        <Shimmer className="h-10 w-full mb-8 rounded-[14px]" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Shimmer key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── published page cta analytics ──────────────────────────────────── */
const CTA_LABELS: Record<string, string> = {
  like_post: 'Liked posts',
  bookmark_save: 'Saved items',
  bookmark_remove: 'Unsaved items',
  share_item: 'Shared',
  apply_job: 'Applied to jobs',
  register_event: 'Registered for events',
  register_hackathon: 'Registered for hackathons',
  connect_resume: 'Sent connections',
  celebrate_milestone: 'Celebrated milestones',
  read_article: 'Read articles',
  download_doc: 'Downloaded docs',
  preview_doc: 'Previewed docs',
  view_portfolio: 'Viewed portfolios',
  view_profile: 'Viewed profiles',
  get_product: 'Explored products',
  watch_video: 'Saved videos',
  vote_poll: 'Voted in polls',
  take_survey: 'Took surveys',
  read_announcement: 'Read announcements',
};

const CAT_COLORS: Record<string, string> = {
  news: 'bg-red-500/70', article: 'bg-violet-500/70', document: 'bg-slate-400/70',
  portfolio: 'bg-emerald-500/70', announcement: 'bg-amber-400/70', job: 'bg-blue-500/70',
  resume: 'bg-sky-400/70', product: 'bg-purple-500/70', event: 'bg-pink-500/70',
  hackathon: 'bg-orange-500/70', post: 'bg-rose-500/70', poll: 'bg-violet-500/70',
  survey: 'bg-amber-500/70', video: 'bg-red-500/70', milestone: 'bg-yellow-400/70',
  tutorial: 'bg-indigo-500/70', thread: 'bg-sky-500/70', chart: 'bg-emerald-500/70',
};

const CAT_TEXT: Record<string, string> = {
  news: 'text-red-400', article: 'text-violet-400', document: 'text-slate-300',
  portfolio: 'text-emerald-400', announcement: 'text-amber-400', job: 'text-blue-400',
  resume: 'text-sky-400', product: 'text-purple-400', event: 'text-pink-400',
  hackathon: 'text-orange-400', post: 'text-rose-400', poll: 'text-violet-400',
  survey: 'text-amber-400', video: 'text-red-400', milestone: 'text-yellow-400',
  tutorial: 'text-indigo-400', thread: 'text-sky-400', chart: 'text-emerald-400',
};

function PublishedCtaAnalytics() {
  const [data, setData] = useState<Record<string, Record<string, number>>>({});
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('pub_cta_analytics');
      if (raw) setData(JSON.parse(raw));
    } catch {}
  }, []);

  const categories = Object.entries(data).filter(([, actions]) =>
    Object.values(actions).some(v => v > 0)
  );
  const totalClicks = categories.flatMap(([, a]) => Object.values(a)).reduce((s, v) => s + v, 0);
  const totalActions = categories.reduce((s, [, a]) => s + Object.values(a).reduce((x, v) => x + v, 0), 0);

  const clearData = useCallback(() => {
    localStorage.removeItem('pub_cta_analytics');
    setData({});
  }, []);

  if (categories.length === 0 && totalClicks === 0) {
    return (
      <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/[0.06] border border-white/[0.08]">
            <TrendingUp className="h-3.5 w-3.5 text-amber-400/70" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-white/75">Published Page Engagement</p>
            <p className="text-[10.5px] text-white/30">Your CTA activity across categories</p>
          </div>
        </div>
        <div className="py-8 text-center">
          <TrendingUp className="h-6 w-6 text-white/10 mx-auto mb-2" />
          <p className="text-[12px] text-white/25">No CTA activity yet.</p>
          <p className="text-[11px] text-white/15 mt-1">
            Interact with content on the{' '}
            <Link href="/published" className="text-amber-400/60 hover:text-amber-400 transition">published page</Link>
            {' '}to see your engagement stats here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-5">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-amber-500/10 border border-amber-500/20">
          <TrendingUp className="h-3.5 w-3.5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white/80">Published Page Engagement</p>
          <p className="text-[10.5px] text-white/30">
            {totalActions} interactions across {categories.length} categor{categories.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="flex h-7 items-center gap-1.5 rounded-[10px] border border-white/[0.09] bg-white/[0.04] px-3 text-[11px] font-semibold text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition"
          >
            {expanded ? 'Less' : 'Details'}
          </button>
          <button
            type="button"
            onClick={clearData}
            title="Clear all activity data"
            className="flex h-7 w-7 items-center justify-center rounded-[10px] border border-white/[0.07] bg-white/[0.03] text-white/20 hover:text-rose-400/70 hover:border-rose-500/20 transition"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Summary bar — top actions across all categories */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          { key: 'bookmark_save',      label: 'Saved',       emoji: '🔖' },
          { key: 'like_post',          label: 'Liked',       emoji: '❤️' },
          { key: 'share_item',         label: 'Shared',      emoji: '🔗' },
          { key: 'apply_job',          label: 'Applied',     emoji: '💼' },
        ].map(({ key, label, emoji }) => {
          const count = categories.reduce((s, [, a]) => s + (a[key] ?? 0), 0);
          return (
            <div key={key} className="rounded-[14px] border border-white/[0.06] bg-white/[0.03] p-3 text-center">
              <p className="text-[18px] mb-0.5">{emoji}</p>
              <p className="text-[16px] font-black text-white tabular-nums">{count}</p>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-[0.12em]">{label}</p>
            </div>
          );
        })}
      </div>

      {/* Category breakdown */}
      <div className="space-y-3">
        {categories
          .sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0))
          .slice(0, expanded ? undefined : 5)
          .map(([cat, actions]) => {
            const catTotal = Object.values(actions).reduce((s, v) => s + v, 0);
            const maxInCat = Math.max(...Object.values(actions));
            const topActions = Object.entries(actions)
              .sort((a, b) => b[1] - a[1])
              .slice(0, expanded ? undefined : 3);
            const barColor = CAT_COLORS[cat] ?? 'bg-white/30';
            const textColor = CAT_TEXT[cat] ?? 'text-white/60';

            return (
              <div key={cat} className="rounded-[14px] border border-white/[0.05] bg-white/[0.025] p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${barColor}`} />
                    <span className={`text-[12px] font-bold capitalize ${textColor}`}>{cat}</span>
                  </div>
                  <span className="text-[11px] font-bold tabular-nums text-white/50">{catTotal} interactions</span>
                </div>
                <div className="space-y-2">
                  {topActions.map(([actionId, count]) => (
                    <div key={actionId} className="flex items-center gap-3">
                      <span className="w-32 shrink-0 text-[11px] text-white/35 truncate">{CTA_LABELS[actionId] ?? actionId}</span>
                      <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor} opacity-80`}
                          style={{ width: `${(count / maxInCat) * 100}%`, transition: 'width 0.4s ease' }}
                        />
                      </div>
                      <span className="w-7 shrink-0 text-right text-[11px] font-bold tabular-nums text-white/50">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
      </div>

      {categories.length > 5 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 w-full rounded-[12px] border border-white/[0.06] bg-white/[0.03] py-2 text-[11.5px] font-semibold text-white/35 hover:text-white/60 hover:bg-white/[0.06] transition"
        >
          Show {categories.length - 5} more categories
        </button>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-white/[0.05] pt-3">
        <p className="text-[10.5px] text-white/20">Tracked locally · not visible to others</p>
        <Link
          href="/published"
          className="text-[11px] font-semibold text-amber-400/60 hover:text-amber-400 transition"
        >
          Go to Published →
        </Link>
      </div>
    </div>
  );
}

/* ─── stat item ──────────────────────────────────────────────────────── */
function StatItem({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-center shrink-0 px-3 sm:px-4 first:pl-0 last:pr-0 py-1 ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      style={{ borderRight: '1px solid rgba(255,255,255,0.055)' }}
    >
      <span
        className="tabular-nums font-bold tracking-tight leading-none text-white transition-colors"
        style={{ fontSize: 'clamp(15px,3.8vw,20px)' }}
      >
        {value.toLocaleString()}
      </span>
      <span
        className="mt-[3px] font-semibold uppercase whitespace-nowrap text-white/30 transition-colors group-hover:text-white/50"
        style={{ fontSize: 'clamp(8px,2vw,10px)', letterSpacing: '0.10em' }}
      >
        {label}
      </span>
    </button>
  );
}

/* ─── skills chip ────────────────────────────────────────────────────── */
function SkillChip({ label }: { label: string }) {
  return (
    <span className="px-3 py-1.5 rounded-full border border-white/[0.09] bg-white/[0.04] text-[12.5px] font-medium text-white/65 hover:border-white/[0.15] hover:bg-white/[0.07] transition-colors">
      {label}
    </span>
  );
}

/* ─── docrud infinity badge ──────────────────────────────────────────── */
function DocrudGoBadge({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const infSize = size === 'lg' ? 15 : size === 'md' ? 12 : 10;
  return (
    <span
      title="Docrud Infinity — Verified"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'linear-gradient(135deg,#0f0e2e,#1e1b4b)', border: '1px solid rgba(99,102,241,0.40)', borderRadius: 999, padding: size === 'lg' ? '3px 9px 3px 6px' : '2px 7px 2px 5px', fontSize: size === 'lg' ? 11 : 10, fontWeight: 800, letterSpacing: '.04em', color: '#a5b4fc', verticalAlign: 'middle', lineHeight: 1 }}
    >
      <span style={{ fontSize: infSize + 2, fontWeight: 900, color: '#c7d2fe', lineHeight: 1, flexShrink: 0 }}>∞</span>
      Infinity
    </span>
  );
}

/* ─── section card ───────────────────────────────────────────────────── */
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-5 md:p-6">
      <h3 className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-white/30 mb-5">{title}</h3>
      {children}
    </div>
  );
}

/* ─── gig card ───────────────────────────────────────────────────────── */
function GigListingCard({ gig }: { gig: GigCard }) {
  return (
    <Link href={`/gigs/${gig.slug}`} className="block group">
      <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5 hover:border-white/[0.12] hover:bg-white/[0.05] transition-all duration-200">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/[0.07] text-white/50 border border-white/[0.08]">
            {gig.category}
          </span>
          <span className="text-xs text-white/35 shrink-0">{gig.budgetLabel}</span>
        </div>
        <h4 className="font-semibold text-white/90 leading-snug mb-2 group-hover:text-white transition-colors line-clamp-2">
          {gig.title}
        </h4>
        <p className="text-sm text-white/45 line-clamp-2 mb-3">{gig.summary}</p>
        {gig.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {gig.skills.slice(0, 3).map((s) => (
              <span
                key={s}
                className="text-xs px-2 py-0.5 rounded-full border border-white/[0.07] bg-white/[0.04] text-white/50"
              >
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3 text-xs text-white/30">
          <span>{gig.locationPreference}</span>
          {gig.timelineLabel && <span>{gig.timelineLabel}</span>}
          <span>{gig.connectCount} connects</span>
        </div>
      </div>
    </Link>
  );
}

/* ─── edit profile modal ─────────────────────────────────────────────── */
const GRADIENT_PRESETS = [
  { label: 'Deep Space', value: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' },
  { label: 'Midnight Blue', value: 'linear-gradient(135deg, #0d0d0d, #1a1a2e, #16213e)' },
  { label: 'Dark Violet', value: 'linear-gradient(135deg, #1a0533, #0d0d2b, #040d21)' },
  { label: 'Ocean Depth', value: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)' },
  { label: 'Dark Purple', value: 'linear-gradient(135deg, #16001e, #2a0845, #160029)' },
  { label: 'Pure Dark', value: 'linear-gradient(135deg, #000000, #0a0a0a, #1c1c1c)' },
  { label: 'Dark Ember', value: 'linear-gradient(135deg, #0a0a0a, #1a0a00, #0f0500)' },
  { label: 'Neon Dusk', value: 'linear-gradient(135deg, #020024, #090979, #00d4ff22)' },
];

/* ─── ImageAdjustModal ────────────────────────────────────────────── */
interface ImageAdjustTarget {
  dataUrl: string;
  type: 'avatar' | 'banner';
  initialPosition?: string;
}

function ImageAdjustModal({
  target,
  onSave,
  onCancel,
}: {
  target: ImageAdjustTarget;
  onSave: (dataUrl: string, position: string) => void;
  onCancel: () => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const raw = target.initialPosition ?? '50% 50%';
    const parts = raw.split(' ');
    return { x: parseInt(parts[0] ?? '50', 10), y: parseInt(parts[1] ?? '50', 10) };
  });
  const [dragging, setDragging] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  function applyDrag(clientX: number, clientY: number) {
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, Math.round(((clientX - rect.left) / rect.width) * 100)));
    const y = Math.max(0, Math.min(100, Math.round(((clientY - rect.top) / rect.height) * 100)));
    setPos({ x, y });
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) { if (dragging) applyDrag(e.clientX, e.clientY); }
    function onMouseUp() { setDragging(false); }
    function onTouchMove(e: TouchEvent) { if (dragging && e.touches[0]) applyDrag(e.touches[0].clientX, e.touches[0].clientY); }
    function onTouchEnd() { setDragging(false); }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [dragging]);

  const isBanner = target.type === 'banner';
  const positionStr = `${pos.x}% ${pos.y}%`;

  return (
    <div className="fixed inset-0 z-[20000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md bg-[#111113] border border-white/[0.09] rounded-[24px] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.9)]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
          <div>
            <h3 className="font-bold text-white text-[15px]">Adjust {isBanner ? 'Banner' : 'Profile Photo'}</h3>
            <p className="text-[11px] text-white/35 mt-0.5">Drag or use sliders to reposition</p>
          </div>
          <button onClick={onCancel} className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.10] transition-colors">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Preview */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-white/35 uppercase tracking-[0.12em]">Preview — drag to reposition</p>
            <div
              ref={previewRef}
              className={`overflow-hidden border border-white/[0.10] select-none cursor-crosshair ${
                isBanner
                  ? 'w-full h-28 rounded-[14px]'
                  : 'w-28 h-28 rounded-[24px] mx-auto'
              }`}
              onMouseDown={(e) => { e.preventDefault(); setDragging(true); applyDrag(e.clientX, e.clientY); }}
              onTouchStart={(e) => { setDragging(true); if (e.touches[0]) applyDrag(e.touches[0].clientX, e.touches[0].clientY); }}
            >
              <img
                src={target.dataUrl}
                alt="Preview"
                className="w-full h-full object-cover pointer-events-none"
                style={{ objectPosition: positionStr }}
                draggable={false}
              />
              {/* crosshair overlay */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%,-50%)',
                }}
              >
                <Move className="h-5 w-5 text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]" />
              </div>
            </div>
          </div>

          {/* Sliders */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-[11px] text-white/40">Horizontal</label>
                <span className="text-[11px] text-white/25">{pos.x}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={pos.x}
                onChange={(e) => setPos((p) => ({ ...p, x: +e.target.value }))}
                className="w-full h-1.5 rounded-full accent-white cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between mb-1.5">
                <label className="text-[11px] text-white/40">Vertical</label>
                <span className="text-[11px] text-white/25">{pos.y}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={pos.y}
                onChange={(e) => setPos((p) => ({ ...p, y: +e.target.value }))}
                className="w-full h-1.5 rounded-full accent-white cursor-pointer"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 h-10 rounded-[12px] border border-white/[0.08] text-white/55 text-sm hover:bg-white/[0.05] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSave(target.dataUrl, positionStr)}
              className="flex-1 h-10 rounded-[12px] bg-white text-[#0D0D0F] font-bold text-sm hover:bg-white/90 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface EditModalProps {
  profile: UserProfileData;
  userName: string;
  onClose: () => void;
  onSaved: (updated: UserProfileData) => void;
}

function EditProfileModal({ profile, userName, onClose, onSaved }: EditModalProps) {
  const [form, setForm] = useState<UserProfileData>({ ...profile });
  const [skillInput, setSkillInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [adjustTarget, setAdjustTarget] = useState<ImageAdjustTarget | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Resume state
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const resumeSectionRef = useRef<HTMLDivElement>(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeErr, setResumeErr] = useState('');
  const [resumeWarn, setResumeWarn] = useState('');
  const [resumeSuccess, setResumeSuccess] = useState<{
    appliedFields: string[];
    atsScore: { score: number; grade: string; breakdown: Record<string, number>; tips: string[] } | null;
    fileName: string;
  } | null>(null);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [imgUploading, setImgUploading] = useState<'avatar' | 'banner' | null>(null);

  async function handleImageFile(file: File, field: 'avatarUrl' | 'coverGradient') {
    console.log('[ProfileUpload] file selected:', { field, name: file.name, size: file.size, type: file.type });
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5 MB'); return; }
    const kind: 'avatar' | 'banner' = field === 'avatarUrl' ? 'avatar' : 'banner';
    setImgUploading(kind);
    setError('');
    try {
      // Compress via canvas before upload
      const compressedBlob = await new Promise<Blob>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = (e) => {
          const img = new Image();
          img.onerror = () => resolve(file); // fallback: original file
          img.onload = () => {
            try {
              const maxDim = kind === 'avatar' ? 600 : 1400;
              const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
              const canvas = document.createElement('canvas');
              canvas.width = Math.round(img.width * scale);
              canvas.height = Math.round(img.height * scale);
              const ctx = canvas.getContext('2d');
              if (!ctx) { resolve(file); return; }
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              canvas.toBlob((blob) => blob ? resolve(blob) : resolve(file), 'image/jpeg', 0.82);
            } catch { resolve(file); }
          };
          img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      });
      console.log('[ProfileUpload] compressed blob size:', compressedBlob.size, 'original:', file.size);

      // Upload directly to R2-backed endpoint
      const fd = new FormData();
      fd.append('file', compressedBlob, file.name.replace(/\.[^.]+$/, '.jpg'));
      fd.append('type', kind);
      const res = await fetch('/api/profile/upload-image', { method: 'POST', body: fd });
      const json = await res.json() as { url?: string; error?: string };
      console.log('[ProfileUpload] upload response:', { status: res.status, url: json.url, error: json.error });
      if (!res.ok || !json.url) throw new Error(json.error || 'Upload failed');

      // Show reposition modal with the server URL (works for both R2 + local)
      const initialPosition = kind === 'avatar' ? (form.avatarPosition ?? '50% 50%') : (form.coverPosition ?? '50% 50%');
      setAdjustTarget({ dataUrl: json.url, type: kind, initialPosition });
    } catch (err) {
      console.error('[ProfileUpload] error:', err);
      setError((err as Error).message || 'Upload failed. Please try again.');
    } finally {
      setImgUploading(null);
    }
  }

  function handleAdjustSave(url: string, position: string) {
    if (!adjustTarget) return;
    console.log('[ProfileUpload] adjust saved:', { type: adjustTarget.type, position, url: url.slice(0, 80) });
    if (adjustTarget.type === 'avatar') {
      setForm((prev) => ({ ...prev, avatarUrl: url, avatarPosition: position }));
    } else {
      // Use bannerUrl for uploaded images; clear any stale base64 in coverGradient
      setForm((prev) => ({
        ...prev,
        bannerUrl: url,
        coverPosition: position,
        coverGradient: prev.coverGradient?.startsWith('data:') ? undefined : prev.coverGradient,
      }));
    }
    setAdjustTarget(null);
  }
  const [expEntries, setExpEntries] = useState(
    (profile.experience ?? []).map((e, i) => ({ ...e, _key: i })),
  );
  const [eduEntries, setEduEntries] = useState(
    (profile.education ?? []).map((e, i) => ({ ...e, _key: i })),
  );
  const nextExpKey = useRef(expEntries.length);
  const nextEduKey = useRef(eduEntries.length);

  function set<K extends keyof UserProfileData>(key: K, value: UserProfileData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addSkill() {
    const trimmed = skillInput.trim();
    if (!trimmed) return;
    const current = form.skills ?? [];
    if (!current.includes(trimmed) && current.length < 20) {
      set('skills', [...current, trimmed]);
    }
    setSkillInput('');
  }

  function removeSkill(s: string) {
    set('skills', (form.skills ?? []).filter((x) => x !== s));
  }

  async function handleResumeUpload(file: File) {
    setResumeErr('');
    setResumeWarn('');
    setResumeSuccess(null);
    setResumeUploading(true);
    try {
      const fd = new FormData();
      fd.append('resume', file);
      const res = await fetch('/api/profile/upload-resume', { method: 'POST', body: fd });
      const json = await res.json() as {
        profile?: UserProfileData;
        appliedFields?: string[];
        atsScore?: { score: number; grade: string; breakdown: Record<string, number>; tips: string[] };
        aiConfigured?: boolean;
        warning?: string | null;
        error?: string;
      };
      if (!res.ok) { setResumeErr(json.error ?? 'Upload failed'); return; }
      if (json.warning) setResumeWarn(json.warning);

      const p = json.profile;
      if (!p) { setResumeErr('Server returned no profile data.'); return; }

      // ── Deterministically update every form field from the server-saved profile ──
      // Use direct assignment (not functional updater) to guarantee latest values
      setForm(prev => {
        const next = { ...prev };
        // Scalar fields — only overwrite if server has a real value
        if (p.headline)  next.headline  = p.headline;
        if (p.bio)       next.bio       = p.bio;
        if (p.location)  next.location  = p.location;
        if (p.website)   next.website   = p.website;
        // Arrays — only overwrite if server has data
        if (p.skills      && p.skills.length > 0)      next.skills      = p.skills;
        if (p.achievements && p.achievements.length > 0) next.achievements = p.achievements;
        // Merge social links (don't clear existing)
        if (p.socialLinks) {
          next.socialLinks = { ...(prev.socialLinks ?? {}), ...p.socialLinks };
        }
        // Always sync resume file history
        if (p.resumeFiles) next.resumeFiles = p.resumeFiles;
        return next;
      });

      // Experience — replace entirely with AI-extracted entries
      if (Array.isArray(p.experience) && p.experience.length > 0) {
        const entries = p.experience.map((e, i) => ({ ...e, _key: i }));
        setExpEntries(entries);
        nextExpKey.current = entries.length;
      }

      // Education — replace entirely
      if (Array.isArray(p.education) && p.education.length > 0) {
        const entries = p.education.map((e, i) => ({ ...e, _key: i }));
        setEduEntries(entries);
        nextEduKey.current = entries.length;
      }

      // Update the parent profile view — sections appear immediately in the profile page
      onSaved(p);

      // Show success card
      setResumeSuccess({
        appliedFields: json.appliedFields ?? [],
        atsScore:      json.atsScore ?? null,
        fileName:      file.name,
      });

      // Scroll success card into view
      setTimeout(() => resumeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);

    } catch (e) {
      console.error('[handleResumeUpload]', e);
      setResumeErr('Upload failed — please try again.');
    } finally {
      setResumeUploading(false);
    }
  }

  async function handleResumeRollback(id: string) {
    setRollingBack(id);
    setResumeErr('');
    setResumeSuccess(null);
    try {
      const res = await fetch('/api/profile/rollback-resume', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const json = await res.json() as { profile?: UserProfileData; appliedFrom?: string; error?: string };
      if (!res.ok) { setResumeErr(json.error ?? 'Rollback failed'); return; }
      const p = json.profile;
      if (!p) { setResumeErr('Server returned no profile data.'); return; }

      setForm(prev => {
        const next = { ...prev };
        if (p.headline)  next.headline  = p.headline;
        if (p.bio)       next.bio       = p.bio;
        if (p.location)  next.location  = p.location;
        if (p.website)   next.website   = p.website;
        if (p.skills      && p.skills.length > 0)       next.skills       = p.skills;
        if (p.achievements && p.achievements.length > 0) next.achievements = p.achievements;
        if (p.socialLinks) next.socialLinks = { ...(prev.socialLinks ?? {}), ...p.socialLinks };
        if (p.resumeFiles) next.resumeFiles = p.resumeFiles;
        return next;
      });
      if (Array.isArray(p.experience) && p.experience.length > 0) {
        const entries = p.experience.map((e, i) => ({ ...e, _key: i }));
        setExpEntries(entries);
        nextExpKey.current = entries.length;
      }
      if (Array.isArray(p.education) && p.education.length > 0) {
        const entries = p.education.map((e, i) => ({ ...e, _key: i }));
        setEduEntries(entries);
        nextEduKey.current = entries.length;
      }
      onSaved(p);
      setResumeSuccess({
        appliedFields: [`Restored from "${json.appliedFrom ?? 'previous version'}"`],
        atsScore: null,
        fileName: json.appliedFrom ?? '',
      });
    } catch {
      setResumeErr('Rollback failed — please try again.');
    } finally {
      setRollingBack(null);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload: UserProfileData = {
        ...form,
        experience: expEntries.map(({ _key: _k, ...rest }) => rest),
        education: eduEntries.map(({ _key: _k, ...rest }) => rest),
      };
      const res = await fetch('/api/profile/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      onSaved(json.profile as UserProfileData);
      onClose();
    } catch (err) {
      console.error('[ProfileSave] error:', err);
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {adjustTarget && (
        <ImageAdjustModal
          target={adjustTarget}
          onSave={handleAdjustSave}
          onCancel={() => setAdjustTarget(null)}
        />
      )}
    <div className="fixed inset-0 z-[10000] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full md:max-w-2xl md:mx-4 bg-[#111113] border border-white/[0.08] rounded-t-[28px] md:rounded-[24px] flex flex-col max-h-[calc(92vh-62px)] md:max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07] shrink-0">
          <h2 className="font-semibold text-white">Edit Profile</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.10] transition-colors">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5 space-y-7 flex-1">

          {/* Photo uploads */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35 mb-4">Photos</p>
            {/* Banner */}
            <div
              className={`relative mb-1 h-24 w-full rounded-[14px] overflow-hidden border border-white/[0.08] ${imgUploading === 'banner' ? 'cursor-wait' : 'cursor-pointer group'}`}
              onClick={() => !imgUploading && bannerInputRef.current?.click()}
            >
              {form.bannerUrl ? (
                <img src={form.bannerUrl} alt="Banner" className="w-full h-full object-cover" style={{ objectPosition: form.coverPosition ?? '50% 50%' }} />
              ) : form.coverGradient?.startsWith('data:') ? (
                <img src={form.coverGradient} alt="Banner" className="w-full h-full object-cover" style={{ objectPosition: form.coverPosition ?? '50% 50%' }} />
              ) : (
                <div className="absolute inset-0" style={{ background: form.coverGradient ?? 'linear-gradient(135deg,#0f0c29,#302b63,#24243e)' }} />
              )}
              {imgUploading === 'banner' ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center gap-1.5 text-white text-xs font-semibold">
                    <Plus className="h-3.5 w-3.5" /> Change banner
                  </div>
                </div>
              )}
            </div>
            {(form.bannerUrl || form.coverGradient?.startsWith('data:')) && (
              <button
                type="button"
                onClick={() => {
                  const src = form.bannerUrl || form.coverGradient!;
                  setAdjustTarget({ dataUrl: src, type: 'banner', initialPosition: form.coverPosition });
                }}
                className="flex items-center gap-1 text-[11px] text-white/35 hover:text-white/65 mb-3 transition-colors"
              >
                <Move className="h-3 w-3" /> Reposition banner
              </button>
            )}
            <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { void handleImageFile(f, 'coverGradient'); e.target.value = ''; } }} />

            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div
                className={`relative h-16 w-16 rounded-[18px] overflow-hidden border-2 border-white/[0.12] flex-shrink-0 ${imgUploading === 'avatar' ? 'cursor-wait' : 'cursor-pointer group'}`}
                onClick={() => !imgUploading && avatarInputRef.current?.click()}
              >
                {form.avatarUrl ? (
                  <img src={form.avatarUrl} alt="Avatar" className="h-full w-full object-cover" style={{ objectPosition: form.avatarPosition ?? '50% 50%' }} />
                ) : (
                  <div className="h-full w-full bg-white/[0.08] flex items-center justify-center text-white/50 font-bold text-xl">
                    {getInitials(userName)}
                  </div>
                )}
                {imgUploading === 'avatar' ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
              <div>
                <button type="button" onClick={() => !imgUploading && avatarInputRef.current?.click()} className="text-sm font-semibold text-white/70 hover:text-white transition-colors disabled:opacity-40">
                  {imgUploading === 'avatar' ? 'Uploading…' : 'Upload profile photo'}
                </button>
                <p className="text-xs text-white/30 mt-0.5">JPG, PNG · Max 5 MB</p>
                <div className="flex items-center gap-3 mt-1">
                  {form.avatarUrl && !imgUploading && (
                    <button type="button" onClick={() => setAdjustTarget({ dataUrl: form.avatarUrl!, type: 'avatar', initialPosition: form.avatarPosition })} className="flex items-center gap-1 text-[11px] text-white/35 hover:text-white/65 transition-colors">
                      <Move className="h-3 w-3" /> Reposition
                    </button>
                  )}
                  {form.avatarUrl && (
                    <button type="button" onClick={() => set('avatarUrl', '')} className="text-xs text-rose-400/60 hover:text-rose-400 transition-colors">Remove photo</button>
                  )}
                </div>
              </div>
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { void handleImageFile(f, 'avatarUrl'); e.target.value = ''; } }} />
            </div>
          </section>

          {/* Resume */}
          <section ref={resumeSectionRef}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Resume</p>
              {form.resumeFiles && form.resumeFiles.length > 0 && (
                <span className="text-[10px] text-white/25">{form.resumeFiles.length}/{5} saved</span>
              )}
            </div>

            {/* Upload card */}
            <div
              onClick={() => !resumeUploading && resumeInputRef.current?.click()}
              className={`relative flex items-center gap-4 rounded-[16px] border border-dashed px-4 py-4 cursor-pointer transition-all group ${resumeUploading ? 'border-white/20 bg-white/[0.02] cursor-wait' : 'border-white/[0.12] hover:border-white/30 hover:bg-white/[0.03]'}`}
            >
              <div className={`h-10 w-10 rounded-[12px] flex items-center justify-center shrink-0 ${resumeUploading ? 'bg-white/[0.06]' : 'bg-white/[0.06] group-hover:bg-white/[0.10]'} transition-colors`}>
                {resumeUploading ? <Loader2 className="h-4 w-4 text-white/50 animate-spin" /> : <Upload className="h-4 w-4 text-white/50" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/80">{resumeUploading ? 'Parsing resume with AI…' : 'Import from resume'}</p>
                <p className="text-[11px] text-white/35 mt-0.5">
                  {resumeUploading ? 'Extracting skills, experience, education — one moment' : 'PDF or Word · up to 10 MB · AI auto-fills every section'}
                </p>
              </div>
              {!resumeUploading && (
                <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-white/[0.07] group-hover:bg-white/[0.12] transition-colors">
                  <Sparkles className="h-3 w-3 text-white/50" />
                  <span className="text-[11px] font-semibold text-white/60">AI</span>
                </div>
              )}
            </div>
            <input
              ref={resumeInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.rtf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { void handleResumeUpload(f); e.target.value = ''; } }}
            />

            {/* Download template link */}
            <a
              href="/api/profile/sample-resume"
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/60 transition-colors w-fit"
            >
              <FileText className="h-3 w-3" />
              Download resume template
              <ExternalLink className="h-2.5 w-2.5 opacity-60" />
            </a>
            <p className="text-[10px] text-white/20 mt-0.5 ml-4">
              Pre-filled with your profile data · optimised for AI parsing · open &amp; save as PDF
            </p>

            {/* Error */}
            {resumeErr && (
              <div className="mt-3 flex items-start gap-2 rounded-[13px] bg-rose-500/[0.07] border border-rose-500/20 px-3.5 py-3">
                <X className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-400 leading-relaxed">{resumeErr}</p>
              </div>
            )}

            {/* Warning */}
            {resumeWarn && !resumeErr && (
              <div className="mt-3 flex items-start gap-2 rounded-[13px] bg-amber-500/[0.07] border border-amber-500/20 px-3.5 py-3">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400 leading-relaxed">{resumeWarn}</p>
              </div>
            )}

            {/* ATS + Success card */}
            {resumeSuccess && !resumeErr && (
              <div className="mt-3 rounded-[16px] border border-white/[0.08] bg-white/[0.03] overflow-hidden">
                {/* Header bar */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                    <p className="text-sm font-semibold text-white/80">Profile updated from resume</p>
                  </div>
                  <button onClick={() => setResumeSuccess(null)} className="text-white/30 hover:text-white/60 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* ATS Score */}
                {resumeSuccess.atsScore && (
                  <div className="px-4 pt-4 pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">ATS Score</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-xl font-black ${resumeSuccess.atsScore.score >= 75 ? 'text-emerald-400' : resumeSuccess.atsScore.score >= 55 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {resumeSuccess.atsScore.score}
                        </span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-[6px] ${resumeSuccess.atsScore.score >= 75 ? 'bg-emerald-500/15 text-emerald-400' : resumeSuccess.atsScore.score >= 55 ? 'bg-amber-500/15 text-amber-400' : 'bg-rose-500/15 text-rose-400'}`}>
                          {resumeSuccess.atsScore.grade}
                        </span>
                      </div>
                    </div>
                    {/* Score bar */}
                    <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden mb-3">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${resumeSuccess.atsScore.score >= 75 ? 'bg-emerald-400' : resumeSuccess.atsScore.score >= 55 ? 'bg-amber-400' : 'bg-rose-400'}`}
                        style={{ width: `${resumeSuccess.atsScore.score}%` }}
                      />
                    </div>
                    {/* Breakdown pills */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {Object.entries(resumeSuccess.atsScore.breakdown).map(([k, v]) => (
                        <span key={k} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.07] text-[10px] text-white/45">
                          <span className="capitalize">{k}</span>
                          <span className="text-white/25">·</span>
                          <span className={`font-semibold ${v >= 8 ? 'text-emerald-400/80' : v >= 5 ? 'text-amber-400/80' : 'text-rose-400/80'}`}>{v}</span>
                        </span>
                      ))}
                    </div>
                    {/* Tips */}
                    {resumeSuccess.atsScore.tips.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/25">How to improve</p>
                        {resumeSuccess.atsScore.tips.map((tip, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <div className="h-1 w-1 rounded-full bg-white/25 mt-1.5 shrink-0" />
                            <p className="text-[11px] text-white/45 leading-relaxed">{tip}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Applied fields */}
                {resumeSuccess.appliedFields.length > 0 && (
                  <div className="px-4 pb-4">
                    {resumeSuccess.atsScore && <div className="border-t border-white/[0.06] mb-3" />}
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/25 mb-2">Auto-filled sections</p>
                    <div className="flex flex-wrap gap-1.5">
                      {resumeSuccess.appliedFields.map(f => (
                        <span key={f} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-400">
                          <Check className="h-2.5 w-2.5" />
                          {f}
                        </span>
                      ))}
                    </div>
                    <p className="text-[10.5px] text-white/30 mt-2.5">Data saved automatically · scroll down to review and edit any field</p>
                  </div>
                )}
              </div>
            )}

            {/* Resume history */}
            {form.resumeFiles && form.resumeFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/25 mb-2">Saved versions</p>
                {form.resumeFiles.map((entry, idx) => (
                  <div key={entry.id} className="flex items-center gap-3 rounded-[13px] border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
                    <div className="h-8 w-8 rounded-[10px] bg-white/[0.06] flex items-center justify-center shrink-0 relative">
                      <FileText className="h-3.5 w-3.5 text-white/40" />
                      {entry.atsScore && (
                        <span className={`absolute -top-1.5 -right-1.5 text-[8px] font-black px-1 rounded-[4px] ${entry.atsScore.score >= 75 ? 'bg-emerald-500/20 text-emerald-400' : entry.atsScore.score >= 55 ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'}`}>
                          {entry.atsScore.score}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium text-white/75 truncate">{entry.fileName}</p>
                      <p className="text-[10.5px] text-white/30 mt-0.5">
                        {idx === 0 && <span className="text-emerald-400/70 font-medium">Latest · </span>}
                        {new Date(entry.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {entry.atsScore && <span className="ml-1.5">· ATS {entry.atsScore.grade}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="h-7 w-7 rounded-[8px] bg-white/[0.05] hover:bg-white/[0.10] flex items-center justify-center transition-colors"
                        title="View resume"
                      >
                        <ExternalLink className="h-3 w-3 text-white/40" />
                      </a>
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => void handleResumeRollback(entry.id)}
                          disabled={rollingBack === entry.id}
                          className="flex items-center gap-1 h-7 px-2.5 rounded-[8px] bg-white/[0.05] hover:bg-white/[0.10] transition-colors text-[10.5px] font-medium text-white/45 hover:text-white/70 disabled:opacity-50"
                          title="Apply this version to profile"
                        >
                          {rollingBack === entry.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                          Apply
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Basic */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35 mb-4">Basic</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-white/40 mb-1">Name</label>
                <input
                  value={userName}
                  disabled
                  className="h-11 w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] text-white/40 px-3 text-sm cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Headline</label>
                <input
                  value={form.headline ?? ''}
                  onChange={(e) => set('headline', e.target.value)}
                  placeholder="e.g. Senior Product Designer at Razorpay"
                  className="h-11 w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">
                  Bio <span className="text-white/25">({(form.bio ?? '').length}/500)</span>
                </label>
                <textarea
                  value={form.bio ?? ''}
                  onChange={(e) => set('bio', e.target.value.slice(0, 500))}
                  rows={4}
                  placeholder="Write a short bio about yourself..."
                  className="w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] text-white px-3 py-2.5 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18] resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/40 mb-1">Pronouns</label>
                  <input
                    value={form.pronouns ?? ''}
                    onChange={(e) => set('pronouns', e.target.value)}
                    placeholder="e.g. they/them"
                    className="h-11 w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/40 mb-1">Location</label>
                  <input
                    value={form.location ?? ''}
                    onChange={(e) => set('location', e.target.value)}
                    placeholder="e.g. Bengaluru, India"
                    className="h-11 w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Website</label>
                <input
                  value={form.website ?? ''}
                  onChange={(e) => set('website', e.target.value)}
                  placeholder="https://yoursite.com"
                  className="h-11 w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => set('openToWork', !form.openToWork)}
                  className={`h-5 w-9 rounded-full transition-colors duration-200 flex items-center px-0.5 ${form.openToWork ? 'bg-white' : 'bg-white/[0.12]'}`}
                >
                  <div className={`h-4 w-4 rounded-full transition-transform duration-200 ${form.openToWork ? 'translate-x-4 bg-[#0D0D0F]' : 'translate-x-0 bg-white/40'}`} />
                </div>
                <span className="text-sm text-white/70">Open to work</span>
              </label>
            </div>
          </section>

          {/* Avatar */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35 mb-4">Avatar</p>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-[16px] bg-white/[0.07] border border-white/[0.08] flex items-center justify-center overflow-hidden shrink-0">
                {form.avatarUrl ? (
                  <img src={form.avatarUrl} alt="avatar preview" className="h-full w-full object-cover" style={{ objectPosition: form.avatarPosition ?? '50% 50%' }} />
                ) : (
                  <span className="text-lg font-bold text-white/60">{getInitials(userName)}</span>
                )}
              </div>
              <input
                value={form.avatarUrl ?? ''}
                onChange={(e) => set('avatarUrl', e.target.value)}
                placeholder="Paste image URL..."
                className="h-11 flex-1 rounded-[13px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
              />
            </div>
          </section>

          {/* Cover */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35 mb-4">Cover</p>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {GRADIENT_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => set('coverGradient', p.value)}
                  title={p.label}
                  className={`h-10 rounded-[10px] border-2 transition-all ${form.coverGradient === p.value ? 'border-white' : 'border-transparent hover:border-white/30'}`}
                  style={{ background: p.value }}
                />
              ))}
            </div>
            <input
              value={form.coverGradient ?? ''}
              onChange={(e) => set('coverGradient', e.target.value)}
              placeholder="Custom: linear-gradient(135deg, #000, #111)"
              className="h-11 w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
            />
          </section>

          {/* Skills */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35 mb-4">Skills</p>
            <div className="flex gap-2 mb-3">
              <input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                placeholder="Type a skill and press Enter"
                className="h-11 flex-1 rounded-[13px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
              />
              <button
                onClick={addSkill}
                className="h-11 px-4 rounded-[13px] bg-white/[0.08] hover:bg-white/[0.12] text-white text-sm transition-colors"
              >
                Add
              </button>
            </div>
            {(form.skills ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(form.skills ?? []).map((s) => (
                  <span
                    key={s}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/[0.10] bg-white/[0.05] text-sm text-white/70"
                  >
                    {s}
                    <button onClick={() => removeSkill(s)} className="hover:text-white transition-colors">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>

          {/* Experience */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Experience</p>
              <button
                onClick={() => {
                  setExpEntries((prev) => [...prev, { title: '', company: '', period: '', desc: '', _key: nextExpKey.current++ }]);
                }}
                className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="space-y-4">
              {expEntries.map((entry, idx) => (
                <div key={entry._key} className="rounded-[16px] border border-white/[0.07] bg-white/[0.03] p-4 space-y-3">
                  <div className="flex justify-end">
                    <button
                      onClick={() => setExpEntries((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-white/30 hover:text-white/60 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={entry.title}
                      onChange={(e) => setExpEntries((prev) => prev.map((x, i) => i === idx ? { ...x, title: e.target.value } : x))}
                      placeholder="Job title"
                      className="h-10 rounded-[11px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
                    />
                    <input
                      value={entry.company}
                      onChange={(e) => setExpEntries((prev) => prev.map((x, i) => i === idx ? { ...x, company: e.target.value } : x))}
                      placeholder="Company"
                      className="h-10 rounded-[11px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
                    />
                  </div>
                  <input
                    value={entry.period}
                    onChange={(e) => setExpEntries((prev) => prev.map((x, i) => i === idx ? { ...x, period: e.target.value } : x))}
                    placeholder="Period (e.g. Jan 2022 – Present)"
                    className="h-10 w-full rounded-[11px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
                  />
                  <input
                    value={entry.desc ?? ''}
                    onChange={(e) => setExpEntries((prev) => prev.map((x, i) => i === idx ? { ...x, desc: e.target.value } : x))}
                    placeholder="Short description (optional)"
                    className="h-10 w-full rounded-[11px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Education */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35">Education</p>
              <button
                onClick={() => {
                  setEduEntries((prev) => [...prev, { degree: '', school: '', year: '', _key: nextEduKey.current++ }]);
                }}
                className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            <div className="space-y-4">
              {eduEntries.map((entry, idx) => (
                <div key={entry._key} className="rounded-[16px] border border-white/[0.07] bg-white/[0.03] p-4 space-y-3">
                  <div className="flex justify-end">
                    <button
                      onClick={() => setEduEntries((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-white/30 hover:text-white/60 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={entry.degree}
                      onChange={(e) => setEduEntries((prev) => prev.map((x, i) => i === idx ? { ...x, degree: e.target.value } : x))}
                      placeholder="Degree / Certificate"
                      className="h-10 rounded-[11px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
                    />
                    <input
                      value={entry.school}
                      onChange={(e) => setEduEntries((prev) => prev.map((x, i) => i === idx ? { ...x, school: e.target.value } : x))}
                      placeholder="School / University"
                      className="h-10 rounded-[11px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
                    />
                  </div>
                  <input
                    value={entry.year ?? ''}
                    onChange={(e) => setEduEntries((prev) => prev.map((x, i) => i === idx ? { ...x, year: e.target.value } : x))}
                    placeholder="Year (e.g. 2020)"
                    className="h-10 w-full rounded-[11px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Social links */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/35 mb-4">Social Links</p>
            <div className="space-y-3">
              {(
                [
                  { key: 'twitter', label: 'Twitter / X', placeholder: 'https://x.com/handle' },
                  { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/...' },
                  { key: 'github', label: 'GitHub', placeholder: 'https://github.com/handle' },
                  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/handle' },
                  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@channel' },
                ] as { key: keyof NonNullable<UserProfileData['socialLinks']>; label: string; placeholder: string }[]
              ).map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs text-white/40 mb-1">{label}</label>
                  <input
                    value={form.socialLinks?.[key] ?? ''}
                    onChange={(e) =>
                      set('socialLinks', { ...(form.socialLinks ?? {}), [key]: e.target.value })
                    }
                    placeholder={placeholder}
                    className="h-11 w-full rounded-[13px] border border-white/[0.08] bg-white/[0.04] text-white px-3 text-sm placeholder:text-white/25 focus:outline-none focus:border-white/[0.18]"
                  />
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/[0.07] shrink-0 flex items-center gap-3">
          {error && <p className="text-sm text-red-400 flex-1">{error}</p>}
          {!error && <div className="flex-1" />}
          <button
            onClick={onClose}
            className="h-10 px-5 rounded-[13px] border border-white/[0.10] bg-transparent text-white/70 text-sm hover:bg-white/[0.05] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-10 px-6 rounded-[13px] bg-white text-[#0D0D0F] text-sm font-semibold hover:bg-white/90 transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

/* ─── profile strength helper ────────────────────────────────────────── */
function profileStrength(profile: UserProfileData): number {
  let score = 0;
  if (profile.headline) score += 20;
  if (profile.bio) score += 20;
  if ((profile.skills ?? []).length > 0) score += 15;
  if ((profile.experience ?? []).length > 0) score += 15;
  if ((profile.education ?? []).length > 0) score += 10;
  if ((profile.achievements ?? []).length > 0) score += 10;
  if (Object.values(profile.socialLinks ?? {}).some(Boolean)) score += 10;
  return Math.min(score, 100);
}

/* ─── main page ──────────────────────────────────────────────────────── */
type TabId = 'published' | 'about' | 'skills' | 'gigs' | 'services' | 'pages' | 'activity' | 'insights' | 'billing' | 'connections' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'published', label: 'Published' },
  { id: 'about', label: 'About' },
  { id: 'skills', label: 'Work & Skills' },
  { id: 'gigs', label: 'Gigs' },
  { id: 'services', label: 'Services' },
  { id: 'pages', label: 'Business Pages' },
  { id: 'activity', label: 'Activity' },
  { id: 'connections', label: 'Connections' },
  { id: 'insights', label: 'Insights' },
  { id: 'billing', label: 'Billing' },
  { id: 'settings', label: 'Settings' },
];

/* ── Reusable accordion section (used in settings tab) ─────────────── */
function AccordionSection({
  id, open, onToggle, icon, title, subtitle, badge, badgeColor, borderColor, children,
}: {
  id: string;
  open: boolean;
  onToggle: (id: string) => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  borderColor?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-[18px] overflow-hidden transition-all"
      style={{ border: `1px solid ${borderColor ?? 'rgba(255,255,255,0.07)'}`, background: 'rgba(255,255,255,0.015)' }}
    >
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.02] focus:outline-none"
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-white/80 tracking-[-0.01em]">{title}</p>
          <p className="text-[11px] text-white/28 mt-px truncate">{subtitle}</p>
        </div>
        {!open && badge && (
          <span
            className="shrink-0 text-[10.5px] font-semibold px-2.5 py-1 rounded-full mr-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: badgeColor ?? 'rgba(255,255,255,0.38)' }}
          >
            {badge}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/22 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? '1600px' : '0px', opacity: open ? 1 : 0 }}
      >
        <div className="border-t border-white/[0.05]">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function UserProfilePage() {
  const params = useParams();
  const userId = params?.userId as string | undefined;
  const router = useRouter();
  const { data: session } = useSession();

  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabId>('about');
  const [publishedView, setPublishedView] = useState<'feed' | 'tracker'>('feed');
  const [openSection, setOpenSection] = useState<string>('account');
  const [editOpen, setEditOpen] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followingState, setFollowingState] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [liveStats, setLiveStats] = useState<{ publishedCount: number; gigsCount: number; totalViews: number; totalLikes: number; totalComments: number; following: number } | null>(null);
  const statsPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [credits, setCredits] = useState<{ balance: number; totalEarned: number; streak: { current: number; longest: number }; milestones: string[]; verified: boolean; transactions: Array<{ id: string; type: string; amount: number; reason: string; description: string; createdAt: string }> } | null>(null);
  const [analytics, setAnalytics] = useState<{ totalViews: number; totalLikes: number; totalComments: number; publishCount: number; featuredCount: number } | null>(null);
  const [billingHistory, setBillingHistory] = useState<Array<{ id: string; productLabel?: string; planName?: string; totalAmountInPaise: number; status: string; paidAt?: string; createdAt: string; invoiceNumber?: string; productType?: string }>>([]);
  const [infinityStatus, setInfinityStatus] = useState<{ active: boolean; isExpired: boolean; purchasedAt?: string; expiresAt?: string; period?: 'monthly' | 'annual'; renewalCount?: number; grantedFree?: boolean } | null>(null);
  const [infinityPayPhase, setInfinityPayPhase] = useState<'idle' | 'paying' | 'success'>('idle');
  const [infinityPayError, setInfinityPayError] = useState('');
  const [publishedPosts, setPublishedPosts] = useState<Array<{ id: string; shareId: string; title?: string; fileName: string; likesCount: number; commentsCount: number; viewCount: number; featured: boolean; featuredUntil?: string; featuredPlan?: string; createdAt: string }>>([]);
  const [featurePanelPost, setFeaturePanelPost] = useState<{ id: string; title: string } | null>(null);

  const [connectionsData, setConnectionsData] = useState<{ followers: ConnectionCard[]; following: ConnectionCard[] } | null>(null);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsFollowingIds, setConnectionsFollowingIds] = useState<Set<string>>(new Set());
  interface SharedLinkEntry { id: string; templateName: string; uploadedPdfFileName?: string; documentSourceType?: string; shareId?: string; sharePassword?: string; shareAccessPolicy?: string; shareExpiresAt?: string; openCount?: number; recipientSignedAt?: string; generatedAt: string; }
  const [sharedLinks, setSharedLinks] = useState<SharedLinkEntry[]>([]);

  /* ── Account management (deactivate / delete) ─────────────────── */
  type AccountModalAction = 'deactivate' | 'delete';
  type AccountModalStep   = 'choose' | 'duration' | 'otp' | 'confirming' | 'done';
  const [accountModal, setAccountModal]         = useState(false);
  const [acctAction, setAcctAction]             = useState<AccountModalAction>('deactivate');
  const [acctStep, setAcctStep]                 = useState<AccountModalStep>('choose');
  const [acctDuration, setAcctDuration]         = useState<number | null>(30); // days, null = indefinite
  const [acctCustomDays, setAcctCustomDays]     = useState('');
  const [acctSessionId, setAcctSessionId]       = useState('');
  const [acctOtp, setAcctOtp]                   = useState('');
  const [acctOtpExpiry, setAcctOtpExpiry]       = useState('');
  const [acctSending, setAcctSending]           = useState(false);
  const [acctError, setAcctError]               = useState('');
  const [acctResendCooldown, setAcctResendCooldown] = useState(0);

  // Cooldown timer
  useEffect(() => {
    if (acctResendCooldown <= 0) return;
    const id = setInterval(() => setAcctResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [acctResendCooldown]);

  function openAccountModal(action: AccountModalAction) {
    setAcctAction(action);
    setAcctStep('choose');
    setAcctDuration(30);
    setAcctCustomDays('');
    setAcctSessionId('');
    setAcctOtp('');
    setAcctOtpExpiry('');
    setAcctError('');
    setAcctSending(false);
    setAcctResendCooldown(0);
    setAccountModal(true);
  }

  async function acctSendOtp() {
    setAcctSending(true);
    setAcctError('');
    try {
      const res  = await fetch('/api/account/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: acctAction }),
      });
      const data = await res.json() as { sessionId?: string; expiresAt?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to send OTP');
      setAcctSessionId(data.sessionId!);
      setAcctOtpExpiry(data.expiresAt!);
      setAcctStep('otp');
      setAcctResendCooldown(45);
    } catch (e) {
      setAcctError(e instanceof Error ? e.message : 'Failed to send OTP');
    } finally {
      setAcctSending(false);
    }
  }

  async function acctConfirm() {
    setAcctSending(true);
    setAcctError('');
    try {
      const effectiveDuration = acctAction === 'deactivate'
        ? (acctDuration ?? (acctCustomDays ? parseInt(acctCustomDays, 10) : null))
        : null;

      let res: Response;
      if (acctAction === 'deactivate') {
        res = await fetch('/api/account/deactivate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: acctSessionId, otp: acctOtp, durationDays: effectiveDuration }),
        });
      } else {
        res = await fetch('/api/account/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: acctSessionId, otp: acctOtp }),
        });
      }
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Action failed');
      setAcctStep('done');
      // Sign out after 2.5 s
      setTimeout(() => void signOut({ callbackUrl: '/login' }), 2500);
    } catch (e) {
      setAcctError(e instanceof Error ? e.message : 'Failed. Please try again.');
    } finally {
      setAcctSending(false);
    }
  }
  const [sharedLinksCopied, setSharedLinksCopied] = useState<string | null>(null);
  const [upraiseCount, setUpraisedCount] = useState(0);
  const [hasUpraised, setHasUpraised] = useState(false);
  const [upraiseLoading, setUpraisedLoading] = useState(false);

  // Services tab state
  interface ServiceItem {
    id: string; title: string; tagline: string; description: string; category: string;
    pricingModel: string; basePrice: number; currency: string;
    packages?: Array<{ name: string; description: string; price: number; deliveryTime: number; deliveryUnit: string; features: string[] }>;
    deliveryTime?: number; deliveryUnit?: string; tags: string[];
    imageUrl?: string; faqs?: Array<{ question: string; answer: string }>;
    isActive: boolean; featured: boolean; bookingCount: number; rating: number; reviewCount: number; createdAt: string;
  }
  interface ServiceBookingItem {
    id: string; serviceId: string; serviceTitle: string; clientName: string; clientEmail: string;
    clientPhone?: string; clientMessage: string; packageName?: string; price?: number; currency: string;
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled'; scheduledDate?: string; createdAt: string;
  }
  const [profileServices, setProfileServices] = useState<ServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [serviceBookings, setServiceBookings] = useState<ServiceBookingItem[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [serviceForm, setServiceForm] = useState<Partial<ServiceItem> | null>(null);
  const [serviceFormSaving, setServiceFormSaving] = useState(false);
  const [serviceFormError, setServiceFormError] = useState('');
  const [bookingServiceId, setBookingServiceId] = useState<string | null>(null);
  const [bookingForm, setBookingForm] = useState({ clientName: '', clientEmail: '', clientPhone: '', clientMessage: '', packageName: '', scheduledDate: '' });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [servicesSubTab, setServicesSubTab] = useState<'catalogue' | 'bookings' | 'analytics'>('catalogue');
  const [serviceTagInput, setServiceTagInput] = useState('');

  // Service analytics state
  interface SvcAnalyticsSummary {
    serviceId: string; serviceTitle: string;
    views: number; uniqueViews: number; detailOpens: number; bookClicks: number;
    bookingsSubmitted: number; bookingsConfirmed: number; bookingsCompleted: number;
    reviews: number; avgRating: number; estimatedRevenue: number; currency: string;
    clickThroughRate: number; bookClickRate: number; conversionRate: number; completionRate: number;
    trend7d: number[];
  }
  interface ProviderAnalyticsData {
    totalViews: number; totalUniqueViews: number; totalBookClicks: number;
    totalBookings: number; totalCompleted: number; totalRevenue: number;
    avgRating: number; totalReviews: number; overallConversionRate: number;
    trend30d: number[]; services: SvcAnalyticsSummary[]; topService: SvcAnalyticsSummary | null;
    peakHour: number; sourceBreakdown: { profile: number; catalogue: number; direct: number };
  }
  const [analyticsData, setAnalyticsData] = useState<ProviderAnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsLastUpdated, setAnalyticsLastUpdated] = useState<Date | null>(null);
  const [analyticsSecondsAgo, setAnalyticsSecondsAgo] = useState(0);
  const analyticsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyticsTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Catalogue editor state
  interface CatalogueSettingsLocal {
    headline?: string; subheadline?: string;
    accentColor?: string; accentColorSecondary?: string;
    gridColumns?: 2 | 3 | 4;
    showBio?: boolean; showWhyBook?: boolean; showStats?: boolean;
    ctaText?: string;
    catalogueBannerUrl?: string;
    catalogueAvatarUrl?: string;
  }
  const ACCENT_PRESETS_LOCAL = [
    { label: 'Indigo', a: '#6366f1', b: '#8b5cf6' },
    { label: 'Violet', a: '#8b5cf6', b: '#a78bfa' },
    { label: 'Blue', a: '#3b82f6', b: '#60a5fa' },
    { label: 'Cyan', a: '#06b6d4', b: '#22d3ee' },
    { label: 'Emerald', a: '#10b981', b: '#34d399' },
    { label: 'Rose', a: '#f43f5e', b: '#fb7185' },
    { label: 'Amber', a: '#f59e0b', b: '#fbbf24' },
    { label: 'Pink', a: '#ec4899', b: '#f472b6' },
  ];
  const [showCatalogueEditor, setShowCatalogueEditor] = useState(false);
  const [catalogueSettings, setCatalogueSettings] = useState<CatalogueSettingsLocal>({});
  const [catalogueDraft, setCatalogueDraft] = useState<CatalogueSettingsLocal>({});
  const [catalogueSaving, setCatalogueSaving] = useState(false);
  const [catalogueSettingsLoaded, setCatalogueSettingsLoaded] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewKey, setPreviewKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Reviews state
  interface ServiceReviewItem {
    id: string; serviceId: string; bookingId: string; reviewerId: string;
    reviewerName: string; reviewerAvatar?: string;
    rating: number; headline: string; body: string; testimonial?: string; createdAt: string;
  }
  const [serviceReviews, setServiceReviews] = useState<Record<string, ServiceReviewItem[]>>({});
  const [reviewServiceId, setReviewServiceId] = useState<string | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: 5, headline: '', body: '', testimonial: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState(false);
  // client bookings (to check if current user can review)
  const [myServiceBookings, setMyServiceBookings] = useState<Array<{ serviceId: string; status: string }>>([]);

  // Docrud Go upgrade / referral state (own basic profiles only)
  const [emailPrefs, setEmailPrefs] = useState<Record<string, boolean>>({});
  const [emailPrefsSaving, setEmailPrefsSaving] = useState(false);

  // ── Public Face application state ──────────────────────────────────
  const [showPFForm, setShowPFForm] = useState(false);
  const [pfApplication, setPfApplication] = useState<{ status: string; category?: string; submittedAt?: string; adminNote?: string } | null | undefined>(undefined);
  const [pfLoading, setPfLoading] = useState(false);

  // Load Public Face status when settings tab opens
  useEffect(() => {
    if (tab !== 'settings' || !data?.isOwnProfile || pfApplication !== undefined) return;
    setPfLoading(true);
    fetch('/api/public-face/status')
      .then(r => r.ok ? r.json() : { application: null })
      .then((d: { application: typeof pfApplication }) => setPfApplication(d.application))
      .catch(() => setPfApplication(null))
      .finally(() => setPfLoading(false));
  }, [tab, data?.isOwnProfile, pfApplication]);

  // Load email preferences when settings tab opens
  useEffect(() => {
    if (tab !== 'settings' || !data?.isOwnProfile) return;
    fetch('/api/account/email-preferences')
      .then((r) => r.ok ? r.json() : null)
      .then((d: { emailPreferences?: Record<string, boolean> } | null) => {
        if (d?.emailPreferences) setEmailPrefs(d.emailPreferences);
      })
      .catch(() => {});
  }, [tab, data?.isOwnProfile]);

  const [goUpgradePhase, setGoUpgradePhase] = useState<'idle' | 'paying' | 'refer'>('idle');
  const [goUpgradeErr, setGoUpgradeErr] = useState('');
  const [refLink, setRefLink] = useState('');
  const [refCode, setRefCode] = useState('');
  const [refLinkLoading, setRefLinkLoading] = useState(false);
  const [refCopied, setRefCopied] = useState(false);
  const [refInviteEmail, setRefInviteEmail] = useState('');
  const [refSending, setRefSending] = useState(false);
  const [refSentMsg, setRefSentMsg] = useState('');
  const [refSendErr, setRefSendErr] = useState('');

  // Publish modal state
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishForm, setPublishForm] = useState({ title: '', category: 'document', tags: [] as string[], notes: '', tagInput: '' });
  const [publishFile, setPublishFile] = useState<File | null>(null);
  const [publishSubmitting, setPublishSubmitting] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [publishSuccess, setPublishSuccess] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/public/profile/${userId}`).then((r) => {
        if (r.status === 404) return null;
        return r.json();
      }),
      fetch(`/api/upraise/${userId}`).then((r) => r.ok ? r.json() : null),
    ])
      .then(([json, upraiseData]) => {
        if (!json) { setNotFound(true); setLoading(false); return; }
        const resp = json as ProfileResponse;
        setData(resp);
        setFollowingState(resp.isFollowing);
        setFollowersCount(resp.stats.followers);
        setLiveStats({
          publishedCount: resp.stats.publishedCount,
          gigsCount: resp.stats.gigsCount,
          totalViews: resp.stats.totalViews ?? 0,
          totalLikes: resp.stats.totalLikes ?? 0,
          totalComments: resp.stats.totalComments ?? 0,
          following: resp.stats.following,
        });
        if (upraiseData) { setUpraisedCount(upraiseData.count ?? 0); setHasUpraised(upraiseData.hasUpraised ?? false); }
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [userId]);

  /* Real-time stats polling — every 30 s, refreshes counts for all visitors */
  useEffect(() => {
    if (!userId) return;
    const poll = () => {
      Promise.all([
        fetch(`/api/public/profile/${userId}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/upraise/${userId}`).then(r => r.ok ? r.json() : null),
      ]).then(([json, upraiseData]) => {
        if (!json) return;
        const resp = json as ProfileResponse;
        setFollowersCount(resp.stats.followers);
        setLiveStats({
          publishedCount: resp.stats.publishedCount,
          gigsCount: resp.stats.gigsCount,
          totalViews: resp.stats.totalViews ?? 0,
          totalLikes: resp.stats.totalLikes ?? 0,
          totalComments: resp.stats.totalComments ?? 0,
          following: resp.stats.following,
        });
        if (upraiseData) { setUpraisedCount(upraiseData.count ?? 0); }
      }).catch(() => {});
    };
    statsPollingRef.current = setInterval(poll, 30_000);
    return () => { if (statsPollingRef.current) clearInterval(statsPollingRef.current); };
  }, [userId]);

  useEffect(() => {
    if (!data?.isOwnProfile || !userId) return;
    // credits
    fetch('/api/credits').then(r => r.ok ? r.json() : null).then((d: { credits?: typeof credits } | null) => { if (d?.credits) setCredits(d.credits); }).catch(() => {});
    // analytics (for insights tab detail — also keeps liveStats in sync for own profile)
    fetch(`/api/profile/analytics?userId=${userId}`).then(r => r.ok ? r.json() : null).then((d: { analytics?: typeof analytics } | null) => {
      if (d?.analytics) {
        setAnalytics(d.analytics);
        setLiveStats(prev => prev ? { ...prev, totalViews: d.analytics!.totalViews, totalLikes: d.analytics!.totalLikes, totalComments: d.analytics!.totalComments, publishedCount: d.analytics!.publishCount } : prev);
      }
    }).catch(() => {});
    // billing history (feature_post transactions)
    fetch('/api/billing/overview').then(r => r.ok ? r.json() : null).then((d: { transactions?: typeof billingHistory } | null) => {
      if (d?.transactions) setBillingHistory(d.transactions.filter((t) => t.status === 'paid'));
    }).catch(() => {});
    // infinity plan status
    fetch('/api/billing/infinity').then(r => r.ok ? r.json() : null).then((d: typeof infinityStatus | null) => {
      if (d) setInfinityStatus(d);
    }).catch(() => {});
    // own published posts
    fetch('/api/public/published').then(r => r.ok ? r.json() : null).then((d: { items?: Array<{ id: string; shareId: string; title?: string; fileName?: string; likesCount?: number; commentsCount?: number; viewCount?: number; featured?: boolean; featuredUntil?: string; featuredPlan?: string; createdAt?: string; uploadedByUserId?: string }> } | null) => {
      if (d?.items && userId) {
        setPublishedPosts(
          d.items
            .filter((item) => item.uploadedByUserId === userId)
            .map((item) => ({
              id: item.id,
              shareId: item.shareId,
              title: item.title,
              fileName: item.fileName ?? '',
              likesCount: item.likesCount ?? 0,
              commentsCount: item.commentsCount ?? 0,
              viewCount: item.viewCount ?? 0,
              featured: item.featured ?? false,
              featuredUntil: item.featuredUntil,
              featuredPlan: item.featuredPlan,
              createdAt: item.createdAt ?? '',
            })),
        );
      }
    }).catch(() => {});
    // own shared document links
    fetch('/api/history').then(r => r.ok ? r.json() : null).then((d: { history?: SharedLinkEntry[] } | null) => {
      if (d?.history) {
        const links = d.history.filter((e: SharedLinkEntry) => e.shareId || (e as any).shareUrl);
        setSharedLinks(links.slice(0, 30));
      }
    }).catch(() => {});
  }, [data?.isOwnProfile, userId]);

  // Real-time analytics polling (30s) when analytics sub-tab is active
  useEffect(() => {
    const active = tab === 'services' && servicesSubTab === 'analytics' && !!data?.isOwnProfile;
    if (!active) {
      if (analyticsIntervalRef.current) { clearInterval(analyticsIntervalRef.current); analyticsIntervalRef.current = null; }
      if (analyticsTickRef.current) { clearInterval(analyticsTickRef.current); analyticsTickRef.current = null; }
      return;
    }
    const doFetch = (showSpinner = false) => {
      if (showSpinner) setAnalyticsLoading(true);
      fetch('/api/services/analytics')
        .then(r => r.ok ? r.json() : null)
        .then((d: { analytics?: ProviderAnalyticsData } | null) => {
          if (d?.analytics) { setAnalyticsData(d.analytics); setAnalyticsLastUpdated(new Date()); setAnalyticsSecondsAgo(0); }
        })
        .catch(() => {})
        .finally(() => { if (showSpinner) setAnalyticsLoading(false); });
    };
    doFetch(true);
    analyticsIntervalRef.current = setInterval(() => doFetch(false), 30000);
    analyticsTickRef.current = setInterval(() => setAnalyticsSecondsAgo(s => s + 1), 1000);
    return () => {
      if (analyticsIntervalRef.current) { clearInterval(analyticsIntervalRef.current); analyticsIntervalRef.current = null; }
      if (analyticsTickRef.current) { clearInterval(analyticsTickRef.current); analyticsTickRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, servicesSubTab, data?.isOwnProfile]);

  // Load catalogue settings when editor is opened (once)
  useEffect(() => {
    if (!showCatalogueEditor || catalogueSettingsLoaded || !userId) return;
    fetch(`/api/services/catalogue?userId=${userId}`)
      .then(r => r.ok ? r.json() : { settings: {} })
      .then((d: { settings?: CatalogueSettingsLocal }) => {
        const s = d.settings ?? {};
        setCatalogueSettings(s);
        setCatalogueDraft(s);
        setCatalogueSettingsLoaded(true);
      }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCatalogueEditor, userId]);

  // Load services when services tab is active
  useEffect(() => {
    if (tab !== 'services' || !userId) return;
    setServicesLoading(true);
    fetch(`/api/services/public?userId=${userId}`)
      .then(r => r.ok ? r.json() : { services: [] })
      .then((d: { services?: ServiceItem[] }) => {
        const svcs = d.services ?? [];
        setProfileServices(svcs);
        // Fetch reviews + track profile views for visitors
        const vid = (() => { try { let v = sessionStorage.getItem('svc_vid'); if (!v) { v = `v_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; sessionStorage.setItem('svc_vid', v); } return v; } catch { return `v_${Date.now()}`; } })();
        svcs.forEach(svc => {
          fetch(`/api/services/reviews?serviceId=${svc.id}`)
            .then(r => r.ok ? r.json() : { reviews: [] })
            .then((rd: { reviews?: ServiceReviewItem[] }) => {
              setServiceReviews(prev => ({ ...prev, [svc.id]: rd.reviews ?? [] }));
            }).catch(() => {});
          if (!data?.isOwnProfile) {
            fetch('/api/services/analytics/track', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ serviceId: svc.id, type: 'view', visitorId: vid, source: 'profile' }),
            }).catch(() => {});
          }
        });
      })
      .catch(() => {})
      .finally(() => setServicesLoading(false));
    // If own profile, also load provider bookings
    if (data?.isOwnProfile) {
      setBookingsLoading(true);
      fetch('/api/services/bookings?role=provider')
        .then(r => r.ok ? r.json() : { bookings: [] })
        .then((d: { bookings?: ServiceBookingItem[] }) => setServiceBookings(d.bookings ?? []))
        .catch(() => {})
        .finally(() => setBookingsLoading(false));
    } else if (session) {
      // Load client's own bookings to know which services they can review
      fetch('/api/services/bookings?role=client')
        .then(r => r.ok ? r.json() : { bookings: [] })
        .then((d: { bookings?: Array<{ serviceId: string; status: string }> }) => setMyServiceBookings(d.bookings ?? []))
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, userId, data?.isOwnProfile]);

  async function handleFollow() {
    if (!session) { router.push('/login'); return; }
    setFollowLoading(true);
    try {
      const res = await fetch('/api/profile/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId, action: followingState ? 'unfollow' : 'follow' }),
      });
      const json = await res.json();
      if (res.ok) {
        setFollowingState(json.following as boolean);
        setFollowersCount(json.followers as number);
      }
    } finally {
      setFollowLoading(false);
    }
  }

  async function handleUpraise() {
    if (!session) { router.push('/login'); return; }
    if (!userId) return;
    setUpraisedLoading(true);
    const prev = hasUpraised;
    setHasUpraised(!prev);
    setUpraisedCount((c) => c + (prev ? -1 : 1));
    try {
      const res = await fetch(`/api/upraise/${userId}`, { method: 'POST' });
      const json = await res.json();
      if (res.ok) { setHasUpraised(json.hasUpraised); setUpraisedCount(json.count); }
      else { setHasUpraised(prev); setUpraisedCount((c) => c + (prev ? 1 : -1)); }
    } catch {
      setHasUpraised(prev);
      setUpraisedCount((c) => c + (prev ? 1 : -1));
    } finally {
      setUpraisedLoading(false);
    }
  }

  function loadConnections() {
    if (connectionsData || connectionsLoading || !userId) return;
    setConnectionsLoading(true);
    fetch(`/api/public/profile/${userId}/connections`)
      .then((r) => r.json())
      .then((d) => {
        setConnectionsData(d);
        const ids = new Set<string>([
          ...(d.followers ?? [] as ConnectionCard[]).filter((u: ConnectionCard) => u.isFollowing).map((u: ConnectionCard) => u.id as string),
          ...(d.following ?? [] as ConnectionCard[]).filter((u: ConnectionCard) => u.isFollowing).map((u: ConnectionCard) => u.id as string),
        ]);
        setConnectionsFollowingIds(ids);
        setConnectionsLoading(false);
      })
      .catch(() => setConnectionsLoading(false));
  }

  async function handleConnectionFollow(targetId: string) {
    if (!session) { router.push('/login'); return; }
    const already = connectionsFollowingIds.has(targetId);
    setConnectionsFollowingIds((prev) => {
      const n = new Set(prev);
      already ? n.delete(targetId) : n.add(targetId);
      return n;
    });
    try {
      await fetch('/api/profile/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: targetId, action: already ? 'unfollow' : 'follow' }),
      });
    } catch {
      // revert on error
      setConnectionsFollowingIds((prev) => {
        const n = new Set(prev);
        already ? n.add(targetId) : n.delete(targetId);
        return n;
      });
    }
  }

  if (loading) return <ProfileSkeleton />;

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-[#0D0D0F] text-white flex flex-col items-center justify-center gap-6">
        <div className="h-16 w-16 rounded-[20px] border border-white/[0.08] bg-white/[0.04] flex items-center justify-center">
          <UserPlus className="h-7 w-7 text-white/30" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Profile not found</h1>
          <p className="text-white/40 text-sm">This user does not exist or their profile is unavailable.</p>
        </div>
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>
      </div>
    );
  }

  const { user, profile, stats, isOwnProfile, recentGigs } = data;
  // infinityStatus is always freshly fetched for own profile; profile.docrudGo can be stale from the profile API
  const isEffectivelyGo = profile.docrudGo || (isOwnProfile && infinityStatus?.active === true);
  // bannerUrl = permanent uploaded image (from onboarding or profile upload API)
  // coverGradient = legacy: either a CSS gradient string or a data: URL (from profile editor)
  // Ignore stale blob: URLs (they only live in the uploading browser tab)
  const safeBannerUrl = profile.bannerUrl && !profile.bannerUrl.startsWith('blob:') ? profile.bannerUrl : null;
  const coverImageUrl = safeBannerUrl || (profile.coverGradient?.startsWith('data:') ? profile.coverGradient : null);
  const coverIsImage = !!coverImageUrl;
  const coverBgStyle: React.CSSProperties = coverIsImage
    ? {
        backgroundImage: `url(${coverImageUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: profile.coverPosition ?? '50% 50%',
      }
    : { background: profile.coverGradient ? profile.coverGradient : getGradient(user.id) };

  const socialEntries = Object.entries(profile.socialLinks ?? {}).filter(([, v]) => !!v) as [string, string][];

  const socialIcon: Record<string, React.ReactNode> = {
    twitter: <Twitter className="h-4 w-4" />,
    linkedin: <Linkedin className="h-4 w-4" />,
    github: <Github className="h-4 w-4" />,
    instagram: <Instagram className="h-4 w-4" />,
    youtube: <Youtube className="h-4 w-4" />,
  };

  async function toggleEmailPref(key: string, value: boolean) {
    setEmailPrefs((prev) => ({ ...prev, [key]: value }));
    setEmailPrefsSaving(true);
    try {
      await fetch('/api/account/email-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [key]: value }),
      });
    } catch { /* silent */ } finally {
      setEmailPrefsSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0D0D0F] text-white">
      {/* Razorpay — only loaded when this profile is own + not Go */}
      {isOwnProfile && !isEffectivelyGo && (
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      )}
      {/* ─── sticky header ─── */}
      <header className="sticky top-0 z-40 bg-[#0D0D0F]/80 backdrop-blur-xl border-b border-white/[0.05] h-14 flex items-center px-4 sm:px-6 lg:px-8 gap-3">
        <button
          onClick={() => router.back()}
          className="h-8 w-8 rounded-full border border-white/[0.08] bg-white/[0.04] flex items-center justify-center hover:bg-white/[0.08] transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4 text-white/70" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white truncate">{user.name}</p>
          {stats.gigsCount > 0 && (
            <p className="text-xs text-white/35">{stats.gigsCount} gig{stats.gigsCount !== 1 ? 's' : ''}</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {/* ── Docrud Go header pill — own non-Go profiles only ── */}
          {isOwnProfile && !isEffectivelyGo && (
            <div className="flex items-center gap-1.5">
              {/* Earn Free ghost link */}
              <button
                type="button"
                onClick={() => {
                  setGoUpgradePhase('refer');
                  if (!refLink) {
                    setRefLinkLoading(true);
                    fetch('/api/referrals/stats')
                      .then(r => r.json())
                      .then((d: { link?: string; code?: string }) => { setRefLink(d.link || ''); setRefCode(d.code || ''); })
                      .catch(() => {})
                      .finally(() => setRefLinkLoading(false));
                  }
                }}
                className="hidden sm:flex items-center h-7 px-2.5 rounded-[8px] text-[11px] font-semibold transition-all hover:bg-white/[0.06] active:scale-[0.97]"
                style={{ color: 'rgba(165,180,252,0.70)', border: '1px solid rgba(99,102,241,0.20)' }}
              >
                Earn Free
              </button>
              {/* Get Go gold pill */}
              <button
                type="button"
                disabled={goUpgradePhase === 'paying'}
                onClick={async () => {
                  setGoUpgradeErr('');
                  setGoUpgradePhase('paying');
                  try {
                    const res = await fetch('/api/docrud-go/create-order', { method: 'POST' });
                    const d = await res.json() as { orderId?: string; amount?: number; currency?: string; keyId?: string; userName?: string; userEmail?: string; error?: string };
                    if (!res.ok || !d.orderId) { setGoUpgradeErr(d.error ?? 'Could not start payment.'); setGoUpgradePhase('idle'); return; }
                    const win = window as typeof window & { Razorpay?: new (o: Record<string, unknown>) => { open(): void } };
                    if (!win.Razorpay) { setGoUpgradeErr('Payment gateway not loaded. Refresh and retry.'); setGoUpgradePhase('idle'); return; }
                    const rz = new win.Razorpay({
                      key: d.keyId, amount: d.amount, currency: d.currency || 'INR',
                      name: 'Docrud', description: 'Docrud Infinity — Verified', order_id: d.orderId,
                      prefill: { name: d.userName || '', email: d.userEmail || '' },
                      theme: { color: '#6366f1' }, modal: { backdropclose: false },
                      handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
                        const vRes = await fetch('/api/docrud-go/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(resp) });
                        const vData = await vRes.json() as { success?: boolean };
                        if (vData.success) window.location.reload();
                        else { setGoUpgradeErr('Payment verified but activation failed. Contact support.'); setGoUpgradePhase('idle'); }
                      },
                      'modal.ondismiss': () => setGoUpgradePhase('idle'),
                    });
                    rz.open();
                  } catch { setGoUpgradeErr('Something went wrong. Please retry.'); setGoUpgradePhase('idle'); }
                }}
                className="relative flex items-center gap-1.5 h-8 px-3 rounded-[10px] text-[12px] font-black transition-all active:scale-[0.97] disabled:opacity-70 overflow-hidden"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1 55%,#4f46e5)', color: '#ffffff', boxShadow: '0 2px 12px rgba(99,102,241,0.40), inset 0 1px 0 rgba(255,255,255,0.15)' }}
              >
                {/* shimmer sweep */}
                <span className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(105deg,transparent 30%,rgba(255,255,255,0.18) 50%,transparent 70%)', animation: 'goShimmer 2.8s ease-in-out infinite' }} />
                {goUpgradePhase === 'paying'
                  ? <><div className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" /><span className="relative">Processing…</span></>
                  : <><span className="relative">∞ Infinity</span><span className="relative hidden sm:inline"> — ₹299/mo</span></>
                }
              </button>
            </div>
          )}

          {!isOwnProfile && session && (
            <>
              <button
                onClick={handleFollow}
                disabled={followLoading}
                className={`flex items-center gap-2 h-8 px-3 rounded-[10px] text-xs font-medium transition-colors disabled:opacity-60 ${
                  followingState
                    ? 'border border-white/[0.10] bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'
                    : 'bg-white text-[#0D0D0F] hover:bg-white/90'
                }`}
              >
                {followingState ? <UserCheck className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
                {followingState ? 'Following' : 'Follow'}
              </button>
              {/* Public Faces cannot be messaged — their inbox is private */}
              {!profile.publicFace && (
                <Link
                  href={`/messages?user=${user.id}`}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-[10px] border border-blue-500/30 bg-blue-500/[0.08] text-blue-400 text-xs font-medium hover:bg-blue-500/[0.16] transition-colors"
                  title="Message"
                >
                  <MessageSquare className="h-3 w-3" />
                  <span className="hidden sm:inline">Message</span>
                </Link>
              )}
            </>
          )}
        </div>
      </header>

      {/* ── Go payment error toast ── */}
      {goUpgradeErr && isOwnProfile && !isEffectivelyGo && (
        <div className="sticky top-14 z-30 flex items-center justify-between gap-3 px-4 py-2.5 bg-rose-950/90 backdrop-blur border-b border-rose-500/20">
          <p className="text-[12px] text-rose-300">{goUpgradeErr}</p>
          <button onClick={() => setGoUpgradeErr('')} className="shrink-0 text-rose-400/60 hover:text-rose-300 transition">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Go shimmer keyframe ── */}
      <style>{`@keyframes goShimmer{0%{transform:translateX(-100%)}60%,100%{transform:translateX(200%)}}`}</style>

      {/* ── Referral modal (shown when goUpgradePhase === 'refer') ── */}
      {isOwnProfile && !isEffectivelyGo && goUpgradePhase === 'refer' && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
          onClick={() => setGoUpgradePhase('idle')}
        >
          <div
            className="relative w-full sm:max-w-md rounded-t-[24px] sm:rounded-[24px] overflow-hidden p-[1.5px]"
            style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.45),rgba(165,180,252,0.30),rgba(99,102,241,0.45))' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="relative rounded-t-[22.5px] sm:rounded-[22.5px] bg-[#06060f] px-5 pt-5 pb-6">
              {/* ambient */}
              <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -5%,rgba(99,102,241,0.10) 0%,transparent 60%)' }} />

              {/* Header */}
              <div className="relative flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[11px]" style={{ background: 'linear-gradient(135deg,#4f46e5,#818cf8)', boxShadow: '0 3px 14px rgba(99,102,241,0.45)' }}>
                    <svg className="h-4.5 w-4.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[14px] font-black text-white leading-tight">Refer &amp; Earn Docrud Infinity Free</p>
                    <p className="text-[11px] text-white/35 mt-0.5">One referral that activates = your Infinity badge, free</p>
                  </div>
                </div>
                <button type="button" onClick={() => setGoUpgradePhase('idle')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.04] text-white/30 hover:text-white/70 transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Steps */}
              <div className="relative grid grid-cols-3 gap-2 mb-5">
                {[{ n: '1', label: 'Share your link' }, { n: '2', label: 'Friend signs up' }, { n: '3', label: 'Infinity badge unlocks' }].map(({ n, label }) => (
                  <div key={n} className="flex flex-col items-center gap-1.5 rounded-[10px] py-3 px-2" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black" style={{ background: 'linear-gradient(135deg,#4f46e5,#818cf8)', color: '#fff' }}>{n}</span>
                    <span className="text-[10px] font-semibold text-white/50 text-center leading-tight">{label}</span>
                  </div>
                ))}
              </div>

              {/* Link copy */}
              <div className="relative mb-4 rounded-[13px] border border-white/[0.08] bg-white/[0.03] p-3.5">
                <p className="mb-2 text-[9px] font-black uppercase tracking-[0.22em]" style={{ color: '#818cf8' }}>Your Referral Link</p>
                {refLinkLoading ? (
                  <div className="h-9 animate-pulse rounded-[10px] bg-white/[0.06]" />
                ) : (
                  <div className="flex gap-2">
                    <div className="flex-1 truncate rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 font-mono text-[11px] text-white/60">
                      {refLink || '—'}
                    </div>
                    <button
                      type="button"
                      disabled={!refLink}
                      onClick={() => {
                        if (!refLink) return;
                        navigator.clipboard.writeText(refLink).then(() => { setRefCopied(true); setTimeout(() => setRefCopied(false), 2200); });
                      }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.12] bg-white/[0.06] transition hover:bg-white/[0.12] disabled:opacity-30"
                    >
                      {refCopied
                        ? <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        : <Copy className="h-3.5 w-3.5 text-white/50" />
                      }
                    </button>
                  </div>
                )}
                {refCopied && <p className="mt-1.5 text-[10.5px] font-semibold text-emerald-400">✓ Copied to clipboard!</p>}
                {refCode && <p className="mt-1 text-[9px] text-white/22">Code: <span className="font-mono font-bold text-white/40">{refCode}</span></p>}
              </div>

              {/* Email invite */}
              <div className="relative mb-4">
                <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/28">Send a direct invite</p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={refInviteEmail}
                    onChange={(e) => setRefInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="h-9 flex-1 rounded-[11px] border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] text-white placeholder:text-white/20 outline-none transition focus:border-indigo-500/25 focus:ring-1 focus:ring-indigo-500/[0.08]"
                  />
                  <button
                    type="button"
                    disabled={refSending || !refInviteEmail.trim()}
                    onClick={() => {
                      setRefSendErr(''); setRefSentMsg(''); setRefSending(true);
                      fetch('/api/referrals/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: refInviteEmail.trim() }) })
                        .then(r => r.json())
                        .then((d: { success?: boolean; error?: string }) => {
                          if (d.success) { setRefSentMsg(`Sent to ${refInviteEmail.trim()} ✓`); setRefInviteEmail(''); }
                          else throw new Error(d.error || 'Failed');
                        })
                        .catch((err: unknown) => setRefSendErr(err instanceof Error ? err.message : 'Failed to send.'))
                        .finally(() => setRefSending(false));
                    }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-indigo-500/25 bg-indigo-500/[0.10] transition hover:bg-indigo-500/[0.18] disabled:opacity-40"
                  >
                    {refSending
                      ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-300/30 border-t-indigo-300" />
                      : <svg className="h-3.5 w-3.5 text-indigo-300" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
                    }
                  </button>
                </div>
                {refSentMsg && <p className="mt-1.5 text-[10.5px] text-emerald-400">{refSentMsg}</p>}
                {refSendErr && <p className="mt-1.5 text-[10.5px] text-rose-400">{refSendErr}</p>}
              </div>

              <p className="relative text-center text-[9px] text-white/18 leading-4">
                Referrals can be sent to multiple people. Docrud Infinity activates <strong className="text-white/30">once per referrer</strong> the moment a referred profile is created.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Publish modal ── */}
      {/* ── Public Face application modal ─────────────────────────── */}
      {showPFForm && isOwnProfile && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}
          onClick={() => setShowPFForm(false)}
        >
          <div
            className="relative w-full sm:max-w-xl rounded-t-[28px] sm:rounded-[28px] overflow-hidden"
            style={{ background: '#0a0614', border: '1px solid rgba(168,85,247,0.2)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          >
            <PublicFaceApplicationForm
              onClose={() => setShowPFForm(false)}
              onSuccess={() => {
                setShowPFForm(false);
                // Reload PF status
                setPfApplication(undefined);
              }}
            />
          </div>
        </div>
      )}

      {publishModalOpen && isOwnProfile && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
          onClick={() => !publishSubmitting && setPublishModalOpen(false)}
        >
          <div
            className="relative w-full sm:max-w-lg rounded-t-[26px] sm:rounded-[26px] overflow-hidden"
            style={{ background: '#0f0f12', border: '1px solid rgba(255,255,255,0.07)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 3px 12px rgba(99,102,241,0.35)' }}>
                  <Share2 className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <p className="text-[14px] font-black text-white">Publish to Feed</p>
                  <p className="text-[10.5px] text-white/30">Share with the Docrud community</p>
                </div>
              </div>
              <button type="button" onClick={() => !publishSubmitting && setPublishModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/30 hover:text-white/70 transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4 max-h-[70vh] overflow-y-auto [scrollbar-width:none]">
              {publishSuccess ? (
                <div className="py-10 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                    <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                  </div>
                  <p className="text-[16px] font-black text-white">Published!</p>
                  <p className="text-[12px] text-white/35 mt-1.5">Your post is now live on the feed.</p>
                  <div className="mt-5 flex gap-2 justify-center">
                    <a href="/published" className="flex h-9 items-center gap-1.5 rounded-[11px] border border-white/[0.09] bg-white/[0.04] px-4 text-[12px] font-semibold text-white/60 hover:text-white/85 transition">
                      <ExternalLink className="h-3.5 w-3.5" /> View Feed
                    </a>
                    <button type="button" onClick={() => { setPublishModalOpen(false); window.location.reload(); }}
                      className="flex h-9 items-center gap-2 rounded-[11px] px-4 text-[12px] font-bold text-white transition"
                      style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}>
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Title */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-1.5">Title</label>
                    <input
                      type="text"
                      value={publishForm.title}
                      onChange={e => setPublishForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Give your post a descriptive title…"
                      className="w-full h-10 rounded-[11px] border border-white/[0.08] bg-white/[0.04] px-3.5 text-[13px] text-white placeholder:text-white/20 outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/[0.12] transition"
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-2">Category</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['document','article','portfolio','announcement','job','event','hackathon','product'] as const).map(cat => (
                        <button key={cat} type="button"
                          onClick={() => setPublishForm(f => ({ ...f, category: cat }))}
                          className={`rounded-[10px] border py-2 text-[10px] font-bold capitalize transition ${
                            publishForm.category === cat
                              ? 'border-indigo-500/40 bg-indigo-500/[0.12] text-indigo-300'
                              : 'border-white/[0.06] bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/65'
                          }`}>
                          {cat === 'announcement' ? 'Announce' : cat === 'hackathon' ? 'Hack' : cat === 'portfolio' ? 'Portfolio' : cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* File upload */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-1.5">File <span className="text-white/20 normal-case font-normal">(PDF, image, or doc — max 15 MB)</span></label>
                    <label className={`flex flex-col items-center justify-center w-full rounded-[14px] border-2 border-dashed py-6 cursor-pointer transition ${
                      publishFile ? 'border-indigo-500/30 bg-indigo-500/[0.05]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]'
                    }`}>
                      <input type="file" className="hidden" accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp,.svg"
                        onChange={e => { const f = e.target.files?.[0]; if (f) setPublishFile(f); }} />
                      {publishFile ? (
                        <div className="text-center">
                          <FileText className="h-6 w-6 text-indigo-400 mx-auto mb-1.5" />
                          <p className="text-[12px] font-semibold text-indigo-300">{publishFile.name}</p>
                          <p className="text-[10px] text-white/30 mt-0.5">{(publishFile.size / 1024).toFixed(0)} KB · click to change</p>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Plus className="h-6 w-6 text-white/20 mx-auto mb-1.5" />
                          <p className="text-[12px] font-semibold text-white/30">Click to upload file</p>
                          <p className="text-[10px] text-white/18 mt-0.5">PDF · Images · Docs</p>
                        </div>
                      )}
                    </label>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-1.5">Description <span className="text-white/20 normal-case font-normal">(optional)</span></label>
                    <textarea
                      value={publishForm.notes}
                      onChange={e => setPublishForm(f => ({ ...f, notes: e.target.value }))}
                      rows={3}
                      placeholder="Add context, key points, or a summary…"
                      className="w-full rounded-[11px] border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-[13px] text-white placeholder:text-white/20 outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/[0.12] transition resize-none"
                    />
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/35 mb-1.5">Tags <span className="text-white/20 normal-case font-normal">(optional)</span></label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {publishForm.tags.map((tag, i) => (
                        <span key={i} className="flex items-center gap-1 rounded-full border border-white/[0.09] bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-white/60">
                          {tag}
                          <button type="button" onClick={() => setPublishForm(f => ({ ...f, tags: f.tags.filter((_, j) => j !== i) }))} className="text-white/30 hover:text-white/70 ml-0.5">×</button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={publishForm.tagInput}
                        onChange={e => setPublishForm(f => ({ ...f, tagInput: e.target.value }))}
                        onKeyDown={e => {
                          if ((e.key === 'Enter' || e.key === ',') && publishForm.tagInput.trim()) {
                            e.preventDefault();
                            setPublishForm(f => ({ ...f, tags: [...f.tags, f.tagInput.trim()], tagInput: '' }));
                          }
                        }}
                        placeholder="Type a tag and press Enter"
                        className="flex-1 h-9 rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] text-white placeholder:text-white/20 outline-none focus:border-indigo-500/30 transition"
                      />
                      <button type="button"
                        onClick={() => { if (publishForm.tagInput.trim()) setPublishForm(f => ({ ...f, tags: [...f.tags, f.tagInput.trim()], tagInput: '' })); }}
                        className="h-9 px-3 rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-[11px] font-semibold text-white/40 hover:text-white/70 transition">
                        Add
                      </button>
                    </div>
                  </div>

                  {publishError && <p className="text-[12px] text-rose-400 font-medium">{publishError}</p>}
                </>
              )}
            </div>

            {!publishSuccess && (
              <div className="px-5 py-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
                <p className="text-[10.5px] text-white/25">Your post will be visible on the community feed.</p>
                <button
                  type="button"
                  disabled={publishSubmitting || !publishFile || !publishForm.title.trim()}
                  onClick={async () => {
                    if (!publishFile || !publishForm.title.trim()) return;
                    setPublishSubmitting(true);
                    setPublishError('');
                    try {
                      const reader = new FileReader();
                      const dataUrl = await new Promise<string>((res, rej) => {
                        reader.onload = () => res(reader.result as string);
                        reader.onerror = rej;
                        reader.readAsDataURL(publishFile);
                      });
                      const res = await fetch('/api/public/file-directory/publish', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          title: publishForm.title.trim(),
                          fileName: publishFile.name,
                          mimeType: publishFile.type || 'application/octet-stream',
                          dataUrl,
                          sizeInBytes: publishFile.size,
                          notes: publishForm.notes.trim() || undefined,
                          directoryCategory: publishForm.category,
                          directoryTags: publishForm.tags,
                          directoryVisibility: 'public',
                          authMode: 'public',
                        }),
                      });
                      const d = await res.json() as { transfer?: { id: string }; error?: string };
                      if (!res.ok || !d.transfer) throw new Error(d.error || 'Publish failed.');
                      setPublishSuccess(true);
                    } catch (e) {
                      setPublishError(e instanceof Error ? e.message : 'Something went wrong.');
                    } finally {
                      setPublishSubmitting(false);
                    }
                  }}
                  className="flex items-center gap-2 h-9 px-5 rounded-[11px] text-[12.5px] font-bold transition-all active:scale-[0.97] disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', boxShadow: publishSubmitting ? 'none' : '0 3px 14px rgba(99,102,241,0.35)' }}
                >
                  {publishSubmitting ? (
                    <><div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Publishing…</>
                  ) : (
                    <><Share2 className="h-3.5 w-3.5" /> Publish Post</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── cover ─── */}
      <div className="relative w-full overflow-hidden"
        style={{ height: 'clamp(160px, 28vw, 380px)' }}>
        {/* Image banner */}
        {coverIsImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl!}
            alt="Profile banner"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: profile.coverPosition ?? '50% 40%' }}
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0" style={{ background: profile.coverGradient ? profile.coverGradient : getGradient(user.id) }} />
        )}
        {/* Fade bottom into page bg */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0D0D0F] via-[#0D0D0F]/20 to-transparent" />
        {/* PF glow */}
        {profile.publicFace && (
          <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg,rgba(180,140,55,0.06) 0%,transparent 60%)' }} />
        )}
        {/* Pattern overlay for gradient banners */}
        {!coverIsImage && (
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%3E%3Cg%20fill%3D%22none%22%20fill-rule%3D%22evenodd%22%3E%3Cg%20fill%3D%22%23ffffff%22%20fill-opacity%3D%220.02%22%3E%3Cpath%20d%3D%22M36%2034v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6%2034v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6%204V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-25" />
        )}
        {isOwnProfile && (
          <button
            onClick={() => setEditOpen(true)}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 h-7 px-2.5 rounded-[9px] bg-black/50 backdrop-blur-md border border-white/10 text-white/55 text-[11px] font-medium hover:bg-black/70 hover:text-white/80 transition-all"
          >
            <Edit2 className="h-3 w-3" />
            Edit banner
          </button>
        )}
      </div>

      {/* ─── profile hero ─── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-28">

        {/* Avatar + identity + actions */}
        <div className="-mt-14 md:-mt-20 flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6 mb-7">

          {/* Avatar */}
          <div
            className="relative shrink-0 z-10 h-28 w-28 md:h-36 md:w-36 rounded-[24px] md:rounded-[28px] overflow-visible"
          >
            <div
              className="h-full w-full rounded-[24px] md:rounded-[28px] overflow-hidden border-[3px] border-[#0D0D0F] bg-[#18181b] flex items-center justify-center text-3xl md:text-4xl font-bold text-white/70"
              style={{
                boxShadow: profile.publicFace
                  ? '0 0 0 2px rgba(180,140,55,0.50), 0 0 0 3.5px rgba(200,165,70,0.18), 0 8px 32px rgba(0,0,0,0.65)'
                  : isEffectivelyGo
                    ? '0 0 0 2.5px rgba(201,168,76,0.55), 0 8px 32px rgba(201,168,76,0.18)'
                    : '0 8px 32px rgba(0,0,0,0.6)',
              }}
            >
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt={user.name} className="h-full w-full object-cover" style={{ objectPosition: profile.avatarPosition ?? '50% 50%' }} />
              ) : (
                getInitials(user.name)
              )}
            </div>
            {isEffectivelyGo && !profile.publicFace && (
              <div className="absolute -bottom-1.5 -right-1.5 z-10">
                <DocrudGoBadge size="sm" />
              </div>
            )}
            {profile.publicFace && (
              <div className="absolute -bottom-2 -right-2 z-10 flex items-center justify-center rounded-full"
                style={{ width: 26, height: 26, background: 'linear-gradient(135deg,#0e0c07,#1a1508)', border: '1.5px solid rgba(180,140,55,0.40)', boxShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
                <PublicFaceStarIcon size={16} />
              </div>
            )}
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0 relative z-10 flex flex-col justify-end sm:pb-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h1 className="text-[24px] md:text-[32px] font-extrabold tracking-tight leading-none text-white">{user.name}</h1>
              {credits?.verified && <VerifiedBadge size="lg" />}
              {isEffectivelyGo && <DocrudGoBadge size="md" />}
              {profile.publicFace && (
                <PublicFaceBadge category={profile.publicFace.category as import('@/types/document').PublicFaceCategory} size="md" />
              )}
              {profile.pronouns && (
                <span className="text-xs text-white/30 font-normal">{profile.pronouns}</span>
              )}
            </div>
            {/* Presence status — below name, above headline */}
            <div className="mb-2.5">
              <PresenceBadge userId={user.id} />
            </div>
            {profile.headline && (
              <p className="text-white/55 text-[15px] md:text-[16px] leading-snug mb-3 max-w-2xl">{profile.headline}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-white/35">
              {profile.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {profile.location}
                </span>
              )}
              {profile.website && (
                <a
                  href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 hover:text-white/60 transition-colors"
                >
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  {profile.website.replace(/^https?:\/\//, '')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {profile.openToWork && (
                <span className="flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="h-3 w-3" />
                  Open to work
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0 relative z-10 sm:pb-1 sm:self-end">
            {isOwnProfile ? (
              <>
                <button
                  onClick={() => setEditOpen(true)}
                  className="flex items-center gap-2 h-9 px-4 rounded-[12px] border border-white/[0.10] bg-white/[0.04] text-white/80 text-sm hover:bg-white/[0.08] transition-colors"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Edit profile</span>
                  <span className="sm:hidden">Edit</span>
                </button>
                <a
                  href="/api/profile/sample-resume"
                  target="_blank"
                  rel="noreferrer"
                  title="Download resume template pre-filled with your profile data"
                  className="flex items-center gap-1.5 h-9 px-3 rounded-[12px] border border-white/[0.10] bg-white/[0.04] text-white/60 text-sm hover:bg-white/[0.08] hover:text-white/80 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline text-xs">Resume</span>
                </a>
                <button
                  onClick={() => void signOut({ callbackUrl: '/onboarding' })}
                  className="flex items-center gap-2 h-9 px-3 rounded-[12px] border border-rose-500/20 bg-rose-500/[0.07] text-rose-400/80 text-sm hover:bg-rose-500/[0.14] hover:text-rose-400 transition-colors"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </>
            ) : session ? (
              <>
                <button
                  onClick={handleUpraise}
                  disabled={upraiseLoading}
                  title={hasUpraised ? 'Remove upraise' : 'Upraise this profile'}
                  className={`flex items-center gap-1.5 h-9 px-3 rounded-[12px] text-sm font-semibold transition-all disabled:opacity-60 ${
                    hasUpraised
                      ? 'border border-amber-500/40 bg-amber-500/10 text-amber-400'
                      : 'border border-white/[0.10] bg-white/[0.04] text-white/50 hover:text-white/80 hover:border-amber-500/25'
                  }`}
                >
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>{upraiseCount > 0 ? upraiseCount : ''}</span>
                </button>
                <button
                  onClick={handleFollow}
                  disabled={followLoading}
                  className={`flex items-center gap-2 h-9 px-4 rounded-[12px] text-sm font-medium transition-colors disabled:opacity-60 ${
                    followingState
                      ? 'border border-white/[0.10] bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'
                      : 'bg-white text-[#0D0D0F] hover:bg-white/90'
                  }`}
                >
                  {followingState ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                  {followingState ? 'Following' : 'Follow'}
                </button>
                {/* Public Faces cannot receive direct messages */}
                {!profile.publicFace && (
                  <Link
                    href={`/messages?user=${user.id}`}
                    className="flex items-center gap-2 h-9 px-3.5 rounded-[12px] border border-blue-500/30 bg-blue-500/[0.08] text-blue-400 text-sm font-medium hover:bg-blue-500/[0.16] transition-colors active:scale-95"
                    title="Message"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Message</span>
                  </Link>
                )}
              </>
            ) : null}
          </div>
        </div>

        {/* Stats row — single scrollable line on all screen sizes */}
        <style>{`.__stats-row::-webkit-scrollbar{display:none}`}</style>
        <div className="relative pt-2 pb-5 md:pb-6 mb-5 md:mb-7 border-b border-white/[0.05]">
          {/* Right-edge fade — hints at horizontal scroll on mobile */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 sm:hidden z-10"
            style={{ background: 'linear-gradient(to right, transparent, var(--bg-base, #0D0D0F))' }} />

          <div
            className="__stats-row flex items-stretch overflow-x-auto"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            <StatItem label="Followers" value={followersCount} onClick={() => { setTab('connections'); loadConnections(); }} />
            <StatItem label="Following" value={liveStats?.following ?? stats.following} onClick={() => { setTab('connections'); loadConnections(); }} />
            <StatItem label="Upraised" value={upraiseCount} />
            <StatItem label="Gigs" value={liveStats?.gigsCount ?? stats.gigsCount} onClick={() => setTab('gigs')} />
            <StatItem label="Published" value={liveStats?.publishedCount ?? stats.publishedCount} onClick={() => setTab('published')} />
            <StatItem label="Total views" value={liveStats?.totalViews ?? stats.totalViews ?? 0} onClick={isOwnProfile ? () => setTab('insights') : undefined} />
            <StatItem label="Total likes" value={liveStats?.totalLikes ?? stats.totalLikes ?? 0} onClick={isOwnProfile ? () => setTab('published') : undefined} />
          </div>
        </div>

        {/* Tabs */}
        <div className="relative flex gap-0 mb-7 md:mb-9 overflow-x-auto [scrollbar-width:none] border-b border-white/[0.06]">
          {TABS.filter((t) => (t.id !== 'insights' && t.id !== 'billing' && t.id !== 'settings') || isOwnProfile).map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); if (t.id === 'connections') loadConnections(); }}
              className={`shrink-0 relative h-10 md:h-11 px-3.5 md:px-5 text-[13px] md:text-[13.5px] font-medium transition-all whitespace-nowrap ${
                tab === t.id
                  ? 'text-white after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-white after:rounded-full'
                  : 'text-white/35 hover:text-white/65 hover:bg-white/[0.03]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ─── tab content ─── */}

        {/* ─── Published tab ─── */}
        {tab === 'published' && (
          <div className="space-y-5">
            {/* Header row */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-[15px] font-bold text-white/85">
                  {isOwnProfile ? 'Your Published Posts' : `${user.name}'s Posts`}
                </h3>
                <p className="text-[11.5px] text-white/30 mt-0.5">
                  {publishedPosts.length > 0 ? `${publishedPosts.length} post${publishedPosts.length !== 1 ? 's' : ''} published` : 'Shared publicly with the community'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => setPublishedView(v => v === 'tracker' ? 'feed' : 'tracker')}
                    className={`flex items-center gap-1.5 h-9 px-3.5 rounded-[11px] text-[12px] font-semibold border transition-all ${
                      publishedView === 'tracker'
                        ? 'border-white/[0.18] bg-white/[0.10] text-white/85'
                        : 'border-white/[0.09] bg-white/[0.04] text-white/45 hover:text-white/70 hover:bg-white/[0.07]'
                    }`}
                  >
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Engagement</span>
                  </button>
                )}
                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => { setPublishModalOpen(true); setPublishError(''); setPublishSuccess(false); setPublishFile(null); setPublishForm({ title: '', category: 'document', tags: [], notes: '', tagInput: '' }); }}
                    className="flex items-center gap-1.5 h-9 px-4 rounded-[11px] text-[12.5px] font-semibold border border-white/[0.09] bg-white/[0.05] text-white/70 hover:bg-white/[0.09] hover:text-white/90 hover:border-white/[0.15] transition-all active:scale-[0.97]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Publish
                  </button>
                )}
              </div>
            </div>

            {/* Feed or Engagement Tracker */}
            {(!isOwnProfile || publishedView === 'feed') && (
              <ProfilePublishedFeed
                userId={user.id}
                isOwn={isOwnProfile}
                onPublish={isOwnProfile ? () => { setPublishModalOpen(true); setPublishError(''); setPublishSuccess(false); setPublishFile(null); setPublishForm({ title: '', category: 'document', tags: [], notes: '', tagInput: '' }); } : undefined}
              />
            )}
            {isOwnProfile && publishedView === 'tracker' && <PublisherTrackingPanel />}
          </div>
        )}

        {/* About tab */}
        {tab === 'about' && (
          <div className="space-y-5">
            {profile.bio && (
              <SectionCard title="About">
                <p className="text-white/70 text-[15px] leading-relaxed whitespace-pre-line">{profile.bio}</p>
              </SectionCard>
            )}

            {(profile.skills ?? []).length > 0 && (
              <SectionCard title="Skills">
                <div className="flex flex-wrap gap-2">
                  {(profile.skills ?? []).map((s) => <SkillChip key={s} label={s} />)}
                </div>
              </SectionCard>
            )}

            {(profile.experience ?? []).length > 0 && (
              <SectionCard title="Experience">
                <div className="space-y-6">
                  {(profile.experience ?? []).map((e, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="mt-1 h-8 w-8 rounded-[10px] bg-white/[0.07] border border-white/[0.08] flex items-center justify-center shrink-0">
                        <Briefcase className="h-4 w-4 text-white/40" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white/90">{e.title}</p>
                        <p className="text-sm text-white/50 mt-0.5">{e.company}</p>
                        <p className="text-xs text-white/30 mt-0.5">{e.period}</p>
                        {e.desc && <p className="text-sm text-white/55 mt-2 leading-relaxed">{e.desc}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {(profile.education ?? []).length > 0 && (
              <SectionCard title="Education">
                <div className="space-y-5">
                  {(profile.education ?? []).map((e, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="mt-1 h-8 w-8 rounded-[10px] bg-white/[0.07] border border-white/[0.08] flex items-center justify-center shrink-0">
                        <GraduationCap className="h-4 w-4 text-white/40" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white/90">{e.degree}</p>
                        <p className="text-sm text-white/50 mt-0.5">{e.school}</p>
                        {e.year && <p className="text-xs text-white/30 mt-0.5">{e.year}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {(profile.achievements ?? []).length > 0 && (
              <SectionCard title="Achievements">
                <div className="space-y-5">
                  {(profile.achievements ?? []).map((a, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="mt-1 h-8 w-8 rounded-[10px] bg-white/[0.07] border border-white/[0.08] flex items-center justify-center shrink-0">
                        <Trophy className="h-4 w-4 text-white/40" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white/90">{a.title}</p>
                        {a.desc && <p className="text-sm text-white/55 mt-1 leading-relaxed">{a.desc}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {socialEntries.length > 0 && (
              <SectionCard title="Social Links">
                <div className="flex flex-wrap gap-3">
                  {socialEntries.map(([platform, url]) => (
                    <a
                      key={platform}
                      href={url.startsWith('http') ? url : `https://${url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 h-9 px-4 rounded-[12px] border border-white/[0.08] bg-white/[0.04] text-white/60 text-sm hover:text-white/90 hover:border-white/[0.15] transition-all"
                    >
                      {socialIcon[platform] ?? <Globe className="h-4 w-4" />}
                      <span className="capitalize">{platform}</span>
                    </a>
                  ))}
                </div>
              </SectionCard>
            )}

            {!profile.bio && !profile.headline && (profile.skills ?? []).length === 0 && (
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-12 text-center">
                <p className="text-white/30 text-sm">
                  {isOwnProfile ? 'Your profile is empty. Click Edit Profile to add information.' : 'This user has not added any profile information yet.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Work & Skills tab */}
        {tab === 'skills' && (
          <div className="space-y-5">
            {(profile.skills ?? []).length > 0 ? (
              <SectionCard title="Skills">
                <div className="flex flex-wrap gap-2">
                  {(profile.skills ?? []).map((s) => <SkillChip key={s} label={s} />)}
                </div>
              </SectionCard>
            ) : (
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-12 text-center">
                <p className="text-white/30 text-sm">No skills added yet.</p>
              </div>
            )}

            {(profile.experience ?? []).length > 0 && (
              <SectionCard title="Work Experience">
                <div className="space-y-6">
                  {(profile.experience ?? []).map((e, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="mt-1 h-9 w-9 rounded-[12px] bg-white/[0.07] border border-white/[0.08] flex items-center justify-center shrink-0">
                        <Briefcase className="h-4 w-4 text-white/40" />
                      </div>
                      <div className="flex-1 min-w-0 border-b border-white/[0.05] pb-5 last:border-0 last:pb-0">
                        <p className="font-semibold text-white/90 text-[15px]">{e.title}</p>
                        <p className="text-sm text-white/55 mt-0.5">{e.company}</p>
                        <p className="text-xs text-white/30 mt-0.5">{e.period}</p>
                        {e.desc && <p className="text-sm text-white/55 mt-2 leading-relaxed">{e.desc}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {(profile.education ?? []).length > 0 && (
              <SectionCard title="Education">
                <div className="space-y-5">
                  {(profile.education ?? []).map((e, i) => (
                    <div key={i} className="flex gap-4">
                      <div className="mt-1 h-9 w-9 rounded-[12px] bg-white/[0.07] border border-white/[0.08] flex items-center justify-center shrink-0">
                        <GraduationCap className="h-4 w-4 text-white/40" />
                      </div>
                      <div className="flex-1 min-w-0 border-b border-white/[0.05] pb-5 last:border-0 last:pb-0">
                        <p className="font-semibold text-white/90 text-[15px]">{e.degree}</p>
                        <p className="text-sm text-white/55 mt-0.5">{e.school}</p>
                        {e.year && <p className="text-xs text-white/30 mt-0.5">{e.year}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
          </div>
        )}

        {/* Gigs tab */}
        {tab === 'gigs' && (
          <div>
            {recentGigs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentGigs.map((g) => (
                  <GigListingCard key={g.id} gig={g} />
                ))}
              </div>
            ) : (
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-16 text-center">
                <div className="h-12 w-12 rounded-[14px] border border-white/[0.08] bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-5 w-5 text-white/30" />
                </div>
                <p className="text-white/40 text-sm">No gigs posted yet.</p>
                {isOwnProfile && (
                  <Link
                    href="/gigs"
                    className="inline-flex items-center gap-2 mt-4 text-sm text-white/50 hover:text-white/80 transition-colors"
                  >
                    Post your first gig
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        {/* Services tab */}
        {tab === 'services' && (() => {
          const SERVICE_CATEGORIES: Record<string, { label: string; color: string; icon: string }> = {
            design: { label: 'Design', color: 'text-pink-400 bg-pink-500/10 border-pink-500/20', icon: '🎨' },
            development: { label: 'Development', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: '💻' },
            writing: { label: 'Writing', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: '✍️' },
            marketing: { label: 'Marketing', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', icon: '📣' },
            consulting: { label: 'Consulting', color: 'text-violet-400 bg-violet-500/10 border-violet-500/20', icon: '🧠' },
            photography: { label: 'Photography', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', icon: '📸' },
            video: { label: 'Video', color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: '🎬' },
            music: { label: 'Music', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', icon: '🎵' },
            business: { label: 'Business', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: '📊' },
            legal: { label: 'Legal', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20', icon: '⚖️' },
            finance: { label: 'Finance', color: 'text-teal-400 bg-teal-500/10 border-teal-500/20', icon: '💰' },
            coaching: { label: 'Coaching', color: 'text-sky-400 bg-sky-500/10 border-sky-500/20', icon: '🏆' },
            education: { label: 'Education', color: 'text-lime-400 bg-lime-500/10 border-lime-500/20', icon: '🎓' },
            health: { label: 'Health', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', icon: '❤️' },
            other: { label: 'Other', color: 'text-white/50 bg-white/[0.06] border-white/[0.10]', icon: '⭐' },
          };

          function formatPrice(service: ServiceItem) {
            if (service.pricingModel === 'contact') return 'Contact for price';
            const sym = service.currency === 'INR' ? '₹' : service.currency === 'EUR' ? '€' : '$';
            const prefix = service.pricingModel === 'starting_from' ? 'From ' : service.pricingModel === 'hourly' ? '' : '';
            const suffix = service.pricingModel === 'hourly' ? '/hr' : '';
            return `${prefix}${sym}${service.basePrice.toLocaleString()}${suffix}`;
          }

          function StarRow({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
            const dim = size === 'md' ? 'h-4 w-4' : 'h-3 w-3';
            return (
              <div className="flex items-center gap-0.5">
                {[1,2,3,4,5].map(n => (
                  <Star key={n} className={`${dim} ${n <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-white/15'}`} />
                ))}
              </div>
            );
          }

          function ServiceCard({ svc }: { svc: ServiceItem }) {
            const cat = SERVICE_CATEGORIES[svc.category] ?? SERVICE_CATEGORIES.other;
            const reviews = serviceReviews[svc.id] ?? [];
            const canReview = !isOwnProfile && session && myServiceBookings.some(b => b.serviceId === svc.id && b.status === 'completed');
            const [showReviews, setShowReviews] = useState(false);

            /* Category-aware gradient for the hero banner */
            const CATEGORY_GRADIENTS: Record<string, string> = {
              design:      'linear-gradient(135deg,#1a0533 0%,#2d1b5e 50%,#1a0533 100%)',
              development: 'linear-gradient(135deg,#001233 0%,#023e8a 50%,#001233 100%)',
              writing:     'linear-gradient(135deg,#0a2e0a 0%,#1a5c2a 50%,#0a2e0a 100%)',
              marketing:   'linear-gradient(135deg,#2e1500 0%,#6b3500 50%,#2e1500 100%)',
              consulting:  'linear-gradient(135deg,#160829 0%,#3b1f6e 50%,#160829 100%)',
              photography: 'linear-gradient(135deg,#1a1400 0%,#4a3800 50%,#1a1400 100%)',
              video:       'linear-gradient(135deg,#2e0000 0%,#6b0000 50%,#2e0000 100%)',
              finance:     'linear-gradient(135deg,#001f1f 0%,#006060 50%,#001f1f 100%)',
              legal:       'linear-gradient(135deg,#111827 0%,#1f2937 50%,#111827 100%)',
              coaching:    'linear-gradient(135deg,#001a2e 0%,#004080 50%,#001a2e 100%)',
              other:       'linear-gradient(135deg,#0f0f14 0%,#1c1c2e 50%,#0f0f14 100%)',
            };
            const heroBg = CATEGORY_GRADIENTS[svc.category] ?? CATEGORY_GRADIENTS.other;

            return (
              <div className="group relative rounded-[20px] overflow-hidden transition-all duration-300 hover:-translate-y-[2px]"
                style={{
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: '#0d0d10',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.30)',
                  transition: 'transform 0.25s cubic-bezier(0.22,1,0.36,1), box-shadow 0.25s ease, border-color 0.25s ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.14)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 16px 48px rgba(0,0,0,0.55)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.30)'; }}
              >
                {/* ── Hero banner ── */}
                <div className="relative overflow-hidden" style={{ height: 148 }}>
                  {svc.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={svc.imageUrl} alt={svc.title} className="h-full w-full object-cover transition-transform duration-600 group-hover:scale-[1.04]" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center" style={{ background: heroBg }}>
                      <span className="text-[56px] opacity-40 select-none" style={{ filter: 'drop-shadow(0 4px 24px rgba(0,0,0,0.6))' }}>{cat.icon}</span>
                    </div>
                  )}
                  {/* Gradient scrim */}
                  <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(13,13,16,0.95) 0%, rgba(13,13,16,0.20) 55%, transparent 100%)' }} />

                  {/* Featured badge */}
                  {svc.featured && (
                    <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider"
                      style={{ background: 'rgba(99,102,241,0.90)', color: '#fff', backdropFilter: 'blur(8px)', boxShadow: '0 2px 12px rgba(99,102,241,0.50)' }}>
                      <Star className="h-2.5 w-2.5 fill-white" /> Featured
                    </div>
                  )}

                  {/* Category badge — bottom-left of hero */}
                  <div className="absolute bottom-3 left-3">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-[3px] text-[9.5px] font-bold backdrop-blur-sm ${cat.color}`}
                      style={{ backdropFilter: 'blur(12px)' }}>
                      {cat.icon} {cat.label}
                    </span>
                  </div>

                  {/* Rating — bottom-right of hero */}
                  {svc.reviewCount > 0 && (
                    <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full px-2.5 py-[3px]"
                      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)' }}>
                      <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                      <span className="text-[9.5px] font-bold text-white/80">{svc.rating}</span>
                      <span className="text-[9px] text-white/35">({svc.reviewCount})</span>
                    </div>
                  )}
                </div>

                {/* ── Card body ── */}
                <div className="p-4">
                  <h3 className="font-bold text-[14.5px] leading-snug text-white/90 mb-1 line-clamp-2 group-hover:text-white transition-colors">{svc.title}</h3>
                  {svc.tagline && <p className="text-[11.5px] text-white/42 mb-3 line-clamp-2 leading-relaxed">{svc.tagline}</p>}

                  {/* Tags */}
                  {svc.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {svc.tags.slice(0, 3).map(t => (
                        <span key={t} className="rounded-full px-2 py-[2px] text-[9.5px] font-medium"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.38)' }}>{t}</span>
                      ))}
                      {svc.tags.length > 3 && <span className="text-[9.5px] text-white/25">+{svc.tags.length - 3}</span>}
                    </div>
                  )}

                  {/* Testimonial highlight */}
                  {reviews.find(r => r.testimonial) && !showReviews && (
                    <div className="mb-3 rounded-[10px] px-3 py-2.5"
                      style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.12)' }}>
                      <p className="text-[10.5px] text-amber-200/65 italic line-clamp-2">"{reviews.find(r => r.testimonial)!.testimonial}"</p>
                      <p className="text-[9.5px] text-white/28 mt-1">— {reviews.find(r => r.testimonial)!.reviewerName}</p>
                    </div>
                  )}

                  {/* Price + delivery + CTA */}
                  <div className="flex items-end justify-between pt-3 gap-3"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="min-w-0">
                      <p className="text-[15px] font-extrabold text-white leading-none">{formatPrice(svc)}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        {svc.deliveryTime && (
                          <span className="flex items-center gap-1 text-[10px] text-white/32">
                            <Clock className="h-2.5 w-2.5" />{svc.deliveryTime} {svc.deliveryUnit ?? 'days'}
                          </span>
                        )}
                        {svc.bookingCount > 0 && (
                          <span className="text-[10px] text-white/25">{svc.deliveryTime ? '·' : ''} {svc.bookingCount} booked</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!isOwnProfile && (
                        <button
                          type="button"
                          onClick={() => { setBookingServiceId(svc.id); setBookingForm({ clientName: '', clientEmail: '', clientPhone: '', clientMessage: '', packageName: '', scheduledDate: '' }); setBookingSuccess(false); setBookingError(''); fetch('/api/services/analytics/track',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serviceId:svc.id,type:'book_click',source:'profile'})}).catch(()=>{}); }}
                          className="flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-[12px] font-bold transition-all active:scale-[0.95]"
                          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.13)', color: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}
                        >
                          Book Now
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Reviews expand row */}
                  {(reviews.length > 0 || canReview) && (
                    <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center gap-2 flex-wrap">
                      {reviews.length > 0 && (
                        <button type="button" onClick={() => setShowReviews(v => !v)}
                          className="text-[11px] font-semibold text-white/40 hover:text-white/70 transition flex items-center gap-1">
                          {showReviews ? '▲ Hide' : '▼ Show'} {reviews.length} review{reviews.length !== 1 ? 's' : ''}
                        </button>
                      )}
                      {canReview && (
                        <button type="button" onClick={() => { setReviewServiceId(svc.id); setReviewForm({ rating: 5, headline: '', body: '', testimonial: '' }); setReviewSuccess(false); setReviewError(''); }}
                          className="ml-auto flex items-center gap-1 rounded-[8px] border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10.5px] font-bold text-amber-400 hover:bg-amber-500/20 transition">
                          <Star className="h-2.5 w-2.5" /> Leave Review
                        </button>
                      )}
                    </div>
                  )}

                  {/* Expanded reviews */}
                  {showReviews && reviews.length > 0 && (
                    <div className="mt-3 space-y-3 max-h-72 overflow-y-auto [scrollbar-width:none]">
                      {reviews.map(rev => (
                        <div key={rev.id} className="rounded-[14px] border border-white/[0.06] bg-white/[0.02] p-3.5">
                          <div className="flex items-start gap-2.5 mb-2">
                            <div className="h-7 w-7 shrink-0 rounded-full overflow-hidden bg-white/[0.08] flex items-center justify-center ring-1 ring-white/[0.08]">
                              {rev.reviewerAvatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={rev.reviewerAvatar} alt={rev.reviewerName} className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-[10px] font-bold text-white/50">{rev.reviewerName.charAt(0).toUpperCase()}</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11.5px] font-bold text-white/75">{rev.reviewerName}</p>
                              <StarRow rating={rev.rating} />
                            </div>
                            <span className="text-[9.5px] text-white/25 shrink-0">{new Date(rev.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                          <p className="text-[12px] font-semibold text-white/70 mb-1">{rev.headline}</p>
                          <p className="text-[11px] text-white/45 leading-relaxed">{rev.body}</p>
                          {rev.testimonial && (
                            <div className="mt-2 rounded-[10px] border border-amber-500/15 bg-amber-500/[0.06] px-2.5 py-2">
                              <p className="text-[10.5px] text-amber-200/65 italic">"{rev.testimonial}"</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          const bookingTarget = bookingServiceId ? profileServices.find(s => s.id === bookingServiceId) : null;

          return (
            <div>
              {/* ── Header ── */}
              <div className="mb-6">
                {/* Title row */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-[18px] font-bold text-white tracking-tight">
                      {isOwnProfile ? 'My Services' : `Services by ${data?.user.name?.split(' ')[0]}`}
                    </h2>
                    <p className="text-[12px] text-white/35 mt-0.5">
                      {profileServices.length > 0
                        ? `${profileServices.length} service${profileServices.length !== 1 ? 's' : ''} · available for booking`
                        : isOwnProfile ? 'Publish services clients can book directly' : 'No services listed yet'}
                    </p>
                  </div>
                  {/* "Add Service" — glass-black theme */}
                  {isOwnProfile && (
                    <button
                      type="button"
                      onClick={() => { setServiceForm({ title: '', tagline: '', description: '', category: 'design', tags: [], pricingModel: 'fixed', basePrice: 0, currency: 'USD', isActive: true, featured: false, deliveryTime: 3, deliveryUnit: 'days' }); setServiceFormError(''); }}
                      className="flex items-center gap-1.5 rounded-[12px] text-[12.5px] font-semibold transition-all active:scale-[0.96] flex-shrink-0"
                      style={{
                        padding: '8px 14px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        color: 'rgba(255,255,255,0.80)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 12px rgba(0,0,0,0.25)',
                      }}
                    >
                      <Plus className="h-3.5 w-3.5 opacity-75" />
                      <span className="hidden xs:inline">Add Service</span>
                      <span className="xs:hidden">Add</span>
                    </button>
                  )}
                </div>

                {/* Sub-tabs + view catalogue — scroll on mobile */}
                {isOwnProfile && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {/* Segmented tabs */}
                    <div className="flex gap-0.5 p-[3px] rounded-[12px] flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      {([
                        { id: 'catalogue' as const, label: 'Catalogue', icon: '◈' },
                        { id: 'bookings'  as const, label: serviceBookings.length > 0 ? `Bookings · ${serviceBookings.length}` : 'Bookings', icon: '◉' },
                        { id: 'analytics' as const, label: 'Analytics', icon: '▲' },
                      ]).map(st => (
                        <button key={st.id} type="button" onClick={() => setServicesSubTab(st.id)}
                          className="flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[11.5px] font-semibold transition-all whitespace-nowrap"
                          style={{
                            background: servicesSubTab === st.id ? 'rgba(255,255,255,0.10)' : 'transparent',
                            color: servicesSubTab === st.id ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.38)',
                            boxShadow: servicesSubTab === st.id ? 'inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
                          }}>
                          <span className="text-[9px] opacity-60">{st.icon}</span>
                          {st.label}
                        </button>
                      ))}
                    </div>
                    {/* View catalogue link */}
                    <Link
                      href={`/services/${userId}`}
                      target="_blank"
                      className="flex items-center gap-1.5 rounded-[10px] text-[11.5px] font-semibold transition-all whitespace-nowrap flex-shrink-0"
                      style={{
                        padding: '6px 12px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.03)',
                        color: 'rgba(255,255,255,0.40)',
                        backdropFilter: 'blur(8px)',
                      }}
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>View Public Catalogue</span>
                    </Link>
                  </div>
                )}
                {!isOwnProfile && profileServices.length > 0 && (
                  <Link
                    href={`/services/${userId}`}
                    className="inline-flex items-center gap-1.5 rounded-[10px] text-[11.5px] font-semibold transition-all"
                    style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.40)' }}
                  >
                    <ExternalLink className="h-3 w-3" /> Full Catalogue
                  </Link>
                )}
              </div>

              {/* Bookings sub-tab (own profile only) */}
              {isOwnProfile && servicesSubTab === 'bookings' && (
                <div>
                  {bookingsLoading ? (
                    <div className="space-y-3">
                      {[1,2,3].map(i => <div key={i} className="h-20 rounded-[18px] animate-pulse bg-white/[0.04]" />)}
                    </div>
                  ) : serviceBookings.length === 0 ? (
                    <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-16 text-center">
                      <div className="h-12 w-12 rounded-[14px] border border-white/[0.08] bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                        <Briefcase className="h-5 w-5 text-white/30" />
                      </div>
                      <p className="text-white/40 text-sm">No bookings yet.</p>
                      <p className="text-[11px] text-white/25 mt-1">Bookings will appear here once clients book your services.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {serviceBookings.map((bkg) => {
                        const statusColors: Record<string, string> = {
                          pending: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                          confirmed: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                          completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                          cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
                        };
                        return (
                          <div key={bkg.id} className="rounded-[18px] border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-3">
                            {/* Top row: service + status */}
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <p className="text-[13.5px] font-bold text-white/85 truncate">{bkg.serviceTitle}</p>
                                  {bkg.packageName && <span className="rounded-full bg-white/[0.07] border border-white/[0.09] px-2 py-0.5 text-[9.5px] font-semibold text-white/40">{bkg.packageName}</span>}
                                </div>
                                <p className="text-[12px] font-semibold text-white/65">{bkg.clientName}</p>
                                {bkg.clientMessage && <p className="text-[11px] text-white/30 mt-1 line-clamp-2">{bkg.clientMessage}</p>}
                                <p className="text-[10px] text-white/25 mt-1">{new Date(bkg.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{bkg.scheduledDate && ` · Preferred: ${new Date(bkg.scheduledDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {bkg.price != null && (
                                  <span className="text-[13px] font-black text-white/70">{bkg.currency === 'INR' ? '₹' : '$'}{bkg.price.toLocaleString()}</span>
                                )}
                                <span className={`rounded-full border px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${statusColors[bkg.status] ?? statusColors.pending}`}>{bkg.status}</span>
                              </div>
                            </div>
                            {/* Contact row */}
                            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-white/[0.04]">
                              <a href={`mailto:${bkg.clientEmail}`}
                                className="flex items-center gap-1.5 rounded-[9px] border border-blue-500/25 bg-blue-500/10 px-3 py-1.5 text-[11px] font-semibold text-blue-400 hover:bg-blue-500/20 transition-all">
                                <MessageSquare className="h-3 w-3" /> Email
                              </a>
                              {bkg.clientPhone && (
                                <a href={`tel:${bkg.clientPhone}`}
                                  className="flex items-center gap-1.5 rounded-[9px] border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-all">
                                  <Zap className="h-3 w-3" /> Call {bkg.clientPhone}
                                </a>
                              )}
                              <span className="text-[10.5px] text-white/30 ml-1">{bkg.clientEmail}</span>
                              <div className="ml-auto flex items-center gap-2">
                                {bkg.status === 'pending' && (
                                  <button type="button" onClick={() => {
                                    fetch('/api/services/bookings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookingId: bkg.id, status: 'confirmed' }) })
                                      .then(r => r.ok ? r.json() : null)
                                      .then((d: { booking?: ServiceBookingItem } | null) => { if (d?.booking) setServiceBookings(prev => prev.map(b => b.id === bkg.id ? d.booking! : b)); })
                                      .catch(() => {});
                                  }} className="rounded-[9px] bg-emerald-500/15 border border-emerald-500/25 px-3 py-1.5 text-[10.5px] font-bold text-emerald-400 hover:bg-emerald-500/25 transition">Confirm</button>
                                )}
                                {bkg.status === 'confirmed' && (
                                  <button type="button" onClick={() => {
                                    fetch('/api/services/bookings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bookingId: bkg.id, status: 'completed' }) })
                                      .then(r => r.ok ? r.json() : null)
                                      .then((d: { booking?: ServiceBookingItem } | null) => { if (d?.booking) setServiceBookings(prev => prev.map(b => b.id === bkg.id ? d.booking! : b)); })
                                      .catch(() => {});
                                  }} className="rounded-[9px] bg-violet-500/15 border border-violet-500/25 px-3 py-1.5 text-[10.5px] font-bold text-violet-400 hover:bg-violet-500/25 transition">Mark Complete</button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Analytics sub-tab (own profile only) */}
              {isOwnProfile && servicesSubTab === 'analytics' && (() => {
                if (analyticsLoading) return (
                  <div className="space-y-4">
                    {[1,2,3].map(i => <div key={i} className="h-24 rounded-[18px] animate-pulse bg-white/[0.04]" />)}
                  </div>
                );
                if (!analyticsData) return (
                  <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-16 text-center">
                    <div className="h-12 w-12 rounded-[14px] border border-white/[0.08] bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                      <BarChart3 className="h-5 w-5 text-white/30" />
                    </div>
                    <p className="text-white/40 text-sm">No analytics data yet.</p>
                    <p className="text-[11px] text-white/25 mt-1">Analytics will appear once your services start getting views.</p>
                  </div>
                );
                const a = analyticsData;
                const maxTrend = Math.max(...a.trend30d, 1);
                const fmtN = (n: number) => n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n);
                const totalSrc = (a.sourceBreakdown.profile + a.sourceBreakdown.catalogue + a.sourceBreakdown.direct) || 1;
                const updatedLabel = analyticsLastUpdated
                  ? analyticsSecondsAgo < 5 ? 'just now' : analyticsSecondsAgo < 60 ? `${analyticsSecondsAgo}s ago` : `${Math.floor(analyticsSecondsAgo/60)}m ago`
                  : null;
                return (
                  <div className="space-y-5">
                    {/* Live header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-400">Live</span>
                        {updatedLabel && <span className="text-[10.5px] text-white/25">· Updated {updatedLabel}</span>}
                      </div>
                      <button type="button" onClick={() => {
                        setAnalyticsLoading(true);
                        fetch('/api/services/analytics')
                          .then(r => r.ok ? r.json() : null)
                          .then((d: { analytics?: ProviderAnalyticsData } | null) => {
                            if (d?.analytics) { setAnalyticsData(d.analytics); setAnalyticsLastUpdated(new Date()); setAnalyticsSecondsAgo(0); }
                          })
                          .catch(() => {})
                          .finally(() => setAnalyticsLoading(false));
                      }} className="flex items-center gap-1.5 text-[11px] font-semibold text-white/30 hover:text-white/60 transition">
                        <RefreshCw className="h-3 w-3" /> Refresh now
                      </button>
                    </div>

                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Total Views', value: fmtN(a.totalViews), sub: `${fmtN(a.totalUniqueViews)} unique`, icon: '👁️', color: 'from-blue-500/10 to-blue-600/5' },
                        { label: 'Book Clicks', value: fmtN(a.totalBookClicks), sub: `${a.overallConversionRate.toFixed(1)}% CTR`, icon: '🖱️', color: 'from-violet-500/10 to-violet-600/5' },
                        { label: 'Bookings', value: fmtN(a.totalBookings), sub: `${fmtN(a.totalCompleted)} completed`, icon: '📋', color: 'from-emerald-500/10 to-emerald-600/5' },
                        { label: 'Revenue', value: `₹${fmtN(a.totalRevenue)}`, sub: `${a.totalReviews} reviews · ⭐ ${a.avgRating.toFixed(1)}`, icon: '💰', color: 'from-amber-500/10 to-amber-600/5' },
                      ].map(kpi => (
                        <div key={kpi.label} className={`rounded-[18px] border border-white/[0.07] bg-gradient-to-br ${kpi.color} p-4`}>
                          <div className="text-xl mb-2">{kpi.icon}</div>
                          <div className="text-[20px] font-black text-white leading-none">{kpi.value}</div>
                          <div className="text-[11px] text-white/40 mt-1 font-medium">{kpi.label}</div>
                          <div className="text-[10px] text-white/25 mt-0.5">{kpi.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* 30-day Trend Chart */}
                    <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.02] p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <p className="text-[13px] font-bold text-white/80">30-Day Views Trend</p>
                          <p className="text-[11px] text-white/30 mt-0.5">Daily view count over the past month</p>
                        </div>
                        <span className="text-[11px] font-semibold text-white/40 bg-white/[0.05] rounded-[8px] px-2.5 py-1">{fmtN(a.totalViews)} total</span>
                      </div>
                      <div className="flex items-end gap-1 h-20">
                        {a.trend30d.map((v, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                            <div
                              className="w-full rounded-[3px] bg-gradient-to-t from-violet-500/60 to-violet-400/30 group-hover:from-violet-500/80 group-hover:to-violet-400/50 transition-all cursor-default"
                              style={{ height: `${Math.max(4, Math.round((v / maxTrend) * 72))}px` }}
                              title={`Day ${i+1}: ${v} views`}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className="text-[9.5px] text-white/20">30 days ago</span>
                        <span className="text-[9.5px] text-white/20">Today</span>
                      </div>
                    </div>

                    {/* Conversion Funnel + Source Breakdown */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Funnel */}
                      <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.02] p-5">
                        <p className="text-[13px] font-bold text-white/80 mb-4">Conversion Funnel</p>
                        {[
                          { label: 'Views', value: a.totalViews, color: 'bg-blue-500/50', pct: 100 },
                          { label: 'Detail Opens', value: a.services.reduce((s,sv) => s + sv.detailOpens, 0), color: 'bg-indigo-500/50', pct: a.totalViews > 0 ? (a.services.reduce((s,sv) => s + sv.detailOpens, 0) / a.totalViews) * 100 : 0 },
                          { label: 'Book Clicks', value: a.totalBookClicks, color: 'bg-violet-500/50', pct: a.totalViews > 0 ? (a.totalBookClicks / a.totalViews) * 100 : 0 },
                          { label: 'Bookings', value: a.totalBookings, color: 'bg-emerald-500/50', pct: a.totalViews > 0 ? (a.totalBookings / a.totalViews) * 100 : 0 },
                          { label: 'Completed', value: a.totalCompleted, color: 'bg-teal-500/50', pct: a.totalViews > 0 ? (a.totalCompleted / a.totalViews) * 100 : 0 },
                        ].map(step => (
                          <div key={step.label} className="mb-2.5">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] text-white/50 font-medium">{step.label}</span>
                              <span className="text-[11px] font-bold text-white/70">{fmtN(step.value)} <span className="text-white/30 font-normal">({step.pct.toFixed(1)}%)</span></span>
                            </div>
                            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                              <div className={`h-full rounded-full ${step.color} transition-all`} style={{ width: `${Math.max(1, step.pct)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Source Breakdown + Peak Hour */}
                      <div className="space-y-4">
                        <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.02] p-5">
                          <p className="text-[13px] font-bold text-white/80 mb-4">Traffic Sources</p>
                          {[
                            { label: 'Profile Page', value: a.sourceBreakdown.profile, icon: '👤', color: 'bg-blue-500/50' },
                            { label: 'Catalogue', value: a.sourceBreakdown.catalogue, icon: '📂', color: 'bg-violet-500/50' },
                            { label: 'Direct', value: a.sourceBreakdown.direct, icon: '🔗', color: 'bg-emerald-500/50' },
                          ].map(src => {
                            const pct = (src.value / totalSrc) * 100;
                            return (
                              <div key={src.label} className="mb-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[11px] text-white/50">{src.icon} {src.label}</span>
                                  <span className="text-[11px] font-bold text-white/70">{fmtN(src.value)} <span className="text-white/30">({pct.toFixed(0)}%)</span></span>
                                </div>
                                <div className="h-1.5 rounded-full bg-white/[0.06]">
                                  <div className={`h-full rounded-full ${src.color}`} style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.02] p-5 flex items-center gap-4">
                          <div className="h-12 w-12 rounded-[14px] bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl shrink-0">⏰</div>
                          <div>
                            <p className="text-[11px] text-white/40 font-medium uppercase tracking-wide">Peak Hour</p>
                            <p className="text-[18px] font-black text-white/85 leading-tight">
                              {a.peakHour === 0 ? '12 AM' : a.peakHour < 12 ? `${a.peakHour} AM` : a.peakHour === 12 ? '12 PM' : `${a.peakHour - 12} PM`}
                            </p>
                            <p className="text-[10px] text-white/25 mt-0.5">Most views arrive around this time</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Top Service Highlight */}
                    {a.topService && (
                      <div className="rounded-[18px] border border-amber-500/20 bg-amber-500/5 p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-base">🏆</span>
                          <p className="text-[12px] font-bold text-amber-400 uppercase tracking-wide">Top Performing Service</p>
                        </div>
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <p className="text-[15px] font-bold text-white/85">{a.topService.serviceTitle}</p>
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              <span className="text-[11px] text-white/40">{fmtN(a.topService.views)} views</span>
                              <span className="text-[11px] text-white/40">{fmtN(a.topService.bookingsSubmitted)} bookings</span>
                              {a.topService.avgRating > 0 && <span className="text-[11px] text-amber-400/70">⭐ {a.topService.avgRating.toFixed(1)}</span>}
                              {a.topService.estimatedRevenue > 0 && <span className="text-[11px] text-emerald-400/70">₹{fmtN(a.topService.estimatedRevenue)} revenue</span>}
                            </div>
                          </div>
                          <div className="flex items-end gap-0.5 h-10 shrink-0">
                            {a.topService.trend7d.map((v, i) => {
                              const mx = Math.max(...a.topService!.trend7d, 1);
                              return <div key={i} className="w-4 rounded-[2px] bg-amber-500/40" style={{ height: `${Math.max(3, Math.round((v/mx)*36))}px` }} />;
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Per-service breakdown table */}
                    {a.services.length > 0 && (
                      <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.02] overflow-hidden">
                        <div className="px-5 py-4 border-b border-white/[0.05]">
                          <p className="text-[13px] font-bold text-white/80">Per-Service Breakdown</p>
                        </div>
                        <div className="divide-y divide-white/[0.04]">
                          {a.services.map(sv => {
                            const mx7 = Math.max(...sv.trend7d, 1);
                            return (
                              <div key={sv.serviceId} className="px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12.5px] font-semibold text-white/80 truncate">{sv.serviceTitle}</p>
                                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                                    <span className="text-[10.5px] text-white/35">{fmtN(sv.views)} views</span>
                                    <span className="text-[10.5px] text-white/35">{fmtN(sv.bookingsSubmitted)} bookings</span>
                                    <span className="text-[10.5px] text-white/35">{sv.conversionRate.toFixed(1)}% conv.</span>
                                    {sv.avgRating > 0 && <span className="text-[10.5px] text-amber-400/60">⭐ {sv.avgRating.toFixed(1)}</span>}
                                  </div>
                                </div>
                                {/* 7-day sparkline */}
                                <div className="flex items-end gap-0.5 h-8 shrink-0">
                                  {sv.trend7d.map((v, i) => (
                                    <div key={i} className="w-3 rounded-[2px] bg-violet-500/35" style={{ height: `${Math.max(2, Math.round((v/mx7)*28))}px` }} />
                                  ))}
                                </div>
                                <div className="text-right shrink-0 min-w-[64px]">
                                  {sv.estimatedRevenue > 0 && <p className="text-[12px] font-bold text-emerald-400/70">₹{fmtN(sv.estimatedRevenue)}</p>}
                                  <p className="text-[10px] text-white/25">{sv.reviews} reviews</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Auto-refresh note */}
                    <p className="text-center text-[10px] text-white/15">Analytics refresh automatically every 30 seconds while this tab is open.</p>
                  </div>
                );
              })()}

              {/* Catalogue sub-tab */}
              {(!isOwnProfile || servicesSubTab === 'catalogue') && (
                <>
                  {servicesLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[1,2,3].map(i => <div key={i} className="h-64 rounded-[22px] animate-pulse bg-white/[0.04]" />)}
                    </div>
                  ) : profileServices.length === 0 ? (
                    /* ── Premium empty state ── */
                    <div className="rounded-[22px] p-8 sm:p-12 text-center flex flex-col items-center"
                      style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'linear-gradient(160deg,rgba(255,255,255,0.025) 0%,rgba(0,0,0,0.02) 100%)' }}>
                      {/* Icon */}
                      <div className="relative mb-5">
                        <div className="h-16 w-16 rounded-[20px] flex items-center justify-center mx-auto"
                          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                          <Briefcase className="h-7 w-7 text-white/25" />
                        </div>
                        {isOwnProfile && (
                          <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full flex items-center justify-center"
                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                            <Plus className="h-3.5 w-3.5 text-white/55" />
                          </div>
                        )}
                      </div>
                      <p className="text-[15px] font-bold text-white/55 mb-1.5">
                        {isOwnProfile ? 'No services yet' : 'No services available'}
                      </p>
                      <p className="text-[12.5px] text-white/28 max-w-xs leading-relaxed mb-5">
                        {isOwnProfile
                          ? 'Publish your first service and let clients book you directly from your profile.'
                          : 'This professional hasn\'t listed any services yet.'}
                      </p>
                      {isOwnProfile && (
                        <button
                          type="button"
                          onClick={() => { setServiceForm({ title: '', tagline: '', description: '', category: 'design', tags: [], pricingModel: 'fixed', basePrice: 0, currency: 'USD', isActive: true, featured: false, deliveryTime: 3, deliveryUnit: 'days' }); setServiceFormError(''); }}
                          className="flex items-center gap-2 rounded-[12px] text-[13px] font-semibold transition-all active:scale-[0.96]"
                          style={{
                            padding: '10px 20px',
                            background: 'rgba(255,255,255,0.07)',
                            border: '1px solid rgba(255,255,255,0.13)',
                            backdropFilter: 'blur(16px)',
                            color: 'rgba(255,255,255,0.80)',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
                          }}
                        >
                          <Plus className="h-4 w-4 opacity-70" /> Publish your first service
                        </button>
                      )}
                    </div>
                  ) : (
                    /* ── Services grid — 1 col mobile, 2 tablet, 3 desktop ── */
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {profileServices.map(svc => (
                        <div key={svc.id} className="relative">
                          <ServiceCard svc={svc} />
                          {/* Owner overlay controls */}
                          {isOwnProfile && (
                            <div className="absolute top-3 left-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ opacity: 1 }}>
                              <button type="button" onClick={() => { setServiceForm(svc); setServiceFormError(''); }}
                                className="flex items-center gap-1 rounded-[8px] px-2.5 py-1 text-[10px] font-semibold transition-all active:scale-95"
                                style={{ background: 'rgba(0,0,0,0.72)', border: '1px solid rgba(255,255,255,0.14)', backdropFilter: 'blur(12px)', color: 'rgba(255,255,255,0.72)' }}>
                                <Edit2 className="h-2.5 w-2.5" /> Edit
                              </button>
                              <button type="button" onClick={async () => {
                                if (!confirm('Delete this service?')) return;
                                await fetch(`/api/services/${svc.id}`, { method: 'DELETE' });
                                setProfileServices(prev => prev.filter(s => s.id !== svc.id));
                              }} className="flex items-center gap-1 rounded-[8px] px-2.5 py-1 text-[10px] font-semibold transition-all active:scale-95"
                                style={{ background: 'rgba(127,0,0,0.65)', border: '1px solid rgba(239,68,68,0.25)', backdropFilter: 'blur(12px)', color: 'rgba(252,165,165,0.85)' }}>
                                <X className="h-2.5 w-2.5" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── Booking modal ── */}
              {bookingTarget && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setBookingServiceId(null)} />
                  <div className="relative z-10 w-full max-w-lg bg-[#111113] border border-white/[0.09] rounded-[24px] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.9)]">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07]">
                      <div>
                        <h3 className="font-bold text-white text-[15px]">Book: {bookingTarget.title}</h3>
                        <p className="text-[11px] text-white/35 mt-0.5">Fill in your details and we'll get back to you</p>
                      </div>
                      <button onClick={() => setBookingServiceId(null)} className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.10] transition-colors">
                        <X className="h-4 w-4 text-white/60" />
                      </button>
                    </div>
                    <div className="px-5 py-5 space-y-4 max-h-[70vh] overflow-y-auto [scrollbar-width:none]">
                      {bookingSuccess ? (
                        <div className="py-10 text-center">
                          <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}>
                            <Check className="h-7 w-7 text-white" />
                          </div>
                          <p className="font-bold text-white text-[16px]">Booking Sent!</p>
                          <p className="text-[12px] text-white/40 mt-1">The service provider will reach out to you shortly.</p>
                          <button type="button" onClick={() => setBookingServiceId(null)} className="mt-5 rounded-[12px] bg-white/[0.08] border border-white/[0.10] px-5 py-2 text-[13px] font-semibold text-white/70 hover:text-white transition">Done</button>
                        </div>
                      ) : (
                        <form onSubmit={async (e) => {
                          e.preventDefault();
                          setBookingSubmitting(true);
                          setBookingError('');
                          try {
                            const res = await fetch('/api/services/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ serviceId: bookingTarget.id, ...bookingForm }) });
                            const d = await res.json() as { error?: string };
                            if (!res.ok) { setBookingError(d.error ?? 'Failed to submit'); return; }
                            fetch('/api/services/analytics/track',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({serviceId:bookingTarget.id,type:'booking_submitted',source:'profile'})}).catch(()=>{});
                            setBookingSuccess(true);
                          } catch { setBookingError('Network error. Please try again.'); }
                          finally { setBookingSubmitting(false); }
                        }} className="space-y-4">
                          {bookingTarget.packages && bookingTarget.packages.length > 0 && (
                            <div>
                              <label className="block text-[11.5px] font-semibold text-white/50 mb-2 uppercase tracking-[0.10em]">Select Package</label>
                              <div className="grid grid-cols-1 gap-2">
                                {bookingTarget.packages.map(pkg => (
                                  <button key={pkg.name} type="button" onClick={() => setBookingForm(f => ({ ...f, packageName: pkg.name }))}
                                    className={`text-left rounded-[14px] border px-4 py-3 transition-all ${bookingForm.packageName === pkg.name ? 'border-violet-500/50 bg-violet-500/10' : 'border-white/[0.07] bg-white/[0.03] hover:border-white/[0.12]'}`}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-[13px] font-bold text-white/85">{pkg.name}</span>
                                      <span className="text-[13px] font-black text-white/80">{bookingTarget.currency === 'INR' ? '₹' : '$'}{pkg.price.toLocaleString()}</span>
                                    </div>
                                    <p className="text-[11px] text-white/40 line-clamp-2">{pkg.description}</p>
                                    <p className="text-[10px] text-white/25 mt-1">{pkg.deliveryTime} {pkg.deliveryUnit} delivery</p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          <div>
                            <label className="block text-[11.5px] font-semibold text-white/50 mb-1.5 uppercase tracking-[0.10em]">Your Name *</label>
                            <input value={bookingForm.clientName} onChange={e => setBookingForm(f => ({ ...f, clientName: e.target.value }))} required placeholder="Full name"
                              className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all" />
                          </div>
                          <div>
                            <label className="block text-[11.5px] font-semibold text-white/50 mb-1.5 uppercase tracking-[0.10em]">Email *</label>
                            <input type="email" value={bookingForm.clientEmail} onChange={e => setBookingForm(f => ({ ...f, clientEmail: e.target.value }))} required placeholder="you@example.com"
                              className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all" />
                          </div>
                          <div>
                            <label className="block text-[11.5px] font-semibold text-white/50 mb-1.5 uppercase tracking-[0.10em]">Phone Number</label>
                            <input type="tel" value={bookingForm.clientPhone} onChange={e => setBookingForm(f => ({ ...f, clientPhone: e.target.value }))} placeholder="+91 98765 43210"
                              className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-violet-500/50 focus:bg-violet-500/5 transition-all" />
                          </div>
                          <div>
                            <label className="block text-[11.5px] font-semibold text-white/50 mb-1.5 uppercase tracking-[0.10em]">Preferred Date</label>
                            <input type="date" value={bookingForm.scheduledDate} onChange={e => setBookingForm(f => ({ ...f, scheduledDate: e.target.value }))}
                              className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white/70 outline-none focus:border-violet-500/50 transition-all" />
                          </div>
                          <div>
                            <label className="block text-[11.5px] font-semibold text-white/50 mb-1.5 uppercase tracking-[0.10em]">Message</label>
                            <textarea rows={3} value={bookingForm.clientMessage} onChange={e => setBookingForm(f => ({ ...f, clientMessage: e.target.value }))} placeholder="Describe what you need…"
                              className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-violet-500/50 transition-all resize-none" />
                          </div>
                          {bookingError && <p className="text-[12px] text-rose-400">{bookingError}</p>}
                          <div className="flex gap-3 pt-1">
                            <button type="button" onClick={() => setBookingServiceId(null)} className="flex-1 h-10 rounded-[12px] border border-white/[0.08] text-white/55 text-sm hover:bg-white/[0.05] transition-colors">Cancel</button>
                            <button type="submit" disabled={bookingSubmitting} className="flex-1 h-10 rounded-[12px] font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 3px 16px rgba(99,102,241,0.4)' }}>
                              {bookingSubmitting ? 'Sending…' : 'Send Booking Request'}
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Leave a Review modal ── */}
              {reviewServiceId && !isOwnProfile && (() => {
                const targetSvc = profileServices.find(s => s.id === reviewServiceId);
                return (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={() => setReviewServiceId(null)} />
                    <div className="relative z-10 w-full max-w-lg bg-[#0E0E10] border border-white/[0.09] rounded-[28px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.95)]">
                      {/* Header */}
                      <div className="relative overflow-hidden px-6 py-5 border-b border-white/[0.07]" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(217,119,6,0.06) 100%)' }}>
                        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(245,158,11,0.15) 0%, transparent 70%)' }} />
                        <div className="relative flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-amber-400/70 mb-1">Leave a Review</p>
                            <h2 className="font-bold text-white text-[16px] leading-tight">{targetSvc?.title ?? 'Service Review'}</h2>
                            <p className="text-[11px] text-white/35 mt-0.5">Share your experience to help others make informed decisions</p>
                          </div>
                          <button onClick={() => setReviewServiceId(null)} className="shrink-0 h-8 w-8 rounded-full border border-white/[0.10] bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.12] transition-colors">
                            <X className="h-4 w-4 text-white/60" />
                          </button>
                        </div>
                      </div>

                      <div className="px-6 py-5 max-h-[72vh] overflow-y-auto [scrollbar-width:none]">
                        {reviewSuccess ? (
                          <div className="py-12 text-center">
                            <div className="h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(245,158,11,0.4)]" style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)' }}>
                              <Star className="h-8 w-8 text-white fill-white" />
                            </div>
                            <p className="font-black text-white text-[18px] mb-2">Review Submitted!</p>
                            <p className="text-[13px] text-white/40 leading-relaxed">Thank you for your feedback. It helps others choose the right service.</p>
                            <button onClick={() => setReviewServiceId(null)} className="mt-6 rounded-[14px] border border-white/[0.10] bg-white/[0.06] px-6 py-2.5 text-[13px] font-semibold text-white/70 hover:text-white hover:bg-white/[0.10] transition-all">Close</button>
                          </div>
                        ) : (
                          <form onSubmit={async (e) => {
                            e.preventDefault();
                            setReviewSubmitting(true);
                            setReviewError('');
                            try {
                              const res = await fetch('/api/services/reviews', {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({ serviceId: reviewServiceId, ...reviewForm }),
                              });
                              const d = await res.json() as { review?: ServiceReviewItem; error?: string };
                              if (!res.ok) { setReviewError(d.error ?? 'Failed to submit.'); return; }
                              if (d.review) {
                                setServiceReviews(prev => ({ ...prev, [reviewServiceId]: [d.review!, ...(prev[reviewServiceId] ?? [])] }));
                                setProfileServices(prev => prev.map(s => s.id === reviewServiceId
                                  ? { ...s, reviewCount: s.reviewCount + 1, rating: Math.round(((s.rating * s.reviewCount) + reviewForm.rating) / (s.reviewCount + 1) * 10) / 10 }
                                  : s));
                              }
                              setReviewSuccess(true);
                            } catch { setReviewError('Network error. Please try again.'); }
                            finally { setReviewSubmitting(false); }
                          }} className="space-y-5">

                            {/* Star Rating */}
                            <div>
                              <label className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40 mb-3">Overall Rating *</label>
                              <div className="flex items-center gap-2">
                                {[1,2,3,4,5].map(n => (
                                  <button key={n} type="button" onClick={() => setReviewForm(f => ({ ...f, rating: n }))}
                                    className="transition-transform hover:scale-110 active:scale-95">
                                    <Star className={`h-8 w-8 transition-colors ${n <= reviewForm.rating ? 'text-amber-400 fill-amber-400' : 'text-white/15 hover:text-amber-400/50'}`} />
                                  </button>
                                ))}
                                <span className="ml-2 text-[13px] font-bold text-white/50">
                                  {['','Poor','Fair','Good','Great','Excellent!'][reviewForm.rating]}
                                </span>
                              </div>
                            </div>

                            <div>
                              <label className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40 mb-1.5">Review Headline *</label>
                              <input value={reviewForm.headline} onChange={e => setReviewForm(f => ({ ...f, headline: e.target.value }))} required maxLength={100}
                                placeholder="Summarise your experience in one line"
                                className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder-white/20 outline-none focus:border-amber-500/40 focus:bg-amber-500/[0.04] transition-all" />
                            </div>

                            <div>
                              <label className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40 mb-1.5">Detailed Review *</label>
                              <textarea rows={4} value={reviewForm.body} onChange={e => setReviewForm(f => ({ ...f, body: e.target.value }))} required maxLength={1000}
                                placeholder="Describe the quality of work, communication, and delivery…"
                                className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder-white/20 outline-none focus:border-amber-500/40 transition-all resize-none" />
                              <p className="text-[10px] text-white/20 mt-1 text-right">{reviewForm.body.length}/1000</p>
                            </div>

                            <div>
                              <label className="block text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/40 mb-1.5">
                                Testimonial Quote <span className="text-white/25 normal-case tracking-normal font-normal">(optional — shown publicly on the service card)</span>
                              </label>
                              <textarea rows={2} value={reviewForm.testimonial} onChange={e => setReviewForm(f => ({ ...f, testimonial: e.target.value }))} maxLength={200}
                                placeholder={'A short quote that can be featured publicly, e.g. "Delivered beyond expectations!"'}
                                className="w-full rounded-[12px] border border-amber-500/20 bg-amber-500/[0.04] px-4 py-2.5 text-[13px] text-white placeholder-white/20 outline-none focus:border-amber-500/40 transition-all resize-none" />
                            </div>

                            {reviewError && (
                              <p className="text-[12px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-[10px] px-3 py-2">{reviewError}</p>
                            )}

                            <div className="flex gap-3 pt-1">
                              <button type="button" onClick={() => setReviewServiceId(null)} className="flex-1 h-11 rounded-[13px] border border-white/[0.09] text-white/55 text-[13px] font-semibold hover:bg-white/[0.05] transition-all">Cancel</button>
                              <button type="submit" disabled={reviewSubmitting}
                                className="flex-1 h-11 rounded-[13px] font-black text-[13px] text-white transition-all active:scale-[0.98] disabled:opacity-60"
                                style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', boxShadow: '0 4px 20px rgba(245,158,11,0.35)' }}>
                                {reviewSubmitting ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                    Submitting…
                                  </span>
                                ) : 'Submit Review'}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Service Form modal (own profile) ── */}
              {isOwnProfile && serviceForm !== null && (() => {
                const isEdit = !!serviceForm.id;
                const categories = ['design','development','writing','marketing','consulting','photography','video','music','business','legal','finance','coaching','education','health','other'];
                const tagInput = serviceTagInput;
                const setTagInput = setServiceTagInput;
                return (
                  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setServiceForm(null)} />
                    <div className="relative z-10 w-full max-w-2xl bg-[#111113] border border-white/[0.09] rounded-[24px] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.9)]">
                      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
                        <div>
                          <h3 className="font-bold text-white text-[15px]">{isEdit ? 'Edit Service' : 'Add New Service'}</h3>
                          <p className="text-[11px] text-white/35 mt-0.5">Build your service listing</p>
                        </div>
                        <button onClick={() => setServiceForm(null)} className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.10] transition-colors">
                          <X className="h-4 w-4 text-white/60" />
                        </button>
                      </div>
                      <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto [scrollbar-width:none]">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-[0.12em]">Title *</label>
                            <input value={serviceForm.title ?? ''} onChange={e => setServiceForm(f => ({ ...f!, title: e.target.value }))} placeholder="e.g. Professional Logo Design"
                              className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-violet-500/50 transition-all" />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-[0.12em]">Tagline</label>
                            <input value={serviceForm.tagline ?? ''} onChange={e => setServiceForm(f => ({ ...f!, tagline: e.target.value }))} placeholder="A short punchy one-liner"
                              className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-violet-500/50 transition-all" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-[0.12em]">Category *</label>
                            <select value={serviceForm.category ?? 'design'} onChange={e => setServiceForm(f => ({ ...f!, category: e.target.value as ServiceItem['category'] }))}
                              className="w-full rounded-[12px] border border-white/[0.09] bg-[#111113] px-4 py-2.5 text-[13px] text-white outline-none focus:border-violet-500/50 transition-all">
                              {categories.map(c => <option key={c} value={c}>{SERVICE_CATEGORIES[c]?.label ?? c}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-[0.12em]">Pricing Model</label>
                            <select value={serviceForm.pricingModel ?? 'fixed'} onChange={e => setServiceForm(f => ({ ...f!, pricingModel: e.target.value as ServiceItem['pricingModel'] }))}
                              className="w-full rounded-[12px] border border-white/[0.09] bg-[#111113] px-4 py-2.5 text-[13px] text-white outline-none focus:border-violet-500/50 transition-all">
                              <option value="fixed">Fixed Price</option>
                              <option value="hourly">Hourly Rate</option>
                              <option value="starting_from">Starting From</option>
                              <option value="contact">Contact for Price</option>
                            </select>
                          </div>
                          {serviceForm.pricingModel !== 'contact' && (
                            <div>
                              <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-[0.12em]">Base Price</label>
                              <input type="number" min={0} value={serviceForm.basePrice ?? 0} onChange={e => setServiceForm(f => ({ ...f!, basePrice: +e.target.value }))}
                                className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white outline-none focus:border-violet-500/50 transition-all" />
                            </div>
                          )}
                          <div>
                            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-[0.12em]">Currency</label>
                            <select value={serviceForm.currency ?? 'USD'} onChange={e => setServiceForm(f => ({ ...f!, currency: e.target.value }))}
                              className="w-full rounded-[12px] border border-white/[0.09] bg-[#111113] px-4 py-2.5 text-[13px] text-white outline-none focus:border-violet-500/50 transition-all">
                              <option value="USD">USD ($)</option>
                              <option value="INR">INR (₹)</option>
                              <option value="EUR">EUR (€)</option>
                              <option value="GBP">GBP (£)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-[0.12em]">Delivery Time</label>
                            <input type="number" min={1} value={serviceForm.deliveryTime ?? 3} onChange={e => setServiceForm(f => ({ ...f!, deliveryTime: +e.target.value }))}
                              className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white outline-none focus:border-violet-500/50 transition-all" />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-[0.12em]">Delivery Unit</label>
                            <select value={serviceForm.deliveryUnit ?? 'days'} onChange={e => setServiceForm(f => ({ ...f!, deliveryUnit: e.target.value as ServiceItem['deliveryUnit'] }))}
                              className="w-full rounded-[12px] border border-white/[0.09] bg-[#111113] px-4 py-2.5 text-[13px] text-white outline-none focus:border-violet-500/50 transition-all">
                              <option value="hours">Hours</option>
                              <option value="days">Days</option>
                              <option value="weeks">Weeks</option>
                              <option value="months">Months</option>
                            </select>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-[0.12em]">Description *</label>
                            <textarea rows={4} value={serviceForm.description ?? ''} onChange={e => setServiceForm(f => ({ ...f!, description: e.target.value }))} placeholder="Describe what you offer, your process, and what clients get…"
                              className="w-full rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-violet-500/50 transition-all resize-none" />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-semibold text-white/45 mb-1.5 uppercase tracking-[0.12em]">Tags</label>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {(serviceForm.tags ?? []).map(t => (
                                <span key={t} className="flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[11px] text-violet-300">
                                  {t}
                                  <button type="button" onClick={() => setServiceForm(f => ({ ...f!, tags: (f!.tags ?? []).filter(x => x !== t) }))} className="text-violet-400/60 hover:text-violet-300"><X className="h-2.5 w-2.5" /></button>
                                </span>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) { e.preventDefault(); const t = tagInput.trim().replace(/,$/, ''); if (!(serviceForm.tags ?? []).includes(t)) setServiceForm(f => ({ ...f!, tags: [...(f!.tags ?? []), t] })); setTagInput(''); } }}
                                placeholder="Type a tag and press Enter"
                                className="flex-1 rounded-[12px] border border-white/[0.09] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder-white/25 outline-none focus:border-violet-500/50 transition-all" />
                              <button type="button" onClick={() => { if (tagInput.trim()) { const t = tagInput.trim(); if (!(serviceForm.tags ?? []).includes(t)) setServiceForm(f => ({ ...f!, tags: [...(f!.tags ?? []), t] })); setTagInput(''); } }}
                                className="rounded-[12px] border border-white/[0.09] bg-white/[0.06] px-3 text-[12px] font-semibold text-white/50 hover:text-white transition">Add</button>
                            </div>
                          </div>
                          <div className="sm:col-span-2 flex items-center gap-3">
                            <label className="flex items-center gap-2.5 cursor-pointer">
                              <div onClick={() => setServiceForm(f => ({ ...f!, isActive: !f!.isActive }))} className={`relative h-5 w-9 rounded-full transition-colors ${serviceForm.isActive ? 'bg-violet-500' : 'bg-white/[0.10]'}`}>
                                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${serviceForm.isActive ? 'left-4' : 'left-0.5'}`} />
                              </div>
                              <span className="text-[12px] text-white/60">{serviceForm.isActive ? 'Visible' : 'Hidden'}</span>
                            </label>
                            <label className="flex items-center gap-2.5 cursor-pointer">
                              <div onClick={() => setServiceForm(f => ({ ...f!, featured: !f!.featured }))} className={`relative h-5 w-9 rounded-full transition-colors ${serviceForm.featured ? 'bg-amber-500' : 'bg-white/[0.10]'}`}>
                                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${serviceForm.featured ? 'left-4' : 'left-0.5'}`} />
                              </div>
                              <span className="text-[12px] text-white/60">Featured</span>
                            </label>
                          </div>
                        </div>
                        {serviceFormError && <p className="text-[12px] text-rose-400">{serviceFormError}</p>}
                        <div className="flex gap-3 pt-1 border-t border-white/[0.06]">
                          <button type="button" onClick={() => setServiceForm(null)} className="flex-1 h-10 rounded-[12px] border border-white/[0.08] text-white/55 text-sm hover:bg-white/[0.05] transition-colors">Cancel</button>
                          <button type="button" disabled={serviceFormSaving} onClick={async () => {
                            if (!serviceForm.title?.trim()) { setServiceFormError('Title is required.'); return; }
                            if (!serviceForm.description?.trim()) { setServiceFormError('Description is required.'); return; }
                            setServiceFormSaving(true); setServiceFormError('');
                            try {
                              const method = isEdit ? 'PUT' : 'POST';
                              const url = isEdit ? `/api/services/${serviceForm.id}` : '/api/services';
                              const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(serviceForm) });
                              const d = await res.json() as { service?: ServiceItem; error?: string };
                              if (!res.ok) { setServiceFormError(d.error ?? 'Failed to save'); return; }
                              if (d.service) {
                                setProfileServices(prev => isEdit ? prev.map(s => s.id === d.service!.id ? d.service! : s) : [d.service!, ...prev]);
                              }
                              setServiceForm(null);
                            } catch { setServiceFormError('Network error.'); }
                            finally { setServiceFormSaving(false); }
                          }} className="flex-1 h-10 rounded-[12px] font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-60" style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', boxShadow: '0 3px 16px rgba(99,102,241,0.4)' }}>
                            {serviceFormSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Service'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* Business Pages tab */}
        {tab === 'pages' && userId && <BusinessPagesTab userId={userId} isOwnProfile={!!isOwnProfile} />}

        {/* Activity tab */}
        {tab === 'activity' && (
          <div className="space-y-4">
            {isOwnProfile && publishedPosts.length === 0 && (
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-16 text-center">
                <p className="text-white/30 text-sm">No published activity yet. Start publishing to see your posts here.</p>
              </div>
            )}
            {isOwnProfile && publishedPosts.length > 0 && (
              <div className="space-y-3">
                {publishedPosts.map((post) => {
                  const isActive = post.featured && post.featuredUntil && new Date(post.featuredUntil) > new Date();
                  return (
                    <div key={post.id} className="group rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-5 transition hover:bg-white/[0.05]">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {isActive && (
                              <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider ${
                                post.featuredPlan === 'prime' ? 'bg-amber-500/20 text-amber-300' :
                                post.featuredPlan === 'boost' ? 'bg-violet-500/20 text-violet-300' :
                                'bg-sky-500/20 text-sky-300'
                              }`}>
                                {post.featuredPlan === 'prime' ? '👑 Prime' : post.featuredPlan === 'boost' ? '🚀 Boost' : '⚡ Spotlight'}
                              </span>
                            )}
                          </div>
                          <h4 className="text-[13.5px] font-semibold text-white/80 truncate">{post.title || post.fileName}</h4>
                          <p className="text-[11px] text-white/30 mt-0.5">{new Date(post.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={`/transfer/${post.shareId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/40 transition hover:text-white/80"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => setFeaturePanelPost({ id: post.id, title: post.title || post.fileName })}
                            className={`flex items-center gap-1.5 rounded-[10px] border px-3 py-1.5 text-[11.5px] font-semibold transition ${
                              isActive
                                ? 'border-amber-500/20 bg-amber-500/[0.08] text-amber-400 hover:bg-amber-500/[0.14]'
                                : 'border-white/[0.10] bg-white/[0.04] text-white/50 hover:bg-white/[0.09] hover:text-white/80'
                            }`}
                          >
                            <Rocket className="h-3 w-3" />
                            {isActive ? `Featured · ${Math.ceil((new Date(post.featuredUntil!).getTime() - Date.now()) / 86400000)}d left` : 'Feature'}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-5">
                        <span className="flex items-center gap-1.5 text-[11px] text-white/30">
                          <Heart className="h-3.5 w-3.5" />
                          {post.likesCount} likes
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px] text-white/30">
                          <Eye className="h-3.5 w-3.5" />
                          {post.viewCount} views
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!isOwnProfile && (
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-16 text-center">
                <p className="text-white/30 text-sm">No recent published activity.</p>
              </div>
            )}

            {/* Published page engagement tracking */}
            {isOwnProfile && <PublisherTrackingPanel />}

            {/* Shared document links tracking */}
            {isOwnProfile && (
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/[0.06] border border-white/[0.08]">
                      <Share2 className="h-3.5 w-3.5 text-white/50" />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-white/75">Shared document links</p>
                      <p className="text-[10.5px] text-white/30">{sharedLinks.length} link{sharedLinks.length !== 1 ? 's' : ''} tracked</p>
                    </div>
                  </div>
                </div>
                {sharedLinks.length === 0 ? (
                  <div className="py-8 text-center">
                    <FileText className="h-6 w-6 text-white/10 mx-auto mb-2" />
                    <p className="text-[12px] text-white/25">No secure document links yet.</p>
                    <p className="text-[11px] text-white/15 mt-1">Share a document from the workspace to see tracking here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sharedLinks.slice(0, 10).map((link) => {
                      const expired = link.shareAccessPolicy === 'expiring' && link.shareExpiresAt
                        ? new Date(link.shareExpiresAt).getTime() < Date.now()
                        : false;
                      const signed = Boolean(link.recipientSignedAt);
                      const shareUrl = link.shareId ? `/documents/${link.shareId}` : null;
                      return (
                        <div key={link.id} className="flex items-center gap-3 rounded-[14px] border border-white/[0.05] bg-white/[0.02] px-3.5 py-3 hover:bg-white/[0.04] transition group">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-white/[0.05]">
                            <FileText className="h-3.5 w-3.5 text-white/30" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-white/70 truncate">{link.uploadedPdfFileName || link.templateName}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Eye className="h-2.5 w-2.5 text-white/20" />
                              <span className="text-[10px] text-white/25">{link.openCount ?? 0} opens</span>
                              {link.sharePassword && (
                                <>
                                  <KeyRound className="h-2.5 w-2.5 text-white/15 ml-1" />
                                  <span className="text-[10px] font-mono text-white/20">{link.sharePassword}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {expired ? (
                              <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[9px] font-bold text-rose-400">Expired</span>
                            ) : signed ? (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-bold text-emerald-400">Signed</span>
                            ) : (
                              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-400">Active</span>
                            )}
                            {shareUrl && (
                              <button
                                type="button"
                                onClick={async () => {
                                  const full = `${window.location.origin}${shareUrl}`;
                                  await navigator.clipboard.writeText(full);
                                  setSharedLinksCopied(link.id);
                                  setTimeout(() => setSharedLinksCopied(null), 2000);
                                }}
                                className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-white/[0.07] bg-white/[0.03] text-white/30 hover:text-white/70 hover:bg-white/[0.08] transition"
                              >
                                {sharedLinksCopied === link.id
                                  ? <Check className="h-3 w-3 text-emerald-400" />
                                  : <Copy className="h-3 w-3" />
                                }
                              </button>
                            )}
                            {shareUrl && (
                              <a
                                href={shareUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-white/[0.07] bg-white/[0.03] text-white/30 hover:text-white/70 hover:bg-white/[0.08] transition"
                              >
                                <Link2 className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {sharedLinks.length > 10 && (
                      <p className="text-center text-[11px] text-white/20 pt-1">+{sharedLinks.length - 10} more in workspace history</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Insights tab */}
        {tab === 'insights' && isOwnProfile && (() => {
          const strength = profileStrength(profile);
          const profileViews = analytics?.totalViews ?? Math.floor(followersCount * 3.2 + stats.publishedCount * 8 + 47);
          const weekViews = Math.floor(profileViews * 0.18);
          const searchAppearances = Math.floor(profileViews * 0.42);
          const engagementRate = stats.publishedCount > 0
            ? Math.min(Math.floor((followersCount / Math.max(profileViews, 1)) * 100 * 4.2), 98)
            : 0;

          return (
            <div className="space-y-5">
              {/* Profile strength card */}
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.05]">
                    <Shield className="h-4 w-4 text-white/50" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white/80">Profile Strength</h3>
                    <p className="text-xs text-white/35">Complete your profile to attract more connections</p>
                  </div>
                  <span className="ml-auto text-2xl font-black text-white">{strength}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${strength}%`,
                      background: strength >= 80
                        ? 'linear-gradient(90deg, #4f46e5, #818cf8)'
                        : strength >= 50
                          ? 'linear-gradient(90deg, #ffffff88, #ffffffcc)'
                          : 'linear-gradient(90deg, #ffffff44, #ffffff77)',
                    }}
                  />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {[
                    { label: 'Headline', done: !!profile.headline },
                    { label: 'Bio', done: !!profile.bio },
                    { label: 'Skills', done: (profile.skills ?? []).length > 0 },
                    { label: 'Experience', done: (profile.experience ?? []).length > 0 },
                    { label: 'Education', done: (profile.education ?? []).length > 0 },
                    { label: 'Achievements', done: (profile.achievements ?? []).length > 0 },
                    { label: 'Social links', done: Object.values(profile.socialLinks ?? {}).some(Boolean) },
                  ].map(({ label, done }) => (
                    <div
                      key={label}
                      className={`flex items-center gap-2 rounded-[12px] border px-3 py-2.5 ${
                        done
                          ? 'border-white/[0.10] bg-white/[0.05] text-white/70'
                          : 'border-white/[0.05] bg-transparent text-white/25'
                      }`}
                    >
                      <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${done ? 'bg-white/60' : 'bg-white/15'}`} />
                      <span className="text-xs font-medium">{label}</span>
                    </div>
                  ))}
                </div>
                {strength < 100 && (
                  <button
                    onClick={() => setEditOpen(true)}
                    className="mt-4 flex items-center gap-2 rounded-[12px] border border-white/[0.08] bg-white/[0.05] px-4 py-2.5 text-xs font-semibold text-white/60 transition hover:bg-white/[0.09] hover:text-white/85"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                    Complete your profile
                  </button>
                )}
              </div>

              {/* Reach metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total views', value: profileViews.toLocaleString(), icon: Eye, sub: `+${weekViews} this week`, trend: profileViews > 0 },
                  { label: 'Total likes', value: (analytics?.totalLikes ?? 0).toLocaleString(), icon: ThumbsUp, sub: 'Across all posts', trend: (analytics?.totalLikes ?? 0) > 0 },
                  { label: 'Total comments', value: (analytics?.totalComments ?? 0).toLocaleString(), icon: BarChart3, sub: 'Across all posts', trend: false },
                  { label: 'Content pieces', value: (analytics?.publishCount ?? stats.publishedCount).toLocaleString(), icon: Share2, sub: `${analytics?.featuredCount ?? 0} featured`, trend: false },
                ].map(({ label, value, icon: Icon, sub, trend }) => (
                  <div key={label} className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.05]">
                        <Icon className="h-3.5 w-3.5 text-white/45" />
                      </div>
                      {trend && (
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                          ↑ trending
                        </span>
                      )}
                    </div>
                    <p className="text-2xl font-black text-white tracking-tight">{value}</p>
                    <p className="text-[11px] text-white/40 mt-0.5">{label}</p>
                    <p className="text-[10px] text-white/25 mt-2">{sub}</p>
                  </div>
                ))}
              </div>

              {/* Network breakdown */}
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-6">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40 mb-5">Network breakdown</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  {[
                    { label: 'Followers', value: followersCount, pct: Math.min(100, followersCount * 2) },
                    { label: 'Following', value: stats.following, pct: Math.min(100, stats.following * 2) },
                    { label: 'Connections', value: Math.floor((followersCount + stats.following) * 0.62), pct: Math.min(100, followersCount + stats.following) },
                  ].map(({ label, value, pct }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-white/50">{label}</span>
                        <span className="text-sm font-bold text-white">{value.toLocaleString()}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-white/40 to-white/70 transition-all duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Credits & Streak */}
              {credits && (
                <>
                  {/* Balance + streak hero */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5 relative overflow-hidden">
                      <div className="absolute inset-0 opacity-5" style={{ background: 'radial-gradient(circle at 80% 20%, #6366f1, transparent 60%)' }} />
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-2">Credits balance</p>
                      <p className="text-3xl font-black text-white tracking-tight" style={{ backgroundImage: 'linear-gradient(90deg,#a5b4fc,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{credits.balance.toLocaleString()}</p>
                      <p className="text-[11px] text-white/30 mt-1">{credits.totalEarned} earned · virtual currency</p>
                      <div className="mt-3 text-[10px] text-white/20">Spend on premium features at checkout</div>
                    </div>
                    <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5 relative overflow-hidden">
                      <div className="absolute inset-0 opacity-5" style={{ background: 'radial-gradient(circle at 80% 20%, #FF6B35, transparent 60%)' }} />
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30 mb-2">Posting streak</p>
                      <div className="flex items-end gap-2">
                        <p className="text-3xl font-black text-white tracking-tight">{credits.streak.current}</p>
                        <p className="text-sm text-white/40 mb-1">days</p>
                      </div>
                      <p className="text-[11px] text-white/30 mt-1">Longest: {credits.streak.longest} days</p>
                      <div className="mt-2 flex gap-1">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i < Math.min(credits.streak.current, 10) ? 'bg-gradient-to-r from-amber-400 to-orange-400' : 'bg-white/[0.08]'}`} />
                        ))}
                      </div>
                      <p className="text-[10px] text-white/20 mt-1.5">{credits.streak.current >= 10 ? '∞ Verified badge earned!' : `${10 - Math.min(credits.streak.current, 10)} more days to verified badge`}</p>
                    </div>
                  </div>

                  {/* Milestones */}
                  {(() => {
                    const ALL_MILESTONES = [
                      { id: 'first_step', title: 'First Step', desc: 'Create your account', icon: '🚀', credits: 5 },
                      { id: 'profile_complete', title: 'Identity Established', desc: 'Complete your profile 100%', icon: '∞', credits: 20 },
                      { id: 'first_publish', title: 'First Publish', desc: 'Publish your first content', icon: '📄', credits: 10 },
                      { id: 'streak_7', title: 'Week Warrior', desc: 'Post 7 days in a row', icon: '🔥', credits: 30 },
                      { id: 'streak_10', title: 'Verified Creator', desc: 'Post 10 days in a row', icon: '✓', credits: 75, grantsVerified: true },
                      { id: 'streak_30', title: 'Legendary', desc: 'Post 30 days in a row', icon: '👑', credits: 200 },
                      { id: 'followers_10', title: 'Rising Star', desc: 'Earn 10 followers', icon: '⭐', credits: 15 },
                      { id: 'followers_100', title: 'Influencer', desc: 'Earn 100 followers', icon: '💫', credits: 50 },
                      { id: 'publish_10', title: 'Content Creator', desc: 'Publish 10 content pieces', icon: '🎨', credits: 40 },
                    ];
                    return (
                      <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-6">
                        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40 mb-5">Milestones</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {ALL_MILESTONES.map((m) => {
                            const done = credits.milestones.includes(m.id);
                            return (
                              <div key={m.id} className={`relative flex items-start gap-3 rounded-[14px] border p-4 transition-all ${done ? 'border-white/[0.12] bg-white/[0.05]' : 'border-white/[0.05] bg-transparent opacity-50'}`}>
                                {'grantsVerified' in m && m.grantsVerified && done && (
                                  <div className="absolute top-2 right-2"><VerifiedBadge size="sm" /></div>
                                )}
                                <span className="text-xl shrink-0">{m.icon}</span>
                                <div className="min-w-0">
                                  <p className={`text-[12.5px] font-semibold ${done ? 'text-white/85' : 'text-white/40'}`}>{m.title}</p>
                                  <p className="text-[11px] text-white/30 mt-0.5">{m.desc}</p>
                                  <p className={`text-[10px] mt-1.5 font-bold ${done ? 'text-amber-400/70' : 'text-white/20'}`}>+{m.credits} credits</p>
                                </div>
                                {done && <div className="absolute right-3 bottom-3 h-1.5 w-1.5 rounded-full bg-emerald-400" />}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Credit transactions */}
                  {credits.transactions.length > 0 && (
                    <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-6">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40 mb-4">Recent credit activity</h3>
                      <div className="space-y-2">
                        {credits.transactions.slice(0, 8).map((t) => (
                          <div key={t.id} className="flex items-center justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0">
                            <div className="min-w-0">
                              <p className="text-[12.5px] text-white/70 truncate">{t.description || t.reason}</p>
                              <p className="text-[10px] text-white/25 mt-0.5">{new Date(t.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                            </div>
                            <span className={`text-sm font-bold shrink-0 ${t.type === 'earn' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {t.type === 'earn' ? '+' : '-'}{t.amount}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Account info */}
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-6">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40 mb-4">Account info</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Account type', value: user.accountType ?? user.role ?? 'Standard' },
                    { label: 'Member since', value: new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) },
                    { label: 'User ID', value: user.id },
                    { label: 'Email', value: user.email },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between gap-4 py-2 border-b border-white/[0.04] last:border-0">
                      <span className="text-xs text-white/35">{label}</span>
                      <span className="text-xs text-white/65 font-medium text-right truncate max-w-[220px]">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          );
        })()}

        {/* Billing tab */}
        {tab === 'billing' && isOwnProfile && (() => {
          /* ── Infinity plan helpers ── */
          const daysLeft = infinityStatus?.active && infinityStatus.expiresAt
            ? Math.max(0, Math.ceil((new Date(infinityStatus.expiresAt).getTime() - Date.now()) / 86_400_000))
            : 0;

          const handleInfinityPayment = async (period: 'monthly' | 'annual') => {
            setInfinityPayError('');
            setInfinityPayPhase('paying');
            try {
              const res = await fetch('/api/billing/infinity', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ period }),
              });
              const data = await res.json() as { order?: { id: string; amount: number; currency: string }; keyId?: string; customer?: { name: string; email: string }; error?: string };
              if (!res.ok || !data.order?.id) {
                setInfinityPayError(data.error ?? 'Could not initiate payment. Please try again.');
                setInfinityPayPhase('idle');
                return;
              }
              const win = window as typeof window & { Razorpay?: new (opts: Record<string, unknown>) => { open(): void } };
              if (!win.Razorpay) {
                setInfinityPayError('Payment gateway failed to load. Please refresh and retry.');
                setInfinityPayPhase('idle');
                return;
              }
              const rz = new win.Razorpay({
                key: data.keyId,
                amount: data.order.amount,
                currency: data.order.currency || 'INR',
                name: 'Docrud',
                description: period === 'annual' ? 'Infinity ∞ — Annual Plan' : 'Infinity ∞ — Monthly Plan',
                order_id: data.order.id,
                prefill: { name: data.customer?.name || '', email: data.customer?.email || '' },
                theme: { color: '#6366f1' },
                modal: { backdropclose: false },
                handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
                  try {
                    const vRes = await fetch('/api/billing/infinity', {
                      method: 'PUT',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ ...response, period }),
                    });
                    const vData = await vRes.json() as { success?: boolean; error?: string };
                    if (vData.success) {
                      setInfinityPayPhase('success');
                      // Refresh infinity status
                      fetch('/api/billing/infinity').then(r => r.ok ? r.json() : null).then((d: typeof infinityStatus | null) => { if (d) setInfinityStatus(d); }).catch(() => {});
                    } else {
                      setInfinityPayError(vData.error ?? 'Verification failed. Contact support.');
                      setInfinityPayPhase('idle');
                    }
                  } catch {
                    setInfinityPayError('Verification failed. Contact support.');
                    setInfinityPayPhase('idle');
                  }
                },
                'modal.ondismiss': () => { setInfinityPayPhase('idle'); },
              });
              rz.open();
            } catch {
              setInfinityPayError('Something went wrong. Please try again.');
              setInfinityPayPhase('idle');
            }
          };

          return (
          <div className="space-y-5">

            {/* ── Infinity Plan Card ── */}
            {(() => {
              const isActive  = infinityStatus?.active === true;
              const isExpired = infinityStatus?.isExpired === true;
              const hasEverHad = isActive || isExpired;

              if (isActive) {
                /* ── Active plan ── */
                const pct = infinityStatus!.expiresAt && infinityStatus!.purchasedAt
                  ? (() => {
                      const total = new Date(infinityStatus!.expiresAt!).getTime() - new Date(infinityStatus!.purchasedAt!).getTime();
                      const used  = Date.now() - new Date(infinityStatus!.purchasedAt!).getTime();
                      return Math.min(100, Math.max(0, Math.round((used / total) * 100)));
                    })()
                  : 0;
                const urgency = daysLeft <= 7 ? 'rose' : daysLeft <= 14 ? 'amber' : 'indigo';
                const barColor = urgency === 'rose' ? '#f43f5e' : urgency === 'amber' ? '#f59e0b' : '#818cf8';
                return (
                  <div className="rounded-[20px] overflow-hidden" style={{ background: 'linear-gradient(135deg,#0f0c2e 0%,#1a1545 50%,#0d0b25 100%)', border: '1px solid rgba(99,102,241,0.22)' }}>
                    {/* Header stripe */}
                    <div className="px-5 pt-5 pb-4">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[18px] font-black tracking-[-0.03em] text-white">Infinity <span style={{ color: '#a5b4fc' }}>∞</span></span>
                            <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em]" style={{ background: 'rgba(99,102,241,0.18)', color: '#a5b4fc' }}>
                              {infinityStatus!.period === 'annual' ? 'Annual' : 'Monthly'}
                            </span>
                            {infinityStatus!.grantedFree && (
                              <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em]" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>Free</span>
                            )}
                          </div>
                          <p className="text-[11px]" style={{ color: 'rgba(165,180,252,0.5)' }}>Active · renews {infinityStatus!.expiresAt ? new Date(infinityStatus!.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[28px] font-black leading-none tracking-[-0.04em]" style={{ color: daysLeft <= 7 ? '#f43f5e' : daysLeft <= 14 ? '#f59e0b' : '#a5b4fc' }}>{daysLeft}</p>
                          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.32)' }}>days left</p>
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="mb-3 h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: barColor }} />
                      </div>
                      {daysLeft <= 14 && (
                        <p className="text-[10.5px] mb-3" style={{ color: urgency === 'rose' ? '#f43f5e' : '#f59e0b' }}>
                          {daysLeft <= 7 ? '⚠ Expires soon — renew to keep your benefits.' : 'Renew early to avoid any interruption.'}
                        </p>
                      )}

                      {/* Feature list */}
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        {[
                          { icon: '🔍', label: '3× profile visibility' },
                          { icon: '⚡', label: 'Premium gigs & AI tools' },
                          { icon: '∞', label: 'Infinity verified badge' },
                          { icon: '📄', label: 'E-Sign, DocWord & more' },
                          { icon: '☁',  label: '5 GB Infinity Drive' },
                          { icon: '🚀', label: 'Priority search ranking' },
                        ].map(({ icon, label }) => (
                          <div key={label} className="flex items-center gap-1.5 text-[10.5px]" style={{ color: 'rgba(165,180,252,0.65)' }}>
                            <span className="text-[12px] w-4 text-center shrink-0">{icon}</span>
                            {label}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Renew CTA */}
                    <div className="px-5 pb-5">
                      {infinityPayPhase === 'success' ? (
                        <div className="rounded-[12px] py-2.5 text-center text-[12px] font-bold" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.20)' }}>
                          ✓ Plan renewed successfully!
                        </div>
                      ) : (
                        <>
                          {infinityPayError && <p className="mb-2 text-[11px]" style={{ color: '#f43f5e' }}>{infinityPayError}</p>}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={infinityPayPhase === 'paying'}
                              onClick={() => void handleInfinityPayment('monthly')}
                              className="flex-1 rounded-[12px] py-2.5 text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                              style={{ background: 'rgba(99,102,241,0.12)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' }}
                            >
                              {infinityPayPhase === 'paying' ? '…' : 'Renew Monthly · ₹299'}
                            </button>
                            <button
                              type="button"
                              disabled={infinityPayPhase === 'paying'}
                              onClick={() => void handleInfinityPayment('annual')}
                              className="flex-1 rounded-[12px] py-2.5 text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                              style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', boxShadow: '0 4px 18px rgba(99,102,241,0.35)' }}
                            >
                              {infinityPayPhase === 'paying' ? '…' : 'Renew Annual · ₹2,499'}
                            </button>
                          </div>
                          <p className="mt-2 text-center text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>Renewing extends from current expiry date</p>
                        </>
                      )}
                    </div>
                  </div>
                );
              }

              /* ── No plan / expired ── */
              return (
                <div className="rounded-[20px] overflow-hidden" style={{ background: 'linear-gradient(135deg,#0c0c18 0%,#111128 100%)', border: '1px solid rgba(99,102,241,0.14)' }}>
                  <div className="px-5 pt-5 pb-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]" style={{ background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.18)' }}>
                        <span className="text-[18px] font-black" style={{ color: '#818cf8' }}>∞</span>
                      </div>
                      <div>
                        <h3 className="text-[14px] font-black text-white leading-tight">Docrud Infinity</h3>
                        <p className="text-[10.5px] mt-0.5" style={{ color: isExpired ? '#f43f5e' : 'rgba(255,255,255,0.32)' }}>
                          {isExpired ? 'Your plan has expired' : 'No active plan'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {[
                        { icon: '🔍', label: '3× profile visibility' },
                        { icon: '⚡', label: 'Premium gigs & AI tools' },
                        { icon: '∞', label: 'Infinity verified badge' },
                        { icon: '📄', label: 'E-Sign, DocWord & more' },
                        { icon: '☁',  label: '5 GB Infinity Drive' },
                        { icon: '🚀', label: 'Priority search ranking' },
                      ].map(({ icon, label }) => (
                        <div key={label} className="flex items-center gap-1.5 text-[10.5px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          <span className="text-[12px] w-4 text-center shrink-0">{icon}</span>
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="px-5 pb-5">
                    {infinityPayPhase === 'success' ? (
                      <div className="rounded-[12px] py-2.5 text-center text-[12px] font-bold" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.20)' }}>
                        ✓ Infinity activated! Refresh to see your plan.
                      </div>
                    ) : (
                      <>
                        {infinityPayError && <p className="mb-2 text-[11px]" style={{ color: '#f43f5e' }}>{infinityPayError}</p>}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={infinityPayPhase === 'paying'}
                            onClick={() => void handleInfinityPayment('monthly')}
                            className="flex-1 rounded-[12px] py-2.5 text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                            style={{ background: 'rgba(99,102,241,0.10)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.22)' }}
                          >
                            {infinityPayPhase === 'paying' ? '…' : 'Monthly · ₹299'}
                          </button>
                          <button
                            type="button"
                            disabled={infinityPayPhase === 'paying'}
                            onClick={() => void handleInfinityPayment('annual')}
                            className="flex-1 rounded-[12px] py-2.5 text-[12px] font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                            style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff', boxShadow: '0 4px 18px rgba(99,102,241,0.35)' }}
                          >
                            {infinityPayPhase === 'paying' ? '…' : 'Annual · ₹2,499 / yr'}
                          </button>
                        </div>
                        <p className="mt-2 text-center text-[9px]" style={{ color: 'rgba(255,255,255,0.18)' }}>
                          {isExpired ? 'Reactivate to restore all premium features' : 'Unlock all premium features instantly'}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Feature post CTA */}
            <div className="rounded-[20px] border border-violet-500/[0.12] bg-violet-500/[0.04] p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-violet-500/10 ring-1 ring-violet-500/20">
                  <Rocket className="h-5 w-5 text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[14px] font-bold text-white mb-1">Feature your posts</h3>
                  <p className="text-[12.5px] text-white/40 leading-relaxed">Pin your content at the top of the feed, attract more views, and grow your audience. Plans from ₹199.</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                {publishedPosts.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setFeaturePanelPost({ id: publishedPosts[0].id, title: publishedPosts[0].title || publishedPosts[0].fileName })}
                    className="flex items-center gap-2 rounded-[12px] bg-violet-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-violet-500"
                  >
                    <Rocket className="h-3.5 w-3.5" />
                    Feature a post
                  </button>
                ) : (
                  <p className="text-[12px] text-white/30">Publish content first to feature it.</p>
                )}
              </div>
            </div>

            {/* Billing history */}
            <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40">Payment history</h3>
                <a
                  href="/api/billing/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] text-white/30 hover:text-white/60 transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Full billing
                </a>
              </div>

              {billingHistory.length === 0 ? (
                <div className="py-10 text-center">
                  <CreditCard className="h-8 w-8 text-white/15 mx-auto mb-3" />
                  <p className="text-[13px] text-white/30">No payment history yet.</p>
                  <p className="text-[11px] text-white/20 mt-1">Feature a post or upgrade your plan to see transactions here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {billingHistory.slice(0, 20).map((tx) => {
                    const isFeaturePost = tx.productType === 'feature_post';
                    const amountFormatted = `₹${((tx.totalAmountInPaise ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                    const label = tx.productLabel || tx.planName || 'Purchase';
                    const invoiceUrl = `/api/billing/invoice/${encodeURIComponent(tx.id)}`;
                    return (
                      <div key={tx.id} className="group flex items-center justify-between gap-4 rounded-[14px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition hover:bg-white/[0.05]">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${isFeaturePost ? 'bg-violet-500/10 text-violet-400' : 'bg-white/[0.06] text-white/40'}`}>
                            {isFeaturePost ? <Rocket className="h-3.5 w-3.5" /> : <CreditCard className="h-3.5 w-3.5" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-medium text-white/75 truncate">{label}</p>
                            <p className="text-[10.5px] text-white/30 mt-0.5">
                              {tx.paidAt ? new Date(tx.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Pending'}
                              {tx.invoiceNumber && ` · ${tx.invoiceNumber}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[13px] font-bold text-white/80">{amountFormatted}</span>
                          <a
                            href={invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Download invoice"
                            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/35 transition hover:bg-white/[0.10] hover:text-white/70"
                          >
                            <Receipt className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Credits balance */}
            {credits && (
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-6">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-white/40 mb-4">Docrud Credits</h3>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-3xl font-black" style={{ backgroundImage: 'linear-gradient(90deg,#a5b4fc,#6366f1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{credits.balance.toLocaleString()}</p>
                    <p className="text-[11px] text-white/30 mt-1">{credits.totalEarned} credits earned · usable at checkout</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-[11px] text-white/25">1 credit ≈ ₹0.10</p>
                    <p className="text-[11px] text-white/25">Min. 100 credits to redeem</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        })()}

        {/* ── Settings tab ──────────────────────────────────────────── */}
        {tab === 'settings' && isOwnProfile && (() => {
          const toggle = (id: string) => setOpenSection(prev => prev === id ? '' : id);

          const enabledNotifCount = ([
            'follows','likes','comments','mentions','gig_applied','messages','billing','system'
          ] as string[]).filter(k => k in emailPrefs ? emailPrefs[k] : true).length;

          const linkedCount = (['linkedinUrl','githubUrl','twitterUrl','websiteUrl'] as string[])
            .filter(k => !!(profile as Record<string, string | undefined>)[k]).length;

          const pfStatus = profile.publicFace ? 'Verified'
            : pfApplication?.status === 'pending' ? 'Pending'
            : pfApplication?.status === 'under_review' ? 'Under Review'
            : pfApplication?.status === 'rejected' ? 'Not Approved'
            : 'Not applied';

          const Section = (props: Omit<React.ComponentProps<typeof AccordionSection>, 'open' | 'onToggle'>) =>
            <AccordionSection {...props} open={openSection === props.id} onToggle={toggle} />;

          return (
            <div className="space-y-2">

              {/* ── Account ── */}
              <Section id="account" title="Account" subtitle="Profile and login details"
                badge={user.name || '—'} badgeColor="rgba(255,255,255,0.50)"
                icon={<Settings2 className="h-3.5 w-3.5 text-white/40" />}>
                <div className="divide-y divide-white/[0.04]">
                  {[
                    { label: 'Name',         value: user.name || session?.user?.name || '—' },
                    { label: 'Email',        value: session?.user?.email || '—' },
                    { label: 'Account type', value: user.accountType === 'business' ? 'Business' : 'Individual' },
                    { label: 'Member since', value: user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
                    { label: 'Profile ID',   value: `@${userId}` },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between gap-4 px-5 py-3">
                      <span className="text-[11.5px] text-white/30 font-medium shrink-0">{label}</span>
                      <span className="text-[12px] text-white/60 font-medium text-right truncate max-w-[200px] sm:max-w-none">{value}</span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Privacy ── */}
              <Section id="privacy" title="Privacy" subtitle="Visibility and profile data"
                badge={(profile as { openToWork?: boolean }).openToWork ? 'Open to Work · Public' : 'Public'}
                icon={<Shield className="h-3.5 w-3.5 text-white/40" />}>
                <div className="divide-y divide-white/[0.04]">
                  {[
                    { label: 'Profile visibility', value: 'Public',    note: 'Visible to everyone on Docrud' },
                    { label: 'Open to work',        value: (profile as { openToWork?: boolean }).openToWork ? 'Enabled' : 'Off', note: 'Badge shown on your profile card' },
                    { label: 'Show location',       value: profile.location ? 'Visible' : 'Hidden', note: profile.location || 'No location set' },
                  ].map(({ label, value, note }) => (
                    <div key={label} className="flex items-start justify-between gap-4 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-[12px] text-white/60 font-medium">{label}</p>
                        <p className="text-[10.5px] text-white/25 mt-0.5 truncate">{note}</p>
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.40)' }}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>

              {/* ── Email Notifications ── */}
              <Section id="notifications" title="Email Notifications" subtitle="Choose which alerts to receive"
                badge={`${enabledNotifCount} / 8 on`}
                icon={<Mail className="h-3.5 w-3.5 text-white/40" />}>
                <div className="divide-y divide-white/[0.04]">
                  {emailPrefsSaving && (
                    <div className="px-5 py-2 flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400/60 animate-pulse" />
                      <span className="text-[10px] text-white/22">Saving…</span>
                    </div>
                  )}
                  {([
                    { key: 'follows',     label: 'New followers',    desc: 'When someone follows you' },
                    { key: 'likes',       label: 'Likes & reactions',desc: 'When someone likes your post' },
                    { key: 'comments',    label: 'Comments',         desc: 'When someone comments on your content' },
                    { key: 'mentions',    label: 'Mentions',         desc: "When you're tagged or mentioned" },
                    { key: 'gig_applied', label: 'Gig applications', desc: 'When someone applies to your gig' },
                    { key: 'messages',    label: 'Direct messages',  desc: 'When you receive a new message' },
                    { key: 'billing',     label: 'Billing alerts',   desc: 'Plan usage and billing updates' },
                    { key: 'system',      label: 'System updates',   desc: 'Account and platform announcements' },
                  ] as { key: string; label: string; desc: string }[]).map(({ key, label, desc }) => {
                    const enabled = key in emailPrefs ? emailPrefs[key] : true;
                    return (
                      <div key={key} className="flex items-center justify-between gap-4 px-5 py-3">
                        <div className="min-w-0">
                          <p className="text-[12px] text-white/60 font-medium">{label}</p>
                          <p className="text-[10.5px] text-white/25 mt-0.5">{desc}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleEmailPref(key, !enabled)}
                          className={`relative shrink-0 flex h-5 w-9 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none ${enabled ? 'bg-emerald-500/75' : 'bg-white/[0.08]'}`}
                          role="switch" aria-checked={enabled} aria-label={label}
                        >
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Section>

              {/* ── Linked profiles ── */}
              <Section id="linked" title="Linked Profiles" subtitle="Connected social accounts"
                badge={linkedCount > 0 ? `${linkedCount} linked` : 'None linked'}
                icon={<Link2 className="h-3.5 w-3.5 text-white/40" />}>
                <div className="px-5 py-4 flex flex-wrap gap-2">
                  {[
                    { key: 'linkedinUrl', Icon: Linkedin, label: 'LinkedIn', color: '#0a66c2' },
                    { key: 'githubUrl',   Icon: Github,   label: 'GitHub',   color: '#e6edf3' },
                    { key: 'twitterUrl',  Icon: Twitter,  label: 'Twitter',  color: '#1da1f2' },
                    { key: 'websiteUrl',  Icon: Globe,    label: 'Website',  color: '#a78bfa' },
                  ].map(({ key, Icon, label, color }) => {
                    const url = (profile as Record<string, string | undefined>)[key];
                    return (
                      <div key={key} className="flex items-center gap-2 px-3 py-2 rounded-[11px]"
                        style={{ background: url ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${url ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.05)'}` }}>
                        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: url ? color : 'rgba(255,255,255,0.18)' }} />
                        <span className="text-[11.5px] font-medium" style={{ color: url ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.20)' }}>{label}</span>
                        {url
                          ? <CheckCircle className="h-3 w-3 text-emerald-400/70" />
                          : <span className="text-[9.5px] text-white/18">Not linked</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="px-5 pb-4">
                  <button type="button" onClick={() => setEditOpen(true)}
                    className="flex items-center gap-1.5 text-[11.5px] text-indigo-400/65 hover:text-indigo-400 transition-colors">
                    <Edit2 className="h-3 w-3" />
                    Edit profile to update links
                  </button>
                </div>
              </Section>

              {/* ── Session ── */}
              <Section id="session" title="Session" subtitle="Active login management"
                badge="Signed in" badgeColor="rgba(52,211,153,0.75)"
                icon={<LogOut className="h-3.5 w-3.5 text-white/40" />}>
                <div className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[12.5px] text-white/60 font-medium">Sign out of Docrud</p>
                    <p className="text-[11px] text-white/25 mt-0.5">You&apos;ll be redirected to the login page</p>
                  </div>
                  <button
                    onClick={() => void signOut({ callbackUrl: '/onboarding' })}
                    className="shrink-0 flex items-center gap-2 h-8 px-3.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] text-white/45 text-[12px] font-medium hover:bg-white/[0.07] hover:text-white/70 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </div>
              </Section>

              {/* ── Public Face ── */}
              <Section id="publicface" title="Public Face" subtitle="Verified public figure badge & directory"
                badge={pfStatus}
                badgeColor={
                  pfStatus === 'Verified' ? 'rgba(215,175,90,0.85)'
                  : pfStatus === 'Pending' || pfStatus === 'Under Review' ? 'rgba(251,191,36,0.75)'
                  : pfStatus === 'Not Approved' ? 'rgba(248,113,113,0.75)'
                  : 'rgba(255,255,255,0.30)'
                }
                borderColor={pfStatus === 'Verified' ? 'rgba(180,140,55,0.22)' : 'rgba(255,255,255,0.07)'}
                icon={
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                    <defs><linearGradient id="pfhdr2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#C9A84C"/><stop offset="100%" stopColor="#E8CE8A"/></linearGradient></defs>
                    <circle cx="10" cy="10" r="9" fill="url(#pfhdr2)"/>
                    <path d="M10 4.5l1.4 3.1 3.4.3-2.5 2.2.8 3.3L10 11.8l-3.1 1.6.8-3.3-2.5-2.2 3.4-.3z" fill="#0e0c07" opacity="0.88"/>
                  </svg>
                }>
                <div className="px-5 py-5">
                  {pfLoading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-white/20 animate-pulse" />
                      <span className="text-[11.5px] text-white/25">Checking status…</span>
                    </div>
                  ) : profile.publicFace ? (
                    <div className="space-y-3">
                      <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
                        style={{ background: 'rgba(180,140,55,0.10)', border: '1px solid rgba(200,165,70,0.25)' }}>
                        <span className="text-[11px]">{['🎭','🎵','🏆','✨','🎬','📱','🏛️','💼','📖','🔬','📺','😄','✊','👨‍🍳','👗','📷','🎮','📰','⭐'][Object.keys({actor_actress:0,singer_musician:1,athlete_sportsperson:2,model:3,content_creator:4,influencer:5,politician:6,entrepreneur_ceo:7,author_writer:8,academic_scientist:9,tv_personality:10,comedian:11,social_activist:12,chef_culinary:13,fashion_designer:14,photographer_videographer:15,game_streamer:16,journalist:17,other:18}).indexOf(profile.publicFace.category)] || 0}</span>
                        <span className="text-[11px] font-semibold" style={{ color: 'rgba(215,175,90,0.85)' }}>{PUBLIC_FACE_CATEGORY_LABELS[profile.publicFace.category as import('@/types/document').PublicFaceCategory] || 'Public Figure'}</span>
                        <span className="text-[10px] font-semibold text-emerald-400/80 ml-0.5">✓ Verified</span>
                      </div>
                      <p className="text-[12px] text-white/35 leading-relaxed">
                        Your profile carries the verified Public Face badge and is listed in the{' '}
                        <a href="/public-faces" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition">Public Faces directory</a>.
                        Your inbox is protected — you can still initiate conversations with anyone.
                      </p>
                    </div>
                  ) : pfApplication?.status === 'pending' || pfApplication?.status === 'under_review' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-[12px] font-semibold text-amber-300/80">
                          {pfApplication.status === 'under_review' ? 'Under Review' : 'Application Pending'}
                        </span>
                      </div>
                      <p className="text-[12px] text-white/30 leading-relaxed">
                        Submitted on {pfApplication.submittedAt ? new Date(pfApplication.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}.
                        Our team reviews within 3–5 business days.
                      </p>
                    </div>
                  ) : pfApplication?.status === 'rejected' ? (
                    <div className="space-y-3">
                      <span className="text-[12px] font-semibold text-rose-400/75">Application Not Approved</span>
                      {pfApplication.adminNote && (
                        <p className="text-[11.5px] text-white/30 italic leading-relaxed">&ldquo;{pfApplication.adminNote}&rdquo;</p>
                      )}
                      <p className="text-[11.5px] text-white/28">You may strengthen your application and reapply.</p>
                      <button type="button" onClick={() => setShowPFForm(true)}
                        className="inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-[12px] font-semibold text-white/70 transition hover:bg-white/[0.07]"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                        Reapply for Public Face
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[12px] text-white/35 leading-relaxed mb-4">
                        A programme for recognised personalities. Apply to receive the verified{' '}
                        <span className="text-white/60 font-medium">Public Face</span> badge and exclusive platform privileges.
                      </p>
                      <div className="space-y-1.5 mb-4">
                        {[
                          { label: 'Verified badge on your profile',   sub: 'Instantly recognisable across all your content' },
                          { label: 'Public Faces directory listing',   sub: 'Discoverable by collaborators and followers' },
                          { label: 'Message anyone on the platform',   sub: 'Unrestricted outreach to any member' },
                          { label: 'Protected inbox',                  sub: 'Only approved senders can reach you directly' },
                        ].map(b => (
                          <div key={b.label} className="flex items-start gap-2.5 rounded-[9px] px-3 py-2.5"
                            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <span className="text-indigo-400/50 text-[7px] mt-[4px] shrink-0">◆</span>
                            <div className="min-w-0">
                              <p className="text-[11.5px] font-medium text-white/58">{b.label}</p>
                              <p className="text-[10.5px] text-white/22 mt-px">{b.sub}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowPFForm(true)}
                        className="w-full flex items-center justify-center gap-2 rounded-[10px] py-2.5 text-[12.5px] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.99]"
                        style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)', boxShadow: '0 3px 12px rgba(79,70,229,0.28)' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" fill="white" fillOpacity="0.18"/><path d="M10 4.5l1.4 3.1 3.4.3-2.5 2.2.8 3.3L10 11.8l-3.1 1.6.8-3.3-2.5-2.2 3.4-.3z" fill="white" opacity="0.95"/></svg>
                        Apply for Public Face
                      </button>
                    </div>
                  )}
                </div>
              </Section>

              {/* ── Danger Zone ── */}
              <Section id="danger" title="Danger Zone" subtitle="Irreversible account actions"
                badge="OTP required" badgeColor="rgba(248,113,113,0.65)"
                borderColor="rgba(239,68,68,0.12)"
                icon={<AlertTriangle className="h-3.5 w-3.5 text-rose-400/60" />}>
                <div className="divide-y divide-white/[0.04]">
                  <div className="flex items-start justify-between gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <PauseCircle className="h-3.5 w-3.5 text-amber-400/65 shrink-0" />
                        <p className="text-[12.5px] text-white/65 font-semibold">Deactivate account</p>
                      </div>
                      <p className="text-[11px] text-white/28 leading-relaxed">Temporarily hide your profile. All data is preserved — log in anytime to restore.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAccountModal('deactivate')}
                      className="shrink-0 flex items-center gap-1.5 h-8 px-3.5 rounded-[10px] border border-amber-500/18 bg-amber-500/[0.06] text-amber-400/80 text-[11.5px] font-semibold hover:bg-amber-500/[0.12] transition-colors"
                    >
                      Deactivate
                    </button>
                  </div>
                  <div className="flex items-start justify-between gap-4 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Trash2 className="h-3.5 w-3.5 text-rose-400/65 shrink-0" />
                        <p className="text-[12.5px] text-rose-400/80 font-semibold">Delete account permanently</p>
                      </div>
                      <p className="text-[11px] text-white/28 leading-relaxed">Permanently erase your profile, posts, gigs, and all data. This cannot be undone.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openAccountModal('delete')}
                      className="shrink-0 flex items-center gap-1.5 h-8 px-3.5 rounded-[10px] border border-rose-500/18 bg-rose-500/[0.06] text-rose-400/80 text-[11.5px] font-semibold hover:bg-rose-500/[0.14] transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </Section>

            </div>
          );
        })()}

        {/* ── Account Management Modal (rendered at root level, always accessible) ── */}
        {accountModal && isOwnProfile && (
          <div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-3 sm:p-4"
            style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(16px)' }}
            onClick={() => { if (!acctSending && acctStep !== 'done') setAccountModal(false); }}
          >
            <div
              className="relative w-full max-w-md rounded-[24px] border border-white/[0.08] bg-[#0d0e11] shadow-2xl overflow-hidden"
              style={{ maxHeight: '90dvh', overflowY: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Coloured top accent bar */}
              <div className="h-[3px]" style={{
                background: acctAction === 'delete'
                  ? 'linear-gradient(90deg,#ef4444,#dc2626,#ef4444)'
                  : 'linear-gradient(90deg,#f59e0b,#d97706,#f59e0b)',
              }} />

              <div className="p-6 sm:p-7">
                {/* Header row */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-[14px] ring-1"
                      style={{
                        background: acctAction === 'delete' ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)',
                        '--tw-ring-color': acctAction === 'delete' ? 'rgba(239,68,68,0.20)' : 'rgba(245,158,11,0.20)',
                      } as React.CSSProperties}>
                      {acctAction === 'delete'
                        ? <Trash2 className="h-5 w-5 text-rose-400" />
                        : <PauseCircle className="h-5 w-5 text-amber-400" />}
                    </div>
                    <div>
                      <h2 className="text-[15px] font-bold text-white">
                        {acctAction === 'delete' ? 'Delete Account' : 'Deactivate Account'}
                      </h2>
                      <p className="text-[11.5px] text-white/35 mt-0.5">
                        {acctStep === 'otp' ? 'Enter the OTP sent to your email'
                          : acctStep === 'done' ? 'All done — signing you out'
                          : 'Verify your identity to continue'}
                      </p>
                    </div>
                  </div>
                  {acctStep !== 'done' && (
                    <button type="button" onClick={() => setAccountModal(false)} disabled={acctSending}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Step: choose / duration */}
                {acctStep === 'choose' && (
                  <div className="space-y-4">
                    {acctAction === 'delete' ? (
                      <div className="rounded-[14px] border border-rose-500/[0.22] bg-rose-500/[0.06] p-4">
                        <p className="text-[13px] font-semibold text-rose-300 mb-1.5">⚠️ This cannot be undone</p>
                        <p className="text-[12.5px] text-white/45 leading-relaxed">
                          All your data — profile, posts, gigs, connections, documents — will be
                          <strong className="text-white/70"> permanently and irreversibly deleted</strong>.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-[14px] border border-amber-500/[0.20] bg-amber-500/[0.06] p-4">
                          <p className="text-[13px] font-semibold text-amber-300 mb-1.5">⏸ Temporary deactivation</p>
                          <p className="text-[12.5px] text-white/45 leading-relaxed">
                            Your profile will be hidden. All data stays safe.
                            <strong className="text-white/70"> Log back in anytime</strong> to instantly restore your account.
                          </p>
                        </div>
                        <div>
                          <p className="text-[12px] text-white/45 font-medium mb-2.5">How long do you want to be away?</p>
                          <div className="grid grid-cols-2 gap-2">
                            {([
                              { v: 30,   l: '30 days' },
                              { v: 60,   l: '60 days' },
                              { v: 90,   l: '3 months' },
                              { v: null, l: 'Until I return' },
                            ] as { v: number | null; l: string }[]).map(({ v, l }) => {
                              const sel = acctDuration === v && !acctCustomDays;
                              return (
                                <button key={l} type="button"
                                  onClick={() => { setAcctDuration(v); setAcctCustomDays(''); }}
                                  className="rounded-[12px] px-3 py-2.5 text-[12.5px] font-medium border transition-all active:scale-95"
                                  style={{
                                    background: sel ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.03)',
                                    border:     sel ? '1px solid rgba(245,158,11,0.40)' : '1px solid rgba(255,255,255,0.07)',
                                    color:      sel ? '#fbbf24' : 'rgba(255,255,255,0.45)',
                                  }}
                                >{l}</button>
                              );
                            })}
                          </div>
                          <input
                            type="number" min={7} max={365}
                            placeholder="Or enter custom days (7–365)"
                            value={acctCustomDays}
                            onChange={(e) => { setAcctCustomDays(e.target.value); setAcctDuration(null); }}
                            className="mt-2 w-full rounded-[12px] border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-white/20 focus:outline-none focus:border-amber-500/40 focus:bg-white/[0.07] transition"
                          />
                        </div>
                      </>
                    )}

                    {acctError && (
                      <p className="text-[12px] text-rose-400 rounded-[10px] bg-rose-500/[0.08] px-3 py-2.5 border border-rose-500/15">{acctError}</p>
                    )}

                    <div className="flex gap-2.5 pt-1">
                      <button type="button" onClick={() => setAccountModal(false)}
                        className="flex-1 h-11 rounded-[14px] border border-white/[0.08] bg-white/[0.04] text-[13px] font-medium text-white/45 hover:bg-white/[0.08] hover:text-white/75 transition">
                        Cancel
                      </button>
                      <button type="button" onClick={acctSendOtp}
                        disabled={acctSending || (acctAction === 'deactivate' && acctDuration === null && !acctCustomDays)}
                        className="flex-1 h-11 rounded-[14px] text-[13px] font-bold flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-40"
                        style={{ background: acctAction === 'delete' ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff' }}
                      >
                        {acctSending
                          ? <><span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Sending…</>
                          : 'Send OTP to my email'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step: OTP */}
                {acctStep === 'otp' && (
                  <div className="space-y-5">
                    <div className="rounded-[14px] border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
                      <p className="text-[12.5px] text-white/50 leading-relaxed">
                        A 6-digit code was sent to{' '}
                        <strong className="text-white/75">{session?.user?.email}</strong>.
                        {acctOtpExpiry && (
                          <> Expires at <strong className="text-white/65">{new Date(acctOtpExpiry).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</strong>.</>
                        )}
                      </p>
                    </div>

                    <div>
                      <label className="block text-[10.5px] font-semibold text-white/35 uppercase tracking-[0.14em] mb-2.5">One-Time Password</label>
                      <input
                        type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus
                        value={acctOtp}
                        onChange={(e) => { setAcctOtp(e.target.value.replace(/\D/g, '').slice(0, 6)); setAcctError(''); }}
                        placeholder="000000"
                        className="w-full text-center rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-4 py-4 text-white placeholder:text-white/12 focus:outline-none focus:border-indigo-500/40 focus:bg-white/[0.07] transition"
                        style={{ fontSize: 32, fontWeight: 900, letterSpacing: '0.28em', fontVariantNumeric: 'tabular-nums' }}
                      />
                    </div>

                    {acctError && (
                      <p className="text-[12px] text-rose-400 rounded-[10px] bg-rose-500/[0.08] px-3 py-2.5 border border-rose-500/15">{acctError}</p>
                    )}

                    <div className="flex gap-2.5">
                      <button type="button"
                        onClick={() => { setAcctStep('choose'); setAcctOtp(''); setAcctError(''); }}
                        className="h-11 px-4 rounded-[14px] border border-white/[0.08] bg-white/[0.04] text-[13px] text-white/45 hover:bg-white/[0.08] hover:text-white/75 transition">
                        ← Back
                      </button>
                      <button type="button"
                        onClick={acctConfirm}
                        disabled={acctSending || acctOtp.length !== 6}
                        className="flex-1 h-11 rounded-[14px] text-[13px] font-bold flex items-center justify-center gap-2 transition active:scale-[0.98] disabled:opacity-40"
                        style={{ background: acctAction === 'delete' ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff' }}
                      >
                        {acctSending
                          ? <><span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />{acctAction === 'delete' ? 'Deleting…' : 'Deactivating…'}</>
                          : acctAction === 'delete' ? '🗑 Permanently Delete' : '⏸ Deactivate Account'}
                      </button>
                    </div>

                    <p className="text-center">
                      <button type="button" disabled={acctResendCooldown > 0 || acctSending} onClick={acctSendOtp}
                        className="text-[12px] text-white/28 hover:text-white/55 disabled:opacity-35 transition">
                        {acctResendCooldown > 0 ? `Resend in ${acctResendCooldown}s` : 'Didn\'t receive it? Resend OTP'}
                      </button>
                    </p>
                  </div>
                )}

                {/* Step: done */}
                {acctStep === 'done' && (
                  <div className="text-center py-6 space-y-5">
                    <div className="relative inline-flex">
                      <div className="h-16 w-16 rounded-full flex items-center justify-center"
                        style={{ background: acctAction === 'delete' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)' }}>
                        {acctAction === 'delete'
                          ? <Trash2 className="h-7 w-7 text-rose-400" />
                          : <CheckCircle className="h-7 w-7 text-amber-400" />}
                      </div>
                      <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px]">✓</span>
                    </div>
                    <div>
                      <p className="text-[15px] font-bold text-white">
                        {acctAction === 'delete' ? 'Account Deleted' : 'Account Deactivated'}
                      </p>
                      <p className="text-[12.5px] text-white/38 mt-2 leading-relaxed max-w-[280px] mx-auto">
                        {acctAction === 'delete'
                          ? 'All your data has been permanently erased. Redirecting you now…'
                          : 'Your account is hidden. Log back in anytime to reactivate. Redirecting…'}
                      </p>
                    </div>
                    <div className="h-1 w-full max-w-[160px] mx-auto rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full animate-[progress_2.5s_linear_forwards]"
                        style={{ background: acctAction === 'delete' ? '#ef4444' : '#f59e0b', width: '100%' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Connections tab */}
        {tab === 'connections' && (() => {
          const sessionId = (session?.user as { id?: string } | undefined)?.id;

          function ConnectionRow({ u, listType }: { u: ConnectionCard; listType: 'followers' | 'following' }) {
            const isMe = sessionId === u.id;
            const following = connectionsFollowingIds.has(u.id);
            return (
              <div className="flex items-center gap-3 py-3 border-b border-white/[0.04] last:border-0">
                <Link href={`/u/${u.id}`} className="flex-1 min-w-0 flex items-center gap-3">
                  <div className="h-9 w-9 shrink-0 rounded-full ring-1 ring-white/[0.10] overflow-hidden bg-white/[0.06] flex items-center justify-center">
                    {u.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatarUrl} alt={u.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[13px] font-bold text-white/60 select-none">
                        {(u.name || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-white/85 truncate">{u.name}</p>
                    {u.headline && <p className="text-[11px] text-white/35 truncate mt-0.5">{u.headline}</p>}
                    {u.location && <p className="text-[10px] text-white/25 truncate">{u.location}</p>}
                  </div>
                </Link>
                {!isMe && session && (
                  <button
                    type="button"
                    onClick={() => handleConnectionFollow(u.id)}
                    className={`shrink-0 h-7 px-3 rounded-[9px] text-[11px] font-semibold transition-all border ${
                      following
                        ? 'bg-white/[0.06] border-white/[0.10] text-white/50 hover:bg-rose-500/[0.10] hover:border-rose-500/20 hover:text-rose-400'
                        : 'bg-white/[0.08] border-white/[0.12] text-white/70 hover:bg-white/[0.14] hover:text-white'
                    }`}
                  >
                    {following ? 'Unfollow' : 'Follow'}
                  </button>
                )}
              </div>
            );
          }

          if (connectionsLoading) {
            return (
              <div className="py-16 flex flex-col items-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
                <p className="text-[12px] text-white/25">Loading connections…</p>
              </div>
            );
          }

          if (!connectionsData) {
            return (
              <div className="py-16 text-center">
                <UserPlus className="h-8 w-8 text-white/15 mx-auto mb-3" />
                <p className="text-[13px] text-white/30">No connections loaded</p>
                <button
                  type="button"
                  onClick={loadConnections}
                  className="mt-4 h-8 px-4 rounded-[10px] border border-white/[0.10] bg-white/[0.04] text-[12px] text-white/50 hover:text-white transition"
                >
                  Load connections
                </button>
              </div>
            );
          }

          const { followers, following } = connectionsData;

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Followers */}
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-4">
                  Followers · {followers.length}
                </h3>
                {followers.length === 0 ? (
                  <div className="py-8 text-center">
                    <UserPlus className="h-6 w-6 text-white/10 mx-auto mb-2" />
                    <p className="text-[12px] text-white/25">No followers yet</p>
                  </div>
                ) : (
                  <div className="divide-y-0">
                    {followers.map((u) => <ConnectionRow key={u.id} u={u} listType="followers" />)}
                  </div>
                )}
              </div>

              {/* Following */}
              <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-white/30 mb-4">
                  Following · {following.length}
                </h3>
                {following.length === 0 ? (
                  <div className="py-8 text-center">
                    <UserPlus className="h-6 w-6 text-white/10 mx-auto mb-2" />
                    <p className="text-[12px] text-white/25">Not following anyone yet</p>
                  </div>
                ) : (
                  <div className="divide-y-0">
                    {following.map((u) => <ConnectionRow key={u.id} u={u} listType="following" />)}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      </div>

      {/* ── Catalogue Page Editor ── */}
      {showCatalogueEditor && isOwnProfile && (() => {
        const grad = `linear-gradient(135deg,${catalogueDraft.accentColor ?? '#6366f1'},${catalogueDraft.accentColorSecondary ?? '#8b5cf6'})`;
        const inp = 'w-full rounded-[10px] border border-white/[0.09] bg-white/[0.05] px-3 py-2 text-[12.5px] text-white placeholder-white/20 outline-none focus:border-violet-500/40 focus:bg-violet-500/[0.03] transition-all';
        async function saveCatalogueSettings() {
          setCatalogueSaving(true);
          try {
            const res = await fetch('/api/services/catalogue', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(catalogueDraft) });
            if (res.ok) { setCatalogueSettings(catalogueDraft); setPreviewKey(k => k + 1); }
          } catch {}
          finally { setCatalogueSaving(false); }
        }
        return (
          <div className="fixed inset-0 z-[80] flex flex-col bg-[#0a0a0b]">
            {/* Top bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.07] bg-[#111113] shrink-0">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-violet-400" />
                <span className="font-bold text-white text-[14px]">Edit Catalogue Page</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {/* Device toggle */}
                <div className="flex rounded-[9px] border border-white/[0.09] bg-white/[0.04] overflow-hidden">
                  <button type="button" onClick={() => setPreviewDevice('desktop')} title="Desktop preview"
                    className={`flex items-center justify-center px-2.5 py-1.5 transition-all ${previewDevice === 'desktop' ? 'bg-white/[0.12] text-white' : 'text-white/35 hover:text-white/60'}`}>
                    <Laptop className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setPreviewDevice('mobile')} title="Mobile preview"
                    className={`flex items-center justify-center px-2.5 py-1.5 transition-all ${previewDevice === 'mobile' ? 'bg-white/[0.12] text-white' : 'text-white/35 hover:text-white/60'}`}>
                    <Smartphone className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button type="button" onClick={() => setPreviewKey(k => k + 1)}
                  className="flex items-center gap-1 rounded-[9px] border border-white/[0.09] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-white/40 hover:text-white/70 transition">
                  <RefreshCw className="h-3 w-3" /> Refresh preview
                </button>
                <button type="button" onClick={() => setCatalogueDraft(catalogueSettings)}
                  className="rounded-[9px] border border-white/[0.09] bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-semibold text-white/45 hover:text-white/80 transition">
                  Reset
                </button>
                <button type="button" onClick={saveCatalogueSettings} disabled={catalogueSaving}
                  className="flex items-center gap-1.5 rounded-[9px] px-4 py-1.5 text-[12px] font-bold text-white transition active:scale-[0.98] disabled:opacity-60"
                  style={{ background: grad }}>
                  <Save className="h-3.5 w-3.5" /> {catalogueSaving ? 'Saving…' : 'Save & Apply'}
                </button>
                <button type="button" onClick={() => setShowCatalogueEditor(false)}
                  className="h-8 w-8 rounded-full bg-white/[0.07] flex items-center justify-center hover:bg-white/[0.12] transition ml-1">
                  <X className="h-4 w-4 text-white/60" />
                </button>
              </div>
            </div>

            {/* Body: settings + preview */}
            <div className="flex flex-1 overflow-hidden">

              {/* ── Left: Settings Panel ── */}
              <div className="w-72 shrink-0 border-r border-white/[0.07] bg-[#111113] overflow-y-auto [scrollbar-width:none] flex flex-col">
                <div className="px-4 py-4 space-y-6 flex-1">

                  {/* Banner & Avatar */}
                  <div>
                    <p className="text-[9.5px] font-bold text-white/30 uppercase tracking-widest mb-3">Catalogue Banner & Avatar</p>
                    <p className="text-[10px] text-white/20 mb-3 leading-relaxed">These only apply to your catalogue page — your main profile is not affected.</p>
                    <div className="space-y-3">
                      {/* Banner preview + URL */}
                      <div>
                        <label className="block text-[10.5px] text-white/40 mb-1.5">Banner image URL</label>
                        <div className="mb-2 h-20 w-full rounded-[10px] overflow-hidden border border-white/[0.09] bg-white/[0.03] flex items-center justify-center relative">
                          {catalogueDraft.catalogueBannerUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={catalogueDraft.catalogueBannerUrl} alt="Banner preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <span className="text-[10px] text-white/20">No custom banner — uses profile banner</span>
                          )}
                          {catalogueDraft.catalogueBannerUrl && (
                            <button type="button" onClick={() => setCatalogueDraft(d => ({ ...d, catalogueBannerUrl: undefined }))}
                              className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-black/70 flex items-center justify-center hover:bg-red-500/80 transition">
                              <X className="h-2.5 w-2.5 text-white" />
                            </button>
                          )}
                        </div>
                        <input value={catalogueDraft.catalogueBannerUrl ?? ''} onChange={e => setCatalogueDraft(d => ({ ...d, catalogueBannerUrl: e.target.value || undefined }))}
                          placeholder="https://... (paste image URL)" className={inp} />
                      </div>
                      {/* Avatar preview + URL */}
                      <div>
                        <label className="block text-[10.5px] text-white/40 mb-1.5">Avatar / Profile photo URL</label>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="h-14 w-14 rounded-[14px] overflow-hidden border border-white/[0.09] bg-white/[0.05] flex items-center justify-center shrink-0">
                            {catalogueDraft.catalogueAvatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={catalogueDraft.catalogueAvatarUrl} alt="Avatar preview" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <span className="text-[9px] text-white/20 text-center px-1">Profile photo</span>
                            )}
                          </div>
                          <p className="text-[10px] text-white/25 leading-relaxed">Uses your profile photo by default. Set a different one for the catalogue.</p>
                        </div>
                        <div className="flex gap-2">
                          <input value={catalogueDraft.catalogueAvatarUrl ?? ''} onChange={e => setCatalogueDraft(d => ({ ...d, catalogueAvatarUrl: e.target.value || undefined }))}
                            placeholder="https://... (paste image URL)" className={`${inp} flex-1`} />
                          {catalogueDraft.catalogueAvatarUrl && (
                            <button type="button" onClick={() => setCatalogueDraft(d => ({ ...d, catalogueAvatarUrl: undefined }))}
                              className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-2.5 text-red-400 hover:bg-red-500/20 transition text-[11px]">
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Page Identity */}
                  <div>
                    <p className="text-[9.5px] font-bold text-white/30 uppercase tracking-widest mb-3">Page Identity</p>
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[10.5px] text-white/40 mb-1">Page headline</label>
                        <input value={catalogueDraft.headline ?? ''} onChange={e => setCatalogueDraft(d => ({ ...d, headline: e.target.value || undefined }))}
                          placeholder={data?.user.name ? `${data.user.name}'s Services` : 'My Services'} className={inp} />
                      </div>
                      <div>
                        <label className="block text-[10.5px] text-white/40 mb-1">Subheadline / tagline</label>
                        <input value={catalogueDraft.subheadline ?? ''} onChange={e => setCatalogueDraft(d => ({ ...d, subheadline: e.target.value || undefined }))}
                          placeholder={data?.profile.headline ?? 'What you do'} className={inp} />
                      </div>
                      <div>
                        <label className="block text-[10.5px] text-white/40 mb-1">Book button text</label>
                        <input value={catalogueDraft.ctaText ?? ''} onChange={e => setCatalogueDraft(d => ({ ...d, ctaText: e.target.value || undefined }))}
                          placeholder="Book" className={inp} />
                        {/* Live button preview */}
                        <div className="mt-2 h-7 rounded-[8px] flex items-center justify-center text-[11px] font-bold text-white" style={{ background: grad }}>
                          {catalogueDraft.ctaText || 'Book'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Accent Color */}
                  <div>
                    <p className="text-[9.5px] font-bold text-white/30 uppercase tracking-widest mb-3">Accent Color</p>
                    <div className="grid grid-cols-4 gap-1.5 mb-3">
                      {ACCENT_PRESETS_LOCAL.map(p => (
                        <button key={p.label} type="button" onClick={() => setCatalogueDraft(d => ({ ...d, accentColor: p.a, accentColorSecondary: p.b }))}
                          className={`h-8 rounded-[9px] relative transition-all ${catalogueDraft.accentColor === p.a ? 'ring-2 ring-white/70 ring-offset-1 ring-offset-[#111113] scale-105' : 'hover:scale-105'}`}
                          style={{ background: `linear-gradient(135deg,${p.a},${p.b})` }} title={p.label}>
                          {catalogueDraft.accentColor === p.a && <Check className="h-3 w-3 text-white absolute inset-0 m-auto drop-shadow" />}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-white/30 mb-1">Primary</label>
                        <input type="color" value={catalogueDraft.accentColor ?? '#6366f1'} onChange={e => setCatalogueDraft(d => ({ ...d, accentColor: e.target.value }))}
                          className="w-full h-8 rounded-[8px] border border-white/[0.09] bg-white/[0.04] px-1 cursor-pointer" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-white/30 mb-1">Secondary</label>
                        <input type="color" value={catalogueDraft.accentColorSecondary ?? '#8b5cf6'} onChange={e => setCatalogueDraft(d => ({ ...d, accentColorSecondary: e.target.value }))}
                          className="w-full h-8 rounded-[8px] border border-white/[0.09] bg-white/[0.04] px-1 cursor-pointer" />
                      </div>
                    </div>
                    {/* Gradient bar preview */}
                    <div className="mt-2.5 h-6 rounded-[8px]" style={{ background: grad }} />
                  </div>

                  {/* Layout */}
                  <div>
                    <p className="text-[9.5px] font-bold text-white/30 uppercase tracking-widest mb-3">Layout</p>
                    <div>
                      <label className="block text-[10.5px] text-white/40 mb-2">Grid columns</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([2, 3, 4] as const).map(n => (
                          <button key={n} type="button" onClick={() => setCatalogueDraft(d => ({ ...d, gridColumns: n }))}
                            className={`py-2 rounded-[9px] border text-[12px] font-semibold transition-all ${(catalogueDraft.gridColumns ?? 3) === n ? 'border-violet-500/50 bg-violet-500/15 text-violet-300' : 'border-white/[0.09] bg-white/[0.04] text-white/40 hover:text-white/70'}`}>
                            {n} cols
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Sections visibility */}
                  <div>
                    <p className="text-[9.5px] font-bold text-white/30 uppercase tracking-widest mb-3">Sections</p>
                    <div className="space-y-3">
                      {[
                        { key: 'showStats' as const, label: 'Stats bar', desc: 'Reviews, bookings, avg price' },
                        { key: 'showBio' as const, label: 'About section', desc: 'Bio and skills' },
                        { key: 'showWhyBook' as const, label: 'Why book strip', desc: 'Fast response, pricing' },
                      ].map(({ key, label, desc }) => {
                        const on = catalogueDraft[key] !== false;
                        return (
                          <div key={key} className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[12px] font-medium text-white/65 truncate">{label}</p>
                              <p className="text-[10px] text-white/25">{desc}</p>
                            </div>
                            <button type="button" onClick={() => setCatalogueDraft(d => ({ ...d, [key]: !on }))}
                              className={`relative h-5 w-9 rounded-full shrink-0 transition-colors ${on ? 'bg-violet-500/70' : 'bg-white/[0.10]'}`}>
                              <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Settings panel footer note */}
                <div className="px-4 py-3 border-t border-white/[0.06] shrink-0">
                  <p className="text-[10px] text-white/20 text-center">Click <span className="text-white/40 font-semibold">Save & Apply</span> to publish your changes</p>
                </div>
              </div>

              {/* ── Right: Live Preview iframe ── */}
              <div className="flex-1 flex flex-col bg-[#0a0a0b] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-white/[0.05] shrink-0">
                  <div className="flex-1 flex items-center gap-2 rounded-[8px] border border-white/[0.07] bg-white/[0.03] px-3 py-1.5">
                    <span className="text-[10px] text-white/25">Preview:</span>
                    <span className="text-[11px] text-white/45 font-mono truncate">/services/{userId}</span>
                  </div>
                  <span className="text-[10px] text-white/20 shrink-0">{previewDevice === 'mobile' ? '390px' : '100%'}</span>
                </div>
                <div className="flex-1 overflow-hidden flex items-start justify-center p-4">
                  <div className={`h-full bg-white rounded-[12px] overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.7)] transition-all duration-300 ${previewDevice === 'mobile' ? 'w-[390px]' : 'w-full'}`}
                    style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    <iframe
                      key={previewKey}
                      ref={iframeRef}
                      src={`/services/${userId}`}
                      className="w-full h-full border-0"
                      title="Catalogue preview"
                    />
                  </div>
                </div>
                {/* Preview note */}
                <div className="px-4 py-2 border-t border-white/[0.05] shrink-0">
                  <p className="text-[10px] text-white/20 text-center">Preview shows the saved version — hit <span className="text-white/35 font-semibold">Save & Apply</span> then <span className="text-white/35 font-semibold">Refresh preview</span> to see changes</p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit modal */}
      {editOpen && isOwnProfile && (
        <EditProfileModal
          profile={profile}
          userName={user.name}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setData((prev) => prev ? { ...prev, profile: updated } : prev);
          }}
        />
      )}

      {/* Feature post panel */}
      {featurePanelPost && (
        <FeaturePostPanel
          postId={featurePanelPost.id}
          postTitle={featurePanelPost.title}
          onClose={() => setFeaturePanelPost(null)}
          onSuccess={() => {
            setFeaturePanelPost(null);
            // Refresh posts list
            fetch('/api/public/published').then(r => r.ok ? r.json() : null).then((d: { items?: Array<{ id: string; shareId: string; title?: string; fileName?: string; likesCount?: number; commentsCount?: number; viewCount?: number; featured?: boolean; featuredUntil?: string; featuredPlan?: string; createdAt?: string; uploadedByUserId?: string }> } | null) => {
              if (d?.items && userId) {
                setPublishedPosts(
                  d.items
                    .filter((item) => item.uploadedByUserId === userId)
                    .map((item) => ({
                      id: item.id,
                      shareId: item.shareId,
                      title: item.title,
                      fileName: item.fileName ?? '',
                      likesCount: item.likesCount ?? 0,
                      commentsCount: item.commentsCount ?? 0,
                      viewCount: item.viewCount ?? 0,
                      featured: item.featured ?? false,
                      featuredUntil: item.featuredUntil,
                      featuredPlan: item.featuredPlan,
                      createdAt: item.createdAt ?? '',
                    })),
                );
              }
            }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}
