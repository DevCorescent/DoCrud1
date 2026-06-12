'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  BadgeCheck,
  Bookmark,
  BrainCircuit,
  FileText,
  Filter,
  Folder,
  Home,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  MapPin,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  User,
  Users,
} from 'lucide-react';
import ClientDate from '@/components/ClientDate';
import { LandingSettings } from '@/types/document';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ResumeListItem = {
  id: string;
  slug: string;
  displayName: string;
  avatarDataUrl?: string;
  headline?: string;
  location?: string;
  category: string;
  skills: string[];
  tags: string[];
  summary?: string;
  resumeFileName?: string;
  resumeMimeType?: string;
  visibility: 'public' | 'private';
  viewCount: number;
  contactCount: number;
  contactVisibility: 'public' | 'members' | 'hidden';
  hasContact: boolean;
  matchScore?: number;
  compatibilityScore?: number;
  aiScore?: number;
  matchProvider?: string;
  matchRationale?: string;
  matchedSkills?: string[];
  updatedAt: string;
  createdAt: string;
};

type Meta = {
  categories: Array<{ category: string; count: number }>;
  tags: Array<{ tag: string; count: number }>;
  skills: Array<{ skill: string; count: number }>;
};

const DEFAULT_CATEGORIES = [
  'Engineering',
  'Design',
  'Product',
  'Marketing',
  'Sales',
  'Operations',
  'Finance',
  'HR',
  'Legal',
  'Content',
] as const;

