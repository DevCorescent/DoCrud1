/**
 * Presence store — tracks who is online RIGHT NOW with rich behaviour signals.
 *
 * Status logic (most-specific first):
 *  - navigatorOnline=false at last ping → offline immediately (remove)
 *  - age ≤ ONLINE_THRESHOLD_MS AND tabVisible AND idleMs < USER_IDLE_THRESHOLD → "online"
 *  - age ≤ ONLINE_THRESHOLD_MS AND (tabHidden OR user idle) → "idle"
 *  - age ≤ IDLE_THRESHOLD_MS → "idle"
 *  - age ≤ AWAY_THRESHOLD_MS → "away"
 *  - beyond → cleaned up (offline)
 */

import { presencePath, readJsonFile, writeJsonFile } from '@/lib/server/storage';

export const ONLINE_THRESHOLD_MS  = 25_000;        // 25 s — tighter: ping every 20 s
export const IDLE_THRESHOLD_MS    = 5  * 60_000;   // 5 min — tab open but quiet
export const AWAY_THRESHOLD_MS    = 20 * 60_000;   // 20 min — stepped away
export const USER_IDLE_THRESHOLD  = 3  * 60_000;   // 3 min without mouse/keyboard = user idle

export type PresenceStatus = 'online' | 'idle' | 'away';

export interface PresenceEntry {
  sessionId: string;
  visitorId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  organizationName?: string;
  accountType?: string;
  planId?: string;
  userRole?: string;
  path: string;
  surface: string;
  ip?: string;
  userAgent?: string;
  device?: string;
  browser?: string;
  os?: string;

  // Tab/window state
  tabVisible: boolean;        // was tab in foreground at last ping
  navigatorOnline: boolean;   // browser's navigator.onLine at last ping

  // Timestamps
  firstSeenAt: string;        // ISO — session start
  lastPingAt: string;         // ISO — last heartbeat received
  lastInteractionAt?: string; // ISO — last time user moved mouse / pressed key

  // Engagement metrics (cumulative for session)
  pageViews: number;
  pathHistory: string[];      // last 15 unique paths
  focusDurationMs: number;    // ms tab was in foreground
  clickCount: number;         // total clicks this session
  keystrokeCount: number;     // total keystrokes this session
  scrollEventCount: number;   // total scroll events this session

  // Current-ping signals
  idleMs: number;             // ms since last mouse/keyboard at last ping (0 = actively typing/clicking)
  connectionType?: string;    // 'wifi' | '4g' | '3g' | 'slow-2g' | 'offline' | unknown

  // Computed engagement score 0-100 (recalculated each ping)
  engagementScore: number;
}

// ── In-memory cache ────────────────────────────────────────────────────
let cache: Map<string, PresenceEntry> | null = null;
let dirty = false;

async function getCache(): Promise<Map<string, PresenceEntry>> {
  if (cache) return cache;
  const saved = await readJsonFile<PresenceEntry[]>(presencePath, []);
  cache = new Map(saved.map((e) => [e.sessionId, e]));
  const cutoff = Date.now() - AWAY_THRESHOLD_MS;
  for (const [key, entry] of Array.from(cache.entries())) {
    if (new Date(entry.lastPingAt).getTime() < cutoff) cache.delete(key);
  }
  return cache;
}

async function flushIfDirty() {
  if (!dirty || !cache) return;
  dirty = false;
  await writeJsonFile(presencePath, Array.from(cache.values()).slice(0, 2000));
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => { flushTimer = null; await flushIfDirty(); }, 5_000);
}

// ── Device / browser / OS detection ───────────────────────────────────

function detectDevice(ua: string) {
  if (!ua) return 'unknown';
  const u = ua.toLowerCase();
  if (/bot|crawl|spider/.test(u)) return 'bot';
  if (/tablet|ipad/.test(u)) return 'tablet';
  if (/mobile|android|iphone|ipod/.test(u)) return 'mobile';
  return 'desktop';
}

function detectBrowser(ua: string) {
  if (!ua) return 'Unknown';
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\//i.test(ua)) return 'Opera';
  if (/chrome/i.test(ua) && !/chromium/i.test(ua)) return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  if (/msie|trident/i.test(ua)) return 'IE';
  return 'Other';
}

