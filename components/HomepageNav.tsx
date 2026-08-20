'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
import GlobalSearchBar, { type GlobalSearchBarHandle, type LocalSearchResult } from '@/components/GlobalSearchBar';
import { NavAnnouncementBar, ProfileCompletionRing, shouldShowAnnouncement, type NavAnnouncementConfig } from '@/components/nav/ProfileCompletion';
import OpportunityHub from '@/components/OpportunityHub';
import { useSession ,signOut } from 'next-auth/react';

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
  LogOut,
  Layers,
  Mail,
  Menu,
  MessageCircle,
  MessageSquare,
  Moon,
  Newspaper,
  PenLine,
  Plus,
  Search,
  Share2,
  Sheet,
  Sparkles,
  Sun,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { applyColorMode, getStoredColorMode, type ColorMode } from '@/app/components/ThemeController';

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
  default: 'ring-[var(--nt-line)]',
  amber:   'ring-amber-400/30',
  sky:     'ring-sky-400/30',
  emerald: 'ring-emerald-400/30',
  rose:    'ring-rose-400/30',
};

const ICON_BG: Record<NonNullable<WorkspaceNotification['tone']>, string> = {
  default: 'bg-[var(--nt-surface-2)]',
  amber:   'bg-amber-500/[0.12]',
  sky:     'bg-sky-500/[0.12]',
  emerald: 'bg-emerald-500/[0.12]',
  rose:    'bg-rose-500/[0.12]',
};

