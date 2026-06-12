/**
 * Presence ping endpoint — called every 20 s when tab is visible.
 * Also fired on pagehide/beforeunload with offline:true to evict immediately.
 * Accepts rich behaviour signals for advanced tracking.
 */
import { NextRequest, NextResponse } from 'next/server';
import { recordPresencePing, recordPresenceOffline } from '@/lib/server/presence';
import { isIpBlocked } from '@/lib/server/telemetry';
import { getStoredUsers } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

function ip(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.ip || undefined;
}

export async function POST(req: NextRequest) {
  try {
    const clientIp = ip(req);
    if (clientIp && await isIpBlocked(clientIp)) {
      return NextResponse.json({ ok: true });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body?.sessionId) return NextResponse.json({ ok: false }, { status: 400 });

    const sessionId = String(body.sessionId);

    if (body.offline === true) {
      await recordPresenceOffline(sessionId);
      return NextResponse.json({ ok: true });
    }

    // Enrich with real user data if we have a userId
    let userEmail: string | undefined;
    let userName: string | undefined;
    let organizationName: string | undefined;
    let accountType: string | undefined;
    let planId: string | undefined;

    const userId = body.userId ? String(body.userId) : undefined;
    if (userId) {
      try {
        const users = await getStoredUsers();
        const u = users.find((u) => u.id === userId);
        if (u) {
          userEmail = u.email;
          userName = u.name;
          organizationName = u.organizationName;
          accountType = u.accountType;
          planId = (u.subscription as Record<string, string> | undefined)?.planId;
        }
      } catch { /* non-fatal */ }
    }

    await recordPresencePing({
      sessionId,
      visitorId:        body.visitorId        ? String(body.visitorId)        : undefined,
      userId,
      userEmail,
      userName,
      organizationName,
      accountType,
      planId,
      userRole:         body.userRole         ? String(body.userRole)         : undefined,
      path:             body.path             ? String(body.path)             : '/',
      surface:          body.surface === 'workspace' ? 'workspace' : 'public',
      ip:               clientIp,
      userAgent:        req.headers.get('user-agent') || undefined,
      tabVisible:       body.tabVisible !== false,
      navigatorOnline:  body.navigatorOnline  !== false,
      focusDeltaMs:     typeof body.focusDeltaMs  === 'number' ? body.focusDeltaMs  : 0,
      isPageView:       body.isPageView       === true,
      idleMs:           typeof body.idleMs         === 'number' ? body.idleMs         : 0,
      clickDelta:       typeof body.clickDelta     === 'number' ? body.clickDelta     : 0,
      keystrokeDelta:   typeof body.keystrokeDelta === 'number' ? body.keystrokeDelta : 0,
      scrollDelta:      typeof body.scrollDelta    === 'number' ? body.scrollDelta    : 0,
      connectionType:   body.connectionType   ? String(body.connectionType)   : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[telemetry/ping]', err);
    return NextResponse.json({ ok: true }); // never error on client
  }
}
