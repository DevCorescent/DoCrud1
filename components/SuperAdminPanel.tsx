'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
const HomepageCommandCenter = dynamic(() => import('@/components/HomepageCommandCenter'), { ssr: false });
const AdBannerManager = dynamic(() => import('@/components/AdBannerManagerPanel'), { ssr: false });

// ── Types ──────────────────────────────────────────────────────────────
type Tab = 'overview' | 'users' | 'plans' | 'platform' | 'analytics' | 'documents' | 'mail' | 'content' | 'settings' | 'audit' | 'revenue' | 'gigs' | 'people' | 'search' | 'security' | 'geography' | 'integrations' | 'early-access' | 'public_face' | 'verifications' | 'live-sessions' | 'file-transfers' | 'user-intelligence' | 'network' | 'marketplace' | 'services' | 'referrals' | 'feeds' | 'infinity' | 'homepage' | 'ad-banners';

interface DashboardData {
  users: { total: number; active: number; suspended: number; disabled: number; business: number; individual: number; newLast30Days: number; newLast7Days: number; planDistribution: Record<string, number>; subscriptionStatusDistribution: Record<string, number>; roleDistribution: Record<string, number>; recentSignups: UserRow[]; dailySignups: { date: string; count: number }[] };
  documents: { total: number; last30Days: number; last7Days: number; daily: { date: string; count: number }[] };
  revenue: { totalPaise: number; last30DaysPaise: number; last7DaysPaise: number; totalTransactions: number; recentBilling: BillingRow[] };
  telemetry: { pageViewsLast7Days: number; signupsLast7Days: number; loginsLast7Days: number };
  infinity?: { total: number; paid: number; free: number; newLast7Days: number; newLast30Days: number; conversionRate: string; revenueTotalPaise: number; revenueLast30DaysPaise: number };
}

interface UserRow {
  id: string; name: string; email: string; role: string; accountType?: string; organizationName?: string; planId?: string; planName?: string; planStatus?: string; isActive: boolean; suspendedUntil?: string; createdAt: string; lastLogin?: string; status?: string; subscription?: Record<string, unknown>; safety?: { scamWarning?: boolean; flaggedAt?: string; suspendedUntil?: string };
}

interface BillingRow { id?: string; userEmail?: string; planId?: string; amountPaise?: number; status?: string; createdAt?: string; }

interface Plan { id: string; name: string; description?: string; priceInPaise: number; billingCycle?: string; isPublic?: boolean; features?: string[]; stats?: { subscribers: number; revenue: number; trials: number; active: number; cancelled: number }; }

interface AuditEntry { id?: string; action: string; targetType?: string; targetId?: string; details?: Record<string, unknown>; ip?: string; timestamp?: string; createdAt?: string; source?: string; actorEmail?: string; }

interface AnalyticsData { period: { days: number; since: string }; overview: Record<string, number>; topPages: { path: string; views: number }[]; topFeatures: { feature: string; count: number }[]; topDocTypes: { type: string; count: number }[]; dailyActivity: { date: string; pageViews: number; signups: number; logins: number; docs: number }[]; dailyRevenue: { date: string; amountPaise: number; transactions: number }[]; signupsByRole: Record<string, number>; signupsByAccountType: Record<string, number>; }

interface PlatformData { flags: Record<string, unknown>; featureControls: Record<string, boolean>; activeSuperAdminSessions: { email: string; createdAt: string; expiresAt: string; ip?: string }[]; authSettings?: { googleEnabled: boolean; aadhaarVerificationEnabled: boolean }; mailConfigured: boolean; }

// ── Helpers ────────────────────────────────────────────────────────────
const fmt = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const ago = (iso?: string) => { if (!iso) return '—'; const d = new Date(iso); const diff = Date.now() - d.getTime(); if (diff < 60000) return 'just now'; if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`; if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`; return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }); };
const badge = (s?: string) => { const map: Record<string, string> = { active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', trial: 'bg-amber-500/15 text-amber-400 border-amber-500/20', suspended: 'bg-red-500/15 text-red-400 border-red-500/20', disabled: 'bg-zinc-700/50 text-zinc-500 border-zinc-600/20', cancelled: 'bg-zinc-600/15 text-zinc-400 border-zinc-600/20', paid: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', failed: 'bg-red-500/15 text-red-400 border-red-500/20' }; return `text-xs px-2 py-0.5 rounded-full border font-medium ${map[s || ''] || 'bg-zinc-700/30 text-zinc-400 border-zinc-600/20'}`; };

// ── Live clock badge in topbar ─────────────────────────────────────────
function TopbarLiveBadge() {
  const [time, setTime] = useState(() => new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    }, 1000);
    // Poll live count every 30s
    const poll = () => fetch('/api/super-admin/live-sessions?window=15&limit=5').then((r) => r.json()).then((d) => setLiveCount(d.total || 0)).catch(() => {});
    poll();
    const pollInterval = setInterval(poll, 30000);
    return () => { clearInterval(tick); clearInterval(pollInterval); };
  }, []);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 bg-sky-500/10 border border-sky-500/20 rounded-full px-3 py-1">
        <div className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse" />
        <span className="text-xs text-sky-400 font-medium">{liveCount} live</span>
      </div>
      <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
        <span className="text-xs text-emerald-400 font-mono">{time}</span>
      </div>
    </div>
  );
}

