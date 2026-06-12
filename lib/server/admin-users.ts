import { getStoredUsers, saveStoredUsers, type StoredUser } from '@/lib/server/auth';
import { getHistoryEntries } from '@/lib/server/history';
import { getBillingTransactions } from '@/lib/server/billing';
import { getUserActivityEvents, getUserFeedbackEntries } from '@/lib/server/user-intelligence';
import { getWebTelemetryEvents } from '@/lib/server/telemetry';
import { appendAdminAuditEvent, getAdminAuditEvents } from '@/lib/server/admin-audit';
import { getPresenceSessions } from '@/lib/server/presence';

function nowMs() {
  return Date.now();
}

function isSuspended(user: StoredUser, now = new Date()) {
  const until = user.safety?.suspendedUntil ? new Date(user.safety.suspendedUntil).getTime() : 0;
  return Boolean(until && until > now.getTime());
}

function statusLabel(user: StoredUser) {
  if (!user.isActive) return 'disabled' as const;
  if (isSuspended(user)) return 'suspended' as const;
  return 'active' as const;
}

function safeString(value: unknown) {
  return String(value ?? '').trim();
}

export type AdminUserSummary = {
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

export async function listAdminUsers(params: {
  query?: string;
  status?: 'all' | 'active' | 'suspended' | 'disabled';
  limit?: number;
}) {
  const query = safeString(params.query).toLowerCase();
  const status = params.status || 'all';
  const limit = Math.max(1, Math.min(2000, Math.round(params.limit || 260)));

  const users = await getStoredUsers();
  const filtered = users
    .filter(Boolean)
    .filter((user) => {
      if (!query) return true;
      const haystack = `${user.name} ${user.email} ${user.organizationName || ''} ${user.role} ${user.loginId || ''}`.toLowerCase();
      return haystack.includes(query);
    })
    .map((user) => {
      const userStatus = statusLabel(user);
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountType: user.accountType,
        organizationName: user.organizationName,
        planName: user.subscription?.planName,
        planStatus: user.subscription?.status,
        isActive: user.isActive,
        suspendedUntil: user.safety?.suspendedUntil,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        lastActivityAt: user.lastActivityAt,
        status: userStatus,
      } satisfies AdminUserSummary;
    })
    .filter((user) => (status === 'all' ? true : user.status === status))
    .sort((a, b) => new Date(b.lastActivityAt || b.lastLogin || b.createdAt).getTime() - new Date(a.lastActivityAt || a.lastLogin || a.createdAt).getTime())
    .slice(0, limit);

  const totals = filtered.reduce(
    (acc, user) => {
      acc.total += 1;
      acc.active += user.status === 'active' ? 1 : 0;
      acc.suspended += user.status === 'suspended' ? 1 : 0;
      acc.disabled += user.status === 'disabled' ? 1 : 0;
      return acc;
    },
    { total: 0, active: 0, suspended: 0, disabled: 0 },
  );

  return { users: filtered, totals };
}

