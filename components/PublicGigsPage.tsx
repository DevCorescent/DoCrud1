'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchTracker, SEARCH_CONTEXTS } from '@/lib/search-tracking';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Briefcase as BriefcaseBusiness,
  Filter,
  Home,
  MapPin,
  Loader2,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
} from 'lucide-react';
import type { GigListing, LandingSettings } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface PublicGigsPageProps {
  settings: LandingSettings;
  softwareName: string;
  accentLabel: string;
  initialGigs: GigListing[];
  categories: string[];
  interests: string[];
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function getCategoryTone(_category: string) {
  return {
    pill: '',
    chip: '',
    glow: '',
  };
}

function isGigUrgent(gig: GigListing) {
  const untilValue = (gig as any).urgentUntil || (gig as any).featuredUntil;
  if (untilValue) {
    const until = new Date(untilValue);
    return Number.isFinite(until.getTime()) && until.getTime() > Date.now();
  }
  return Boolean((gig as any).urgent ?? (gig as any).featured);
}

function isGigNew(gig: GigListing) {
  const updatedAt = new Date(gig.updatedAt);
  if (Number.isNaN(updatedAt.getTime())) return false;
  return Date.now() - updatedAt.getTime() < 1000 * 60 * 60 * 24 * 3;
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

export default function PublicGigsPage({
  settings,
  softwareName,
  accentLabel,
  initialGigs,
  categories,
  interests,
}: PublicGigsPageProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const uiAuthenticated = mounted && isAuthenticated;

  const [gigs, setGigs] = useState<GigListing[]>(initialGigs);
  const [availableCategories, setAvailableCategories] = useState<string[]>(categories);
  const [availableInterests, setAvailableInterests] = useState<string[]>(interests);
  const [query, setQuery] = useState('');
  const trackSearch = useSearchTracker(SEARCH_CONTEXTS.PUBLIC_GIGS);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [activeInterest, setActiveInterest] = useState('All');
  const [visibility, setVisibility] = useState<'all' | 'public' | 'private'>('all');
  const [locationFilters, setLocationFilters] = useState<Array<GigListing['locationPreference']>>([]);
  const [engagementFilters, setEngagementFilters] = useState<Array<GigListing['engagementType']>>([]);
  const [sortBy, setSortBy] = useState<'newest' | 'replies'>('newest');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [navMode, setNavMode] = useState<'explore' | 'saved'>('explore');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const [connectTarget, setConnectTarget] = useState<GigListing | null>(null);
  const [connectNote, setConnectNote] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [shareToast, setShareToast] = useState('');

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<number | null>(null);
  const seenGigIdsRef = useRef<Set<string>>(new Set());
  const hasHydratedRef = useRef(false);
  const feedTopRef = useRef<HTMLDivElement | null>(null);
  const [savedGigIds, setSavedGigIds] = useState<string[]>([]);
  const [gigToastQueue, setGigToastQueue] = useState<GigListing[]>([]);
  const [activeGigToast, setActiveGigToast] = useState<GigListing | null>(null);
  const [toastLeaving, setToastLeaving] = useState(false);
  const PAGE_SIZE = 12;

  const readSavedGigIds = () => {
    try {
      const raw = window.localStorage.getItem('docrud:gigs:saved');
      const next = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(next) ? next.filter((id) => typeof id === 'string') as string[] : [];
    } catch {
      return [];
    }
  };

  const writeSavedGigIds = (ids: string[]) => {
    const safe = Array.from(new Set(ids.filter((v) => typeof v === 'string' && v.trim()))).slice(0, 500);
    window.localStorage.setItem('docrud:gigs:saved', JSON.stringify(safe));
    return safe;
  };

  const toggleSavedGig = (gigId: string) => {
    try {
      const stored = readSavedGigIds();
      const next = stored.includes(gigId) ? stored.filter((id) => id !== gigId) : [gigId, ...stored];
      const safe = writeSavedGigIds(next);
      setSavedGigIds(safe);
      return safe.includes(gigId);
    } catch {
      setSavedGigIds((current) => current.includes(gigId) ? current.filter((id) => id !== gigId) : [gigId, ...current]);
      return false;
    }
  };

  useEffect(() => {
    const closeStream = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const stopPolling = () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    const applyPayload = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const record = payload as Record<string, unknown>;
      const nextGigs = Array.isArray(record.discoverListings)
        ? record.discoverListings
        : Array.isArray(record.gigs)
          ? record.gigs
          : [];

      const normalized = (nextGigs as GigListing[]) || [];
      setGigs(normalized);

      // Desktop-only toast queue: show newly added gigs after the first hydration.
      if (!hasHydratedRef.current) {
        hasHydratedRef.current = true;
        seenGigIdsRef.current = new Set(normalized.map((gig) => gig.id));
      } else {
        const newOnes = normalized.filter((gig) => !seenGigIdsRef.current.has(gig.id));
        if (newOnes.length) {
          newOnes.forEach((gig) => seenGigIdsRef.current.add(gig.id));
          setGigToastQueue((current) => [...current, ...newOnes.slice(0, 5)]);
        }
      }

      if (Array.isArray(record.categories)) setAvailableCategories(record.categories as string[]);
      if (Array.isArray(record.interests)) setAvailableInterests(record.interests as string[]);
    };

    const startPolling = () => {
      stopPolling();

      const load = async () => {
        try {
          const endpoint = isAuthenticated ? '/api/gigs' : '/api/public/gigs';
          const response = await fetch(endpoint, { cache: 'no-store' });
          const payload = response.ok ? await response.json() : null;
          applyPayload(payload);
        } catch {
          // ignore
        }
      };

      void load();
      pollingRef.current = window.setInterval(() => void load(), 15000);
    };

    closeStream();
    stopPolling();

    // Prefer stream for realtime updates; fall back to polling when blocked.
    try {
      const endpoint = isAuthenticated ? '/api/gigs/stream' : '/api/public/gigs/stream';
      const es = new EventSource(endpoint);
      eventSourceRef.current = es;

      es.addEventListener('gigs', (event) => {
        const messageEvent = event as MessageEvent<string>;
        try {
          applyPayload(JSON.parse(messageEvent.data));
        } catch {
          // ignore
        }
      });

      es.addEventListener('error', () => {
        closeStream();
        startPolling();
      });
    } catch {
      startPolling();
    }

    return () => {
      closeStream();
      stopPolling();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (activeGigToast || gigToastQueue.length === 0) return;
    setActiveGigToast(gigToastQueue[0]);
    setGigToastQueue((current) => current.slice(1));
    setToastLeaving(false);
  }, [activeGigToast, gigToastQueue]);

  useEffect(() => {
    if (!activeGigToast) return;
    const timer = window.setTimeout(() => {
      setToastLeaving(true);
      window.setTimeout(() => {
        setActiveGigToast(null);
        setToastLeaving(false);
      }, 240);
    }, 4200);
    return () => window.clearTimeout(timer);
  }, [activeGigToast]);

  useEffect(() => {
    if (!shareToast) return;
    const timer = window.setTimeout(() => setShareToast(''), 2200);
    return () => window.clearTimeout(timer);
  }, [shareToast]);

  useEffect(() => {
    setSavedGigIds(readSavedGigIds());
  }, []);

  useEffect(() => {
    const sync = () => {
      setSavedGigIds(readSavedGigIds());
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'docrud:gigs:saved') sync();
    };

    const onFocus = () => sync();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const savedGigIdSet = useMemo(() => new Set(savedGigIds), [savedGigIds]);

  const filteredGigs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return gigs.filter((gig) => {
      const matchesNavMode = navMode !== 'saved' || savedGigIdSet.has(gig.id);
      const matchesVisibility = visibility === 'all' || gig.visibility === visibility;
      const matchesCategory = categoryFilters.length === 0 || categoryFilters.includes(gig.category);
      const matchesInterest = activeInterest === 'All' || gig.interests.includes(activeInterest);
      const matchesLocation = locationFilters.length === 0 || locationFilters.includes(gig.locationPreference);
      const matchesEngagement = engagementFilters.length === 0 || engagementFilters.includes(gig.engagementType);
      const haystack = `${gig.title} ${gig.summary} ${gig.category} ${gig.interests.join(' ')} ${gig.skills.join(' ')}`.toLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      return matchesNavMode && matchesVisibility && matchesCategory && matchesInterest && matchesLocation && matchesEngagement && matchesQuery;
    });
  }, [activeInterest, categoryFilters, engagementFilters, gigs, locationFilters, navMode, query, savedGigIdSet, visibility]);

  const categoryFiltersKey = useMemo(() => categoryFilters.join(','), [categoryFilters]);
  const locationFiltersKey = useMemo(() => locationFilters.join(','), [locationFilters]);
  const engagementFiltersKey = useMemo(() => engagementFilters.join(','), [engagementFilters]);

  useEffect(() => {
    setPage(1);
    if (query.trim()) trackSearch(query, filteredGigs.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInterest, categoryFiltersKey, engagementFiltersKey, locationFiltersKey, navMode, query, sortBy, visibility]);

  const sortedGigs = useMemo(() => {
    const list = [...filteredGigs];
    if (sortBy === 'replies') {
      list.sort((a, b) => (b.connectCount || 0) - (a.connectCount || 0) || +new Date(b.updatedAt) - +new Date(a.updatedAt));
      return list;
    }
    list.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    return list;
  }, [filteredGigs, sortBy]);

  const [urgentGigs, standardGigs] = useMemo(() => {
    const urgent: GigListing[] = [];
    const standard: GigListing[] = [];
    for (const gig of sortedGigs) {
      (isGigUrgent(gig) ? urgent : standard).push(gig);
    }
    return [urgent, standard];
  }, [sortedGigs]);

  const totalCount = sortedGigs.length;
  const totalPages = Math.max(1, Math.ceil(standardGigs.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIndex = standardGigs.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(standardGigs.length, safePage * PAGE_SIZE);
  const pageItems = standardGigs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const appliedFilterCount = useMemo(() => {
    let count = 0;
    if (query.trim()) count += 1;
    if (visibility !== 'all') count += 1;
    if (activeInterest !== 'All') count += 1;
    if (categoryFilters.length) count += 1;
    if (locationFilters.length) count += 1;
    if (engagementFilters.length) count += 1;
    return count;
  }, [activeInterest, categoryFilters.length, engagementFilters.length, locationFilters.length, query, visibility]);

  const featuredOrganizations = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const gig of sortedGigs) {
      const name = (gig.organizationName || gig.ownerName || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(name);
      if (list.length >= 7) break;
    }
    return list;
  }, [sortedGigs]);

  const recommendedGigs = useMemo(() => sortedGigs.filter((gig) => gig.visibility !== 'private').slice(0, 5), [sortedGigs]);

  const popularChips = useMemo(() => {
    const chips = [
      ...availableCategories.slice(0, 2),
      ...availableInterests.slice(0, 4),
    ].filter(Boolean);
    return Array.from(new Set(chips)).slice(0, 6);
  }, [availableCategories, availableInterests]);

  const categorySpotlights = useMemo(() => {
    const grouped = new Map<string, GigListing[]>();
    for (const gig of sortedGigs) {
      if (gig.status !== 'published') continue;
      const category = (gig.category || 'General').trim() || 'General';
      grouped.set(category, [...(grouped.get(category) || []), gig]);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => (b[1].length - a[1].length) || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([category, gigs]) => ({ category, gigs: gigs.slice(0, 4) }));
  }, [sortedGigs]);

  const toggleCategoryChip = (category: string) => {
    setCategoryFilters((current) => (current.length === 1 && current[0] === category ? [] : [category]));
  };

  const jumpToFeed = () => {
    // Keep category jumps feeling instant without depending on router navigation.
    requestAnimationFrame(() => {
      feedTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const clearAllFilters = () => {
    setQuery('');
    setVisibility('all');
    setActiveInterest('All');
    setCategoryFilters([]);
    setLocationFilters([]);
    setEngagementFilters([]);
    setSortBy('newest');
  };

  const FiltersPanel = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-[-0.02em] text-slate-950">All filters</p>
          <p className="mt-1 text-xs text-slate-500">{appliedFilterCount ? `Applied (${appliedFilterCount})` : 'No filters applied'}</p>
        </div>
        <Button type="button" variant="outline" className="h-9 rounded-full border-0 bg-white/80 px-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_14px_34px_rgba(15,23,42,0.06)] backdrop-blur-2xl" onClick={clearAllFilters} disabled={!appliedFilterCount}>
          Clear
        </Button>
      </div>

      <div className="rounded-[1.55rem] border border-white/0 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.74))] p-4 shadow-[0_18px_46px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Category</p>
        <div className="mt-3 space-y-2">
          {availableCategories.slice(0, 10).map((category) => (
            <label key={category} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={categoryFilters.includes(category)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setCategoryFilters((current) => checked ? Array.from(new Set([...current, category])) : current.filter((item) => item !== category));
                  }}
                />
                {category}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-[1.55rem] border border-white/0 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.74))] p-4 shadow-[0_18px_46px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Work mode</p>
        <div className="mt-3 space-y-2">
          {(['remote', 'hybrid', 'onsite'] as const).map((item) => (
            <label key={item} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={locationFilters.includes(item)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setLocationFilters((current) => checked ? Array.from(new Set([...current, item])) : current.filter((value) => value !== item));
                  }}
                />
                {formatLabel(item)}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-[1.55rem] border border-white/0 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.74))] p-4 shadow-[0_18px_46px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Engagement</p>
        <div className="mt-3 space-y-2">
          {(['one_time', 'ongoing', 'retainer'] as const).map((item) => (
            <label key={item} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <span className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={engagementFilters.includes(item)}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setEngagementFilters((current) => checked ? Array.from(new Set([...current, item])) : current.filter((value) => value !== item));
                  }}
                />
                {formatLabel(item)}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-[1.55rem] border border-white/0 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.74))] p-4 shadow-[0_18px_46px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Interest</p>
        <select
          value={activeInterest}
          onChange={(event) => setActiveInterest(event.target.value)}
          className="mt-3 h-10 w-full rounded-xl border-0 bg-white/88 px-3 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_14px_34px_rgba(15,23,42,0.06)] backdrop-blur-2xl outline-none"
        >
          <option value="All">All interests</option>
          {availableInterests.slice(0, 40).map((interest) => (
            <option key={interest} value={interest}>{interest}</option>
          ))}
        </select>
      </div>
    </div>
  );

  const submitConnect = async () => {
    if (!connectTarget) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!connectNote.trim()) {
      setFeedback('Add a short intro so the gig owner knows why you are a strong fit.');
      return;
    }

    try {
      setConnectLoading(true);
      setFeedback('');
      const response = await fetch('/api/gigs/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gigId: connectTarget.id,
          note: connectNote.trim(),
          interestArea: activeInterest !== 'All' ? activeInterest : undefined,
          portfolioUrl: portfolioUrl.trim() || undefined,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Unable to send your request right now.');
      }
      setFeedback('Connection request sent.');
      setConnectTarget(null);
      setConnectNote('');
      setPortfolioUrl('');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Unable to send your request right now.');
    } finally {
      setConnectLoading(false);
    }
  };

  const isSavedView = navMode === 'saved';

  const GigThumbnail = ({
    title,
    glow,
    badge,
    shareUrl,
    saved,
    onToggleSave,
  }: {
    title: string;
    glow: string;
    badge?: string;
    shareUrl?: string;
    saved?: boolean;
    onToggleSave?: () => void;
  }) => (
    <div className="space-y-2">
      {(badge || shareUrl || onToggleSave) ? (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            {badge ? (
              <span className="inline-flex items-center rounded-full border border-amber-200/25 bg-[linear-gradient(135deg,rgba(245,158,11,0.98),rgba(251,191,36,0.92),rgba(245,158,11,0.92))] px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.22em] text-slate-950 shadow-[0_10px_28px_rgba(245,158,11,0.18)]">
                {badge}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {shareUrl ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void shareOrCopy(shareUrl).then(() => setShareToast('Link copied.'));
                }}
                aria-label="Share gig"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/60 bg-white/70 text-slate-700 shadow-sm backdrop-blur-2xl transition hover:bg-white"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {onToggleSave ? (
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
                    : 'border-slate-200/60 bg-white/70 text-slate-700 hover:bg-white'
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${saved ? 'fill-slate-950 text-slate-950' : ''}`} />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="relative h-[92px] overflow-hidden rounded-[1.15rem] bg-[linear-gradient(135deg,rgba(2,6,23,0.98),rgba(15,23,42,0.92))] shadow-[inset_0_1px_0_rgba(255,255,255,0.10)]">
        <div className="relative flex h-full items-center justify-center px-10 text-center">
          <p className="line-clamp-2 text-[13px] font-semibold tracking-[-0.02em] text-white drop-shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
            {title}
          </p>
        </div>
      </div>
    </div>
  );

  const GigCard = ({ gig }: { gig: GigListing }) => {
    const tone = getCategoryTone(gig.category);
    const badge = isGigNew(gig) ? 'NEW' : (isGigUrgent(gig) ? 'URGENT' : undefined);
    const shareUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/gigs/${gig.slug}`;
    const saved = savedGigIdSet.has(gig.id);

    return (
      <article className="group relative overflow-hidden rounded-[18px] p-3 transition duration-300 hover:-translate-y-0.5" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="relative">
          <Link href={`/gigs/${gig.slug}`} className="block">
            <GigThumbnail
              title={gig.title}
              glow={tone.glow}
              badge={badge}
              shareUrl={shareUrl}
              saved={saved}
              onToggleSave={() => toggleSavedGig(gig.id)}
            />
            <p className="mt-2 line-clamp-1 text-xs font-semibold text-white/50">{gig.organizationName || gig.ownerName}</p>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-white/50">{gig.summary}</p>
          </Link>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="truncate" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)', borderRadius: 100, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{gig.category}</span>
            <span className="truncate" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)', borderRadius: 100, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{gig.budgetLabel}</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-white/45">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1">
              <MapPin className="h-3.5 w-3.5" />
              <span className="capitalize">{String(gig.locationPreference || 'remote')}</span>
            </span>
            <span className="truncate rounded-full bg-white/[0.06] px-2.5 py-1">
              {formatRelativeTime(gig.updatedAt)}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              className="h-9 flex-1 rounded-full bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-slate-800"
              onClick={() => {
                if (!isAuthenticated) {
                  router.push('/login');
                  return;
                }
                setConnectTarget(gig);
                setFeedback('');
              }}
            >
              Connect
            </Button>
          </div>
        </div>
      </article>
    );
  };

  const CategoriesSection = ({ mode }: { mode: 'explore' | 'saved' }) => (
    <div className="relative overflow-hidden rounded-[1.7rem] p-4 sm:p-5" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="relative flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold tracking-[-0.03em] text-white">
            {mode === 'saved' ? 'Explore more categories' : 'Browse by category'}
          </p>
          <p className="mt-1 truncate text-xs text-white/45">
            Pick a lane — we'll filter the feed instantly.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-full bg-white/[0.07] px-3 py-1.5 text-xs font-semibold text-white/65 backdrop-blur-2xl hover:bg-white/[0.10]"
          onClick={() => setFiltersOpen(true)}
        >
          View all
        </button>
      </div>
      <div className="relative mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {availableCategories.slice(0, 10).map((category) => {
          const active = categoryFilters.length === 1 && categoryFilters[0] === category;
          return (
            <button
              key={`browse-${mode}-${category}`}
              type="button"
              onClick={() => toggleCategoryChip(category)}
              className={`group relative overflow-hidden rounded-[1.35rem] px-3 py-3 text-left backdrop-blur-2xl transition duration-300 hover:-translate-y-0.5 ${
                active ? 'bg-slate-950 text-white border border-slate-800' : 'bg-white/[0.05] text-white/70 border border-white/[0.08] hover:bg-white/[0.08]'
              }`}
            >
              <div className="relative flex items-center gap-3">
                <span className={`grid h-11 w-11 place-items-center rounded-[1.1rem] ${
                  active ? 'bg-white/10' : 'bg-white/[0.06]'
                }`}
                >
                  <span className={`text-sm font-semibold ${active ? 'text-white' : 'text-white/60'}`}>
                    {category.slice(0, 2).toUpperCase()}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{category}</span>
                  <span className={`mt-0.5 block truncate text-xs ${active ? 'text-slate-200' : 'text-white/40'}`}>
                    Browse gigs
                  </span>
                </span>
              </div>
              <span className={`pointer-events-none absolute right-3 top-3 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] ${
                active ? 'bg-white/10 text-white' : 'bg-white/[0.06] text-white/50'
              }`}>
                {active ? 'Selected' : 'Filter'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const toggleSidebarExpanded = () => setSidebarExpanded((current) => !current);

  if (!mounted) {
    return (
      <div className="min-h-screen" style={{ background: '#0D0D0F' }}>
        <div className="mx-auto w-full max-w-6xl px-4 py-6">
          <div className="h-12 w-40 rounded-2xl bg-white/[0.05] shadow-sm" />
          <div className="mt-5 h-12 w-full rounded-2xl bg-white/[0.05] shadow-sm" />
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={`gigs-skel-${idx}`}
                className="rounded-[22px] p-4"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="h-4 w-28 rounded bg-white/[0.06]" />
                <div className="mt-3 h-6 w-48 rounded bg-white/[0.06]" />
                <div className="mt-3 h-16 w-full rounded bg-white/[0.06]" />
                <div className="mt-4 h-11 w-full rounded-2xl bg-white/[0.06]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: '#0D0D0F' }}>

      <div className="relative z-10 mx-auto flex max-w-[1500px] gap-4 px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
        <div className="relative hidden shrink-0 xl:sticky xl:top-6 xl:block xl:max-h-[calc(100vh-3rem)]">
          <aside
            className={`flex flex-col overflow-hidden rounded-[1.75rem] border border-white/[0.08] bg-white/[0.04] p-3 backdrop-blur-xl ${
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
                    <BriefcaseBusiness className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">Gigs</p>
                    <p className="truncate text-xs text-white/60">Directory</p>
                  </div>
                </div>
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.12)]">
                  <BriefcaseBusiness className="h-5 w-5" />
                </div>
              )}
            </div>

            <nav className={`mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pb-2 ${sidebarExpanded ? 'px-1' : 'px-0'}`}>
              {sidebarExpanded ? (
                <p className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-white/40">
                  Browse
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => setNavMode('explore')}
                className={`flex w-full items-center rounded-2xl transition ${
                  sidebarExpanded ? 'gap-3 px-3 py-2.5 text-sm font-semibold' : 'justify-center px-0 py-2'
                } ${navMode === 'explore' ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.14)]' : 'text-white/60 hover:bg-white/[0.06]'}`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${navMode === 'explore' ? 'bg-white/10' : 'bg-white/[0.06] ring-1 ring-white/10'}`}>
                  <Home className={`h-5 w-5 ${navMode === 'explore' ? 'text-white' : 'text-white/60'}`} />
                </div>
                {sidebarExpanded ? <span className="truncate">Explore</span> : <span className="sr-only">Explore</span>}
              </button>

              <button
                type="button"
                onClick={() => setNavMode('saved')}
                className={`flex w-full items-center rounded-2xl transition ${
                  sidebarExpanded ? 'gap-3 px-3 py-2.5 text-sm font-semibold' : 'justify-center px-0 py-2'
                } ${navMode === 'saved' ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.14)]' : 'text-white/60 hover:bg-white/[0.06]'}`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${navMode === 'saved' ? 'bg-white/10' : 'bg-white/[0.06] ring-1 ring-white/10'}`}>
                  <Star className={`h-5 w-5 ${navMode === 'saved' ? 'text-white' : 'text-white/60'}`} />
                </div>
                {sidebarExpanded ? <span className="truncate">Saved</span> : <span className="sr-only">Saved</span>}
              </button>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => router.push(uiAuthenticated ? '/workspace?tab=gigs' : '/login')}
                  title="Post a gig"
                  className={`flex w-full items-center rounded-2xl bg-slate-950 text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)] transition hover:bg-slate-900 ${
                    sidebarExpanded ? 'gap-3 px-3 py-2.5 text-sm font-semibold' : 'justify-center px-0 py-2.5'
                  }`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                    <Plus className="h-5 w-5 text-white" />
                  </div>
                  {sidebarExpanded ? <span className="truncate">Post gig</span> : <span className="sr-only">Post gig</span>}
                </button>
              </div>
            </nav>

            <div className={`mt-auto border-t border-white/[0.08] pt-3 ${sidebarExpanded ? 'px-1' : 'px-0'}`}>
              <div className={`flex items-center rounded-2xl border border-white/[0.08] bg-white/[0.04] p-2 ${sidebarExpanded ? 'gap-3' : 'justify-center'}`}>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.08] text-sm font-semibold text-white/70">
                  {((session?.user?.name || session?.user?.email || softwareName || 'D') as string).slice(0, 1).toUpperCase()}
                </div>
                {sidebarExpanded ? (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{session?.user?.name || softwareName}</p>
                    <p className="truncate text-xs text-white/45">{session?.user?.email || accentLabel}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        </div>

        <main className="min-w-0 flex-1 pb-16 lg:pb-0">
	      <section className="mt-6 pb-28 sm:pb-24">
	        <div className="min-w-0 space-y-4 overflow-x-hidden [overflow-x:clip]">
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
              <h1 className="text-lg font-semibold tracking-[-0.03em] text-white">Gigs</h1>
              <button
                type="button"
                onClick={() => router.push(uiAuthenticated ? '/workspace?tab=gigs' : '/login')}
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.18)]"
                aria-label="Post gig"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>

	          <div className="sticky top-3 z-30 relative overflow-hidden rounded-[1.7rem] p-4 sm:p-5 lg:static lg:top-auto lg:z-auto" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.07)' }}>
	            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-[520px]">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <Input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    if (navMode === 'saved') setNavMode('explore');
                  }}
                  placeholder="Search for gigs, teams or skills..."
                  className="h-11 w-full rounded-full border-0 bg-white/[0.08] pl-11 text-sm text-white backdrop-blur-2xl placeholder:text-white/35"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setNavMode('explore')}
                  className={`h-11 rounded-full px-4 text-sm font-semibold backdrop-blur-2xl transition ${
                    navMode === 'explore'
                      ? 'bg-[linear-gradient(135deg,rgba(2,6,23,0.95),rgba(30,41,59,0.92))] text-white shadow-[0_18px_54px_rgba(15,23,42,0.18)]'
                      : 'bg-white/[0.07] text-white/65 hover:bg-white/[0.10]'
                  }`}
                >
                  Explore
                </button>
                <button
                  type="button"
                  onClick={() => setNavMode('saved')}
                  className={`h-11 rounded-full px-4 text-sm font-semibold backdrop-blur-2xl transition ${
                    navMode === 'saved'
                      ? 'bg-[linear-gradient(135deg,rgba(2,6,23,0.95),rgba(30,41,59,0.92))] text-white shadow-[0_18px_54px_rgba(15,23,42,0.18)]'
                      : 'bg-white/[0.07] text-white/65 hover:bg-white/[0.10]'
                  }`}
                >
                  Saved
                </button>
                <Button
                  asChild
                  className="h-11 rounded-full bg-[linear-gradient(135deg,rgba(2,6,23,0.96),rgba(37,99,235,0.88))] px-5 text-sm font-semibold text-white shadow-[0_18px_54px_rgba(37,99,235,0.22)] hover:opacity-95"
                >
                  <Link href={isAuthenticated ? '/workspace?tab=gigs' : '/login'}>
                    <Plus className="mr-2 h-4 w-4" />
                    Post a gig
                  </Link>
                </Button>
              </div>
            </div>

	            <div className="mt-5 grid gap-4 md:grid-cols-[1.3fr_0.7fr]">
	              <div>
	                <div className="mb-3 sm:hidden">
	                  <div className="flex items-center gap-2">
	                    <select
	                      value={categoryFilters.length === 1 ? categoryFilters[0] : ''}
	                      onChange={(event) => {
	                        const value = event.target.value;
	                        setCategoryFilters(value ? [value] : []);
	                        setNavMode('explore');
	                        jumpToFeed();
	                      }}
	                      className="h-11 w-full max-w-full rounded-full border-0 bg-white/[0.08] px-4 text-sm font-semibold text-white backdrop-blur-2xl outline-none"
	                    >
	                      <option value="">All categories</option>
	                      {availableCategories.slice(0, 32).map((category) => (
	                        <option key={`hero-cat-${category}`} value={category}>{category}</option>
	                      ))}
	                    </select>
	                    <button
	                      type="button"
	                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-white/65 backdrop-blur-2xl"
	                      onClick={() => setFiltersOpen(true)}
	                      aria-label="More filters"
	                    >
	                      <SlidersHorizontal className="h-4 w-4" />
	                    </button>
	                  </div>
	                </div>

	                <div className="mb-4 hidden items-center gap-2 overflow-x-auto pb-1 sm:flex [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
	                  {availableCategories.slice(0, 12).map((category) => {
	                    const active = categoryFilters.length === 1 && categoryFilters[0] === category;
	                    const tone = getCategoryTone(category);
	                    return (
	                      <button
                        key={`gigs-hero-cat-${category}`}
                        type="button"
                        onClick={() => {
                          toggleCategoryChip(category);
                          setNavMode('explore');
                          jumpToFeed();
                        }}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur-2xl transition ${
                          active
                            ? 'bg-[linear-gradient(135deg,rgba(2,6,23,0.95),rgba(30,41,59,0.9))] text-white'
                            : 'bg-white/[0.06] text-white/55 border border-white/[0.09] hover:bg-white/[0.10]'
                        }`}
                      >
                        {category}
                      </button>
	                    );
	                  })}
	                </div>
	                <h1 className="text-2xl font-semibold tracking-[-0.04em] text-white sm:text-3xl">
	                  Post a gig. Get replies. <span className="hidden sm:inline">Ship the work.</span>
	                </h1>
	                <p className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-white sm:hidden">
	                  Ship the work.
	                </p>
                <p className="mt-3 max-w-xl text-sm leading-6 text-white/50">
                  A cleaner way to hire help for real deliverables. Post in minutes, review applicants, and close the loop inside docrud.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-white/45">Popular:</span>
                  {popularChips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        if (availableCategories.includes(chip)) toggleCategoryChip(chip);
                        else setActiveInterest(chip);
                      }}
                      className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/60 border border-white/[0.08] hover:bg-white/[0.10]"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-[1.6rem] bg-[linear-gradient(135deg,rgba(2,6,23,0.92),rgba(30,41,59,0.84))] p-4 text-white shadow-[0_24px_80px_rgba(15,23,42,0.22)]">
                <div className="relative">
                  <div className="mb-4 overflow-hidden rounded-[1.25rem] bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/homepage/promo-resume.png"
                      alt="Talent Directory preview"
                      className="h-28 w-full object-cover opacity-90"
                    />
                  </div>
                  <p className="text-xs font-semibold text-slate-200">Talent Directory</p>
                  <p className="mt-2 text-sm font-semibold">Find people faster. Hire with signal.</p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-200">
                    <span className="rounded-full bg-white/10 px-3 py-1 font-semibold">NEW</span>
                    <span>Search by skills, categories, and tags</span>
                  </div>
                  <div className="mt-5">
                    <Button asChild className="w-full rounded-full bg-white text-slate-950 shadow-[0_18px_54px_rgba(255,255,255,0.14)] hover:bg-slate-100">
                      <Link href="/talent">
                        Explore talent
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {isSavedView ? (
            <>
              <div className="cloud-card-soft relative overflow-hidden rounded-[1.7rem] p-4 sm:p-5">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(245,158,11,0.14),transparent_58%),radial-gradient(circle_at_82%_22%,rgba(99,102,241,0.14),transparent_62%)]" />
                <div className="relative flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold tracking-[-0.03em] text-slate-950">Saved gigs</p>
                    <p className="mt-1 truncate text-xs text-slate-500">Only the gigs you saved — clean, fast, and focused.</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-2xl">
                    {sortedGigs.length}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {sortedGigs.length ? sortedGigs.map((gig) => (
                  <div key={`saved-${gig.id}`}>
                    <GigCard gig={gig} />
                  </div>
                )) : (
                  <div className="cloud-card-soft col-span-2 lg:col-span-3 xl:col-span-4 rounded-[1.7rem] p-10 text-center shadow-[0_18px_48px_rgba(15,23,42,0.07)]">
                    <p className="text-lg font-semibold tracking-[-0.03em] text-slate-950">No saved gigs yet.</p>
                    <p className="mt-2 text-sm text-slate-600">Tap the star on a gig card to save it for later.</p>
                  </div>
                )}
              </div>

              <CategoriesSection mode="saved" />
            </>
          ) : (
            <>
              {urgentGigs.length ? (
                <div className="cloud-card-soft relative overflow-hidden rounded-[1.7rem] p-4 sm:p-5">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_22%,rgba(59,130,246,0.18),transparent_58%),radial-gradient(circle_at_85%_18%,rgba(245,158,11,0.12),transparent_60%)]" />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-base font-semibold tracking-[-0.03em] text-slate-950">Urgent gigs</p>
                    <span className="text-sm font-semibold text-slate-500">{urgentGigs.length}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {urgentGigs.slice(0, 10).map((gig) => (
                      <div key={gig.id}>
                        <GigCard gig={gig} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <CategoriesSection mode="explore" />

              {categorySpotlights.length ? (
                <div className="grid gap-4">
                  {categorySpotlights.map(({ category, gigs: spotlightGigs }) => {
                    const tone = getCategoryTone(category);
                    return (
                      <div key={`spot-${category}`} className="cloud-card-soft rounded-[1.7rem] p-4 sm:p-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold tracking-[-0.03em] text-slate-950">{category}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">Fresh gigs you can reply to right now.</p>
                          </div>
                          <button
                            type="button"
                            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold backdrop-blur-xl transition hover:-translate-y-0.5 ${tone.chip}`}
                            onClick={() => {
                              setNavMode('explore');
                              setCategoryFilters([category]);
                              jumpToFeed();
                            }}
                          >
                            View all
                          </button>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {spotlightGigs.map((gig) => (
                            <div key={`spot-${category}-${gig.id}`}>
                              <GigCard gig={gig} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div ref={feedTopRef} className="h-0 w-0" />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-600">
                  {standardGigs.length ? (
                    <span className="font-medium text-slate-700">{startIndex}-{endIndex}</span>
                  ) : (
                    <span className="font-medium text-slate-700">0</span>
                  )}
                  <span className="ml-1">of {totalCount} gigs</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-full border-0 bg-white/85 px-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_16px_42px_rgba(15,23,42,0.06)] backdrop-blur-2xl lg:hidden"
                    onClick={() => setFiltersOpen(true)}
                  >
                    <Filter className="mr-2 h-4 w-4" />
                    Filters
                  </Button>

                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                    className="h-10 rounded-full border-0 bg-white/85 px-4 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_16px_42px_rgba(15,23,42,0.06)] backdrop-blur-2xl outline-none"
                  >
                    <option value="newest">Sort by: Newest</option>
                    <option value="replies">Sort by: Most replies</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {pageItems.length ? pageItems.map((gig) => (
                  <div key={gig.id}>
                    <GigCard gig={gig} />
                  </div>
                )) : (
                  <div className="cloud-card-soft col-span-2 lg:col-span-3 xl:col-span-4 rounded-[1.7rem] p-10 text-center shadow-[0_18px_48px_rgba(15,23,42,0.07)]">
                    <p className="text-lg font-semibold tracking-[-0.03em] text-slate-950">No gigs match this filter yet.</p>
                    <p className="mt-2 text-sm text-slate-600">Try removing a filter, or post a gig from your workspace.</p>
                  </div>
                )}
              </div>

              {totalPages > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] bg-white/90 px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.06)] backdrop-blur-2xl">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-full border-0 bg-white/85 px-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_14px_34px_rgba(15,23,42,0.06)] backdrop-blur-2xl"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={safePage === 1}
                  >
                    Prev
                  </Button>

                  <div className="flex items-center gap-2">
                    <div className="text-xs font-semibold text-slate-600 sm:hidden">
                      Page {safePage} / {totalPages}
                    </div>
                    <div className="hidden items-center gap-1 sm:flex">
                      {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                        .filter((n) => (
                          n === 1 ||
                          n === totalPages ||
                          Math.abs(n - safePage) <= 1
                        ))
                        .slice(0, 7)
                        .map((n) => (
                          <button
                            key={`page-${n}`}
                            type="button"
                            onClick={() => setPage(n)}
                            className={`h-9 min-w-[36px] rounded-full px-3 text-xs font-semibold transition ${
                              n === safePage ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-full border-0 bg-white/85 px-3 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_14px_34px_rgba(15,23,42,0.06)] backdrop-blur-2xl"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={safePage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </>
          )}

	       
      </div>
      </section>

      {shareToast ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-[85] hidden sm:block">
          <div className="pointer-events-auto rounded-full border border-white/10 bg-[linear-gradient(135deg,rgba(2,6,23,0.92),rgba(15,23,42,0.90))] px-4 py-2 text-xs font-semibold text-white shadow-[0_18px_50px_rgba(2,6,23,0.28)] backdrop-blur-2xl">
            {shareToast}
          </div>
        </div>
      ) : null}

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent className="max-w-md rounded-[1.7rem] border-white/0 bg-white p-0 shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
          <DialogHeader className="border-b border-slate-100 px-6 py-5">
            <DialogTitle className="text-left text-[1.1rem] font-semibold tracking-[-0.03em] text-slate-950">
              Gigs
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 px-6 py-5">
            <button
              type="button"
              onClick={() => {
                setNavMode('explore');
                setMobileNavOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${
                navMode === 'explore'
                  ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.14)]'
                  : 'border border-slate-200/70 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${navMode === 'explore' ? 'bg-white/10' : 'bg-slate-100'}`}>
                <Home className={`h-5 w-5 ${navMode === 'explore' ? 'text-white' : 'text-slate-800'}`} />
              </div>
              Explore
            </button>
            <button
              type="button"
              onClick={() => {
                setNavMode('saved');
                setMobileNavOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold transition ${
                navMode === 'saved'
                  ? 'bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.14)]'
                  : 'border border-slate-200/70 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${navMode === 'saved' ? 'bg-white/10' : 'bg-slate-100'}`}>
                <Star className={`h-5 w-5 ${navMode === 'saved' ? 'text-white' : 'text-slate-800'}`} />
              </div>
              Saved
            </button>
            <button
              type="button"
              onClick={() => {
                setMobileNavOpen(false);
                router.push(uiAuthenticated ? '/workspace?tab=gigs' : '/login');
              }}
              className="mt-2 flex w-full items-center gap-3 rounded-2xl bg-slate-950 px-3 py-3 text-left text-sm font-semibold text-white shadow-[0_16px_36px_rgba(15,23,42,0.18)] transition hover:bg-slate-900"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                <Plus className="h-5 w-5 text-white" />
              </div>
              Post gig
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-w-xl rounded-[1.7rem] border-white/0 bg-white p-0 shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
          <DialogHeader className="border-b border-slate-100 px-6 py-5">
            <DialogTitle className="text-left text-[1.1rem] font-semibold tracking-[-0.03em] text-slate-950">
              Filters
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            {FiltersPanel}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(connectTarget)} onOpenChange={(open) => { if (!open) setConnectTarget(null); }}>
        <DialogContent className="max-w-xl rounded-[1.7rem] border-white/0 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.78))] p-0 shadow-[0_28px_80px_rgba(15,23,42,0.16)] backdrop-blur-2xl">
          <DialogHeader className="border-b border-white/55 px-6 py-5">
            <DialogTitle className="text-left text-[1.1rem] font-semibold tracking-[-0.03em] text-slate-950">
              Connect for {connectTarget?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <p className="text-sm leading-6 text-slate-600">
              Keep it short. This goes straight into the owner&apos;s gigs inbox inside docrud.
            </p>
            <textarea
              value={connectNote}
              onChange={(event) => setConnectNote(event.target.value)}
              className="min-h-[130px] w-full rounded-[1.2rem] border-0 bg-white/90 px-4 py-3 text-sm leading-6 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_18px_46px_rgba(15,23,42,0.06)] backdrop-blur-2xl outline-none"
              placeholder="Why are you a strong fit, and how would you approach this work?"
            />
            <Input
              value={portfolioUrl}
              onChange={(event) => setPortfolioUrl(event.target.value)}
              placeholder="Portfolio or profile link (optional)"
              className="rounded-[1.1rem] border-0 bg-white/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.92),0_14px_34px_rgba(15,23,42,0.06)] backdrop-blur-2xl"
            />
            {feedback ? <p className="text-sm text-slate-600">{feedback}</p> : null}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-full border-white/0 bg-white/76 px-4 text-slate-900" onClick={() => setConnectTarget(null)}>
                Cancel
              </Button>
              <Button type="button" className="rounded-full bg-slate-950 px-4 text-white hover:bg-slate-800" onClick={submitConnect} disabled={connectLoading}>
                {connectLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Send request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {activeGigToast ? (
        <div className="pointer-events-none fixed bottom-6 left-6 z-[80] hidden max-w-[420px] sm:block">
          <div
            className={`pointer-events-auto overflow-hidden rounded-[1.6rem] border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.94),rgba(30,41,59,0.90))] p-4 text-white shadow-[0_26px_70px_rgba(15,23,42,0.30)] backdrop-blur-2xl transition duration-300 ${
              toastLeaving ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300">New gig just posted</p>
            <p className="mt-2 line-clamp-1 text-sm font-semibold tracking-[-0.02em] text-white">{activeGigToast.title}</p>
            <p className="mt-1 line-clamp-1 text-xs text-slate-300">{activeGigToast.organizationName || activeGigToast.ownerName} · {activeGigToast.category}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">{activeGigToast.budgetLabel}</span>
              <Link
                href={`/gigs/${activeGigToast.slug}`}
                className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/15"
              >
                Open
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}
        </main>
      </div>
    </div>
  );
}
