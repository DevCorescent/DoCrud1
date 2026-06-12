'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Eye, Loader2, Mail, ShieldAlert, Trash2, UserRound, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type AdminUserSummary = {
  id: string;
  name: string;
  email: string;
  role: string;
  accountType?: 'business' | 'individual';
  organizationName?: string;
  planName?: string;
  planStatus?: string;
  isActive: boolean;
  suspendedUntil?: string;
  createdAt: string;
  lastLogin?: string;
  lastActivityAt?: string;
  status: 'active' | 'suspended' | 'disabled';
};

type AdminActiveSession = {
  sessionId: string;
  visitorId?: string;
  userId?: string;
  userRole?: string;
  userEmail?: string;
  userName?: string;
  ip?: string;
  userAgent?: string;
  lastSeenAt: string;
  surface?: string;
  lastPath?: string;
  eventsInWindow: number;
};

type AdminUserBehaviour = {
  user: AdminUserSummary;
  activity: {
    events7d: number;
    lastSeenAt?: string;
    topTabs7d: Array<{ tabId: string; count: number }>;
    topFeatures7d: Array<{ featureId: string; count: number }>;
    recentEvents: Array<{ id: string; eventType: string; tabId?: string; featureId?: string; detail?: string; createdAt: string }>;
  };
  telemetry: {
    sessions24h: number;
    pageViews24h: number;
    featureOpens24h: number;
    lastIp?: string;
    lastUserAgent?: string;
    recentTelemetry: Array<{ id: string; type: string; surface: string; path: string; createdAt: string; ip?: string; sessionId?: string }>;
  };
  documents: {
    generatedTotal: number;
    lastGeneratedAt?: string;
  };
  billing: {
    paidTotalInPaise: number;
    paid30dInPaise: number;
    paidTransactions: number;
    lastPaidAt?: string;
  };
  feedback: {
    latestRating?: number;
    latestSummary?: string;
    latestCreatedAt?: string;
  };
  audits: Array<{ id: string; action: string; reason?: string; createdAt: string; actorEmail?: string }>;
};

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\\.0$/, '')}k`;
  return String(Math.round(value));
}

function formatCurrencyInrFromPaise(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format((value || 0) / 100);
}

function statusPill(status: 'active' | 'suspended' | 'disabled') {
  if (status === 'disabled') return 'border-slate-200 bg-slate-100/70 text-slate-700';
  if (status === 'suspended') return 'border-amber-200 bg-amber-50/80 text-amber-900';
  return 'border-emerald-200 bg-emerald-50/80 text-emerald-900';
}

export default function SuperAdminUserCenter() {
  const [tab, setTab] = useState<'users' | 'sessions'>('users');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'disabled'>('all');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [totals, setTotals] = useState<{ total: number; active: number; suspended: number; disabled: number } | null>(null);

  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsWindowMinutes, setSessionsWindowMinutes] = useState(15);
  const [sessions, setSessions] = useState<AdminActiveSession[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<AdminUserBehaviour | null>(null);
  const [detailId, setDetailId] = useState('');

  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [actionBusyUserId, setActionBusyUserId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?query=${encodeURIComponent(query)}&status=${encodeURIComponent(statusFilter)}&limit=260`, { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to load users');
      setUsers(Array.isArray(payload?.users) ? payload.users : []);
      setTotals(payload?.totals || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
      setUsers([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter]);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/sessions?windowMinutes=${encodeURIComponent(String(sessionsWindowMinutes))}&limit=320`, { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to load sessions');
      setSessions(Array.isArray(payload?.sessions) ? payload.sessions : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, [sessionsWindowMinutes]);

  const openUserDetail = useCallback(async (userId: string) => {
    setDetailOpen(true);
    setDetailId(userId);
    setDetailLoading(true);
    setDetail(null);
    setEmailSubject('');
    setEmailMessage('');
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { cache: 'no-store' });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to load user details');
      setDetail(payload as AdminUserBehaviour);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to load user details');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const applyAction = useCallback(async (userId: string, action: 'suspend' | 'unsuspend' | 'disable' | 'enable' | 'delete', options?: { days?: number; reason?: string }) => {
    if (!userId) return;
    setActionBusyUserId(userId);
    setActionMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, days: options?.days, reason: options?.reason }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Action failed');
      setActionMessage(action === 'suspend' ? `User suspended until ${payload?.result?.suspendedUntil || ''}` : 'Action applied.');
      void loadUsers();
      if (detailId === userId) void openUserDetail(userId);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionBusyUserId(null);
    }
  }, [detailId, loadUsers, openUserDetail]);

  const sendEmail = useCallback(async () => {
    if (!detailId) return;
    setEmailSending(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(detailId)}/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: emailSubject, message: emailMessage }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error || 'Failed to send email');
      setActionMessage(payload?.result?.skipped ? 'Email skipped (policy disabled). Check Mail policies.' : 'Email queued/sent. Check Outbox for tracking.');
      setEmailSubject('');
      setEmailMessage('');
      void openUserDetail(detailId);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setEmailSending(false);
    }
  }, [detailId, emailMessage, emailSubject, openUserDetail]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (tab !== 'sessions') return;
    void loadSessions();
  }, [loadSessions, tab]);

  const filteredUsers = useMemo(() => users, [users]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Users</p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-slate-950">User Command Center</h3>
          <p className="mt-1 text-sm text-slate-600">Track active sessions, user behaviour, and take admin actions (suspend, disable, delete, email).</p>
        </div>
        {totals ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">
              Total {formatCompactNumber(totals.total)}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur ${statusPill('active')}`}>
              Active {formatCompactNumber(totals.active)}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur ${statusPill('suspended')}`}>
              Suspended {formatCompactNumber(totals.suspended)}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold backdrop-blur ${statusPill('disabled')}`}>
              Disabled {formatCompactNumber(totals.disabled)}
            </span>
          </div>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="w-full justify-start rounded-2xl bg-white/60 p-1 backdrop-blur sm:w-auto">
            <TabsTrigger value="users" className="rounded-xl">
              <Users className="mr-2 h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="sessions" className="rounded-xl">
              <UserRound className="mr-2 h-4 w-4" />
              Active sessions
            </TabsTrigger>
          </TabsList>

          {tab === 'users' ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input className="h-11 w-full rounded-2xl sm:w-[320px]" placeholder="Search name, email, org, role…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {(['all', 'active', 'suspended', 'disabled'] as const).map((key) => (
                  <Button
                    key={key}
                    type="button"
                    variant={statusFilter === key ? 'default' : 'outline'}
                    className="h-11 rounded-2xl"
                    onClick={() => setStatusFilter(key)}
                  >
                    {key === 'all' ? 'All' : key[0].toUpperCase() + key.slice(1)}
                  </Button>
                ))}
                <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => void loadUsers()} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Refresh
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-11 w-[140px] rounded-2xl"
                type="number"
                min={1}
                max={180}
                value={String(sessionsWindowMinutes)}
                onChange={(e) => setSessionsWindowMinutes(Math.max(1, Math.min(180, Number(e.target.value || '15'))))}
              />
              <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={() => void loadSessions()} disabled={sessionsLoading}>
                {sessionsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Refresh
              </Button>
            </div>
          )}
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50/70 px-3 py-3 text-sm text-rose-900">
            <ShieldAlert className="mt-0.5 h-4 w-4" />
            <p className="min-w-0">{error}</p>
          </div>
        ) : null}

        <TabsContent value="users" className="mt-6 space-y-6">
          <Card className="border-white/60 bg-white/75 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-950">
                <Users className="h-4 w-4" />
                Users
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : filteredUsers.length ? (
                <div className="grid gap-3">
                  {filteredUsers.slice(0, 260).map((user) => (
                    <div key={user.id} className="rounded-[1.4rem] border border-white/70 bg-white/70 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-950">{user.name || user.email}</p>
                            <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusPill(user.status)}`}>
                              {user.status}
                            </span>
                            <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                              {user.role}
                            </span>
                            {user.planName ? (
                              <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                                {user.planName}{user.planStatus ? ` (${user.planStatus})` : ''}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-600">{user.email}</p>
                          {user.organizationName ? <p className="mt-1 text-xs text-slate-600">{user.organizationName}</p> : null}
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                            <span>Last login: {user.lastLogin ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(user.lastLogin)) : '—'}</span>
                            <span className="text-slate-300">•</span>
                            <span>Last activity: {user.lastActivityAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(user.lastActivityAt)) : '—'}</span>
                          </div>
                          {user.suspendedUntil ? (
                            <p className="mt-2 text-xs text-amber-800">Suspended until {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(user.suspendedUntil))}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button type="button" variant="outline" className="h-10 rounded-full" onClick={() => void openUserDetail(user.id)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Details
                          </Button>
                          {user.status === 'suspended' ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-10 rounded-full"
                              disabled={actionBusyUserId === user.id}
                              onClick={() => void applyAction(user.id, 'unsuspend')}
                            >
                              {actionBusyUserId === user.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                              Unsuspend
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-10 rounded-full"
                              disabled={actionBusyUserId === user.id}
                              onClick={() => void applyAction(user.id, 'suspend', { days: 7 })}
                            >
                              {actionBusyUserId === user.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                              Suspend 7d
                            </Button>
                          )}
                          {user.isActive ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-10 rounded-full"
                              disabled={actionBusyUserId === user.id}
                              onClick={() => void applyAction(user.id, 'disable')}
                            >
                              {actionBusyUserId === user.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                              Disable
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-10 rounded-full"
                              disabled={actionBusyUserId === user.id}
                              onClick={() => void applyAction(user.id, 'enable')}
                            >
                              {actionBusyUserId === user.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                              Enable
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10 rounded-full border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-50"
                            disabled={actionBusyUserId === user.id}
                            onClick={() => {
                              const ok = window.confirm(`Delete ${user.email}? This is permanent and may affect existing records.`);
                              if (ok) void applyAction(user.id, 'delete');
                            }}
                          >
                            {actionBusyUserId === user.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.4rem] border border-dashed border-white/70 bg-white/60 p-6 text-sm text-slate-600">No users found.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="mt-6 space-y-6">
          <Card className="border-white/60 bg-white/75 backdrop-blur">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-slate-950">
                <UserRound className="h-4 w-4" />
                Active sessions (last {sessionsWindowMinutes} min)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sessionsLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : sessions.length ? (
                <div className="grid gap-3">
                  {sessions.slice(0, 320).map((s) => (
                    <div key={s.sessionId} className="rounded-[1.4rem] border border-white/70 bg-white/70 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">{s.userEmail || s.visitorId || s.sessionId}</p>
                          <p className="mt-1 text-xs text-slate-600">{s.lastPath || '—'} ({s.surface || 'unknown'})</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                            <span>Last seen: {new Intl.DateTimeFormat(undefined, { timeStyle: 'short', dateStyle: 'medium' }).format(new Date(s.lastSeenAt))}</span>
                            <span className="text-slate-300">•</span>
                            <span>Events: {s.eventsInWindow}</span>
                            {s.ip ? (<><span className="text-slate-300">•</span><span>IP: {s.ip}</span></>) : null}
                          </div>
                          {s.userAgent ? <p className="mt-2 line-clamp-2 text-xs text-slate-500">{s.userAgent}</p> : null}
                        </div>
                        {s.userId ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" variant="outline" className="h-10 rounded-full" onClick={() => void openUserDetail(s.userId!)}>
                              <Eye className="mr-2 h-4 w-4" />
                              User details
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.4rem] border border-dashed border-white/70 bg-white/60 p-6 text-sm text-slate-600">No active sessions detected.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-5xl overflow-hidden rounded-[1.6rem] border border-white/70 bg-white/85 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur-2xl">
          <DialogHeader>
            <div className="border-b border-white/60 px-5 pb-4 pt-5">
              <DialogTitle className="text-base font-semibold tracking-[-0.02em] text-slate-950">User details</DialogTitle>
              <p className="mt-1 text-sm text-slate-600">{detail?.user?.email || detailId}</p>
            </div>
          </DialogHeader>
          <div className="max-h-[78vh] space-y-6 overflow-auto px-5 py-5">
            {detailLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : detail ? (
              <>
                <div className="grid gap-4 lg:grid-cols-3">
                  <Card className="border-white/60 bg-white/75 backdrop-blur">
                    <CardHeader><CardTitle className="text-sm">Account</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm text-slate-700">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusPill(detail.user.status)}`}>{detail.user.status}</span>
                        <span className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">{detail.user.role}</span>
                      </div>
                      <p><span className="font-semibold text-slate-950">Name:</span> {detail.user.name}</p>
                      <p><span className="font-semibold text-slate-950">Org:</span> {detail.user.organizationName || '—'}</p>
                      <p><span className="font-semibold text-slate-950">Plan:</span> {detail.user.planName ? `${detail.user.planName} (${detail.user.planStatus || '—'})` : '—'}</p>
                      {detail.user.suspendedUntil ? <p className="text-amber-800"><span className="font-semibold text-slate-950">Suspended until:</span> {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(detail.user.suspendedUntil))}</p> : null}
                    </CardContent>
                  </Card>

                  <Card className="border-white/60 bg-white/75 backdrop-blur">
                    <CardHeader><CardTitle className="text-sm">Behaviour</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm text-slate-700">
                      <p><span className="font-semibold text-slate-950">Events (7d):</span> {detail.activity.events7d}</p>
                      <p><span className="font-semibold text-slate-950">Sessions (24h):</span> {detail.telemetry.sessions24h}</p>
                      <p><span className="font-semibold text-slate-950">Page views (24h):</span> {detail.telemetry.pageViews24h}</p>
                      <p><span className="font-semibold text-slate-950">Feature opens (24h):</span> {detail.telemetry.featureOpens24h}</p>
                      <p><span className="font-semibold text-slate-950">Last seen:</span> {detail.activity.lastSeenAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(detail.activity.lastSeenAt)) : '—'}</p>
                      {detail.telemetry.lastIp ? <p><span className="font-semibold text-slate-950">Last IP:</span> {detail.telemetry.lastIp}</p> : null}
                    </CardContent>
                  </Card>

                  <Card className="border-white/60 bg-white/75 backdrop-blur">
                    <CardHeader><CardTitle className="text-sm">Commercial</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm text-slate-700">
                      <p><span className="font-semibold text-slate-950">Paid (total):</span> {formatCurrencyInrFromPaise(detail.billing.paidTotalInPaise)}</p>
                      <p><span className="font-semibold text-slate-950">Paid (30d):</span> {formatCurrencyInrFromPaise(detail.billing.paid30dInPaise)}</p>
                      <p><span className="font-semibold text-slate-950">Paid txns:</span> {detail.billing.paidTransactions}</p>
                      <p><span className="font-semibold text-slate-950">Documents generated:</span> {detail.documents.generatedTotal}</p>
                      {detail.documents.lastGeneratedAt ? <p><span className="font-semibold text-slate-950">Last generated:</span> {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(detail.documents.lastGeneratedAt))}</p> : null}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card className="border-white/60 bg-white/75 backdrop-blur">
                    <CardHeader><CardTitle className="text-sm">Top tabs (7d)</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {detail.activity.topTabs7d.length ? detail.activity.topTabs7d.map((row) => (
                        <div key={row.tabId} className="flex items-center justify-between gap-4 text-sm text-slate-700">
                          <span className="min-w-0 truncate">{row.tabId}</span>
                          <span className="shrink-0 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700">{row.count}</span>
                        </div>
                      )) : <p className="text-sm text-slate-600">No data yet.</p>}
                    </CardContent>
                  </Card>

                  <Card className="border-white/60 bg-white/75 backdrop-blur">
                    <CardHeader><CardTitle className="text-sm">Latest feedback</CardTitle></CardHeader>
                    <CardContent className="space-y-2 text-sm text-slate-700">
                      {detail.feedback.latestRating ? (
                        <>
                          <p><span className="font-semibold text-slate-950">Rating:</span> {detail.feedback.latestRating}/5</p>
                          {detail.feedback.latestCreatedAt ? <p className="text-xs text-slate-600">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(detail.feedback.latestCreatedAt))}</p> : null}
                          {detail.feedback.latestSummary ? <p className="rounded-2xl border border-white/70 bg-white/60 px-3 py-3 text-sm">{detail.feedback.latestSummary}</p> : null}
                        </>
                      ) : (
                        <p className="text-sm text-slate-600">No feedback submitted.</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-white/60 bg-white/75 backdrop-blur">
                  <CardHeader><CardTitle className="text-sm">Admin actions</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-700">
                    {detail.audits.length ? detail.audits.slice(0, 30).map((ev) => (
                      <div key={ev.id} className="flex flex-col gap-1 rounded-2xl border border-white/70 bg-white/60 px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-950">{ev.action}</span>
                          <span className="text-xs text-slate-600">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ev.createdAt))}</span>
                        </div>
                        {ev.reason ? <p className="text-xs text-slate-600">{ev.reason}</p> : null}
                        {ev.actorEmail ? <p className="text-xs text-slate-500">By {ev.actorEmail}</p> : null}
                      </div>
                    )) : <p className="text-sm text-slate-600">No admin actions logged.</p>}
                  </CardContent>
                </Card>

                <Card className="border-white/60 bg-white/75 backdrop-blur">
                  <CardHeader><CardTitle className="text-sm">Controls</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {detail.user.status === 'suspended' ? (
                        <Button type="button" variant="outline" className="h-11 rounded-2xl" disabled={actionBusyUserId === detail.user.id} onClick={() => void applyAction(detail.user.id, 'unsuspend')}>
                          {actionBusyUserId === detail.user.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                          Unsuspend
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" className="h-11 rounded-2xl" disabled={actionBusyUserId === detail.user.id} onClick={() => void applyAction(detail.user.id, 'suspend', { days: 7 })}>
                          {actionBusyUserId === detail.user.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                          Suspend 7d
                        </Button>
                      )}
                      {detail.user.isActive ? (
                        <Button type="button" variant="outline" className="h-11 rounded-2xl" disabled={actionBusyUserId === detail.user.id} onClick={() => void applyAction(detail.user.id, 'disable')}>
                          {actionBusyUserId === detail.user.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                          Disable account
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" className="h-11 rounded-2xl" disabled={actionBusyUserId === detail.user.id} onClick={() => void applyAction(detail.user.id, 'enable')}>
                          {actionBusyUserId === detail.user.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}
                          Enable account
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-2xl border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-50"
                        disabled={actionBusyUserId === detail.user.id}
                        onClick={() => {
                          const ok = window.confirm(`Delete ${detail.user.email}? This is permanent and may affect existing records.`);
                          if (ok) void applyAction(detail.user.id, 'delete');
                        }}
                      >
                        {actionBusyUserId === detail.user.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        Delete user
                      </Button>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Email subject</p>
                        <Input className="mt-2 h-11 rounded-2xl" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Account update" />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Message</p>
                        <textarea
                          className="mt-2 min-h-[110px] w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
                          value={emailMessage}
                          onChange={(e) => setEmailMessage(e.target.value)}
                          placeholder="Write a clear message. Links will be tracked."
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" className="h-11 rounded-2xl bg-slate-950 px-5 text-white hover:bg-slate-900" disabled={emailSending} onClick={() => void sendEmail()}>
                        {emailSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                        Send email
                      </Button>
                    </div>

                    {actionMessage ? (
                      <div className="rounded-2xl border border-white/70 bg-white/60 px-3 py-3 text-sm text-slate-700">{actionMessage}</div>
                    ) : null}
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-3 py-3 text-sm text-rose-900">
                <ShieldAlert className="mt-0.5 h-4 w-4" /> Unable to load user details.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