export type AdminActiveSession = {
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

export async function listActiveSessions(params?: { windowMinutes?: number; limit?: number }) {
  const windowMinutes = Math.max(1, Math.min(180, Math.round(params?.windowMinutes || 15)));
  const limit = Math.max(1, Math.min(1000, Math.round(params?.limit || 260)));
  const cutoff = nowMs() - windowMinutes * 60 * 1000;

  const [events, users] = await Promise.all([getWebTelemetryEvents(), getStoredUsers()]);
  const userById = new Map(users.map((u) => [u.id, u]));

  const recent = events.filter((ev) => ev.sessionId && new Date(ev.createdAt).getTime() >= cutoff);
  const bySession = new Map<string, AdminActiveSession>();
  for (const ev of recent) {
    const sessionId = String(ev.sessionId || '').trim();
    if (!sessionId) continue;
    const existing = bySession.get(sessionId);
    const lastSeenAt = existing?.lastSeenAt && new Date(existing.lastSeenAt).getTime() > new Date(ev.createdAt).getTime()
      ? existing.lastSeenAt
      : ev.createdAt;
    const user = ev.userId ? userById.get(ev.userId) : undefined;
    bySession.set(sessionId, {
      sessionId,
      visitorId: ev.visitorId || existing?.visitorId,
      userId: ev.userId || existing?.userId,
      userRole: ev.userRole || existing?.userRole,
      userEmail: user?.email || existing?.userEmail,
      userName: user?.name || existing?.userName,
      ip: ev.ip || existing?.ip,
      userAgent: ev.userAgent || existing?.userAgent,
      lastSeenAt,
      surface: ev.surface || existing?.surface,
      lastPath: ev.path || existing?.lastPath,
      eventsInWindow: (existing?.eventsInWindow || 0) + 1,
    });
  }

  return Array.from(bySession.values())
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .slice(0, limit);
}

// ── Timeline event shape ───────────────────────────────────────────────
export type TimelineEvent = {
  id: string;
  source: 'activity' | 'telemetry' | 'document' | 'billing' | 'audit';
  type: string;        // raw event type
  label: string;       // human-readable
  detail?: string;
  path?: string;
  ip?: string;
  sessionId?: string;
  amountInPaise?: number;
  createdAt: string;
};

export type SessionRecord = {
  sessionId: string;
  startAt: string;
  endAt: string;
  durationMs: number;
  pageViews: number;
  featureOpens: number;
  pages: string[];           // ordered unique pages
  surface: string;
  ip?: string;
  userAgent?: string;
  device?: string;
  browser?: string;
};

export type AdminUserBehaviour = {
  user: AdminUserSummary;
  livePresence: {
    isOnline: boolean;
    status?: 'online' | 'idle' | 'away';
    path?: string;
    idleMs?: number;
    engagementScore?: number;
    clickCount?: number;
    keystrokeCount?: number;
    scrollEventCount?: number;
    focusDurationMs?: number;
    connectionType?: string;
    device?: string;
    browser?: string;
    os?: string;
    ip?: string;
    lastPingAt?: string;
  };
  stats: {
    pageViewsTotal: number;
    pageViews7d: number;
    pageViews24h: number;
    sessionsTotal: number;
    sessions7d: number;
    sessions24h: number;
    featureOpens24h: number;
    events7d: number;
    eventsTotal: number;
    lastSeenAt?: string;
    lastIp?: string;
    lastUserAgent?: string;
    docsGenerated: number;
    lastDocAt?: string;
    paidTotalInPaise: number;
    paid30dInPaise: number;
    paidTransactions: number;
    lastPaidAt?: string;
  };
  topTabs7d: Array<{ tabId: string; count: number }>;
  topFeatures7d: Array<{ featureId: string; count: number }>;
  pageHeatmap: Array<{ path: string; count: number; lastVisitAt: string }>;
  dailyActivity: Array<{ date: string; count: number }>;   // last 30 days
  hourlyPattern: Array<{ hour: number; count: number }>;   // 0-23
  timeline: TimelineEvent[];                               // last 200 merged events
  sessionHistory: SessionRecord[];                         // last 30 sessions
  documents: Array<{
    id: string; templateName: string; category?: string;
    generatedAt: string; emailSent?: boolean; emailTo?: string;
  }>;
  transactions: Array<{
    id: string; planName?: string; productLabel?: string;
    amountInPaise: number; status: string; createdAt: string; paidAt?: string;
  }>;
  feedback: Array<{
    id: string; rating: number; summary: string;
    painPoints: string; requestedImprovements: string; createdAt: string;
  }>;
  audits: Array<{ id: string; action: string; reason?: string; createdAt: string; actorEmail?: string }>;
};

function detectDeviceFromUA(ua: string) {
  if (!ua) return 'unknown';
  const u = ua.toLowerCase();
  if (/tablet|ipad/.test(u)) return 'tablet';
  if (/mobile|android|iphone|ipod/.test(u)) return 'mobile';
  return 'desktop';
}

function detectBrowserFromUA(ua: string) {
  if (!ua) return 'Unknown';
  if (/edg\//i.test(ua)) return 'Edge';
  if (/chrome/i.test(ua) && !/chromium/i.test(ua)) return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  return 'Other';
}

function topFromMap(map: Map<string, number>, limit = 8) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

export async function getAdminUserBehaviour(userId: string): Promise<AdminUserBehaviour | null> {
  const [users, activity, feedbackAll, telemetry, history, transactions, audits, presenceSessions] = await Promise.all([
    getStoredUsers(),
    getUserActivityEvents(),
    getUserFeedbackEntries(),
    getWebTelemetryEvents(),
    getHistoryEntries(),
    getBillingTransactions(),
    getAdminAuditEvents(1500),
    getPresenceSessions(),
  ]);

  const target = users.find((u) => u.id === userId) || null;
  if (!target) return null;

  const summary: AdminUserSummary = {
    id: target.id,
    name: target.name,
    email: target.email,
    role: target.role,
    accountType: target.accountType,
    organizationName: target.organizationName,
    planName: target.subscription?.planName,
    planStatus: target.subscription?.status,
    isActive: target.isActive,
    suspendedUntil: target.safety?.suspendedUntil,
    createdAt: target.createdAt,
    lastLogin: target.lastLogin,
    lastActivityAt: target.lastActivityAt,
    status: statusLabel(target),
  };

  // ── Live presence ──────────────────────────────────────────────────
  const liveSession = presenceSessions.find((s) => s.userId === target.id) || null;
  const livePresence: AdminUserBehaviour['livePresence'] = liveSession
    ? {
        isOnline: true,
        status: liveSession.status,
        path: liveSession.path,
        idleMs: liveSession.idleMs,
        engagementScore: liveSession.engagementScore,
        clickCount: liveSession.clickCount,
        keystrokeCount: liveSession.keystrokeCount,
        scrollEventCount: liveSession.scrollEventCount,
        focusDurationMs: liveSession.focusDurationMs,
        connectionType: liveSession.connectionType,
        device: liveSession.device,
        browser: liveSession.browser,
        os: (liveSession as any).os,
        ip: liveSession.ip,
        lastPingAt: liveSession.lastPingAt,
      }
    : { isOnline: false };

  // ── Time windows ──────────────────────────────────────────────────
  const now = Date.now();
  const weekCutoff  = now - 7  * 24 * 60 * 60 * 1000;
  const dayCutoff   = now - 24 * 60 * 60 * 1000;
  const monthCutoff = now - 30 * 24 * 60 * 60 * 1000;

  // ── Activity events ──────────────────────────────────────────────
  const userActivity    = activity.filter((ev) => ev.userId === target.id);
  const userActivity7d  = userActivity.filter((ev) => new Date(ev.createdAt).getTime() >= weekCutoff);

  const tabMap7d     = new Map<string, number>();
  const featureMap7d = new Map<string, number>();
  userActivity7d.forEach((ev) => {
    if (ev.tabId)     tabMap7d.set(ev.tabId, (tabMap7d.get(ev.tabId) || 0) + 1);
    if (ev.featureId) featureMap7d.set(ev.featureId, (featureMap7d.get(ev.featureId) || 0) + 1);
  });

  const topTabs7d     = topFromMap(tabMap7d, 10).map((r) => ({ tabId: r.key, count: r.count }));
  const topFeatures7d = topFromMap(featureMap7d, 10).map((r) => ({ featureId: r.key, count: r.count }));

  // ── Telemetry ─────────────────────────────────────────────────────
  const userTelemetry    = telemetry.filter((ev) => ev.userId === target.id);
  const userTelemetry7d  = userTelemetry.filter((ev) => new Date(ev.createdAt).getTime() >= weekCutoff);
  const userTelemetry24h = userTelemetry.filter((ev) => new Date(ev.createdAt).getTime() >= dayCutoff);

  const pageViews24h   = userTelemetry24h.filter((ev) => ev.type === 'page_view').length;
  const pageViews7d    = userTelemetry7d.filter((ev)  => ev.type === 'page_view').length;
  const pageViewsTotal = userTelemetry.filter((ev)    => ev.type === 'page_view').length;
  const featureOpens24h= userTelemetry24h.filter((ev) => ev.type === 'feature_open').length;

  const sessions24h = new Set(userTelemetry24h.map((ev) => ev.sessionId).filter(Boolean)).size;
  const sessions7d  = new Set(userTelemetry7d.map((ev)  => ev.sessionId).filter(Boolean)).size;
  const sessionsTotal= new Set(userTelemetry.map((ev)   => ev.sessionId).filter(Boolean)).size;

  const sortedTelemetry = userTelemetry.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const lastTe = sortedTelemetry[0];

  const lastSeenAt = sortedTelemetry[0]?.createdAt || target.lastActivityAt || target.lastLogin;

  // ── Page heatmap ─────────────────────────────────────────────────
  const pageMap = new Map<string, { count: number; lastVisitAt: string }>();
  userTelemetry.filter((ev) => ev.type === 'page_view').forEach((ev) => {
    const existing = pageMap.get(ev.path);
    const isNewer = !existing || new Date(ev.createdAt) > new Date(existing.lastVisitAt);
    pageMap.set(ev.path, {
      count: (existing?.count || 0) + 1,
      lastVisitAt: isNewer ? ev.createdAt : existing!.lastVisitAt,
    });
  });
  const pageHeatmap = Array.from(pageMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 40)
    .map(([path, { count, lastVisitAt }]) => ({ path, count, lastVisitAt }));

  // ── Daily activity (last 30 days) ─────────────────────────────────
  const allEventsForPattern = [
    ...userTelemetry.filter((ev) => new Date(ev.createdAt).getTime() >= monthCutoff).map((ev) => ev.createdAt),
    ...userActivity.filter((ev) => new Date(ev.createdAt).getTime() >= monthCutoff).map((ev) => ev.createdAt),
  ];
  const dailyMap = new Map<string, number>();
  allEventsForPattern.forEach((iso) => {
    const date = iso.slice(0, 10); // YYYY-MM-DD
    dailyMap.set(date, (dailyMap.get(date) || 0) + 1);
  });
  // Fill all 30 days so the heatmap has no gaps
  const dailyActivity: Array<{ date: string; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dailyActivity.push({ date: key, count: dailyMap.get(key) || 0 });
  }

  // ── Hourly pattern (0-23) ─────────────────────────────────────────
  const hourMap = new Map<number, number>();
  [...userTelemetry, ...userActivity].forEach((ev) => {
    const h = new Date(ev.createdAt).getHours();
    hourMap.set(h, (hourMap.get(h) || 0) + 1);
  });
  const hourlyPattern = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: hourMap.get(h) || 0 }));

  // ── Session history ───────────────────────────────────────────────
  const sessionMap = new Map<string, {
    events: Array<{ path: string; type: string; ip?: string; userAgent?: string; surface: string; createdAt: string }>;
  }>();
  userTelemetry.forEach((ev) => {
    if (!ev.sessionId) return;
    const existing = sessionMap.get(ev.sessionId) || { events: [] };
    existing.events.push({ path: ev.path, type: ev.type, ip: ev.ip, userAgent: ev.userAgent, surface: ev.surface, createdAt: ev.createdAt });
    sessionMap.set(ev.sessionId, existing);
  });

  const sessionHistory: SessionRecord[] = Array.from(sessionMap.entries())
    .map(([sessionId, { events }]) => {
      const sorted = events.slice().sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const startAt  = sorted[0]?.createdAt || '';
      const endAt    = sorted[sorted.length - 1]?.createdAt || startAt;
      const durationMs = new Date(endAt).getTime() - new Date(startAt).getTime();
      const pv = events.filter((e) => e.type === 'page_view');
      const fo = events.filter((e) => e.type === 'feature_open');
      const seenPaths = new Set<string>();
      const uniquePages = pv.map((e) => e.path).filter((p) => { if (seenPaths.has(p)) return false; seenPaths.add(p); return true; });
      const ua = sorted.find((e) => e.userAgent)?.userAgent || '';
      const ipAddr = sorted.find((e) => e.ip)?.ip;
      const surf = sorted[0]?.surface || 'public';
      return {
        sessionId,
        startAt,
        endAt,
        durationMs,
        pageViews: pv.length,
        featureOpens: fo.length,
        pages: uniquePages.slice(0, 20),
        surface: surf,
        ip: ipAddr,
        userAgent: ua,
        device: detectDeviceFromUA(ua),
        browser: detectBrowserFromUA(ua),
      };
    })
    .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
    .slice(0, 30);

  // ── Unified timeline (last 200 events across all sources) ─────────
  const timelineItems: TimelineEvent[] = [];

  // From telemetry
  userTelemetry.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 150).forEach((ev) => {
      const labelMap: Record<string, string> = {
        page_view: 'Visited page',
        page_leave: 'Left page',
        feature_open: 'Opened feature',
        cta_click: 'Clicked CTA',
        search: 'Searched',
        login: 'Logged in',
        signup: 'Signed up',
      };
      timelineItems.push({
        id: ev.id,
        source: 'telemetry',
        type: ev.type,
        label: labelMap[ev.type] || ev.type,
        detail: ev.query || ev.featureId || ev.ctaId,
        path: ev.path,
        ip: ev.ip,
        sessionId: ev.sessionId,
        createdAt: ev.createdAt,
      });
    });

  // From activity events
  userActivity.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 150).forEach((ev) => {
      const labelMap: Record<string, string> = {
        login: 'Logged in',
        session_start: 'Started session',
        tab_view: 'Viewed tab',
        feature_action: 'Used feature',
        feedback_submitted: 'Submitted feedback',
        admin_action: 'Admin action',
      };
      timelineItems.push({
        id: ev.id,
        source: 'activity',
        type: ev.eventType,
        label: labelMap[ev.eventType] || ev.eventType,
        detail: ev.detail || ev.tabId || ev.featureId,
        createdAt: ev.createdAt,
      });
    });

  // From documents
  const docs = history.filter((entry) => {
    const actor = String((entry as any).generatedBy || '').toLowerCase();
    return actor === target.email.toLowerCase() || actor === target.name.toLowerCase();
  });
  docs.slice().sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
    .slice(0, 50).forEach((doc) => {
      timelineItems.push({
        id: doc.id,
        source: 'document',
        type: 'document_generated',
        label: 'Generated document',
        detail: doc.templateName,
        createdAt: doc.generatedAt,
      });
    });

  // From billing
  const userTransactions = transactions.filter((t) => t.userId === target.id);
  userTransactions.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30).forEach((t) => {
      timelineItems.push({
        id: t.id,
        source: 'billing',
        type: `payment_${t.status}`,
        label: t.status === 'paid' ? 'Payment successful' : `Payment ${t.status}`,
        detail: t.planName || t.productLabel,
        amountInPaise: t.amountInPaise,
        createdAt: t.paidAt || t.createdAt,
      });
    });

  // From audit events
  const auditsForUser = audits
    .filter((ev) => ev.targetUserId === target.id)
    .slice(0, 50);
  auditsForUser.forEach((ev) => {
    timelineItems.push({
      id: ev.id,
      source: 'audit',
      type: `admin_${ev.action}`,
      label: `Admin: ${ev.action}`,
      detail: ev.reason || ev.actorEmail,
      createdAt: ev.createdAt,
    });
  });

  // Sort merged timeline by most-recent first, cap at 200
  const timeline = timelineItems
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 200);

  // ── Documents list ────────────────────────────────────────────────
  const docList = docs
    .slice().sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime())
    .slice(0, 50)
    .map((d) => ({
      id: d.id,
      templateName: d.templateName,
      category: d.category,
      generatedAt: d.generatedAt,
      emailSent: d.emailSent,
      emailTo: d.emailTo,
    }));

  // ── Billing ───────────────────────────────────────────────────────
  const paid      = userTransactions.filter((t) => t.status === 'paid');
  const paid30d   = paid.filter((t) => new Date(t.paidAt || t.updatedAt || t.createdAt).getTime() >= monthCutoff);
  const paidTotal = paid.reduce((s, t) => s + (t.amountInPaise || 0), 0);
  const paid30dTotal = paid30d.reduce((s, t) => s + (t.amountInPaise || 0), 0);
  const lastPaidAt = paid
    .map((t) => t.paidAt || t.updatedAt || t.createdAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

  const txList = userTransactions
    .slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((t) => ({
      id: t.id,
      planName: t.planName,
      productLabel: t.productLabel,
      amountInPaise: t.amountInPaise || 0,
      status: t.status,
      createdAt: t.createdAt,
      paidAt: t.paidAt,
    }));

  // ── Feedback ──────────────────────────────────────────────────────
  const userFeedback = feedbackAll
    .filter((f) => f.userId === target.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map((f) => ({
      id: f.id,
      rating: f.rating,
      summary: f.summary,
      painPoints: f.painPoints,
      requestedImprovements: f.requestedImprovements,
      createdAt: f.createdAt,
    }));

  return {
    user: summary,
    livePresence,
    stats: {
      pageViewsTotal, pageViews7d, pageViews24h,
      sessionsTotal, sessions7d, sessions24h,
      featureOpens24h,
      events7d: userActivity7d.length,
      eventsTotal: userActivity.length,
      lastSeenAt,
      lastIp: lastTe?.ip,
      lastUserAgent: lastTe?.userAgent,
      docsGenerated: docs.length,
      lastDocAt: docList[0]?.generatedAt,
      paidTotalInPaise: paidTotal,
      paid30dInPaise: paid30dTotal,
      paidTransactions: paid.length,
      lastPaidAt,
    },
    topTabs7d,
    topFeatures7d,
    pageHeatmap,
    dailyActivity,
    hourlyPattern,
    timeline,
    sessionHistory,
    documents: docList,
    transactions: txList,
    feedback: userFeedback,
    audits: auditsForUser.map((ev) => ({
      id: ev.id, action: ev.action, reason: ev.reason, createdAt: ev.createdAt, actorEmail: ev.actorEmail,
    })),
  };
}

export async function adminSuspendUser(params: {
  actorUserId: string;
  actorEmail?: string;
  actorRole?: string;
  targetUserId: string;
  days?: number;
  reason?: string;
}) {
  const days = Math.max(1, Math.min(365, Math.round(params.days || 7)));
  const users = await getStoredUsers();
  const idx = users.findIndex((u) => u.id === params.targetUserId);
  if (idx === -1) throw new Error('User not found.');

  const now = new Date();
  const suspendedUntil = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const nextUsers = users.map((u) => (u.id === params.targetUserId
    ? {
        ...u,
        safety: {
          ...(u.safety || {}),
          suspendedUntil,
        },
        isActive: true,
      }
    : u));
  await saveStoredUsers(nextUsers);

  const target = users[idx];
  await appendAdminAuditEvent({
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    targetUserId: target.id,
    targetEmail: target.email,
    action: 'suspend',
    reason: safeString(params.reason) || `Suspended for ${days} day(s)`,
    metadata: { days: String(days), suspendedUntil },
  });

  return { suspendedUntil };
}

export async function adminUnsuspendUser(params: {
  actorUserId: string;
  actorEmail?: string;
  actorRole?: string;
  targetUserId: string;
  reason?: string;
}) {
  const users = await getStoredUsers();
  const idx = users.findIndex((u) => u.id === params.targetUserId);
  if (idx === -1) throw new Error('User not found.');
  const nextUsers = users.map((u) => (u.id === params.targetUserId
    ? { ...u, safety: { ...(u.safety || {}), suspendedUntil: undefined } }
    : u));
  await saveStoredUsers(nextUsers);
  const target = users[idx];
  await appendAdminAuditEvent({
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    targetUserId: target.id,
    targetEmail: target.email,
    action: 'unsuspend',
    reason: safeString(params.reason) || 'Unsuspended by admin',
  });
}

export async function adminDisableUser(params: {
  actorUserId: string;
  actorEmail?: string;
  actorRole?: string;
  targetUserId: string;
  reason?: string;
}) {
  const users = await getStoredUsers();
  const idx = users.findIndex((u) => u.id === params.targetUserId);
  if (idx === -1) throw new Error('User not found.');
  const nextUsers = users.map((u) => (u.id === params.targetUserId ? { ...u, isActive: false } : u));
  await saveStoredUsers(nextUsers);
  const target = users[idx];
  await appendAdminAuditEvent({
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    targetUserId: target.id,
    targetEmail: target.email,
    action: 'disable',
    reason: safeString(params.reason) || 'Disabled by admin',
  });
}

export async function adminEnableUser(params: {
  actorUserId: string;
  actorEmail?: string;
  actorRole?: string;
  targetUserId: string;
  reason?: string;
}) {
  const users = await getStoredUsers();
  const idx = users.findIndex((u) => u.id === params.targetUserId);
  if (idx === -1) throw new Error('User not found.');
  const nextUsers = users.map((u) => (u.id === params.targetUserId ? { ...u, isActive: true } : u));
  await saveStoredUsers(nextUsers);
  const target = users[idx];
  await appendAdminAuditEvent({
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    targetUserId: target.id,
    targetEmail: target.email,
    action: 'enable',
    reason: safeString(params.reason) || 'Enabled by admin',
  });
}

export async function adminDeleteUser(params: {
  actorUserId: string;
  actorEmail?: string;
  actorRole?: string;
  targetUserId: string;
  reason?: string;
}) {
  const users = await getStoredUsers();
  const target = users.find((u) => u.id === params.targetUserId) || null;
  if (!target) throw new Error('User not found.');
  const nextUsers = users.filter((u) => u.id !== params.targetUserId);
  await saveStoredUsers(nextUsers);
  await appendAdminAuditEvent({
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    targetUserId: target.id,
    targetEmail: target.email,
    action: 'delete',
    reason: safeString(params.reason) || 'Deleted by admin',
  });
}
