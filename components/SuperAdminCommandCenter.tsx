'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Ban,
  BarChart3,
  Clock3,
  Gift,
  Globe2,
  Landmark,
  Loader2,
  Mail,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  Wrench,
  TicketPercent,
  AlertTriangle,
  Image as ImageIcon,
  GripVertical,
  ExternalLink,
  Layout,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PlatformConfig, PlatformFeatureControlKey, SaasOverview, UserIntelligenceOverview } from '@/types/document';
import SuperAdminMailCenter from '@/components/SuperAdminMailCenter';
import SuperAdminUserCenter from '@/components/SuperAdminUserCenter';
import HomepageCommandCenter from '@/components/HomepageCommandCenter';

type TelemetryOverview = {
  generatedAt: string;
  traffic: {
    pageViews24h: number;
    pageViews7d: number;
    uniqueVisitors24h: number;
    uniqueVisitors7d: number;
    sessions24h: number;
    sessions7d: number;
    avgSessionSeconds24h: number;
    bounceRate24h: number;
    liveVisitors5m: number;
    ctaClicks24h: number;
    searches24h: number;
    signups24h: number;
    logins24h: number;
    topPages24h: Array<{ path: string; views: number }>;
    topReferrers24h: Array<{ referrer: string; views: number }>;
    deviceMix24h: Array<{ device: 'mobile' | 'desktop' | 'bot' | 'unknown'; views: number }>;
    topCtas24h: Array<{ ctaId: string; clicks: number }>;
    topSearches24h: Array<{ query: string; searches: number }>;
    topWorkspaceFeatures24h: Array<{ featureId: string; opens: number }>;
  };
  behaviour: {
    avgTimeOnPageSeconds24h: number;
    returningVisitorRate7d: number;
    topExitPages24h: Array<{ path: string; exits: number }>;
    funnels: Array<{ id: string; label: string; steps: Array<{ label: string; count: number; rateFromPrev: number }> }>;
  };
  security: {
    blockedIps: string[];
    suspiciousIps24h: Array<{ ip: string; events: number; topPaths: Array<{ path: string; count: number }> }>;
  };
};