// ── Mini chart ─────────────────────────────────────────────────────────
function Sparkline({ data, color = '#f59e0b' }: { data: number[]; color?: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const h = 32; const w = data.length * 8;
  const pts = data.map((v, i) => `${i * 8},${h - (v / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="opacity-80">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Bar chart row ──────────────────────────────────────────────────────
function BarRow({ label, value, max, color = 'bg-amber-500' }: { label: string; value: number; max: number; color?: string }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="text-zinc-400 w-32 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="text-zinc-300 w-8 text-right font-mono">{value}</span>
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon, accent = false, spark }: { label: string; value: string | number; sub?: string; icon: React.ReactNode; accent?: boolean; spark?: number[] }) {
  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-3 ${accent ? 'bg-amber-500/10 border-amber-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${accent ? 'bg-amber-500/20' : 'bg-zinc-800'}`}>{icon}</div>
        {spark && <Sparkline data={spark} color={accent ? '#f59e0b' : '#6366f1'} />}
      </div>
      <div>
        <div className={`text-2xl font-bold ${accent ? 'text-amber-400' : 'text-white'}`}>{value}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────
function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// ── Toggle ─────────────────────────────────────────────────────────────
function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button onClick={() => !disabled && onChange(!enabled)} className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${enabled ? 'bg-amber-500' : 'bg-zinc-700'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`} style={{ height: 22 }}>
      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${enabled ? 'left-5' : 'left-0.5'}`} />
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────
export default function SuperAdminPanel({ adminEmail, onLogout }: { adminEmail: string; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  type NavGroup = { group: string; items: { id: Tab; label: string; icon: React.ReactNode }[] };
  const navGroups: NavGroup[] = [
    { group: 'Core', items: [
      { id: 'overview', label: 'Overview', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg> },
      { id: 'live-sessions', label: 'Live Sessions', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg> },
      { id: 'user-intelligence', label: 'User Intel', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg> },
      { id: 'analytics', label: 'Analytics', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg> },
      { id: 'geography', label: 'Geography', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg> },
      { id: 'search', label: 'Search Intel', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> },
    ]},
    { group: 'People', items: [
      { id: 'users', label: 'Users', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z" /></svg> },
      { id: 'network', label: 'Network', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg> },
      { id: 'people', label: 'Profiles', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0M19 21a7 7 0 10-14 0" /></svg> },
      { id: 'public_face', label: 'Public Faces', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20"><defs><linearGradient id="pfnav" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#7c3aed"/><stop offset="100%" stopColor="#d946ef"/></linearGradient></defs><circle cx="10" cy="10" r="9" fill="url(#pfnav)" opacity="0.8"/><path d="M10 4.5l1.4 3.1 3.4.3-2.5 2.2.8 3.3L10 11.8l-3.1 1.6.8-3.3-2.5-2.2 3.4-.3z" fill="white" opacity="0.95"/></svg> },
    ]},
    { group: 'Commerce', items: [
      { id: 'revenue', label: 'Revenue', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
      { id: 'plans', label: 'Plans', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg> },
      { id: 'marketplace', label: 'Marketplace', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg> },
      { id: 'services', label: 'Services', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> },
      { id: 'gigs', label: 'Gigs / Connect', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
      { id: 'referrals', label: 'Referrals', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg> },
      { id: 'feeds', label: 'Feeds & Reports', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg> },
      { id: 'infinity' as Tab, label: '∞ Infinity', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 12c-2-2.5-4-4-6-4a4 4 0 000 8c2 0 4-1.5 6-4zm0 0c2 2.5 4 4 6 4a4 4 0 000-8c-2 0-4 1.5-6 4z" /></svg> },
    ]},
    { group: 'Platform', items: [
      { id: 'platform', label: 'Controls', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg> },
      { id: 'documents', label: 'Documents', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
      { id: 'file-transfers', label: 'File Transfers', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> },
      { id: 'security', label: 'Security', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg> },
      { id: 'integrations', label: 'Integrations', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg> },
    ]},
    { group: 'Growth', items: [
      { id: 'early-access', label: 'Early Access', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3l14 9-14 9V3z" /></svg> },
      { id: 'verifications', label: 'Verifications', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg> },
    ]},
    { group: 'Homepage', items: [
      { id: 'homepage' as Tab, label: 'Command Centre', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M3 9h18M9 21V9" /></svg> },
      { id: 'ad-banners' as Tab, label: 'Ad Banners', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="2" y="7" width="20" height="10" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M6 11h4m-4 3h2" /></svg> },
    ]},
    { group: 'Manage', items: [
      { id: 'mail', label: 'Mail', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> },
      { id: 'content', label: 'Content', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" /></svg> },
      { id: 'settings', label: 'Settings', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></svg> },
      { id: 'audit', label: 'Audit Log', icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg> },
    ]},
  ];
  const allNavItems = navGroups.flatMap((g) => g.items);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-14'} flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-all duration-200`}>
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-zinc-800 gap-3 flex-shrink-0">
          <div className="w-7 h-7 bg-amber-500/20 rounded-lg flex items-center justify-center border border-amber-500/30 flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.955 11.955 0 003 12c0 6.627 5.373 12 12 12s12-5.373 12-12c0-2.28-.637-4.41-1.748-6.212M12 9v3l1.5 1.5" /></svg>
          </div>
          {sidebarOpen && <div><div className="text-sm font-bold text-white leading-tight">docrud</div><div className="text-[10px] text-amber-500/80 font-medium uppercase tracking-wider">Super Admin</div></div>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={sidebarOpen ? 'M11 19l-7-7 7-7m8 14l-7-7 7-7' : 'M13 5l7 7-7 7M5 5l7 7-7 7'} /></svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {navGroups.map((group) => (
            <div key={group.group}>
              {sidebarOpen && <div className="px-4 pt-4 pb-1 text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">{group.group}</div>}
              {group.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-all ${tab === item.id ? 'text-amber-400 bg-amber-500/10 border-r-2 border-amber-500' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'}`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {sidebarOpen && <span className="truncate">{item.label}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-zinc-800 p-3">
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-400 text-xs font-bold flex-shrink-0">{adminEmail[0]?.toUpperCase() || 'S'}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-zinc-300 truncate font-medium">{adminEmail}</div>
                <div className="text-[10px] text-zinc-600">Super Admin</div>
              </div>
              <button onClick={onLogout} title="Logout" className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              </button>
            </div>
          ) : (
            <button onClick={onLogout} className="w-full flex items-center justify-center text-zinc-600 hover:text-red-400 transition-colors py-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="h-14 flex items-center px-6 border-b border-zinc-800 bg-zinc-900/50 gap-3 sticky top-0 z-10 backdrop-blur-sm">
          <div className="flex-1">
            <span className="text-sm font-medium text-white">{allNavItems.find((n) => n.id === tab)?.label}</span>
            <span className="text-xs text-zinc-600 ml-2">docrud super admin</span>
          </div>
          <TopbarLiveBadge />
        </div>

        <div className="p-6">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'plans' && <PlansTab />}
          {tab === 'platform' && <PlatformTab />}
          {tab === 'analytics' && <AnalyticsTab />}
          {tab === 'documents' && <DocumentsTab />}
          {tab === 'mail' && <MailTab />}
          {tab === 'content' && <ContentTab />}
          {tab === 'settings' && <SettingsTab />}
          {tab === 'audit' && <AuditTab />}
          {tab === 'revenue' && <RevenueTab />}
          {tab === 'gigs' && <GigsTab />}
          {tab === 'people' && <PeopleTab />}
          {tab === 'search' && <SearchIntelTab />}
          {tab === 'security' && <SecurityTab />}
          {tab === 'geography' && <GeographyTab />}
          {tab === 'integrations' && <IntegrationsTab />}
          {tab === 'early-access' && <EarlyAccessTab />}
          {tab === 'public_face' && <PublicFaceTab />}
          {tab === 'verifications' && <VerificationsTab />}
          {tab === 'live-sessions' && <LiveSessionsTab />}
          {tab === 'file-transfers' && <FileTransfersTab />}
          {tab === 'user-intelligence' && <UserIntelligenceTab />}
          {tab === 'network' && <NetworkTab />}
          {tab === 'marketplace' && <MarketplaceTab />}
          {tab === 'services' && <ServicesTab />}
          {tab === 'referrals' && <ReferralsTab />}
          {tab === 'feeds' && <FeedsTab />}
          {tab === 'infinity' && <InfinityTab />}
          {tab === 'homepage' && <HomepageCommandCenterTab />}
          {tab === 'ad-banners' && <AdBannersTab />}
        </div>
      </main>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// OVERVIEW TAB — real-time polling every 30s
// ══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// OVERVIEW TAB — comprehensive business intelligence dashboard
// ═══════════════════════════════════════════════════════════════════════

// ── Extended DashboardData type ──────────────────────────────────────
interface FullDashboardData {
  generatedAt: string;
  users: {
    total: number; active: number; suspended: number; disabled: number;
    business: number; individual: number;
    newLast1Day: number; newLast7Days: number; newLast14Days: number; newLast30Days: number;
    growthMoM: number | null; growthWoW: number | null;
    paidSubscribers: number; payingUsers: number; conversionRate: string;
    DAU: number; WAU: number; MAU: number; stickinessRatio: number;
    churnRate: string; retentionRate: string; day1Retention: number | null;
    planDistribution: Record<string, number>;
    subscriptionStatusDistribution: Record<string, number>;
    roleDistribution: Record<string, number>;
    recentSignups: UserRow[];
    dailySignups: { date: string; count: number }[];
    dailyActiveUsers: { date: string; count: number }[];
  };
  documents: {
    total: number; last30Days: number; last7Days: number; last1Day: number;
    signed: number; emailed: number; emailDeliveryRate: number;
    topTemplates: { name: string; count: number }[];
    byCategory: Record<string, number>;
    daily: { date: string; count: number }[];
  };
  revenue: {
    totalPaise: number; last30DaysPaise: number; last7DaysPaise: number;
    growthMoM: number | null;
    MRR: number; ARR: number; ARPU: number; ARPPU: number; LTV: number;
    totalTransactions: number; failedTransactions: number; paymentSuccessRate: number;
    byPlan: Record<string, number>;
    daily: { date: string; paise: number; transactions: number }[];
    monthly: { month: string; paise: number; transactions: number }[];
    recent: { id?: string; userEmail?: string; planId?: string; planName?: string; amountPaise: number; status: string; createdAt?: string }[];
  };
  engagement: {
    pageViews7d: number; pageViews30d: number;
    signups7d: number; logins7d: number; logins30d: number;
    sessions7d: number; sessions30d: number; featureOpens7d: number;
    sessionsPerUser7d: string;
    topFeatures: { feature: string; count: number }[];
    deviceBreakdown: Record<string, number>;
    daily: { date: string; pageViews: number; sessions: number; logins: number; signups: number }[];
  };
  published: {
    total: number; active: number; suspended: number; removed: number; underReview: number;
    withReports: number; last7Days: number; last30Days: number;
    totalLikes: number; totalComments: number; totalViews: number; avgEngagementPerPost: number;
    byCategory: Record<string, number>;
    dailyVelocity: { date: string; count: number }[];
    topPublishers: { email: string; name: string; count: number; likes: number }[];
  };
  telemetry: { pageViewsLast7Days: number; signupsLast7Days: number; loginsLast7Days: number };
  infinity?: { total: number; paid: number; free: number; newLast7Days: number; newLast30Days: number; conversionRate: string; revenueTotalPaise: number; revenueLast30DaysPaise: number };
}

// ── SVG Chart primitives ─────────────────────────────────────────────

function LineChart({ data, color = '#f59e0b', height = 56, fill = false }: {
  data: number[]; color?: string; height?: number; fill?: boolean;
}) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = data.length * 12;
  const pts = data.map((v, i) => `${i * 12},${height - ((v - min) / range) * (height - 4)}`).join(' ');
  const fillPath = `M0,${height} L${pts.split(' ').map((p, i) => `${i === 0 ? '' : 'L'}${p}`).join('')} L${(data.length - 1) * 12},${height} Z`;
  return (
    <svg width={w} height={height} className="overflow-visible">
      {fill && <path d={`M0,${height} L${pts} L${(data.length-1)*12},${height} Z`} fill={color} fillOpacity={0.12} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AreaChart({ data, color = '#f59e0b', height = 80, label = '' }: {
  data: { date: string; value: number }[]; color?: string; height?: number; label?: string;
}) {
  if (!data.length) return <div className="h-20 flex items-center justify-center text-zinc-700 text-xs">No data</div>;
  const vals = data.map((d) => d.value);
  const max = Math.max(...vals, 1);
  const total = data.length;
  const w = 100; const h = height;
  const pts = vals.map((v, i) => `${(i / (total - 1)) * w}%,${h - (v / max) * (h - 4)}`).join(' ');
  const area = `0,${h} ${pts} ${100}%,${h}`;
  return (
    <div>
      <svg width="100%" height={height} preserveAspectRatio="none" className="overflow-visible">
        <polygon points={area} fill={color} fillOpacity={0.12} />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {label && (
        <div className="flex justify-between text-[9px] text-zinc-700 mt-1">
          <span>{data[0]?.date?.slice(5)}</span>
          <span>{label}</span>
          <span>{data[data.length - 1]?.date?.slice(5)}</span>
        </div>
      )}
    </div>
  );
}

function BarChart({ data, color = '#f59e0b', height = 60 }: {
  data: { label: string; value: number }[]; color?: string; height?: number;
}) {
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} title={`${d.label}: ${d.value}`} className="flex-1 rounded-t-sm min-w-[2px] transition-all" style={{ height: `${Math.max(4, (d.value / max) * height)}px`, background: color, opacity: 0.7 + 0.3 * (d.value / max) }} />
      ))}
    </div>
  );
}

function MultiLineChart({ series, height = 80 }: {
  series: { label: string; data: number[]; color: string }[];
  height?: number;
}) {
  if (!series.length || !series[0].data.length) return null;
  const allVals = series.flatMap((s) => s.data);
  const max = Math.max(...allVals, 1);
  const total = series[0].data.length;
  return (
    <svg width="100%" height={height} preserveAspectRatio="none" className="overflow-visible">
      {series.map((s) => {
        const pts = s.data.map((v, i) => `${(i / (total - 1)) * 100}%,${height - (v / max) * (height - 4)}`).join(' ');
        return <polyline key={s.label} points={pts} fill="none" stroke={s.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

function DonutChart({ segments, size = 80 }: {
  segments: { label: string; value: number; color: string }[]; size?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (!total) return <div className="text-xs text-zinc-700 text-center">No data</div>;
  const r = size / 2 - 8; const cx = size / 2; const cy = size / 2;
  let angle = -Math.PI / 2;
  const paths = segments.map((seg) => {
    const slice = (seg.value / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(angle); const y1 = cy + r * Math.sin(angle);
    angle += slice;
    const x2 = cx + r * Math.cos(angle); const y2 = cy + r * Math.sin(angle);
    const large = slice > Math.PI ? 1 : 0;
    return { d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`, color: seg.color, label: seg.label, value: seg.value };
  });
  return (
    <svg width={size} height={size}>
      {paths.map((p) => <path key={p.label} d={p.d} fill={p.color} fillOpacity={0.75} stroke="#09090b" strokeWidth={1.5} />)}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="#09090b" />
    </svg>
  );
}

// ── KPI card variants ────────────────────────────────────────────────

function KpiCard({ label, value, sub, sub2, trend, trendDir, color = 'text-white', chart, wide }: {
  label: string; value: string | number; sub?: string; sub2?: string;
  trend?: string | null; trendDir?: 'up' | 'down' | 'flat';
  color?: string; chart?: React.ReactNode; wide?: boolean;
}) {
  const trendColor = trendDir === 'up' ? 'text-emerald-400' : trendDir === 'down' ? 'text-red-400' : 'text-zinc-500';
  const trendArrow = trendDir === 'up' ? '↑' : trendDir === 'down' ? '↓' : '→';
  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2 ${wide ? 'col-span-2' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className={`text-2xl font-bold font-mono leading-none ${color}`}>{value}</div>
          <div className="text-xs text-zinc-500 mt-1">{label}</div>
          {sub && <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>}
          {sub2 && <div className="text-[10px] text-zinc-700 mt-0.5">{sub2}</div>}
        </div>
        {trend != null && (
          <div className={`text-xs font-semibold ${trendColor} flex-shrink-0`}>
            {trendArrow} {trend}
          </div>
        )}
      </div>
      {chart && <div className="overflow-hidden">{chart}</div>}
    </div>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 mt-2">
      <span className="text-sm font-semibold text-white">{title}</span>
      {sub && <span className="text-xs text-zinc-600">{sub}</span>}
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  );
}

function function_fmt(paise: number) {
  const rupees = paise / 100;
  if (rupees >= 10_000_000) return `₹${(rupees / 10_000_000).toFixed(2)}Cr`;
  if (rupees >= 100_000)    return `₹${(rupees / 100_000).toFixed(2)}L`;
  if (rupees >= 1_000)      return `₹${(rupees / 1_000).toFixed(1)}K`;
  return `₹${Math.round(rupees).toLocaleString('en-IN')}`;
}

function trendLabel(val: number | null, suffix = '%') {
  if (val === null) return null;
  return `${Math.abs(val)}${suffix}`;
}

function trendDir(val: number | null): 'up' | 'down' | 'flat' {
  if (val === null) return 'flat';
  return val > 0 ? 'up' : val < 0 ? 'down' : 'flat';
}

function OverviewTab() {
  const [data, setData] = useState<FullDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveSessions, setLiveSessions] = useState(0);
  const [lastUpdated, setLastUpdated] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [dash, sess] = await Promise.all([
        fetch('/api/super-admin/dashboard').then((r) => r.json()),
        fetch('/api/super-admin/live-sessions?window=15&limit=5').then((r) => r.json()).catch(() => ({ total: 0 })),
      ]);
      setData(dash as FullDashboardData);
      setLiveSessions(sess.online ?? sess.total ?? 0);
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    loadAll();
    intervalRef.current = setInterval(() => loadAll(true), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadAll]);

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load dashboard" />;

  const { users, documents, revenue, engagement, published } = data;
  const f = function_fmt;

  return (
    <div className="space-y-7">

      {/* ── LIVE STATUS STRIP ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-5 py-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-xs text-emerald-400 font-semibold">Platform Operational</span>
        </div>
        <div className="h-3 w-px bg-zinc-800 hidden sm:block" />
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 bg-sky-400 rounded-full animate-pulse" />
          <span className="text-xs text-sky-400 font-semibold">{liveSessions} live now</span>
        </div>
        <div className="h-3 w-px bg-zinc-800 hidden sm:block" />
        <span className="text-xs text-zinc-600 font-mono">{new Date().toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
        <div className="ml-auto flex items-center gap-3">
          {users.suspended > 0 && <span className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">{users.suspended} suspended</span>}
          {published.withReports > 0 && <span className="text-xs bg-red-500/10 border border-red-500/20 text-red-400 px-2 py-0.5 rounded-full">{published.withReports} reported posts</span>}
          <div className="flex items-center gap-1.5 text-xs text-zinc-600">
            {refreshing ? <div className="w-3 h-3 border border-zinc-600 border-t-zinc-400 rounded-full animate-spin" /> : null}
            <span>Updated {lastUpdated || '—'}</span>
          </div>
          <button onClick={() => loadAll(true)} disabled={refreshing} className="text-zinc-500 hover:text-zinc-300 transition-colors text-xs disabled:opacity-40">↻ Refresh</button>
        </div>
      </div>

      {/* ── SECTION 1: CORE NORTH-STAR METRICS ───────────────────── */}
      <SectionTitle title="North-Star Metrics" sub="Platform health at a glance" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Users" value={users.total.toLocaleString()}
          sub={`+${users.newLast7Days} this week`}
          trend={trendLabel(users.growthMoM)} trendDir={trendDir(users.growthMoM)}
          color="text-amber-400"
          chart={<LineChart data={users.dailySignups.map((d) => d.count)} color="#f59e0b" height={36} fill />}
        />
        <KpiCard label="Monthly Active (MAU)" value={users.MAU.toLocaleString()}
          sub={`DAU ${users.DAU} · WAU ${users.WAU}`}
          color="text-sky-400"
          chart={<LineChart data={users.dailyActiveUsers.map((d) => d.count)} color="#38bdf8" height={36} fill />}
        />
        <KpiCard label="MRR" value={f(revenue.MRR)}
          sub={`ARR ${f(revenue.ARR)}`}
          trend={trendLabel(revenue.growthMoM)} trendDir={trendDir(revenue.growthMoM)}
          color="text-emerald-400"
          chart={<LineChart data={revenue.daily.map((d) => d.paise)} color="#34d399" height={36} fill />}
        />
        <KpiCard label="Docs Generated" value={documents.total.toLocaleString()}
          sub={`${documents.last7Days} this week`}
          color="text-indigo-400"
          chart={<LineChart data={documents.daily.map((d) => d.count)} color="#818cf8" height={36} fill />}
        />
        <KpiCard label="Published Posts" value={published.total.toLocaleString()}
          sub={`${published.last7Days} this week`}
          color="text-purple-400"
          chart={<LineChart data={published.dailyVelocity.map((d) => d.count)} color="#a78bfa" height={36} fill />}
        />
        <KpiCard label="Stickiness (DAU/MAU)" value={`${users.stickinessRatio}%`}
          sub={`${users.retentionRate}% retention`}
          color={users.stickinessRatio >= 20 ? 'text-emerald-400' : users.stickinessRatio >= 10 ? 'text-amber-400' : 'text-red-400'}
        />
      </div>

      {/* ── SECTION 2: REVENUE & FINANCE ─────────────────────────── */}
      <SectionTitle title="Revenue & Financial Metrics" sub="MRR · ARR · ARPU · LTV · Churn" />

      {/* Revenue KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'MRR (30d Revenue)', value: f(revenue.MRR), sub: 'Monthly Recurring Revenue proxy', color: 'text-emerald-400' },
          { label: 'ARR (Run Rate)', value: f(revenue.ARR), sub: 'MRR × 12', color: 'text-emerald-300' },
          { label: 'ARPU', value: f(revenue.ARPU), sub: 'Avg Revenue Per User', color: 'text-sky-400' },
          { label: 'ARPPU', value: f(revenue.ARPPU), sub: 'Avg Rev Per Paying User', color: 'text-sky-300' },
          { label: 'LTV (est.)', value: f(revenue.LTV), sub: 'ARPPU ÷ Churn Rate', color: 'text-amber-400' },
          { label: 'Revenue (7d)', value: f(revenue.last7DaysPaise), sub: `${f(revenue.last30DaysPaise)} last 30d`, color: 'text-emerald-400' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
            <div className="text-[11px] text-zinc-400 mt-1 leading-tight">{label}</div>
            <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Revenue charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly revenue bar chart */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-white">Monthly Revenue (12 months)</div>
              <div className="text-xs text-zinc-500 mt-0.5">Total: {f(revenue.totalPaise)} all-time · {revenue.totalTransactions} transactions</div>
            </div>
            {revenue.growthMoM !== null && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${revenue.growthMoM >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {revenue.growthMoM >= 0 ? '↑' : '↓'} {Math.abs(revenue.growthMoM)}% MoM
              </span>
            )}
          </div>
          <div className="flex items-end gap-1.5 h-24">
            {revenue.monthly.map((m) => {
              const maxVal = Math.max(...revenue.monthly.map((x) => x.paise), 1);
              const h = Math.max(3, (m.paise / maxVal) * 96);
              return (
                <div key={m.month} className="flex-1 flex flex-col items-center gap-1 group cursor-default">
                  <div className="w-full bg-emerald-500/70 hover:bg-emerald-400 rounded-t-sm transition-colors" style={{ height: `${h}px` }} title={`${m.month}: ${f(m.paise)} · ${m.transactions} tx`} />
                  <span className="text-[8px] text-zinc-700 group-hover:text-zinc-500">{m.month.slice(5)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Daily revenue + transactions */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-white">Daily Revenue (30 days)</div>
              <div className="text-xs text-zinc-500 mt-0.5">Payment success rate: <span className={revenue.paymentSuccessRate >= 90 ? 'text-emerald-400' : 'text-amber-400'}>{revenue.paymentSuccessRate}%</span> · {revenue.failedTransactions} failed</div>
            </div>
          </div>
          <AreaChart data={revenue.daily.map((d) => ({ date: d.date, value: d.paise }))} color="#34d399" height={80} label="30-day revenue" />
        </div>
      </div>

      {/* Revenue breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* By plan */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Revenue by Plan</div>
          {Object.keys(revenue.byPlan).length === 0 ? (
            <div className="text-xs text-zinc-700 py-4 text-center">No payment data</div>
          ) : (
            <div className="space-y-2">
              {Object.entries(revenue.byPlan).sort(([, a], [, b]) => b - a).map(([plan, paise]) => {
                const total = Object.values(revenue.byPlan).reduce((s, v) => s + v, 0);
                return (
                  <div key={plan} className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-400 flex-1 truncate">{plan}</span>
                    <div className="w-20 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(paise / total) * 100}%` }} />
                    </div>
                    <span className="text-emerald-400 font-mono w-14 text-right">{f(paise)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment health */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Payment Health</div>
          <div className="space-y-3">
            {[
              { label: 'Successful', value: revenue.totalTransactions, color: 'bg-emerald-500', total: revenue.totalTransactions + revenue.failedTransactions },
              { label: 'Failed', value: revenue.failedTransactions, color: 'bg-red-500', total: revenue.totalTransactions + revenue.failedTransactions },
              { label: 'Paying Users', value: users.payingUsers, color: 'bg-sky-500', total: users.total },
            ].map(({ label, value, color, total }) => (
              <div key={label} className="text-xs">
                <div className="flex justify-between text-zinc-400 mb-0.5">
                  <span>{label}</span>
                  <span className="font-mono">{value}</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1.5">
                  <div className={`h-full ${color} rounded-full`} style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
            <div className="pt-1 border-t border-zinc-800 flex justify-between text-[10px] text-zinc-600">
              <span>Conversion rate</span>
              <span className="font-mono text-amber-400">{users.conversionRate}%</span>
            </div>
          </div>
        </div>

        {/* Recent transactions */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Recent Transactions</div>
          <div className="space-y-2">
            {revenue.recent.length === 0 && <div className="text-xs text-zinc-700 py-4 text-center">No transactions yet</div>}
            {revenue.recent.slice(0, 6).map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <div className="w-5 h-5 bg-emerald-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-zinc-300 truncate">{t.userEmail || '—'}</div>
                  <div className="text-zinc-600">{t.planName || t.planId || '—'}</div>
                </div>
                <span className="text-emerald-400 font-mono flex-shrink-0">{f(t.amountPaise)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SECTION 3: USER & GROWTH METRICS ─────────────────────── */}
      <SectionTitle title="User & Growth Metrics" sub="DAU · MAU · Retention · Churn · Cohorts" />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'DAU', value: users.DAU, sub: 'Active last 24h', color: 'text-sky-400' },
          { label: 'WAU', value: users.WAU, sub: 'Active last 7d', color: 'text-sky-400' },
          { label: 'MAU', value: users.MAU, sub: 'Active last 30d', color: 'text-sky-400' },
          { label: 'DAU / MAU', value: `${users.stickinessRatio}%`, sub: 'Stickiness ratio', color: users.stickinessRatio >= 20 ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'Retention Rate', value: `${users.retentionRate}%`, sub: '30-day retention', color: parseFloat(users.retentionRate) >= 70 ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'Churn Rate', value: `${users.churnRate}%`, sub: '30-day churn', color: parseFloat(users.churnRate) <= 5 ? 'text-emerald-400' : parseFloat(users.churnRate) <= 15 ? 'text-amber-400' : 'text-red-400' },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
            <div className="text-xs text-zinc-500 mt-1">{label}</div>
            <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* DAU trend + user growth charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold text-white mb-1">Daily Active Users (30 days)</div>
          <div className="text-xs text-zinc-500 mb-4">DAU trend — unique users with at least one event</div>
          <AreaChart data={users.dailyActiveUsers.map((d) => ({ date: d.date, value: d.count }))} color="#38bdf8" height={80} label="DAU" />
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold text-white mb-1">New Signups (30 days)</div>
          <div className="text-xs text-zinc-500 mb-4">
            +{users.newLast30Days} this month
            {users.growthMoM !== null && (
              <span className={`ml-2 font-semibold ${users.growthMoM >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {users.growthMoM >= 0 ? '↑' : '↓'} {Math.abs(users.growthMoM)}% MoM
              </span>
            )}
          </div>
          <AreaChart data={users.dailySignups.map((d) => ({ date: d.date, value: d.count }))} color="#f59e0b" height={80} label="Signups" />
        </div>
      </div>

      {/* User breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">User Status</div>
          <div className="flex items-center gap-3">
            <DonutChart size={72} segments={[
              { label: 'Active', value: users.active, color: '#34d399' },
              { label: 'Suspended', value: users.suspended, color: '#f87171' },
              { label: 'Disabled', value: users.disabled, color: '#52525b' },
            ]} />
            <div className="space-y-1.5 text-xs">
              {[['Active', users.active, 'text-emerald-400'], ['Suspended', users.suspended, 'text-red-400'], ['Disabled', users.disabled, 'text-zinc-500']].map(([l, v, c]) => (
                <div key={String(l)} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${String(c).replace('text-', 'bg-')}`} />
                  <span className="text-zinc-400">{l}</span>
                  <span className={`font-mono ml-auto ${c}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Account Types</div>
          <div className="flex items-center gap-3">
            <DonutChart size={72} segments={[
              { label: 'Business', value: users.business, color: '#f59e0b' },
              { label: 'Individual', value: users.individual, color: '#38bdf8' },
            ]} />
            <div className="space-y-1.5 text-xs">
              {[['Business', users.business, 'text-amber-400'], ['Individual', users.individual, 'text-sky-400']].map(([l, v, c]) => (
                <div key={String(l)} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${String(c).replace('text-', 'bg-')}`} />
                  <span className="text-zinc-400">{l}</span>
                  <span className={`font-mono ml-auto ${c}`}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Subscriptions</div>
          <div className="space-y-2">
            {Object.entries(users.subscriptionStatusDistribution).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="text-zinc-400 flex-1 capitalize">{k}</span>
                <div className="w-16 bg-zinc-800 rounded-full h-1.5">
                  <div className={`h-full rounded-full ${k === 'active' ? 'bg-emerald-500' : k === 'trial' ? 'bg-amber-500' : 'bg-zinc-600'}`} style={{ width: `${(v / users.total) * 100}%` }} />
                </div>
                <span className="font-mono text-zinc-300 w-8 text-right">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Roles</div>
          <div className="space-y-2">
            {Object.entries(users.roleDistribution).slice(0, 6).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="text-zinc-400 flex-1 capitalize">{k}</span>
                <div className="w-16 bg-zinc-800 rounded-full h-1.5">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(v / users.total) * 100}%` }} />
                </div>
                <span className="font-mono text-zinc-300 w-8 text-right">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Growth details */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'New Today', value: users.newLast1Day, color: 'text-white' },
          { label: 'New This Week', value: users.newLast7Days, color: 'text-amber-400', trend: users.growthWoW, suffix: '% WoW' },
          { label: 'New This Month', value: users.newLast30Days, color: 'text-amber-400', trend: users.growthMoM, suffix: '% MoM' },
          { label: 'Paid Subscribers', value: users.paidSubscribers, color: 'text-emerald-400' },
          { label: 'Paying Users', value: users.payingUsers, color: 'text-emerald-400' },
          { label: 'Day-1 Retention', value: users.day1Retention !== null ? `${users.day1Retention}%` : '—', color: 'text-sky-400' },
          { label: 'Sessions / User', value: engagement.sessionsPerUser7d, color: 'text-indigo-400' },
          { label: 'Logins (30d)', value: engagement.logins30d, color: 'text-zinc-300' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <div className={`text-lg font-bold font-mono ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
            <div className="text-[10px] text-zinc-600 mt-0.5 leading-tight">{label}</div>
          </div>
        ))}
      </div>

      {/* Recent signups */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-sm font-medium text-white">Recent Signups</span>
          <span className="text-xs text-zinc-600">{users.newLast30Days} in last 30 days</span>
        </div>
        <div className="divide-y divide-zinc-800/50">
          {users.recentSignups.slice(0, 6).map((u) => (
            <div key={u.id} className="px-5 py-2.5 flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 flex-shrink-0">{(u.name || u.email)[0]?.toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{u.name || '—'}</div>
                <div className="text-xs text-zinc-500 truncate">{u.email}</div>
              </div>
              <div className="text-right flex-shrink-0 space-y-0.5">
                <span className={badge(u.planStatus)}>{u.planStatus || 'free'}</span>
                <div className="text-[10px] text-zinc-600">{ago(u.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SECTION 4: ENGAGEMENT & PRODUCT ─────────────────────── */}
      <SectionTitle title="Engagement & Product Usage" sub="Page views · sessions · features · devices" />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Page Views (7d)', value: engagement.pageViews7d, color: 'text-sky-400' },
          { label: 'Page Views (30d)', value: engagement.pageViews30d, color: 'text-sky-400' },
          { label: 'Sessions (7d)', value: engagement.sessions7d, color: 'text-indigo-400' },
          { label: 'Sessions (30d)', value: engagement.sessions30d, color: 'text-indigo-400' },
          { label: 'Feature Opens (7d)', value: engagement.featureOpens7d, color: 'text-purple-400' },
          { label: 'Logins (7d)', value: engagement.logins7d, color: 'text-amber-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className={`text-xl font-bold font-mono ${color}`}>{value.toLocaleString()}</div>
            <div className="text-xs text-zinc-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Daily engagement multi-line chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-semibold text-white mb-1">Daily Engagement (30 days)</div>
        <div className="flex items-center gap-4 text-[10px] mb-3 flex-wrap">
          {[['Page Views', '#38bdf8'], ['Sessions', '#818cf8'], ['Logins', '#f59e0b'], ['Signups', '#34d399']].map(([l, c]) => (
            <div key={String(l)} className="flex items-center gap-1">
              <div className="w-3 h-0.5 rounded" style={{ background: String(c) }} />
              <span className="text-zinc-500">{l}</span>
            </div>
          ))}
        </div>
        <MultiLineChart height={80} series={[
          { label: 'Page Views', data: engagement.daily.map((d) => d.pageViews), color: '#38bdf8' },
          { label: 'Sessions',   data: engagement.daily.map((d) => d.sessions),  color: '#818cf8' },
          { label: 'Logins',     data: engagement.daily.map((d) => d.logins),    color: '#f59e0b' },
          { label: 'Signups',    data: engagement.daily.map((d) => d.signups),   color: '#34d399' },
        ]} />
        <div className="flex justify-between text-[9px] text-zinc-700 mt-1">
          <span>{engagement.daily[0]?.date?.slice(5)}</span>
          <span>30-day engagement</span>
          <span>{engagement.daily[engagement.daily.length - 1]?.date?.slice(5)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Top features */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Top Features Used (7d)</div>
          {engagement.topFeatures.length === 0 ? (
            <div className="text-xs text-zinc-700 py-4 text-center">No feature data yet</div>
          ) : (
            <div className="space-y-2">
              {engagement.topFeatures.slice(0, 8).map((f) => {
                const maxCount = engagement.topFeatures[0]?.count || 1;
                return (
                  <div key={f.feature} className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-400 flex-1 truncate">{f.feature}</span>
                    <div className="w-20 bg-zinc-800 rounded-full h-1.5">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(f.count / maxCount) * 100}%` }} />
                    </div>
                    <span className="text-purple-400 font-mono w-6 text-right">{f.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Device breakdown */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Device Breakdown (30d)</div>
          <div className="flex items-center gap-4">
            <DonutChart size={80} segments={[
              { label: 'Desktop', value: engagement.deviceBreakdown['desktop'] ?? 0, color: '#818cf8' },
              { label: 'Mobile',  value: engagement.deviceBreakdown['mobile']  ?? 0, color: '#38bdf8' },
              { label: 'Tablet',  value: engagement.deviceBreakdown['tablet']  ?? 0, color: '#34d399' },
            ]} />
            <div className="space-y-2 text-xs">
              {[['Desktop', 'desktop', 'text-indigo-400'], ['Mobile', 'mobile', 'text-sky-400'], ['Tablet', 'tablet', 'text-emerald-400']].map(([l, k, c]) => (
                <div key={String(k)} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${String(c).replace('text-', 'bg-')}`} />
                  <span className="text-zinc-400">{l}</span>
                  <span className={`font-mono ml-2 ${c}`}>{(engagement.deviceBreakdown[String(k)] ?? 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sessions per user */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Engagement Quality</div>
          <div className="space-y-3 text-xs">
            {[
              { label: 'Sessions / User (7d)', value: engagement.sessionsPerUser7d, color: 'text-indigo-400' },
              { label: 'Feature Opens (7d)', value: engagement.featureOpens7d, color: 'text-purple-400' },
              { label: 'Total Sessions (30d)', value: engagement.sessions30d, color: 'text-sky-400' },
              { label: 'Page Views (30d)', value: engagement.pageViews30d, color: 'text-sky-400' },
              { label: 'Logins (30d)', value: engagement.logins30d, color: 'text-amber-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-zinc-500">{label}</span>
                <span className={`font-mono font-semibold ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SECTION 5: DOCUMENTS ─────────────────────────────────── */}
      <SectionTitle title="Document Activity" sub="Generated · signed · emailed · templates" />

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Generated', value: documents.total, color: 'text-indigo-400' },
          { label: 'Last 30 Days', value: documents.last30Days, color: 'text-indigo-400' },
          { label: 'Last 7 Days', value: documents.last7Days, color: 'text-indigo-400' },
          { label: 'Today', value: documents.last1Day, color: 'text-white' },
          { label: 'Signed (e-sign)', value: documents.signed, color: 'text-emerald-400' },
          { label: 'Email Delivery Rate', value: `${documents.emailDeliveryRate}%`, color: 'text-sky-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className={`text-xl font-bold font-mono ${color}`}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
            <div className="text-xs text-zinc-500 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Doc daily chart */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold text-white mb-1">Documents Generated (30 days)</div>
          <div className="text-xs text-zinc-500 mb-4">{documents.last30Days} docs in last 30 days</div>
          <AreaChart data={documents.daily.map((d) => ({ date: d.date, value: d.count }))} color="#818cf8" height={80} label="Daily docs" />
        </div>

        {/* Top templates */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold text-white mb-4">Top Templates</div>
          <div className="space-y-2">
            {documents.topTemplates.slice(0, 8).map((t) => {
              const max = documents.topTemplates[0]?.count || 1;
              return (
                <div key={t.name} className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400 flex-1 truncate">{t.name}</span>
                  <div className="w-24 bg-zinc-800 rounded-full h-1.5">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(t.count / max) * 100}%` }} />
                  </div>
                  <span className="text-indigo-400 font-mono w-8 text-right">{t.count}</span>
                </div>
              );
            })}
            {documents.topTemplates.length === 0 && <div className="text-xs text-zinc-700 text-center py-4">No templates yet</div>}
          </div>
        </div>
      </div>

      {/* ── SECTION 6: PUBLISHED FEEDS ──────────────────────────── */}
      <SectionTitle title="Published Content" sub="Feeds · engagement · moderation · publishers" />

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'Total Posts', value: published.total, color: 'text-purple-400' },
          { label: 'Active', value: published.active, color: 'text-emerald-400' },
          { label: 'Suspended', value: published.suspended, color: 'text-red-400' },
          { label: 'Under Review', value: published.underReview, color: 'text-amber-400' },
          { label: 'Last 7 Days', value: published.last7Days, color: 'text-purple-400' },
          { label: 'Total Likes', value: published.totalLikes, color: 'text-pink-400' },
          { label: 'Total Views', value: published.totalViews, color: 'text-sky-400' },
          { label: 'Avg Engagement', value: published.avgEngagementPerPost, color: 'text-amber-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <div className={`text-xl font-bold font-mono ${color}`}>{value.toLocaleString()}</div>
            <div className="text-[10px] text-zinc-600 mt-0.5 leading-tight">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Publishing velocity */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 lg:col-span-2">
          <div className="text-sm font-semibold text-white mb-1">Publishing Velocity (30 days)</div>
          <div className="text-xs text-zinc-500 mb-4">{published.last30Days} posts published in last 30 days</div>
          <AreaChart data={published.dailyVelocity.map((d) => ({ date: d.date, value: d.count }))} color="#a78bfa" height={72} label="Daily posts" />
        </div>

        {/* By category */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold text-white mb-4">By Category</div>
          <div className="space-y-2">
            {Object.entries(published.byCategory).sort(([, a], [, b]) => b - a).map(([cat, count]) => {
              const max = Math.max(...Object.values(published.byCategory), 1);
              return (
                <div key={cat} className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400 flex-1 capitalize">{cat}</span>
                  <div className="w-16 bg-zinc-800 rounded-full h-1.5">
                    <div className="h-full bg-purple-500/70 rounded-full" style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                  <span className="text-zinc-300 font-mono w-6 text-right">{count}</span>
                </div>
              );
            })}
            {Object.keys(published.byCategory).length === 0 && <div className="text-xs text-zinc-700 text-center py-4">No published items yet</div>}
          </div>
        </div>
      </div>

      {/* Moderation + top publishers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Moderation health */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold text-white mb-4">Content Moderation Health</div>
          <div className="space-y-3">
            {[
              { label: 'Active (clean)',   value: published.active,     total: published.total, color: 'bg-emerald-500', text: 'text-emerald-400' },
              { label: 'Suspended',        value: published.suspended,  total: published.total, color: 'bg-red-500',     text: 'text-red-400' },
              { label: 'Under Review',     value: published.underReview,total: published.total, color: 'bg-amber-400',   text: 'text-amber-400' },
              { label: 'Removed',          value: published.removed,    total: published.total, color: 'bg-zinc-600',   text: 'text-zinc-500' },
              { label: 'With User Reports',value: published.withReports,total: published.total, color: 'bg-orange-500', text: 'text-orange-400' },
            ].map(({ label, value, total, color, text }) => (
              <div key={label} className="text-xs">
                <div className="flex items-center justify-between text-zinc-400 mb-1">
                  <span>{label}</span>
                  <span className={`font-mono ${text}`}>{value} <span className="text-zinc-700">({total > 0 ? Math.round((value / total) * 100) : 0}%)</span></span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-1.5">
                  <div className={`h-full ${color} rounded-full`} style={{ width: `${total > 0 ? (value / total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top publishers */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-semibold text-white mb-4">Top Publishers</div>
          <div className="space-y-2">
            {published.topPublishers.length === 0 && <div className="text-xs text-zinc-700 text-center py-4">No publishers yet</div>}
            {published.topPublishers.slice(0, 8).map((p, i) => (
              <div key={p.email} className="flex items-center gap-3 text-xs">
                <span className="text-zinc-700 font-mono w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-zinc-300 truncate">{p.name}</div>
                  <div className="text-zinc-600 truncate">{p.email}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-purple-400 font-mono">{p.count} posts</div>
                  <div className="text-pink-400 font-mono text-[10px]">{p.likes} ♥</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// USERS TAB — full in-depth user behaviour profiles
// ══════════════════════════════════════════════════════════════════════

// ── Shared mini-helpers ────────────────────────────────────────────────
function fmtPaise(p: number) {
  return `₹${((p || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtDur(ms: number) {
  if (!ms || ms < 1000) return '< 1s';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}
function shortDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

// ── Timeline event type colour/icon ──────────────────────────────────
function tlMeta(source: string, type: string): { bg: string; text: string; dot: string; icon: string } {
  if (source === 'billing')  return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-500', icon: '₹' };
  if (source === 'document') return { bg: 'bg-indigo-500/15',  text: 'text-indigo-400',  dot: 'bg-indigo-500',  icon: '📄' };
  if (source === 'audit')    return { bg: 'bg-red-500/15',     text: 'text-red-400',     dot: 'bg-red-500',     icon: '🛡' };
  if (type === 'page_view')  return { bg: 'bg-zinc-700/40',    text: 'text-zinc-400',    dot: 'bg-zinc-500',    icon: '👁' };
  if (type === 'login' || type === 'signup') return { bg: 'bg-sky-500/15', text: 'text-sky-400', dot: 'bg-sky-500', icon: '🔐' };
  if (type === 'feature_open' || type === 'feature_action') return { bg: 'bg-amber-500/15', text: 'text-amber-400', dot: 'bg-amber-500', icon: '⚡' };
  if (type === 'search') return { bg: 'bg-purple-500/15', text: 'text-purple-400', dot: 'bg-purple-500', icon: '🔍' };
  return { bg: 'bg-zinc-800', text: 'text-zinc-400', dot: 'bg-zinc-600', icon: '•' };
}

// ── Activity heatmap row (30-day calendar strip) ───────────────────────
function ActivityHeatmap({ daily }: { daily: { date: string; count: number }[] }) {
  const max = Math.max(...daily.map((d) => d.count), 1);
  const colorFor = (c: number) => {
    if (c === 0) return 'bg-zinc-800';
    const pct = c / max;
    if (pct > 0.75) return 'bg-amber-500';
    if (pct > 0.40) return 'bg-amber-500/60';
    if (pct > 0.15) return 'bg-amber-500/30';
    return 'bg-amber-500/15';
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1 flex-wrap">
        {daily.map(({ date, count }) => (
          <div
            key={date}
            title={`${date}: ${count} events`}
            className={`w-4 h-4 rounded-sm ${colorFor(count)} transition-colors cursor-default`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-zinc-700">
        <span>{daily[0]?.date}</span>
        <span>today</span>
      </div>
    </div>
  );
}

// ── Hourly chart (24-bar sparkline) ───────────────────────────────────
function HourlyBars({ hourly }: { hourly: { hour: number; count: number }[] }) {
  const max = Math.max(...hourly.map((h) => h.count), 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {hourly.map(({ hour, count }) => (
        <div
          key={hour}
          title={`${hour}:00 — ${count} events`}
          className="flex-1 bg-indigo-500/60 rounded-t-sm min-h-[2px] transition-all"
          style={{ height: `${Math.max(4, (count / max) * 32)}px` }}
        />
      ))}
    </div>
  );
}

// ── Live presence badge ───────────────────────────────────────────────
function LiveBadge({ p }: { p: UserBehaviour['livePresence'] }) {
  if (!p.isOnline) return null;
  const statusColor = p.status === 'online' ? 'bg-emerald-500 animate-pulse' : p.status === 'idle' ? 'bg-amber-400' : 'bg-zinc-500';
  const textColor   = p.status === 'online' ? 'text-emerald-400' : p.status === 'idle' ? 'text-amber-400' : 'text-zinc-400';
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${p.status === 'online' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
      <span className={`text-[10px] font-semibold capitalize ${textColor}`}>{p.status}</span>
      {p.path && <span className="text-[10px] text-zinc-600 font-mono">{p.path}</span>}
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────
interface UserBehaviour {
  user: Record<string, unknown>;
  livePresence: {
    isOnline: boolean; status?: string; path?: string; idleMs?: number;
    engagementScore?: number; clickCount?: number; keystrokeCount?: number;
    scrollEventCount?: number; focusDurationMs?: number; connectionType?: string;
    device?: string; browser?: string; os?: string; ip?: string; lastPingAt?: string;
  };
  stats: {
    pageViewsTotal: number; pageViews7d: number; pageViews24h: number;
    sessionsTotal: number; sessions7d: number; sessions24h: number;
    featureOpens24h: number; events7d: number; eventsTotal: number;
    lastSeenAt?: string; lastIp?: string; lastUserAgent?: string;
    docsGenerated: number; lastDocAt?: string;
    paidTotalInPaise: number; paid30dInPaise: number; paidTransactions: number; lastPaidAt?: string;
  };
  topTabs7d: { tabId: string; count: number }[];
  topFeatures7d: { featureId: string; count: number }[];
  pageHeatmap: { path: string; count: number; lastVisitAt: string }[];
  dailyActivity: { date: string; count: number }[];
  hourlyPattern: { hour: number; count: number }[];
  timeline: { id: string; source: string; type: string; label: string; detail?: string; path?: string; ip?: string; sessionId?: string; amountInPaise?: number; createdAt: string }[];
  sessionHistory: { sessionId: string; startAt: string; endAt: string; durationMs: number; pageViews: number; featureOpens: number; pages: string[]; surface: string; ip?: string; userAgent?: string; device?: string; browser?: string }[];
  documents: { id: string; templateName: string; category?: string; generatedAt: string; emailSent?: boolean; emailTo?: string }[];
  transactions: { id: string; planName?: string; productLabel?: string; amountInPaise: number; status: string; createdAt: string; paidAt?: string }[];
  feedback: { id: string; rating: number; summary: string; painPoints: string; requestedImprovements: string; createdAt: string }[];
  audits: { id: string; action: string; reason?: string; createdAt: string; actorEmail?: string }[];
  infinity?: {
    active: boolean;
    isExpired: boolean;
    purchasedAt?: string;
    expiresAt?: string;
    period?: 'monthly' | 'annual';
    renewalCount?: number;
    grantedFree?: boolean;
  };
}

function UsersTab() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [userBehaviour, setUserBehaviour] = useState<UserBehaviour | null>(null);
  const [behaviourLoading, setBehaviourLoading] = useState(false);
  const [behaviourTab, setBehaviourTab] = useState<'overview' | 'timeline' | 'sessions' | 'pages' | 'billing' | 'audit'>('overview');
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/super-admin/users?query=${encodeURIComponent(query)}&status=${statusFilter}&limit=300`)
      .then((r) => r.json()).then((d) => setUsers(d.users || [])).catch(console.error).finally(() => setLoading(false));
  }, [query, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function doAction(action: string, userId: string, extra?: Record<string, unknown>) {
    setActionLoading(true);
    try {
      const res = await fetch('/api/super-admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, userId, ...extra }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error || 'Failed'); return; }

      if (action === 'activate_premium' || action === 'revoke_premium') {
        setMsg(action === 'activate_premium' ? 'Premium activated' : 'Premium revoked');
        if (d.infinity) {
          setUserBehaviour((prev) => (prev ? { ...prev, infinity: d.infinity } : prev));
        } else {
          fetch(`/api/super-admin/user-behavior/${userId}`)
            .then((r) => r.json())
            .then(setUserBehaviour)
            .catch(() => null);
        }
        setTimeout(() => setMsg(''), 2500);
        return;
      }

      setMsg('Done');
      load();
      setSelectedUser(null);
      setTimeout(() => setMsg(''), 2000);
    } finally { setActionLoading(false); }
  }

  function openUser(u: UserRow) {
    setSelectedUser(u);
    setBehaviourTab('overview');
    setUserBehaviour(null);
    setBehaviourLoading(true);
    fetch(`/api/super-admin/user-behavior/${u.id}`)
      .then((r) => r.json()).then(setUserBehaviour).catch(() => setUserBehaviour(null)).finally(() => setBehaviourLoading(false));
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="User Management" sub={`${users.length} users loaded`} />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, org…" className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 min-w-60" />
        {(['all', 'active', 'suspended', 'disabled'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all capitalize ${statusFilter === s ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'}`}>{s}</button>
        ))}
        {msg && <span className="text-xs text-emerald-400 self-center">{msg}</span>}
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Org</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Plan</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Joined</th>
                <th className="text-left px-4 py-3 font-medium">Last Login</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading && <tr><td colSpan={8} className="text-center py-8 text-zinc-600">Loading…</td></tr>}
              {!loading && users.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-zinc-600">No users found</td></tr>}
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400 flex-shrink-0">{(u.name || u.email)[0]?.toUpperCase()}</div>
                      <div>
                        <div className="text-white font-medium truncate max-w-[140px]">{u.name || '—'}</div>
                        <div className="text-zinc-500 text-xs truncate max-w-[140px]">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 text-xs max-w-[100px] truncate">{u.organizationName || '—'}</td>
                  <td className="px-4 py-3"><span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">{u.role}</span></td>
                  <td className="px-4 py-3"><span className="text-xs text-zinc-400">{(u.subscription as Record<string, string>)?.planId || '—'}</span></td>
                  <td className="px-4 py-3"><span className={badge(u.status)}>{u.status}</span></td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{ago(u.createdAt)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{ago(u.lastLogin)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openUser(u)} className="text-xs text-amber-500 hover:text-amber-400 transition-colors font-medium">Profile →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Deep-dive modal ───────────────────────────────────────────── */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4" onClick={() => setSelectedUser(null)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-zinc-800 flex-shrink-0">
              <div className="w-11 h-11 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400 text-lg flex-shrink-0">
                {(selectedUser.name || selectedUser.email)[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold text-white text-base">{selectedUser.name || '—'}</span>
                  <span className={badge(selectedUser.status)}>{selectedUser.status}</span>
                  <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full">{selectedUser.role}</span>
                  {userBehaviour?.livePresence && <LiveBadge p={userBehaviour.livePresence} />}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">{selectedUser.email}</div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="text-zinc-600 hover:text-zinc-400 ml-2 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Sub-tab bar */}
            <div className="flex gap-0 px-6 pt-3 pb-0 flex-shrink-0 border-b border-zinc-800/60 overflow-x-auto">
              {(['overview', 'timeline', 'sessions', 'pages', 'billing', 'audit'] as const).map((t) => (
                <button key={t} onClick={() => setBehaviourTab(t)}
                  className={`px-4 py-2 text-xs font-medium capitalize rounded-t-lg transition-all -mb-px border-b-2 whitespace-nowrap ${behaviourTab === t ? 'text-amber-400 border-amber-500' : 'text-zinc-500 border-transparent hover:text-zinc-300'}`}>
                  {t === 'overview' && '📊 '}
                  {t === 'timeline' && '🕐 '}
                  {t === 'sessions' && '📡 '}
                  {t === 'pages' && '🗺 '}
                  {t === 'billing' && '₹ '}
                  {t === 'audit' && '🛡 '}
                  {t}
                </button>
              ))}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {behaviourLoading ? (
                <div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <>
                  {/* ── OVERVIEW ───────────────────────────────────────── */}
                  {behaviourTab === 'overview' && (
                    <div className="space-y-5">
                      {/* Account basics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        {[
                          ['Role',         selectedUser.role],
                          ['Account Type', selectedUser.accountType || '—'],
                          ['Organization', selectedUser.organizationName || '—'],
                          ['Plan',         (selectedUser.subscription as Record<string, string>)?.planId || '—'],
                          ['Plan Status',  (selectedUser.subscription as Record<string, string>)?.status || '—'],
                          ['Premium ∞',    userBehaviour?.infinity?.active
                            ? `Active${userBehaviour.infinity.period ? ` · ${userBehaviour.infinity.period}` : ''}${userBehaviour.infinity.expiresAt ? ` · exp ${ago(userBehaviour.infinity.expiresAt)}` : ''}${userBehaviour.infinity.grantedFree ? ' · free grant' : ''}`
                            : userBehaviour?.infinity?.isExpired ? 'Expired' : 'Not active'],
                          ['Joined',       ago(selectedUser.createdAt)],
                          ['Last Login',   ago(selectedUser.lastLogin)],
                          ['User ID',      selectedUser.id.slice(0, 14) + '…'],
                        ].map(([k, v]) => (
                          <div key={k} className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                            <div className="text-zinc-600 mb-0.5 uppercase tracking-wider text-[9px]">{k}</div>
                            <div className="text-white font-medium truncate">{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Live presence detail */}
                      {userBehaviour?.livePresence?.isOnline && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                          <div className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-3">Currently Online</div>
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
                            {[
                              { label: 'Status',      value: userBehaviour.livePresence.status || '—',                         color: 'text-emerald-400' },
                              { label: 'Engagement',  value: `${userBehaviour.livePresence.engagementScore ?? '—'}/100`,        color: 'text-amber-400' },
                              { label: 'Idle',        value: fmtDur(userBehaviour.livePresence.idleMs || 0),                   color: 'text-zinc-400' },
                              { label: 'Clicks',      value: String(userBehaviour.livePresence.clickCount ?? 0),               color: 'text-purple-400' },
                              { label: 'Keystrokes',  value: String(userBehaviour.livePresence.keystrokeCount ?? 0),           color: 'text-indigo-400' },
                              { label: 'Focus Time',  value: fmtDur(userBehaviour.livePresence.focusDurationMs || 0),         color: 'text-sky-400' },
                              { label: 'Device',      value: userBehaviour.livePresence.device || '—',                         color: 'text-zinc-300' },
                              { label: 'Browser',     value: userBehaviour.livePresence.browser || '—',                        color: 'text-zinc-300' },
                              { label: 'OS',          value: userBehaviour.livePresence.os || '—',                             color: 'text-zinc-300' },
                              { label: 'Connection',  value: userBehaviour.livePresence.connectionType || '—',                 color: 'text-zinc-300' },
                              { label: 'IP',          value: userBehaviour.livePresence.ip || '—',                             color: 'text-zinc-400' },
                              { label: 'Last Ping',   value: ago(userBehaviour.livePresence.lastPingAt),                       color: 'text-zinc-500' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="bg-zinc-900/50 rounded-lg p-2">
                                <div className="text-zinc-600 text-[9px] uppercase tracking-wider">{label}</div>
                                <div className={`font-mono font-medium mt-0.5 ${color}`}>{value}</div>
                              </div>
                            ))}
                          </div>
                          {userBehaviour.livePresence.path && (
                            <div className="mt-3 text-[10px] font-mono text-zinc-500 bg-zinc-900/50 rounded px-3 py-1.5">
                              Currently on: <span className="text-amber-400">{userBehaviour.livePresence.path}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Stats KPI grid */}
                      {userBehaviour && (
                        <>
                          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                            {[
                              { label: 'Page Views (24h)',  value: userBehaviour.stats.pageViews24h,         color: 'text-sky-400' },
                              { label: 'Page Views (7d)',   value: userBehaviour.stats.pageViews7d,          color: 'text-sky-400' },
                              { label: 'Page Views Total',  value: userBehaviour.stats.pageViewsTotal,       color: 'text-sky-300' },
                              { label: 'Sessions (24h)',    value: userBehaviour.stats.sessions24h,          color: 'text-indigo-400' },
                              { label: 'Sessions (7d)',     value: userBehaviour.stats.sessions7d,           color: 'text-indigo-400' },
                              { label: 'Sessions Total',    value: userBehaviour.stats.sessionsTotal,        color: 'text-indigo-300' },
                              { label: 'Events (7d)',       value: userBehaviour.stats.events7d,             color: 'text-amber-400' },
                              { label: 'Events Total',      value: userBehaviour.stats.eventsTotal,          color: 'text-amber-400' },
                              { label: 'Feature Opens 24h', value: userBehaviour.stats.featureOpens24h,      color: 'text-purple-400' },
                              { label: 'Docs Generated',    value: userBehaviour.stats.docsGenerated,        color: 'text-emerald-400' },
                              { label: 'Total Paid',        value: fmtPaise(userBehaviour.stats.paidTotalInPaise), color: 'text-emerald-400' },
                              { label: 'Paid (30d)',        value: fmtPaise(userBehaviour.stats.paid30dInPaise),   color: 'text-emerald-400' },
                            ].map(({ label, value, color }) => (
                              <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
                                <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
                                <div className="text-zinc-600 text-[10px] mt-0.5">{label}</div>
                              </div>
                            ))}
                          </div>

                          {/* Last seen + IP */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex gap-4">
                              <div><div className="text-zinc-600 text-[9px] uppercase">Last Seen</div><div className="text-zinc-300 font-mono mt-0.5">{shortDate(userBehaviour.stats.lastSeenAt)}</div></div>
                              {userBehaviour.stats.lastIp && <div><div className="text-zinc-600 text-[9px] uppercase">Last IP</div><div className="text-zinc-300 font-mono mt-0.5">{userBehaviour.stats.lastIp}</div></div>}
                            </div>
                            {userBehaviour.stats.lastUserAgent && (
                              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                                <div className="text-zinc-600 text-[9px] uppercase mb-0.5">Last User-Agent</div>
                                <div className="text-zinc-500 font-mono text-[10px] truncate">{userBehaviour.stats.lastUserAgent}</div>
                              </div>
                            )}
                          </div>

                          {/* 30-day activity heatmap */}
                          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                            <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">30-Day Activity Heatmap</div>
                            <ActivityHeatmap daily={userBehaviour.dailyActivity} />
                          </div>

                          {/* Hourly pattern */}
                          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                            <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Active Hours (0–23)</div>
                            <HourlyBars hourly={userBehaviour.hourlyPattern} />
                            <div className="flex justify-between text-[9px] text-zinc-700 mt-1">
                              <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
                            </div>
                          </div>

                          {/* Top tabs + features */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {userBehaviour.topTabs7d.length > 0 && (
                              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                                <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Top Tabs Used (7d)</div>
                                <div className="space-y-2">
                                  {userBehaviour.topTabs7d.map((t) => (
                                    <div key={t.tabId} className="flex items-center gap-2 text-xs">
                                      <span className="text-zinc-400 flex-1 truncate">{t.tabId}</span>
                                      <div className="w-16 bg-zinc-800 rounded-full h-1 overflow-hidden">
                                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, (t.count / (userBehaviour.topTabs7d[0]?.count || 1)) * 100)}%` }} />
                                      </div>
                                      <span className="text-amber-400 font-mono w-5 text-right">{t.count}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {userBehaviour.topFeatures7d.length > 0 && (
                              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                                <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Top Features Used (7d)</div>
                                <div className="space-y-2">
                                  {userBehaviour.topFeatures7d.map((f) => (
                                    <div key={f.featureId} className="flex items-center gap-2 text-xs">
                                      <span className="text-zinc-400 flex-1 truncate">{f.featureId}</span>
                                      <div className="w-16 bg-zinc-800 rounded-full h-1 overflow-hidden">
                                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (f.count / (userBehaviour.topFeatures7d[0]?.count || 1)) * 100)}%` }} />
                                      </div>
                                      <span className="text-indigo-400 font-mono w-5 text-right">{f.count}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Latest feedback */}
                          {userBehaviour.feedback.length > 0 && (
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                              <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Feedback ({userBehaviour.feedback.length} entries)</div>
                              {userBehaviour.feedback.slice(0, 3).map((fb) => (
                                <div key={fb.id} className="mb-3 last:mb-0 p-3 bg-zinc-800/50 rounded-lg">
                                  <div className="flex items-center gap-2 mb-1">
                                    <div className="flex">{[1,2,3,4,5].map((n) => <span key={n} className={n <= fb.rating ? 'text-amber-400 text-xs' : 'text-zinc-700 text-xs'}>★</span>)}</div>
                                    <span className="text-zinc-600 text-[10px]">{ago(fb.createdAt)}</span>
                                  </div>
                                  {fb.summary && <div className="text-xs text-zinc-300">"{fb.summary}"</div>}
                                  {fb.painPoints && <div className="text-[10px] text-zinc-500 mt-1">Pain: {fb.painPoints}</div>}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {/* Safety flag */}
                      {selectedUser.safety?.scamWarning && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400 flex items-center gap-2">
                          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          Flagged as suspicious · {ago(selectedUser.safety.flaggedAt)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── TIMELINE ────────────────────────────────────────── */}
                  {behaviourTab === 'timeline' && userBehaviour && (
                    <div className="space-y-1.5">
                      <div className="text-xs text-zinc-500 mb-3">
                        Unified activity log · {userBehaviour.timeline.length} events across all sources
                      </div>
                      {userBehaviour.timeline.length === 0 && (
                        <div className="text-center py-12 text-zinc-600 text-sm">No events recorded yet</div>
                      )}
                      {userBehaviour.timeline.map((ev) => {
                        const m = tlMeta(ev.source, ev.type);
                        return (
                          <div key={ev.id} className="flex items-start gap-3 px-4 py-2.5 bg-zinc-900 border border-zinc-800/50 rounded-lg hover:border-zinc-700 transition-colors">
                            {/* Dot */}
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${m.dot}`} />
                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${m.bg} ${m.text}`}>{ev.source}</span>
                                <span className="text-xs text-zinc-300 font-medium">{ev.label}</span>
                                {ev.detail && <span className="text-xs text-zinc-500 truncate max-w-xs">{ev.detail}</span>}
                                {ev.amountInPaise != null && <span className="text-xs text-emerald-400 font-mono">{fmtPaise(ev.amountInPaise)}</span>}
                              </div>
                              {ev.path && (
                                <div className="text-[10px] font-mono text-zinc-600 mt-0.5">{ev.path}</div>
                              )}
                            </div>
                            {/* Time */}
                            <div className="text-right flex-shrink-0">
                              <div className="text-[10px] text-zinc-500">{ago(ev.createdAt)}</div>
                              {ev.ip && <div className="text-[10px] text-zinc-700 font-mono">{ev.ip}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── SESSIONS ────────────────────────────────────────── */}
                  {behaviourTab === 'sessions' && userBehaviour && (
                    <div className="space-y-3">
                      <div className="text-xs text-zinc-500 mb-2">
                        {userBehaviour.sessionHistory.length} sessions tracked · {userBehaviour.stats.sessionsTotal} total (all-time)
                      </div>
                      {userBehaviour.sessionHistory.length === 0 && (
                        <div className="text-center py-12 text-zinc-600 text-sm">No session data yet</div>
                      )}
                      {userBehaviour.sessionHistory.map((s, i) => (
                        <div key={s.sessionId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-white">Session #{userBehaviour.sessionHistory.length - i}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${s.surface === 'workspace' ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-800 text-zinc-500'}`}>{s.surface}</span>
                                {s.device && <span className="text-[10px] text-zinc-600 capitalize">{s.device}</span>}
                                {s.browser && <span className="text-[10px] text-zinc-600">{s.browser}</span>}
                              </div>
                              <div className="text-[10px] text-zinc-600 mt-0.5 font-mono">{shortDate(s.startAt)} → {ago(s.endAt)}</div>
                            </div>
                            <div className="flex gap-4 flex-shrink-0 text-xs">
                              <div className="text-center"><div className="font-mono text-sky-400">{s.pageViews}</div><div className="text-zinc-600">pages</div></div>
                              <div className="text-center"><div className="font-mono text-amber-400">{s.featureOpens}</div><div className="text-zinc-600">features</div></div>
                              <div className="text-center"><div className="font-mono text-zinc-300">{fmtDur(s.durationMs)}</div><div className="text-zinc-600">duration</div></div>
                            </div>
                          </div>
                          {/* Pages visited */}
                          {s.pages.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {s.pages.map((p, j) => (
                                <span key={j} className={`text-[10px] font-mono px-2 py-0.5 rounded ${j === 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-800 text-zinc-500'}`}>{p}</span>
                              ))}
                            </div>
                          )}
                          {s.ip && <div className="mt-2 text-[10px] font-mono text-zinc-700">{s.ip}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── PAGES ────────────────────────────────────────────── */}
                  {behaviourTab === 'pages' && userBehaviour && (
                    <div className="space-y-2">
                      <div className="text-xs text-zinc-500 mb-2">
                        {userBehaviour.pageHeatmap.length} unique pages visited · all-time
                      </div>
                      {userBehaviour.pageHeatmap.length === 0 && (
                        <div className="text-center py-12 text-zinc-600 text-sm">No page visit data yet</div>
                      )}
                      {userBehaviour.pageHeatmap.map((p, i) => {
                        const maxCount = userBehaviour.pageHeatmap[0]?.count || 1;
                        return (
                          <div key={p.path} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5">
                            <span className="text-zinc-700 text-[10px] font-mono w-5 flex-shrink-0">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-mono text-zinc-300 truncate">{p.path}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 bg-zinc-800 rounded-full h-1 overflow-hidden max-w-[120px]">
                                  <div className="h-full bg-sky-500/70 rounded-full" style={{ width: `${(p.count / maxCount) * 100}%` }} />
                                </div>
                                <span className="text-[10px] text-zinc-600">last: {ago(p.lastVisitAt)}</span>
                              </div>
                            </div>
                            <span className="text-sky-400 font-mono font-bold text-sm flex-shrink-0">{p.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── BILLING ─────────────────────────────────────────── */}
                  {behaviourTab === 'billing' && userBehaviour && (
                    <div className="space-y-4">
                      {/* Summary */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Total Paid',    value: fmtPaise(userBehaviour.stats.paidTotalInPaise), color: 'text-emerald-400' },
                          { label: 'Paid (30d)',     value: fmtPaise(userBehaviour.stats.paid30dInPaise),   color: 'text-emerald-400' },
                          { label: 'Transactions',  value: String(userBehaviour.stats.paidTransactions),   color: 'text-white' },
                          { label: 'Last Payment',  value: ago(userBehaviour.stats.lastPaidAt),            color: 'text-zinc-400' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                            <div className={`text-xl font-bold ${color}`}>{value}</div>
                            <div className="text-zinc-600 text-[10px] mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>
                      {/* Transactions list */}
                      {userBehaviour.transactions.length === 0 && (
                        <div className="text-center py-8 text-zinc-600 text-sm">No transactions yet</div>
                      )}
                      <div className="space-y-2">
                        {userBehaviour.transactions.map((t) => (
                          <div key={t.id} className="flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="text-zinc-300 font-medium">{t.planName || t.productLabel || t.id.slice(0, 14) + '…'}</div>
                              <div className="text-zinc-600 text-[10px] mt-0.5">{shortDate(t.paidAt || t.createdAt)}</div>
                            </div>
                            <span className={badge(t.status)}>{t.status}</span>
                            <span className={`font-mono font-bold ${t.status === 'paid' ? 'text-emerald-400' : 'text-zinc-500'}`}>{fmtPaise(t.amountInPaise)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Documents sub-section */}
                      {userBehaviour.documents.length > 0 && (
                        <div>
                          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">Documents Generated ({userBehaviour.documents.length})</div>
                          <div className="space-y-1.5">
                            {userBehaviour.documents.slice(0, 20).map((d) => (
                              <div key={d.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800/50 rounded-lg px-4 py-2.5 text-xs">
                                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-mono flex-shrink-0">{d.category || 'doc'}</span>
                                <span className="text-zinc-300 flex-1 truncate">{d.templateName}</span>
                                {d.emailSent && <span className="text-emerald-500 text-[10px]">✓ emailed</span>}
                                <span className="text-zinc-600 flex-shrink-0">{ago(d.generatedAt)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── AUDIT ───────────────────────────────────────────── */}
                  {behaviourTab === 'audit' && userBehaviour && (
                    <div className="space-y-2">
                      <div className="text-xs text-zinc-500 mb-2">Admin actions taken on this user</div>
                      {userBehaviour.audits.length === 0 && (
                        <div className="text-center py-12 text-zinc-600 text-sm">No audit entries</div>
                      )}
                      {userBehaviour.audits.map((a) => (
                        <div key={a.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs">
                          <div className="w-2 h-2 rounded-full bg-red-500/60 flex-shrink-0" />
                          <span className="text-zinc-500 flex-shrink-0 font-mono">{shortDate(a.createdAt)}</span>
                          <span className="font-mono text-amber-400 font-semibold">{a.action}</span>
                          {a.reason && <span className="text-zinc-500 truncate">"{a.reason}"</span>}
                          {a.actorEmail && <span className="text-zinc-600 ml-auto flex-shrink-0">by {a.actorEmail}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Actions footer */}
            <div className="border-t border-zinc-800 px-6 py-3 flex-shrink-0 bg-zinc-950 space-y-2">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider mr-1">Premium:</span>
                <button
                  disabled={actionLoading}
                  onClick={() => doAction('activate_premium', selectedUser.id, { period: 'monthly' })}
                  className="px-3 py-1.5 bg-violet-500/15 border border-violet-500/30 text-violet-300 rounded-lg text-xs hover:bg-violet-500/25 transition-all disabled:opacity-50 font-semibold"
                >
                  ∞ Activate 30d
                </button>
                <button
                  disabled={actionLoading}
                  onClick={() => doAction('activate_premium', selectedUser.id, { period: 'annual' })}
                  className="px-3 py-1.5 bg-violet-500/15 border border-violet-500/30 text-violet-300 rounded-lg text-xs hover:bg-violet-500/25 transition-all disabled:opacity-50 font-semibold"
                >
                  ∞ Activate 1yr
                </button>
                <button
                  disabled={actionLoading || !userBehaviour?.infinity?.active}
                  onClick={() => { if (confirm('Revoke Infinity premium for this user?')) doAction('revoke_premium', selectedUser.id); }}
                  className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-lg text-xs hover:bg-zinc-700 hover:text-zinc-200 transition-all disabled:opacity-40"
                >
                  Revoke Premium
                </button>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider mr-1">Actions:</span>
                {selectedUser.status !== 'suspended' ? (
                  <button disabled={actionLoading} onClick={() => doAction('suspend', selectedUser.id, { days: 7 })} className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-xs hover:bg-amber-500/20 transition-all disabled:opacity-50">Suspend 7d</button>
                ) : (
                  <button disabled={actionLoading} onClick={() => doAction('unsuspend', selectedUser.id)} className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/20 transition-all disabled:opacity-50">Unsuspend</button>
                )}
                {selectedUser.isActive ? (
                  <button disabled={actionLoading} onClick={() => doAction('disable', selectedUser.id)} className="px-3 py-1.5 bg-zinc-700/50 border border-zinc-600/20 text-zinc-400 rounded-lg text-xs hover:bg-zinc-700 transition-all disabled:opacity-50">Disable</button>
                ) : (
                  <button disabled={actionLoading} onClick={() => doAction('enable', selectedUser.id)} className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/20 transition-all disabled:opacity-50">Enable</button>
                )}
                {selectedUser.safety?.scamWarning ? (
                  <button disabled={actionLoading} onClick={() => doAction('clear_flag', selectedUser.id)} className="px-3 py-1.5 bg-zinc-700/50 border border-zinc-600/20 text-zinc-400 rounded-lg text-xs hover:bg-zinc-700 transition-all disabled:opacity-50">Clear Flag</button>
                ) : (
                  <button disabled={actionLoading} onClick={() => doAction('flag_scam', selectedUser.id)} className="px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-lg text-xs hover:bg-orange-500/20 transition-all disabled:opacity-50">Flag Suspicious</button>
                )}
                <button disabled={actionLoading} onClick={() => doAction('suspend', selectedUser.id, { days: 30 })} className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-all disabled:opacity-50">Suspend 30d</button>
                <button disabled={actionLoading} onClick={() => { if (confirm('Permanently delete this user? This cannot be undone.')) doAction('delete', selectedUser.id); }} className="px-3 py-1.5 bg-red-900/30 border border-red-800/30 text-red-400 rounded-lg text-xs hover:bg-red-900/50 transition-all disabled:opacity-50 ml-auto">⚠ Delete</button>
              </div>
              {msg && <div className="text-xs text-emerald-400 mt-1">{msg}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════
// PLANS TAB
// ══════════════════════════════════════════════════════════════════════
function PlansTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/super-admin/plans').then((r) => r.json()).then((d) => setPlans(d.plans || [])).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  async function savePlan(plan: Plan, action: 'create' | 'update') {
    const res = await fetch('/api/super-admin/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, plan }) });
    if (res.ok) { setMsg('Saved'); load(); setEditing(null); setTimeout(() => setMsg(''), 2000); }
    else { const d = await res.json(); setMsg(d.error || 'Failed'); }
  }

  async function deletePlan(id: string) {
    if (!confirm('Delete this plan?')) return;
    const res = await fetch('/api/super-admin/plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', plan: { id } }) });
    if (res.ok) { setMsg('Deleted'); load(); setTimeout(() => setMsg(''), 2000); }
  }

  if (loading) return <Loader />;

  return (
    <div className="space-y-5">
      <SectionHeader title="Plans & Billing" sub="Manage subscription plans and pricing"
        action={<button onClick={() => setEditing({ id: '', name: '', priceInPaise: 0, billingCycle: 'monthly', isPublic: true, features: [] })} className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold px-4 py-2 rounded-lg transition-all">+ New Plan</button>}
      />
      {msg && <div className="text-xs text-emerald-400">{msg}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((p) => (
          <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-white">{p.name}</div>
                <div className="text-xs text-zinc-500 mt-0.5">{p.id}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-amber-400">{fmt(p.priceInPaise)}</div>
                <div className="text-xs text-zinc-600">/{p.billingCycle || 'mo'}</div>
              </div>
            </div>

            {p.stats && (
              <div className="grid grid-cols-4 gap-2 text-center">
                {[['Subscribers', p.stats.subscribers], ['Trials', p.stats.trials], ['Active', p.stats.active], ['Revenue', fmt(p.stats.revenue)]].map(([k, v]) => (
                  <div key={k as string} className="bg-zinc-800 rounded-lg p-2">
                    <div className="text-xs text-zinc-500">{k}</div>
                    <div className="text-sm font-semibold text-white mt-0.5">{v}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <span className={badge(p.isPublic ? 'active' : 'disabled')}>{p.isPublic ? 'Public' : 'Hidden'}</span>
              <div className="flex gap-2">
                <button onClick={() => setEditing(p)} className="text-xs text-amber-500 hover:text-amber-400 transition-colors">Edit</button>
                <button onClick={() => deletePlan(p.id)} className="text-xs text-red-500 hover:text-red-400 transition-colors">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Plan editor modal */}
      {editing !== null && (
        <PlanEditor plan={editing} onSave={(p) => savePlan(p, p.id && plans.find((x) => x.id === p.id) ? 'update' : 'create')} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function PlanEditor({ plan, onSave, onClose }: { plan: Plan; onSave: (p: Plan) => void; onClose: () => void }) {
  const [form, setForm] = useState({ ...plan, features: plan.features?.join('\n') || '' });
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">{plan.id ? 'Edit Plan' : 'New Plan'}</h3>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(['id', 'name'] as const).map((k) => (
            <div key={k}><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">{k}</label><input value={String((form as unknown as Record<string, unknown>)[k] ?? '')} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" /></div>
          ))}
          <div><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Price (paise)</label><input type="number" value={form.priceInPaise} onChange={(e) => setForm({ ...form, priceInPaise: Number(e.target.value) })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" /></div>
          <div><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Billing Cycle</label><select value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500"><option value="monthly">Monthly</option><option value="yearly">Yearly</option><option value="one-time">One-time</option></select></div>
        </div>
        <div><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Description</label><input value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" /></div>
        <div><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Features (one per line)</label><textarea value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} rows={4} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none" /></div>
        <div className="flex items-center gap-2"><Toggle enabled={Boolean(form.isPublic)} onChange={(v) => setForm({ ...form, isPublic: v })} /><span className="text-sm text-zinc-400">Publicly visible</span></div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors">Cancel</button>
          <button onClick={() => onSave({ ...form, features: String(form.features ?? '').split('\n').filter(Boolean) } as Plan)} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg transition-all">Save Plan</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// PLATFORM TAB
// ══════════════════════════════════════════════════════════════════════
function PlatformTab() {
  const [data, setData] = useState<PlatformData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/super-admin/platform').then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  async function updateFlags(updates: Record<string, unknown>) {
    setSaving(true);
    await fetch('/api/super-admin/platform', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_flags', data: { ...data?.flags, ...updates } }) });
    setSaving(false); setMsg('Saved'); load(); setTimeout(() => setMsg(''), 2000);
  }

  async function toggleFeature(key: string, val: boolean) {
    setSaving(true);
    await fetch('/api/super-admin/platform', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'update_feature_controls', data: { [key]: val } }) });
    setSaving(false); setMsg('Saved'); load(); setTimeout(() => setMsg(''), 2000);
  }

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load platform data" />;

  const flags = data.flags as Record<string, unknown>;

  return (
    <div className="space-y-6">
      <SectionHeader title="Platform Controls" sub="Global flags, feature switches, and active sessions" />
      {msg && <div className="text-xs text-emerald-400">{msg}</div>}

      {/* Platform flags */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-4">Platform Flags</div>
        <div className="space-y-4">
          {[
            { key: 'maintenanceMode', label: 'Maintenance Mode', sub: 'Show maintenance page to all users', danger: true },
            { key: 'newSignupsEnabled', label: 'New Signups Enabled', sub: 'Allow new users to register' },
            { key: 'publicGigsEnabled', label: 'Public Gigs / Connect', sub: 'Gig marketplace visible' },
            { key: 'publicMarketplaceEnabled', label: 'Template Marketplace', sub: 'Public template market' },
            { key: 'publicBlogEnabled', label: 'Blog / Content', sub: 'Public blog section' },
          ].map(({ key, label, sub, danger }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <div className={`text-sm font-medium ${danger && flags[key] ? 'text-red-400' : 'text-white'}`}>{label}</div>
                <div className="text-xs text-zinc-500">{sub}</div>
              </div>
              <Toggle enabled={Boolean(flags[key])} disabled={saving} onChange={(v) => updateFlags({ [key]: v })} />
            </div>
          ))}
        </div>
      </div>

      {/* Global broadcast */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-1">Global Broadcast Banner</div>
        <div className="text-xs text-zinc-500 mb-4">Shown to all logged-in users</div>
        <BroadcastEditor current={flags.globalBroadcast as { message: string; type: string } | null} onSave={(v) => updateFlags({ globalBroadcast: v })} />
      </div>

      {/* Feature controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-4">Feature Controls</div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(data.featureControls).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2.5">
              <span className="text-xs text-zinc-300 font-mono">{key}</span>
              <Toggle enabled={val} disabled={saving} onChange={(v) => toggleFeature(key, v)} />
            </div>
          ))}
        </div>
      </div>

      {/* Active sessions */}
      {data.activeSuperAdminSessions.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-4">Active Super Admin Sessions</div>
          <div className="space-y-2">
            {data.activeSuperAdminSessions.map((s, i) => (
              <div key={i} className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-3 text-xs">
                <div className="text-zinc-300">{s.email}</div>
                <div className="text-zinc-500">{s.ip || 'unknown IP'}</div>
                <div className="text-zinc-500">expires {ago(s.expiresAt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BroadcastEditor({ current, onSave }: { current: { message: string; type: string } | null; onSave: (v: { message: string; type: string; createdAt: string } | null) => void }) {
  const [message, setMessage] = useState(current?.message || '');
  const [type, setType] = useState(current?.type || 'info');
  return (
    <div className="space-y-3">
      <select value={type} onChange={(e) => setType(e.target.value)} className="bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500">
        <option value="info">Info</option><option value="warning">Warning</option><option value="error">Error / Alert</option>
      </select>
      <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Broadcast message…" className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
      <div className="flex gap-2">
        <button onClick={() => onSave(message.trim() ? { message, type, createdAt: new Date().toISOString() } : null)} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-lg transition-all">{message ? 'Set Broadcast' : 'Clear Broadcast'}</button>
        {current && <button onClick={() => { setMessage(''); onSave(null); }} className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-lg transition-all">Clear</button>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// ANALYTICS TAB
// ══════════════════════════════════════════════════════════════════════
function AnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/super-admin/analytics?days=${days}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load analytics" />;

  const { overview, topPages, topFeatures, topDocTypes, dailyActivity, dailyRevenue, signupsByRole, signupsByAccountType } = data;

  return (
    <div className="space-y-6">
      <SectionHeader title="Analytics & Insights" sub="Deep platform usage data"
        action={
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {[7, 14, 30, 60, 90].map((d) => (
                <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${days === d ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-zinc-500 hover:text-zinc-300 border border-transparent hover:border-zinc-700'}`}>{d}d</button>
              ))}
            </div>
            {lastUpdated && <span className="text-xs text-zinc-700">Updated {lastUpdated}</span>}
          </div>
        }
      />

      {/* Overview metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { k: 'totalPageViews', label: 'Page Views', color: 'text-sky-400' },
          { k: 'totalNewUsers', label: 'New Users', color: 'text-emerald-400' },
          { k: 'totalDocuments', label: 'Documents', color: 'text-indigo-400' },
          { k: 'totalRevenuePaise', label: 'Revenue', color: 'text-amber-400', fmt: true },
        ].map(({ k, label, color, fmt: isFmt }) => (
          <div key={k} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="text-xs text-zinc-500 mb-1">{label}</div>
            <div className={`text-xl font-bold ${color}`}>{isFmt ? fmt(overview[k] || 0) : (overview[k] || 0).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Daily activity chart (text-based) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-4">Daily Activity</div>
        <div className="overflow-x-auto">
          <div className="flex items-end gap-1 h-24 min-w-max">
            {dailyActivity.map((d, i) => {
              const maxVal = Math.max(...dailyActivity.map((x) => x.pageViews), 1);
              const h = Math.max(2, (d.pageViews / maxVal) * 88);
              return (
                <div key={i} className="flex flex-col items-center gap-1 group relative">
                  <div className="absolute bottom-full mb-1 bg-zinc-800 border border-zinc-700 text-xs text-white px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    {d.date}<br />Views: {d.pageViews} · Docs: {d.docs}
                  </div>
                  <div className="w-4 bg-indigo-500/60 hover:bg-indigo-500 rounded-sm transition-colors" style={{ height: h }} />
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 mt-1 min-w-max">
            {dailyActivity.map((d, i) => (
              <div key={i} className="w-4 text-[8px] text-zinc-700 text-center">{d.date.slice(5)}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Top content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { title: 'Top Pages', items: topPages.map((p) => ({ label: p.path, value: p.views })) },
          { title: 'Top Features', items: topFeatures.map((f) => ({ label: f.feature, value: f.count })) },
          { title: 'Top Document Types', items: topDocTypes.map((t) => ({ label: t.type, value: t.count })) },
        ].map(({ title, items }) => (
          <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="text-sm font-medium text-white mb-4">{title}</div>
            <div className="space-y-2">
              {items.slice(0, 10).map((item, i) => (
                <BarRow key={i} label={item.label} value={item.value} max={items[0]?.value || 1} color={i === 0 ? 'bg-amber-500' : 'bg-indigo-500'} />
              ))}
              {items.length === 0 && <div className="text-xs text-zinc-600">No data</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Signup breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-4">Signups by Role</div>
          <div className="space-y-2">
            {Object.entries(signupsByRole).map(([k, v]) => (
              <BarRow key={k} label={k} value={v} max={Math.max(...Object.values(signupsByRole), 1)} color="bg-amber-500" />
            ))}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-4">Signups by Account Type</div>
          <div className="space-y-2">
            {Object.entries(signupsByAccountType).map(([k, v]) => (
              <BarRow key={k} label={k} value={v} max={Math.max(...Object.values(signupsByAccountType), 1)} color="bg-sky-500" />
            ))}
          </div>
        </div>
      </div>

      {/* Revenue over time */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-4">Daily Revenue</div>
        <div className="overflow-x-auto">
          <div className="flex items-end gap-1 h-20 min-w-max">
            {dailyRevenue.map((d, i) => {
              const maxVal = Math.max(...dailyRevenue.map((x) => x.amountPaise), 1);
              const h = Math.max(2, (d.amountPaise / maxVal) * 72);
              return (
                <div key={i} className="flex flex-col items-center group relative">
                  <div className="absolute bottom-full mb-1 bg-zinc-800 border border-zinc-700 text-xs text-white px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    {d.date}<br />{fmt(d.amountPaise)} · {d.transactions} tx
                  </div>
                  <div className="w-4 bg-emerald-500/60 hover:bg-emerald-500 rounded-sm transition-colors" style={{ height: h }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// DOCUMENTS TAB
// ══════════════════════════════════════════════════════════════════════
function DocumentsTab() {
  const [data, setData] = useState<{ documents: Record<string, unknown>[]; templates: Record<string, unknown>[]; totalDocuments: number; totalTemplates: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'documents' | 'templates'>('documents');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/super-admin/documents?query=${encodeURIComponent(query)}`).then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [query]);

  useEffect(() => { load(); }, [load]);

  async function deleteTemplate(id: string) {
    if (!confirm('Delete this template?')) return;
    const res = await fetch('/api/super-admin/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete_template', templateId: id }) });
    if (res.ok) { setMsg('Deleted'); load(); setTimeout(() => setMsg(''), 2000); } else setMsg('Failed');
  }

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load documents" />;

  return (
    <div className="space-y-5">
      <SectionHeader title="Document Control" sub={`${data.totalDocuments} documents · ${data.totalTemplates} templates`} />

      <div className="flex gap-3 flex-wrap">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 min-w-52" />
        {(['documents', 'templates'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all capitalize ${view === v ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>{v}</button>
        ))}
        {msg && <span className="text-xs text-emerald-400 self-center">{msg}</span>}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                {view === 'documents' ? (
                  <><th className="text-left px-4 py-3">Template</th><th className="text-left px-4 py-3">Generated By</th><th className="text-left px-4 py-3">Org</th><th className="text-left px-4 py-3">Date</th></>
                ) : (
                  <><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Category</th><th className="text-left px-4 py-3">Org</th><th className="text-left px-4 py-3">Usage</th><th className="px-4 py-3" /></>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {view === 'documents' && data.documents.slice(0, 100).map((d, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-300 text-sm">{String(d.templateName || '—')}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{String(d.generatedBy || d.userEmail || '—')}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{String(d.organizationName || '—')}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{ago(String(d.createdAt || ''))}</td>
                </tr>
              ))}
              {view === 'templates' && data.templates.map((t, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-300 font-medium">{String(t.name)}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{String(t.category || '—')}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{String(t.organizationName || 'System')}</td>
                  <td className="px-4 py-3 text-xs"><span className="text-amber-400 font-mono">{String(t.usageCount || 0)}</span></td>
                  <td className="px-4 py-3">
                    {Boolean(t.isCustom) && <button onClick={() => deleteTemplate(String(t.id))} className="text-xs text-red-500 hover:text-red-400 transition-colors">Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIL TAB
// ══════════════════════════════════════════════════════════════════════
function MailTab() {
  const [data, setData] = useState<{ campaigns: Record<string, unknown>[]; recentOutbox: Record<string, unknown>[]; stats: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [broadcast, setBroadcast] = useState({ subject: '', htmlBody: '', audience: 'all' });
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [view, setView] = useState<'overview' | 'outbox'>('overview');
  const [outbox, setOutbox] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    setLoading(true);
    fetch('/api/super-admin/mail').then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  async function loadOutbox() {
    setView('outbox');
    const d = await fetch('/api/super-admin/mail?view=outbox&limit=100').then((r) => r.json()).catch(() => ({ outbox: [] }));
    setOutbox(d.outbox || []);
  }

  async function sendBroadcast() {
    if (!broadcast.subject || !broadcast.htmlBody) { setMsg('Subject and body required'); return; }
    setSending(true);
    const res = await fetch('/api/super-admin/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send_broadcast', data: broadcast }) });
    const d = await res.json();
    setSending(false);
    setMsg(d.sent ? `Sent to ${d.sent} recipients` : d.error || 'Failed');
    setComposing(false);
    setTimeout(() => setMsg(''), 5000);
  }

  if (loading) return <Loader />;

  return (
    <div className="space-y-5">
      <SectionHeader title="Mail Center" sub="Broadcasts, campaigns, and outbox"
        action={<button onClick={() => setComposing(true)} className="bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold px-4 py-2 rounded-lg transition-all">Compose Broadcast</button>}
      />
      {msg && <div className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">{msg}</div>}

      <div className="flex gap-1">
        {(['overview', 'outbox'] as const).map((v) => (
          <button key={v} onClick={() => v === 'outbox' ? loadOutbox() : setView('overview')} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${view === v ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>{v}</button>
        ))}
      </div>

      {view === 'overview' && data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[['Total Sent', data.stats.totalSent, 'text-emerald-400'], ['Failed', data.stats.totalFailed, 'text-red-400'], ['Campaigns', data.stats.totalCampaigns, 'text-amber-400']].map(([k, v, c]) => (
              <div key={k as string} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${c}`}>{v}</div>
                <div className="text-xs text-zinc-500 mt-1">{k}</div>
              </div>
            ))}
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl">
            <div className="px-5 py-4 border-b border-zinc-800 text-sm font-medium text-white">Recent Outbox</div>
            <div className="divide-y divide-zinc-800/50">
              {data.recentOutbox.length === 0 && <div className="px-5 py-8 text-center text-zinc-600 text-sm">No emails sent yet</div>}
              {data.recentOutbox.map((e, i) => (
                <div key={i} className="px-5 py-3 flex items-center gap-3 text-sm">
                  <span className={badge(String(e.status || ''))}>{String(e.status)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-zinc-300 truncate">{String(e.subject || '—')}</div>
                    <div className="text-xs text-zinc-500 truncate">To: {String(e.to || '—')}</div>
                  </div>
                  <div className="text-xs text-zinc-600 flex-shrink-0">{ago(String(e.createdAt || ''))}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {view === 'outbox' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-xs text-zinc-500"><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Subject</th><th className="text-left px-4 py-3">To</th><th className="text-left px-4 py-3">Type</th><th className="text-left px-4 py-3">Date</th></tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {outbox.map((e, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3"><span className={badge(String(e.status || ''))}>{String(e.status)}</span></td>
                  <td className="px-4 py-3 text-zinc-300 max-w-[200px] truncate">{String(e.subject || '—')}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs max-w-[150px] truncate">{String(e.to || '—')}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{String(e.type || '—')}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{ago(String(e.createdAt || ''))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {composing && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setComposing(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-white">Compose Broadcast</h3>
              <button onClick={() => setComposing(false)} className="text-zinc-600 hover:text-zinc-400"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Audience</label>
              <select value={broadcast.audience} onChange={(e) => setBroadcast({ ...broadcast, audience: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500">
                <option value="all">All Active Users</option><option value="business">Business Accounts</option><option value="individual">Individual Accounts</option><option value="admins">Admins Only</option>
              </select></div>
            <div><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Subject</label><input value={broadcast.subject} onChange={(e) => setBroadcast({ ...broadcast, subject: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" /></div>
            <div><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">HTML Body</label><textarea value={broadcast.htmlBody} onChange={(e) => setBroadcast({ ...broadcast, htmlBody: e.target.value })} rows={6} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none font-mono text-xs" placeholder="<p>Your message…</p>" /></div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setComposing(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-300">Cancel</button>
              <button disabled={sending} onClick={sendBroadcast} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-semibold rounded-lg transition-all flex items-center gap-2">
                {sending ? <><div className="w-3 h-3 border-2 border-black border-t-transparent rounded-full animate-spin" />Sending…</> : 'Send Broadcast'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CONTENT TAB
// ══════════════════════════════════════════════════════════════════════
function ContentTab() {
  const [data, setData] = useState<{ landing: Record<string, unknown> | null; theme: Record<string, unknown> | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [view, setView] = useState<'landing' | 'theme'>('landing');
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/super-admin/content').then((r) => r.json()).then((d) => {
      setData(d);
      if (d.landing) setForm(view === 'landing' ? flattenSimple(d.landing) : flattenSimple(d.theme || {}));
    }).catch(console.error).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data) setForm(view === 'landing' ? flattenSimple(data.landing || {}) : flattenSimple(data.theme || {}));
  }, [view, data]);

  function flattenSimple(obj: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
    }
    return out;
  }

  async function save() {
    setSaving(true);
    const action = view === 'landing' ? 'update_landing' : 'update_theme';
    const res = await fetch('/api/super-admin/content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data: form }) });
    setSaving(false);
    if (res.ok) { setMsg('Saved'); setTimeout(() => setMsg(''), 2000); } else setMsg('Failed');
  }

  if (loading) return <Loader />;

  const editableFields = Object.entries(form).filter(([k]) => !['id', 'updatedAt', 'createdAt'].includes(k));

  return (
    <div className="space-y-5">
      <SectionHeader title="Content Management" sub="Landing page and theme settings" />
      {msg && <div className="text-xs text-emerald-400">{msg}</div>}

      <div className="flex gap-1">
        {(['landing', 'theme'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${view === v ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>{v}</button>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="grid gap-4">
          {editableFields.map(([k, v]) => (
            <div key={k}>
              <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">{k.replace(/([A-Z])/g, ' $1').trim()}</label>
              {v.length > 80 ? (
                <textarea value={v} onChange={(e) => setForm({ ...form, [k]: e.target.value })} rows={3} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none" />
              ) : (
                <input value={v} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <button disabled={saving} onClick={save} className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-semibold rounded-lg transition-all">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ══════════════════════════════════════════════════════════════════════
function SettingsTab() {
  const [data, setData] = useState<{ superAdminEmail: string; authSettings: Record<string, unknown> | null; mailSettings: Record<string, unknown> | null; adminUsers: Record<string, unknown>[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [newSaEmail, setNewSaEmail] = useState('');
  const [mailForm, setMailForm] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/super-admin/settings').then((r) => r.json()).then((d) => {
      setData(d);
      if (d.mailSettings) setMailForm(Object.fromEntries(Object.entries(d.mailSettings).map(([k, v]) => [k, String(v ?? '')])));
    }).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  async function doAction(action: string, extra: Record<string, unknown>) {
    setSaving(true);
    const res = await fetch('/api/super-admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data: extra }) });
    setSaving(false);
    if (res.ok) { setMsg('Saved'); load(); setTimeout(() => setMsg(''), 2000); }
    else { const d = await res.json(); setMsg(d.error || 'Failed'); }
  }

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load settings" />;

  return (
    <div className="space-y-6">
      <SectionHeader title="Settings" sub="Super admin account, mail, and auth configuration" />
      {msg && <div className="text-xs text-emerald-400">{msg}</div>}

      {/* Super admin email */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div>
          <div className="text-sm font-medium text-white">Super Admin Email</div>
          <div className="text-xs text-zinc-500 mt-0.5">Current: <span className="text-amber-400 font-mono">{data.superAdminEmail || '(not set)'}</span></div>
        </div>
        <div className="flex gap-3">
          <input value={newSaEmail} onChange={(e) => setNewSaEmail(e.target.value)} placeholder="new@email.com" type="email" className="flex-1 bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
          <button disabled={saving} onClick={() => doAction('update_super_admin_email', { email: newSaEmail })} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-semibold rounded-lg transition-all">Update</button>
        </div>
      </div>

      {/* Mail settings */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="text-sm font-medium text-white">SMTP Mail Settings</div>
        <div className="grid grid-cols-2 gap-3">
          {[['host', 'SMTP Host'], ['port', 'Port'], ['username', 'Username'], ['fromEmail', 'From Email'], ['fromName', 'From Name'], ['replyTo', 'Reply-To']].map(([k, label]) => (
            <div key={k}>
              <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">{label}</label>
              <input value={mailForm[k] || ''} onChange={(e) => setMailForm({ ...mailForm, [k]: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
            </div>
          ))}
        </div>
        <div><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">SMTP Password</label><input type="password" placeholder="••••••••" onChange={(e) => setMailForm({ ...mailForm, password: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" /></div>
        <div className="flex justify-end">
          <button disabled={saving} onClick={() => doAction('update_mail', mailForm)} className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-semibold rounded-lg transition-all">Save Mail Config</button>
        </div>
      </div>

      {/* Auth settings */}
      {data.authSettings && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
          <div className="text-sm font-medium text-white">Auth Settings</div>
          {[['Google Sign-in', 'googleEnabled'], ['Aadhaar Verification', 'aadhaarVerificationEnabled']].map(([label, key]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">{label}</span>
              <Toggle enabled={Boolean(data.authSettings![key])} onChange={(v) => doAction('update_auth', { [key]: v })} />
            </div>
          ))}
        </div>
      )}

      {/* Admin users */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-4">Admin Users</div>
        <div className="space-y-2">
          {data.adminUsers.map((u, i) => (
            <div key={i} className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-3">
              <div>
                <div className="text-sm text-white">{String(u.name)}</div>
                <div className="text-xs text-zinc-500">{String(u.email)}</div>
              </div>
              <div className="text-right">
                <span className={badge(u.isActive ? 'active' : 'disabled')}>{u.isActive ? 'active' : 'disabled'}</span>
                <div className="text-xs text-zinc-600 mt-0.5">last login {ago(String(u.lastLogin || ''))}</div>
              </div>
            </div>
          ))}
          {data.adminUsers.length === 0 && <div className="text-sm text-zinc-600">No admin users found</div>}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// AUDIT TAB
// ══════════════════════════════════════════════════════════════════════
function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState('all');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/super-admin/audit?source=${source}&limit=200`).then((r) => r.json()).then((d) => setEntries(d.entries || [])).catch(console.error).finally(() => setLoading(false));
  }, [source]);

  return (
    <div className="space-y-5">
      <SectionHeader title="Audit Log" sub="All super admin and admin actions" />

      <div className="flex gap-1">
        {(['all', 'super-admin', 'admin'] as const).map((s) => (
          <button key={s} onClick={() => setSource(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${source === s ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>{s}</button>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">Source</th>
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Target</th>
                <th className="text-left px-4 py-3">Actor</th>
                <th className="text-left px-4 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading && <tr><td colSpan={6} className="text-center py-8 text-zinc-600">Loading…</td></tr>}
              {!loading && entries.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-zinc-600">No audit entries</td></tr>}
              {entries.map((e, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{ago(e.timestamp || e.createdAt)}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-1.5 py-0.5 rounded font-medium ${e.source === 'super-admin' ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-700/50 text-zinc-400'}`}>{e.source}</span></td>
                  <td className="px-4 py-3 text-zinc-300 font-mono text-xs">{e.action}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{e.targetType ? `${e.targetType}: ${e.targetId || ''}` : '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500 truncate max-w-[120px]">{e.actorEmail || '—'}</td>
                  <td className="px-4 py-3 text-xs text-zinc-600 font-mono">{e.ip || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Shared utilities ───────────────────────────────────────────────────
function Loader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="space-y-3 text-center">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
        <div className="text-xs text-zinc-600">Loading…</div>
      </div>
    </div>
  );
}

function ErrorState({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-2">
        <div className="text-red-400 text-sm">{msg}</div>
        <button onClick={() => window.location.reload()} className="text-xs text-zinc-500 hover:text-zinc-400">Retry</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// REVENUE TAB
// ══════════════════════════════════════════════════════════════════════
function RevenueTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [revenueView, setRevenueView] = useState<'dashboard' | 'invoices'>('dashboard');

  useEffect(() => {
    fetch('/api/super-admin/revenue').then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load revenue" />;

  const s = data.summary as Record<string, number & string>;
  const monthly = (data.monthlyRevenue as { month: string; paise: number; transactions: number }[]) || [];
  const daily30 = ((data.dailyRevenue as { date: string; paise: number; transactions: number; failed: number }[]) || []).slice(-30);
  const planRev = (data.planRevenue as { id: string; name: string; revenue: number; transactions: number }[]) || [];
  const topUsers = (data.topPayingUsers as { userId: string; email: string; name: string; revenue: number; transactions: number }[]) || [];
  const recentTx = (data.recentTransactions as Record<string, unknown>[]) || [];
  const recentFailed = (data.recentFailed as Record<string, unknown>[]) || [];
  const maxMonthly = Math.max(...monthly.map((m) => m.paise), 1);
  const maxDaily = Math.max(...daily30.map((d) => d.paise), 1);

  return (
    <div className="space-y-6">
      <SectionHeader title="Revenue Dashboard" sub="Real-time financial overview with GST, MRR, ARR"
        action={
          <div className="flex gap-1">
            {(['dashboard', 'invoices'] as const).map((v) => (
              <button key={v} onClick={() => setRevenueView(v)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all capitalize ${revenueView === v ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>{v}</button>
            ))}
          </div>
        }
      />

      {/* Invoices view */}
      {revenueView === 'invoices' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-white">All Invoices / Transactions</div>
                <div className="text-xs text-zinc-500">{recentTx.length} recent · {Number(s.totalPaid || 0)} total successful</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                    <th className="text-left px-4 py-3">Invoice #</th>
                    <th className="text-left px-4 py-3">Customer</th>
                    <th className="text-left px-4 py-3">Product</th>
                    <th className="text-left px-4 py-3">Subtotal</th>
                    <th className="text-left px-4 py-3">GST</th>
                    <th className="text-left px-4 py-3">Total</th>
                    <th className="text-left px-4 py-3">Coupon</th>
                    <th className="text-left px-4 py-3">Provider</th>
                    <th className="text-left px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {recentTx.map((t, i) => (
                    <tr key={i} className="hover:bg-zinc-800/30">
                      <td className="px-4 py-3 text-xs font-mono text-zinc-500">{String(t.id || '').slice(0, 14) || `INV-${String(i + 1).padStart(4, '0')}`}</td>
                      <td className="px-4 py-3">
                        <div className="text-zinc-300 text-xs font-medium truncate max-w-[130px]">{String(t.userEmail || '—')}</div>
                        {t.organizationName != null && <div className="text-zinc-600 text-xs truncate max-w-[130px]">{String(t.organizationName)}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">{String(t.planName || t.productLabel || t.planId || '—')}</td>
                      <td className="px-4 py-3 text-xs text-zinc-300">{fmt(Number(t.amountInPaise || 0) - Number(t.gstAmountInPaise || 0))}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{fmt(Number(t.gstAmountInPaise || 0))}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-emerald-400">{fmt(Number(t.amountInPaise || 0))}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500">{String(t.couponCode || '—')}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500 capitalize">{String(t.provider || 'razorpay')}</td>
                      <td className="px-4 py-3 text-xs text-zinc-500 whitespace-nowrap">{t.createdAt ? new Date(String(t.createdAt)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                    </tr>
                  ))}
                  {recentTx.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-zinc-600">No transactions yet</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {revenueView === 'dashboard' && (<>
      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: fmt(Number(s.totalRevenuePaise || 0)), sub: 'all time', accent: true },
          { label: 'MRR', value: fmt(Number(s.mrrPaise || 0)), sub: `ARR ${fmt(Number(s.arrPaise || 0))}` },
          { label: 'This Month', value: fmt(Number(s.thisMonthRevenue || 0)), sub: s.monthGrowth != null ? `${Number(s.monthGrowth) >= 0 ? '+' : ''}${s.monthGrowth}% vs last month` : 'vs last month' },
          { label: 'Net Revenue', value: fmt(Number(s.netRevenuePaise || 0)), sub: `GST collected: ${fmt(Number(s.totalGstPaise || 0))}` },
        ].map(({ label, value, sub, accent }) => (
          <div key={label} className={`rounded-xl border p-5 ${accent ? 'bg-amber-500/10 border-amber-500/20' : 'bg-zinc-900 border-zinc-800'}`}>
            <div className={`text-2xl font-bold mb-1 ${accent ? 'text-amber-400' : 'text-white'}`}>{value}</div>
            <div className="text-xs text-zinc-500">{label}</div>
            {sub && <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Transactions', value: String(s.totalPaid || 0), sub: `${s.successRate}% success rate` },
          { label: 'Failed', value: String(s.totalFailed || 0), sub: 'failed payments', danger: true },
          { label: 'Avg. Transaction', value: fmt(Number(s.avgTransactionPaise || 0)), sub: 'per successful payment' },
          { label: 'Active Subs', value: String(s.activeSubscriptions || 0), sub: 'subscribers now' },
        ].map(({ label, value, sub, danger }) => (
          <div key={label} className={`rounded-xl border p-4 bg-zinc-900 ${danger && Number(value) > 0 ? 'border-red-500/20' : 'border-zinc-800'}`}>
            <div className={`text-xl font-bold ${danger && Number(value) > 0 ? 'text-red-400' : 'text-white'}`}>{value}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
            <div className="text-xs text-zinc-600">{sub}</div>
          </div>
        ))}
      </div>

      {/* Monthly revenue chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-4">Monthly Revenue (12 months)</div>
        <div className="flex items-end gap-2 h-32">
          {monthly.map((m, i) => {
            const h = Math.max(4, (m.paise / maxMonthly) * 120);
            const isThisMonth = m.month === new Date().toISOString().slice(0, 7);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div className="absolute bottom-full mb-1 bg-zinc-800 border border-zinc-700 text-xs text-white px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 z-10 pointer-events-none">
                  {m.month}<br />{fmt(m.paise)} · {m.transactions} tx
                </div>
                <div className={`w-full rounded-t-sm transition-colors ${isThisMonth ? 'bg-amber-500' : 'bg-indigo-500/60 hover:bg-indigo-500'}`} style={{ height: h }} />
                <div className="text-[9px] text-zinc-600">{m.month.slice(5)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily revenue last 30 days */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-1">Daily Revenue (last 30 days)</div>
        <div className="text-xs text-zinc-500 mb-4">Hover over bars for details</div>
        <div className="flex items-end gap-1 h-20">
          {daily30.map((d, i) => {
            const h = Math.max(2, (d.paise / maxDaily) * 72);
            return (
              <div key={i} className="flex-1 flex flex-col items-center group relative">
                <div className="absolute bottom-full mb-1 bg-zinc-800 border border-zinc-700 text-xs text-white px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 z-10 pointer-events-none">
                  {d.date}<br />{fmt(d.paise)} · {d.failed > 0 && <span className="text-red-400">{d.failed} failed</span>}
                </div>
                <div className={`w-full rounded-sm ${d.paise > 0 ? 'bg-emerald-500/70 hover:bg-emerald-500' : 'bg-zinc-800'}`} style={{ height: Math.max(2, h) }} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue by plan */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-4">Revenue by Plan</div>
          <div className="space-y-3">
            {planRev.map((p, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300 truncate max-w-[150px]">{p.name || p.id}</span>
                  <span className="text-amber-400 font-semibold">{fmt(p.revenue)}</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500/70 rounded-full" style={{ width: `${planRev[0]?.revenue > 0 ? (p.revenue / planRev[0].revenue) * 100 : 0}%` }} />
                </div>
                <div className="text-xs text-zinc-600">{p.transactions} transactions</div>
              </div>
            ))}
            {planRev.length === 0 && <div className="text-sm text-zinc-600">No transactions yet</div>}
          </div>
        </div>

        {/* Top paying users */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-4">Top Paying Users</div>
          <div className="space-y-2">
            {topUsers.slice(0, 8).map((u, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500 flex-shrink-0">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-300 truncate">{u.name || u.email}</div>
                  <div className="text-xs text-zinc-600 truncate">{u.email}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-amber-400">{fmt(u.revenue)}</div>
                  <div className="text-xs text-zinc-600">{u.transactions} tx</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="text-sm font-medium text-white">Recent Transactions</div>
          {Number(s.totalFailed) > 0 && <span className="text-xs text-red-400">{s.totalFailed} failed</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-xs text-zinc-500"><th className="text-left px-4 py-3">User</th><th className="text-left px-4 py-3">Plan</th><th className="text-left px-4 py-3">Amount</th><th className="text-left px-4 py-3">GST</th><th className="text-left px-4 py-3">Coupon</th><th className="text-left px-4 py-3">Date</th></tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {recentTx.map((t, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3"><div className="text-zinc-300 text-xs font-medium truncate max-w-[130px]">{String(t.userEmail || '—')}</div><div className="text-zinc-600 text-xs">{String(t.organizationName || '')}</div></td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{String(t.planName || t.productLabel || t.planId || '—')}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-emerald-400">{fmt(Number(t.amountInPaise || 0))}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{fmt(Number(t.gstAmountInPaise || 0))}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{String(t.couponCode || '—')}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{ago(String(t.createdAt || ''))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {recentFailed.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
          <div className="text-sm font-medium text-red-400 mb-3">Failed Payments</div>
          <div className="space-y-2">
            {recentFailed.map((t, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="text-zinc-400 truncate">{String(t.userEmail || '—')}</span>
                <span className="text-zinc-600">{String(t.planId || '—')}</span>
                <span className="text-red-400 ml-auto">{fmt(Number(t.amountInPaise || 0))}</span>
                <span className="text-zinc-600">{ago(String(t.createdAt || ''))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// GIGS TAB
// ══════════════════════════════════════════════════════════════════════
function GigsTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/super-admin/gigs?query=${encodeURIComponent(query)}&status=${statusFilter}`)
      .then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [query, statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function gigAction(action: string, gigId: string) {
    if (action === 'delete' && !confirm('Delete this gig?')) return;
    const res = await fetch('/api/super-admin/gigs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, gigId }) });
    if (res.ok) { setMsg('Done'); load(); setTimeout(() => setMsg(''), 2000); }
  }

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load gigs" />;

  const gigs = (data.gigs as Record<string, unknown>[]) || [];
  const catDist = data.categoryDistribution as Record<string, number> || {};
  const statusDist = data.statusDistribution as Record<string, number> || {};
  const recentConnections = (data.recentConnections as Record<string, unknown>[]) || [];
  const recentBids = (data.recentBids as Record<string, unknown>[]) || [];

  return (
    <div className="space-y-5">
      <SectionHeader title="Gig Marketplace Control" sub={`${data.totalGigs as number} gigs · ${data.totalConnections as number} connections · ${data.totalBids as number} bids`} />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Total Gigs', data.totalGigs, 'text-white'], ['Connections', data.totalConnections, 'text-sky-400'], ['Bids', data.totalBids, 'text-amber-400'], ['Published', statusDist['published'] || 0, 'text-emerald-400']].map(([k, v, c]) => (
          <div key={k as string} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${c}`}>{String(v)}</div>
            <div className="text-xs text-zinc-500 mt-1">{k as string}</div>
          </div>
        ))}
      </div>

      {/* Category + Status dist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-3">By Category</div>
          <div className="space-y-1.5">
            {Object.entries(catDist).sort(([, a], [, b]) => b - a).slice(0, 8).map(([cat, count]) => (
              <BarRow key={cat} label={cat} value={count} max={Math.max(...Object.values(catDist), 1)} color="bg-indigo-500" />
            ))}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-3">By Status</div>
          <div className="space-y-1.5">
            {Object.entries(statusDist).map(([st, count]) => (
              <BarRow key={st} label={st} value={count} max={Math.max(...Object.values(statusDist), 1)} color={st === 'published' ? 'bg-emerald-500' : st === 'draft' ? 'bg-zinc-600' : 'bg-red-500'} />
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, owner, category…" className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 min-w-60" />
        {(['all', 'published', 'draft', 'closed'] as const).map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all capitalize ${statusFilter === s ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>{s}</button>
        ))}
        {msg && <span className="text-xs text-emerald-400 self-center">{msg}</span>}
      </div>

      {/* Gig table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-xs text-zinc-500"><th className="text-left px-4 py-3">Title</th><th className="text-left px-4 py-3">Owner</th><th className="text-left px-4 py-3">Category</th><th className="text-left px-4 py-3">Budget</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Connects</th><th className="text-left px-4 py-3">Bids</th><th className="text-left px-4 py-3">Created</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading && <tr><td colSpan={9} className="text-center py-8 text-zinc-600">Loading…</td></tr>}
              {gigs.slice(0, 100).map((g, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-300 font-medium max-w-[180px] truncate">{String(g.title)}</td>
                  <td className="px-4 py-3"><div className="text-xs text-zinc-400 truncate max-w-[100px]">{String(g.ownerName)}</div><div className="text-xs text-zinc-600 truncate max-w-[100px]">{String(g.ownerEmail)}</div></td>
                  <td className="px-4 py-3"><span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">{String(g.category)}</span></td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{String(g.budgetLabel || '—')}</td>
                  <td className="px-4 py-3"><span className={badge(String(g.status))}>{String(g.status)}</span></td>
                  <td className="px-4 py-3 text-xs text-sky-400 font-mono">{String(g.connectionCount || 0)}</td>
                  <td className="px-4 py-3 text-xs text-amber-400 font-mono">{String(g.bidCount || 0)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{ago(String(g.createdAt || ''))}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {String(g.status) === 'published' && <button onClick={() => gigAction('unpublish', String(g.id))} className="text-xs text-amber-500 hover:text-amber-400">Close</button>}
                      {String(g.status) !== 'published' && <button onClick={() => gigAction('feature', String(g.id))} className="text-xs text-sky-500 hover:text-sky-400">Feature</button>}
                      <button onClick={() => gigAction('delete', String(g.id))} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-3">Recent Connections</div>
          <div className="space-y-2">
            {recentConnections.slice(0, 8).map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={badge(String(c.status))}>{String(c.status)}</span>
                <span className="text-zinc-300 truncate">{String(c.requesterName)} → {String(c.gigTitle)}</span>
                <span className="text-zinc-600 ml-auto flex-shrink-0">{ago(String(c.createdAt))}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-3">Recent Bids</div>
          <div className="space-y-2">
            {recentBids.slice(0, 8).map((b, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={badge(String(b.status))}>{String(b.status)}</span>
                <span className="text-zinc-300 truncate">{String(b.bidderName)}</span>
                <span className="text-amber-400 font-semibold ml-auto flex-shrink-0">₹{String(b.amountInRupees || 0)}</span>
                <span className="text-zinc-600">{ago(String(b.createdAt))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// PEOPLE TAB
// ══════════════════════════════════════════════════════════════════════
function PeopleTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'profiles' | 'resumes'>('profiles');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/super-admin/people?query=${encodeURIComponent(query)}&view=${view}`)
      .then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [query, view]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load people" />;

  const people = (data.people as Record<string, unknown>[]) || [];
  const resumes = (data.resumes as Record<string, unknown>[]) || [];
  const stats = data.stats as Record<string, number> || {};
  const locations = (data.locationDistribution as { location: string; count: number }[]) || [];
  const skills = (data.topSkills as { skill: string; count: number }[]) || [];

  return (
    <div className="space-y-5">
      <SectionHeader title="People & Profiles" sub="All users, profiles, and resume directory" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Total People', stats.total, 'text-white'], ['Open to Work', stats.openToWork, 'text-emerald-400'], ['Profile Set Up', stats.profilesSetup, 'text-amber-400'], ['docrud Go', stats.docrudGo, 'text-sky-400']].map(([k, v, c]) => (
          <div key={k as string} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${c}`}>{String(v || 0)}</div>
            <div className="text-xs text-zinc-500 mt-1">{k as string}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-3">Top Locations</div>
          <div className="space-y-1.5">
            {locations.slice(0, 10).map((l, i) => <BarRow key={i} label={l.location} value={l.count} max={locations[0]?.count || 1} color="bg-sky-500" />)}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-3">Top Skills</div>
          <div className="space-y-1.5">
            {skills.slice(0, 10).map((s, i) => <BarRow key={i} label={s.skill} value={s.count} max={skills[0]?.count || 1} color="bg-amber-500" />)}
          </div>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, org…" className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 min-w-60" />
        {(['profiles', 'resumes'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all capitalize ${view === v ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500'}`}>{v}</button>
        ))}
      </div>

      {view === 'profiles' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-xs text-zinc-500"><th className="text-left px-4 py-3">Person</th><th className="text-left px-4 py-3">Headline</th><th className="text-left px-4 py-3">Location</th><th className="text-left px-4 py-3">Skills</th><th className="text-left px-4 py-3">Flags</th><th className="text-left px-4 py-3">Joined</th></tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {people.slice(0, 100).map((p, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3"><div className="text-zinc-300 font-medium text-sm truncate max-w-[120px]">{String(p.name)}</div><div className="text-xs text-zinc-500 truncate max-w-[120px]">{String(p.email)}</div></td>
                  <td className="px-4 py-3 text-xs text-zinc-400 max-w-[160px] truncate">{String(p.headline || '—')}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{String(p.location || '—')}</td>
                  <td className="px-4 py-3"><div className="flex gap-1 flex-wrap max-w-[150px]">{((p.skills as string[]) || []).slice(0, 3).map((s, j) => <span key={j} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{s}</span>)}</div></td>
                  <td className="px-4 py-3"><div className="flex gap-1">{Boolean(p.openToWork) && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">Hiring</span>}{Boolean(p.docrudGo) && <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">Go</span>}</div></td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{ago(String(p.createdAt || ''))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'resumes' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-xs text-zinc-500"><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Category</th><th className="text-left px-4 py-3">Location</th><th className="text-left px-4 py-3">Views</th><th className="text-left px-4 py-3">Contacts</th><th className="text-left px-4 py-3">Published</th></tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {resumes.slice(0, 100).map((r, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-300 font-medium">{String(r.displayName)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{String(r.category || '—')}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{String(r.location || '—')}</td>
                  <td className="px-4 py-3 text-xs text-sky-400 font-mono">{String(r.viewCount || 0)}</td>
                  <td className="px-4 py-3 text-xs text-amber-400 font-mono">{String(r.contactCount || 0)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{ago(String(r.createdAt || ''))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════════
// SEARCH INTELLIGENCE TAB — deep analytics for every search bar
// ══════════════════════════════════════════════════════════════════════

interface SearchData {
  period: { days: number; since: string };
  overview: {
    totalSearches: number; uniqueQueries: number; uniqueSearchers: number;
    avgPerDay: number; searchSuccessRate: number | null; zeroResultsRate: number | null;
    avgQueryLength: number; avgSearchesPerSession: string; multiSearchSessions: number;
    eventsWithResultCount: number;
  };
  topQueries: Array<{
    query: string; count: number; uniqueUsers: number; uniqueSessions: number;
    lastAt: string; avgResults: number | null; zeroResultsRate: number | null;
    contexts: Record<string, number>; topContext: string | null;
  }>;
  trending: Array<{ query: string; thisWeek: number; lastWeek: number; growth: number }>;
  topZeroResults: Array<{ query: string; count: number; uniqueUsers: number; lastAt: string }>;
  byContext: Array<{
    context: string; label: string; count: number; uniqueQueries: number;
    uniqueUsers: number; zeroResultsRate: number | null;
  }>;
  bySurface: Record<string, number>;
  byRole: Record<string, number>;
  byHour: number[];
  dailySearches: Array<{ date: string; count: number; uniqueQueries: number; uniqueUsers: number; zeroResults: number }>;
  lengthDistribution: Record<string, number>;
  topSearchers: Array<{
    userId: string; count: number; uniqueQueries: number;
    contexts: string[]; lastAt: string;
    userName: string | null; userEmail: string | null; userRole: string | null;
  }>;
}

function HourHeatmap({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const HOURS = ['12a','1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a','12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p'];
  return (
    <div className="flex gap-0.5 items-end h-10">
      {data.map((v, i) => {
        const pct = v / max;
        const bg = pct > 0.75 ? 'bg-amber-500' : pct > 0.4 ? 'bg-amber-500/60' : pct > 0.15 ? 'bg-amber-500/30' : pct > 0 ? 'bg-amber-500/15' : 'bg-zinc-800';
        return (
          <div key={i} title={`${HOURS[i]}: ${v} searches`} className={`flex-1 rounded-sm ${bg} min-h-[3px] transition-all`} style={{ height: `${Math.max(4, pct * 40)}px` }} />
        );
      })}
    </div>
  );
}

function SearchIntelTab() {
  const [data, setData]       = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays]       = useState(30);
  const [activeView, setActiveView] = useState<'overview' | 'queries' | 'zero' | 'context' | 'users'>('overview');

  const load = useCallback((d = days, silent = false) => {
    if (!silent) setLoading(true);
    fetch(`/api/super-admin/search?days=${d}`)
      .then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const o = data?.overview;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Search Intelligence"
        sub="Every search bar on the platform — real-time, accurate, enriched"
        action={
          <div className="flex items-center gap-2">
            {[7, 14, 30, 60, 90].map((d) => (
              <button key={d} onClick={() => { setDays(d); load(d); }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${days === d ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>
                {d}d
              </button>
            ))}
            <button onClick={() => load(days, true)} className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1 transition-all">↻</button>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-3">
        {[
          { label: 'Total Searches', value: o?.totalSearches ?? '…', color: 'text-amber-400' },
          { label: 'Unique Queries', value: o?.uniqueQueries ?? '…', color: 'text-sky-400' },
          { label: 'Unique Searchers', value: o?.uniqueSearchers ?? '…', color: 'text-indigo-400' },
          { label: 'Avg / Day', value: o?.avgPerDay ?? '…', color: 'text-zinc-300' },
          { label: 'Avg Query Length', value: o?.avgQueryLength ? `${o.avgQueryLength} chars` : '…', color: 'text-zinc-400' },
          { label: 'Success Rate', value: o?.searchSuccessRate != null ? `${o.searchSuccessRate}%` : '—', color: (o?.searchSuccessRate ?? 0) >= 70 ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'Zero-Result Rate', value: o?.zeroResultsRate != null ? `${o.zeroResultsRate}%` : '—', color: (o?.zeroResultsRate ?? 0) <= 20 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Searches / Session', value: o?.avgSearchesPerSession ?? '…', color: 'text-purple-400' },
          { label: 'Refinement Sessions', value: o?.multiSearchSessions ?? '…', color: 'text-cyan-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center">
            <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
            <div className="text-[10px] text-zinc-600 mt-0.5 leading-tight">{label}</div>
          </div>
        ))}
      </div>

      {/* Sub-tab nav */}
      <div className="flex gap-1 flex-wrap">
        {([
          ['overview', '📊 Overview'],
          ['queries', '🔍 Top Queries'],
          ['zero', '🚫 Zero Results'],
          ['context', '📍 By Search Bar'],
          ['users', '👤 Top Searchers'],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setActiveView(id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${activeView === id ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <Loader /> : !data ? <ErrorState msg="Failed to load search data" /> : (
        <>
          {/* ── OVERVIEW ─────────────────────────────────────────── */}
          {activeView === 'overview' && (
            <div className="space-y-4">
              {/* Daily volume chart */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-white">Daily Search Volume</div>
                    <div className="text-xs text-zinc-500">{data.overview.totalSearches} total in {days} days</div>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] flex-wrap">
                    {[['Total', '#f59e0b'], ['Unique Users', '#38bdf8'], ['Zero Results', '#f87171']].map(([l, c]) => (
                      <div key={String(l)} className="flex items-center gap-1">
                        <div className="w-3 h-0.5 rounded" style={{ background: String(c) }} />
                        <span className="text-zinc-500">{l}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Stacked bar chart */}
                <div className="flex items-end gap-0.5 h-20">
                  {data.dailySearches.map((d) => {
                    const maxVal = Math.max(...data.dailySearches.map(x => x.count), 1);
                    const h = Math.max(2, (d.count / maxVal) * 80);
                    const zh = d.count > 0 ? (d.zeroResults / d.count) * h : 0;
                    return (
                      <div key={d.date} title={`${d.date}: ${d.count} searches, ${d.uniqueUsers} users, ${d.zeroResults} zero-result`}
                        className="flex-1 flex flex-col-reverse group cursor-default" style={{ height: `${h}px` }}>
                        <div className="w-full bg-amber-500/70 group-hover:bg-amber-400 transition-colors" style={{ height: `${h - zh}px` }} />
                        {zh > 0 && <div className="w-full bg-red-500/60" style={{ height: `${zh}px` }} />}
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[9px] text-zinc-700 mt-1">
                  <span>{data.dailySearches[0]?.date?.slice(5)}</span>
                  <span className="text-zinc-600">amber=successful · red=zero-result</span>
                  <span>{data.dailySearches[data.dailySearches.length - 1]?.date?.slice(5)}</span>
                </div>
              </div>

              {/* Hour heatmap + length dist */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="text-sm font-semibold text-white mb-1">Peak Search Hours</div>
                  <div className="text-xs text-zinc-500 mb-4">When users search most actively (0–23h)</div>
                  <HourHeatmap data={data.byHour} />
                  <div className="flex justify-between text-[9px] text-zinc-700 mt-1.5">
                    <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="text-sm font-semibold text-white mb-4">Query Length Distribution</div>
                  <div className="space-y-2">
                    {Object.entries(data.lengthDistribution).map(([bucket, count]) => {
                      const total = Object.values(data.lengthDistribution).reduce((s, v) => s + v, 0);
                      return (
                        <div key={bucket} className="flex items-center gap-3 text-xs">
                          <span className="text-zinc-500 w-12 font-mono">{bucket} ch</span>
                          <div className="flex-1 bg-zinc-800 rounded-full h-2">
                            <div className="h-full bg-amber-500/70 rounded-full" style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }} />
                          </div>
                          <span className="text-zinc-300 font-mono w-8 text-right">{count}</span>
                          <span className="text-zinc-600 w-8 text-right">{total > 0 ? Math.round((count / total) * 100) : 0}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Surface + role breakdown */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { title: 'By Surface', data: data.bySurface },
                  { title: 'By User Role', data: data.byRole },
                ].map(({ title, data: bd }) => (
                  <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                    <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">{title}</div>
                    <div className="space-y-2">
                      {Object.entries(bd).sort(([, a], [, b]) => b - a).map(([k, v]) => {
                        const total = Object.values(bd).reduce((s, x) => s + x, 0);
                        return (
                          <div key={k} className="flex items-center gap-2 text-xs">
                            <span className="text-zinc-400 flex-1 capitalize">{k}</span>
                            <div className="w-20 bg-zinc-800 rounded-full h-1.5">
                              <div className="h-full bg-amber-500/70 rounded-full" style={{ width: `${total > 0 ? (v / total) * 100 : 0}%` }} />
                            </div>
                            <span className="text-zinc-300 font-mono w-8 text-right">{v}</span>
                          </div>
                        );
                      })}
                      {Object.keys(bd).length === 0 && <div className="text-xs text-zinc-700 text-center py-2">No data yet</div>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Trending queries */}
              {data.trending.length > 0 && (
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="text-sm font-semibold text-white mb-1">Trending Queries</div>
                  <div className="text-xs text-zinc-500 mb-4">Highest growth this week vs last week</div>
                  <div className="space-y-2">
                    {data.trending.slice(0, 10).map((t) => (
                      <div key={t.query} className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-4 py-2.5 text-xs">
                        <span className="flex-1 text-zinc-300 font-medium">{t.query}</span>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-zinc-500">{t.thisWeek} this week</span>
                          <span className="text-zinc-700">vs {t.lastWeek} last week</span>
                          <span className={`font-semibold font-mono ${t.growth > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.growth > 0 ? '↑' : '↓'} {Math.abs(t.growth)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── TOP QUERIES ─────────────────────────────────────── */}
          {activeView === 'queries' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-800 text-xs text-zinc-500 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-3 uppercase tracking-wider">
                <span>Query</span><span>Count</span><span>Users</span><span>Sessions</span><span>Avg Results</span><span>Zero%</span><span>Top Bar</span>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {data.topQueries.slice(0, 60).map((q, i) => (
                  <div key={q.query} className="px-5 py-2.5 grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-3 items-center hover:bg-zinc-800/40 transition-colors text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-zinc-700 font-mono w-5 flex-shrink-0">{i + 1}</span>
                      <span className="text-zinc-200 font-medium truncate">{q.query}</span>
                    </div>
                    <span className="text-amber-400 font-mono">{q.count}</span>
                    <span className="text-sky-400 font-mono">{q.uniqueUsers}</span>
                    <span className="text-indigo-400 font-mono">{q.uniqueSessions}</span>
                    <span className="text-emerald-400 font-mono">{q.avgResults != null ? q.avgResults : '—'}</span>
                    <span className={`font-mono ${q.zeroResultsRate != null ? (q.zeroResultsRate > 50 ? 'text-red-400' : q.zeroResultsRate > 20 ? 'text-amber-400' : 'text-emerald-400') : 'text-zinc-600'}`}>
                      {q.zeroResultsRate != null ? `${q.zeroResultsRate}%` : '—'}
                    </span>
                    <span className="text-zinc-500 truncate capitalize">{q.topContext?.replace(/_/g, ' ') || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── ZERO RESULTS ────────────────────────────────────── */}
          {activeView === 'zero' && (
            <div className="space-y-4">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-400 flex items-start gap-2">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div>
                  <strong>Content Gap Intelligence</strong> — These queries returned zero results. Each one is a potential content gap or missing feature. High-frequency zero-result queries represent the highest-value improvement opportunities.
                  {data.overview.eventsWithResultCount < 10 && (
                    <div className="mt-1 text-amber-500/70">Note: result count tracking just started. More data will appear as users search across the newly-instrumented search bars.</div>
                  )}
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-800 text-xs text-zinc-500 grid grid-cols-[3fr_1fr_1fr_1fr] gap-3 uppercase tracking-wider">
                  <span>Query (returned 0 results)</span><span>Count</span><span>Unique Users</span><span>Last Seen</span>
                </div>
                {data.topZeroResults.length === 0 ? (
                  <div className="py-12 text-center text-zinc-600 text-sm">
                    No zero-result queries recorded yet.<br/>
                    <span className="text-xs text-zinc-700">Result count tracking is now active across all search bars.</span>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800/50">
                    {data.topZeroResults.map((z, i) => (
                      <div key={z.query} className="px-5 py-2.5 grid grid-cols-[3fr_1fr_1fr_1fr] gap-3 items-center hover:bg-zinc-800/40 transition-colors text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-zinc-700 font-mono w-5 flex-shrink-0">{i + 1}</span>
                          <span className="text-red-300 font-medium truncate">{z.query}</span>
                        </div>
                        <span className="text-red-400 font-mono font-bold">{z.count}</span>
                        <span className="text-zinc-400 font-mono">{z.uniqueUsers}</span>
                        <span className="text-zinc-500">{ago(z.lastAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── BY CONTEXT (search bar) ─────────────────────────── */}
          {activeView === 'context' && (
            <div className="space-y-3">
              <div className="text-xs text-zinc-500 mb-2">Which search bars are actually being used and how effective they are</div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-800 text-xs text-zinc-500 grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 uppercase tracking-wider">
                  <span>Search Bar</span><span>Searches</span><span>Unique Queries</span><span>Unique Users</span><span>Zero-Result%</span>
                </div>
                {data.byContext.length === 0 ? (
                  <div className="py-12 text-center text-zinc-600 text-sm">No context data yet — search tracking is now active and will populate as users search.</div>
                ) : (
                  <div className="divide-y divide-zinc-800/50">
                    {data.byContext.map((c, i) => {
                      const maxCount = data.byContext[0]?.count || 1;
                      return (
                        <div key={c.context} className="px-5 py-3 hover:bg-zinc-800/40 transition-colors text-xs">
                          <div className="flex items-center gap-4">
                            <span className="text-zinc-700 w-5 flex-shrink-0 font-mono">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-zinc-200 font-medium">{c.label}</div>
                              <div className="text-zinc-600 text-[10px] font-mono mt-0.5">{c.context}</div>
                              <div className="w-full bg-zinc-800 rounded-full h-1 mt-1.5">
                                <div className="h-full bg-amber-500/70 rounded-full" style={{ width: `${(c.count / maxCount) * 100}%` }} />
                              </div>
                            </div>
                            <div className="flex items-center gap-6 flex-shrink-0 text-right">
                              <div><div className="text-amber-400 font-mono">{c.count}</div><div className="text-zinc-700 text-[9px]">searches</div></div>
                              <div><div className="text-sky-400 font-mono">{c.uniqueQueries}</div><div className="text-zinc-700 text-[9px]">queries</div></div>
                              <div><div className="text-indigo-400 font-mono">{c.uniqueUsers}</div><div className="text-zinc-700 text-[9px]">users</div></div>
                              <div>
                                <div className={`font-mono ${c.zeroResultsRate != null ? (c.zeroResultsRate > 40 ? 'text-red-400' : c.zeroResultsRate > 20 ? 'text-amber-400' : 'text-emerald-400') : 'text-zinc-600'}`}>
                                  {c.zeroResultsRate != null ? `${c.zeroResultsRate}%` : '—'}
                                </div>
                                <div className="text-zinc-700 text-[9px]">zero result</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── TOP SEARCHERS ────────────────────────────────────── */}
          {activeView === 'users' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-zinc-800 text-xs text-zinc-500 grid grid-cols-[2fr_1fr_1fr_2fr_1fr] gap-3 uppercase tracking-wider">
                <span>User</span><span>Searches</span><span>Unique Queries</span><span>Search Bars Used</span><span>Last Searched</span>
              </div>
              {data.topSearchers.length === 0 ? (
                <div className="py-12 text-center text-zinc-600 text-sm">No authenticated searches yet.</div>
              ) : (
                <div className="divide-y divide-zinc-800/50">
                  {data.topSearchers.map((u, i) => (
                    <div key={u.userId} className="px-5 py-3 grid grid-cols-[2fr_1fr_1fr_2fr_1fr] gap-3 items-center hover:bg-zinc-800/40 transition-colors text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-zinc-700 font-mono w-5 flex-shrink-0">{i + 1}</span>
                        <div className="min-w-0">
                          <div className="text-zinc-200 font-medium truncate">{u.userName || 'Anonymous'}</div>
                          <div className="text-zinc-600 truncate">{u.userEmail || u.userId.slice(0, 14) + '…'}</div>
                        </div>
                      </div>
                      <span className="text-amber-400 font-mono font-bold">{u.count}</span>
                      <span className="text-sky-400 font-mono">{u.uniqueQueries}</span>
                      <div className="flex flex-wrap gap-1">
                        {u.contexts.slice(0, 3).map((ctx) => (
                          <span key={ctx} className="text-[9px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded capitalize">{ctx.replace(/_/g, ' ')}</span>
                        ))}
                        {u.contexts.length > 3 && <span className="text-[9px] text-zinc-600">+{u.contexts.length - 3}</span>}
                      </div>
                      <span className="text-zinc-500">{ago(u.lastAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════
// SECURITY TAB
// ══════════════════════════════════════════════════════════════════════
function SecurityTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/super-admin/security').then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  async function ipAction(action: string, ip: string) {
    const res = await fetch('/api/super-admin/security', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ip }) });
    if (res.ok) { setMsg(`IP ${action === 'block' ? 'blocked' : 'unblocked'}`); load(); setTimeout(() => setMsg(''), 2000); }
  }

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load security data" />;

  const stats = data.stats as Record<string, number> || {};
  const suspicious = (data.suspicious as Record<string, unknown>[]) || [];
  const topIps = (data.topIps as { ip: string; count: number; blocked: boolean }[]) || [];
  const blocked = (data.blocklist as { ips: string[]; count: number }) || { ips: [], count: 0 };
  const botCandidates = (data.botCandidates as { ip: string; events: number }[]) || [];

  return (
    <div className="space-y-5">
      <SectionHeader title="Security Center" sub="IP monitoring, bot detection, and access control" />
      {msg && <div className="text-xs text-emerald-400">{msg}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Unique IPs (24h)', stats.uniqueIps24h, 'text-white'], ['Events (24h)', stats.totalEvents24h, 'text-sky-400'], ['Suspicious IPs', stats.suspiciousCount, stats.suspiciousCount > 0 ? 'text-amber-400' : 'text-zinc-400'], ['Blocked IPs', stats.blockedCount, stats.blockedCount > 0 ? 'text-red-400' : 'text-zinc-400']].map(([k, v, c]) => (
          <div key={k as string} className={`bg-zinc-900 border ${Number(v) > 0 && (k as string).includes('Suspicious') ? 'border-amber-500/20' : Number(v) > 0 && (k as string).includes('Blocked') ? 'border-red-500/20' : 'border-zinc-800'} rounded-xl p-4 text-center`}>
            <div className={`text-2xl font-bold ${c}`}>{String(v || 0)}</div>
            <div className="text-xs text-zinc-500 mt-1">{k as string}</div>
          </div>
        ))}
      </div>

      {/* Suspicious IPs */}
      {suspicious.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
          <div className="text-sm font-medium text-amber-400 mb-4">⚠ Suspicious IPs (80+ events in 24h)</div>
          <div className="space-y-3">
            {suspicious.map((s, i) => (
              <div key={i} className="bg-zinc-900 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-white">{String(s.ip)}</span>
                    {Boolean(s.isBlocked) && <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">Blocked</span>}
                  </div>
                  <div className="flex gap-2">
                    {!s.isBlocked ? (
                      <button onClick={() => ipAction('block', String(s.ip))} className="text-xs bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 px-3 py-1 rounded-lg transition-all">Block IP</button>
                    ) : (
                      <button onClick={() => ipAction('unblock', String(s.ip))} className="text-xs bg-zinc-700/50 border border-zinc-600/20 text-zinc-400 hover:bg-zinc-700 px-3 py-1 rounded-lg transition-all">Unblock</button>
                    )}
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-zinc-500">
                  <span>{Number(s.events24h)} events</span>
                  <span>{Number(s.uniqueUsers)} users</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {((s.topPaths as { path: string; count: number }[]) || []).map((p, j) => (
                    <span key={j} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">{p.path} ({p.count})</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blocked IPs */}
      {blocked.ips.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
          <div className="text-sm font-medium text-red-400 mb-3">Blocked IPs ({blocked.count})</div>
          <div className="flex flex-wrap gap-2">
            {blocked.ips.map((ip, i) => (
              <div key={i} className="flex items-center gap-2 bg-zinc-900 rounded-lg px-3 py-1.5">
                <span className="font-mono text-xs text-zinc-300">{ip}</span>
                <button onClick={() => ipAction('unblock', ip)} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bot candidates */}
      {botCandidates.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-3">Possible Bots (no auth, high volume)</div>
          <div className="space-y-2">
            {botCandidates.map((b, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="font-mono text-xs text-zinc-400">{b.ip}</span>
                <span className="text-xs text-zinc-600">{b.events} events</span>
                <button onClick={() => ipAction('block', b.ip)} className="ml-auto text-xs text-red-500 hover:text-red-400 transition-colors">Block</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top IPs 7d */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-4">Top IPs (7 days)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-xs text-zinc-500"><th className="text-left py-2">IP</th><th className="text-left py-2">Events</th><th className="text-left py-2">Status</th><th className="py-2" /></tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {topIps.slice(0, 30).map((ip, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="py-2 font-mono text-xs text-zinc-300">{ip.ip}</td>
                  <td className="py-2 text-xs text-zinc-400">{ip.count}</td>
                  <td className="py-2">{ip.blocked ? <span className="text-xs text-red-400">Blocked</span> : <span className="text-xs text-zinc-600">—</span>}</td>
                  <td className="py-2 text-right">
                    {!ip.blocked ? <button onClick={() => ipAction('block', ip.ip)} className="text-xs text-red-500 hover:text-red-400">Block</button>
                      : <button onClick={() => ipAction('unblock', ip.ip)} className="text-xs text-zinc-500 hover:text-zinc-400">Unblock</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// GEOGRAPHY TAB
// ══════════════════════════════════════════════════════════════════════
function GeographyTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/super-admin/geography?days=${days}`).then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [days]);

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load geography data" />;

  const overview = data.overview as Record<string, number> || {};
  const deviceDist = (data.deviceDistribution as { device: string; count: number }[]) || [];
  const osDist = (data.osDistribution as { os: string; count: number }[]) || [];
  const browserDist = (data.browserDistribution as { browser: string; count: number }[]) || [];
  const surfaceDist = (data.surfaceDistribution as { surface: string; count: number }[]) || [];
  const topIps = (data.topIps as { ip: string; count: number; percent: number }[]) || [];
  const topReferrers = (data.topReferrers as { referrer: string; count: number }[]) || [];
  const heatmap = (data.heatmap as number[][]) || [];
  const dailyVisitors = (data.dailyVisitors as { date: string; visitors: number; sessions: number }[]) || [];
  const live = data.live as { visitors: number } || { visitors: 0 };
  const maxHeatmap = heatmap.length > 0 ? Math.max(...heatmap.flat(), 1) : 1;
  const maxDaily = Math.max(...dailyVisitors.map((d) => d.visitors), 1);
  const days_labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6">
      <SectionHeader title="Geography & Behavior" sub="Device mix, sessions, traffic patterns, visitor heatmap"
        action={<div className="flex gap-1 items-center">
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 mr-2"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"/><span className="text-xs text-emerald-400 font-medium">{live.visitors} live</span></div>
          {[7, 14, 30, 60].map((d) => <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${days === d ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'text-zinc-500 border-transparent hover:border-zinc-700'}`}>{d}d</button>)}
        </div>}
      />

      {/* Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Total Events', overview.totalEvents, 'text-white'], ['Unique Visitors', overview.uniqueVisitors, 'text-amber-400'], ['Sessions', overview.uniqueSessions, 'text-sky-400'], ['Bounce Rate', `${overview.bounceRate || 0}%`, overview.bounceRate > 60 ? 'text-red-400' : 'text-emerald-400']].map(([k, v, c]) => (
          <div key={k as string} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${c}`}>{String(v || 0)}</div>
            <div className="text-xs text-zinc-500 mt-1">{k as string}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-indigo-400">{Math.floor((overview.avgSessionSeconds || 0) / 60)}m {(overview.avgSessionSeconds || 0) % 60}s</div>
          <div className="text-xs text-zinc-500 mt-1">Avg. Session Duration</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-xl font-bold text-zinc-400">{overview.localEvents || 0}</div>
          <div className="text-xs text-zinc-500 mt-1">Local/Dev Events</div>
        </div>
      </div>

      {/* Daily visitors */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-4">Daily Unique Visitors</div>
        <div className="flex items-end gap-1 h-20">
          {dailyVisitors.map((d, i) => (
            <div key={i} className="flex-1 group relative">
              <div className="absolute bottom-full mb-1 bg-zinc-800 border border-zinc-700 text-xs text-white px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 z-10 pointer-events-none">{d.date}<br />{d.visitors} visitors · {d.sessions} sessions</div>
              <div className="w-full bg-sky-500/60 hover:bg-sky-500 rounded-sm transition-colors" style={{ height: Math.max(2, (d.visitors / maxDaily) * 72) }} />
            </div>
          ))}
        </div>
      </div>

      {/* Device + OS + Browser */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { title: 'Devices', items: deviceDist.map((d) => ({ label: d.device, value: d.count })) },
          { title: 'Operating Systems', items: osDist.map((d) => ({ label: d.os, value: d.count })) },
          { title: 'Browsers', items: browserDist.map((d) => ({ label: d.browser, value: d.count })) },
        ].map(({ title, items }) => (
          <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="text-sm font-medium text-white mb-4">{title}</div>
            <div className="space-y-2">
              {items.map((item, i) => <BarRow key={i} label={item.label} value={item.value} max={items[0]?.value || 1} color={i === 0 ? 'bg-amber-500' : 'bg-indigo-500/70'} />)}
            </div>
          </div>
        ))}
      </div>

      {/* Activity heatmap (day × hour) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-4">Activity Heatmap (Day × Hour)</div>
        <div className="overflow-x-auto">
          <div className="min-w-max">
            <div className="flex gap-1 mb-1">
              <div className="w-8" />
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="w-5 text-[8px] text-zinc-700 text-center">{h % 6 === 0 ? `${h}h` : ''}</div>
              ))}
            </div>
            {heatmap.map((row, day) => (
              <div key={day} className="flex gap-1 mb-0.5 items-center">
                <div className="w-8 text-[9px] text-zinc-600 text-right pr-1">{days_labels[day]}</div>
                {row.map((val, hour) => {
                  const intensity = val / maxHeatmap;
                  const bg = intensity === 0 ? 'bg-zinc-800' : intensity < 0.25 ? 'bg-amber-900/60' : intensity < 0.5 ? 'bg-amber-700/70' : intensity < 0.75 ? 'bg-amber-500/80' : 'bg-amber-400';
                  return <div key={hour} title={`${days_labels[day]} ${hour}:00 — ${val} events`} className={`w-5 h-5 rounded-sm ${bg} cursor-default transition-colors`} />;
                })}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-zinc-600">
          <span>Low</span>
          <div className="flex gap-0.5">{['bg-zinc-800', 'bg-amber-900/60', 'bg-amber-700/70', 'bg-amber-500/80', 'bg-amber-400'].map((c, i) => <div key={i} className={`w-4 h-3 rounded-sm ${c}`} />)}</div>
          <span>High</span>
        </div>
      </div>

      {/* Referrers + IPs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-4">Top Referrers</div>
          <div className="space-y-2">
            {topReferrers.slice(0, 12).map((r, i) => <BarRow key={i} label={r.referrer} value={r.count} max={topReferrers[0]?.count || 1} color={r.referrer === 'direct' ? 'bg-emerald-500' : 'bg-sky-500'} />)}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-4">Top IP Addresses</div>
          <div className="space-y-1.5">
            {topIps.slice(0, 15).map((ip, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-zinc-400 w-28 truncate">{ip.ip}</span>
                <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-indigo-500/70 rounded-full" style={{ width: `${ip.percent}%` }} />
                </div>
                <span className="text-zinc-500 w-8 text-right">{ip.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Surface distribution */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-4">Traffic by Surface</div>
        <div className="grid grid-cols-2 gap-3">
          {surfaceDist.map((s, i) => (
            <div key={i} className="bg-zinc-800 rounded-lg p-4 text-center">
              <div className="text-xl font-bold text-white">{s.count.toLocaleString()}</div>
              <div className="text-xs text-zinc-500 mt-0.5 capitalize">{s.surface}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// INTEGRATIONS TAB
// ══════════════════════════════════════════════════════════════════════
function IntegrationsTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [msg, setMsg] = useState('');
  const [gaForm, setGaForm] = useState({ enabled: false, measurementId: '', apiSecret: '' });
  const [rzForm, setRzForm] = useState({ enabled: false, keyId: '', keySecret: '', webhookSecret: '', testMode: true });
  const [slackForm, setSlackForm] = useState({ enabled: false, webhookUrl: '', channel: '#alerts', notifyOnSignup: true, notifyOnPayment: true, notifyOnAlert: true });
  const [newWebhook, setNewWebhook] = useState({ url: '', label: '', events: '' });

  const load = () => {
    setLoading(true);
    fetch('/api/super-admin/integrations').then((r) => r.json()).then((d) => {
      setData(d);
      if (d.googleAnalytics) setGaForm({ enabled: d.googleAnalytics.enabled, measurementId: d.googleAnalytics.measurementId || '', apiSecret: '' });
      if (d.razorpay) setRzForm({ enabled: d.razorpay.enabled, keyId: d.razorpay.keyId || '', keySecret: '', webhookSecret: '', testMode: d.razorpay.testMode });
      if (d.slack) setSlackForm({ enabled: d.slack.enabled, webhookUrl: '', channel: d.slack.channel || '#alerts', notifyOnSignup: d.slack.notifyOnSignup, notifyOnPayment: d.slack.notifyOnPayment, notifyOnAlert: d.slack.notifyOnAlert });
    }).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  async function doAction(action: string, payload: object) {
    setSaving(action);
    const res = await fetch('/api/super-admin/integrations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data: payload }) });
    const d = await res.json();
    setSaving('');
    if (res.ok) { setMsg(d.success ? 'Saved' : d.status === 204 ? 'Sent!' : 'Saved'); load(); }
    else setMsg(d.error || 'Failed');
    setTimeout(() => setMsg(''), 3000);
  }

  if (loading) return <Loader />;

  const envStatus = data?.envStatus as Record<string, boolean> || {};
  const webhooks = (data?.webhooks as Record<string, unknown>[]) || [];

  return (
    <div className="space-y-6">
      <SectionHeader title="Integrations" sub="Google Analytics, Razorpay, Slack, Webhooks" />
      {msg && <div className={`text-xs px-3 py-2 rounded-lg border ${msg.includes('ail') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>{msg}</div>}

      {/* Env status */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-4">Environment Variables</div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
          {Object.entries(envStatus).map(([key, set]) => (
            <div key={key} className="flex items-center gap-2 bg-zinc-800 rounded-lg px-3 py-2">
              <div className={`w-2 h-2 rounded-full ${set ? 'bg-emerald-500' : 'bg-red-500/60'}`} />
              <span className="text-xs font-mono text-zinc-400">{key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Google Analytics */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-white">Google Analytics 4</div>
            <div className="text-xs text-zinc-500">Track events via GA4 Measurement Protocol</div>
          </div>
          <div className="flex items-center gap-3">
            {Boolean(data?.googleAnalytics && (data.googleAnalytics as unknown as Record<string, boolean>).apiSecretConfigured) && <span className="text-xs text-emerald-400">Configured</span>}
            <Toggle enabled={gaForm.enabled} onChange={(v) => setGaForm({ ...gaForm, enabled: v })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[['Measurement ID', 'measurementId', 'G-XXXXXXXXXX'], ['API Secret', 'apiSecret', '••••••']].map(([label, key, ph]) => (
            <div key={key}><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">{label}</label><input value={String((gaForm as unknown as Record<string, unknown>)[key] ?? '')} onChange={(e) => setGaForm({ ...gaForm, [key]: e.target.value })} placeholder={ph} className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" /></div>
          ))}
        </div>
        <div className="flex gap-2">
          <button disabled={saving === 'update_google_analytics'} onClick={() => doAction('update_google_analytics', gaForm)} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-semibold rounded-lg transition-all">Save</button>
          <button disabled={saving === 'test_google_analytics'} onClick={() => doAction('test_google_analytics', {})} className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-lg transition-all">Test Ping</button>
        </div>
      </div>

      {/* Razorpay */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-white">Razorpay</div>
            <div className="text-xs text-zinc-500">Payment gateway configuration</div>
          </div>
          <Toggle enabled={rzForm.enabled} onChange={(v) => setRzForm({ ...rzForm, enabled: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[['Key ID', 'keyId', 'rzp_live_...'], ['Key Secret', 'keySecret', '••••••'], ['Webhook Secret', 'webhookSecret', '••••••']].map(([label, key, ph]) => (
            <div key={key}><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">{label}</label><input value={String((rzForm as unknown as Record<string, unknown>)[key] ?? '')} onChange={(e) => setRzForm({ ...rzForm, [key]: e.target.value })} placeholder={ph} className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" /></div>
          ))}
        </div>
        <div className="flex items-center gap-2"><Toggle enabled={rzForm.testMode} onChange={(v) => setRzForm({ ...rzForm, testMode: v })} /><span className="text-sm text-zinc-400">Test Mode</span></div>
        <button disabled={saving === 'update_razorpay'} onClick={() => doAction('update_razorpay', rzForm)} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-semibold rounded-lg transition-all">Save Razorpay Config</button>
      </div>

      {/* Slack */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-white">Slack Notifications</div>
            <div className="text-xs text-zinc-500">Get alerts in Slack for signups, payments, and anomalies</div>
          </div>
          <Toggle enabled={slackForm.enabled} onChange={(v) => setSlackForm({ ...slackForm, enabled: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Webhook URL</label><input value={slackForm.webhookUrl} onChange={(e) => setSlackForm({ ...slackForm, webhookUrl: e.target.value })} placeholder="https://hooks.slack.com/services/..." className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" /></div>
          <div><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Channel</label><input value={slackForm.channel} onChange={(e) => setSlackForm({ ...slackForm, channel: e.target.value })} placeholder="#alerts" className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" /></div>
        </div>
        <div className="flex flex-wrap gap-4">
          {[['Signups', 'notifyOnSignup'], ['Payments', 'notifyOnPayment'], ['Alerts', 'notifyOnAlert']].map(([label, key]) => (
            <div key={key} className="flex items-center gap-2"><Toggle enabled={Boolean((slackForm as unknown as Record<string, unknown>)[key])} onChange={(v) => setSlackForm({ ...slackForm, [key]: v })} /><span className="text-sm text-zinc-400">{label}</span></div>
          ))}
        </div>
        <div className="flex gap-2">
          <button disabled={saving === 'update_slack'} onClick={() => doAction('update_slack', slackForm)} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-semibold rounded-lg transition-all">Save</button>
          <button disabled={saving === 'test_slack'} onClick={() => doAction('test_slack', {})} className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-lg transition-all">Send Test</button>
        </div>
      </div>

      {/* Webhooks */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
        <div className="text-sm font-medium text-white">Custom Webhooks</div>
        {webhooks.length > 0 && (
          <div className="space-y-2">
            {webhooks.map((w, i) => (
              <div key={i} className="flex items-center gap-3 bg-zinc-800 rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{String(w.label)}</div>
                  <div className="text-xs text-zinc-500 font-mono truncate">{String(w.url)}</div>
                </div>
                <span className={badge(w.enabled ? 'active' : 'disabled')}>{w.enabled ? 'active' : 'paused'}</span>
                <button onClick={() => doAction('toggle_webhook', { id: w.id })} className="text-xs text-zinc-500 hover:text-zinc-300">{w.enabled ? 'Pause' : 'Resume'}</button>
                <button onClick={() => doAction('delete_webhook', { id: w.id })} className="text-xs text-red-500 hover:text-red-400">Delete</button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800">
          <div className="col-span-2"><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Endpoint URL</label><input value={newWebhook.url} onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })} placeholder="https://your-server.com/webhook" className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" /></div>
          <div><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Label</label><input value={newWebhook.label} onChange={(e) => setNewWebhook({ ...newWebhook, label: e.target.value })} placeholder="My webhook" className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" /></div>
          <div><label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Events (comma separated)</label><input value={newWebhook.events} onChange={(e) => setNewWebhook({ ...newWebhook, events: e.target.value })} placeholder="user.created, payment.paid" className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" /></div>
        </div>
        <button onClick={() => doAction('add_webhook', { url: newWebhook.url, label: newWebhook.label, events: newWebhook.events.split(',').map((e) => e.trim()).filter(Boolean) })} className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-lg transition-all">Add Webhook</button>
      </div>
    </div>
  );
}

// ── Early Access Tab ──────────────────────────────────────────────────────────
function EarlyAccessTab() {
  type EAView = 'overview' | 'waitlist' | 'wishes' | 'manage';
  const [view, setView] = useState<EAView>('overview');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [drillData, setDrillData] = useState<any>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [editFeature, setEditFeature] = useState<any | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newFeat, setNewFeat] = useState({ title: '', tagline: '', description: '', category: '', eta: 'Q3 2026', icon: 'Star', accentColor: 'amber', tags: '' });

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/super-admin/early-access?view=overview', { credentials: 'include' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setData(d);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const loadDrill = async (featureId: string, type: 'waitlist' | 'wishes') => {
    setDrillLoading(true); setDrillData(null);
    try {
      const res = await fetch(`/api/super-admin/early-access?view=${type}&featureId=${featureId}`, { credentials: 'include' });
      const d = await res.json();
      setDrillData(d);
    } catch { setDrillData(null); }
    finally { setDrillLoading(false); }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (selectedFeature && (view === 'waitlist' || view === 'wishes')) {
      loadDrill(selectedFeature, view);
    }
  }, [selectedFeature, view]);

  const doAction = async (action: string, payload: any) => {
    setSaving(action);
    try {
      const res = await fetch('/api/super-admin/early-access', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, data: payload }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      await load();
      setEditFeature(null); setShowAdd(false);
    } catch (e: any) { alert(e.message); }
    finally { setSaving(''); }
  };

  const ACCENT_COLORS = ['amber', 'sky', 'violet', 'rose', 'cyan', 'emerald', 'yellow', 'teal', 'indigo', 'orange', 'pink', 'fuchsia'];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <div className="p-4 text-red-400 text-sm">{error}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Early Bird Access</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Waitlists, wishes, and upcoming feature management</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/early-access" target="_blank" className="px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 rounded-lg hover:border-zinc-600 transition-all">View Page ↗</a>
          <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-lg transition-all">+ Add Feature</button>
        </div>
      </div>

      {/* Stats */}
      {data?.stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Features', value: data.stats.totalFeatures, color: 'text-white' },
            { label: 'Early Birds', value: data.stats.totalWaitlist, color: 'text-amber-400' },
            { label: 'Wishes Submitted', value: data.stats.totalWishes, color: 'text-rose-400' },
            { label: 'Unique Emails', value: data.stats.uniqueEmails, color: 'text-sky-400' },
          ].map((s) => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value?.toLocaleString() ?? '—'}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Feature list */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Upcoming Features</span>
          <span className="text-xs text-zinc-500">{data?.features?.length ?? 0} features</span>
        </div>
        <div className="divide-y divide-zinc-800/60">
          {(data?.features || []).map((f: any) => (
            <div key={f.id} className="px-4 py-3 hover:bg-zinc-800/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase">{f.accentColor?.slice(0,2)}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white">{f.title}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${f.status === 'live' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : f.status === 'beta' ? 'bg-sky-500/15 text-sky-400 border-sky-500/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>{f.status?.replace('_', ' ')}</span>
                      {f.featured && <span className="text-[10px] text-amber-400">★ Featured</span>}
                    </div>
                    <p className="text-xs text-zinc-500 truncate">{f.tagline}</p>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <span className="text-xs text-zinc-600">{f.category}</span>
                      <span className="text-xs text-zinc-600">ETA: {f.eta}</span>
                      <button onClick={() => { setSelectedFeature(f.id); setView('waitlist'); }} className="text-xs text-amber-400 hover:text-amber-300 transition-colors">
                        {f.waitlistVerified} waitlisted
                      </button>
                      <button onClick={() => { setSelectedFeature(f.id); setView('wishes'); }} className="text-xs text-rose-400 hover:text-rose-300 transition-colors">
                        {f.wishCount} wishes
                      </button>
                    </div>
                    {f.recentSignups?.length > 0 && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <span className="text-[10px] text-zinc-600">Recent:</span>
                        {f.recentSignups.map((s: any) => (
                          <span key={s.email} className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded">{s.email.split('@')[0]}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setEditFeature(f)} className="text-xs px-2.5 py-1 border border-zinc-700 text-zinc-400 rounded-lg hover:border-zinc-600 transition-all">Edit</button>
                  <button onClick={() => { if (confirm(`Delete "${f.title}"?`)) doAction('delete_feature', { id: f.id }); }} className="text-xs px-2.5 py-1 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/10 transition-all">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Drilldown: Waitlist / Wishes */}
      {selectedFeature && (view === 'waitlist' || view === 'wishes') && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => { setSelectedFeature(null); setView('overview'); }} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">← Back</button>
              <span className="text-sm font-semibold text-white capitalize">{view} — {data?.features?.find((f: any) => f.id === selectedFeature)?.title}</span>
            </div>
            <div className="flex gap-1.5">
              {(['waitlist', 'wishes'] as const).map((v) => (
                <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 text-xs rounded-lg border transition-all capitalize ${view === v ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>{v}</button>
              ))}
            </div>
          </div>
          {drillLoading ? (
            <div className="flex items-center justify-center h-24"><div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : view === 'waitlist' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900/50 border-b border-zinc-800">
                  <tr>{['Name', 'Email', 'Verified', 'Joined'].map((h) => <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {(drillData?.entries || []).map((e: any) => (
                    <tr key={e.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-2.5 text-zinc-300 text-sm">{e.name || '—'}</td>
                      <td className="px-4 py-2.5 text-zinc-400 text-xs font-mono">{e.email}</td>
                      <td className="px-4 py-2.5"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${e.verified ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' : 'bg-zinc-800 text-zinc-600 border-zinc-700'}`}>{e.verified ? 'Verified' : 'Pending'}</span></td>
                      <td className="px-4 py-2.5 text-zinc-600 text-xs">{new Date(e.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {!drillData?.entries?.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-600 text-sm">No entries yet</td></tr>}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {(drillData?.wishes || []).map((w: any) => (
                <div key={w.id} className="px-4 py-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold text-white">{w.name || 'Anonymous'}</span>
                      <span className="text-xs text-zinc-500 ml-2">{w.email}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[1,2,3,4,5].map((n) => <span key={n} className={`text-xs ${n <= w.excitement ? 'text-amber-400' : 'text-zinc-800'}`}>★</span>)}
                      <span className="text-xs text-zinc-500 ml-1">{new Date(w.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {w.currentSoftware && <p className="text-xs text-zinc-500"><span className="font-semibold text-zinc-400">Current tool:</span> {w.currentSoftware}</p>}
                  <div className="bg-zinc-800/40 rounded-lg p-3 space-y-2">
                    <div><p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold mb-1">Pain points</p><p className="text-xs text-zinc-300 leading-relaxed">{w.painPoints}</p></div>
                    <div className="border-t border-zinc-700/40 pt-2"><p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold mb-1">Expected features</p><p className="text-xs text-zinc-300 leading-relaxed">{w.expectedFeatures}</p></div>
                  </div>
                </div>
              ))}
              {!drillData?.wishes?.length && <div className="px-4 py-8 text-center text-zinc-600 text-sm">No wishes submitted yet</div>}
            </div>
          )}
        </div>
      )}

      {/* Edit Feature Modal */}
      {editFeature && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg p-6 space-y-4 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Edit Feature</h3>
              <button onClick={() => setEditFeature(null)} className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors text-zinc-400">✕</button>
            </div>
            {[['Title', 'title'], ['Tagline', 'tagline'], ['Category', 'category'], ['ETA', 'eta'], ['Icon', 'icon']].map(([label, key]) => (
              <div key={key}>
                <label className="text-xs text-zinc-500 uppercase tracking-widest block mb-1">{label}</label>
                <input value={String(editFeature[key] ?? '')} onChange={(e) => setEditFeature({ ...editFeature, [key]: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
              </div>
            ))}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-widest block mb-1">Description</label>
              <textarea rows={3} value={String(editFeature.description ?? '')} onChange={(e) => setEditFeature({ ...editFeature, description: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-widest block mb-1">Status</label>
              <select value={String(editFeature.status ?? 'coming_soon')} onChange={(e) => setEditFeature({ ...editFeature, status: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500">
                {['coming_soon', 'beta', 'live'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-widest block mb-1">Accent Color</label>
              <div className="flex flex-wrap gap-1.5">
                {ACCENT_COLORS.map((c) => (
                  <button key={c} onClick={() => setEditFeature({ ...editFeature, accentColor: c })} className={`px-2 py-1 text-[10px] rounded border transition-all ${editFeature.accentColor === c ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500'}`}>{c}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="feat-featured" checked={Boolean(editFeature.featured)} onChange={(e) => setEditFeature({ ...editFeature, featured: e.target.checked })} className="rounded" />
              <label htmlFor="feat-featured" className="text-sm text-zinc-300">Featured (shows star badge)</label>
            </div>
            <div className="flex gap-2 pt-2">
              <button disabled={Boolean(saving)} onClick={() => doAction('update_feature', editFeature)} className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg disabled:opacity-50 transition-all">{saving ? 'Saving…' : 'Save changes'}</button>
              <button onClick={() => setEditFeature(null)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Feature Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg p-6 space-y-4 overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Add New Feature</h3>
              <button onClick={() => setShowAdd(false)} className="w-7 h-7 rounded-full bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center transition-colors text-zinc-400">✕</button>
            </div>
            {([['Title *', 'title', 'AI Document Generation'], ['Tagline *', 'tagline', 'Generate any document with one prompt'], ['Category', 'category', 'AI & Automation'], ['ETA', 'eta', 'Q3 2026'], ['Icon', 'icon', 'Sparkles']] as [string, keyof typeof newFeat, string][]).map(([label, key, ph]) => (
              <div key={key}>
                <label className="text-xs text-zinc-500 uppercase tracking-widest block mb-1">{label}</label>
                <input value={String(newFeat[key])} onChange={(e) => setNewFeat({ ...newFeat, [key]: e.target.value })} placeholder={ph} className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500" />
              </div>
            ))}
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-widest block mb-1">Description</label>
              <textarea rows={3} value={newFeat.description} onChange={(e) => setNewFeat({ ...newFeat, description: e.target.value })} className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none" />
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-widest block mb-1">Accent Color</label>
              <div className="flex flex-wrap gap-1.5">
                {ACCENT_COLORS.map((c) => (
                  <button key={c} onClick={() => setNewFeat({ ...newFeat, accentColor: c })} className={`px-2 py-1 text-[10px] rounded border transition-all ${newFeat.accentColor === c ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500'}`}>{c}</button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button disabled={Boolean(saving)} onClick={() => doAction('add_feature', { ...newFeat, tags: newFeat.tags.split(',').map((t) => t.trim()).filter(Boolean) })} className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold rounded-lg disabled:opacity-50 transition-all">{saving ? 'Adding…' : 'Add feature'}</button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Public Face Tab — review, approve, reject applications
═══════════════════════════════════════════════════════════════════════ */
const CATEGORY_LABELS: Record<string, string> = {
  actor_actress: 'Actor / Actress', singer_musician: 'Singer / Musician',
  athlete_sportsperson: 'Athlete / Sportsperson', model: 'Model',
  content_creator: 'Content Creator', influencer: 'Influencer',
  politician: 'Politician', entrepreneur_ceo: 'Entrepreneur / CEO',
  author_writer: 'Author / Writer', academic_scientist: 'Academic / Scientist',
  tv_personality: 'TV Personality', comedian: 'Comedian',
  social_activist: 'Social Activist', chef_culinary: 'Chef / Culinary Expert',
  fashion_designer: 'Fashion Designer', photographer_videographer: 'Photographer / Videographer',
  game_streamer: 'Game Streamer', journalist: 'Journalist', other: 'Other Public Figure',
};
const CATEGORY_ICONS: Record<string, string> = {
  actor_actress:'🎭', singer_musician:'🎵', athlete_sportsperson:'🏆', model:'✨',
  content_creator:'🎬', influencer:'📱', politician:'🏛️', entrepreneur_ceo:'💼',
  author_writer:'📖', academic_scientist:'🔬', tv_personality:'📺', comedian:'😄',
  social_activist:'✊', chef_culinary:'👨‍🍳', fashion_designer:'👗',
  photographer_videographer:'📷', game_streamer:'🎮', journalist:'📰', other:'⭐',
};

interface PFApp {
  id: string; userId: string; userEmail: string; userName: string;
  status: string; category: string; submittedAt: string; updatedAt: string;
  instagramHandle?: string; twitterHandle?: string; youtubeChannel?: string;
  facebookPage?: string; tiktokHandle?: string; websiteUrl?: string;
  totalFollowers?: string; monthlyReach?: string; mediaFeatures?: string;
  awardsRecognitions?: string; notableProjects?: string; publicStatement: string;
  identityProofFileName?: string; identityProofMimeType?: string;
  emailVerified: boolean; adminNote?: string; reviewedAt?: string;
}

function PublicFaceTab() {
  const [apps, setApps] = useState<PFApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<PFApp | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionErr, setActionErr] = useState('');
  const [proofData, setProofData] = useState<{ dataUrl: string; fileName: string } | null>(null);
  const [proofLoading, setProofLoading] = useState(false);

  const load = useCallback(async (filter: string) => {
    setLoading(true);
    try {
      const params = filter ? `?status=${filter}` : '';
      const r = await fetch(`/api/super-admin/public-face${params}`);
      const d = await r.json();
      setApps(d.applications || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(statusFilter); }, [statusFilter, load]);

  const loadProof = async (appId: string) => {
    setProofLoading(true);
    try {
      const r = await fetch('/api/super-admin/public-face', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ applicationId: appId }),
      });
      const d = await r.json();
      if (d.application?.identityProofDataUrl) {
        setProofData({ dataUrl: d.application.identityProofDataUrl, fileName: d.application.identityProofFileName || 'proof' });
      }
    } finally {
      setProofLoading(false);
    }
  };

  const doAction = async (action: 'approve' | 'reject' | 'under_review') => {
    if (!selected) return;
    setActionLoading(true);
    setActionErr('');
    try {
      const r = await fetch('/api/super-admin/public-face', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ applicationId: selected.id, action, adminNote: adminNote.trim() || undefined }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Action failed.');
      setSelected(null);
      setAdminNote('');
      setProofData(null);
      load(statusFilter);
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : 'Failed.');
    } finally {
      setActionLoading(false);
    }
  };

  const counts = {
    pending: apps.filter(a => a.status === 'pending').length,
    under_review: apps.filter(a => a.status === 'under_review').length,
    approved: apps.filter(a => a.status === 'approved').length,
    rejected: apps.filter(a => a.status === 'rejected').length,
  };

  const STATUS_COLORS: Record<string, string> = {
    pending: '#fbbf24', under_review: '#60a5fa', approved: '#34d399', rejected: '#f87171',
  };
  const STATUS_LABELS: Record<string, string> = {
    pending: 'Pending', under_review: 'Under Review', approved: 'Approved', rejected: 'Rejected',
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-white">Public Face Applications</h2>
          <p className="text-sm text-zinc-500 mt-0.5">Review and approve Public Face badge applications</p>
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          {[['', 'All'], ['pending', 'Pending'], ['under_review', 'Under Review'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${statusFilter === v ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[['pending','Pending',counts.pending,'#fbbf24'],['under_review','Under Review',counts.under_review,'#60a5fa'],['approved','Approved',counts.approved,'#34d399'],['rejected','Rejected',counts.rejected,'#f87171']].map(([k,l,c,col]) => (
          <div key={k} onClick={() => setStatusFilter(k as string)}
            className="rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.02]"
            style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${col as string}30` }}>
            <p className="text-2xl font-black" style={{ color: col as string }}>{c as number}</p>
            <p className="text-xs text-zinc-500 mt-1">{l as string}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
        </div>
      ) : apps.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">No applications found.</div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {['Applicant', 'Category', 'Followers', 'Verified', 'Submitted', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {apps.map(app => (
                <tr key={app.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white/80 text-sm">{app.userName}</p>
                    <p className="text-xs text-zinc-600 truncate max-w-[160px]">{app.userEmail}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#c084fc' }}>
                      <span>{CATEGORY_ICONS[app.category] || '⭐'}</span>
                      <span>{CATEGORY_LABELS[app.category] || app.category}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{app.totalFollowers || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold ${app.emailVerified ? 'text-emerald-400' : 'text-zinc-600'}`}>
                      {app.emailVerified ? '✓ Yes' : '✗ No'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600">
                    {new Date(app.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: `${STATUS_COLORS[app.status]}18`, color: STATUS_COLORS[app.status] || '#fff' }}>
                      {STATUS_LABELS[app.status] || app.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => { setSelected(app); setAdminNote(app.adminNote || ''); setProofData(null); }}
                      className="px-3 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 text-xs font-semibold transition-all">
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
          onClick={() => { setSelected(null); setProofData(null); }}>
          <div className="relative w-full sm:max-w-2xl rounded-t-[24px] sm:rounded-[24px] overflow-hidden max-h-[90vh] overflow-y-auto"
            style={{ background: '#0f0f15', border: '1px solid rgba(168,85,247,0.2)' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.07]">
              <div>
                <p className="text-base font-black text-white">{selected.userName}</p>
                <p className="text-xs text-zinc-500">{selected.userEmail}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold"
                  style={{ background: `${STATUS_COLORS[selected.status]}18`, color: STATUS_COLORS[selected.status] }}>
                  {STATUS_LABELS[selected.status]}
                </span>
                <button onClick={() => { setSelected(null); setProofData(null); }}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition text-white/40 text-lg">×</button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Category */}
              <div className="flex items-center gap-2">
                <span className="text-lg">{CATEGORY_ICONS[selected.category] || '⭐'}</span>
                <span className="text-sm font-bold" style={{ color: '#c084fc' }}>{CATEGORY_LABELS[selected.category] || selected.category}</span>
              </div>

              {/* Social handles */}
              <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Social Presence</p>
                {[
                  ['Instagram', selected.instagramHandle],['Twitter', selected.twitterHandle],
                  ['YouTube', selected.youtubeChannel],['Facebook', selected.facebookPage],
                  ['TikTok', selected.tiktokHandle],['Website', selected.websiteUrl],
                ].filter(([,v]) => v).map(([l, v]) => (
                  <div key={l as string} className="flex items-center gap-2">
                    <span className="text-xs text-zinc-600 w-20 shrink-0">{l as string}</span>
                    <span className="text-xs text-violet-300 break-all">{v as string}</span>
                  </div>
                ))}
                {!selected.instagramHandle && !selected.twitterHandle && !selected.youtubeChannel && !selected.websiteUrl && (
                  <p className="text-xs text-zinc-700">No social handles provided.</p>
                )}
              </div>

              {/* Fame proof */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Fame Evidence</p>
                {[
                  ['Total Followers', selected.totalFollowers],
                  ['Monthly Reach', selected.monthlyReach],
                  ['Media Features', selected.mediaFeatures],
                  ['Awards', selected.awardsRecognitions],
                  ['Notable Projects', selected.notableProjects],
                ].filter(([,v]) => v).map(([l, v]) => (
                  <div key={l as string}>
                    <p className="text-[10px] text-zinc-600 uppercase tracking-widest">{l as string}</p>
                    <p className="text-sm text-white/70 mt-0.5 leading-relaxed">{v as string}</p>
                  </div>
                ))}
              </div>

              {/* Public statement */}
              <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Public Statement</p>
                <p className="text-sm text-white/60 leading-relaxed">{selected.publicStatement}</p>
              </div>

              {/* Identity proof */}
              <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Identity Proof</p>
                {selected.identityProofFileName ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-white/60">{selected.identityProofFileName}</span>
                    {!proofData && (
                      <button onClick={() => loadProof(selected.id)} disabled={proofLoading}
                        className="px-3 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 text-xs font-semibold transition disabled:opacity-50">
                        {proofLoading ? 'Loading…' : 'View Proof'}
                      </button>
                    )}
                  </div>
                ) : <p className="text-xs text-zinc-700">No proof uploaded.</p>}
                {proofData && (
                  <div className="mt-2">
                    {proofData.fileName.endsWith('.pdf') ? (
                      <a href={proofData.dataUrl} download={proofData.fileName}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600/20 text-emerald-400 text-xs font-semibold">
                        Download PDF
                      </a>
                    ) : (
                      <img src={proofData.dataUrl} alt="Identity proof" className="max-w-full rounded-xl border border-white/[0.08] max-h-64 object-contain" />
                    )}
                  </div>
                )}
              </div>

              {/* Admin note */}
              <div>
                <label className="text-xs text-zinc-500 uppercase tracking-widest block mb-1.5">Admin Note (optional — sent to applicant)</label>
                <textarea rows={2} value={adminNote} onChange={e => setAdminNote(e.target.value)}
                  placeholder="Optional note for the applicant…"
                  className="w-full rounded-xl px-4 py-3 text-sm text-white/70 placeholder-zinc-700 resize-none outline-none transition"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }} />
              </div>

              {actionErr && <p className="text-xs text-red-400">{actionErr}</p>}

              {/* Actions */}
              <div className="flex gap-2 flex-wrap">
                {selected.status !== 'under_review' && (
                  <button onClick={() => doAction('under_review')} disabled={actionLoading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                    style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}>
                    {actionLoading ? '…' : 'Mark Under Review'}
                  </button>
                )}
                <button onClick={() => doAction('approve')} disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', boxShadow: '0 4px 14px rgba(124,58,237,0.35)' }}>
                  {actionLoading ? '…' : '✓ Approve'}
                </button>
                <button onClick={() => doAction('reject')} disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(248,113,113,0.12)', color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}>
                  {actionLoading ? '…' : '✗ Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// USER INTELLIGENCE TAB
// ══════════════════════════════════════════════════════════════════════
function UserIntelligenceTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    fetch('/api/super-admin/user-intelligence')
      .then((r) => r.json())
      .then((d) => { setData(d); setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })); })
      .catch(console.error)
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(() => load(true), 60000);
    return () => clearInterval(iv);
  }, [load]);

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load user intelligence" />;

  type UAEntry = { userId: string; userName: string; userEmail: string; role: string; organizationName?: string; lastSeenAt?: string; events7d: number; topTab?: string; feedbackRating?: number; status: 'power' | 'active' | 'slipping' };

  const overview = data.overview as Record<string, unknown> || {};
  const userActivity = (data.userActivity as UAEntry[]) || [];
  const topTabs = (data.topTabs as { label: string; count: number }[]) || [];
  const topFeatures = (data.topFeatures as { label: string; count: number }[]) || [];
  const topRequests = (data.topRequests as { label: string; count: number }[]) || [];

  const statusColors: Record<string, string> = {
    power: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    slipping: 'bg-red-500/15 text-red-400 border-red-500/20',
  };

  const powerUsers = userActivity.filter((u) => u.status === 'power').length;
  const activeUsers = userActivity.filter((u) => u.status === 'active').length;
  const slippingUsers = userActivity.filter((u) => u.status === 'slipping').length;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="User Intelligence"
        sub="Behavior analytics, engagement scoring, feature adoption"
        action={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-zinc-600">
              {refreshing && <div className="w-3 h-3 border border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />}
              <span>Updated {lastUpdated}</span>
            </div>
            <button onClick={() => load(true)} disabled={refreshing} className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1.5 transition-all disabled:opacity-40">↻ Refresh</button>
          </div>
        }
      />

      {/* Platform health scores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active Users (24h)', value: String(overview.activeUsers24h || 0), color: 'text-emerald-400', sub: `${overview.activeUsers7d || 0} this week` },
          { label: 'Avg Feedback Rating', value: String(overview.averageFeedbackRating || '—'), color: 'text-amber-400', sub: `${overview.feedbackCoverageRate || 0}% coverage` },
          { label: 'Power Users', value: String(powerUsers), color: 'text-amber-400', sub: '12+ events/week' },
          { label: 'At-Risk Users', value: String(slippingUsers), color: slippingUsers > 0 ? 'text-red-400' : 'text-zinc-500', sub: '<4 events/week' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
            <div className="text-xs text-zinc-700 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Engagement health */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Adoption', value: String((overview.adoptionStatus as Record<string, string>)?.label || '—'), color: (overview.adoptionStatus as Record<string, string>)?.status === 'healthy' ? 'text-emerald-400' : (overview.adoptionStatus as Record<string, string>)?.status === 'watch' ? 'text-amber-400' : 'text-red-400' },
          { label: 'Engagement', value: String((overview.engagementStatus as Record<string, string>)?.label || '—'), color: (overview.engagementStatus as Record<string, string>)?.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'Satisfaction', value: String((overview.satisfactionStatus as Record<string, string>)?.label || '—'), color: (overview.satisfactionStatus as Record<string, string>)?.status === 'healthy' ? 'text-emerald-400' : 'text-amber-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm text-zinc-400">{label}</span>
            <span className={`text-sm font-semibold capitalize ${color}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Top tabs + features */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-4">Most Used Tabs (7d)</div>
          <div className="space-y-2">
            {topTabs.slice(0, 10).map((t, i) => <BarRow key={i} label={t.label} value={t.count} max={topTabs[0]?.count || 1} color={i === 0 ? 'bg-amber-500' : 'bg-indigo-500/70'} />)}
            {topTabs.length === 0 && <div className="text-xs text-zinc-600">No data yet</div>}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-4">Top Features (7d)</div>
          <div className="space-y-2">
            {topFeatures.slice(0, 10).map((f, i) => <BarRow key={i} label={f.label} value={f.count} max={topFeatures[0]?.count || 1} color={i === 0 ? 'bg-sky-500' : 'bg-sky-500/50'} />)}
            {topFeatures.length === 0 && <div className="text-xs text-zinc-600">No data yet</div>}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-4">Top User Requests</div>
          <div className="space-y-2">
            {topRequests.slice(0, 10).map((r, i) => <BarRow key={i} label={r.label} value={r.count} max={topRequests[0]?.count || 1} color="bg-rose-500/70" />)}
            {topRequests.length === 0 && <div className="text-xs text-zinc-600">No feedback yet</div>}
          </div>
        </div>
      </div>

      {/* User engagement table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="text-sm font-medium text-white">User Engagement Scores</div>
          <div className="flex gap-2 text-xs">
            <span className="bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">{powerUsers} power</span>
            <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">{activeUsers} active</span>
            <span className="bg-red-500/15 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">{slippingUsers} slipping</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Events 7d</th>
                <th className="text-left px-4 py-3">Top Tab</th>
                <th className="text-left px-4 py-3">Rating</th>
                <th className="text-left px-4 py-3">Last Seen</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {userActivity.slice(0, 50).map((u, i) => (
                <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-zinc-300 font-medium text-sm truncate max-w-[130px]">{u.userName || '—'}</div>
                    <div className="text-zinc-600 text-xs truncate max-w-[130px]">{u.userEmail}</div>
                  </td>
                  <td className="px-4 py-3"><span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full">{u.role}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (u.events7d / 30) * 100)}%` }} />
                      </div>
                      <span className="text-xs font-mono text-zinc-400">{u.events7d}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{u.topTab || '—'}</td>
                  <td className="px-4 py-3">
                    {u.feedbackRating ? (
                      <div className="flex gap-0.5">{[1,2,3,4,5].map((n) => <span key={n} className={`text-[10px] ${n <= u.feedbackRating! ? 'text-amber-400' : 'text-zinc-700'}`}>★</span>)}</div>
                    ) : <span className="text-zinc-700 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{ago(u.lastSeenAt)}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${statusColors[u.status] || ''}`}>{u.status}</span></td>
                </tr>
              ))}
              {userActivity.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-zinc-600">No activity data yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// NETWORK & SOCIAL TAB
// ══════════════════════════════════════════════════════════════════════
function NetworkTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/super-admin/network').then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load network data" />;

  const summary = data.summary as Record<string, number> || {};
  const topByFollowers = (data.topByFollowers as { userId: string; name: string; email: string; followers: number; following: number; openToWork: boolean }[]) || [];
  const eventTypes = data.eventTypes as Record<string, number> || {};
  const dailySocial = (data.dailySocial as { date: string; events: number; follows: number; likes: number }[]) || [];
  const maxDaily = Math.max(...dailySocial.map((d) => d.events), 1);

  const profileCompleteness = summary.totalProfiles > 0 ? [
    { label: 'Profile Setup', value: summary.profilesSetup, pct: Math.round((summary.profilesSetup / summary.totalProfiles) * 100) },
    { label: 'Has Headline', value: summary.profilesWithHeadline, pct: Math.round((summary.profilesWithHeadline / summary.totalProfiles) * 100) },
    { label: 'Has Bio', value: summary.profilesWithBio, pct: Math.round((summary.profilesWithBio / summary.totalProfiles) * 100) },
    { label: 'Has Skills', value: summary.profilesWithSkills, pct: Math.round((summary.profilesWithSkills / summary.totalProfiles) * 100) },
    { label: 'Has Location', value: summary.profilesWithLocation, pct: Math.round((summary.profilesWithLocation / summary.totalProfiles) * 100) },
    { label: 'Open to Work', value: summary.openToWork, pct: Math.round((summary.openToWork / summary.totalProfiles) * 100) },
    { label: 'docrud Go', value: summary.docrudGo, pct: Math.round((summary.docrudGo / summary.totalProfiles) * 100) },
  ] : [];

  return (
    <div className="space-y-6">
      <SectionHeader title="Network & Social Graph" sub="Followers, connections, profile completeness, social activity" />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Profiles', value: summary.totalProfiles, color: 'text-white' },
          { label: 'Profiles Set Up', value: summary.profilesSetup, color: 'text-amber-400' },
          { label: 'Total Follow Relations', value: summary.totalFollowRelations, color: 'text-sky-400' },
          { label: 'Avg Followers/User', value: summary.avgFollowers, color: 'text-indigo-400' },
          { label: 'Open to Work', value: summary.openToWork, color: 'text-emerald-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className={`text-2xl font-bold ${color}`}>{(value || 0).toLocaleString()}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Profile completeness */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-4">Profile Completeness</div>
          <div className="space-y-3">
            {profileCompleteness.map(({ label, value, pct }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs text-zinc-400 w-28 flex-shrink-0">{label}</span>
                <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full ${pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500/70'}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs font-mono text-zinc-400 w-8 text-right">{pct}%</span>
                <span className="text-xs text-zinc-600 w-8 text-right">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Social event types */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-4">Social Activity Types (7d)</div>
          <div className="space-y-2">
            {Object.entries(eventTypes).sort(([, a], [, b]) => b - a).map(([type, count]) => (
              <BarRow key={type} label={type} value={count} max={Math.max(...Object.values(eventTypes), 1)} color="bg-sky-500" />
            ))}
            {Object.keys(eventTypes).length === 0 && <div className="text-xs text-zinc-600">No social events recorded</div>}
          </div>
        </div>
      </div>

      {/* Daily social activity chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-4">Daily Social Activity (14 days)</div>
        <div className="flex items-end gap-1 h-20">
          {dailySocial.map((d, i) => {
            const h = Math.max(2, (d.events / maxDaily) * 72);
            return (
              <div key={i} className="flex-1 group relative">
                <div className="absolute bottom-full mb-1 bg-zinc-800 border border-zinc-700 text-xs text-white px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 z-10 pointer-events-none">
                  {d.date}<br />{d.events} events · {d.follows} follows · {d.likes} likes
                </div>
                <div className="w-full bg-sky-500/60 hover:bg-sky-500 rounded-sm transition-colors" style={{ height: h }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Top users by followers */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800">
          <div className="text-sm font-medium text-white">Top Users by Followers</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-xs text-zinc-500"><th className="text-left px-4 py-3">User</th><th className="text-left px-4 py-3">Followers</th><th className="text-left px-4 py-3">Following</th><th className="text-left px-4 py-3">Flags</th></tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {topByFollowers.map((u, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">{i + 1}</div>
                      <div>
                        <div className="text-zinc-300 font-medium text-sm truncate max-w-[150px]">{u.name || '—'}</div>
                        <div className="text-zinc-600 text-xs truncate max-w-[150px]">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sky-400 font-mono text-sm font-semibold">{u.followers.toLocaleString()}</td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{u.following.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {u.openToWork && <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">Open</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {topByFollowers.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-zinc-600">No follower data yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MARKETPLACE TAB
// ══════════════════════════════════════════════════════════════════════
function MarketplaceTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/super-admin/marketplace-overview?q=${encodeURIComponent(query)}`)
      .then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [query]);

  useEffect(() => { load(); }, [load]);

  async function itemAction(action: string, itemId: string, sellerUserId?: string) {
    if (action === 'delete' && !confirm('Permanently delete this marketplace item?')) return;
    const res = await fetch('/api/super-admin/marketplace-overview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, itemId, sellerUserId }),
    });
    if (res.ok) { setMsg('Done'); load(); setTimeout(() => setMsg(''), 2000); }
    else { const d = await res.json(); setMsg(d.error || 'Failed'); }
  }

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load marketplace" />;

  const summary = data.summary as Record<string, number> || {};
  const categories = data.categories as Record<string, number> || {};
  const topItems = (data.topItems as Record<string, unknown>[]) || [];
  const recentItems = (data.recentItems as Record<string, unknown>[]) || [];

  return (
    <div className="space-y-6">
      <SectionHeader title="Template Marketplace" sub="Manage all marketplace listings, revenue, and seller activity" />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Items', value: summary.total, color: 'text-white' },
          { label: 'Published', value: summary.published, color: 'text-emerald-400' },
          { label: 'Under Review', value: summary.underReview, color: 'text-amber-400' },
          { label: 'Free / Paid', value: `${summary.free} / ${summary.paid}`, color: 'text-sky-400' },
          { label: 'Est. Revenue', value: fmt(summary.totalRevenuePaise || 0), color: 'text-amber-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className={`text-xl font-bold ${color}`}>{value || 0}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Category dist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 lg:col-span-1">
          <div className="text-sm font-medium text-white mb-4">By Category</div>
          <div className="space-y-2">
            {Object.entries(categories).sort(([, a], [, b]) => b - a).slice(0, 10).map(([cat, count]) => (
              <BarRow key={cat} label={cat} value={count} max={Math.max(...Object.values(categories), 1)} color="bg-indigo-500" />
            ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 lg:col-span-2">
          <div className="text-sm font-medium text-white mb-4">Top Items by Purchases</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-zinc-800 text-xs text-zinc-500"><th className="text-left py-2">Title</th><th className="text-left py-2">Seller</th><th className="text-left py-2">Price</th><th className="text-left py-2">Purchases</th><th className="text-left py-2">Status</th><th className="py-2" /></tr></thead>
              <tbody className="divide-y divide-zinc-800/50">
                {topItems.slice(0, 10).map((item, i) => (
                  <tr key={i} className="hover:bg-zinc-800/30">
                    <td className="py-2.5 pr-3 text-zinc-300 font-medium text-xs truncate max-w-[150px]">{String(item.title)}</td>
                    <td className="py-2.5 pr-3 text-zinc-500 text-xs truncate max-w-[100px]">{String(item.sellerName)}</td>
                    <td className="py-2.5 pr-3 text-xs text-amber-400">{Number(item.priceInPaise) > 0 ? fmt(Number(item.priceInPaise)) : 'Free'}</td>
                    <td className="py-2.5 pr-3 text-xs text-sky-400 font-mono">{String(item.purchases)}</td>
                    <td className="py-2.5 pr-3"><span className={badge(String(item.status))}>{String(item.status)}</span></td>
                    <td className="py-2.5">
                      <div className="flex gap-1.5">
                        {String(item.status) !== 'published' && <button onClick={() => itemAction('approve', String(item.id))} className="text-[10px] text-emerald-500 hover:text-emerald-400">Approve</button>}
                        {String(item.status) === 'published' && <button onClick={() => itemAction('unpublish', String(item.id))} className="text-[10px] text-amber-500 hover:text-amber-400">Unpublish</button>}
                        <button onClick={() => itemAction('delete', String(item.id), String(item.sellerUserId || ''))} className="text-[10px] text-red-500 hover:text-red-400">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Search + recent items */}
      <div className="flex gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search items…" className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 min-w-64" />
        {msg && <span className="text-xs text-emerald-400 self-center">{msg}</span>}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 text-sm font-medium text-white">Recent Listings</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-xs text-zinc-500"><th className="text-left px-4 py-3">Title</th><th className="text-left px-4 py-3">Category</th><th className="text-left px-4 py-3">Seller</th><th className="text-left px-4 py-3">Price</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Date</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {recentItems.map((item, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-300 font-medium text-sm truncate max-w-[180px]">{String(item.title)}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{String(item.category || '—')}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs truncate max-w-[110px]">{String(item.sellerName)}</td>
                  <td className="px-4 py-3 text-xs text-amber-400">{Number(item.priceInPaise) > 0 ? fmt(Number(item.priceInPaise)) : 'Free'}</td>
                  <td className="px-4 py-3"><span className={badge(String(item.status))}>{String(item.status)}</span></td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{ago(String(item.createdAt || ''))}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {String(item.status) !== 'published' && <button onClick={() => itemAction('approve', String(item.id))} className="text-xs text-emerald-500 hover:text-emerald-400">Approve</button>}
                      {String(item.status) === 'published' && <button onClick={() => itemAction('unpublish', String(item.id))} className="text-xs text-amber-500 hover:text-amber-400">Unpublish</button>}
                      <button onClick={() => itemAction('delete', String(item.id), String(item.sellerUserId || ''))} className="text-xs text-red-500 hover:text-red-400">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SERVICES TAB
// ══════════════════════════════════════════════════════════════════════
function ServicesTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/super-admin/services-overview').then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  async function removeService(serviceId: string, userId: string, title: string) {
    if (!confirm(`Remove service "${title}"?`)) return;
    const res = await fetch('/api/super-admin/services-overview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove_service', serviceId, userId }),
    });
    if (res.ok) setMsg('Removed');
    else { const d = await res.json(); setMsg(d.error || 'Failed'); }
    setTimeout(() => setMsg(''), 2000);
  }

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load services" />;

  const summary = data.summary as Record<string, number | string> || {};
  const bookingStatuses = data.bookingStatuses as Record<string, number> || {};
  const categories = data.categories as Record<string, number> || {};
  const topServices = (data.topServices as Record<string, unknown>[]) || [];
  const recentBookings = (data.recentBookings as Record<string, unknown>[]) || [];

  return (
    <div className="space-y-6">
      <SectionHeader title="Services Marketplace" sub="Service listings, bookings, and creator economy" />
      {msg && <div className="text-xs text-emerald-400">{msg}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Services', value: summary.totalServices, color: 'text-white' },
          { label: 'Total Bookings', value: summary.totalBookings, color: 'text-sky-400' },
          { label: 'Completed', value: summary.completedBookings, color: 'text-emerald-400' },
          { label: 'Pending', value: summary.pendingBookings, color: Number(summary.pendingBookings) > 0 ? 'text-amber-400' : 'text-zinc-500' },
          { label: 'Revenue (completed)', value: fmt(Number(summary.totalRevenuePaise || 0)), color: 'text-amber-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className={`text-xl font-bold ${color}`}>{value || 0}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-3">Booking Statuses</div>
          <div className="space-y-2">
            {Object.entries(bookingStatuses).map(([st, count]) => (
              <BarRow key={st} label={st} value={count} max={Math.max(...Object.values(bookingStatuses), 1)} color={st === 'completed' ? 'bg-emerald-500' : st === 'pending' ? 'bg-amber-500' : 'bg-zinc-600'} />
            ))}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-3">Service Categories</div>
          <div className="space-y-2">
            {Object.entries(categories).sort(([, a], [, b]) => b - a).slice(0, 8).map(([cat, count]) => (
              <BarRow key={cat} label={cat} value={count} max={Math.max(...Object.values(categories), 1)} color="bg-indigo-500" />
            ))}
          </div>
        </div>
      </div>

      {/* Top services */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 text-sm font-medium text-white">Top Services by Bookings</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-xs text-zinc-500"><th className="text-left px-4 py-3">Title</th><th className="text-left px-4 py-3">Category</th><th className="text-left px-4 py-3">Provider</th><th className="text-left px-4 py-3">Price</th><th className="text-left px-4 py-3">Bookings</th><th className="text-left px-4 py-3">Rating</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {topServices.map((s, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-300 font-medium text-sm truncate max-w-[160px]">{String(s.title)}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{String(s.category || '—')}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs truncate max-w-[110px]">{String(s.providerName)}</td>
                  <td className="px-4 py-3 text-xs text-amber-400">{Number(s.priceInPaise) > 0 ? fmt(Number(s.priceInPaise)) : 'Free'}</td>
                  <td className="px-4 py-3 text-xs text-sky-400 font-mono">{String(s.bookings)}</td>
                  <td className="px-4 py-3 text-xs text-amber-400">{s.rating ? `${String(s.rating)}★` : '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => removeService(String(s.id), String(s.providerEmail), String(s.title))} className="text-xs text-red-500 hover:text-red-400">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent bookings */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 text-sm font-medium text-white">Recent Bookings</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-xs text-zinc-500"><th className="text-left px-4 py-3">Service</th><th className="text-left px-4 py-3">Client</th><th className="text-left px-4 py-3">Provider</th><th className="text-left px-4 py-3">Amount</th><th className="text-left px-4 py-3">Status</th><th className="text-left px-4 py-3">Date</th></tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {recentBookings.map((b, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-300 text-sm truncate max-w-[160px]">{String(b.serviceName)}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs truncate max-w-[110px]">{String(b.clientName)}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs truncate max-w-[110px]">{String(b.providerName)}</td>
                  <td className="px-4 py-3 text-xs text-amber-400">{Number(b.priceInPaise) > 0 ? fmt(Number(b.priceInPaise)) : '—'}</td>
                  <td className="px-4 py-3"><span className={badge(String(b.status))}>{String(b.status)}</span></td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{ago(String(b.createdAt || ''))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// FEEDS & REPORTS TAB — full moderation control for published items
// ══════════════════════════════════════════════════════════════════════

type FeedItemRecord = {
  id: string; shareId?: string; title: string; category: string; tags: string[];
  publisherEmail?: string; publisherName?: string; publisherUserId?: string;
  moderationStatus: 'active' | 'suspended' | 'removed' | 'under_review';
  moderationNote?: string; moderationUpdatedAt?: string; moderationUpdatedBy?: string;
  reportCount: number; pendingReportCount: number;
  reports: { id: string; reason: string; detail?: string; reporterEmail?: string; reporterUserId?: string; createdAt: string; status: string }[];
  createdAt: string; updatedAt: string;
  likesCount: number; trendCount: number; commentsCount: number; viewCount: number; openCount: number;
  featured: boolean;
};

type FeedsModerationData = {
  generatedAt: string;
  stats: { total: number; active: number; suspended: number; removed: number; underReview: number; withReports: number; pendingReports: number; byCategory: Record<string, number> };
  items: FeedItemRecord[];
};

function FeedsTab() {
  const [data, setData]           = useState<FeedsModerationData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState<{ id: string; action: string } | null>(null);
  const [noteText, setNoteText]   = useState('');
  const [acting, setActing]       = useState<string | null>(null);
  const [msg, setMsg]             = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'removed' | 'under_review' | 'reported'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch]       = useState('');

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch('/api/super-admin/feeds')
      .then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function doAction(itemId: string, action: string, note?: string) {
    setActing(itemId); setMsg('');
    try {
      const res = await fetch('/api/super-admin/feeds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, action, note }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Action failed');
      setMsg(`Done — ${action}`);
      load(true);
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally { setActing(null); setNoteModal(null); setNoteText(''); }
  }

  const allItems  = data?.items || [];
  const categories = ['all', ...Array.from(new Set(allItems.map((i) => i.category))).sort()];

  const filtered = allItems.filter((item) => {
    if (statusFilter === 'reported' && item.pendingReportCount === 0) return false;
    if (statusFilter !== 'all' && statusFilter !== 'reported' && item.moderationStatus !== statusFilter) return false;
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!item.title.toLowerCase().includes(s) && !(item.publisherEmail || '').toLowerCase().includes(s) && !(item.publisherName || '').toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
      suspended: 'bg-red-500/15 text-red-400 border-red-500/20',
      removed: 'bg-zinc-700/30 text-zinc-500 border-zinc-600/20',
      under_review: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    };
    return `text-xs px-2 py-0.5 rounded-full border font-medium ${map[s] || 'bg-zinc-700/30 text-zinc-400 border-zinc-600/20'}`;
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Feeds & Content Moderation"
        sub="All published items · reports · suspend · remove · restore"
        action={
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-emerald-400">{msg}</span>}
            <button onClick={() => load(false)} className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1.5 transition-all">↻ Refresh</button>
          </div>
        }
      />

      {/* Stats row */}
      {data && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total',         value: data.stats.total,          color: 'text-white' },
            { label: 'Active',        value: data.stats.active,         color: 'text-emerald-400' },
            { label: 'Suspended',     value: data.stats.suspended,      color: 'text-red-400' },
            { label: 'Removed',       value: data.stats.removed,        color: 'text-zinc-500' },
            { label: 'Under Review',  value: data.stats.underReview,    color: 'text-amber-400' },
            { label: 'With Reports',  value: data.stats.withReports,    color: 'text-orange-400' },
            { label: 'Pending Reports', value: data.stats.pendingReports, color: 'text-red-300' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
              <div className={`text-xl font-bold ${color}`}>{value}</div>
              <div className="text-[10px] text-zinc-600 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, publisher…"
          className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 min-w-56" />
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'reported', 'under_review', 'suspended', 'removed', 'active'] as const).map((f) => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all capitalize ${statusFilter === f ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'}`}>
              {f === 'under_review' ? 'Under Review' : f}
              {f === 'reported' && data && data.stats.pendingReports > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{data.stats.pendingReports}</span>
              )}
            </button>
          ))}
        </div>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-amber-500">
          {categories.map((c) => <option key={c} value={c}>{c === 'all' ? 'All categories' : c}</option>)}
        </select>
        <span className="text-xs text-zinc-600 self-center">{filtered.length} items</span>
      </div>

      {/* Category breakdown */}
      {data && Object.keys(data.stats.byCategory).length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">By Category</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.stats.byCategory).sort(([, a], [, b]) => b - a).map(([cat, count]) => (
              <button key={cat} onClick={() => setCategoryFilter(cat === categoryFilter ? 'all' : cat)}
                className={`text-xs px-3 py-1 rounded-full border transition-all capitalize ${cat === categoryFilter ? 'bg-amber-500/20 border-amber-500/30 text-amber-400' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>
                {cat} <span className="font-mono ml-1">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Items table */}
      {loading ? <Loader /> : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-zinc-600 text-sm">No items match the current filters.</div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {filtered.map((item) => (
                <div key={item.id}>
                  {/* Row */}
                  <button
                    onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                    className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-800/40 transition-colors text-left"
                  >
                    {/* Status dot */}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${item.moderationStatus === 'active' ? 'bg-emerald-500' : item.moderationStatus === 'suspended' ? 'bg-red-500' : item.moderationStatus === 'under_review' ? 'bg-amber-400' : 'bg-zinc-600'}`} />

                    {/* Title + publisher */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-white font-medium truncate max-w-sm">{item.title}</span>
                        <span className="text-[10px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded capitalize">{item.category}</span>
                        {item.featured && <span className="text-[10px] bg-amber-500/15 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded">Featured</span>}
                        <span className={statusBadge(item.moderationStatus)}>{item.moderationStatus.replace('_', ' ')}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px] text-zinc-600 flex-wrap">
                        <span>{item.publisherName || item.publisherEmail || '—'}</span>
                        <span>{ago(item.createdAt)}</span>
                        {item.moderationUpdatedBy && <span>moderated by {item.moderationUpdatedBy}</span>}
                      </div>
                    </div>

                    {/* Report badge + engagement */}
                    <div className="flex items-center gap-4 flex-shrink-0">
                      {item.pendingReportCount > 0 && (
                        <div className="text-center">
                          <div className="text-sm font-mono text-red-400 font-bold">{item.pendingReportCount}</div>
                          <div className="text-[9px] text-zinc-600">reports</div>
                        </div>
                      )}
                      <div className="text-center hidden sm:block">
                        <div className="text-xs font-mono text-zinc-400">{item.likesCount}</div>
                        <div className="text-[9px] text-zinc-700">likes</div>
                      </div>
                      <div className="text-center hidden sm:block">
                        <div className="text-xs font-mono text-zinc-400">{item.viewCount || item.openCount}</div>
                        <div className="text-[9px] text-zinc-700">views</div>
                      </div>
                      <svg className={`w-3.5 h-3.5 text-zinc-600 transition-transform flex-shrink-0 ${expanded === item.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {expanded === item.id && (
                    <div className="px-5 pb-5 pt-2 bg-zinc-800/30 border-t border-zinc-800/50 space-y-4">

                      {/* Engagement + meta grid */}
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 text-center">
                        {[
                          { label: 'Likes',    value: item.likesCount,                 color: 'text-pink-400' },
                          { label: 'Views',    value: item.viewCount || item.openCount, color: 'text-sky-400' },
                          { label: 'Comments', value: item.commentsCount,              color: 'text-indigo-400' },
                          { label: 'Trends',   value: item.trendCount,                 color: 'text-amber-400' },
                          { label: 'Reports',  value: item.reportCount,                color: item.reportCount > 0 ? 'text-red-400' : 'text-zinc-600' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="bg-zinc-900 rounded-lg p-3">
                            <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
                            <div className="text-[9px] text-zinc-600 uppercase tracking-wider mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Publisher + IDs */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        {[
                          ['Publisher', item.publisherName || '—'],
                          ['Publisher Email', item.publisherEmail || '—'],
                          ['Publisher ID', item.publisherUserId?.slice(0, 14) + '…' || '—'],
                          ['Item ID', item.id.slice(0, 14) + '…'],
                          ['Share ID', item.shareId?.slice(0, 14) + '…' || '—'],
                          ['Published', ago(item.createdAt)],
                          ['Category', item.category],
                          ['Status', item.moderationStatus],
                          ['Moderated by', item.moderationUpdatedBy || '—'],
                        ].map(([k, v]) => (
                          <div key={k} className="bg-zinc-900 rounded-lg p-2.5">
                            <div className="text-zinc-600 text-[9px] uppercase tracking-wider">{k}</div>
                            <div className="text-zinc-300 font-mono text-xs mt-0.5 truncate">{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Moderation note */}
                      {item.moderationNote && (
                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-xs">
                          <span className="text-zinc-500 uppercase tracking-wide text-[9px]">Moderation note: </span>
                          <span className="text-zinc-300">{item.moderationNote}</span>
                        </div>
                      )}

                      {/* Tags */}
                      {item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {item.tags.map((t) => (
                            <span key={t} className="text-[10px] bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full">{t}</span>
                          ))}
                        </div>
                      )}

                      {/* Reports list */}
                      {item.reports.length > 0 && (
                        <div>
                          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
                            Reports ({item.reports.length}) · {item.pendingReportCount} pending
                          </div>
                          <div className="space-y-2">
                            {item.reports.map((r) => (
                              <div key={r.id} className="flex items-start gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-xs">
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${r.status === 'pending' ? 'bg-red-500' : 'bg-zinc-600'}`} />
                                <div className="flex-1 min-w-0">
                                  <span className={`font-medium ${r.status === 'pending' ? 'text-red-400' : 'text-zinc-500'}`}>{r.reason}</span>
                                  {r.detail && <p className="text-zinc-600 mt-0.5">{r.detail}</p>}
                                  {r.reporterEmail && <p className="text-zinc-700 mt-0.5">by {r.reporterEmail}</p>}
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <div className="text-zinc-600">{ago(r.createdAt)}</div>
                                  <span className={`text-[9px] uppercase ${r.status === 'pending' ? 'text-red-500' : 'text-zinc-700'}`}>{r.status}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* View on site link */}
                      <div className="flex items-center gap-2">
                        <a href={`/published/${item.shareId || item.id}`} target="_blank" rel="noreferrer"
                          className="text-xs text-sky-400 hover:text-sky-300 transition underline underline-offset-2">
                          View published item ↗
                        </a>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
                        <span className="text-[10px] text-zinc-600 uppercase tracking-wider self-center mr-1">Actions:</span>

                        {item.moderationStatus !== 'under_review' && (
                          <button disabled={acting === item.id} onClick={() => doAction(item.id, 'under_review')}
                            className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg text-xs hover:bg-amber-500/20 transition-all disabled:opacity-50">
                            Mark Under Review
                          </button>
                        )}

                        {item.moderationStatus !== 'suspended' && item.moderationStatus !== 'removed' && (
                          <button disabled={acting === item.id} onClick={() => { setNoteModal({ id: item.id, action: 'suspend' }); setNoteText(''); }}
                            className="px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-lg text-xs hover:bg-orange-500/20 transition-all disabled:opacity-50">
                            🚫 Suspend
                          </button>
                        )}

                        {item.moderationStatus !== 'removed' && (
                          <button disabled={acting === item.id} onClick={() => { setNoteModal({ id: item.id, action: 'remove' }); setNoteText(''); }}
                            className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-all disabled:opacity-50">
                            🗑 Remove
                          </button>
                        )}

                        {(item.moderationStatus === 'suspended' || item.moderationStatus === 'removed' || item.moderationStatus === 'under_review') && (
                          <button disabled={acting === item.id} onClick={() => { setNoteModal({ id: item.id, action: 'restore' }); setNoteText(''); }}
                            className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/20 transition-all disabled:opacity-50">
                            ✓ Restore
                          </button>
                        )}

                        {item.pendingReportCount > 0 && (
                          <button disabled={acting === item.id} onClick={() => doAction(item.id, 'dismiss_reports')}
                            className="px-3 py-1.5 bg-zinc-700/50 border border-zinc-600/20 text-zinc-400 rounded-lg text-xs hover:bg-zinc-700 transition-all disabled:opacity-50">
                            Dismiss Reports
                          </button>
                        )}

                        {acting === item.id && (
                          <span className="self-center text-xs text-zinc-500 flex items-center gap-1.5">
                            <span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                            Working…
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Note modal for suspend/remove/restore (adds reason + email) */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setNoteModal(null)}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white capitalize">
                {noteModal.action === 'suspend' ? '🚫 Suspend' : noteModal.action === 'remove' ? '🗑 Remove' : '✓ Restore'} Item
              </h3>
              <button onClick={() => setNoteModal(null)} className="text-zinc-600 hover:text-zinc-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="text-xs text-zinc-500 bg-zinc-900 rounded-lg px-3 py-2 font-mono truncate">
              {filtered.find((i) => i.id === noteModal.id)?.title}
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">
                {noteModal.action === 'restore' ? 'Reinstatement note (optional)' : 'Reason / note (sent to publisher via email)'}
              </label>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
                placeholder={noteModal.action === 'suspend' ? 'e.g. This item violates our misinformation policy…' : noteModal.action === 'remove' ? 'e.g. Removed due to repeated policy violations…' : 'e.g. Appeal reviewed — item reinstated.'}
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 resize-none"
              />
              <p className="text-[10px] text-zinc-600 mt-1">
                {noteModal.action !== 'restore' ? 'The publisher will receive an email notification with this note.' : 'The publisher will receive a reinstatement notification.'}
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setNoteModal(null)} className="px-4 py-2 text-xs text-zinc-500 border border-zinc-700 rounded-lg hover:text-zinc-300 transition-all">Cancel</button>
              <button
                disabled={acting === noteModal.id}
                onClick={() => doAction(noteModal.id, noteModal.action, noteText || undefined)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 ${noteModal.action === 'restore' ? 'bg-emerald-500 text-white hover:bg-emerald-400' : noteModal.action === 'suspend' ? 'bg-orange-500/80 text-white hover:bg-orange-500' : 'bg-red-600/80 text-white hover:bg-red-600'}`}
              >
                {acting === noteModal.id ? 'Working…' : `Confirm ${noteModal.action}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// REFERRALS TAB
// ══════════════════════════════════════════════════════════════════════
function ReferralsTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/super-admin/referrals-overview').then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load referrals" />;

  const summary = data.summary as Record<string, number> || {};
  const topReferrers = (data.topReferrers as { userId: string; name: string; email: string; invites: number; activations: number; redemptions: number }[]) || [];
  const dailyInvites = (data.dailyInvites as { date: string; invites: number; signups: number }[]) || [];
  const recentRedemptions = (data.recentRedemptions as Record<string, unknown>[]) || [];
  const maxDaily = Math.max(...dailyInvites.map((d) => d.invites), 1);

  return (
    <div className="space-y-6">
      <SectionHeader title="Referral Program" sub="Invite funnel, conversions, top referrers, bonuses granted" />

      {/* Funnel KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { label: 'Total Invites Sent', value: summary.totalInvites, color: 'text-white' },
          { label: 'Signed Up', value: summary.totalSignedUp, color: 'text-sky-400' },
          { label: 'Conversion Rate', value: `${summary.conversionRate || 0}%`, color: summary.conversionRate >= 20 ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'Activations', value: summary.totalActivations, color: 'text-indigo-400' },
          { label: 'Bonuses Granted', value: summary.bonusesGranted, color: 'text-amber-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className={`text-xl font-bold ${color}`}>{value || 0}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Funnel visualization */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-5">Referral Funnel</div>
        <div className="space-y-3">
          {[
            { label: 'Invites Sent', value: summary.totalInvites, color: 'bg-zinc-700', width: 100 },
            { label: 'Signed Up', value: summary.totalSignedUp, color: 'bg-sky-500', width: summary.totalInvites > 0 ? (summary.totalSignedUp / summary.totalInvites) * 100 : 0 },
            { label: 'Activated', value: summary.totalActivations, color: 'bg-indigo-500', width: summary.totalInvites > 0 ? (summary.totalActivations / summary.totalInvites) * 100 : 0 },
            { label: 'Redeemed Bonus', value: summary.bonusesGranted, color: 'bg-amber-500', width: summary.totalInvites > 0 ? (summary.bonusesGranted / summary.totalInvites) * 100 : 0 },
          ].map(({ label, value, color, width }) => (
            <div key={label} className="flex items-center gap-4">
              <span className="text-xs text-zinc-400 w-28 flex-shrink-0">{label}</span>
              <div className="flex-1 bg-zinc-800 rounded-full h-3 overflow-hidden">
                <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(100, width)}%` }} />
              </div>
              <span className="text-xs font-mono text-zinc-300 w-8 text-right">{value || 0}</span>
              <span className="text-xs text-zinc-600 w-10 text-right">{Math.round(width)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Daily invites chart */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="text-sm font-medium text-white mb-4">Daily Invites & Signups (30 days)</div>
        <div className="flex items-end gap-1 h-20">
          {dailyInvites.map((d, i) => {
            const h = Math.max(2, (d.invites / maxDaily) * 72);
            const sh = Math.max(1, (d.signups / maxDaily) * 72);
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                <div className="absolute bottom-full mb-1 bg-zinc-800 border border-zinc-700 text-xs text-white px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 z-10 pointer-events-none">
                  {d.date}<br />{d.invites} invites · {d.signups} signups
                </div>
                <div className="w-full rounded-t-sm bg-zinc-700/50" style={{ height: h }}>
                  <div className="w-full rounded-t-sm bg-sky-500/80" style={{ height: sh }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 mt-2 text-xs text-zinc-600">
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-zinc-700" />Invites</span>
          <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-sky-500" />Signups</span>
        </div>
      </div>

      {/* Top referrers */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-800 text-sm font-medium text-white">Top Referrers</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-zinc-800 text-xs text-zinc-500"><th className="text-left px-4 py-3">User</th><th className="text-left px-4 py-3">Invites</th><th className="text-left px-4 py-3">Activations</th><th className="text-left px-4 py-3">Bonuses</th><th className="text-left px-4 py-3">Conv %</th></tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {topReferrers.map((u, i) => (
                <tr key={i} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-500">{i + 1}</div>
                      <div>
                        <div className="text-zinc-300 text-sm truncate max-w-[130px]">{u.name || '—'}</div>
                        <div className="text-zinc-600 text-xs truncate max-w-[130px]">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 font-mono text-xs">{u.invites}</td>
                  <td className="px-4 py-3 text-sky-400 font-mono text-xs">{u.activations}</td>
                  <td className="px-4 py-3 text-amber-400 font-mono text-xs">{u.redemptions}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400">{u.invites > 0 ? `${Math.round((u.activations / u.invites) * 100)}%` : '—'}</td>
                </tr>
              ))}
              {topReferrers.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-zinc-600">No referral data yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent redemptions */}
      {recentRedemptions.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-sm font-medium text-white mb-4">Recent Bonus Redemptions</div>
          <div className="space-y-2">
            {recentRedemptions.map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-xs bg-zinc-800 rounded-lg px-4 py-2.5">
                <span className="text-zinc-300 truncate">{String(r.referrerName)}</span>
                <span className="text-zinc-600">referred</span>
                <span className="text-sky-400 truncate">{String(r.refereeName)}</span>
                {Boolean(r.bonusGranted) && <span className="ml-auto text-emerald-400">✓ Bonus granted</span>}
                <span className="text-zinc-600">{ago(String(r.createdAt || ''))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
// ══════════════════════════════════════════════════════════════════════
// LIVE SESSIONS TAB — rich behaviour tracking
// ══════════════════════════════════════════════════════════════════════
interface LiveSession {
  sessionId: string;
  visitorId?: string;
  userId?: string;
  userRole?: string;
  userEmail?: string;
  userName?: string;
  organizationName?: string;
  accountType?: string;
  planId?: string;
  status: 'online' | 'idle' | 'away';
  ageLabel: string;
  ageMs: number;
  sessionDurationLabel: string;
  focusDurationLabel: string;
  focusDurationMs: number;
  ip?: string;
  userAgent?: string;
  device?: string;
  browser?: string;
  os?: string;
  firstSeenAt: string;
  lastPingAt: string;
  lastInteractionAt?: string;
  surface?: string;
  path: string;
  pathHistory?: string[];
  pageViews: number;
  clickCount: number;
  keystrokeCount: number;
  scrollEventCount: number;
  idleMs: number;
  connectionType?: string;
  engagementScore: number;
  navigatorOnline: boolean;
  tabVisible: boolean;
}

interface LiveSessionsData {
  generatedAt: string;
  total: number;
  online: number;
  idle: number;
  away: number;
  authenticated: number;
  anonymous: number;
  byRole: Record<string, number>;
  byDevice: Record<string, number>;
  bySurface: Record<string, number>;
  hotPaths: { path: string; count: number }[];
  engagement: { high: number; mid: number; low: number };
  sessions: LiveSession[];
}

function EngagementBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-400' : 'bg-zinc-600';
  const label = score >= 70 ? 'High' : score >= 40 ? 'Mid' : 'Low';
  const labelColor = score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-amber-400' : 'text-zinc-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-zinc-800 rounded-full h-1.5 overflow-hidden flex-shrink-0">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-[10px] font-medium ${labelColor}`}>{label} {score}</span>
    </div>
  );
}

function IdleIndicator({ idleMs }: { idleMs: number }) {
  if (idleMs < 30_000) return <span className="text-[10px] text-emerald-400">Active now</span>;
  if (idleMs < 60_000) return <span className="text-[10px] text-amber-400">~{Math.round(idleMs / 1000)}s idle</span>;
  if (idleMs < 180_000) return <span className="text-[10px] text-amber-500">{Math.round(idleMs / 60000)}m idle</span>;
  return <span className="text-[10px] text-zinc-600">{Math.round(idleMs / 60000)}m idle</span>;
}

function ConnectionBadge({ type }: { type?: string }) {
  if (!type) return null;
  const map: Record<string, string> = {
    wifi: 'bg-sky-500/10 text-sky-400',
    '4g': 'bg-emerald-500/10 text-emerald-400',
    '3g': 'bg-amber-500/10 text-amber-400',
    '2g': 'bg-red-500/10 text-red-400',
    'slow-2g': 'bg-red-600/10 text-red-500',
    offline: 'bg-zinc-700/30 text-zinc-600',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${map[type] || 'bg-zinc-800 text-zinc-500'}`}>{type}</span>
  );
}

function LiveSessionsTab() {
  const [data, setData] = useState<LiveSessionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(15);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'idle' | 'away'>('all');

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    fetch('/api/super-admin/live-sessions')
      .then((r) => r.json())
      .then((d) => { setData(d); setCountdown(15); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refresh  = setInterval(() => load(true), 15_000);
    const tick     = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 15)), 1000);
    return () => { clearInterval(refresh); clearInterval(tick); };
  }, [load]);

  const allSessions = data?.sessions || [];
  const sessions    = statusFilter === 'all' ? allSessions : allSessions.filter((s) => s.status === statusFilter);
  const generatedAt = data?.generatedAt
    ? new Date(data.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '—';

  const statusDotCls = (s: 'online' | 'idle' | 'away') =>
    ({ online: 'bg-emerald-500 animate-pulse', idle: 'bg-amber-400', away: 'bg-zinc-600' }[s]);
  const statusBadgeCls = (s: 'online' | 'idle' | 'away') =>
    ({ online: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20', idle: 'bg-amber-500/15 text-amber-400 border-amber-500/20', away: 'bg-zinc-700/30 text-zinc-500 border-zinc-600/20' }[s]);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Live Sessions"
        sub="Heartbeat every 20 s · tab-close detected via sendBeacon · accurate within 25 s"
        action={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs text-emerald-400 font-semibold">{data?.online ?? '…'} online</span>
            </div>
            <button onClick={() => load(false)} className="text-xs text-zinc-500 hover:text-zinc-300 border border-zinc-700 rounded-lg px-3 py-1.5 transition-all">↻ Refresh</button>
            <span className="text-xs text-zinc-700 font-mono tabular-nums">{countdown}s</span>
          </div>
        }
      />

      {/* Top KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Sessions',  value: data?.total         ?? '…', color: 'text-white',       bg: 'bg-zinc-900' },
          { label: 'Online',          value: data?.online        ?? '…', color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/20' },
          { label: 'Idle',            value: data?.idle          ?? '…', color: 'text-amber-400',   bg: 'bg-amber-500/5 border-amber-500/20' },
          { label: 'Away',            value: data?.away          ?? '…', color: 'text-zinc-500',    bg: 'bg-zinc-900' },
          { label: 'Authenticated',   value: data?.authenticated ?? '…', color: 'text-sky-400',     bg: 'bg-zinc-900' },
          { label: 'Anonymous',       value: data?.anonymous     ?? '…', color: 'text-zinc-400',    bg: 'bg-zinc-900' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={`border border-zinc-800 rounded-xl p-4 ${bg}`}>
            <div className={`text-xl font-bold ${color}`}>{value}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Engagement + Role + Device + Hot Pages */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Engagement */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Engagement</div>
          <div className="space-y-2">
            {[
              { label: 'High (70-100)', value: data?.engagement?.high ?? 0, color: 'bg-emerald-500', textColor: 'text-emerald-400' },
              { label: 'Mid (30-69)',   value: data?.engagement?.mid  ?? 0, color: 'bg-amber-400',   textColor: 'text-amber-400' },
              { label: 'Low (0-29)',    value: data?.engagement?.low  ?? 0, color: 'bg-zinc-600',    textColor: 'text-zinc-500' },
            ].map(({ label, value, color, textColor }) => {
              const total = (data?.total || 1);
              return (
                <div key={label} className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-500 w-24 flex-shrink-0">{label}</span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full ${color} rounded-full`} style={{ width: `${(value / total) * 100}%` }} />
                  </div>
                  <span className={`w-6 text-right font-mono ${textColor}`}>{value}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* By Role */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">By Role</div>
          <div className="space-y-1.5">
            {Object.entries(data?.byRole || {}).sort(([, a], [, b]) => b - a).map(([role, count]) => (
              <BarRow key={role} label={role} value={count} max={Math.max(...Object.values(data?.byRole || { x: 1 }), 1)} color="bg-amber-500" />
            ))}
            {!Object.keys(data?.byRole || {}).length && <div className="text-xs text-zinc-700">No authenticated sessions</div>}
          </div>
        </div>

        {/* By Device */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">By Device</div>
          <div className="space-y-1.5">
            {Object.entries(data?.byDevice || {}).sort(([, a], [, b]) => b - a).map(([device, count]) => (
              <BarRow key={device} label={device} value={count} max={Math.max(...Object.values(data?.byDevice || { x: 1 }), 1)} color={device === 'mobile' ? 'bg-sky-500' : device === 'desktop' ? 'bg-indigo-500' : 'bg-zinc-600'} />
            ))}
          </div>
        </div>

        {/* Hot Pages */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide mb-3">Hot Pages Right Now</div>
          <div className="space-y-1.5">
            {(data?.hotPaths || []).slice(0, 8).map(({ path, count }) => (
              <div key={path} className="flex items-center gap-2 text-xs">
                <span className="text-zinc-400 flex-1 truncate font-mono">{path}</span>
                <span className="bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-mono text-[10px]">{count}</span>
              </div>
            ))}
            {!(data?.hotPaths?.length) && <div className="text-xs text-zinc-700">No page data yet</div>}
          </div>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-zinc-600">Filter:</span>
        {(['all', 'online', 'idle', 'away'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all capitalize ${
              statusFilter === f ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {f} {f !== 'all' && data ? `(${data[f as 'online' | 'idle' | 'away']})` : ''}
          </button>
        ))}
        <span className="text-xs text-zinc-700 ml-auto">{sessions.length} sessions shown</span>
      </div>

      {/* Sessions table */}
      {loading ? <Loader /> : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          {sessions.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <div className="text-zinc-500 text-sm">No {statusFilter !== 'all' ? statusFilter + ' ' : ''}sessions</div>
              <div className="text-zinc-700 text-xs">Sessions appear here as users visit the platform.</div>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/50">
              {sessions.map((s) => (
                <div key={s.sessionId}>
                  {/* Row */}
                  <button
                    onClick={() => setExpanded(expanded === s.sessionId ? null : s.sessionId)}
                    className="w-full flex items-center gap-4 px-5 py-3 hover:bg-zinc-800/40 transition-colors text-left"
                  >
                    {/* Avatar + status dot */}
                    <div className="relative flex-shrink-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${s.userId ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-500'}`}>
                        {s.userName ? s.userName[0].toUpperCase() : s.userId ? '?' : '👤'}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-900 ${statusDotCls(s.status)}`} />
                    </div>

                    {/* Identity + path */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-white font-medium truncate">{s.userName || s.userEmail || 'Anonymous'}</span>
                        {s.organizationName && <span className="text-xs text-zinc-500 truncate">{s.organizationName}</span>}
                        {s.userRole && <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full">{s.userRole}</span>}
                        {s.accountType && <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full">{s.accountType}</span>}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusBadgeCls(s.status)}`}>{s.status}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-zinc-500 font-mono">{s.path}</span>
                        {s.device && <span className="text-[10px] text-zinc-700 capitalize">{s.device}</span>}
                        {s.browser && <span className="text-[10px] text-zinc-700">{s.browser}</span>}
                        {s.os && <span className="text-[10px] text-zinc-700">{s.os}</span>}
                        <ConnectionBadge type={s.connectionType} />
                      </div>
                    </div>

                    {/* Engagement + idle + stats */}
                    <div className="flex items-center gap-5 flex-shrink-0">
                      <div className="hidden lg:block">
                        <EngagementBar score={s.engagementScore} />
                        <IdleIndicator idleMs={s.idleMs} />
                      </div>
                      <div className="text-center hidden sm:block">
                        <div className="text-sm font-mono text-sky-400">{s.pageViews}</div>
                        <div className="text-[10px] text-zinc-600">pages</div>
                      </div>
                      <div className="text-center hidden md:block">
                        <div className="text-sm font-mono text-purple-400">{s.clickCount}</div>
                        <div className="text-[10px] text-zinc-600">clicks</div>
                      </div>
                      <div className="text-center hidden md:block">
                        <div className="text-sm font-mono text-indigo-400">{s.keystrokeCount}</div>
                        <div className="text-[10px] text-zinc-600">keys</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-zinc-400">{s.ageLabel}</div>
                        <div className="text-[10px] text-zinc-600 font-mono">{s.sessionDurationLabel}</div>
                      </div>
                      <svg className={`w-3.5 h-3.5 text-zinc-600 transition-transform flex-shrink-0 ${expanded === s.sessionId ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {expanded === s.sessionId && (
                    <div className="px-5 pb-5 pt-2 bg-zinc-800/30 border-t border-zinc-800/50 space-y-4">

                      {/* Behaviour stats row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                        {[
                          { label: 'Engagement',      value: `${s.engagementScore}/100`,       color: s.engagementScore >= 70 ? 'text-emerald-400' : s.engagementScore >= 40 ? 'text-amber-400' : 'text-zinc-500' },
                          { label: 'Focus Time',       value: s.focusDurationLabel,             color: 'text-sky-400' },
                          { label: 'Clicks',           value: String(s.clickCount),             color: 'text-purple-400' },
                          { label: 'Keystrokes',       value: String(s.keystrokeCount),         color: 'text-indigo-400' },
                          { label: 'Scroll Events',    value: String(s.scrollEventCount),       color: 'text-cyan-400' },
                          { label: 'Idle Time',        value: s.idleMs < 60000 ? `${Math.round(s.idleMs / 1000)}s` : `${Math.round(s.idleMs / 60000)}m`, color: s.idleMs > 180000 ? 'text-zinc-600' : s.idleMs > 60000 ? 'text-amber-400' : 'text-emerald-400' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="bg-zinc-900 rounded-lg p-2.5 text-center">
                            <div className={`text-base font-bold font-mono ${color}`}>{value}</div>
                            <div className="text-zinc-600 text-[9px] uppercase tracking-wider mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Technical details */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {[
                          ['Session ID',     s.sessionId.slice(0, 14) + '…'],
                          ['User ID',        s.userId ? s.userId.slice(0, 14) + '…' : '—'],
                          ['Plan',           s.planId || '—'],
                          ['IP Address',     s.ip || '—'],
                          ['Connection',     s.connectionType || '—'],
                          ['Browser',        s.browser || '—'],
                          ['OS',             s.os || '—'],
                          ['Device',         s.device || '—'],
                          ['Tab Visible',    s.tabVisible ? 'Yes' : 'No'],
                          ['Network Online', s.navigatorOnline ? 'Yes' : 'No'],
                          ['First Seen',     ago(s.firstSeenAt)],
                          ['Last Ping',      s.ageLabel],
                          ['Session Length', s.sessionDurationLabel],
                          ['Focus Duration', s.focusDurationLabel],
                          ['Surface',        s.surface || '—'],
                        ].map(([k, v]) => (
                          <div key={k} className="bg-zinc-900 rounded-lg p-2.5">
                            <div className="text-zinc-600 text-[9px] uppercase tracking-wider">{k}</div>
                            <div className="text-zinc-300 font-mono text-xs mt-0.5 truncate">{v}</div>
                          </div>
                        ))}
                      </div>

                      {/* Page history */}
                      {(s.pathHistory || []).length > 0 && (
                        <div>
                          <div className="text-xs text-zinc-600 mb-2">Page history (most recent first)</div>
                          <div className="flex flex-wrap gap-1.5">
                            {(s.pathHistory || []).map((p, i) => (
                              <span key={i} className={`text-[10px] font-mono px-2 py-1 rounded ${i === 0 ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' : 'bg-zinc-800 text-zinc-500'}`}>
                                {i === 0 && '▶ '}{p}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* UA string */}
                      {s.userAgent && (
                        <div className="text-[10px] font-mono text-zinc-700 truncate bg-zinc-900 rounded px-3 py-2">{s.userAgent}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-center text-xs text-zinc-700 font-mono">
        Auto-refresh every 15 s · fetched at {generatedAt} · {allSessions.length} total sessions
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════
// FILE TRANSFERS TAB
// ══════════════════════════════════════════════════════════════════════
function FileTransfersTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/super-admin/file-transfers?query=${encodeURIComponent(query)}&limit=200`)
      .then((r) => r.json()).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [query]);

  useEffect(() => { load(); }, [load]);

  async function deleteTransfer(id: string, fileName: string) {
    if (!confirm(`Delete file transfer "${fileName}"? This cannot be undone.`)) return;
    const res = await fetch('/api/super-admin/file-transfers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', transferId: id }),
    });
    if (res.ok) { setMsg('Deleted'); load(); setTimeout(() => setMsg(''), 2000); }
    else { const d = await res.json(); setMsg(d.error || 'Failed'); }
  }

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load file transfers" />;

  const transfers = (data.transfers as Record<string, unknown>[]) || [];
  const authModes = data.authModes as Record<string, number> || {};
  const statuses = data.statuses as Record<string, number> || {};

  return (
    <div className="space-y-5">
      <SectionHeader title="File Transfers" sub={`${data.total as number} total transfers · ${transfers.length} shown`} />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 mb-2">Auth Modes</div>
          <div className="space-y-1">
            {Object.entries(authModes).sort(([, a], [, b]) => b - a).map(([mode, count]) => (
              <BarRow key={mode} label={mode} value={count} max={Math.max(...Object.values(authModes), 1)} color="bg-amber-500" />
            ))}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="text-xs text-zinc-500 mb-2">Statuses</div>
          <div className="space-y-1">
            {Object.entries(statuses).sort(([, a], [, b]) => b - a).map(([st, count]) => (
              <BarRow key={st} label={st} value={count} max={Math.max(...Object.values(statuses), 1)} color={st === 'active' ? 'bg-emerald-500' : 'bg-zinc-600'} />
            ))}
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{data.total as number}</div>
          <div className="text-xs text-zinc-500 mt-1">Total Transfers</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-amber-400">{statuses['active'] || 0}</div>
          <div className="text-xs text-zinc-500 mt-1">Active</div>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3 flex-wrap">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by file name, uploader, recipient…" className="bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-500 min-w-72" />
        {msg && <span className="text-xs text-emerald-400 self-center">{msg}</span>}
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-xs text-zinc-500">
                <th className="text-left px-4 py-3">File</th>
                <th className="text-left px-4 py-3">Uploaded By</th>
                <th className="text-left px-4 py-3">Recipient</th>
                <th className="text-left px-4 py-3">Auth Mode</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Downloads</th>
                <th className="text-left px-4 py-3">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {loading && <tr><td colSpan={8} className="text-center py-8 text-zinc-600">Loading…</td></tr>}
              {!loading && transfers.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-zinc-600">No file transfers found</td></tr>}
              {transfers.map((t, i) => (
                <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-zinc-300 font-medium text-sm truncate max-w-[160px]">{String(t.fileName || '—')}</div>
                    <div className="text-zinc-600 text-xs">{String(t.mimeType || '')}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400 truncate max-w-[120px]">{String(t.uploadedBy || '—')}</td>
                  <td className="px-4 py-3 text-xs text-zinc-400 truncate max-w-[120px]">{String(t.recipientEmail || '—')}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full font-mono">{String(t.authMode || '—')}</span>
                  </td>
                  <td className="px-4 py-3"><span className={badge(String(t.status || 'active'))}>{String(t.status || 'active')}</span></td>
                  <td className="px-4 py-3 text-xs text-sky-400 font-mono">{String(t.downloadCount || 0)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{ago(String(t.createdAt || ''))}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => deleteTransfer(String(t.id), String(t.fileName))} className="text-xs text-red-500 hover:text-red-400 transition-colors">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// VERIFICATIONS TAB
// ══════════════════════════════════════════════════════════════════════
interface VerifRow {
  id: string; businessPageId: string; pageName?: string; ownerUserId: string;
  status: 'pending' | 'approved' | 'rejected';
  legalName: string; businessType: string; registrationNumber: string;
  gstin?: string; pan: string; registeredAddress: string;
  city: string; state: string; pincode: string; country: string;
  website?: string; contactName: string; contactEmail: string; contactPhone: string;
  yearsInBusiness?: string; employeeCount?: string; annualRevenue?: string; businessCategory?: string;
  adminNotes?: string; reviewedBy?: string; reviewedAt?: string;
  submittedAt: string; updatedAt: string;
}

function VerificationsTab() {
  const [list,    setList]    = useState<VerifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notes,   setNotes]   = useState('');
  const [acting,  setActing]  = useState(false);
  const [error,   setError]   = useState('');

  const load = useCallback(async (f: typeof filter) => {
    setLoading(true);
    try {
      const url = f === 'all' ? '/api/super-admin/business-verifications' : `/api/super-admin/business-verifications?status=${f}`;
      const res = await fetch(url);
      const data = await res.json() as { verifications?: VerifRow[] };
      setList(data.verifications ?? []);
    } catch { setError('Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(filter); }, [filter, load]);

  async function review(id: string, status: 'approved' | 'rejected') {
    if (status === 'rejected' && !notes.trim()) { setError('Admin notes required for rejection'); return; }
    setActing(true); setError('');
    try {
      const res = await fetch('/api/super-admin/business-verifications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, adminNotes: notes }),
      });
      if (res.ok) { setExpanded(null); setNotes(''); void load(filter); }
      else { const d = await res.json() as { error?: string }; setError(d.error ?? 'Failed'); }
    } catch { setError('Failed'); }
    finally { setActing(false); }
  }

  const statusBadge = (s: string) => {
    if (s === 'approved') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20';
    if (s === 'rejected') return 'bg-red-500/15 text-red-400 border-red-500/20';
    return 'bg-amber-500/15 text-amber-400 border-amber-500/20';
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  const expandedRow = list.find(r => r.id === expanded);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Business Verifications</h2>
          <p className="text-xs text-zinc-500 mt-0.5">Review and approve business verification requests</p>
        </div>
        <div className="flex gap-1.5">
          {(['all','pending','approved','rejected'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${filter === f ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'text-zinc-500 hover:text-zinc-300 border border-zinc-800 bg-zinc-900'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="text-center py-12 text-zinc-600 text-sm">Loading…</div>
      ) : list.length === 0 ? (
        <div className="text-center py-12 text-zinc-600 text-sm">No verification requests</div>
      ) : (
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900">
              <tr>
                {['Business', 'Legal Name', 'Type', 'PAN', 'Submitted', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((row, i) => (
                <tr key={row.id} className={`border-t border-zinc-800/60 ${i % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/30'}`}>
                  <td className="px-4 py-3 text-zinc-200 font-medium max-w-[140px] truncate">{row.pageName ?? row.businessPageId.slice(0,8)}</td>
                  <td className="px-4 py-3 text-zinc-300 max-w-[140px] truncate">{row.legalName}</td>
                  <td className="px-4 py-3 text-zinc-400 text-xs">{row.businessType.replace('_', ' ').toUpperCase()}</td>
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{row.pan}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">{fmtDate(row.submittedAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${statusBadge(row.status)}`}>{row.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                      className="text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-2.5 py-1 transition">
                      {expanded === row.id ? 'Close' : 'Review'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Expanded detail panel */}
      {expandedRow && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 space-y-5 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-white">{expandedRow.legalName}</h3>
            <span className={`text-xs px-2.5 py-1 rounded-full border font-semibold capitalize ${statusBadge(expandedRow.status)}`}>{expandedRow.status}</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            {([
              ['Business Page', expandedRow.pageName ?? expandedRow.businessPageId],
              ['Legal Name', expandedRow.legalName],
              ['Business Type', expandedRow.businessType.replace(/_/g, ' ')],
              ['Registration No.', expandedRow.registrationNumber],
              ['PAN', expandedRow.pan],
              ['GSTIN', expandedRow.gstin ?? '—'],
              ['Address', expandedRow.registeredAddress],
              ['City', expandedRow.city],
              ['State', expandedRow.state],
              ['Pincode', expandedRow.pincode],
              ['Country', expandedRow.country],
              ['Website', expandedRow.website ?? '—'],
              ['Contact Name', expandedRow.contactName],
              ['Contact Email', expandedRow.contactEmail],
              ['Contact Phone', expandedRow.contactPhone],
              ['Years in Business', expandedRow.yearsInBusiness ?? '—'],
              ['Employee Count', expandedRow.employeeCount ?? '—'],
              ['Annual Revenue', expandedRow.annualRevenue ?? '—'],
              ['Category', expandedRow.businessCategory ?? '—'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="bg-zinc-800/50 rounded-lg px-3 py-2.5">
                <p className="text-[9px] uppercase tracking-widest text-zinc-500 mb-0.5">{k}</p>
                <p className="text-zinc-200 font-medium truncate">{v}</p>
              </div>
            ))}
          </div>

          {expandedRow.adminNotes && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Previous Admin Notes</p>
              <p className="text-sm text-zinc-300">{expandedRow.adminNotes}</p>
            </div>
          )}

          {expandedRow.status !== 'approved' && (
            <div className="space-y-3 border-t border-zinc-700 pt-4">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
                  Admin Notes {expandedRow.status === 'pending' ? '(required for rejection)' : ''}
                </label>
                <textarea
                  value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-amber-500/40 resize-none"
                  placeholder="Add notes for the business owner…"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => void review(expandedRow.id, 'approved')} disabled={acting}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 transition disabled:opacity-50">
                  {acting ? '…' : '✓ Approve'}
                </button>
                <button onClick={() => void review(expandedRow.id, 'rejected')} disabled={acting}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition disabled:opacity-50">
                  {acting ? '…' : '✗ Reject'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Infinity Tab ───────────────────────────────────────────────────────
interface InfinitySubscriber { userId: string; purchasedAt?: string; grantedFree: boolean; }

function InfinityTab() {
  const [data, setData] = useState<FullDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribers, setSubscribers] = useState<InfinitySubscriber[]>([]);
  const [subLoading, setSubLoading] = useState(true);
  const [grantUserId, setGrantUserId] = useState('');
  const [acting, setActing] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const loadData = useCallback(async () => {
    const [dash, subs] = await Promise.all([
      fetch('/api/super-admin/dashboard').then((r) => r.json()).catch(() => null),
      fetch('/api/super-admin/infinity').then((r) => r.json()).catch(() => ({ subscribers: [] })),
    ]);
    if (dash) setData(dash as FullDashboardData);
    setSubscribers((subs?.subscribers ?? []) as InfinitySubscriber[]);
    setLoading(false);
    setSubLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleAction(userId: string, action: 'grant' | 'revoke') {
    setActing(true); setActionMsg('');
    try {
      const res = await fetch('/api/super-admin/infinity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action }),
      });
      const d = await res.json();
      if (!res.ok) { setActionMsg(d.error || 'Action failed'); return; }
      setActionMsg(`✓ ${action === 'grant' ? 'Granted' : 'Revoked'} for ${userId}`);
      setGrantUserId('');
      await loadData();
    } finally { setActing(false); }
  }

  if (loading) return <Loader />;
  if (!data) return <ErrorState msg="Failed to load Infinity data" />;

  const inf = data.infinity;
  if (!inf) return <ErrorState msg="Infinity data not available" />;

  const fmtRev = (p: number) => `₹${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-6">
      <SectionHeader title="Docrud Infinity ∞" sub="Premium subscription insights — subscribers, revenue, grants, and conversion" />

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Subscribers" value={inf.total} sub={`${inf.conversionRate}% of all users`} accent
          icon={<svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 12c-2-2.5-4-4-6-4a4 4 0 000 8c2 0 4-1.5 6-4zm0 0c2 2.5 4 4 6 4a4 4 0 000-8c-2 0-4 1.5-6 4z"/></svg>} />
        <StatCard label="Paid Subscribers" value={inf.paid}
          icon={<svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
        <StatCard label="New This Week" value={inf.newLast7Days} sub={`${inf.newLast30Days} last 30 days`}
          icon={<svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>} />
        <StatCard label="Free Grants" value={inf.free} sub="Admin-granted activations"
          icon={<svg className="w-4 h-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4H5z"/></svg>} />
      </div>

      {/* Revenue row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Total Infinity Revenue</div>
          <div className="text-3xl font-bold text-white">{fmtRev(inf.revenueTotalPaise)}</div>
          <div className="text-xs text-zinc-500 mt-1">All time · incl. GST</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Revenue — Last 30 Days</div>
          <div className="text-3xl font-bold text-white">{fmtRev(inf.revenueLast30DaysPaise)}</div>
          <div className="text-xs text-zinc-500 mt-1">Infinity product type · paid transactions</div>
        </div>
      </div>

      {/* Grant / Revoke controls */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <SectionHeader title="Admin Controls" sub="Manually grant or revoke Infinity for a user ID" />
        <div className="flex gap-3 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs text-zinc-500 mb-1 block">User ID</label>
            <input
              value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)}
              placeholder="usr_xxxxxxxx"
              className="w-full h-9 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white px-3 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50"
            />
          </div>
          <button onClick={() => handleAction(grantUserId.trim(), 'grant')} disabled={!grantUserId.trim() || acting}
            className="h-9 px-4 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-500 transition disabled:opacity-50">
            {acting ? '…' : '✓ Grant'}
          </button>
          <button onClick={() => handleAction(grantUserId.trim(), 'revoke')} disabled={!grantUserId.trim() || acting}
            className="h-9 px-4 rounded-lg bg-red-600/20 text-red-400 border border-red-500/20 text-xs font-bold hover:bg-red-600/30 transition disabled:opacity-50">
            {acting ? '…' : '✗ Revoke'}
          </button>
        </div>
        {actionMsg && <p className="mt-2 text-xs text-emerald-400">{actionMsg}</p>}
      </div>

      {/* Subscriber list */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <SectionHeader title="Infinity Subscribers" sub={`${inf.total} total · ${inf.paid} paid · ${inf.free} free grants`} />
        {subLoading ? <div className="text-xs text-zinc-600">Loading…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 border-b border-zinc-800">
                  <th className="text-left pb-2 font-medium">User ID</th>
                  <th className="text-left pb-2 font-medium">Subscribed At</th>
                  <th className="text-left pb-2 font-medium">Type</th>
                  <th className="text-right pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {subscribers.slice(0, 50).map((s) => (
                  <tr key={s.userId} className="py-2">
                    <td className="py-2 text-zinc-300 font-mono text-[11px]">{s.userId}</td>
                    <td className="py-2 text-zinc-500">{s.purchasedAt ? ago(s.purchasedAt) : '—'}</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${s.grantedFree ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-violet-500/10 text-violet-400 border-violet-500/20'}`}>
                        {s.grantedFree ? 'Free grant' : 'Paid'}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => handleAction(s.userId, 'revoke')} disabled={acting}
                        className="text-[10px] text-red-500 hover:text-red-400 transition disabled:opacity-40">
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
                {subscribers.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-zinc-600">No Infinity subscribers yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Feature breakdown */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <SectionHeader title="What Infinity Unlocks" sub="Features gated behind Docrud Infinity" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { label: 'Business Pages', desc: 'Full business profiles with products, jobs, events' },
            { label: 'Unlimited Services', desc: 'No cap — free users limited to 2' },
            { label: 'Direct Messaging', desc: 'Chat with any platform user' },
            { label: 'Public Face Badge', desc: 'Apply for verified creator status' },
            { label: 'E-Sign Documents', desc: 'Send docs for OTP-verified signature' },
            { label: '5 GB Drive Storage', desc: 'Free cloud storage allocation' },
          ].map((f) => (
            <div key={f.label} className="bg-violet-500/5 border border-violet-500/15 rounded-xl px-4 py-3">
              <div className="text-xs font-semibold text-violet-300 mb-0.5">{f.label}</div>
              <div className="text-xs text-zinc-500">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing reference */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <SectionHeader title="Pricing Reference" sub="Current active pricing" />
        <div className="flex gap-4 flex-wrap">
          {[
            { period: 'Monthly', price: '₹299', note: '+18% GST' },
            { period: 'Annual', price: '₹2,499', note: '+18% GST · ~30% saving' },
          ].map((p) => (
            <div key={p.period} className="bg-zinc-800 rounded-xl px-5 py-3">
              <div className="text-xs text-zinc-400 mb-0.5">{p.period}</div>
              <div className="text-xl font-bold text-white">{p.price}</div>
              <div className="text-xs text-zinc-500">{p.note}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// HOMEPAGE COMMAND CENTRE TAB
// ══════════════════════════════════════════════════════════════════════
function HomepageCommandCenterTab() {
  return (
    <div className="p-6">
      <HomepageCommandCenter />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// AD BANNERS TAB
// ══════════════════════════════════════════════════════════════════════
function AdBannersTab() {
  return (
    <div className="p-6">
      <AdBannerManager />
    </div>
  );
}
