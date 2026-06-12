import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { getWebTelemetryEvents, getSecurityBlocklist, saveSecurityBlocklist } from '@/lib/server/telemetry';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [events, blocklist] = await Promise.all([
      getWebTelemetryEvents(),
      getSecurityBlocklist(),
    ]);

    const since24h = new Date(Date.now() - 24 * 3600000);
    const since7d = new Date(Date.now() - 7 * 86400000);

    const recent = events.filter((e) => e.createdAt && new Date(e.createdAt) >= since24h);

    // IP analysis
    const ipEventMap: Record<string, { count: number; paths: Record<string, number>; userIds: Set<string>; userAgents: Set<string>; lastSeen: string; types: Record<string, number> }> = {};
    recent.forEach((e) => {
      const ip = e.ip || 'unknown';
      if (!ipEventMap[ip]) ipEventMap[ip] = { count: 0, paths: {}, userIds: new Set(), userAgents: new Set(), lastSeen: e.createdAt, types: {} };
      ipEventMap[ip].count++;
      ipEventMap[ip].paths[e.path] = (ipEventMap[ip].paths[e.path] || 0) + 1;
      if (e.userId) ipEventMap[ip].userIds.add(e.userId);
      if (e.userAgent) ipEventMap[ip].userAgents.add(e.userAgent.slice(0, 60));
      if (e.createdAt > ipEventMap[ip].lastSeen) ipEventMap[ip].lastSeen = e.createdAt;
      ipEventMap[ip].types[e.type] = (ipEventMap[ip].types[e.type] || 0) + 1;
    });

    // Suspicious IPs: 80+ events in 24h
    const suspicious = Object.entries(ipEventMap)
      .filter(([, d]) => d.count >= 80)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 30)
      .map(([ip, data]) => ({
        ip,
        events24h: data.count,
        uniqueUsers: data.userIds.size,
        topPaths: Object.entries(data.paths).sort(([, a], [, b]) => b - a).slice(0, 5).map(([path, count]) => ({ path, count })),
        userAgents: Array.from(data.userAgents).slice(0, 3),
        lastSeen: data.lastSeen,
        eventTypes: data.types,
        isBlocked: blocklist.blockedIps.includes(ip),
      }));

    // All IP overview for 7d
    const ip7dMap: Record<string, number> = {};
    events.filter((e) => e.createdAt && new Date(e.createdAt) >= since7d).forEach((e) => {
      const ip = e.ip || 'unknown';
      ip7dMap[ip] = (ip7dMap[ip] || 0) + 1;
    });

    const topIps = Object.entries(ip7dMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 50)
      .map(([ip, count]) => ({ ip, count, blocked: blocklist.blockedIps.includes(ip) }));

    // Bot detection (no userId, repeated patterns)
    const botCandidates = Object.entries(ipEventMap)
      .filter(([, d]) => d.userIds.size === 0 && d.count > 20)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([ip, data]) => ({ ip, events: data.count }));

    // Recent security events
    const loginEvents = events.filter((e) => e.type === 'login' && e.createdAt && new Date(e.createdAt) >= since24h);
    const signupEvents = events.filter((e) => e.type === 'signup' && e.createdAt && new Date(e.createdAt) >= since24h);

    return NextResponse.json({
      blocklist: { ips: blocklist.blockedIps, count: blocklist.blockedIps.length },
      suspicious,
      topIps,
      botCandidates,
      stats: {
        uniqueIps24h: Object.keys(ipEventMap).length,
        totalEvents24h: recent.length,
        logins24h: loginEvents.length,
        signups24h: signupEvents.length,
        blockedCount: blocklist.blockedIps.length,
        suspiciousCount: suspicious.length,
      },
    });
  } catch (err) {
    console.error('[super-admin/security GET]', err);
    return NextResponse.json({ error: 'Failed to load security data' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { action, ip } = await req.json();
    if (!ip) return NextResponse.json({ error: 'IP required' }, { status: 400 });

    const blocklist = await getSecurityBlocklist();

    await appendSuperAdminAudit({ action: `security_${action}`, details: { ip }, ip: req.headers.get('x-forwarded-for') || undefined });

    if (action === 'block') {
      if (!blocklist.blockedIps.includes(ip)) {
        blocklist.blockedIps.push(ip);
        blocklist.updatedAt = new Date().toISOString();
        await saveSecurityBlocklist(blocklist);
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'unblock') {
      blocklist.blockedIps = blocklist.blockedIps.filter((x) => x !== ip);
      blocklist.updatedAt = new Date().toISOString();
      await saveSecurityBlocklist(blocklist);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/security POST]', err);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