export default function PublicTalentDirectoryPage(props: {
  settings: LandingSettings;
  softwareName: string;
  accentLabel: string;
  mode?: 'directory' | 'shortlists';
}) {
  const { data: session, status } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);
  const uiSession = mounted ? session : null;
  const uiAuthenticated = mounted && isAuthenticated;

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const pathnameSafe = pathname || '';
  const autoPublishOpenedRef = useRef(false);
  const mode = props.mode || 'directory';

  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [activeSkills, setActiveSkills] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState('');
  const [contactFilter, setContactFilter] = useState<'any' | 'has_contact'>('any');
  const [sortMode, setSortMode] = useState<'top_match' | 'recent'>('top_match');

  const [entries, setEntries] = useState<ResumeListItem[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [shortlistIds, setShortlistIds] = useState<string[]>([]);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [skillSearch, setSkillSearch] = useState('');

  const pageSize = 12;
  const [page, setPage] = useState(0);

  const readShortlistIds = () => {
    try {
      const stored = JSON.parse(localStorage.getItem('docrud:talent-shortlist') || '[]') as string[];
      return Array.isArray(stored) ? stored.filter((v) => typeof v === 'string' && v.trim()) : [];
    } catch {
      return [];
    }
  };

  const writeShortlistIds = (ids: string[]) => {
    const safe = Array.from(new Set(ids.filter((v) => typeof v === 'string' && v.trim()))).slice(0, 220);
    localStorage.setItem('docrud:talent-shortlist', JSON.stringify(safe));
    return safe;
  };

  const toggleShortlist = (id: string) => {
    const stored = readShortlistIds();
    const next = stored.includes(id) ? stored.filter((v) => v !== id) : [...stored, id];
    const safe = writeShortlistIds(next);
    setShortlistIds(safe);
  };

  const deriveExperienceLabel = (entry: ResumeListItem) => {
    const candidates = [...(entry.tags || []), entry.headline || '', entry.summary || '']
      .map((v) => String(v || '').toLowerCase());
    // Heuristic: try to extract "3 yrs" / "3 years" from tags or headline.
    for (const text of candidates) {
      const m = text.match(/(\d{1,2})\s*(\+)?\s*(yrs|yr|years|year)\b/);
      if (m?.[1]) return `${m[1]} yrs exp`;
    }
    return '';
  };

  const toggleExpandedCard = (id: string) => {
    setExpandedCards((current) => ({ ...current, [id]: !current[id] }));
  };

  const jdMode = useMemo(() => {
    const text = q.trim();
    return text.length >= 120 || text.includes('\n');
  }, [q]);

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishFeedback, setPublishFeedback] = useState('');
  const [publishStep, setPublishStep] = useState<'basics' | 'search' | 'resume' | 'contact' | 'publish'>('basics');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [publishForm, setPublishForm] = useState({
    displayName: '',
    headline: '',
    location: '',
    category: 'Engineering',
    tags: '',
    skills: '',
    summary: '',
    pastedText: '',
    visibility: 'public' as 'public' | 'private',
    contactVisibility: 'members' as 'public' | 'members' | 'hidden',
    contactEmail: '',
    contactPhone: '',
    contactLinkedin: '',
    contactWebsite: '',
    avatarFile: null as File | null,
    resumeFile: null as File | null,
  });

  const [publishAvatarPreview, setPublishAvatarPreview] = useState<string>('');
  useEffect(() => {
    if (!publishForm.avatarFile) {
      setPublishAvatarPreview('');
      return;
    }
    const url = URL.createObjectURL(publishForm.avatarFile);
    setPublishAvatarPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [publishForm.avatarFile]);

  const metaCategories = useMemo(() => {
    const live = meta?.categories?.map((item) => item.category) || [];
    const merged = Array.from(new Set([...DEFAULT_CATEGORIES, ...live]));
    return merged.slice(0, 16);
  }, [meta?.categories]);

  const filteredSkillChips = useMemo(() => {
    const search = skillSearch.trim().toLowerCase();
    const list = meta?.skills || [];
    if (!search) return list.slice(0, 14);
    return list
      .filter((item) => item.skill.toLowerCase().includes(search))
      .slice(0, 18);
  }, [meta?.skills, skillSearch]);

  useEffect(() => {
    if (mode !== 'shortlists') return;
    try {
      const stored = JSON.parse(localStorage.getItem('docrud:talent-shortlist') || '[]') as string[];
      const ids = Array.isArray(stored) ? stored.filter((v) => typeof v === 'string' && v.trim()) : [];
      setShortlistIds(ids.slice(0, 220));
    } catch {
      setShortlistIds([]);
    }
  }, [mode]);

  const shortlistModeEntries = useMemo(() => {
    if (mode !== 'shortlists') {
      return { pageEntries: entries, totalFiltered: total };
    }
    const qv = q.trim().toLowerCase();
    const tagsLower = activeTags.map((t) => t.toLowerCase());
    const skillsLower = activeSkills.map((s) => s.toLowerCase());
    const locLower = locationFilter.trim().toLowerCase();

    const filtered = entries.filter((entry) => {
      if (category.trim() && entry.category.trim().toLowerCase() !== category.trim().toLowerCase()) return false;
      if (tagsLower.length && !tagsLower.every((t) => entry.tags.map((x) => x.toLowerCase()).includes(t))) return false;
      if (skillsLower.length && !skillsLower.every((s) => entry.skills.map((x) => x.toLowerCase()).includes(s))) return false;
      if (contactFilter === 'has_contact' && !entry.hasContact) return false;
      const hay = [
        entry.displayName,
        entry.headline,
        entry.location,
        entry.category,
        entry.summary,
        entry.skills.join(' '),
        entry.tags.join(' '),
      ].join(' ').toLowerCase();
      if (qv && !hay.includes(qv)) return false;
      if (locLower && !(entry.location || '').toLowerCase().includes(locLower)) return false;
      return true;
    });

    const sorted = sortMode === 'recent'
      ? filtered.slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      : filtered;

    const totalFiltered = sorted.length;
    const start = page * pageSize;
    return {
      pageEntries: sorted.slice(start, start + pageSize),
      totalFiltered,
    };
  }, [activeSkills, activeTags, category, contactFilter, entries, locationFilter, mode, page, pageSize, q, sortMode, total]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setMessage('');

    const timeout = window.setTimeout(async () => {
      try {
        const url = new URL('/api/resumes', window.location.origin);
        if (mode === 'shortlists') {
          if (!shortlistIds.length) {
            setEntries([]);
            setMeta({ categories: [], tags: [], skills: [] });
            setTotal(0);
            return;
          }
          url.searchParams.set('ids', shortlistIds.join(','));
          // In shortlists mode we filter/search client-side for accuracy.
          url.searchParams.set('limit', '220');
          url.searchParams.set('offset', '0');
        }
        if (jdMode && q.trim()) {
          url.searchParams.set('jd', q.trim());
          try {
            sessionStorage.setItem('docrud:talent-jd', q.trim().slice(0, 10_000));
          } catch {
            // Ignore storage failures.
          }
        } else if (q.trim()) {
          url.searchParams.set('q', q.trim());
        }
        if (category.trim()) url.searchParams.set('category', category.trim());
        if (locationFilter.trim()) url.searchParams.set('q', `${q.trim()} ${locationFilter.trim()}`.trim());
        if (activeTags.length) url.searchParams.set('tags', activeTags.join(','));
        if (activeSkills.length) url.searchParams.set('skills', activeSkills.join(','));
        if (contactFilter === 'has_contact') url.searchParams.set('hasContact', '1');
        if (mode !== 'shortlists') {
          url.searchParams.set('limit', String(pageSize));
          url.searchParams.set('offset', String(page * pageSize));
        }

        const response = await fetch(url.toString(), { signal: controller.signal, cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!active) return;
        if (!response.ok) throw new Error(payload?.error || 'Unable to load resumes.');
        const rawEntries = Array.isArray(payload.entries) ? payload.entries : [];
        // "recent" just changes client ordering; top_match uses server order.
        const sortedEntries = sortMode === 'recent'
          ? rawEntries.slice().sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          : rawEntries;
        setEntries(sortedEntries);
        setMeta(payload.meta && typeof payload.meta === 'object' ? payload.meta : null);
        setTotal(Number(payload.total || sortedEntries.length || 0));
      } catch (error) {
        if (!active) return;
        setEntries([]);
        setMeta(null);
        setTotal(0);
        setMessage(error instanceof Error ? error.message : 'Unable to load resumes.');
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }, jdMode ? 680 : 220);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [activeSkills, activeTags, category, contactFilter, jdMode, locationFilter, mode, page, pageSize, q, shortlistIds, sortMode]);

  useEffect(() => {
    setPage(0);
  }, [activeSkills, activeTags, category, contactFilter, jdMode, locationFilter, mode, q, sortMode]);

  // Lightweight refresh for "realtime-ish" updates without websockets.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetch('/api/resumes?limit=6', { cache: 'no-store' }).catch(() => undefined);
    }, 18_000);
    return () => window.clearInterval(interval);
  }, []);

  const openPublish = () => {
    if (!isAuthenticated) {
      setMessage('Login required to publish your resume.');
      return;
    }
    setPublishFeedback('');
    setPublishForm((current) => ({
      ...current,
      displayName: current.displayName || session?.user?.name || '',
      contactEmail: current.contactEmail || session?.user?.email || '',
    }));
    setPublishStep('basics');
    setPublishOpen(true);
  };

  useEffect(() => {
    if (autoPublishOpenedRef.current) return;
    const flag = searchParams?.get('publish');
    if (flag !== '1' && flag !== 'true') return;
    autoPublishOpenedRef.current = true;
    openPublish();
  }, [isAuthenticated, searchParams]);

  const publishStepOrder = useMemo(() => ([
    { id: 'basics', label: 'Basics' },
    { id: 'search', label: 'Search' },
    { id: 'resume', label: 'Resume' },
    { id: 'contact', label: 'Contact' },
    { id: 'publish', label: 'Publish' },
  ] as const), []);

  const publishStepIndex = useMemo(
    () => Math.max(0, publishStepOrder.findIndex((item) => item.id === publishStep)),
    [publishStep, publishStepOrder],
  );

  const stepBasicsOk = Boolean(publishForm.displayName.trim()) && Boolean(publishForm.category.trim());
  const stepSearchOk = true;
  const stepResumeOk = Boolean(publishForm.resumeFile) || Boolean(publishForm.pastedText.trim());
  const stepContactOk = true;
  const canAdvanceFromStep = useMemo(() => {
    if (publishStep === 'basics') return stepBasicsOk;
    if (publishStep === 'search') return stepSearchOk;
    if (publishStep === 'resume') return stepResumeOk;
    if (publishStep === 'contact') return stepContactOk;
    return true;
  }, [publishStep, stepBasicsOk, stepResumeOk]);

  const goNextPublishStep = () => {
    const next = publishStepOrder[publishStepIndex + 1];
    if (!next) return;
    setPublishStep(next.id);
  };

  const goPrevPublishStep = () => {
    const prev = publishStepOrder[publishStepIndex - 1];
    if (!prev) return;
    setPublishStep(prev.id);
  };

  const submitPublish = async () => {
    if (!isAuthenticated) {
      setPublishFeedback('Login required.');
      return;
    }
    if (!publishForm.category.trim()) {
      setPublishFeedback('Category is required.');
      return;
    }
    if (!publishForm.resumeFile && !publishForm.pastedText.trim()) {
      setPublishFeedback('Upload a resume file or paste resume text.');
      return;
    }

    setPublishBusy(true);
    setPublishFeedback('');
    try {
      const body = new FormData();
      body.append('displayName', publishForm.displayName);
      body.append('headline', publishForm.headline);
      body.append('location', publishForm.location);
      body.append('category', publishForm.category);
      body.append('tags', publishForm.tags);
      body.append('skills', publishForm.skills);
      body.append('summary', publishForm.summary);
      body.append('pastedText', publishForm.pastedText);
      body.append('visibility', publishForm.visibility);
      body.append('contactVisibility', publishForm.contactVisibility);
      body.append('contactEmail', publishForm.contactEmail);
      body.append('contactPhone', publishForm.contactPhone);
      body.append('contactLinkedin', publishForm.contactLinkedin);
      body.append('contactWebsite', publishForm.contactWebsite);
      if (publishForm.avatarFile) body.append('avatarFile', publishForm.avatarFile);
      if (publishForm.resumeFile) body.append('resumeFile', publishForm.resumeFile);

      const response = await fetch('/api/resumes', { method: 'POST', body });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'Publish failed');
      setPublishFeedback('Resume published.');
      setPublishForm((current) => ({ ...current, pastedText: '', resumeFile: null, avatarFile: null }));
      setTimeout(() => setPublishOpen(false), 650);

      // Refresh list view.
      const refresh = await fetch('/api/resumes?limit=24', { cache: 'no-store' });
      const refreshed = await refresh.json().catch(() => null);
      if (refresh.ok && refreshed) {
        setEntries(Array.isArray(refreshed.entries) ? refreshed.entries : []);
        setMeta(refreshed.meta && typeof refreshed.meta === 'object' ? refreshed.meta : null);
      }
    } catch (error) {
      setPublishFeedback(error instanceof Error ? error.message : 'Publish failed.');
    } finally {
      setPublishBusy(false);
    }
  };

  const effectiveTotal = useMemo(() => {
    if (mode === 'shortlists') {
      return shortlistModeEntries.totalFiltered ?? 0;
    }
    return total;
  }, [mode, shortlistModeEntries.totalFiltered, total]);

  const effectiveEntries = useMemo(() => {
    if (mode === 'shortlists') return shortlistModeEntries.pageEntries ?? [];
    return entries;
  }, [entries, mode, shortlistModeEntries.pageEntries]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(effectiveTotal / pageSize)), [effectiveTotal, pageSize]);

  const clearAll = () => {
    setQ('');
    setLocationFilter('');
    setCategory('');
    setActiveTags([]);
    setActiveSkills([]);
    setContactFilter('any');
    setSortMode('top_match');
  };

  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  useEffect(() => {
    try {
      setSidebarExpanded(localStorage.getItem('docrud:talent-sidebar-expanded') === '1');
    } catch {
      setSidebarExpanded(false);
    }
  }, []);

  const toggleSidebarExpanded = () => {
    setSidebarExpanded((current) => {
      const next = !current;
      try {
        localStorage.setItem('docrud:talent-sidebar-expanded', next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const sidebarGroups = useMemo(() => ([
    {
      id: 'talent',
      label: 'Talent',
      items: [
        { href: '/talent', label: 'Directory', icon: Users, active: pathnameSafe.startsWith('/talent') && !pathnameSafe.startsWith('/talent/shortlists') },
        { href: '/talent/shortlists', label: 'Shortlists', icon: Star, active: pathnameSafe === '/talent/shortlists' },
        { href: '/', label: 'Home', icon: Home, active: pathnameSafe === '/' },
        { href: '/workspace', label: 'Workspace', icon: LayoutDashboard, active: pathnameSafe === '/workspace' },
      ],
    },
    {
      id: 'build',
      label: 'Build',
      items: [
        { href: '/forms', label: 'Forms', icon: Sparkles, active: pathnameSafe === '/forms' },
        { href: '/pdf-editor', label: 'PDF Editor', icon: FileText, active: pathnameSafe === '/pdf-editor' },
        { href: '/file-directory', label: 'File Directory', icon: Folder, active: pathnameSafe === '/file-directory' },
      ],
    },
    {
      id: 'ai',
      label: 'AI',
      items: [
        { href: '/doxpert', label: 'DoXpert AI', icon: BrainCircuit, active: pathnameSafe === '/doxpert' },
        { href: '/visualizer', label: 'Visualizer AI', icon: BrainCircuit, active: pathnameSafe === '/visualizer' },
        { href: '/resume-ats', label: 'Resume ATS', icon: BadgeCheck, active: pathnameSafe === '/resume-ats' },
      ],
    },
    {
      id: 'secure',
      label: 'Secure',
      items: [
        { href: '/file-transfers', label: 'File Transfers', icon: ShieldCheck, active: pathnameSafe === '/file-transfers' },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { href: '/support', label: 'Support', icon: LifeBuoy, active: pathnameSafe === '/support' },
      ],
    },
  ]), [pathnameSafe]);

  const sidebarToneByGroupId = useMemo(() => ({
    talent: {
      iconBg: 'bg-gradient-to-br from-indigo-500/18 via-sky-500/10 to-emerald-500/16',
      iconRing: 'ring-1 ring-white/70',
      iconFg: 'text-slate-800',
    },
    build: {
      iconBg: 'bg-gradient-to-br from-fuchsia-500/16 via-amber-500/10 to-indigo-500/16',
      iconRing: 'ring-1 ring-white/70',
      iconFg: 'text-slate-800',
    },
    ai: {
      iconBg: 'bg-gradient-to-br from-cyan-500/16 via-indigo-500/10 to-fuchsia-500/16',
      iconRing: 'ring-1 ring-white/70',
      iconFg: 'text-slate-800',
    },
    secure: {
      iconBg: 'bg-gradient-to-br from-emerald-500/16 via-sky-500/10 to-indigo-500/14',
      iconRing: 'ring-1 ring-white/70',
      iconFg: 'text-slate-800',
    },
    help: {
      iconBg: 'bg-gradient-to-br from-amber-500/16 via-rose-500/10 to-fuchsia-500/14',
      iconRing: 'ring-1 ring-white/70',
      iconFg: 'text-slate-800',
    },
  } as const), []);

  // Avoid Next.js hydration mismatches from client-only state (session, pathname/search params, dialogs).
  // All hooks above still run in a stable order; we only branch for rendering here.
  if (!mounted) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.08),transparent_60%),radial-gradient(circle_at_80%_0%,rgba(245,158,11,0.06),transparent_55%)]">
        <div className="mx-auto w-full max-w-6xl px-4 py-6">
          <div className="h-12 w-56 rounded-2xl bg-white/70 shadow-sm" />
          <div className="mt-5 h-12 w-full rounded-2xl bg-white/70 shadow-sm" />
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={`talent-skel-${idx}`}
                className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.06)]"
              >
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 rounded-full bg-slate-100" />
                  <div className="flex-1">
                    <div className="h-4 w-24 rounded bg-slate-100" />
                    <div className="mt-3 h-5 w-40 rounded bg-slate-100" />
                    <div className="mt-2 h-4 w-28 rounded bg-slate-100" />
                  </div>
                </div>
                <div className="mt-4 h-16 w-full rounded bg-slate-100" />
                <div className="mt-4 h-11 w-full rounded-2xl bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(99,102,241,0.18),transparent_55%),radial-gradient(circle_at_85%_0%,rgba(34,211,238,0.16),transparent_52%),radial-gradient(circle_at_70%_80%,rgba(16,185,129,0.14),transparent_55%),linear-gradient(180deg,rgba(245,248,255,1),rgba(255,255,255,1))]">
      <div className="pointer-events-none absolute -left-24 top-20 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-indigo-400/20 via-sky-400/10 to-emerald-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 -top-16 h-[30rem] w-[30rem] rounded-full bg-gradient-to-br from-fuchsia-400/16 via-amber-400/10 to-cyan-400/14 blur-3xl" />

      <div className="relative z-10 mx-auto flex max-w-[1500px] gap-4 px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
        <div className="relative hidden shrink-0 xl:sticky xl:top-6 xl:block xl:max-h-[calc(100vh-3rem)]">
          <aside
            className={`flex flex-col overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/70 p-3 shadow-[0_16px_44px_rgba(15,23,42,0.06)] backdrop-blur-2xl ${
              sidebarExpanded ? 'w-64' : 'w-20'
            }`}
          >
          <div className={sidebarExpanded ? 'flex items-center justify-between px-1.5 py-1.5' : 'flex flex-col items-center gap-2 py-2'}>
            <button
              type="button"
              onClick={toggleSidebarExpanded}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)] transition hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              aria-label={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              title={sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {sidebarExpanded ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
            </button>

            {sidebarExpanded ? (
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.12)]">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">Talent</p>
                  <p className="truncate text-xs text-slate-500">Directory</p>
                </div>
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.12)]">
                <Users className="h-5 w-5" />
              </div>
            )}
          </div>

          <nav className={`mt-2 min-h-0 flex-1 space-y-4 overflow-y-auto pb-2 ${sidebarExpanded ? 'px-1' : 'px-0'}`}>
            {sidebarGroups.map((group) => (
              <div key={group.id} className="space-y-1">
                {sidebarExpanded ? (
                  <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                    {group.label}
                  </p>
                ) : null}
                {group.items.map((item) => (
                  <Link
                    key={`${group.id}-${item.href}`}
                    href={item.href}
                    title={item.label}
                    className={`flex items-center rounded-2xl transition ${
                      sidebarExpanded ? 'gap-3 px-3 py-2.5 text-sm font-semibold' : 'justify-center px-0 py-2'
                    } ${item.active ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.14)]' : 'text-slate-700 hover:bg-white/70'}`}
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
                        item.active
                          ? 'bg-white/10'
                          : `${sidebarToneByGroupId[group.id as keyof typeof sidebarToneByGroupId]?.iconBg || 'bg-slate-100'} ${sidebarToneByGroupId[group.id as keyof typeof sidebarToneByGroupId]?.iconRing || ''}`
                      }`}
                    >
                      <item.icon className={`h-5 w-5 ${item.active ? 'text-white' : (sidebarToneByGroupId[group.id as keyof typeof sidebarToneByGroupId]?.iconFg || 'text-slate-700')}`} />
                    </div>
                    {sidebarExpanded ? (
                      <span className="truncate">{item.label}</span>
                    ) : (
                      <span className="sr-only">{item.label}</span>
                    )}
                  </Link>
                ))}
              </div>
            ))}

            <div className="pt-1">
              <button
                type="button"
                onClick={openPublish}
                title="Publish resume"
                className={`flex w-full items-center rounded-2xl bg-slate-950 text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)] transition hover:bg-slate-900 ${
                  sidebarExpanded ? 'gap-3 px-3 py-2.5 text-sm font-semibold' : 'justify-center px-0 py-2.5'
                }`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                  <Mail className="h-5 w-5 text-white" />
                </div>
                {sidebarExpanded ? <span className="truncate">Publish resume</span> : <span className="sr-only">Publish resume</span>}
              </button>
            </div>
          </nav>

          <div className={`mt-auto border-t border-slate-200/70 pt-3 ${sidebarExpanded ? 'px-1' : 'px-0'}`}>
            <div className={`flex items-center rounded-2xl border border-slate-200/70 bg-white/70 p-2 ${sidebarExpanded ? 'gap-3' : 'justify-center'}`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                {((uiSession?.user?.name || uiSession?.user?.email || 'U') as string).slice(0, 1).toUpperCase()}
              </div>
              {sidebarExpanded ? (
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">{uiSession?.user?.name || 'Workspace'}</p>
                  <p className="truncate text-xs text-slate-500">{uiSession?.user?.email || 'Guest'}</p>
                </div>
              ) : null}
            </div>
          </div>
          </aside>
        </div>

        <main className="min-w-0 flex-1 pb-24 lg:pb-0">
          {/* Mobile header (match reference UI) */}
          <div className="lg:hidden">
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <h1 className="text-lg font-semibold tracking-[-0.03em] text-slate-950">
                {mode === 'shortlists' ? 'Shortlists' : 'Talent Directory'}
              </h1>
              <button
                type="button"
                onClick={openPublish}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.18)]"
                aria-label="Publish resume"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by skills, roles, tags… or paste a JD"
                  className="h-12 w-full rounded-2xl border border-white/60 bg-white/80 pl-11 pr-4 text-sm font-medium text-slate-900 shadow-[0_14px_34px_rgba(15,23,42,0.05)] outline-none placeholder:text-slate-500 focus:border-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-200/60"
                />
              </div>
              <button
                type="button"
                onClick={() => setFiltersOpen((c) => !c)}
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/60 bg-white/80 px-4 text-sm font-semibold text-slate-700 shadow-[0_14px_34px_rgba(15,23,42,0.05)]"
              >
                <Filter className="h-4 w-4" />
                Filters
              </button>
            </div>

            <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
              {['All', ...metaCategories.slice(0, 5)].map((item) => {
                const active = (item === 'All' ? category === '' : category === item);
                return (
                  <button
                    key={`mobile-cat-${item}`}
                    type="button"
                    onClick={() => setCategory(item === 'All' ? '' : item)}
                    className={`shrink-0 rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.16)]'
                        : 'border border-white/60 bg-white/70 text-slate-700 shadow-sm hover:bg-white/85'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
              {metaCategories.length > 5 ? (
                <select
                  value={metaCategories.includes(category) ? category : ''}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-10 shrink-0 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none"
                >
                  <option value="">More</option>
                  {metaCategories.slice(5).map((cat) => (
                    <option key={`mobile-cat-more-${cat}`} value={cat}>{cat}</option>
                  ))}
                </select>
              ) : null}
            </div>

            {/* Mobile: keep layout simple; no view toggle or sort bar */}
          </div>

          <div className="hidden rounded-[1.7rem] border border-white/60 bg-white/70 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur-2xl sm:p-6 lg:block">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.04em] text-slate-950">
                  {mode === 'shortlists' ? 'Shortlists' : 'Talent Directory'}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  {mode === 'shortlists'
                    ? 'Your saved candidates, ready for follow-up.'
                    : 'Discover and connect with top talent across the organization.'}
                </p>
              </div>
              <Button
                type="button"
                className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)] hover:bg-slate-900"
                onClick={openPublish}
              >
                <Plus className="mr-2 h-4 w-4" />
                Publish resume
              </Button>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search by skills, roles, tags… or paste a JD to match candidates"
                  className="h-11 w-full rounded-xl border border-white/60 bg-white/80 pl-11 pr-16 text-sm font-medium text-slate-900 shadow-[0_14px_34px_rgba(15,23,42,0.05)] outline-none placeholder:text-slate-500 focus:border-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-200/60"
                />
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">
                  ⌘ K
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-xl border-white/60 bg-white/80 text-sm font-semibold text-slate-700 shadow-[0_14px_34px_rgba(15,23,42,0.05)] hover:bg-white"
                onClick={() => setFiltersOpen((c) => !c)}
              >
                <Filter className="mr-2 h-4 w-4" />
                Filters
              </Button>

              <Button type="button" variant="outline" className="h-11 rounded-xl border-white/60 bg-white/80 px-3 text-slate-700 shadow-[0_14px_34px_rgba(15,23,42,0.05)] hover:bg-white" aria-label="Saved" asChild>
                <Link href="/workspace?tab=talent-leads">
                <Bookmark className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategory('')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  !category
                    ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.16)]'
                    : 'border border-white/60 bg-white/70 text-slate-700 shadow-sm hover:bg-white/85'
                }`}
              >
                All
              </button>
              {metaCategories.slice(0, 11).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    category === item
                      ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.16)]'
                      : 'border border-white/60 bg-white/70 text-slate-700 shadow-sm hover:bg-white/85'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            {filtersOpen ? (
              <div className="mt-4 rounded-[1.25rem] border border-white/60 bg-white/75 p-4 shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
                <div className="grid gap-3 lg:grid-cols-5">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500">Role</p>
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search role/title"
                      className="h-10 rounded-xl border-white/60 bg-white/80 text-sm font-medium text-slate-900 placeholder:text-slate-500 focus-visible:ring-indigo-200/60"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500">Location</p>
                    <Input
                      value={locationFilter}
                      onChange={(e) => setLocationFilter(e.target.value)}
                      placeholder="All locations"
                      className="h-10 rounded-xl border-white/60 bg-white/80 text-sm font-medium text-slate-900 placeholder:text-slate-500 focus-visible:ring-indigo-200/60"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500">Category</p>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="h-10 w-full rounded-xl border border-white/60 bg-white/80 px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200/60"
                    >
                      <option value="">All categories</option>
                      {metaCategories.map((cat) => (
                        <option key={`cat-${cat}`} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500">Contact</p>
                    <select
                      value={contactFilter}
                      onChange={(e) => setContactFilter(e.target.value === 'has_contact' ? 'has_contact' : 'any')}
                      className="h-10 w-full rounded-xl border border-white/60 bg-white/80 px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200/60"
                    >
                      <option value="any">Any</option>
                      <option value="has_contact">Has contact</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-500">Sort</p>
                    <select
                      value={sortMode}
                      onChange={(e) => setSortMode(e.target.value === 'recent' ? 'recent' : 'top_match')}
                      className="h-10 w-full rounded-xl border border-white/60 bg-white/80 px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:ring-2 focus:ring-indigo-200/60"
                    >
                      <option value="top_match">Top match</option>
                      <option value="recent">Most recent</option>
                    </select>
                  </div>
                </div>

               
              </div>
            ) : null}
          </div>

          <div className="mt-5 hidden flex-wrap items-center justify-between gap-3 px-1 lg:flex">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold text-slate-950">{effectiveTotal.toLocaleString()} candidates</p>
             
            </div>
            <div className="flex items-center gap-2">
             
              <div className="flex h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                <button type="button" className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white">▦</button>
                <button type="button" className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">≡</button>
              </div>
            </div>
          </div>

          <section className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {loading ? (
              Array.from({ length: 8 }).map((_, idx) => (
                <div key={`resume-skel-${idx}`} className="rounded-[22px] border border-white/60 bg-white/75 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-slate-100" />
                    <div className="flex-1">
                      <div className="h-4 w-28 rounded bg-slate-100" />
                      <div className="mt-2 h-3 w-36 rounded bg-slate-100" />
                    </div>
                  </div>
                  <div className="mt-4 h-12 w-full rounded bg-slate-100" />
                  <div className="mt-4 h-10 w-full rounded bg-slate-100" />
                </div>
              ))
            ) : effectiveEntries.length ? (
              effectiveEntries.map((entry) => {
                const expLabel = deriveExperienceLabel(entry);
                const shortlisted = shortlistIds.includes(entry.id);
                const shownSkillsDesktop = entry.skills.slice(0, 4);
                const extraSkillsDesktop = Math.max(0, entry.skills.length - shownSkillsDesktop.length);
                const shownSkillsMobile = entry.skills.slice(0, 5);
                const extraSkillsMobile = Math.max(0, entry.skills.length - shownSkillsMobile.length);

                return (
                  <article
                    key={entry.id}
                    className="min-w-0 rounded-[22px] border border-white/60 bg-white/75 p-4 shadow-[0_18px_52px_rgba(15,23,42,0.07)] backdrop-blur-2xl transition hover:-translate-y-[1px] hover:shadow-[0_22px_64px_rgba(15,23,42,0.09)] sm:p-5"
                  >
                    <header className="flex items-start gap-3">
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-[linear-gradient(135deg,rgba(37,99,235,0.18),rgba(168,85,247,0.16))]">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_35%_28%,rgba(255,255,255,0.92),transparent_60%)]" />
                        {entry.avatarDataUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={entry.avatarDataUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        ) : null}
                        <div className="relative flex h-full w-full items-center justify-center text-[14px] font-semibold text-slate-900">
                          {!entry.avatarDataUrl ? String(entry.displayName || 'T').trim().slice(0, 1).toUpperCase() : null}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Open to work
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleShortlist(entry.id)}
                            className="h-10 w-10 rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-[0_8px_20px_rgba(15,23,42,0.04)] hover:bg-slate-50"
                            aria-label={shortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
                            title={shortlisted ? 'Shortlisted' : 'Add to shortlist'}
                          >
                            <Bookmark className={`mx-auto h-5 w-5 ${shortlisted ? 'fill-slate-950 text-slate-950' : ''}`} />
                          </button>
                        </div>

                        <p className="mt-3 truncate text-[18px] font-semibold leading-6 text-slate-950">
                          {entry.displayName}
                        </p>
                        <p className="mt-1 truncate text-sm font-medium text-slate-600">
                          {entry.headline || entry.category}
                        </p>
                      </div>
                    </header>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 sm:text-xs">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        <span className="truncate">{entry.location || 'Remote'}</span>
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="truncate">{entry.category}</span>
                      {expLabel ? (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="truncate">{expLabel}</span>
                        </>
                      ) : null}
                    </div>

                    {/* Desktop summary */}
                    <p className="mt-3 hidden line-clamp-4 text-sm leading-6 text-slate-600 sm:block">
                      {entry.summary || 'Strong profile ready for real projects. Open the profile to see skills and resume preview.'}
                    </p>

                    {/* Mobile summary (match reference density) */}
                    <p className="mt-3 line-clamp-4 text-[13px] leading-6 text-slate-600 sm:hidden">
                      {entry.summary || 'Strong profile ready for real projects. Open the profile to see skills and resume preview.'}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2 sm:hidden">
                      {shownSkillsMobile.map((skill) => (
                        <span key={`${entry.id}-m-${skill}`} className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-700">
                          {skill}
                        </span>
                      ))}
                      {extraSkillsMobile ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-700">+{extraSkillsMobile}</span>
                      ) : null}
                    </div>

                    {/* Desktop: richer but still compact */}
                    <div className="mt-4 hidden sm:flex sm:flex-wrap sm:gap-2">
                      {shownSkillsDesktop.map((skill) => (
                        <span key={`${entry.id}-d-${skill}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                          {skill}
                        </span>
                      ))}
                      {extraSkillsDesktop ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">+{extraSkillsDesktop}</span>
                      ) : null}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
                      <Button
                        asChild
                        type="button"
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-[14px] font-semibold text-slate-700 shadow-[0_10px_26px_rgba(15,23,42,0.04)] hover:bg-slate-50"
                      >
                        <Link href={`/talent/${entry.slug}#contact`} className="inline-flex min-w-0 items-center justify-center gap-2 whitespace-nowrap">
                          <Mail className="h-4 w-4 shrink-0" />
                          <span className="truncate">Message</span>
                        </Link>
                      </Button>
                      <Button
                        asChild
                        type="button"
                        className="h-11 rounded-2xl bg-slate-950 px-3 text-[14px] font-semibold text-white shadow-[0_14px_34px_rgba(2,6,23,0.22)] hover:bg-slate-900"
                      >
                        <Link href={`/talent/${entry.slug}`} className="inline-flex min-w-0 items-center justify-center whitespace-nowrap">
                          <span className="truncate">View profile</span>
                        </Link>
                      </Button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                No public resumes found for this filter.
              </div>
            )}
          </section>

         <div className="mt-6 flex items-center justify-center gap-2 pb-10">
  <button
    type="button"
    className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
    onClick={() => setPage((c) => Math.max(0, c - 1))}
    disabled={page <= 0}
    aria-label="Previous page"
  >
    ‹
  </button>

  <div className="flex items-center gap-1">
    {(() => {
      const visiblePages = Math.min(5, totalPages);

      let start = Math.max(0, page - Math.floor(visiblePages / 2));
      let end = start + visiblePages;

      if (end > totalPages) {
        end = totalPages;
        start = Math.max(0, end - visiblePages);
      }

      return Array.from({ length: end - start }, (_, idx) => start + idx).map((p) => {
        const active = p === page;

        return (
          <button
            key={`page-${p}`}
            type="button"
            onClick={() => setPage(p)}
            className={`h-10 w-10 rounded-xl text-sm font-semibold ${
              active
                ? "bg-slate-950 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {p + 1}
          </button>
        );
      });
    })()}
  </div>

  <button
    type="button"
    className="h-10 w-10 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
    onClick={() => setPage((c) => Math.min(totalPages - 1, c + 1))}
    disabled={page >= totalPages - 1}
    aria-label="Next page"
  >
    ›
  </button>
</div>
          {message ? (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              {message}
            </div>
          ) : null}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/85 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[540px] items-center justify-between px-6 py-3 text-xs font-semibold text-slate-600">
          <Link href="/talent" className={`flex flex-col items-center gap-1 ${pathname === '/talent' ? 'text-blue-600' : ''}`}>
            <Users className="h-5 w-5" />
            Directory
          </Link>
          <Link href="/talent/shortlists" className={`flex flex-col items-center gap-1 ${pathname === '/talent/shortlists' ? 'text-blue-600' : ''}`}>
            <Star className="h-5 w-5" />
            Shortlists
          </Link>
          <Link href="/workspace?tab=dashboard" className="flex flex-col items-center gap-1">
            <LayoutDashboard className="h-5 w-5" />
            Dashboard
          </Link>
          <Link href="/workspace?tab=profile" className="flex flex-col items-center gap-1">
            <User className="h-5 w-5" />
            Profile
          </Link>
        </div>
      </div>

      {/* Mobile drawer */}
      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent className="cloud-panel w-[min(92vw,22rem)] overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/90 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <div className="border-b border-white/60 px-5 pb-4 pt-5">
              <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-slate-950">
                Talent
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-600">Navigate directory, shortlists, and dashboard.</p>
            </div>
          </DialogHeader>
          <div className="px-5 py-4">
            <div className="grid gap-2">
              <Link onClick={() => setMobileNavOpen(false)} href="/talent" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800">
                <Users className="h-4 w-4 text-slate-500" />
                Directory
              </Link>
              <Link onClick={() => setMobileNavOpen(false)} href="/talent/shortlists" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800">
                <Star className="h-4 w-4 text-slate-500" />
                Shortlists
              </Link>
              <Link onClick={() => setMobileNavOpen(false)} href="/workspace?tab=dashboard" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-800">
                <LayoutDashboard className="h-4 w-4 text-slate-500" />
                Dashboard
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  openPublish();
                }}
                className="flex items-center gap-3 rounded-xl bg-slate-950 px-3 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)]"
              >
                <Plus className="h-4 w-4" />
                Publish resume
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="cloud-panel flex max-h-[90vh] w-[min(96vw,48rem)] flex-col overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/80 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <div className="border-b border-white/60 bg-[radial-gradient(circle_at_15%_20%,rgba(99,102,241,0.16),transparent_55%),radial-gradient(circle_at_85%_0%,rgba(34,211,238,0.14),transparent_52%)] px-5 pb-4 pt-5">
              <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-slate-950">
                Publish resume
              </DialogTitle>
              <p className="mt-1 text-sm text-slate-600">
                Step through the basics, add searchable skills, then upload your resume for OCR.
              </p>

              <div className="mt-4">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 [-webkit-overflow-scrolling:touch]">
                  {publishStepOrder.map((step, idx) => {
                    const active = step.id === publishStep;
                    const done = idx < publishStepIndex;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => setPublishStep(step.id)}
                        className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-4 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${
                          active
                            ? 'bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.16)]'
                            : done
                              ? 'bg-white/70 text-slate-700 hover:bg-white hover:text-slate-950'
                              : 'bg-white/55 text-slate-600 hover:bg-white hover:text-slate-950'
                        }`}
                      >
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                          active ? 'bg-white/12 text-white' : 'bg-slate-950/8 text-slate-700'
                        }`}>
                          {idx + 1}
                        </span>
                        {step.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/60">
                  <div
                    className="h-1.5 rounded-full bg-slate-950 transition-[width]"
                    style={{ width: `${Math.round(((publishStepIndex + 1) / publishStepOrder.length) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {publishStep === 'basics' ? (
              <div className="grid gap-3">
                <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Profile photo (optional)</p>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-white/70 bg-white/70 shadow-sm">
                      {publishAvatarPreview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={publishAvatarPreview} alt="Profile preview" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-700">
                          {publishForm.displayName.trim().slice(0, 1).toUpperCase() || 'U'}
                        </div>
                      )}
                    </div>
                    <div className="min-w-[240px] flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setPublishForm((c) => ({ ...c, avatarFile: file }));
                        }}
                        className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-900"
                      />
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        PNG/JPG recommended. Keep it under 512 KB for fastest loading.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Display name</label>
                    <Input value={publishForm.displayName} onChange={(e) => setPublishForm((c) => ({ ...c, displayName: e.target.value }))} placeholder="Your name" />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Headline</label>
                    <Input value={publishForm.headline} onChange={(e) => setPublishForm((c) => ({ ...c, headline: e.target.value }))} placeholder="Role + focus (1 line)" />
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Location</label>
                    <Input value={publishForm.location} onChange={(e) => setPublishForm((c) => ({ ...c, location: e.target.value }))} placeholder="City, remote, timezone" />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Category</label>
                    <select
                      value={publishForm.category}
                      onChange={(e) => setPublishForm((c) => ({ ...c, category: e.target.value }))}
                      className="h-10 rounded-full border border-white/70 bg-white/70 px-4 text-sm font-semibold text-slate-800 outline-none backdrop-blur-2xl"
                    >
                      {metaCategories.map((cat) => (
                        <option key={`publish-cat-${cat}`} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Short summary</label>
                  <Input value={publishForm.summary} onChange={(e) => setPublishForm((c) => ({ ...c, summary: e.target.value }))} placeholder="What you do best (2 lines max)" />
                </div>

                {!stepBasicsOk ? (
                  <div className="rounded-[1.1rem] border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
                    Add your display name to continue.
                  </div>
                ) : null}
              </div>
            ) : null}

            {publishStep === 'search' ? (
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Skills (comma separated)</label>
                  <Input value={publishForm.skills} onChange={(e) => setPublishForm((c) => ({ ...c, skills: e.target.value }))} placeholder="React, SQL, Figma..." />
                  <p className="text-xs leading-5 text-slate-500">These help recruiters filter your profile.</p>
                </div>
                <div className="grid gap-1">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Search tags (comma separated)</label>
                  <Input value={publishForm.tags} onChange={(e) => setPublishForm((c) => ({ ...c, tags: e.target.value }))} placeholder="fintech, b2b, ops..." />
                  <p className="text-xs leading-5 text-slate-500">Use tags for domain, industry, and niche keywords.</p>
                </div>
              </div>
            ) : null}

            {publishStep === 'resume' ? (
              <div className="grid gap-3">
                <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Resume upload (OCR supported)</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => setPublishForm((c) => ({ ...c, resumeFile: e.target.files?.[0] || null }))}
                      className="text-sm"
                    />
                    <select
                      value={publishForm.visibility}
                      onChange={(e) => setPublishForm((c) => ({ ...c, visibility: e.target.value === 'private' ? 'private' : 'public' }))}
                      className="h-10 rounded-full border border-white/70 bg-white/70 px-4 text-sm font-semibold text-slate-800 outline-none backdrop-blur-2xl"
                    >
                      <option value="public">Public listing</option>
                      <option value="private">Private (not listed)</option>
                    </select>
                  </div>
                  <textarea
                    value={publishForm.pastedText}
                    onChange={(e) => setPublishForm((c) => ({ ...c, pastedText: e.target.value }))}
                    placeholder="Optional: paste resume text for higher-confidence parsing, or if the PDF is scanned."
                    className="mt-3 h-28 w-full resize-none rounded-[1.1rem] border border-white/70 bg-white/70 px-3 py-2 text-sm text-slate-900 outline-none backdrop-blur-2xl placeholder:text-slate-500 focus:border-slate-300"
                  />
                </div>
                {!stepResumeOk ? (
                  <div className="rounded-[1.1rem] border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
                    Upload a resume file or paste resume text to continue.
                  </div>
                ) : null}
              </div>
            ) : null}

            {publishStep === 'contact' ? (
              <div className="grid gap-3">
                <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Contact (optional)</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Input value={publishForm.contactEmail} onChange={(e) => setPublishForm((c) => ({ ...c, contactEmail: e.target.value }))} placeholder="Email" />
                    <Input value={publishForm.contactPhone} onChange={(e) => setPublishForm((c) => ({ ...c, contactPhone: e.target.value }))} placeholder="Phone" />
                    <Input value={publishForm.contactLinkedin} onChange={(e) => setPublishForm((c) => ({ ...c, contactLinkedin: e.target.value }))} placeholder="LinkedIn URL" />
                    <Input value={publishForm.contactWebsite} onChange={(e) => setPublishForm((c) => ({ ...c, contactWebsite: e.target.value }))} placeholder="Website/portfolio URL" />
                  </div>
                  <div className="mt-3 grid gap-1">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Who can see contact?</label>
                    <select
                      value={publishForm.contactVisibility}
                      onChange={(e) => setPublishForm((c) => ({ ...c, contactVisibility: e.target.value as any }))}
                      className="h-10 rounded-full border border-white/70 bg-white/70 px-4 text-sm font-semibold text-slate-800 outline-none backdrop-blur-2xl"
                    >
                      <option value="members">Only logged-in users</option>
                      <option value="public">Anyone</option>
                      <option value="hidden">Hide (no contact)</option>
                    </select>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    We only publish contact if you provide it. Logged-in-only contact is recommended.
                  </p>
                </div>
              </div>
            ) : null}

            {publishStep === 'publish' ? (
              <div className="grid gap-3">
                <div className="rounded-[1.2rem] border border-white/70 bg-white/70 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Review</p>
                  <div className="mt-3 grid gap-2 text-sm text-slate-700">
                    <p><span className="font-semibold text-slate-900">Name:</span> {publishForm.displayName || '—'}</p>
                    <p><span className="font-semibold text-slate-900">Category:</span> {publishForm.category || '—'}</p>
                    <p><span className="font-semibold text-slate-900">Visibility:</span> {publishForm.visibility === 'private' ? 'Private' : 'Public'}</p>
                    <p><span className="font-semibold text-slate-900">Resume:</span> {publishForm.resumeFile?.name || (publishForm.pastedText.trim() ? 'Pasted text' : '—')}</p>
                  </div>
                </div>
                {!stepBasicsOk || !stepResumeOk ? (
                  <div className="rounded-[1.1rem] border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900">
                    Complete required steps (Basics + Resume) before publishing.
                  </div>
                ) : null}
              </div>
            ) : null}

            {publishFeedback ? (
              <div className={`mt-3 rounded-[1.1rem] px-3 py-2 text-sm ${publishFeedback.includes('published') ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
                {publishFeedback}
              </div>
            ) : null}
          </div>

          <div className="border-t border-white/60 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-500">
                Step {publishStepIndex + 1} of {publishStepOrder.length}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" className="rounded-full bg-slate-950 text-white hover:bg-slate-900" onClick={() => setPublishOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="rounded-full bg-slate-950 text-white hover:bg-slate-900"
                  onClick={goPrevPublishStep}
                  disabled={publishStepIndex === 0}
                >
                  Back
                </Button>
                {publishStep !== 'publish' ? (
                  <Button
                    type="button"
                    className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                    onClick={goNextPublishStep}
                    disabled={!canAdvanceFromStep}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    type="button"
                    className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                    disabled={publishBusy || !stepBasicsOk || !stepResumeOk}
                    onClick={submitPublish}
                  >
                    {publishBusy ? 'Publishing…' : 'Publish'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
