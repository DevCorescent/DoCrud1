import { webTelemetryPath, securityBlocklistPath, readJsonFile, writeJsonFile } from '@/lib/server/storage';

export type TelemetrySurface = 'public' | 'workspace';

export type WebTelemetryEventType =
  | 'page_view'
  | 'page_leave'
  | 'cta_click'
  | 'search'
  | 'login'
  | 'signup'
  | 'feature_open';

export type WebTelemetryEvent = {
  id: string;
  type: WebTelemetryEventType;
  surface: TelemetrySurface;
  path: string;
  title?: string;
  referrer?: string;
  visitorId?: string;
  sessionId?: string;
  userId?: string;
  userRole?: string;
  createdAt: string;
  durationMs?: number;
  query?: string;
  featureId?: string;
  ctaId?: string;
  userAgent?: string;
  ip?: string;
  // Search-specific enrichment fields
  searchContext?: string;   // which search bar fired this (e.g. "global", "published_feed", "file_drive")
  resultsCount?: number;    // how many results were returned
  hasResults?: boolean;     // convenience bool
  queryLength?: number;     // character count of query
};

export type SecurityBlocklist = {
  blockedIps: string[];
  updatedAt: string;
};

export type TelemetryOverview = {
  generatedAt: string;
  traffic: {
    pageViews24h: number;
    pageViews7d: number;
    uniqueVisitors24h: number;
    uniqueVisitors7d: number;
    sessions24h: number;
    sessions7d: number;
    avgSessionSeconds24h: number;
    bounceRate24h: number; // 0..100
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
    returningVisitorRate7d: number; // 0..100
    topExitPages24h: Array<{ path: string; exits: number }>;
    funnels: Array<{ id: string; label: string; steps: Array<{ label: string; count: number; rateFromPrev: number }> }>;
  };
  security: {
    blockedIps: string[];
    suspiciousIps24h: Array<{ ip: string; events: number; topPaths: Array<{ path: string; count: number }> }>;
  };
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function parseDevice(userAgent?: string): 'mobile' | 'desktop' | 'bot' | 'unknown' {
  const ua = String(userAgent || '').toLowerCase();
  if (!ua) return 'unknown';
  if (/\bbot\b|\bcrawl\b|\bspider\b|\bslurp\b|headless/.test(ua)) return 'bot';
  if (/iphone|android|mobile|ipad/.test(ua)) return 'mobile';
  if (/windows|macintosh|linux|x11/.test(ua)) return 'desktop';
  return 'unknown';
}

function normalizePath(pathname: string) {
  const value = String(pathname || '').trim();
  if (!value) return '/';
  // Strip query/hash to keep aggregation stable.
  const qIdx = value.indexOf('?');
  const hashIdx = value.indexOf('#');
  const cutIdx = [qIdx, hashIdx].filter((n) => n >= 0).sort((a, b) => a - b)[0];
  return (cutIdx === undefined ? value : value.slice(0, cutIdx)) || '/';
}

function normalizeReferrer(value?: string) {
  const ref = String(value || '').trim();
  if (!ref) return 'direct';
  try {
    const url = new URL(ref);
    return url.host || 'direct';
  } catch {
    return ref.slice(0, 80);
  }
}

export async function getSecurityBlocklist(): Promise<SecurityBlocklist> {
  return readJsonFile<SecurityBlocklist>(securityBlocklistPath, { blockedIps: [], updatedAt: nowIso() });
}

export async function saveSecurityBlocklist(next: SecurityBlocklist) {
  await writeJsonFile(securityBlocklistPath, { ...next, updatedAt: nowIso() });
}

export async function isIpBlocked(ip?: string) {
  if (!ip) return false;
  const blocklist = await getSecurityBlocklist();
  return blocklist.blockedIps.includes(ip);
}

export async function getWebTelemetryEvents() {
  return readJsonFile<WebTelemetryEvent[]>(webTelemetryPath, []);
}

export async function saveWebTelemetryEvents(next: WebTelemetryEvent[]) {
  await writeJsonFile(webTelemetryPath, next.slice(0, 80_000));
}

export async function appendWebTelemetryEvent(input: Omit<WebTelemetryEvent, 'id' | 'createdAt'>) {
  const events = await getWebTelemetryEvents();
  const event: WebTelemetryEvent = {
    id: createId('te'),
    createdAt: nowIso(),
    ...input,
    path: normalizePath(input.path),
    referrer: normalizeReferrer(input.referrer),
    userAgent: input.userAgent ? String(input.userAgent).slice(0, 240) : undefined,
    ip: input.ip ? String(input.ip).slice(0, 64) : undefined,
    query: input.query ? String(input.query).slice(0, 160) : undefined,
    title: input.title ? String(input.title).slice(0, 120) : undefined,
    ctaId: input.ctaId ? String(input.ctaId).slice(0, 80) : undefined,
    featureId: input.featureId ? String(input.featureId).slice(0, 80) : undefined,
    visitorId: input.visitorId ? String(input.visitorId).slice(0, 64) : undefined,
    sessionId: input.sessionId ? String(input.sessionId).slice(0, 64) : undefined,
    userId: input.userId ? String(input.userId).slice(0, 64) : undefined,
    userRole: input.userRole ? String(input.userRole).slice(0, 32) : undefined,
    durationMs: Number.isFinite(Number(input.durationMs)) ? Math.max(0, Math.min(6 * 60 * 60 * 1000, Number(input.durationMs))) : undefined,
  };

  const next = [event, ...events].slice(0, 80_000);
  await writeJsonFile(webTelemetryPath, next);
  return event;
}

export async function purgeWebTelemetryEvents(options: { maxAgeMs?: number; keepLatest?: number } = {}) {
  const keepLatest = Number.isFinite(Number(options.keepLatest)) ? Math.max(0, Math.min(80_000, Number(options.keepLatest))) : 0;
  const maxAgeMs = Number.isFinite(Number(options.maxAgeMs))
    ? Math.max(0, Math.min(365 * 24 * 60 * 60 * 1000, Number(options.maxAgeMs)))
    : undefined;
  const events = await getWebTelemetryEvents();
  if (maxAgeMs === 0 && keepLatest === 0) {
    await saveWebTelemetryEvents([]);
    return { before: events.length, after: 0 };
  }
  const kept = keepLatest > 0 ? events.slice(0, keepLatest) : [];
  const filtered = maxAgeMs
    ? events.filter((e) => Date.now() - new Date(e.createdAt).getTime() <= maxAgeMs)
    : events;
  const merged = keepLatest > 0 ? Array.from(new Map([...kept, ...filtered].map((e) => [e.id, e])).values()) : filtered;
  await saveWebTelemetryEvents(merged);
  return { before: events.length, after: merged.length };
}

function windowEvents(events: WebTelemetryEvent[], ms: number) {
  const cutoff = Date.now() - ms;
  return events.filter((e) => new Date(e.createdAt).getTime() >= cutoff);
}

function countBy<T extends string>(items: Array<{ key: T }>) {
  const map = new Map<T, number>();
  items.forEach((item) => map.set(item.key, (map.get(item.key) || 0) + 1));
  return map;
}

function topFromMap(map: Map<string, number>, limit: number) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

export async function getTelemetryOverview(): Promise<TelemetryOverview> {
  const [events, blocklist] = await Promise.all([getWebTelemetryEvents(), getSecurityBlocklist()]);
  const events24h = windowEvents(events, 24 * 60 * 60 * 1000);
  const events7d = windowEvents(events, 7 * 24 * 60 * 60 * 1000);

  const pageViews24h = events24h.filter((e) => e.type === 'page_view').length;
  const pageViews7d = events7d.filter((e) => e.type === 'page_view').length;
  const ctaClicks24h = events24h.filter((e) => e.type === 'cta_click').length;
  const searches24h = events24h.filter((e) => e.type === 'search').length;
  const signups24h = events24h.filter((e) => e.type === 'signup').length;
  const logins24h = events24h.filter((e) => e.type === 'login').length;

  const visitors24h = new Set(events24h.map((e) => e.visitorId).filter(Boolean) as string[]);
  const visitors7d = new Set(events7d.map((e) => e.visitorId).filter(Boolean) as string[]);
  const sessions24h = new Set(events24h.map((e) => e.sessionId).filter(Boolean) as string[]);
  const sessions7d = new Set(events7d.map((e) => e.sessionId).filter(Boolean) as string[]);

  const liveVisitors5m = new Set(windowEvents(events, 5 * 60 * 1000).map((e) => e.visitorId).filter(Boolean) as string[]).size;

  const topPagesMap = new Map<string, number>();
  events24h.filter((e) => e.type === 'page_view').forEach((e) => topPagesMap.set(e.path, (topPagesMap.get(e.path) || 0) + 1));
  const topPages24h = topFromMap(topPagesMap, 12).map(([path, views]) => ({ path, views }));

  const refMap = new Map<string, number>();
  events24h.filter((e) => e.type === 'page_view').forEach((e) => {
    const ref = normalizeReferrer(e.referrer);
    refMap.set(ref, (refMap.get(ref) || 0) + 1);
  });
  const topReferrers24h = topFromMap(refMap, 10).map(([referrer, views]) => ({ referrer, views }));

  const deviceMap = new Map<'mobile' | 'desktop' | 'bot' | 'unknown', number>();
  events24h.filter((e) => e.type === 'page_view').forEach((e) => {
    const device = parseDevice(e.userAgent);
    deviceMap.set(device, (deviceMap.get(device) || 0) + 1);
  });
  const deviceMix24h = Array.from(deviceMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([device, views]) => ({ device, views }));

  const ctaMap = new Map<string, number>();
  events24h.filter((e) => e.type === 'cta_click' && e.ctaId).forEach((e) => {
    const key = String(e.ctaId || '').trim();
    if (!key) return;
    ctaMap.set(key, (ctaMap.get(key) || 0) + 1);
  });
  const topCtas24h = topFromMap(ctaMap, 10).map(([ctaId, clicks]) => ({ ctaId, clicks }));

  const searchMap = new Map<string, number>();
  events24h.filter((e) => e.type === 'search' && e.query).forEach((e) => {
    const key = String(e.query || '').trim().toLowerCase();
    if (!key) return;
    searchMap.set(key, (searchMap.get(key) || 0) + 1);
  });
  const topSearches24h = topFromMap(searchMap, 10).map(([query, searches]) => ({ query, searches }));

  const featureMap = new Map<string, number>();
  events24h.filter((e) => e.type === 'feature_open' && e.featureId).forEach((e) => {
    const key = String(e.featureId || '').trim();
    if (!key) return;
    featureMap.set(key, (featureMap.get(key) || 0) + 1);
  });
  const topWorkspaceFeatures24h = topFromMap(featureMap, 10).map(([featureId, opens]) => ({ featureId, opens }));

  const pageLeaves24h = events24h.filter((e) => e.type === 'page_leave' && (e.durationMs || 0) > 0);
  const avgTimeOnPageSeconds24h = pageLeaves24h.length
    ? Math.round((pageLeaves24h.reduce((sum, e) => sum + (e.durationMs || 0), 0) / pageLeaves24h.length) / 1000)
    : 0;

  const exitMap = new Map<string, number>();
  pageLeaves24h.forEach((e) => exitMap.set(e.path, (exitMap.get(e.path) || 0) + 1));
  const topExitPages24h = topFromMap(exitMap, 10).map(([path, exits]) => ({ path, exits }));

  // Session-level summaries (very lightweight, based on sessionId).
  const sessionViews = new Map<string, number>();
  events24h.filter((e) => e.type === 'page_view' && e.sessionId).forEach((e) => {
    sessionViews.set(e.sessionId!, (sessionViews.get(e.sessionId!) || 0) + 1);
  });
  const sessionsWithOneView = Array.from(sessionViews.values()).filter((count) => count <= 1).length;
  const bounceRate24h = sessions24h.size ? Math.round((sessionsWithOneView / sessions24h.size) * 100) : 0;

  const sessionDurations = new Map<string, number>();
  pageLeaves24h.filter((e) => e.sessionId && e.durationMs).forEach((e) => {
    sessionDurations.set(e.sessionId!, (sessionDurations.get(e.sessionId!) || 0) + (e.durationMs || 0));
  });
  const avgSessionSeconds24h = sessionDurations.size
    ? Math.round((Array.from(sessionDurations.values()).reduce((sum, ms) => sum + ms, 0) / sessionDurations.size) / 1000)
    : 0;

  const visitorSessions7d = new Map<string, Set<string>>();
  events7d.filter((e) => e.visitorId && e.sessionId).forEach((e) => {
    const existing = visitorSessions7d.get(e.visitorId!) || new Set<string>();
    existing.add(e.sessionId!);
    visitorSessions7d.set(e.visitorId!, existing);
  });
  const returningVisitors = Array.from(visitorSessions7d.values()).filter((sessions) => sessions.size >= 2).length;
  const returningVisitorRate7d = visitors7d.size ? Math.round((returningVisitors / visitors7d.size) * 100) : 0;

  // Funnels based on coarse events.
  const funnelSteps = (id: string, label: string, types: WebTelemetryEventType[]) => {
    // Using sessions where possible so conversion rates are less noisy than raw events.
    const sessionHas = (type: WebTelemetryEventType) => {
      const set = new Set<string>();
      events7d.forEach((e) => {
        if (e.type !== type) return;
        if (e.sessionId) set.add(e.sessionId);
      });
      return set.size;
    };
    const counts = types.map((type, idx) => (idx === 0 ? events7d.filter((e) => e.type === type).length : sessionHas(type)));
    const steps = types.map((type, idx) => ({
      label: idx === 0 ? label : prettyTypeLabel(type),
      count: counts[idx],
      rateFromPrev: idx === 0 ? 100 : counts[idx - 1] ? Math.round((counts[idx] / counts[idx - 1]) * 100) : 0,
    }));
    return { id, label, steps };
  };

  const funnels = [
    funnelSteps('visit_to_signup', 'Visit', ['page_view', 'signup']),
    funnelSteps('visit_to_login', 'Visit', ['page_view', 'login']),
    funnelSteps('visit_to_cta', 'Visit', ['page_view', 'cta_click']),
  ];

  const eventsByIp = new Map<string, WebTelemetryEvent[]>();
  events24h.forEach((e) => {
    const ip = e.ip;
    if (!ip) return;
    const list = eventsByIp.get(ip) || [];
    list.push(e);
    eventsByIp.set(ip, list);
  });
  const suspiciousIps24h = Array.from(eventsByIp.entries())
    .filter(([ip, list]) => list.length >= 160 && !blocklist.blockedIps.includes(ip))
    .map(([ip, list]) => {
      const pathCounts = new Map<string, number>();
      list.forEach((ev) => pathCounts.set(ev.path, (pathCounts.get(ev.path) || 0) + 1));
      const topPaths = Array.from(pathCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([path, count]) => ({ path, count }));
      return { ip, events: list.length, topPaths };
    })
    .sort((a, b) => b.events - a.events)
    .slice(0, 12);

  return {
    generatedAt: nowIso(),
    traffic: {
      pageViews24h,
      pageViews7d,
      uniqueVisitors24h: visitors24h.size,
      uniqueVisitors7d: visitors7d.size,
      sessions24h: sessions24h.size,
      sessions7d: sessions7d.size,
      avgSessionSeconds24h,
      bounceRate24h,
      liveVisitors5m,
      ctaClicks24h,
      searches24h,
      signups24h,
      logins24h,
      topPages24h,
      topReferrers24h,
      deviceMix24h,
      topCtas24h,
      topSearches24h,
      topWorkspaceFeatures24h,
    },
    behaviour: {
      avgTimeOnPageSeconds24h,
      returningVisitorRate7d,
      topExitPages24h,
      funnels,
    },
    security: {
      blockedIps: blocklist.blockedIps,
      suspiciousIps24h,
    },
  };
}

function prettyTypeLabel(type: WebTelemetryEventType) {
  switch (type) {
    case 'page_view':
      return 'Page views';
    case 'page_leave':
      return 'Time on page';
    case 'cta_click':
      return 'CTA clicks';
    case 'feature_open':
      return 'Feature opens';
    default:
      return type.replace(/_/g, ' ');
  }
}