const ICON_COLOR: Record<NonNullable<WorkspaceNotification['tone']>, string> = {
  default: 'text-[color:var(--nt-t3)]',
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

/**
 * Actor avatar for a social notification.
 *
 * Falls back to the actor's initial when there is no photo OR the photo fails
 * to load, so a dead URL never renders a broken image. The error flag resets
 * whenever `src` changes — the panel reuses these rows as the list refreshes,
 * so without the reset one failed image would leave later actors stuck on the
 * initial (the same bug that was fixed in the story viewer).
 */
function NotificationActorAvatar({ src, name }: { src?: string; name?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name || ''}
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <span className="text-[13px] font-bold text-[color:var(--nt-t2)] select-none bg-[var(--nt-surface-2)] w-full h-full flex items-center justify-center">
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

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
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  const [navVisible, setNavVisible] = useState(true);
  const navLastY = useRef(0);
  const navTicking = useRef(false);
 const [notifOpen, setNotifOpen] = useState(false);
const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);

const notificationAudioRef = useRef<HTMLAudioElement | null>(null);
const previousNotificationIdsRef = useRef<Set<string>>(new Set());
const notificationsInitializedRef = useRef(false);

const notifRef = useRef<HTMLDivElement>(null);
const notifPanelRef = useRef<HTMLDivElement>(null);
  const [badge, setBadge] = useState<{ docrudGo: boolean; avatarUrl: string | null; profileScore: number | null } | null>(null);
  const [announcement, setAnnouncement] = useState<NavAnnouncementConfig | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>('dark');
  const [profileOpen, setProfileOpen] = useState(false);
const profileTriggerRef = useRef<HTMLButtonElement>(null);
 useEffect(() => {
  setIsMounted(true);
  setColorMode(getStoredColorMode());
}, []);

useEffect(() => {
  const audio = new Audio('/sounds/notification.mp3');

  audio.preload = 'auto';
  audio.volume = 0.35;

  notificationAudioRef.current = audio;

  return () => {
    audio.pause();
    notificationAudioRef.current = null;
  };
}, []);

  function toggleColorMode() {
    const next: ColorMode = colorMode === 'dark' ? 'light' : 'dark';
    setColorMode(next);
    applyColorMode(next);
  }

  function openNotification(notif: WorkspaceNotification) {
    if (!notif.read) markOneRead(notif.id);
    setNotifOpen(false);
    const dest = (notif.href || (notif.actorId ? `/u/${notif.actorId}` : '') || '/').trim();
    if (/^https?:\/\//i.test(dest)) {
      window.location.assign(dest);
      return;
    }
    router.push(dest.startsWith('/') ? dest : `/${dest}`);
  }

  /* scroll-hide on mobile only */
  useEffect(() => {
    const onScroll = () => {
      if (navTicking.current) return;
      navTicking.current = true;
      requestAnimationFrame(() => {
        if (window.innerWidth >= 768) { navTicking.current = false; return; }
        const y    = window.scrollY;
        const diff = y - navLastY.current;
        if (Math.abs(diff) > 4) {
          setNavVisible(diff < 0 || y < 60);
          navLastY.current = y;
        }
        navTicking.current = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

  /* The server counts unread across the WHOLE set; the response is capped to a
     page, so deriving the badge from the returned array alone would undercount
     once a user has more than one page of notifications. */
  const [serverUnread, setServerUnread] = useState<number | null>(null);
  const localUnread = notifications.filter((n) => !n.read).length;
  const unreadCount = serverUnread ?? localUnread;
  useEffect(() => {
  const currentIds = new Set(
    notifications.map((notification) => notification.id)
  );

  // First load: remember existing notifications, but don't play sound.
  if (!notificationsInitializedRef.current) {
    previousNotificationIdsRef.current = currentIds;
    notificationsInitializedRef.current = true;
    return;
  }

  const hasNewNotification = notifications.some(
    (notification) =>
      !previousNotificationIdsRef.current.has(notification.id)
  );

  if (hasNewNotification) {
    const audio = notificationAudioRef.current;

    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {
        // Browser may block audio until user interaction.
      });
    }
  }

  previousNotificationIdsRef.current = currentIds;
}, [notifications]);

  /* Stale-response protection: only the newest in-flight request may write to
     state. Each call aborts the previous one and stamps a sequence number, so a
     slow earlier response can never overwrite a newer one. */
  const notifAbortRef = useRef<AbortController | null>(null);
  const notifSeqRef = useRef(0);

  const fetchNotifications = useCallback(async () => {
    notifAbortRef.current?.abort();
    const controller = new AbortController();
    notifAbortRef.current = controller;
    const seq = ++notifSeqRef.current;
    try {
      const res = await fetch('/api/notifications', { signal: controller.signal });
      if (!res.ok) return;
      const data = await res.json() as { notifications?: WorkspaceNotification[]; unreadCount?: number };
      if (seq !== notifSeqRef.current) return;          // a newer request won
      if (Array.isArray(data.notifications)) setNotifications(data.notifications);
      if (typeof data.unreadCount === 'number') setServerUnread(data.unreadCount);
    } catch { /* aborted or offline — keep what is on screen */ }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || guestMode) return;
    const id = setTimeout(() => {
      fetch('/api/me/badge')
        .then((r) => r.ok ? r.json() : null)
        .then((d: { docrudGo?: boolean; avatarUrl?: string | null; profileScore?: number | null } | null) => {
          if (d) setBadge({
            docrudGo: d.docrudGo ?? false,
            avatarUrl: d.avatarUrl ?? null,
            profileScore: typeof d.profileScore === 'number' ? d.profileScore : null,
          });
        })
        .catch(() => {});
    }, 800);
    return () => clearTimeout(id);
  }, [isAuthenticated, guestMode]);

  /* Super Admin owns the announcement copy and its on/off switch, so the bar
     reads it from the server rather than embedding a string in the bundle. */
  useEffect(() => {
    if (!isAuthenticated || guestMode) return;
    let cancelled = false;
    fetch('/api/announcement')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: NavAnnouncementConfig | null) => {
        if (!cancelled && d) setAnnouncement({ enabled: !!d.enabled, text: d.text ?? '', href: d.href ?? '' });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated, guestMode]);


  /* Notification + unread polling.
     
     There is no SSE connection here any more. app/api/notifications/stream
     exposes an EventSource endpoint, but nothing in the codebase ever calls its
     notifyUser()/__sseNotifyUser push hook, so the stream only ever delivered
     the payload once on connect and then keepalive comments — while holding a
     long-lived connection open per tab (a billed, long-running invocation on
     serverless). The client therefore polls, which is what actually drove
     updates before. The server route is left in place: reintroduce the
     connection here once a shared cross-instance event bus exists to push from.

     One timer drives both fetches, and it does not run while the tab is
     hidden — a background tab costs nothing until the user returns. */
  useEffect(() => {
    if (!isAuthenticated || guestMode) return;

    const POLL_MS = 60_000;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refresh = () => { void fetchNotifications(); };

    const start = () => {
      if (timer) return;
      timer = setInterval(refresh, POLL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    // Delay the first pass so it does not compete with page paint.
    const initTimer = setTimeout(() => {
      refresh();
      if (document.visibilityState === 'visible') start();
    }, 1500);

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        refresh();      // exactly one catch-up refresh
        start();
      } else {
        stop();         // no polling in the background
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(initTimer);
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isAuthenticated, guestMode, fetchNotifications]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const inBell = notifRef.current?.contains(target);
      const inPanel = notifPanelRef.current?.contains(target);
      if (!inBell && !inPanel) {
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
    <>
    <header className="shrink-0 h-14 flex items-center justify-between px-4 sm:px-6 lg:px-10 xl:px-12 sticky top-0 z-40" style={{
      /* Match GlobalBottomNav glassmorphism tokens */
      background: 'rgba(0, 0, 0, 0.82)',
      backdropFilter: 'blur(28px) saturate(180%)',
      WebkitBackdropFilter: 'blur(28px) saturate(180%)',
      borderBottom: '1px solid rgba(255,255,255,0.09)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.07)',
      transform: navVisible ? 'translateY(0)' : 'translateY(-100%)',
      transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
      willChange: 'transform',
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
        <Link href="/" className="hidden md:flex items-center gap-2 shrink-0 group">
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

      {/* Desktop announcement lives beside Explore tabs on the homepage
          (PublicHomepage ExploreSection) — not next to Search. */}

      {/* Mobile publish + button — left of search pill, visible below md only */}
      {onPublishClick && (
        <button
          type="button"
          onClick={onPublishClick}
          className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] transition active:scale-95"
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.11)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
          aria-label="Publish"
        >
          <Plus className="h-[17px] w-[17px] text-white/70" />
        </button>
      )}

      {/* Mobile search pill — visible below md only, matches GlobalSearchBar's md:flex breakpoint */}
      <button
        type="button"
        onClick={() => searchBarRef.current?.openMobile()}
        className="md:hidden flex flex-1 items-center gap-2 mx-1.5 h-[36px] min-w-0 rounded-[12px] px-3"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <Search className="h-[13px] w-[13px] shrink-0 text-white/40" />
        <span className="text-[13px] font-medium text-white/32 truncate flex-1 text-left">Search</span>
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

        {/* ── More button — opens the existing Opportunity Hub ──
             Replaces the Businesses control that used to sit here. Businesses
             is still reachable, as the first row inside the hub. Sizing,
             border, hover and active treatment are unchanged so the header
             keeps its existing dimensions. */}
        <button
          type="button"
          onClick={() => setHubOpen(v => !v)}
          aria-haspopup="dialog"
          aria-expanded={hubOpen}
          aria-label="More opportunities"
          className={`hidden sm:flex h-8 items-center gap-1.5 rounded-[10px] border px-3 text-[12px] font-semibold transition active:scale-95 ${
            hubOpen
              ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300'
              : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:bg-white/[0.09] hover:text-white/75'
          }`}
        >
          <LayoutGrid className="h-3 w-3" />
          More
        </button>

        {/* ── File Drive button ── */}
        <button
          type="button"
          onClick={() => onFileDriveClick?.()}
          className="hidden sm:flex h-8 items-center gap-1.5 rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3 text-[12px] font-medium text-white/50 transition hover:bg-white/[0.09] hover:text-white/75 active:scale-95"
        >
          <DdriveIcon size={13} />
          <span className="font-semibold">Ddrive</span>
        </button>


        {/* Drive — mobile icon only (desktop shows the full Ddrive button above)
        <button
          type="button"
          onClick={() => onFileDriveClick?.()}
          className="md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] transition active:scale-95"
          style={{
            background: 'rgba(167,139,250,0.10)',
            border: '1px solid rgba(167,139,250,0.20)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
          aria-label="Ddrive"
        >
          <DdriveIcon size={15} />
        </button> */}

        {/* The mobile Messages icon used to sit here. It was removed so the
            search pill (flex-1) reclaims the width between + and the bell.
            Messages is still reachable from the nav links menu (/messages).
            Desktop is unaffected — this control was md:hidden. */}

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
                  className="notif-backdrop fixed inset-0 backdrop-blur-[6px]"
                  style={{ zIndex: 2147483646 }}
                  onClick={() => setNotifOpen(false)}
                />

                {/* Panel */}
                <div
                  ref={notifPanelRef}
                  className="notif-panel fixed flex flex-col
                    bottom-0 left-0 right-0 rounded-t-[26px]
                    border-t border-l border-r border-[var(--nt-line)]
                    sm:bottom-auto sm:left-auto sm:top-[57px] sm:right-4 sm:w-[390px] sm:rounded-[20px] sm:border"
                  style={{ maxHeight: '78svh', zIndex: 2147483647 }}
                >
                  {/* Drag handle — mobile only */}
                  <div className="shrink-0 flex justify-center pt-3 pb-1 sm:hidden">
                    <div className="h-[5px] w-12 rounded-full bg-[var(--nt-line)]" />
                  </div>

                  {/* Header */}
                  <div className="shrink-0 flex items-center justify-between border-b border-[var(--nt-line)] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-bold text-[color:var(--nt-t1)] tracking-[-0.015em]">Notifications</p>
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
                          className="flex items-center gap-1 rounded-[8px] px-2 py-1 text-[11px] font-medium text-[color:var(--nt-t3)] transition hover:bg-[var(--nt-surface-2)] hover:text-[color:var(--nt-t2)] active:scale-95"
                        >
                          <Check className="h-3 w-3" />
                          Mark all read
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setNotifOpen(false)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--nt-line)] bg-[var(--nt-surface-2)] text-[color:var(--nt-t3)] transition hover:bg-[var(--nt-surface-2)] hover:text-[color:var(--nt-t1)]"
                        aria-label="Close"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Scrollable body */}
                  <div className="notif-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                    {notifications.length === 0 ? (
                      <div className="flex flex-col items-center justify-center px-6 py-12 gap-4">
                        <div className="relative flex h-16 w-16 items-center justify-center rounded-[20px] border border-[var(--nt-line)] bg-[var(--nt-surface-2)]">
                          <Bell className="h-7 w-7 text-[color:var(--nt-t4)]" />
                          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#1a1a1e] border border-[var(--nt-line)]">
                            <Check className="h-3 w-3 text-[color:var(--nt-t4)]" />
                          </span>
                        </div>
                        <div className="text-center">
                          <p className="text-[14px] font-semibold text-[color:var(--nt-t3)] tracking-[-0.01em]">You&apos;re all caught up</p>
                          <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--nt-t4)]">
                            New activity from your network<br />will appear here.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="pb-2">
                        {notifications.filter((n) => n.type && SOCIAL_TYPES.has(n.type)).length > 0 && (
                          <>
                            <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
                              <span className="text-[9px] font-black uppercase tracking-[0.28em] text-[color:var(--nt-t4)]">Social</span>
                              <div className="flex-1 h-px bg-[var(--nt-surface-2)]" />
                            </div>
                            {notifications.filter((n) => n.type && SOCIAL_TYPES.has(n.type)).map((notif) => {
                              const tone = notif.tone || 'default';
                              const IconComp = typeIcon(notif.type);
                              const isSocial = notif.type && SOCIAL_TYPES.has(notif.type);
                              return (
                                <div key={notif.id}
                                  className={`group relative flex cursor-pointer items-start gap-3 border-b border-[var(--nt-line)] px-4 py-3.5 transition-colors hover:bg-[var(--nt-hover)] active:bg-[var(--nt-surface-2)] ${notif.read ? '' : 'bg-[var(--nt-unread)]'}`}
                                  onClick={() => openNotification(notif)}>
                                  {!notif.read && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]" />}
                                  {isSocial && notif.actorId ? (
                                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 overflow-hidden ${TONE_RING[tone]}`}>
                                      <NotificationActorAvatar src={notif.actorAvatar} name={notif.actorName} />
                                    </div>
                                  ) : (
                                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${ICON_BG[tone]}`}><IconComp className={`h-4 w-4 ${ICON_COLOR[tone]}`} /></div>
                                  )}
                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className={`text-[12.5px] font-semibold leading-snug ${notif.read ? 'text-[color:var(--nt-t2)]' : 'text-[color:var(--nt-t1)]'}`}>{notif.title}</p>
                                      <span className="shrink-0 text-[10px] text-[color:var(--nt-t4)] mt-0.5 tabular-nums">{timeAgo(notif.createdAt)}</span>
                                    </div>
                                    <p className={`mt-0.5 text-[11.5px] leading-relaxed line-clamp-2 ${notif.read ? 'text-[color:var(--nt-t4)]' : 'text-[color:var(--nt-t2)]'}`}>{notif.body}</p>
                                    <span className={`mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-semibold ${ICON_COLOR[tone]}`}>{notif.ctaLabel || 'Open'} →</span>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        )}
                        {notifications.filter((n) => !n.type || !SOCIAL_TYPES.has(n.type)).length > 0 && (
                          <>
                            <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
                              <span className="text-[9px] font-black uppercase tracking-[0.28em] text-[color:var(--nt-t4)]">Workspace</span>
                              <div className="flex-1 h-px bg-[var(--nt-surface-2)]" />
                            </div>
                            {notifications.filter((n) => !n.type || !SOCIAL_TYPES.has(n.type)).map((notif) => {
                              const tone = notif.tone || 'default';
                              const IconComp = typeIcon(notif.type);
                              const isSocial = notif.type && SOCIAL_TYPES.has(notif.type);
                              return (
                                <div key={notif.id}
                                  className={`group relative flex cursor-pointer items-start gap-3 border-b border-[var(--nt-line)] px-4 py-3.5 transition-colors hover:bg-[var(--nt-hover)] active:bg-[var(--nt-surface-2)] ${notif.read ? '' : 'bg-[var(--nt-unread)]'}`}
                                  onClick={() => openNotification(notif)}>
                                  {!notif.read && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_5px_rgba(239,68,68,0.8)]" />}
                                  {isSocial && notif.actorId ? (
                                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 overflow-hidden ${TONE_RING[tone]}`}>
                                      <NotificationActorAvatar src={notif.actorAvatar} name={notif.actorName} />
                                    </div>
                                  ) : (
                                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${ICON_BG[tone]}`}><IconComp className={`h-4 w-4 ${ICON_COLOR[tone]}`} /></div>
                                  )}
                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className={`text-[12.5px] font-semibold leading-snug ${notif.read ? 'text-[color:var(--nt-t2)]' : 'text-[color:var(--nt-t1)]'}`}>{notif.title}</p>
                                      <span className="shrink-0 text-[10px] text-[color:var(--nt-t4)] mt-0.5 tabular-nums">{timeAgo(notif.createdAt)}</span>
                                    </div>
                                    <p className={`mt-0.5 text-[11.5px] leading-relaxed line-clamp-2 ${notif.read ? 'text-[color:var(--nt-t4)]' : 'text-[color:var(--nt-t2)]'}`}>{notif.body}</p>
                                    <span className={`mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-semibold ${ICON_COLOR[tone]}`}>{notif.ctaLabel || 'Open'} →</span>
                                  </div>
                                </div>
                              );
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

        {/* Theme toggle — Light / Dark */}
        <button
          type="button"
          onClick={toggleColorMode}
          className="hidden sm:flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/50 transition hover:bg-white/[0.09] hover:text-white/80 active:scale-95"
          aria-label={colorMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={colorMode === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {colorMode === 'dark' ? <Sun className="h-[15px] w-[15px]" /> : <Moon className="h-[15px] w-[15px]" />}
        </button>

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
            <ProfileCompletionRing
              score={badge?.profileScore ?? null}
              showValue={!badge?.docrudGo}
              className="hidden md:inline-flex"
            >
            <Link
              href="/profile"
              title={typeof badge?.profileScore === 'number' ? `Profile ${badge.profileScore}% complete` : undefined}
            className="hidden md:flex relative z-10 h-8 w-8 items-center justify-center rounded-full border border-white/[0.14] bg-gradient-to-br from-white/[0.14] to-white/[0.06] text-white/70 transition hover:from-white/[0.20] hover:to-white/[0.10] hover:text-white shadow-[0_2px_8px_rgba(0,0,0,0.3)] active:scale-95 overflow-hidden"
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
            </ProfileCompletionRing>

            {/* Mobile profile trigger */}
            <ProfileCompletionRing
              score={badge?.profileScore ?? null}
              showValue={!badge?.docrudGo}
              className="md:hidden"
            >
            <button
             ref={profileTriggerRef}
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              aria-label="Open profile menu"
              className="md:hidden relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.14] bg-gradient-to-br from-white/[0.14] to-white/[0.06] text-white/70 transition active:scale-95 overflow-hidden"
              style={
                badge?.docrudGo
                  ? {
                      boxShadow:
                        '0 0 0 2px #08090a, 0 2px 12px rgba(99,102,241,0.4)',
                    }
                  : undefined
              }
            >
              {(badge?.avatarUrl || session?.user?.image) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={badge?.avatarUrl || session!.user!.image!}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : session?.user?.name ? (
                <span
                  className="text-[11px] font-bold leading-none select-none"
                  style={
                    badge?.docrudGo
                      ? { color: '#a5b4fc' }
                      : { color: 'rgba(255,255,255,0.8)' }
                  }
                >
                  {session.user.name.charAt(0).toUpperCase()}
                </span>
              ) : (
                <User className="h-3.5 w-3.5" />
              )}
            </button>
            </ProfileCompletionRing>

            {badge?.docrudGo && (
              <span
                className="absolute -bottom-0.5 -right-0.5 z-20 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[7px] font-black"
                style={{ background: 'linear-gradient(135deg,#4f46e5,#818cf8)', color: '#ffffff', boxShadow: '0 0 0 1.5px #08090a', fontSize: 9 }}
              >∞</span>
            )}
            {/* Mobile profile dropdown */}
{/* Mobile profile dropdown */}
{profileOpen &&
  createPortal(
    <div
      className="md:hidden fixed right-3 top-[54px] z-[2147483647] pointer-events-auto w-[238px] overflow-hidden rounded-[18px] border border-white/[0.10] bg-[#0b0b10]/95 backdrop-blur-2xl shadow-[0_24px_70px_rgba(0,0,0,0.72)]"
    >
      {/* Appearance */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3.5">
        <div className="flex items-center gap-3">
          {colorMode === 'dark' ? (
            <Moon className="h-4 w-4 text-violet-300/75" />
          ) : (
            <Sun className="h-4 w-4 text-amber-300/75" />
          )}

          <div>
            <p className="text-[12px] font-semibold text-white/85">
              Appearance
            </p>
            <p className="text-[10px] text-white/30">
              {colorMode === 'dark' ? 'Dark mode' : 'Light mode'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleColorMode}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            colorMode === 'dark' ? 'bg-violet-500/75' : 'bg-white/15'
          }`}
          aria-label="Toggle dark and light mode"
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
              colorMode === 'dark' ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {/* Ddrive */}
      <button
        type="button"
        onClick={() => {
          setProfileOpen(false);
          onFileDriveClick?.();
        }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.05] active:bg-white/[0.08]"
      >
        <DdriveIcon size={16} />
        <span className="text-[12px] font-medium text-white/75">
          Ddrive
        </span>
      </button>

      {/* Profile */}
      <Link
        href="/profile"
        onClick={() => setProfileOpen(false)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-[12px] font-medium text-white/75 transition hover:bg-white/[0.05] active:bg-white/[0.08]"
      >
        <User className="h-4 w-4 text-white/45" />
        <span>Profile</span>
      </Link>

      {/* Upgrade */}
      <button
        type="button"
        onClick={() => {
          setProfileOpen(false);
          window.location.assign('/profile');
        }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.05] active:bg-white/[0.08]"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-violet-400/80" />

        <div>
          <p className="text-[12px] font-semibold text-white/80">
            {badge?.docrudGo ? 'Docrud Infinity' : 'Upgrade to Premium'}
          </p>

          <p className="text-[10px] text-white/30">
            {badge?.docrudGo
              ? 'Infinity membership'
              : 'Unlock premium features'}
          </p>
        </div>
      </button>

      <div className="h-px bg-white/[0.06]" />

      {/* Sign out */}
      <button
        type="button"
        onClick={async () => {
          setProfileOpen(false);
          await signOut({ callbackUrl: '/onboarding' });
        }}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-red-400/80 transition hover:bg-red-500/[0.06] active:bg-red-500/[0.10]"
      >
        <LogOut className="h-4 w-4" />
        <span className="text-[12px] font-medium">
          Sign out
        </span>
      </button>
    </div>,
    document.body
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

      {/* The same Opportunity Hub the mobile More opens — reused, not
          reimplemented. Only one can ever be open: this trigger is sm+ and
          the bottom-nav trigger is hidden at sm+. */}
      <OpportunityHub open={hubOpen} onClose={() => setHubOpen(false)} />
    </header>

    {/* Profile-completion announcement — mobile/tablet. Must sit directly under
        the sticky header and ABOVE the scrollable homepage (recents). Kept out
        of overflow-hidden content so it cannot be clipped. Absent at 100%. */}
    {isAuthenticated && !guestMode && shouldShowAnnouncement(announcement, badge?.profileScore ?? null) && (
      <div className="relative z-30 lg:hidden shrink-0 border-b border-white/[0.04] bg-[#060608]/92 px-4 pb-2 pt-2 backdrop-blur-md sm:px-6">
        <NavAnnouncementBar
          score={badge?.profileScore ?? null}
          announcement={announcement}
          variant="mobile"
        />
      </div>
    )}
    </>
  );
}
