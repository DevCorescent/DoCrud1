import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getPresenceStats, ONLINE_THRESHOLD_MS, IDLE_THRESHOLD_MS, AWAY_THRESHOLD_MS } from '@/lib/server/presence';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

function fmtDuration(ms: number) {
  if (ms < 60_000)     return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000)  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

function ageLabel(ms: number) {
  if (ms < 10_000)   return 'just now';
  if (ms < 60_000)   return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const stats = await getPresenceStats();

    const sessions = stats.sessions.map((s) => {
      const ageMs           = Date.now() - new Date(s.lastPingAt).getTime();
      const sessionDurationMs = Date.now() - new Date(s.firstSeenAt).getTime();
      return {
        sessionId:           s.sessionId,
        visitorId:           s.visitorId,
        userId:              s.userId,
        userRole:            s.userRole,
        userEmail:           s.userEmail,
        userName:            s.userName,
        organizationName:    s.organizationName,
        accountType:         s.accountType,
        planId:              s.planId,
        status:              s.status,
        ageMs,
        ageLabel:            ageLabel(ageMs),
        sessionDurationLabel: fmtDuration(sessionDurationMs),
        focusDurationLabel:  fmtDuration(s.focusDurationMs || 0),
        focusDurationMs:     s.focusDurationMs || 0,
        ip:                  s.ip,
        userAgent:           s.userAgent,
        device:              s.device,
        browser:             s.browser,
        os:                  s.os,
        firstSeenAt:         s.firstSeenAt,
        lastPingAt:          s.lastPingAt,
        lastInteractionAt:   s.lastInteractionAt,
        surface:             s.surface,
        path:                s.path,
        pathHistory:         s.pathHistory || [],
        pageViews:           s.pageViews || 0,
        clickCount:          s.clickCount || 0,
        keystrokeCount:      s.keystrokeCount || 0,
        scrollEventCount:    s.scrollEventCount || 0,
        idleMs:              s.idleMs || 0,
        connectionType:      s.connectionType,
        engagementScore:     s.engagementScore || 0,
        navigatorOnline:     s.navigatorOnline !== false,
        tabVisible:          s.tabVisible,
      };
    });

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      thresholds: {
        onlineMs: ONLINE_THRESHOLD_MS,
        idleMs:   IDLE_THRESHOLD_MS,
        awayMs:   AWAY_THRESHOLD_MS,
      },
      total:         stats.total,
      online:        stats.online,
      idle:          stats.idle,
      away:          stats.away,
      authenticated: stats.authenticated,
      anonymous:     stats.anonymous,
      byRole:        stats.byRole,
      byDevice:      stats.byDevice,
      bySurface:     stats.bySurface,
      hotPaths:      stats.hotPaths,
      engagement:    stats.engagement,
      sessions,
    });
  } catch (err) {
    console.error('[super-admin/live-sessions GET]', err);
    return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 });
  }
}