function detectOS(ua: string) {
  if (!ua) return 'Unknown';
  if (/windows nt 10/i.test(ua)) return 'Windows 10/11';
  if (/windows/i.test(ua)) return 'Windows';
  if (/iphone os 1[6-9]|iphone os [2-9]/i.test(ua)) return 'iOS 16+';
  if (/iphone/i.test(ua)) return 'iOS';
  if (/ipad/i.test(ua)) return 'iPadOS';
  if (/android/i.test(ua)) return 'Android';
  if (/mac os x 1[4-9]|mac os x [2-9]/i.test(ua)) return 'macOS 14+';
  if (/mac os/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Other';
}

// ── Engagement score (0-100) ───────────────────────────────────────────
// Weighted across: focus time vs session time, clicks, keystrokes, page depth, scroll events
function calcEngagement(entry: Omit<PresenceEntry, 'engagementScore'>): number {
  const sessionMs = Date.now() - new Date(entry.firstSeenAt).getTime();
  if (sessionMs < 5000) return 50; // brand new session — neutral

  // Focus ratio (0-1): how much of session time was tab in foreground
  const focusRatio = Math.min(entry.focusDurationMs / Math.max(sessionMs, 1), 1);

  // Interaction density: clicks+keystrokes normalised by session minutes
  const sessionMin = sessionMs / 60_000;
  const interactionDensity = Math.min((entry.clickCount + entry.keystrokeCount) / Math.max(sessionMin * 10, 1), 1);

  // Page depth: more pages = more engaged, capped at 10
  const pageDepth = Math.min(entry.pageViews / 10, 1);

  // Scroll density (normalised by page views)
  const scrollDensity = Math.min(entry.scrollEventCount / Math.max(entry.pageViews * 5, 1), 1);

  // Idle penalty: if idleMs > 1 min, reduce score
  const idlePenalty = entry.idleMs > 60_000 ? Math.min((entry.idleMs - 60_000) / (USER_IDLE_THRESHOLD - 60_000), 1) * 0.4 : 0;

  const raw = (focusRatio * 0.35) + (interactionDensity * 0.30) + (pageDepth * 0.20) + (scrollDensity * 0.15);
  return Math.max(0, Math.min(100, Math.round((raw - idlePenalty) * 100)));
}

// ── Public API ─────────────────────────────────────────────────────────

export async function recordPresencePing(input: {
  sessionId: string;
  visitorId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  organizationName?: string;
  accountType?: string;
  planId?: string;
  userRole?: string;
  path: string;
  surface: string;
  ip?: string;
  userAgent?: string;
  tabVisible: boolean;
  navigatorOnline?: boolean;
  focusDeltaMs?: number;
  isPageView?: boolean;
  idleMs?: number;
  clickDelta?: number;
  keystrokeDelta?: number;
  scrollDelta?: number;
  connectionType?: string;
}) {
  const map = await getCache();
  const now = new Date().toISOString();
  const ua = input.userAgent || '';
  const existing = map.get(input.sessionId);

  // If browser reports offline, evict immediately — don't keep a ghost session
  if (input.navigatorOnline === false) {
    if (existing) { map.delete(input.sessionId); dirty = true; scheduleFlush(); }
    return null;
  }

  const currentHistory = existing?.pathHistory || [];
  const newHistory = currentHistory.includes(input.path)
    ? currentHistory
    : [input.path, ...currentHistory].slice(0, 15);

  const idleMs = typeof input.idleMs === 'number' ? input.idleMs : 0;

  const draft: Omit<PresenceEntry, 'engagementScore'> = {
    sessionId: input.sessionId,
    visitorId: input.visitorId || existing?.visitorId,
    userId: input.userId || existing?.userId,
    userEmail: input.userEmail || existing?.userEmail,
    userName: input.userName || existing?.userName,
    organizationName: input.organizationName || existing?.organizationName,
    accountType: input.accountType || existing?.accountType,
    planId: input.planId || existing?.planId,
    userRole: input.userRole || existing?.userRole,
    path: input.path,
    surface: input.surface,
    ip: input.ip || existing?.ip,
    userAgent: ua || existing?.userAgent,
    device: detectDevice(ua || existing?.userAgent || ''),
    browser: detectBrowser(ua || existing?.userAgent || ''),
    os: detectOS(ua || existing?.userAgent || ''),
    tabVisible: input.tabVisible,
    navigatorOnline: input.navigatorOnline === true || input.navigatorOnline == null,
    firstSeenAt: existing?.firstSeenAt || now,
    lastPingAt: now,
    lastInteractionAt: idleMs === 0 ? now : (existing?.lastInteractionAt || now),
    pageViews: (existing?.pageViews || 0) + (input.isPageView ? 1 : 0),
    pathHistory: newHistory,
    focusDurationMs: (existing?.focusDurationMs || 0) + (input.focusDeltaMs || 0),
    clickCount: (existing?.clickCount || 0) + (input.clickDelta || 0),
    keystrokeCount: (existing?.keystrokeCount || 0) + (input.keystrokeDelta || 0),
    scrollEventCount: (existing?.scrollEventCount || 0) + (input.scrollDelta || 0),
    idleMs,
    connectionType: input.connectionType || existing?.connectionType,
  };

  const entry: PresenceEntry = { ...draft, engagementScore: calcEngagement(draft) };
  map.set(input.sessionId, entry);
  dirty = true;
  scheduleFlush();
  return entry;
}

export async function recordPresenceOffline(sessionId: string) {
  const map = await getCache();
  if (map.has(sessionId)) {
    map.delete(sessionId);
    dirty = true;
    scheduleFlush();
  }
}

export type StatusedPresenceEntry = PresenceEntry & { status: PresenceStatus };

export async function getPresenceSessions(): Promise<StatusedPresenceEntry[]> {
  const map = await getCache();
  const now = Date.now();
  const results: StatusedPresenceEntry[] = [];

  for (const entry of Array.from(map.values())) {
    const age = now - new Date(entry.lastPingAt).getTime();

    // Hard evict truly stale
    if (age > AWAY_THRESHOLD_MS) {
      map.delete(entry.sessionId);
      dirty = true;
      continue;
    }

    let status: PresenceStatus;
    if (age <= ONLINE_THRESHOLD_MS) {
      // Within heartbeat window — check tab visibility AND user activity
      const userIdle = entry.idleMs >= USER_IDLE_THRESHOLD;
      status = (entry.tabVisible && !userIdle) ? 'online' : 'idle';
    } else if (age <= IDLE_THRESHOLD_MS) {
      status = 'idle';
    } else {
      status = 'away';
    }

    results.push({ ...entry, status });
  }

  if (dirty) scheduleFlush();

  return results.sort(
    (a, b) => new Date(b.lastPingAt).getTime() - new Date(a.lastPingAt).getTime()
  );
}

export async function getPresenceStats() {
  const sessions = await getPresenceSessions();
  const online  = sessions.filter((s) => s.status === 'online').length;
  const idle    = sessions.filter((s) => s.status === 'idle').length;
  const away    = sessions.filter((s) => s.status === 'away').length;

  const authenticated = sessions.filter((s) => Boolean(s.userId)).length;
  const anonymous     = sessions.length - authenticated;

  const byRole: Record<string, number> = {};
  sessions.filter((s) => s.userId).forEach((s) => {
    const r = s.userRole || 'user';
    byRole[r] = (byRole[r] || 0) + 1;
  });

  const byDevice: Record<string, number> = {};
  sessions.forEach((s) => {
    const d = s.device || 'unknown';
    byDevice[d] = (byDevice[d] || 0) + 1;
  });

  const bySurface: Record<string, number> = {};
  sessions.forEach((s) => {
    bySurface[s.surface] = (bySurface[s.surface] || 0) + 1;
  });

  const pathCounts: Record<string, number> = {};
  sessions.forEach((s) => {
    pathCounts[s.path] = (pathCounts[s.path] || 0) + 1;
  });
  const hotPaths = Object.entries(pathCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)
    .map(([path, count]) => ({ path, count }));

  // Engagement breakdown
  const highEngagement  = sessions.filter((s) => s.engagementScore >= 70).length;
  const midEngagement   = sessions.filter((s) => s.engagementScore >= 30 && s.engagementScore < 70).length;
  const lowEngagement   = sessions.filter((s) => s.engagementScore < 30).length;

  return {
    total: sessions.length,
    online,
    idle,
    away,
    authenticated,
    anonymous,
    byRole,
    byDevice,
    bySurface,
    hotPaths,
    engagement: { high: highEngagement, mid: midEngagement, low: lowEngagement },
    sessions,
  };
}
