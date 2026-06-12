'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import GlobalSearchBar, { type GlobalSearchBarHandle, type LocalSearchResult } from '@/components/GlobalSearchBar';
import { useSession } from 'next-auth/react';

/* ── Ddrive premium "D" icon ──────────────────────────────────────── */
function DdriveIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Ddrive">
      <defs>
        <linearGradient id="nav-ddrive-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="22" height="22" rx="6" ry="6" fill="url(#nav-ddrive-g)" opacity="0.18" />
      <rect x="1" y="1" width="22" height="22" rx="6" ry="6" fill="none" stroke="url(#nav-ddrive-g)" strokeWidth="1.4" />
      <text x="12" y="17" textAnchor="middle" dominantBaseline="auto"
        fontFamily="system-ui,-apple-system,sans-serif" fontSize="14" fontWeight="800" letterSpacing="-0.5"
        fill="url(#nav-ddrive-g)">D</text>
    </svg>
  );
}

/* ── Greeting helpers ──────────────────────────────────────────────── */
function getGreetingData(d: Date) {
  const h = d.getHours();
  if (h >= 5 && h < 12)  return { text: 'Good Morning',   emoji: '🌅', phase: 'morning'   };
  if (h >= 12 && h < 17) return { text: 'Good Afternoon', emoji: '☀️', phase: 'afternoon' };
  if (h >= 17 && h < 21) return { text: 'Good Evening',   emoji: '🌆', phase: 'evening'   };
  return                         { text: 'Good Night',     emoji: '🌙', phase: 'night'     };
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    .toUpperCase().replace(/\s/g, ' '); // narrow non-breaking space
}
function fmtDate(d: Date) {
  const day  = d.toLocaleDateString('en-IN', { weekday: 'short' });
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${day}, ${date}`;
}
import {
  Bell,
  BriefcaseBusiness,
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  Eye,
  FileSignature,
  FileText,
  FolderLock,
  Globe,
  Heart,
  Home,
  LayoutGrid,
  Layers,
  Mail,
  Menu,
  MessageCircle,
  MessageSquare,
  Newspaper,
  PenLine,
  Plus,
  Search,
  Share2,
  Sheet,
  Sparkles,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

interface WorkspaceNotification {
  id: string;
  type?: string;
  title: string;
  body: string;
  href?: string;
  ctaLabel?: string;
  tone?: 'default' | 'amber' | 'sky' | 'emerald' | 'rose';
  read: boolean;
  createdAt: string;
  actorName?: string;
  actorAvatar?: string;
  actorId?: string;
}

const TONE_RING: Record<NonNullable<WorkspaceNotification['tone']>, string> = {
  default: 'ring-white/20',
  amber:   'ring-amber-400/30',
  sky:     'ring-sky-400/30',
  emerald: 'ring-emerald-400/30',
  rose:    'ring-rose-400/30',
};

const ICON_BG: Record<NonNullable<WorkspaceNotification['tone']>, string> = {
  default: 'bg-white/[0.07]',
  amber:   'bg-amber-500/[0.12]',
  sky:     'bg-sky-500/[0.12]',
  emerald: 'bg-emerald-500/[0.12]',
  rose:    'bg-rose-500/[0.12]',
};

const ICON_COLOR: Record<NonNullable<WorkspaceNotification['tone']>, string> = {
  default: 'text-white/40',
  amber:   'text-amber-400',
  sky:     'text-sky-400',
  emerald: 'text-emerald-400',
  rose:    'text-rose-400',
};

function typeIcon(type?: string) {
  switch (type) {
    case 'follow':           return UserPlus;
    case 'profile_view':     return Eye;
    case 'like':             return Heart;
    case 'comment':          return MessageCircle;
    case 'mention':          return MessageCircle;
    case 'gig_applied':      return BriefcaseBusiness;
    case 'document_viewed':  return FileText;
    case 'mail':             return Mail;
    case 'billing':          return CreditCard;
    default:                 return Bell;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const SOCIAL_TYPES = new Set(['follow', 'profile_view', 'like', 'comment', 'mention', 'gig_applied', 'document_viewed']);

interface HomepageNavProps {
  softwareName: string;
  accentLabel?: string;
  onPublishClick?: () => void;
  onScratchpadClick?: () => void;
  onDocSheetClick?: () => void;
  onESignClick?: () => void;
  onFileDriveClick?: () => void;
  onMobileMenuClick?: () => void;
  onAllToolsClick?: () => void;
  guestMode?: boolean;
}

/* ── Tools panel data ─────────────────────────────────────────── */
const TOOLS_ITEMS = [
  { id: 'docword',   label: 'DocWord',        desc: 'AI document editor',     Icon: FileText,      color: '#818cf8', bg: 'rgba(129,140,248,0.13)', bd: 'rgba(129,140,248,0.22)' },
  { id: 'docsheets', label: 'DocSheets',      desc: 'Smart spreadsheets',     Icon: Sheet,         color: '#34d399', bg: 'rgba(52,211,153,0.11)',  bd: 'rgba(52,211,153,0.20)'  },
  { id: 'esign',     label: 'E-Sign',         desc: 'Digital signatures',     Icon: FileSignature, color: '#a78bfa', bg: 'rgba(167,139,250,0.13)', bd: 'rgba(167,139,250,0.22)' },
  { id: 'scratchpad',label: 'Scratchpad',     desc: 'Canvas & quick notes',   Icon: PenLine,       color: '#fb923c', bg: 'rgba(251,146,60,0.11)',  bd: 'rgba(251,146,60,0.20)'  },
  { id: 'directory', label: 'File Directory', desc: 'Browse your workspace',  Icon: Layers,        color: '#fbbf24', bg: 'rgba(251,191,36,0.11)',  bd: 'rgba(251,191,36,0.20)'  },
] as const;

export default function HomepageNav({
  softwareName,
  accentLabel,
  onPublishClick,
  onScratchpadClick,
  onDocSheetClick,
  onESignClick,
  onFileDriveClick,
  onMobileMenuClick,
  onAllToolsClick,
  guestMode,
}: HomepageNavProps) {
  const { data: session, status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const pathname = usePathname();

  const [isMounted, setIsMounted] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const notifRef = useRef<HTMLDivElement>(null);
  const [badge, setBadge] = useState<{ docrudGo: boolean; avatarUrl: string | null } | null>(null);
  const [msgUnread, setMsgUnread] = useState(0);
  const [toolsOpen, setToolsOpen] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);

  const searchBarRef = useRef<GlobalSearchBarHandle>(null);

  // Mobile dock (in PublicHomepage) opens the search overlay by dispatching
  // this window event — handled here because the search bar ref lives in this
  // component.
  useEffect(() => {
    const handler = () => searchBarRef.current?.openMobile();
    window.addEventListener('homepage:open-search', handler);
    return () => window.removeEventListener('homepage:open-search', handler);
  }, []);

  // ⌘K / Ctrl+K shortcut to open search
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchBarRef.current?.open();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const getLocalResults = useCallback((q: string): LocalSearchResult[] => {
    const query = q.toLowerCase().trim();
    const nav: Array<{ id: string; title: string; subtitle: string; href: string; Icon: React.ComponentType<{ className?: string }> }> = [
      { id: 'gigs',      title: 'Browse Gigs',         subtitle: 'Find live opportunities',         href: '/gigs',      Icon: Briefcase    },
      { id: 'people',    title: 'Explore Professionals', subtitle: 'Discover talent & public faces', href: '/people',    Icon: Users        },
      { id: 'feed',      title: 'Latest Feed',           subtitle: 'Articles, designs & insights',  href: '/published', Icon: Globe        },
      { id: 'esign',     title: 'E-Sign Studio',         subtitle: 'Digital signatures & contracts',href: '/#esign',    Icon: FileSignature },
      { id: 'workspace', title: 'My Workspace',          subtitle: 'Documents, templates & files',  href: '/workspace', Icon: FileText     },
      { id: 'profile',   title: 'My Profile',            subtitle: 'View & edit your public profile',href: '/profile',  Icon: User         },
      { id: 'messages',  title: 'Messages',              subtitle: 'Chat with professionals',        href: '/messages',  Icon: MessageSquare},
      { id: 'docword',   title: 'DocWord',               subtitle: 'AI document editor',             href: '/workspace', Icon: Sparkles     },
    ];
    return nav
      .filter(({ title, subtitle }) =>
        title.toLowerCase().includes(query) || subtitle.toLowerCase().includes(query)
      )
      .slice(0, 4)
      .map(({ id, title, subtitle, href, Icon }) => ({
        id,
        kind: 'tab' as const,
        title,
        subtitle,
        Icon,
        onSelect: () => { window.location.href = href; },
      }));
  }, []);

  /* ── Live clock ── */
  const [now, setNow] = useState<Date | null>(null); // null until mounted (avoids SSR mismatch)
  const [greetPhase, setGreetPhase] = useState('');  // tracks greeting phase to animate transitions
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNow(d);
      const phase = getGreetingData(d).phase;
      setGreetPhase((prev) => {
        // when phase changes, trigger CSS re-key via state update
        return prev !== phase ? phase : prev;
      });
    };
    tick(); // immediate first tick
    const id = setInterval(tick, 30_000); // refresh every 30 s — cheap
    return () => clearInterval(id);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = await res.json() as { notifications?: WorkspaceNotification[] };
      if (Array.isArray(data.notifications)) setNotifications(data.notifications);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || guestMode) return;
    const id = setTimeout(() => {
      fetch('/api/me/badge')
        .then((r) => r.ok ? r.json() : null)
        .then((d: { docrudGo?: boolean; avatarUrl?: string | null } | null) => {
          if (d) setBadge({ docrudGo: d.docrudGo ?? false, avatarUrl: d.avatarUrl ?? null });
        })
        .catch(() => {});
    }, 800);
    return () => clearTimeout(id);
  }, [isAuthenticated, guestMode]);

  const fetchMsgUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/unread');
      if (!res.ok) return;
      const d = await res.json() as { unread: number };
      setMsgUnread(d.unread ?? 0);
    } catch { /* silent */ }
  }, []);

  // SSE connection for real-time notifications + 60s fallback poll
  useEffect(() => {
    if (!isAuthenticated || guestMode) return;

    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource('/api/notifications/stream');

      es.onmessage = (e) => {
        if (e.data === 'ping') {
          fetchNotifications();
          return;
        }
        try {
          const data = JSON.parse(e.data) as { notifications?: WorkspaceNotification[] };
          if (Array.isArray(data.notifications)) setNotifications(data.notifications);
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        // Reconnect after 5s
        reconnectTimer = setTimeout(connect, 5_000);
      };
    }

    // Delay initial fetches by 1.5s so they don't compete with page paint
    const initTimer = setTimeout(() => {
      connect();
      fetchNotifications();
      fetchMsgUnread();
    }, 1500);

    // Fallback poll every 60s — SSE covers real-time, this is a safety net
    const pollId = setInterval(fetchNotifications, 60_000);
    const msgId = setInterval(fetchMsgUnread, 30_000);

    function onVisible() {
      if (document.visibilityState === 'visible') {
        fetchNotifications();
        fetchMsgUnread();
      }
    }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(initTimer);
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearInterval(pollId);
      clearInterval(msgId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated, guestMode, fetchNotifications, fetchMsgUnread]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function markAllRead() {
    try {
      const res = await fetch('/api/notifications', { method: 'PATCH' });
      if (res.ok) {
        const data = await res.json() as { notifications?: WorkspaceNotification[] };
        if (Array.isArray(data.notifications)) setNotifications(data.notifications);
        else setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }
    } catch { /* silent */ }
  }

  async function markOneRead(id: string) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch { /* silent */ }
  }

  function handleToolClick(id: string) {
    setToolsOpen(false);
    setTimeout(() => {
      if (id === 'docsheets')  { onDocSheetClick?.();   return; }
      if (id === 'esign')      { onESignClick?.();       return; }
      if (id === 'scratchpad') { onScratchpadClick?.();  return; }
      if (id === 'directory')  { onFileDriveClick?.();   return; }
      if (id === 'docword')    { window.location.href = '/docword';    return; }
      if (id === 'sharing')    { window.location.href = '/workspace';  return; }
    }, 80);
  }

  return (
    <header className="shrink-0 h-14 flex items-center justify-between px-4 sm:px-6 lg:px-10 xl:px-12 z-30 relative" style={{
      background: 'rgba(6,6,10,0.52)',
      backdropFilter: 'blur(56px) saturate(200%) brightness(0.90)',
      WebkitBackdropFilter: 'blur(56px) saturate(200%) brightness(0.90)',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 0 rgba(255,255,255,0.03), 0 8px 32px rgba(0,0,0,0.28)',
    }}>


      {/* ── LEFT group: menu + logo ── */}
      <div className="flex items-center gap-2 min-w-0">
        {onMobileMenuClick && (
          <button
            type="button"
            onClick={onMobileMenuClick}
            className="lg:hidden flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-white/50 transition hover:bg-white/[0.09] hover:text-white active:scale-95"
          >
            <Menu className="h-[15px] w-[15px]" />
          </button>
        )}
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          {/* Logo icon with animated golden ring */}
          <div className="relative shrink-0" style={{ width: 28, height: 28 }}>
            {/* Spinning golden sweep ring */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: -1.5,
                borderRadius: 11,
                background: 'conic-gradient(from 0deg, transparent 0%, transparent 62%, rgba(170,128,40,0.55) 74%, rgba(232,204,122,1.0) 83%, rgba(232,204,122,0.95) 88%, rgba(170,128,40,0.50) 96%, transparent 100%)',
                animation: 'goldenRingSpin 3.2s linear infinite',
                pointerEvents: 'none',
                zIndex: 0,
                willChange: 'transform',
              }}
            />
            {/* Icon image */}
            <Image
              src="/docrud-icon.png"
              alt="Docrud"
              width={28}
              height={28}
              priority
              style={{ borderRadius: 9, display: 'block', position: 'relative', zIndex: 1, objectFit: 'cover' }}
            />
          </div>
          <span className="hidden sm:block text-[13.5px] font-bold text-white/90 tracking-[-0.01em]">{softwareName}</span>
        </Link>
      </div>

      {/* ── CENTER: live search bar (md+) — hidden below md, handled by the pill ── */}
      <GlobalSearchBar
        ref={searchBarRef}
        getLocalResults={getLocalResults}
        className="mx-3"
      />

      {/* Mobile search pill — visible below md only, matches GlobalSearchBar's md:flex breakpoint */}
      <button
        type="button"
        onClick={() => searchBarRef.current?.openMobile()}
        className="md:hidden flex flex-1 items-center gap-2 mx-2 h-[36px] min-w-0 rounded-[12px] px-3"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <Search className="h-[13px] w-[13px] shrink-0 text-white/40" />
        <span className="text-[13px] font-medium text-white/32 truncate flex-1 text-left">Search people, gigs & docs…</span>
      </button>

      {/* ── RIGHT group: nav links + bell + avatar ── */}
      <div className="flex items-center gap-1.5 shrink-0">

        {/* Desktop-only nav links — Publish/Gigs/People moved to the bottom dock */}
        <Link href="/published" className={`hidden sm:flex h-8 items-center gap-1.5 rounded-[10px] border px-3 text-[12px] font-medium transition active:scale-95 ${
          pathname?.startsWith('/published')
            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
            : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.09] hover:text-white/75'
        }`}>
          <Globe className="h-3 w-3" />Feed
        </Link>

        {/* ── Businesses button ── */}
        <Link
          href="/businesses"
          className={`hidden sm:flex h-8 items-center gap-1.5 rounded-[10px] border px-3 text-[12px] font-semibold transition active:scale-95 ${
            pathname?.startsWith('/businesses')
              ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
              : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.09] hover:text-white/75'
          }`}
        >
          <Building2 className="h-3 w-3" />
          Businesses
        </Link>

        {/* ── File Drive button ── */}
        <button
          type="button"
          onClick={() => onFileDriveClick?.()}
          className="hidden sm:flex h-8 items-center gap-1.5 rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] font-medium text-white/50 transition hover:bg-white/[0.09] hover:text-white/75 active:scale-95"
        >
          <DdriveIcon size={13} />
          <span className="font-semibold">Ddrive</span>
        </button>

        {/* ── Tools dropdown trigger (desktop only — mobile has it in the bottom dock as "Features") ── */}
        <button
          type="button"
          onClick={() => setToolsOpen(o => !o)}
          className={`hidden sm:flex h-8 items-center gap-1.5 rounded-[10px] border px-2.5 sm:px-3 text-[12px] font-medium transition active:scale-95 ${
            toolsOpen
              ? 'border-violet-500/[0.32] bg-violet-500/[0.12] text-violet-300'
              : 'border-white/[0.08] bg-white/[0.04] text-white/55 hover:bg-white/[0.09] hover:text-white/80'
          }`}
        >
          <Sparkles className="h-[13px] w-[13px] shrink-0" />
          <span className="hidden sm:inline font-semibold">Tools</span>
          <ChevronDown className={`hidden sm:block h-3 w-3 shrink-0 transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* ── Tools panel portal ── */}
        {toolsOpen && typeof document !== 'undefined' && createPortal(
          <>
            <style>{`
              @keyframes tn-bd    { from{opacity:0} to{opacity:1} }
              @keyframes tn-sheet { from{transform:translateY(100%)} to{transform:translateY(0)} }
              @keyframes tn-drop  { from{opacity:0;transform:translateY(-4px) scale(0.97)} to{opacity:1;transform:none} }
              @keyframes tn-item  { from{opacity:0;transform:translateX(-4px)} to{opacity:1;transform:none} }
              .tn-panel { animation: tn-sheet 0.34s cubic-bezier(0.22,1,0.36,1) both; }
              @media(min-width:640px){ .tn-panel { animation: tn-drop 0.16s cubic-bezier(0.22,1,0.36,1) both; } }
              .tn-row { transition: background 0.10s ease; }
              .tn-row:hover  { background: rgba(255,255,255,0.048) !important; }
              .tn-row:active { background: rgba(255,255,255,0.028) !important; transform: scale(0.985); transition-duration:0.06s; }
              .tn-icon-box { transition: transform 0.14s cubic-bezier(0.34,1.56,0.64,1); }
              .tn-row:hover .tn-icon-box { transform: scale(1.10); }
            `}</style>

            {/* Mobile backdrop */}
            <div className="sm:hidden" onClick={() => setToolsOpen(false)}
              style={{ position:'fixed', inset:0, zIndex:2147483646, background:'rgba(0,0,0,0.72)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', animation:'tn-bd 0.16s ease both' }} />
            {/* Desktop transparent click-catcher */}
            <div className="hidden sm:block" onClick={() => setToolsOpen(false)}
              style={{ position:'fixed', inset:0, zIndex:2147483646 }} />

            {/* Panel */}
            <div
              className="tn-panel fixed bottom-0 left-0 right-0 rounded-t-[24px]
                sm:bottom-auto sm:left-auto sm:top-[57px] sm:right-4 sm:w-[248px] sm:rounded-[14px]"
              style={{
                zIndex: 2147483647,
                background: 'rgba(4,4,8,0.94)',
                backdropFilter: 'blur(48px) saturate(2.6)',
                WebkitBackdropFilter: 'blur(48px) saturate(2.6)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 12px 48px rgba(0,0,0,0.80), 0 0 0 1px rgba(255,255,255,0.03) inset',
                paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 8px)',
              }}
            >
              {/* Drag handle — mobile only */}
              <div className="flex justify-center pt-2.5 pb-0 sm:hidden">
                <div style={{ width: 32, height: 3.5, borderRadius: 99, background: 'rgba(255,255,255,0.10)' }} />
              </div>

              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', gap:9, padding:'12px 13px 10px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ width:26, height:26, borderRadius:7, background:'rgba(139,92,246,0.14)', border:'1px solid rgba(139,92,246,0.20)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Sparkles style={{ width:12, height:12, color:'#a78bfa' }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ margin:0, fontSize:12.5, fontWeight:700, color:'rgba(255,255,255,0.90)', letterSpacing:'-0.01em' }}>Tools</p>
                  <p style={{ margin:0, fontSize:9.5, color:'rgba(255,255,255,0.26)' }}>Workspace toolkit</p>
                </div>
                <button type="button" onClick={() => setToolsOpen(false)}
                  style={{ width:24, height:24, borderRadius:'50%', border:'1px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.04)', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.30)', cursor:'pointer', flexShrink:0 }}>
                  <X style={{ width:11, height:11 }} />
                </button>
              </div>

              {/* Single-column tool list */}
              <div style={{ padding:'5px 6px 4px' }}>
                {TOOLS_ITEMS.map((tool, idx) => (
                  <button key={tool.id} type="button" className="tn-row"
                    onClick={() => handleToolClick(tool.id)}
                    style={{
                      display:'flex', alignItems:'center', gap:10, width:'100%',
                      borderRadius:10, border:'none', background:'transparent',
                      padding:'8px 8px', textAlign:'left', cursor:'pointer',
                      animation:`tn-item 0.22s ${0.03 + idx * 0.025}s cubic-bezier(0.22,1,0.36,1) both`,
                    }}
                  >
                    {/* Icon */}
                    <div className="tn-icon-box" style={{ width:30, height:30, borderRadius:8, flexShrink:0, background:tool.bg, border:`1px solid ${tool.bd}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <tool.Icon style={{ width:14, height:14, color:tool.color }} />
                    </div>
                    {/* Text */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.84)', lineHeight:1.2 }}>{tool.label}</p>
                      <p style={{ margin:'1.5px 0 0', fontSize:10, color:'rgba(255,255,255,0.28)', lineHeight:1.2 }}>{tool.desc}</p>
                    </div>
                    {/* Right accent dot */}
                    <div style={{ width:4, height:4, borderRadius:'50%', background:tool.color, opacity:0.35, flexShrink:0 }} />
                  </button>
                ))}
              </div>

            </div>
          </>,
          document.body
        )}

        {/* Messages icon (desktop only — mobile uses the bottom dock) */}
        {isAuthenticated && !guestMode && (
          <Link
            href="/messages"
            className="relative hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/50 transition hover:bg-white/[0.09] hover:text-white/80 active:scale-95"
            aria-label={`Messages${msgUnread > 0 ? ` (${msgUnread} unread)` : ''}`}
          >
            <MessageSquare className="h-[15px] w-[15px]" />
            {msgUnread > 0 && (
              <>
                <span className="absolute -right-[2px] -top-[2px] h-[11px] w-[11px] rounded-full bg-blue-500/30 animate-ping" />
                <span className="absolute -right-[2px] -top-[2px] flex h-[11px] w-[11px] items-center justify-center rounded-full bg-blue-500 text-[6.5px] font-black text-white shadow-[0_0_8px_rgba(59,130,246,0.75)]">
                  {msgUnread > 9 ? '9+' : msgUnread}
                </span>
              </>
            )}
          </Link>
        )}

        {/* Notification bell */}
        {isAuthenticated && (
          <div ref={notifRef} className="relative">
            {/* Bell button — circular, consistent on all sizes */}
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => !prev)}
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition active:scale-95 ${
                notifOpen
                  ? 'border-white/[0.18] bg-white/[0.10] text-white'
                  : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.09] hover:text-white/80'
              }`}
              aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            >
              <Bell className={`h-[15px] w-[15px] transition-all ${unreadCount > 0 ? 'text-white/85' : ''}`} />
              {unreadCount > 0 && (
                <>
                  <span className="absolute -right-[2px] -top-[2px] h-[11px] w-[11px] rounded-full bg-rose-500/25 animate-ping" />
                  <span className="absolute -right-[2px] -top-[2px] flex h-[11px] w-[11px] items-center justify-center rounded-full bg-rose-500 text-[6.5px] font-black text-white shadow-[0_0_8px_rgba(239,68,68,0.75)]">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </>
              )}
            </button>

            {/* Portal: renders directly into document.body — escapes header stacking context entirely */}
            {notifOpen && createPortal(
              <>
                {/* Backdrop */}
                <button
                  type="button"
                  aria-label="Close notifications"
                  className="notif-backdrop fixed inset-0 bg-black/75 backdrop-blur-[6px]"
                  style={{ zIndex: 2147483646 }}
                  onClick={() => setNotifOpen(false)}
                />

                {/* Panel */}
                <div
                  className="notif-panel fixed flex flex-col
                    bottom-0 left-0 right-0 rounded-t-[26px]
                    border-t border-l border-r border-white/[0.12]
                    shadow-[0_-4px_40px_rgba(0,0,0,1)]
                    sm:bottom-auto sm:left-auto sm:top-[57px] sm:right-4 sm:w-[390px] sm:rounded-[20px] sm:border sm:shadow-[0_8px_48px_rgba(0,0,0,0.92)]"
                  style={{ background: '#0c0c0f', maxHeight: '78svh', zIndex: 2147483647 }}
                >
                  {/* Drag handle — mobile only */}
                  <div className="shrink-0 flex justify-center pt-3 pb-1 sm:hidden">
                    <div className="h-[5px] w-12 rounded-full bg-white/[0.15]" />
                  </div>

                  {/* Header */}
                  <div className="shrink-0 flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-bold text-white tracking-[-0.015em]">Notifications</p>
                      {unreadCount > 0 && (
                        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500/15 px-1.5 text-[9px] font-black text-rose-400 border border-rose-500/20 tabular-nums">
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {notifications.some((n) => !n.read) && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void markAllRead(); }}
                          className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-[11px] font-medium text-white/30 transition hover:bg-white/[0.07] hover:text-white/65 active:scale-95"
                        >
                          <Check className="h-3 w-3" />
                          Mark all read
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/35 transition hover:bg-white/[0.10] hover:text-white"
                        aria-label="Close"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Scrollable body */}
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center px-6 py-12 gap-4">
                        <div className="relative flex h-16 w-16 items-center justify-center rounded-[20px] border border-white/[0.07] bg-white/[0.025]">
                          <Bell className="h-7 w-7 text-white/12" />
                          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#1a1a1e] border border-white/[0.07]">
                            <Check className="h-3 w-3 text-white/25" />
                          </span>
                        </div>
                        <div className="text-center">
                          <p className="text-[14px] font-semibold text-white/35 tracking-[-0.01em]">You&apos;re all caught up</p>
                          <p className="mt-1 text-[12px] leading-relaxed text-white/20">
                            New activity from your network<br />will appear here.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="pb-2">
                        {notifications.filter((n) => n.type && SOCIAL_TYPES.has(n.type)).length > 0 && (
                          <>
                            <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
                              <span className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20">Social</span>
                              <div className="flex-1 h-px bg-white/[0.05]" />
                            </div>
                            {notifications.filter((n) => n.type && SOCIAL_TYPES.has(n.type)).map((notif) => {
                              const tone = notif.tone || 'default';
                              const IconComp = typeIcon(notif.type);
                              const isSocial = notif.type && SOCIAL_TYPES.has(notif.type);
                              const inner = (
                                <div className={`group relative flex cursor-pointer items-start gap-3 border-b border-white/[0.04] px-4 py-3.5 transition-colors hover:bg-white/[0.03] active:bg-white/[0.05] ${notif.read ? '' : 'bg-white/[0.018]'}`}
                                  onClick={() => { if (!notif.read) markOneRead(notif.id); if (notif.href) setNotifOpen(false); }}>
                                  {!notif.read && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]" />}
                                  {isSocial && notif.actorId ? (
                                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 overflow-hidden ${TONE_RING[tone]}`}>
                                      {notif.actorAvatar
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img src={notif.actorAvatar} alt={notif.actorName || ''} className="h-full w-full object-cover" />
                                        : <span className="text-[13px] font-bold text-white/70 select-none bg-white/[0.07] w-full h-full flex items-center justify-center">{(notif.actorName || '?').charAt(0).toUpperCase()}</span>}
                                    </div>
                                  ) : (
                                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${ICON_BG[tone]}`}><IconComp className={`h-4 w-4 ${ICON_COLOR[tone]}`} /></div>
                                  )}
                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className={`text-[12.5px] font-semibold leading-snug ${notif.read ? 'text-white/45' : 'text-white/88'}`}>{notif.title}</p>
                                      <span className="shrink-0 text-[10px] text-white/22 mt-0.5 tabular-nums">{timeAgo(notif.createdAt)}</span>
                                    </div>
                                    <p className={`mt-0.5 text-[11.5px] leading-relaxed line-clamp-2 ${notif.read ? 'text-white/22' : 'text-white/48'}`}>{notif.body}</p>
                                    {notif.ctaLabel && notif.href && !notif.read && <span className={`mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-semibold ${ICON_COLOR[tone]}`}>{notif.ctaLabel} →</span>}
                                  </div>
                                </div>
                              );
                              return notif.href
                                ? <Link key={notif.id} href={notif.href} onClick={() => { setNotifOpen(false); if (!notif.read) markOneRead(notif.id); }}>{inner}</Link>
                                : <div key={notif.id}>{inner}</div>;
                            })}
                          </>
                        )}
                        {notifications.filter((n) => !n.type || !SOCIAL_TYPES.has(n.type)).length > 0 && (
                          <>
                            <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
                              <span className="text-[9px] font-black uppercase tracking-[0.28em] text-white/20">Workspace</span>
                              <div className="flex-1 h-px bg-white/[0.05]" />
                            </div>
                            {notifications.filter((n) => !n.type || !SOCIAL_TYPES.has(n.type)).map((notif) => {
                              const tone = notif.tone || 'default';
                              const IconComp = typeIcon(notif.type);
                              const isSocial = notif.type && SOCIAL_TYPES.has(notif.type);
                              const inner = (
                                <div className={`group relative flex cursor-pointer items-start gap-3 border-b border-white/[0.04] px-4 py-3.5 transition-colors hover:bg-white/[0.03] active:bg-white/[0.05] ${notif.read ? '' : 'bg-white/[0.018]'}`}
                                  onClick={() => { if (!notif.read) markOneRead(notif.id); if (notif.href) setNotifOpen(false); }}>
                                  {!notif.read && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]" />}
                                  {isSocial && notif.actorId ? (
                                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 overflow-hidden ${TONE_RING[tone]}`}>
                                      {notif.actorAvatar
                                        // eslint-disable-next-line @next/next/no-img-element
                                        ? <img src={notif.actorAvatar} alt={notif.actorName || ''} className="h-full w-full object-cover" />
                                        : <span className="text-[13px] font-bold text-white/70 select-none bg-white/[0.07] w-full h-full flex items-center justify-center">{(notif.actorName || '?').charAt(0).toUpperCase()}</span>}
                                    </div>
                                  ) : (
                                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${ICON_BG[tone]}`}><IconComp className={`h-4 w-4 ${ICON_COLOR[tone]}`} /></div>
                                  )}
                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className={`text-[12.5px] font-semibold leading-snug ${notif.read ? 'text-white/45' : 'text-white/88'}`}>{notif.title}</p>
                                      <span className="shrink-0 text-[10px] text-white/22 mt-0.5 tabular-nums">{timeAgo(notif.createdAt)}</span>
                                    </div>
                                    <p className={`mt-0.5 text-[11.5px] leading-relaxed line-clamp-2 ${notif.read ? 'text-white/22' : 'text-white/48'}`}>{notif.body}</p>
                                    {notif.ctaLabel && notif.href && !notif.read && <span className={`mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-semibold ${ICON_COLOR[tone]}`}>{notif.ctaLabel} →</span>}
                                  </div>
                                </div>
                              );
                              return notif.href
                                ? <Link key={notif.id} href={notif.href} onClick={() => { setNotifOpen(false); if (!notif.read) markOneRead(notif.id); }}>{inner}</Link>
                                : <div key={notif.id}>{inner}</div>;
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>,
              document.body
            )}
          </div>
        )}

        {/* Profile avatar — authenticated users only */}
        {isAuthenticated && !guestMode && (
          <div className="relative shrink-0" title={badge?.docrudGo ? 'Docrud Infinity ∞ Profile' : 'My profile'}>
            {/* Infinity ring for Docrud Infinity users */}
            {badge?.docrudGo && (
              <>
                <div
                  className="absolute inset-[-2.5px] rounded-full"
                  style={{
                    background: 'conic-gradient(from 0deg, #4f46e5 0%, #818cf8 25%, #a5b4fc 50%, #818cf8 75%, #4f46e5 100%)',
                    animation: 'goRingSpin 4s linear infinite',
                    willChange: 'transform',
                  }}
                />
                <div
                  className="absolute inset-[-2.5px] rounded-full opacity-60"
                  style={{ background: 'conic-gradient(from 0deg, #4f46e5, #818cf8, #4f46e5)', filter: 'blur(5px)', willChange: 'transform' }}
                />
              </>
            )}
            <Link
              href="/profile"
              className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.14] bg-gradient-to-br from-white/[0.14] to-white/[0.06] text-white/70 transition hover:from-white/[0.20] hover:to-white/[0.10] hover:text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] active:scale-95 overflow-hidden"
              style={badge?.docrudGo ? { boxShadow: '0 0 0 2px #08090a, 0 2px 12px rgba(99,102,241,0.4)' } : undefined}
            >
              {(badge?.avatarUrl || session?.user?.image) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={badge?.avatarUrl || session!.user!.image!} alt="Profile" className="h-full w-full object-cover" />
              ) : session?.user?.name ? (
                <span className="text-[11px] font-bold leading-none select-none" style={badge?.docrudGo ? { color: '#a5b4fc' } : { color: 'rgba(255,255,255,0.8)' }}>
                  {session.user.name.charAt(0).toUpperCase()}
                </span>
              ) : (
                <User className="h-3.5 w-3.5" />
              )}
            </Link>
            {badge?.docrudGo && (
              <span
                className="absolute -bottom-0.5 -right-0.5 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[7px] font-black"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#818cf8)', color: '#ffffff', boxShadow: '0 0 0 1.5px #08090a', fontSize: 9 }}
              >∞</span>
            )}
          </div>
        )}

        {/* Guest mode: sign-in button */}
        {guestMode && (
          <Link
            href="/login"
            onClick={() => { if (typeof document !== 'undefined') document.cookie = 'guestMode=; path=/; max-age=0'; }}
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-white px-3 text-[12px] font-bold text-[#0D0D0F] transition hover:bg-white/90 active:scale-95"
          >
            Sign in
          </Link>
        )}

        {/* Unauthenticated: login button */}
        {!isAuthenticated && !guestMode && (
          <Link
            href="/login"
            className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-white/[0.10] bg-white/[0.06] px-3 text-[12px] font-semibold text-white/70 transition hover:bg-white/[0.12] hover:text-white"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
