import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getWebTelemetryEvents } from '@/lib/server/telemetry';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

// Simple device detection from userAgent
function detectDevice(ua: string): 'mobile' | 'tablet' | 'desktop' | 'bot' {
  if (!ua) return 'desktop';
  const u = ua.toLowerCase();
  if (/bot|crawl|spider|slurp|facebookexternalhit|googlebot|bingbot/i.test(u)) return 'bot';
  if (/tablet|ipad|kindle|playbook|silk/i.test(u)) return 'tablet';
  if (/mobile|android|iphone|ipod|windows phone|blackberry|opera mini/i.test(u)) return 'mobile';
  return 'desktop';
}

// Simple OS detection
function detectOS(ua: string): string {
  if (!ua) return 'Unknown';
  if (/windows nt 10/i.test(ua)) return 'Windows 10/11';
  if (/windows/i.test(ua)) return 'Windows';
  if (/mac os x 10_15|mac os x 11|mac os x 12|mac os x 13|mac os x 14|mac os x 15/i.test(ua)) return 'macOS';
  if (/mac os x/i.test(ua)) return 'macOS';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Other';
}

// Simple browser detection
function detectBrowser(ua: string): string {
  if (!ua) return 'Unknown';
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\//i.test(ua) || /opera/i.test(ua)) return 'Opera';
  if (/chrome/i.test(ua) && !/chromium/i.test(ua)) return 'Chrome';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  if (/msie|trident/i.test(ua)) return 'IE';
  return 'Other';
}

// IP classification
function classifyIp(ip: string): { label: string; isLocal: boolean } {
  if (!ip || ip === '::1' || ip === '127.0.0.1') return { label: 'Localhost', isLocal: true };
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.')) return { label: 'Local Network', isLocal: true };
  if (ip === '::ffff:127.0.0.1') return { label: 'Localhost (IPv6)', isLocal: true };
  return { label: ip, isLocal: false };
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const days = Math.max(1, Math.min(90, parseInt(searchParams.get('days') || '30')));

  try {
    const allEvents = await getWebTelemetryEvents();
    const since = new Date(Date.now() - days * 24 * 86400000);
    const events = allEvents.filter((e) => e.createdAt && new Date(e.createdAt) >= since);

    // Device distribution
    const deviceDist: Record<string, number> = {};
    const osDist: Record<string, number> = {};
    const browserDist: Record<string, number> = {};
    events.forEach((e) => {
      const ua = e.userAgent || '';
      const device = detectDevice(ua);
      const os = detectOS(ua);
      const browser = detectBrowser(ua);
      deviceDist[device] = (deviceDist[device] || 0) + 1;
      osDist[os] = (osDist[os] || 0) + 1;
      browserDist[browser] = (browserDist[browser] || 0) + 1;
    });

    // IP distribution
    const ipCounts: Record<string, number> = {};
    const localCount = { count: 0 };
    events.forEach((e) => {
      const { label, isLocal } = classifyIp(e.ip || '');
      if (isLocal) { localCount.count++; return; }
      ipCounts[label] = (ipCounts[label] || 0) + 1;
    });

    const topIps = Object.entries(ipCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 30)
      .map(([ip, count]) => ({ ip, count, percent: Math.round((count / events.length) * 100) }));

    // Referrer analysis
    const referrerDist: Record<string, number> = {};
    events.forEach((e) => {
      const r = e.referrer || 'direct';
      referrerDist[r] = (referrerDist[r] || 0) + 1;
    });
    const topReferrers = Object.entries(referrerDist)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([referrer, count]) => ({ referrer, count }));

    // Surface breakdown
    const surfaceDist: Record<string, number> = {};
    events.forEach((e) => { surfaceDist[e.surface || 'unknown'] = (surfaceDist[e.surface || 'unknown'] || 0) + 1; });

    // Session activity heatmap (hour x day of week)
    const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    events.forEach((e) => {
      if (!e.createdAt) return;
      const d = new Date(e.createdAt);
      heatmap[d.getDay()][d.getHours()]++;
    });

    // Live visitors (last 5 min)
    const live5min = new Date(Date.now() - 5 * 60000);
    const liveVisitorIds = new Set(allEvents.filter((e) => e.createdAt && new Date(e.createdAt) >= live5min && e.visitorId).map((e) => e.visitorId));

    // Unique visitors by day
    const dailyVisitors: { date: string; visitors: number; sessions: number }[] = [];
    for (let i = Math.min(days, 30) - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayEvents = events.filter((e) => e.createdAt?.slice(0, 10) === dateStr);
      const visitors = new Set(dayEvents.map((e) => e.visitorId).filter(Boolean)).size;
      const sessions = new Set(dayEvents.map((e) => e.sessionId).filter(Boolean)).size;
      dailyVisitors.push({ date: dateStr, visitors, sessions });
    }

    // Bounce rate approximation (sessions with only 1 page view)
    const sessionPageCounts: Record<string, number> = {};
    events.filter((e) => e.type === 'page_view' && e.sessionId).forEach((e) => {
      sessionPageCounts[e.sessionId!] = (sessionPageCounts[e.sessionId!] || 0) + 1;
    });
    const totalSessions = Object.keys(sessionPageCounts).length;
    const bouncedSessions = Object.values(sessionPageCounts).filter((c) => c === 1).length;
    const bounceRate = totalSessions > 0 ? Math.round((bouncedSessions / totalSessions) * 100) : 0;

    // Avg session duration
    const sessionDurations: number[] = [];
    const sessionTimes: Record<string, { first: number; last: number }> = {};
    events.filter((e) => e.sessionId && e.createdAt).forEach((e) => {
      const t = new Date(e.createdAt).getTime();
      if (!sessionTimes[e.sessionId!]) sessionTimes[e.sessionId!] = { first: t, last: t };
      sessionTimes[e.sessionId!].first = Math.min(sessionTimes[e.sessionId!].first, t);
      sessionTimes[e.sessionId!].last = Math.max(sessionTimes[e.sessionId!].last, t);
    });
    Object.values(sessionTimes).forEach(({ first, last }) => {
      const dur = (last - first) / 1000;
      if (dur > 0 && dur < 3600) sessionDurations.push(dur);
    });
    const avgSessionSeconds = sessionDurations.length > 0 ? Math.round(sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length) : 0;

    return NextResponse.json({
      period: { days },
      live: { visitors: liveVisitorIds.size },
      overview: {
        totalEvents: events.length,
        uniqueVisitors: new Set(events.map((e) => e.visitorId).filter(Boolean)).size,
        uniqueSessions: new Set(events.map((e) => e.sessionId).filter(Boolean)).size,
        localEvents: localCount.count,
        bounceRate,
        avgSessionSeconds,
      },
      deviceDistribution: Object.entries(deviceDist).map(([device, count]) => ({ device, count })).sort((a, b) => b.count - a.count),
      osDistribution: Object.entries(osDist).map(([os, count]) => ({ os, count })).sort((a, b) => b.count - a.count),
      browserDistribution: Object.entries(browserDist).map(([browser, count]) => ({ browser, count })).sort((a, b) => b.count - a.count),
      surfaceDistribution: Object.entries(surfaceDist).map(([surface, count]) => ({ surface, count })),
      topIps,
      topReferrers,
      heatmap,
      dailyVisitors,
    });
  } catch (err) {
    console.error('[super-admin/geography GET]', err);
    return NextResponse.json({ error: 'Failed to load geographic data' }, { status: 500 });
  }
}