type LoadState = {
  saas?: SaasOverview;
  intel?: UserIntelligenceOverview;
  platform?: PlatformConfig;
  telemetry?: TelemetryOverview;
};

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\\.0$/, '')}k`;
  return String(Math.round(value));
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatCurrencyInrFromPaise(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((value || 0) / 100);
}

function statusPill(status: 'healthy' | 'watch' | 'critical' | string) {
  if (status === 'critical') return 'border-rose-200 bg-rose-50/80 text-rose-900';
  if (status === 'watch') return 'border-amber-200 bg-amber-50/80 text-amber-900';
  return 'border-emerald-200 bg-emerald-50/80 text-emerald-900';
}

function priorityPill(priority: 'high' | 'medium' | 'low' | string) {
  if (priority === 'high') return 'bg-rose-100/80 text-rose-700';
  if (priority === 'medium') return 'bg-amber-100/80 text-amber-700';
  return 'bg-slate-100/80 text-slate-700';
}

function prettyFeatureLabel(key: string) {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\\bai\\b/gi, 'AI')
    .replace(/\\bpdf\\b/gi, 'PDF')
    .replace(/\\bqr\\b/gi, 'QR')
    .replace(/\\bats\\b/gi, 'ATS')
    .replace(/\\bkyc\\b/gi, 'KYC')
    .replace(/\\s+/g, ' ')
    .trim()
    .replace(/^\\w/, (m) => m.toUpperCase());
}

export default function SuperAdminCommandCenter() {
  const [tab, setTab] = useState<'overview' | 'traffic' | 'behaviour' | 'events' | 'tenants' | 'users' | 'security' | 'safety' | 'features' | 'commerce' | 'withdrawals' | 'mail' | 'banners' | 'homepage'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>({});

  const [featureQuery, setFeatureQuery] = useState('');
  const [featureDraft, setFeatureDraft] = useState<Record<PlatformFeatureControlKey, boolean> | null>(null);
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [featureSaveMessage, setFeatureSaveMessage] = useState<string | null>(null);

  const [tenantQuery, setTenantQuery] = useState('');
  const [ipDraft, setIpDraft] = useState('');
  const [savingBlocklist, setSavingBlocklist] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);

  const [eventFilterSurface, setEventFilterSurface] = useState<'all' | 'public' | 'workspace'>('all');
  const [eventFilterType, setEventFilterType] = useState<'all' | 'page_view' | 'page_leave' | 'cta_click' | 'search' | 'login' | 'signup' | 'feature_open'>('all');
  const [eventFilterPath, setEventFilterPath] = useState('');
  const [eventLoading, setEventLoading] = useState(false);
  const [events, setEvents] = useState<Array<{ id: string; type: string; surface: string; path: string; createdAt: string; ip?: string; visitorId?: string; sessionId?: string; featureId?: string; ctaId?: string; query?: string; userRole?: string }>>([]);
  const [eventMessage, setEventMessage] = useState<string | null>(null);

  const [withdrawalStatus, setWithdrawalStatus] = useState<'all' | 'requested' | 'approved' | 'paid' | 'rejected' | 'cancelled'>('requested');
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [withdrawalsMessage, setWithdrawalsMessage] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<Array<{
    id: string;
    sellerUserId: string;
    sellerEmail?: string;
    amountInPaise: number;
    status: string;
    payoutMethod: { label: string; details: string };
    adminNote?: string;
    transactionRef?: string;
    requestedAt: string;
    reviewedAt?: string;
    paidAt?: string;
    updatedAt: string;
  }>>([]);
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [withdrawalDialogTargetId, setWithdrawalDialogTargetId] = useState('');
  const [withdrawalAdminNote, setWithdrawalAdminNote] = useState('');
  const [withdrawalTxnRef, setWithdrawalTxnRef] = useState('');
  const [withdrawalActionBusy, setWithdrawalActionBusy] = useState(false);

  const [commerceLoading, setCommerceLoading] = useState(false);
  const [commerceMessage, setCommerceMessage] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<Array<{ id: string; code: string; percentOff: number; active: boolean; redeemedCount: number; maxRedemptions?: number; validUntil?: string; createdAt: string }>>([]);
  const [redemptions, setRedemptions] = useState<Array<{ id: string; referrerUserId: string; refereeUserId: string; transactionId: string; createdAt: string; bonusGrantedAt?: string }>>([]);

  /* ── Referral program state ── */
  const [referralSummary, setReferralSummary] = useState<{
    totalInvitesSent: number; totalActivations: number; totalBonusesGranted: number;
    uniqueReferrers: number; uniqueReferees: number; conversionRate: number;
    invites30d: number; activations30d: number;
  } | null>(null);
  const [referralLeaderboard, setReferralLeaderboard] = useState<Array<{
    userId: string; name: string; email: string; org: string;
    invitesSent: number; activations: number; bonusGranted: boolean; bonusGrantedAt?: string;
  }>>([]);
  const [referralActivations, setReferralActivations] = useState<Array<{
    id: string; referrerUserId: string; refereeUserId: string; refereeEmail: string;
    referralCode: string; activatedAt: string; bonusGrantedAt?: string;
    referrerName: string; referrerEmail: string; referrerOrg: string;
    refereeName: string; refereeOrg: string;
  }>>([]);
  const [referralInvites, setReferralInvites] = useState<Array<{
    id: string; referrerUserId: string; inviteeEmail: string; sentAt: string;
    signedUpAt?: string; referrerName: string; referrerEmail: string;
  }>>([]);
  const [referralSubTab, setReferralSubTab] = useState<'overview' | 'activations' | 'invites' | 'leaderboard'>('overview');
  const [couponDraftCode, setCouponDraftCode] = useState('');
  const [couponDraftPercent, setCouponDraftPercent] = useState('25');
  const [couponDraftMax, setCouponDraftMax] = useState('');

  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyMessage, setSafetyMessage] = useState<string | null>(null);
  const [safetyStatus, setSafetyStatus] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [safetyReports, setSafetyReports] = useState<Array<{
    id: string;
    gigId: string;
    gigSlug: string;
    reporterUserId: string;
    reporterEmail?: string;
    accusedUserId: string;
    accusedEmail?: string;
    reason: string;
    details?: string;
    evidence: Array<{ name: string; dataUrl: string }>;
    status: string;
    adminNote?: string;
    createdAt: string;
    reviewedAt?: string;
    updatedAt: string;
  }>>([]);

  const refreshTimerRef = useRef<number | null>(null);
  const savingTimerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [saasRes, intelRes, platformRes, telemetryRes] = await Promise.all([
        fetch('/api/saas/overview', { cache: 'no-store' }),
        fetch('/api/admin/user-intelligence', { cache: 'no-store' }),
        fetch('/api/platform', { cache: 'no-store' }),
        fetch('/api/admin/telemetry/overview', { cache: 'no-store' }),
      ]);

      if (!saasRes.ok) throw new Error('Failed to load SaaS overview');
      if (!intelRes.ok) throw new Error('Failed to load user intelligence');
      if (!platformRes.ok) throw new Error('Failed to load platform controls');
      if (!telemetryRes.ok) throw new Error('Failed to load visitor telemetry');

      const [saas, intel, platform, telemetry] = await Promise.all([
        saasRes.json() as Promise<SaasOverview>,
        intelRes.json() as Promise<UserIntelligenceOverview>,
        platformRes.json() as Promise<PlatformConfig>,
        telemetryRes.json() as Promise<TelemetryOverview>,
      ]);

      setState({ saas, intel, platform, telemetry });
      setFeatureDraft(platform?.featureControls ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load command center');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadEvents = useCallback(async () => {
    setEventMessage(null);
    setEventLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '220');
      if (eventFilterSurface !== 'all') params.set('surface', eventFilterSurface);
      if (eventFilterType !== 'all') params.set('type', eventFilterType);
      if (eventFilterPath.trim()) params.set('path', eventFilterPath.trim());
      const res = await fetch(`/api/admin/telemetry/events?${params.toString()}`, { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to load events');
      setEvents(Array.isArray(payload?.events) ? payload.events : []);
    } catch (err) {
      setEventMessage(err instanceof Error ? err.message : 'Failed to load events');
      setEvents([]);
    } finally {
      setEventLoading(false);
    }
  }, [eventFilterPath, eventFilterSurface, eventFilterType]);

  const loadWithdrawals = useCallback(async () => {
    setWithdrawalsMessage(null);
    setWithdrawalsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '400');
      if (withdrawalStatus !== 'all') params.set('status', withdrawalStatus);
      const res = await fetch(`/api/admin/template-marketplace/withdrawals?${params.toString()}`, { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to load withdrawals');
      setWithdrawals(Array.isArray(payload?.withdrawals) ? payload.withdrawals : []);
    } catch (err) {
      setWithdrawalsMessage(err instanceof Error ? err.message : 'Failed to load withdrawals');
      setWithdrawals([]);
    } finally {
      setWithdrawalsLoading(false);
    }
  }, [withdrawalStatus]);

  const loadCommerce = useCallback(async () => {
    setCommerceMessage(null);
    setCommerceLoading(true);
    try {
      const [couponsRes, referralsRes] = await Promise.all([
        fetch('/api/admin/commerce/coupons', { cache: 'no-store' }),
        fetch('/api/admin/commerce/referrals', { cache: 'no-store' }),
      ]);
      const couponsPayload = await couponsRes.json().catch(() => null);
      const referralsPayload = await referralsRes.json().catch(() => null);
      if (!couponsRes.ok) throw new Error(couponsPayload?.error || 'Failed to load coupons');
      if (!referralsRes.ok) throw new Error(referralsPayload?.error || 'Failed to load referrals');
      setCoupons(Array.isArray(couponsPayload?.coupons) ? couponsPayload.coupons : []);
      setRedemptions(Array.isArray(referralsPayload?.redemptions) ? referralsPayload.redemptions : []);
      if (referralsPayload?.summary)     setReferralSummary(referralsPayload.summary);
      if (Array.isArray(referralsPayload?.leaderboard))   setReferralLeaderboard(referralsPayload.leaderboard);
      if (Array.isArray(referralsPayload?.activations))   setReferralActivations(referralsPayload.activations);
      if (Array.isArray(referralsPayload?.invites))       setReferralInvites(referralsPayload.invites);
    } catch (err) {
      setCommerceMessage(err instanceof Error ? err.message : 'Failed to load commerce data');
      setCoupons([]);
      setRedemptions([]);
    } finally {
      setCommerceLoading(false);
    }
  }, []);

  const loadSafetyReports = useCallback(async () => {
    setSafetyMessage(null);
    setSafetyLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '800');
      if (safetyStatus !== 'all') params.set('status', safetyStatus);
      const res = await fetch(`/api/admin/gigs/safety/reports?${params.toString()}`, { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to load reports');
      setSafetyReports(Array.isArray(payload?.reports) ? payload.reports : []);
    } catch (err) {
      setSafetyMessage(err instanceof Error ? err.message : 'Failed to load reports');
      setSafetyReports([]);
    } finally {
      setSafetyLoading(false);
    }
  }, [safetyStatus]);

  const updateWithdrawal = useCallback(async (params: { id: string; action: 'approve' | 'reject' | 'mark_paid'; adminNote?: string; transactionRef?: string }) => {
    setWithdrawalActionBusy(true);
    setWithdrawalsMessage(null);
    try {
      const res = await fetch('/api/admin/template-marketplace/withdrawals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Update failed');
      await loadWithdrawals();
    } catch (err) {
      setWithdrawalsMessage(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setWithdrawalActionBusy(false);
    }
  }, [loadWithdrawals]);

  useEffect(() => {
    void load();
    if (refreshTimerRef.current) window.clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = window.setInterval(() => void load(), 15_000);
    return () => {
      if (refreshTimerRef.current) window.clearInterval(refreshTimerRef.current);
    };
  }, [load]);

  useEffect(() => {
    if (tab !== 'events') return;
    void loadEvents();
    const interval = window.setInterval(() => void loadEvents(), 8_000);
    return () => window.clearInterval(interval);
  }, [loadEvents, tab]);

  useEffect(() => {
    if (tab !== 'withdrawals') return;
    void loadWithdrawals();
  }, [loadWithdrawals, tab]);

  useEffect(() => {
    if (tab !== 'commerce') return;
    void loadCommerce();
  }, [loadCommerce, tab]);

  useEffect(() => {
    if (tab !== 'safety') return;
    void loadSafetyReports();
  }, [loadSafetyReports, tab]);

  const platform = state.platform;
  const saas = state.saas;
  const intel = state.intel;
  const telemetry = state.telemetry;
  const health = saas?.platformHealth;

  const featureKeys = useMemo(() => {
    const controls = featureDraft || platform?.featureControls;
    if (!controls) return [];
    return Object.keys(controls) as PlatformFeatureControlKey[];
  }, [featureDraft, platform?.featureControls]);

  const filteredFeatureKeys = useMemo(() => {
    const query = featureQuery.trim().toLowerCase();
    if (!query) return featureKeys;
    return featureKeys.filter((key) => prettyFeatureLabel(key).toLowerCase().includes(query) || key.toLowerCase().includes(query));
  }, [featureKeys, featureQuery]);

  const combinedRecommendations = useMemo(() => {
    const fromIntel = intel?.recommendations || [];
    const fromSaas = health?.recommendations || [];
    const merged = [
      ...fromSaas.map((r) => ({ ...r, source: 'Platform' as const })),
      ...fromIntel.map((r) => ({ ...r, source: 'Users' as const })),
    ];
    const score = (priority: string) => (priority === 'high' ? 3 : priority === 'medium' ? 2 : 1);
    return merged.sort((a, b) => score(b.priority) - score(a.priority)).slice(0, 10);
  }, [health?.recommendations, intel?.recommendations]);

  const planBars = useMemo(() => {
    const items = (saas?.planDistribution || []).slice(0, 8);
    const max = Math.max(1, ...items.map((i) => i.businesses));
    return items.map((item) => ({ ...item, pct: Math.round((item.businesses / max) * 100) }));
  }, [saas?.planDistribution]);

  const topTabs = useMemo(() => {
    const items = (intel?.topTabs || []).slice(0, 8);
    const max = Math.max(1, ...items.map((i) => i.count));
    return items.map((item) => ({ ...item, pct: Math.round((item.count / max) * 100) }));
  }, [intel?.topTabs]);

  const tenantRows = useMemo(() => {
    const query = tenantQuery.trim().toLowerCase();
    const rows = (saas?.businessUsage || []).map((row) => ({ ...row, score: Number.isFinite(Number(row.setupReadinessScore)) ? Number(row.setupReadinessScore) : 0 }));
    const filtered = query
      ? rows.filter((row) =>
          [row.name, row.email, row.organizationName, row.planName, row.status, row.industry]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query)),
        )
      : rows;
    return filtered.slice(0, 80);
  }, [saas?.businessUsage, tenantQuery]);

  const blockedIps = telemetry?.security.blockedIps || [];
  const isIpBlocked = useCallback((ip: string) => blockedIps.includes(ip), [blockedIps]);

  const saveBlocklist = useCallback(async (nextIps: string[]) => {
    setSavingBlocklist(true);
    setSecurityMessage(null);
    try {
      const res = await fetch('/api/admin/telemetry/overview', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockedIps: nextIps }),
      });
      if (!res.ok) throw new Error('Failed to save blocklist');
      const updated = (await res.json()) as { blockedIps: string[] };
      setState((current) => ({
        ...current,
        telemetry: current.telemetry
          ? { ...current.telemetry, security: { ...current.telemetry.security, blockedIps: updated.blockedIps || [] } }
          : current.telemetry,
      }));
      setSecurityMessage('Saved blocklist.');
    } catch (err) {
      setSecurityMessage(err instanceof Error ? err.message : 'Failed to save blocklist');
    } finally {
      setSavingBlocklist(false);
    }
  }, []);

  const addBlockedIp = useCallback(async (ip: string) => {
    const cleaned = ip.trim();
    if (!cleaned) return;
    const next = Array.from(new Set([...blockedIps, cleaned])).slice(0, 400);
    await saveBlocklist(next);
  }, [blockedIps, saveBlocklist]);

  const removeBlockedIp = useCallback(async (ip: string) => {
    const next = blockedIps.filter((entry) => entry !== ip);
    await saveBlocklist(next);
  }, [blockedIps, saveBlocklist]);

  const toggleFeature = useCallback((key: PlatformFeatureControlKey) => {
    setFeatureDraft((prev) => {
      const base = prev || (platform?.featureControls as Record<PlatformFeatureControlKey, boolean>) || ({} as any);
      return { ...base, [key]: !base[key] };
    });
    setFeatureSaveMessage(null);
  }, [platform?.featureControls]);

  const saveFeatureControls = useCallback(async () => {
    if (!platform || !featureDraft) return;
    setSavingFeatures(true);
    setFeatureSaveMessage(null);
    try {
      const nextPlatform: PlatformConfig = { ...platform, featureControls: featureDraft };
      const res = await fetch('/api/platform', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPlatform),
      });
      if (!res.ok) throw new Error('Failed to save feature controls');
      const updated = (await res.json()) as PlatformConfig;
      setState((current) => ({ ...current, platform: updated }));
      setFeatureDraft(updated.featureControls);
      setFeatureSaveMessage('Saved. Changes apply across the portal.');
    } catch (err) {
      setFeatureSaveMessage(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingFeatures(false);
    }
  }, [featureDraft, platform]);

  useEffect(() => {
    if (!featureDraft) return;
    if (savingTimerRef.current) window.clearTimeout(savingTimerRef.current);
    savingTimerRef.current = window.setTimeout(() => {
      if (tab === 'features') void saveFeatureControls();
    }, 1100);
    return () => {
      if (savingTimerRef.current) window.clearTimeout(savingTimerRef.current);
    };
  }, [featureDraft, saveFeatureControls, tab]);

  if (loading) {
    return (
      <Card className="border-white/60 bg-white/82 backdrop-blur">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading command center...
        </CardContent>
      </Card>
    );
  }

  if (error || !saas || !intel || !platform || !telemetry) {
    return (
      <Card className="border-white/60 bg-white/82 backdrop-blur">
        <CardContent className="space-y-4 p-6">
          <p className="text-sm text-rose-600">{error || 'Unable to load command center.'}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()}>Retry</Button>
            <Button asChild variant="outline"><Link href="/workspace">Back</Link></Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600 backdrop-blur">
              <ShieldCheck className="h-3.5 w-3.5 text-slate-900" />
              Super Admin
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600 backdrop-blur">
              <Clock3 className="h-3.5 w-3.5 text-slate-900" />
              Updated {new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(new Date(telemetry.generatedAt))}
            </span>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-2xl">Command Center</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => void load()}>
            <Sparkles className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/pricing">Plans</Link>
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="w-full justify-start rounded-2xl bg-white/60 p-1 backdrop-blur sm:w-auto">
            <TabsTrigger value="overview" className="rounded-xl">Overview</TabsTrigger>
            <TabsTrigger value="traffic" className="rounded-xl">Traffic</TabsTrigger>
            <TabsTrigger value="behaviour" className="rounded-xl">Behaviour</TabsTrigger>
            <TabsTrigger value="events" className="rounded-xl">Live Feed</TabsTrigger>
            <TabsTrigger value="tenants" className="rounded-xl">Tenants</TabsTrigger>
            <TabsTrigger value="users" className="rounded-xl">
              <Users className="mr-2 h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="security" className="rounded-xl">Security</TabsTrigger>
            <TabsTrigger value="safety" className="rounded-xl">
              <AlertTriangle className="mr-2 h-4 w-4" />
              Safety
            </TabsTrigger>
            <TabsTrigger value="features" className="rounded-xl">Feature Controls</TabsTrigger>
            <TabsTrigger value="commerce" className="rounded-xl">
              <TicketPercent className="mr-2 h-4 w-4" />
              Commerce
            </TabsTrigger>
            <TabsTrigger value="withdrawals" className="rounded-xl">
              <Landmark className="mr-2 h-4 w-4" />
              Withdrawals
            </TabsTrigger>
            <TabsTrigger value="mail" className="rounded-xl">
              <Mail className="mr-2 h-4 w-4" />
              Mail
            </TabsTrigger>
            <TabsTrigger value="banners" className="rounded-xl">
              Banners
            </TabsTrigger>
            <TabsTrigger value="homepage" className="rounded-xl">
              <Layout className="mr-2 h-4 w-4" />
              Homepage
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-medium backdrop-blur ${statusPill(health?.software.status || 'healthy')}`}>
              Product {health?.software.score ?? 0}/100
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium backdrop-blur ${statusPill(health?.server.status || 'healthy')}`}>
              Server {health?.server.memoryPressurePercent ?? 0}%
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium backdrop-blur ${statusPill(health?.storage.status || 'healthy')}`}>
              Storage {formatBytes(health?.storage.totalEstimatedBytes ?? 0)}
            </span>
          </div>
        </div>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <Metric title="Tenants" value={formatCompactNumber(saas.totalBusinessAccounts)} detail={`${formatCompactNumber(saas.activeBusinessAccounts)} active · ${formatCompactNumber(saas.upgradeRequiredAccounts)} upgrade required`} />
            <Metric title="Visitors (24h)" value={formatCompactNumber(telemetry.traffic.uniqueVisitors24h)} detail={`${formatCompactNumber(telemetry.traffic.pageViews24h)} views · ${formatCompactNumber(telemetry.traffic.sessions24h)} sessions`} />
            <Metric title="Documents" value={formatCompactNumber(saas.totalGeneratedDocuments)} detail={`${formatCompactNumber(saas.totalFileTransfers || 0)} transfers`} />
            <Metric title="Income (30d)" value={formatCurrencyInrFromPaise(saas.income?.paid30dInPaise || 0)} detail={`${formatCompactNumber(saas.income?.paidTransactions || 0)} paid txns`} />
            <Metric title="User Pulse (7d)" value={formatCompactNumber(intel.totals.activeUsers7d)} detail={`${formatCompactNumber(intel.totals.totalActivityEvents)} events · ${intel.totals.averageFeedbackRating.toFixed(1)} rating`} />
            <Metric title="Surveys" value={formatCompactNumber(intel.totals.totalFeedbackResponses)} detail={`${intel.totals.averageFeedbackRating.toFixed(1)} avg · ${intel.totals.feedbackCoverageRate}% coverage`} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <Card className="border-white/60 bg-white/82 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-slate-950">
                  <TrendingUp className="h-4 w-4 text-slate-900" />
                  Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {combinedRecommendations.map((rec) => (
                  <div key={`${rec.source}-${rec.id}`} className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4 shadow-[0_14px_32px_rgba(148,163,184,0.08)] backdrop-blur">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${priorityPill(rec.priority)}`}>{rec.priority}</span>
                      <span className="rounded-full bg-slate-100/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">{rec.source}</span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-950">{rec.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{rec.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-white/60 bg-white/82 backdrop-blur">
                <CardHeader><CardTitle className="text-base text-slate-950">Plan distribution</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {planBars.map((item) => (
                    <div key={item.planId} className="space-y-2">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <p className="truncate font-medium text-slate-800">{item.planName}</p>
                        <p className="shrink-0 text-xs font-semibold text-slate-600">{item.businesses}</p>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-[linear-gradient(90deg,rgba(37,99,235,0.9),rgba(14,165,233,0.85))]" style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-white/60 bg-white/82 backdrop-blur">
                <CardHeader><CardTitle className="text-base text-slate-950">Income snapshot</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Paid</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{formatCurrencyInrFromPaise(saas.income?.totalPaidInPaise || 0)} total</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatCurrencyInrFromPaise(saas.income?.paid7dInPaise || 0)} (7d) · {formatCurrencyInrFromPaise(saas.income?.paid24hInPaise || 0)} (24h)
                    </p>
                    {saas.income?.lastPaidAt ? (
                      <p className="mt-1 text-xs text-slate-500">Last paid {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(saas.income.lastPaidAt))}</p>
                    ) : null}
                  </div>
                  {saas.income?.topProducts7d?.length ? (
                    <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Top products (7d)</p>
                      <div className="mt-3 space-y-3">
                        {saas.income.topProducts7d.slice(0, 8).map((item) => (
                          <div key={item.label} className="space-y-2">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <p className="truncate font-medium text-slate-800">{item.label}</p>
                              <p className="shrink-0 text-xs font-semibold text-slate-600">{formatCurrencyInrFromPaise(item.amountInPaise)}</p>
                            </div>
                            <div className="h-2 w-full rounded-full bg-slate-100">
                              <div
                                className="h-2 rounded-full bg-[linear-gradient(90deg,rgba(15,118,110,0.9),rgba(34,197,94,0.85))]"
                                style={{
                                  width: `${Math.min(100, Math.round((item.amountInPaise / Math.max(saas.income?.topProducts7d?.[0]?.amountInPaise || 1, 1)) * 100))}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-white/60 bg-white/82 backdrop-blur">
                <CardHeader><CardTitle className="text-base text-slate-950">Survey themes</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Top requests</p>
                    <div className="mt-3 space-y-2">
                      {(intel.survey?.topRequestedThemes || intel.feedbackInsights?.topRequests || []).slice(0, 6).map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                          <p className="truncate font-medium text-slate-800">{row.label}</p>
                          <p className="shrink-0 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">{row.count}</p>
                        </div>
                      ))}
                      {(intel.survey?.topRequestedThemes || intel.feedbackInsights?.topRequests || []).length === 0 ? (
                        <p className="text-sm text-slate-600">No repeated request themes yet.</p>
                      ) : null}
                    </div>
                  </div>
                  <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Top pain points</p>
                    <div className="mt-3 space-y-2">
                      {(intel.survey?.topPainThemes || intel.feedbackInsights?.painPointThemes || []).slice(0, 6).map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
                          <p className="truncate font-medium text-slate-800">{row.label}</p>
                          <p className="shrink-0 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">{row.count}</p>
                        </div>
                      ))}
                      {(intel.survey?.topPainThemes || intel.feedbackInsights?.painPointThemes || []).length === 0 ? (
                        <p className="text-sm text-slate-600">No repeated pain themes yet.</p>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/60 bg-white/82 backdrop-blur">
                <CardHeader><CardTitle className="text-base text-slate-950">Traffic pulse</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Live</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{telemetry.traffic.liveVisitors5m} visitors in last 5 minutes</p>
                    <p className="mt-1 text-xs text-slate-500">Bounce {telemetry.traffic.bounceRate24h}% · Avg session {telemetry.traffic.avgSessionSeconds24h}s</p>
                  </div>
                  <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Top page</p>
                    <p className="mt-2 text-sm font-semibold text-slate-950">{telemetry.traffic.topPages24h[0]?.path || '/'}</p>
                    <p className="mt-1 text-xs text-slate-500">{telemetry.traffic.topPages24h[0]?.views || 0} views</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="withdrawals" className="mt-6 space-y-4">
          <Card className="border-white/60 bg-white/82 backdrop-blur">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-base text-slate-950">
                <Landmark className="h-4 w-4 text-slate-900" />
                Template Withdrawals
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={withdrawalStatus}
                  onChange={(e) => setWithdrawalStatus(e.target.value as any)}
                  className="h-10 rounded-full border border-white/70 bg-white/70 px-4 text-sm font-semibold text-slate-900"
                >
                  <option value="requested">Requested</option>
                  <option value="approved">Approved</option>
                  <option value="paid">Paid</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="all">All</option>
                </select>
                <Button variant="outline" className="rounded-full" onClick={() => void loadWithdrawals()}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {withdrawalsMessage ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm text-rose-800">
                  {withdrawalsMessage}
                </div>
              ) : null}

              {withdrawalsLoading ? (
                <div className="flex items-center gap-2 rounded-[1.3rem] border border-white/70 bg-white/60 p-6 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : withdrawals.length ? (
                <div className="grid gap-3">
                  {withdrawals.slice(0, 200).map((w) => (
                    <div key={w.id} className="rounded-[1.4rem] border border-white/70 bg-white/70 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">
                            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((w.amountInPaise || 0) / 100)}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">{w.sellerEmail || w.sellerUserId}</p>
                          <p className="mt-2 text-xs text-slate-600">{w.payoutMethod?.label}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{w.payoutMethod?.details}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
                            {String(w.status || 'requested')}
                          </span>
                          <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
                            {new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' }).format(new Date(w.requestedAt))}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                            onClick={() => {
                              setWithdrawalDialogTargetId(w.id);
                              setWithdrawalAdminNote(w.adminNote || '');
                              setWithdrawalTxnRef(w.transactionRef || '');
                              setWithdrawalDialogOpen(true);
                            }}
                          >
                            Review
                          </Button>
                        </div>
                      </div>
                      {w.transactionRef ? (
                        <div className="mt-3 rounded-2xl border border-white/70 bg-white/70 px-3 py-2 text-xs text-slate-700">
                          <span className="font-semibold text-slate-950">Ref:</span> {w.transactionRef}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.4rem] border border-dashed border-white/70 bg-white/60 p-6 text-sm text-slate-600">
                  No withdrawal requests.
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={withdrawalDialogOpen} onOpenChange={setWithdrawalDialogOpen}>
            <DialogContent className="max-w-lg overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/85 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
              <DialogHeader>
                <div className="border-b border-white/60 px-5 pb-4 pt-5">
                  <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-slate-950">Withdrawal review</DialogTitle>
                  <p className="mt-1 text-sm text-slate-600">{withdrawalDialogTargetId}</p>
                </div>
              </DialogHeader>
              <div className="space-y-4 px-5 py-5">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Admin note</span>
                  <textarea
                    value={withdrawalAdminNote}
                    onChange={(e) => setWithdrawalAdminNote(e.target.value)}
                    className="mt-2 min-h-[110px] w-full rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none"
                    placeholder="Optional"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Transaction ref (UTR)</span>
                  <Input
                    value={withdrawalTxnRef}
                    onChange={(e) => setWithdrawalTxnRef(e.target.value)}
                    className="mt-2 rounded-[1.1rem] border-slate-200 bg-white"
                    placeholder="UTR / txn id"
                  />
                </label>

                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => setWithdrawalDialogOpen(false)}
                    disabled={withdrawalActionBusy}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                    onClick={() => void updateWithdrawal({ id: withdrawalDialogTargetId, action: 'reject', adminNote: withdrawalAdminNote })}
                    disabled={withdrawalActionBusy || !withdrawalDialogTargetId}
                  >
                    Reject
                  </Button>
                  <Button
                    type="button"
                    className="h-10 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-900"
                    onClick={() => void updateWithdrawal({ id: withdrawalDialogTargetId, action: 'approve', adminNote: withdrawalAdminNote })}
                    disabled={withdrawalActionBusy || !withdrawalDialogTargetId}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    className="h-10 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500"
                    onClick={() => void updateWithdrawal({ id: withdrawalDialogTargetId, action: 'mark_paid', adminNote: withdrawalAdminNote, transactionRef: withdrawalTxnRef })}
                    disabled={withdrawalActionBusy || !withdrawalDialogTargetId || !withdrawalTxnRef.trim()}
                  >
                    Mark paid
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="mail" className="mt-6 space-y-6">
          <SuperAdminMailCenter />
        </TabsContent>

        <TabsContent value="traffic" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Metric title="Live visitors" value={formatCompactNumber(telemetry.traffic.liveVisitors5m)} detail="Unique visitors (last 5 min)" />
            <Metric title="Page views (24h)" value={formatCompactNumber(telemetry.traffic.pageViews24h)} detail={`${formatCompactNumber(telemetry.traffic.uniqueVisitors24h)} visitors`} />
            <Metric title="Sessions (24h)" value={formatCompactNumber(telemetry.traffic.sessions24h)} detail={`Avg ${telemetry.traffic.avgSessionSeconds24h}s`} />
            <Metric title="Bounce (24h)" value={`${telemetry.traffic.bounceRate24h}%`} detail="1-page sessions estimate" />
            <Metric title="Signups (24h)" value={formatCompactNumber(telemetry.traffic.signups24h)} detail={`${formatCompactNumber(telemetry.traffic.logins24h)} logins`} />
            <Metric title="Intent (24h)" value={formatCompactNumber(telemetry.traffic.ctaClicks24h)} detail={`${formatCompactNumber(telemetry.traffic.searches24h)} searches`} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
            <Card className="border-white/60 bg-white/82 backdrop-blur">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base text-slate-950"><BarChart3 className="h-4 w-4" />Top pages (24h)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {telemetry.traffic.topPages24h.map((item) => (
                  <div key={item.path} className="flex items-center justify-between gap-3 rounded-[1.05rem] border border-white/70 bg-white/60 px-4 py-3">
                    <p className="truncate text-sm font-medium text-slate-800">{item.path}</p>
                    <span className="shrink-0 rounded-full bg-slate-100/80 px-2.5 py-1 text-xs font-semibold text-slate-700">{item.views}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="space-y-6">
              <Card className="border-white/60 bg-white/82 backdrop-blur">
                <CardHeader><CardTitle className="flex items-center gap-2 text-base text-slate-950"><Globe2 className="h-4 w-4" />Referrers (24h)</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {telemetry.traffic.topReferrers24h.map((item) => (
                    <div key={item.referrer} className="flex items-center justify-between gap-3 rounded-[1.05rem] border border-white/70 bg-white/60 px-4 py-3">
                      <p className="truncate text-sm font-medium text-slate-800">{item.referrer}</p>
                      <span className="shrink-0 rounded-full bg-slate-100/80 px-2.5 py-1 text-xs font-semibold text-slate-700">{item.views}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-white/60 bg-white/82 backdrop-blur">
                <CardHeader><CardTitle className="text-base text-slate-950">Top intent signals (24h)</CardTitle></CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Top CTAs</p>
                    <div className="mt-3 space-y-2">
                      {(telemetry.traffic.topCtas24h || []).slice(0, 5).map((item) => (
                        <div key={item.ctaId} className="flex items-center justify-between gap-3 text-sm">
                          <p className="min-w-0 truncate text-slate-700">{item.ctaId}</p>
                          <p className="shrink-0 font-semibold text-slate-900">{formatCompactNumber(item.clicks)}</p>
                        </div>
                      ))}
                      {telemetry.traffic.topCtas24h.length === 0 ? <p className="text-sm text-slate-500">No CTA clicks yet.</p> : null}
                    </div>
                  </div>
                  <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Top searches</p>
                    <div className="mt-3 space-y-2">
                      {(telemetry.traffic.topSearches24h || []).slice(0, 5).map((item) => (
                        <div key={item.query} className="flex items-center justify-between gap-3 text-sm">
                          <p className="min-w-0 truncate text-slate-700">{item.query}</p>
                          <p className="shrink-0 font-semibold text-slate-900">{formatCompactNumber(item.searches)}</p>
                        </div>
                      ))}
                      {telemetry.traffic.topSearches24h.length === 0 ? <p className="text-sm text-slate-500">No searches yet.</p> : null}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-white/60 bg-white/82 backdrop-blur">
                <CardHeader><CardTitle className="text-base text-slate-950">Top workspace opens (24h)</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(telemetry.traffic.topWorkspaceFeatures24h || []).slice(0, 8).map((item) => (
                    <div key={item.featureId} className="flex items-center justify-between gap-3 rounded-[1.05rem] border border-white/70 bg-white/60 px-4 py-3">
                      <p className="truncate text-sm font-medium text-slate-800">{prettyFeatureLabel(item.featureId)}</p>
                      <span className="shrink-0 rounded-full bg-slate-100/80 px-2.5 py-1 text-xs font-semibold text-slate-700">{formatCompactNumber(item.opens)}</span>
                    </div>
                  ))}
                  {telemetry.traffic.topWorkspaceFeatures24h.length === 0 ? (
                    <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4 text-sm text-slate-600">No workspace feature opens tracked yet.</div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-white/60 bg-white/82 backdrop-blur">
                <CardHeader><CardTitle className="text-base text-slate-950">Device mix (24h)</CardTitle></CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2">
                  {telemetry.traffic.deviceMix24h.map((item) => (
                    <div key={item.device} className="rounded-[1.05rem] border border-white/70 bg-white/60 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{item.device}</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{formatCompactNumber(item.views)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="behaviour" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Metric title="Active users (7d)" value={formatCompactNumber(intel.totals.activeUsers7d)} detail={`${formatCompactNumber(intel.totals.activeUsers24h)} active today`} />
            <Metric title="Time on page (24h)" value={`${Math.round((telemetry.behaviour.avgTimeOnPageSeconds24h || 0) / 60)}m`} detail={`${telemetry.behaviour.avgTimeOnPageSeconds24h}s average`} />
            <Metric title="Returning (7d)" value={`${telemetry.behaviour.returningVisitorRate7d}%`} detail="Visitors with 2+ sessions" />
            <Metric title="Feedback coverage" value={`${Math.round(intel.totals.feedbackCoverageRate)}%`} detail={`${formatCompactNumber(intel.totals.totalFeedbackResponses)} responses`} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card className="border-white/60 bg-white/82 backdrop-blur">
              <CardHeader><CardTitle className="text-base text-slate-950">Top tabs (7d)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {topTabs.map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <p className="truncate font-medium text-slate-800">{item.label}</p>
                      <p className="shrink-0 text-xs font-semibold text-slate-600">{item.count}</p>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-[linear-gradient(90deg,rgba(16,185,129,0.9),rgba(59,130,246,0.88))]" style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-white/60 bg-white/82 backdrop-blur">
              <CardHeader><CardTitle className="flex items-center gap-2 text-base text-slate-950"><TrendingUp className="h-4 w-4" />Funnels and exits</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {telemetry.behaviour.funnels.map((funnel) => (
                    <div key={funnel.id} className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4">
                      <p className="text-sm font-semibold text-slate-950">{funnel.label}</p>
                      <div className="mt-3 grid gap-2">
                        {funnel.steps.map((step) => (
                          <div key={`${funnel.id}-${step.label}`} className="flex items-center justify-between gap-3 text-sm">
                            <p className="min-w-0 truncate text-slate-700">{step.label}</p>
                            <p className="shrink-0 font-semibold text-slate-900">{formatCompactNumber(step.count)} · {step.rateFromPrev}%</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4">
                  <p className="text-sm font-semibold text-slate-950">Top exits (24h)</p>
                  <div className="mt-3 space-y-2">
                    {telemetry.behaviour.topExitPages24h.slice(0, 8).map((item) => (
                      <div key={item.path} className="flex items-center justify-between gap-3 text-sm">
                        <p className="min-w-0 truncate text-slate-700">{item.path}</p>
                        <p className="shrink-0 font-semibold text-slate-900">{formatCompactNumber(item.exits)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4 text-sm text-slate-600">
                  {intel.feedbackInsights.summary}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="events" className="mt-6 space-y-6">
          <Card className="border-white/60 bg-white/82 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-3 text-base text-slate-950">
                <span className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-slate-900" />
                  Live activity feed
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="rounded-full" onClick={() => void loadEvents()} disabled={eventLoading}>
                    {eventLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full"
                    onClick={() => {
                      setEventLoading(true);
                      setEventMessage(null);
                      fetch('/api/admin/telemetry/events', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ maxAgeDays: 60, keepLatest: 20000 }),
                      })
                        .then((r) => r.json())
                        .then(() => loadEvents())
                        .catch((err) => setEventMessage(err instanceof Error ? err.message : 'Failed to purge telemetry'))
                        .finally(() => setEventLoading(false));
                    }}
                    disabled={eventLoading}
                  >
                    Purge 60d+
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,180px)_minmax(0,210px)_minmax(0,1fr)]">
                <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Surface</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(['all', 'public', 'workspace'] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setEventFilterSurface(value)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${eventFilterSurface === value ? 'bg-slate-950 text-white' : 'bg-white/70 text-slate-700 hover:bg-white/85'}`}
                      >
                        {value === 'all' ? 'All' : value}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Type</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {([
                      { id: 'all', label: 'All' },
                      { id: 'page_view', label: 'Views' },
                      { id: 'cta_click', label: 'CTAs' },
                      { id: 'search', label: 'Search' },
                      { id: 'feature_open', label: 'Feature' },
                      { id: 'login', label: 'Login' },
                      { id: 'signup', label: 'Signup' },
                    ] as const).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setEventFilterType(item.id)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition ${eventFilterType === item.id ? 'bg-slate-950 text-white' : 'bg-white/70 text-slate-700 hover:bg-white/85'}`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Path contains</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      value={eventFilterPath}
                      onChange={(e) => setEventFilterPath(e.target.value)}
                      placeholder="e.g. /pricing or /workspace"
                      className="h-10 rounded-2xl border-white/70 bg-white/70 backdrop-blur"
                    />
                    <Button variant="outline" className="h-10 rounded-2xl" onClick={() => void loadEvents()} disabled={eventLoading}>
                      Apply
                    </Button>
                  </div>
                </div>
              </div>

              {eventMessage ? (
                <div className="rounded-[1.15rem] border border-white/70 bg-white/60 px-4 py-3 text-sm text-rose-700">{eventMessage}</div>
              ) : null}

              <div className="overflow-hidden rounded-[1.35rem] border border-white/70 bg-white/55">
                <div className="grid grid-cols-[140px_90px_1fr] gap-0 border-b border-white/70 bg-white/65 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  <span>When</span>
                  <span>Type</span>
                  <span>Path</span>
                </div>
                <div className="max-h-[520px] overflow-auto">
                  {events.length ? events.slice(0, 200).map((ev) => (
                    <div key={ev.id} className="grid grid-cols-[140px_90px_1fr] gap-0 border-b border-white/50 px-4 py-3 text-sm last:border-b-0">
                      <div className="pr-3 text-xs text-slate-600">
                        <p className="font-medium text-slate-800">{formatAgo(ev.createdAt)}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ev.createdAt))}</p>
                      </div>
                      <div className="pr-3">
                        <span className="inline-flex items-center rounded-full bg-slate-100/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">{ev.type}</span>
                        <p className="mt-1 text-[11px] text-slate-500">{ev.surface}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">{ev.path}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          {ev.ctaId ? <span className="rounded-full bg-white/70 px-2 py-0.5">cta:{ev.ctaId}</span> : null}
                          {ev.featureId ? <span className="rounded-full bg-white/70 px-2 py-0.5">feature:{ev.featureId}</span> : null}
                          {ev.query ? <span className="rounded-full bg-white/70 px-2 py-0.5">q:{ev.query}</span> : null}
                          {ev.ip ? <span className="rounded-full bg-white/70 px-2 py-0.5">ip:{ev.ip}</span> : null}
                          {ev.userRole ? <span className="rounded-full bg-white/70 px-2 py-0.5">role:{ev.userRole}</span> : null}
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="px-4 py-10 text-center text-sm text-slate-600">
                      {eventLoading ? 'Loading events…' : 'No events match these filters yet.'}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tenants" className="mt-6 space-y-6">
          <Card className="border-white/60 bg-white/82 backdrop-blur">
            <CardHeader className="pb-3"><CardTitle className="text-base text-slate-950">Tenant command table</CardTitle></CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="w-full sm:max-w-md">
                  <Input value={tenantQuery} onChange={(e) => setTenantQuery(e.target.value)} placeholder="Search by org, email, plan, industry..." className="h-11 rounded-2xl border-white/70 bg-white/70 backdrop-blur" />
                </div>
              </div>

              <div className="overflow-hidden rounded-[1.35rem] border border-white/70 bg-white/60">
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.6fr)] gap-3 border-b border-white/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <span>Tenant</span>
                  <span>Plan</span>
                  <span>Setup</span>
                  <span>Docs</span>
                  <span>Remaining</span>
                </div>
                <div className="divide-y divide-white/60">
                  {tenantRows.map((row) => (
                    <div key={row.userId} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.6fr)] gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-950">{row.organizationName || row.name}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{row.email}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800">{row.planName || 'Plan'}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{row.status || 'unknown'}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{row.score}%</p>
                        <p className="mt-0.5 text-xs text-slate-500">{row.workspacePreset || 'preset'}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{formatCompactNumber(row.generatedDocuments)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{row.industry || 'industry'}</p>
                      </div>
                      <div><p className="font-semibold text-slate-900">{formatCompactNumber(row.remainingGenerations)}</p></div>
                    </div>
                  ))}
                  {tenantRows.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-slate-600">No tenants match the current filter.</div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-6 space-y-6">
          <SuperAdminUserCenter />
        </TabsContent>

        <TabsContent value="security" className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <Card className="border-white/60 bg-white/82 backdrop-blur">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-slate-950">
                  <ShieldAlert className="h-4 w-4 text-slate-900" />
                  Suspicious traffic (24h)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {telemetry.security.suspiciousIps24h.length ? telemetry.security.suspiciousIps24h.map((entry) => (
                  <div key={entry.ip} className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{entry.ip}</p>
                        <p className="mt-1 text-xs text-slate-500">{entry.events} events</p>
                      </div>
                      <Button variant="outline" size="sm" className="rounded-full" onClick={() => void addBlockedIp(entry.ip)} disabled={savingBlocklist || isIpBlocked(entry.ip)}>
                        <Ban className="mr-2 h-4 w-4" />
                        {isIpBlocked(entry.ip) ? 'Blocked' : 'Block'}
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {entry.topPaths.map((p) => (
                        <div key={`${entry.ip}-${p.path}`} className="flex items-center justify-between gap-3 text-xs text-slate-600">
                          <p className="min-w-0 truncate">{p.path}</p>
                          <p className="shrink-0 font-semibold text-slate-800">{p.count}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )) : (
                  <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4 text-sm text-slate-600">
                    No suspicious IP spikes detected in the last 24 hours.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/60 bg-white/82 backdrop-blur">
              <CardHeader className="pb-3"><CardTitle className="text-base text-slate-950">IP blocklist</CardTitle></CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="flex gap-2">
                  <Input value={ipDraft} onChange={(e) => setIpDraft(e.target.value)} placeholder="Add IP to blocklist..." className="h-11 rounded-2xl border-white/70 bg-white/70 backdrop-blur" />
                  <Button className="h-11 rounded-2xl bg-slate-950 text-white hover:bg-slate-800" disabled={savingBlocklist} onClick={() => void addBlockedIp(ipDraft).then(() => setIpDraft(''))}>
                    Add
                  </Button>
                </div>
                {securityMessage ? (
                  <div className="rounded-[1.15rem] border border-white/70 bg-white/60 px-4 py-3 text-sm text-slate-700">{securityMessage}</div>
                ) : null}
                <div className="space-y-2">
                  {blockedIps.length ? blockedIps.slice(0, 80).map((ip) => (
                    <div key={ip} className="flex items-center justify-between gap-3 rounded-[1.05rem] border border-white/70 bg-white/60 px-4 py-3 text-sm">
                      <p className="truncate font-medium text-slate-800">{ip}</p>
                      <Button variant="outline" size="sm" className="rounded-full" disabled={savingBlocklist} onClick={() => void removeBlockedIp(ip)}>
                        Remove
                      </Button>
                    </div>
                  )) : (
                    <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4 text-sm text-slate-600">No blocked IPs yet.</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="safety" className="mt-6 space-y-6">
          <Card className="border-white/60 bg-white/82 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-slate-950">
                <AlertTriangle className="h-4 w-4 text-slate-900" />
                Gigs safety reports
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(['pending', 'approved', 'rejected', 'all'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSafetyStatus(key)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        safetyStatus === key
                          ? 'border-slate-900 bg-slate-950 text-white'
                          : 'border-slate-200 bg-white/70 text-slate-700 hover:bg-white'
                      }`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
                <Button variant="outline" className="rounded-full" onClick={() => void loadSafetyReports()} disabled={safetyLoading}>
                  {safetyLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Refresh
                </Button>
              </div>

              {safetyMessage ? (
                <div className="rounded-[1.15rem] border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-900">
                  {safetyMessage}
                </div>
              ) : null}

              {safetyReports.length === 0 ? (
                <div className="rounded-[1.15rem] border border-white/70 bg-white/60 p-4 text-sm text-slate-600">
                  No reports.
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {safetyReports.slice(0, 60).map((report) => (
                    <div key={report.id} className="rounded-[1.35rem] border border-white/70 bg-white/60 p-4 shadow-[0_12px_30px_rgba(148,163,184,0.08)] backdrop-blur">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{report.reason}</p>
                          <p className="mt-1 text-xs text-slate-600">Gig: {report.gigSlug} · Status: {report.status}</p>
                          <p className="mt-1 text-xs text-slate-600">Accused: {report.accusedEmail || report.accusedUserId}</p>
                        </div>
                        <Button asChild variant="outline" size="sm" className="rounded-full">
                          <Link href={`/gigs/${report.gigSlug}`}>View</Link>
                        </Button>
                      </div>
                      {report.details ? (
                        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-700 whitespace-pre-wrap">{report.details}</p>
                      ) : null}
                      {report.evidence?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {report.evidence.slice(0, 3).map((ev) => (
                            <span key={ev.name} className="rounded-full bg-slate-100/80 px-3 py-1 text-[11px] font-semibold text-slate-700">
                              {ev.name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {report.status === 'pending' ? (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <Button
                            className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                            disabled={safetyLoading}
                            onClick={async () => {
                              setSafetyMessage(null);
                              setSafetyLoading(true);
                              try {
                                const res = await fetch('/api/admin/gigs/safety/reports', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: report.id, action: 'approve' }),
                                });
                                const payload = await res.json().catch(() => null);
                                if (!res.ok) throw new Error(payload?.error || 'Approval failed');
                                await loadSafetyReports();
                              } catch (err) {
                                setSafetyMessage(err instanceof Error ? err.message : 'Approval failed');
                              } finally {
                                setSafetyLoading(false);
                              }
                            }}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            className="rounded-full border-rose-200 text-rose-700 hover:bg-rose-50"
                            disabled={safetyLoading}
                            onClick={async () => {
                              setSafetyMessage(null);
                              setSafetyLoading(true);
                              try {
                                const res = await fetch('/api/admin/gigs/safety/reports', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ id: report.id, action: 'reject' }),
                                });
                                const payload = await res.json().catch(() => null);
                                if (!res.ok) throw new Error(payload?.error || 'Rejection failed');
                                await loadSafetyReports();
                              } catch (err) {
                                setSafetyMessage(err instanceof Error ? err.message : 'Rejection failed');
                              } finally {
                                setSafetyLoading(false);
                              }
                            }}
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commerce" className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <Card className="border-white/60 bg-white/82 backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-slate-950">
                  <TicketPercent className="h-4 w-4 text-slate-900" />
                  Coupons
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {commerceMessage ? (
                  <div className="rounded-[1.15rem] border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-900">
                    {commerceMessage}
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-3">
                  <Input value={couponDraftCode} onChange={(e) => setCouponDraftCode(e.target.value)} placeholder="Code (optional)" className="h-11 rounded-2xl border-white/70 bg-white/70 backdrop-blur" />
                  <Input value={couponDraftPercent} onChange={(e) => setCouponDraftPercent(e.target.value)} placeholder="% off" className="h-11 rounded-2xl border-white/70 bg-white/70 backdrop-blur" />
                  <Input value={couponDraftMax} onChange={(e) => setCouponDraftMax(e.target.value)} placeholder="Max redemptions" className="h-11 rounded-2xl border-white/70 bg-white/70 backdrop-blur" />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                    disabled={commerceLoading}
                    onClick={async () => {
                      setCommerceMessage(null);
                      setCommerceLoading(true);
                      try {
                        const res = await fetch('/api/admin/commerce/coupons', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            code: couponDraftCode.trim() || undefined,
                            percentOff: Number(couponDraftPercent),
                            maxRedemptions: couponDraftMax.trim() ? Number(couponDraftMax) : undefined,
                          }),
                        });
                        const payload = await res.json().catch(() => null);
                        if (!res.ok) throw new Error(payload?.error || 'Unable to create coupon');
                        setCouponDraftCode('');
                        setCouponDraftMax('');
                        await loadCommerce();
                      } catch (err) {
                        setCommerceMessage(err instanceof Error ? err.message : 'Unable to create coupon');
                      } finally {
                        setCommerceLoading(false);
                      }
                    }}
                  >
                    {commerceLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create coupon
                  </Button>
                  <Button variant="outline" className="rounded-full" onClick={() => void loadCommerce()}>
                    Refresh
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {coupons.slice(0, 30).map((coupon) => (
                    <div key={coupon.id} className="rounded-[1.35rem] border border-white/70 bg-white/60 p-4 shadow-[0_12px_30px_rgba(148,163,184,0.08)] backdrop-blur">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{coupon.code}</p>
                          <p className="mt-1 text-xs text-slate-600">{coupon.percentOff}% OFF · {coupon.redeemedCount}{coupon.maxRedemptions ? `/${coupon.maxRedemptions}` : ''} used</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={coupon.active ? 'outline' : 'default'}
                          className={coupon.active ? 'rounded-full' : 'rounded-full bg-slate-950 text-white hover:bg-slate-800'}
                          onClick={async () => {
                            setCommerceMessage(null);
                            setCommerceLoading(true);
                            try {
                              const res = await fetch('/api/admin/commerce/coupons', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: coupon.id, active: !coupon.active }),
                              });
                              const payload = await res.json().catch(() => null);
                              if (!res.ok) throw new Error(payload?.error || 'Unable to update coupon');
                              await loadCommerce();
                            } catch (err) {
                              setCommerceMessage(err instanceof Error ? err.message : 'Unable to update coupon');
                            } finally {
                              setCommerceLoading(false);
                            }
                          }}
                        >
                          {coupon.active ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* ══════════════════════════════════════════════════════════
                REFERRAL PROGRAM — FULL TRACKING DASHBOARD
            ══════════════════════════════════════════════════════════ */}
            <Card className="border-white/60 bg-white/82 backdrop-blur">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-950">
                    <Gift className="h-4 w-4 text-indigo-600" />
                    Referral Program — Docrud Infinity
                  </CardTitle>
                  <div className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    Live tracking
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 pt-0">

                {/* ── Summary KPI cards ── */}
                {referralSummary ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Invites Sent',    value: referralSummary.totalInvitesSent,    sub: `${referralSummary.invites30d} last 30d`,    color: 'text-indigo-600',  bg: 'bg-indigo-50',  border: 'border-indigo-100' },
                      { label: 'Activations',     value: referralSummary.totalActivations,    sub: `${referralSummary.activations30d} last 30d`, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
                      { label: 'Bonuses Granted', value: referralSummary.totalBonusesGranted, sub: 'Docrud Infinity unlocked free',               color: 'text-indigo-600',  bg: 'bg-indigo-50',  border: 'border-indigo-100' },
                      { label: 'Conversion Rate', value: `${referralSummary.conversionRate}%`,sub: `${referralSummary.uniqueReferrers} referrers`,color: 'text-violet-600',  bg: 'bg-violet-50',  border: 'border-violet-100' },
                    ].map(({ label, value, sub, color, bg, border }) => (
                      <div key={label} className={`rounded-2xl border ${border} ${bg} px-4 py-3`}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                        <p className={`mt-1 text-[1.6rem] font-black leading-none tracking-tight ${color}`}>{value}</p>
                        <p className="mt-1 text-[10.5px] text-slate-500">{sub}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[1,2,3,4].map((i) => (
                      <div key={i} className="h-[90px] animate-pulse rounded-2xl bg-slate-100" />
                    ))}
                  </div>
                )}

                {/* ── Programme mechanic banner ── */}
                <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
                  <p className="text-[12.5px] text-slate-700 leading-5">
                    <strong className="text-slate-900">How it works:</strong> A user shares their referral link. When the invited person completes signup, the referrer&apos;s{' '}
                    <strong className="text-indigo-700">Docrud Infinity ∞</strong> badge is activated for free — one-time per referrer. Referrals can be sent to unlimited people.
                  </p>
                </div>

                {/* ── Sub-navigation tabs ── */}
                <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  {(['overview', 'leaderboard', 'activations', 'invites'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setReferralSubTab(t)}
                      className={[
                        'flex-1 rounded-[9px] py-1.5 text-[11.5px] font-semibold capitalize transition-all',
                        referralSubTab === t
                          ? 'bg-white shadow-sm text-slate-900'
                          : 'text-slate-500 hover:text-slate-700',
                      ].join(' ')}
                    >
                      {t}{t === 'activations' && referralActivations.length > 0 ? ` (${referralActivations.length})` : ''}
                      {t === 'invites' && referralInvites.length > 0 ? ` (${referralInvites.length})` : ''}
                    </button>
                  ))}
                </div>

                {/* ── Overview ── */}
                {referralSubTab === 'overview' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Unique Referrers</p>
                        <p className="mt-1 text-[1.4rem] font-black text-slate-900">{referralSummary?.uniqueReferrers ?? '—'}</p>
                        <p className="text-[10.5px] text-slate-400">Users who have sent ≥1 invite</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Referred Signups</p>
                        <p className="mt-1 text-[1.4rem] font-black text-slate-900">{referralSummary?.uniqueReferees ?? '—'}</p>
                        <p className="text-[10.5px] text-slate-400">Accounts created via referral</p>
                      </div>
                    </div>
                    {/* Recent activations mini list */}
                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                      <div className="bg-slate-50 px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.18em] text-slate-500">
                        Recent activations
                      </div>
                      <div className="divide-y divide-slate-100">
                        {referralActivations.slice(0, 5).map((act) => (
                          <div key={act.id} className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-[12px] font-semibold text-slate-900">{act.referrerName}</p>
                              <p className="truncate text-[10.5px] text-slate-400">{act.referrerEmail} → referred {act.refereeEmail}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <span className={[
                                'rounded-full px-2.5 py-0.5 text-[10px] font-bold',
                                act.bonusGrantedAt
                                  ? 'bg-indigo-100 text-indigo-700'
                                  : 'bg-slate-100 text-slate-500',
                              ].join(' ')}>
                                {act.bonusGrantedAt ? '∞ Granted' : 'Activated'}
                              </span>
                              <p className="mt-0.5 text-[9.5px] text-slate-400">
                                {new Date(act.activatedAt).toLocaleDateString('en-IN')}
                              </p>
                            </div>
                          </div>
                        ))}
                        {referralActivations.length === 0 && (
                          <div className="px-4 py-6 text-center text-[12px] text-slate-400">
                            No activations yet — share the referral programme!
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Leaderboard ── */}
                {referralSubTab === 'leaderboard' && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="hidden grid-cols-[2fr_1fr_1fr_1fr] border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-500 sm:grid">
                      <div>Referrer</div>
                      <div className="text-center">Invites</div>
                      <div className="text-center">Activations</div>
                      <div className="text-center">Bonus</div>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {referralLeaderboard.map((row, idx) => (
                        <div key={row.userId} className="grid grid-cols-1 gap-1 px-4 py-3.5 sm:grid-cols-[2fr_1fr_1fr_1fr] sm:items-center sm:gap-0">
                          <div className="flex items-center gap-2.5">
                            <span className={[
                              'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black',
                              idx === 0 ? 'bg-amber-400/20 text-amber-600'
                              : idx === 1 ? 'bg-slate-300/40 text-slate-600'
                              : idx === 2 ? 'bg-orange-300/30 text-orange-600'
                              : 'bg-slate-100 text-slate-400',
                            ].join(' ')}>{idx + 1}</span>
                            <div className="min-w-0">
                              <p className="truncate text-[12.5px] font-semibold text-slate-900">{row.name}</p>
                              <p className="truncate text-[10.5px] text-slate-400">{row.email}</p>
                              {row.org !== '—' && <p className="truncate text-[10px] text-slate-400">{row.org}</p>}
                            </div>
                          </div>
                          <div className="text-center text-[13px] font-bold text-slate-700 sm:block">{row.invitesSent}</div>
                          <div className="text-center text-[13px] font-bold text-emerald-700 sm:block">{row.activations}</div>
                          <div className="text-center sm:block">
                            {row.bonusGranted ? (
                              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-black text-indigo-700">∞ Infinity Free</span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-400">Pending</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {referralLeaderboard.length === 0 && (
                        <div className="px-4 py-6 text-center text-[12px] text-slate-400">No referrers tracked yet.</div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Activations log ── */}
                {referralSubTab === 'activations' && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="hidden grid-cols-[1.5fr_1.5fr_1fr_0.8fr] border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-500 sm:grid">
                      <div>Referrer</div>
                      <div>Referee (new signup)</div>
                      <div>Activated</div>
                      <div>Bonus</div>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                      {referralActivations.map((act) => (
                        <div key={act.id} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[1.5fr_1.5fr_1fr_0.8fr] sm:items-center sm:gap-0">
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold text-slate-900">{act.referrerName}</p>
                            <p className="truncate text-[10.5px] text-slate-400">{act.referrerEmail}</p>
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[12px] text-slate-700">{act.refereeName}</p>
                            <p className="truncate text-[10.5px] text-slate-400">{act.refereeEmail}</p>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {new Date(act.activatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </div>
                          <div>
                            {act.bonusGrantedAt ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">✦ Granted</span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">—</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {referralActivations.length === 0 && (
                        <div className="px-4 py-6 text-center text-[12px] text-slate-400">No activations yet.</div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Invites log ── */}
                {referralSubTab === 'invites' && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="hidden grid-cols-[1.5fr_1.5fr_1fr_0.8fr] border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-500 sm:grid">
                      <div>Referrer</div>
                      <div>Invited Email</div>
                      <div>Sent</div>
                      <div>Signed up?</div>
                    </div>
                    <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                      {referralInvites.map((inv) => (
                        <div key={inv.id} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[1.5fr_1.5fr_1fr_0.8fr] sm:items-center sm:gap-0">
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-semibold text-slate-900">{inv.referrerName}</p>
                            <p className="truncate text-[10.5px] text-slate-400">{inv.referrerEmail}</p>
                          </div>
                          <div className="truncate text-[12px] text-slate-700">{inv.inviteeEmail}</div>
                          <div className="text-[11px] text-slate-500">
                            {new Date(inv.sentAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </div>
                          <div>
                            {inv.signedUpAt ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓ Yes</span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400">Pending</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {referralInvites.length === 0 && (
                        <div className="px-4 py-6 text-center text-[12px] text-slate-400">No email invites sent yet.</div>
                      )}
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="features" className="mt-6 space-y-6">
          <Card className="border-white/60 bg-white/82 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-slate-950">
                <Wrench className="h-4 w-4 text-slate-900" />
                Feature toggles
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="w-full sm:max-w-md">
                  <Input value={featureQuery} onChange={(event) => setFeatureQuery(event.target.value)} placeholder="Search features..." className="h-11 rounded-2xl border-white/70 bg-white/70 backdrop-blur" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" className="rounded-full" onClick={() => setFeatureDraft(platform.featureControls)}>Reset</Button>
                  <Button className="rounded-full bg-slate-950 text-white hover:bg-slate-800" disabled={savingFeatures} onClick={() => void saveFeatureControls()}>
                    {savingFeatures ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save
                  </Button>
                </div>
              </div>

              {featureSaveMessage ? (
                <div className="rounded-[1.15rem] border border-white/70 bg-white/60 px-4 py-3 text-sm text-slate-700">{featureSaveMessage}</div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredFeatureKeys.map((key) => {
                  const enabled = Boolean((featureDraft || platform.featureControls)[key]);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleFeature(key)}
                      className={`group flex items-start justify-between gap-3 rounded-[1.35rem] border px-4 py-4 text-left shadow-[0_12px_30px_rgba(148,163,184,0.08)] backdrop-blur transition ${
                        enabled
                          ? 'border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.82),rgba(255,255,255,0.62))]'
                          : 'border-white/70 bg-white/60 hover:bg-white/70'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{prettyFeatureLabel(key)}</p>
                        <p className="mt-1 truncate text-xs text-slate-600">{key}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${enabled ? 'bg-emerald-100/90 text-emerald-700' : 'bg-slate-100/90 text-slate-700'}`}>
                        {enabled ? 'On' : 'Off'}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-[1.35rem] border border-white/70 bg-white/60 p-4 text-sm text-slate-600">
                Feature toggles apply across the public site and workspace. Keep at least one create path enabled so tenants are not blocked.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banners" className="mt-6">
          <AdBannerManager />
        </TabsContent>
        <TabsContent value="homepage" className="mt-6">
          <HomepageCommandCenter />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Ad Banner Manager — full CRUD UI for homepage ad banners
══════════════════════════════════════════════════════════════════ */
type AdBanner = {
  id: string;
  imageUrl: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref?: string;
  active: boolean;
  order: number;
  createdAt: string;
};

const EMPTY_BANNER: Omit<AdBanner, 'id' | 'createdAt' | 'order'> = {
  imageUrl: '', title: '', subtitle: '', ctaLabel: '', ctaHref: '', active: true,
};

function AdBannerManager() {
  const [banners, setBanners]   = useState<AdBanner[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState<{ ok: boolean; text: string } | null>(null);
  const [editing, setEditing]   = useState<AdBanner | null>(null);
  const [form, setForm]         = useState<typeof EMPTY_BANNER>({ ...EMPTY_BANNER });
  const [uploading, setUploading] = useState(false);
  const fileRef                 = useRef<HTMLInputElement>(null);
  const dragOver                = useRef<number | null>(null);

  const flash = (ok: boolean, text: string) => {
    setMsg({ ok, text });
    setTimeout(() => setMsg(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/super-admin/ad-banners', { cache: 'no-store' });
      const d = await r.json();
      setBanners(Array.isArray(d.banners) ? d.banners : []);
    } catch { flash(false, 'Failed to load banners'); }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_BANNER });
  };

  const openEdit = (b: AdBanner) => {
    setEditing(b);
    setForm({ imageUrl: b.imageUrl, title: b.title, subtitle: b.subtitle ?? '', ctaLabel: b.ctaLabel ?? '', ctaHref: b.ctaHref ?? '', active: b.active });
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/super-admin/ad-banners/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Upload failed');
      setForm(f => ({ ...f, imageUrl: d.url }));
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Upload failed'); }
    setUploading(false);
  };

  const save = async () => {
    if (!form.imageUrl) { flash(false, 'Please upload an image first'); return; }
    if (!form.title.trim()) { flash(false, 'Title is required'); return; }
    setSaving(true);
    try {
      const body = editing
        ? { action: 'upsert', banner: { ...editing, ...form } }
        : { action: 'upsert', banner: { ...form, id: `banner_${Date.now()}`, order: banners.length, createdAt: new Date().toISOString() } };
      const r = await fetch('/api/super-admin/ad-banners', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Save failed');
      setBanners(d.banners);
      setEditing(null);
      setForm({ ...EMPTY_BANNER });
      flash(true, editing ? 'Banner updated' : 'Banner created');
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Save failed'); }
    setSaving(false);
  };

  const deleteBanner = async (id: string) => {
    if (!confirm('Delete this banner?')) return;
    setSaving(true);
    try {
      const r = await fetch('/api/super-admin/ad-banners', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete', id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Delete failed');
      setBanners(d.banners);
      if (editing?.id === id) { setEditing(null); setForm({ ...EMPTY_BANNER }); }
      flash(true, 'Banner deleted');
    } catch (e) { flash(false, e instanceof Error ? e.message : 'Delete failed'); }
    setSaving(false);
  };

  const toggleActive = async (b: AdBanner) => {
    const updated = { ...b, active: !b.active };
    const r = await fetch('/api/super-admin/ad-banners', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'upsert', banner: updated }) });
    const d = await r.json();
    if (r.ok) setBanners(d.banners);
  };

  const isFormOpen = form.imageUrl !== '' || editing !== null || form.title !== '';

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Ad Banners</h2>
          <p className="text-xs text-slate-500 mt-0.5">Manage homepage advertisement slider banners.</p>
        </div>
        <Button size="sm" className="rounded-full bg-slate-950 text-white hover:bg-slate-800" onClick={openNew}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Banner
        </Button>
      </div>

      {/* flash message */}
      {msg && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
          {msg.text}
        </div>
      )}

      {/* form */}
      {(isFormOpen || editing) && (
        <Card className="border-white/60 bg-white/82 backdrop-blur">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-slate-950">{editing ? 'Edit Banner' : 'New Banner'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {/* image upload */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">Banner Image <span className="text-slate-400">(landscape, 21:9 recommended, max 4 MB)</span></p>
              {form.imageUrl ? (
                <div className="relative w-full rounded-xl overflow-hidden border border-white/60" style={{ aspectRatio: '21/9' }}>
                  <img src={form.imageUrl} alt="preview" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setForm(f => ({ ...f, imageUrl: '' }))}
                    className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 py-8 text-slate-500 transition hover:border-slate-400 hover:bg-slate-100 disabled:opacity-60"
                >
                  {uploading
                    ? <Loader2 className="h-5 w-5 animate-spin" />
                    : <ImageIcon className="h-5 w-5" />
                  }
                  <span className="text-xs font-medium">{uploading ? 'Uploading…' : 'Click to upload image'}</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ''; }} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Title *</label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Your ad headline" className="h-10 rounded-xl border-white/70 bg-white/70 backdrop-blur" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Subtitle</label>
                <Input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                  placeholder="Supporting text" className="h-10 rounded-xl border-white/70 bg-white/70 backdrop-blur" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">CTA Label</label>
                <Input value={form.ctaLabel} onChange={e => setForm(f => ({ ...f, ctaLabel: e.target.value }))}
                  placeholder="Learn More" className="h-10 rounded-xl border-white/70 bg-white/70 backdrop-blur" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">CTA Link</label>
                <Input value={form.ctaHref} onChange={e => setForm(f => ({ ...f, ctaHref: e.target.value }))}
                  placeholder="https://…" className="h-10 rounded-xl border-white/70 bg-white/70 backdrop-blur" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors ${form.active ? 'border-emerald-400 bg-emerald-500' : 'border-slate-300 bg-slate-200'}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.active ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-slate-600">Active (show on homepage)</span>
            </div>

            <div className="flex gap-2">
              <Button size="sm" className="rounded-full bg-slate-950 text-white hover:bg-slate-800" disabled={saving || uploading} onClick={save}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                {editing ? 'Save Changes' : 'Create Banner'}
              </Button>
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => { setEditing(null); setForm({ ...EMPTY_BANNER }); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* list */}
      <Card className="border-white/60 bg-white/82 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-950">All Banners <span className="font-normal text-slate-500">({banners.length})</span></CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : banners.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-10 text-center text-sm text-slate-400">
              No banners yet. Click "Add Banner" to create one.
            </div>
          ) : (
            <div className="space-y-3">
              {banners.map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/60 p-3">
                  <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />

                  {/* thumbnail */}
                  <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200">
                    <img src={b.imageUrl} alt={b.title} className="h-full w-full object-cover" />
                  </div>

                  {/* info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-950">{b.title}</p>
                    {b.subtitle && <p className="truncate text-xs text-slate-500">{b.subtitle}</p>}
                    {b.ctaHref && (
                      <a href={b.ctaHref} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition mt-0.5">
                        <ExternalLink className="h-2.5 w-2.5" /> {b.ctaHref.length > 40 ? b.ctaHref.slice(0, 40) + '…' : b.ctaHref}
                      </a>
                    )}
                  </div>

                  {/* active toggle */}
                  <button
                    type="button"
                    onClick={() => void toggleActive(b)}
                    className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition ${b.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {b.active ? 'Live' : 'Off'}
                  </button>

                  {/* edit */}
                  <Button size="sm" variant="outline" className="h-7 shrink-0 rounded-full px-3 text-xs" onClick={() => openEdit(b)}>
                    Edit
                  </Button>

                  {/* delete */}
                  <button
                    type="button"
                    onClick={() => void deleteBanner(b.id)}
                    className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <Card className="border-white/60 bg-white/82 backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-slate-950">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
        <p className="mt-1 text-xs text-slate-500">{detail}</p>
      </CardContent>
    </Card>
  );
}

function formatAgo(iso: string) {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'now';
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.round(diff / 1000);
  if (sec < 15) return 'now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
