/**
 * Presence ping endpoint — called every 20 s when tab is visible.
 * Also fired on pagehide/beforeunload with offline:true to evict immediately.
 * Accepts rich behaviour signals for advanced tracking.
 */
import { NextRequest, NextResponse } from 'next/server';
import { recordPresencePing, recordPresenceOffline } from '@/lib/server/presence';
import { isIpBlocked } from '@/lib/server/telemetry';
import { getStoredUserById } from '@/lib/server/users';

export const dynamic = 'force-dynamic';

function ip(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.ip || undefined;
}

export async function POST(req: NextRequest) {
  try {
    const clientIp = ip(req);

    // Body parsing is local work, so do it before the blocklist read — that lets
    // the blocklist check and the user lookup share one round trip window. The
    // block still short-circuits before anything is recorded.
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;

    const blockedPromise = clientIp ? isIpBlocked(clientIp) : Promise.resolve(false);

    if (!body?.sessionId) {
      await blockedPromise.catch(() => false);
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const sessionId = String(body.sessionId);
    const userId = body.userId ? String(body.userId) : undefined;

    // One indexed _id lookup — this fires every 20 s per open tab, so it must
    // not pull the whole users collection to read five fields. Started here so
    // it overlaps the blocklist read instead of following it.
    const userPromise = userId
      ? getStoredUserById(userId).catch(() => null)
      : Promise.resolve(null);

    if (await blockedPromise.catch(() => false)) {
      return NextResponse.json({ ok: true });
    }

    if (body.offline === true) {
      await recordPresenceOffline(sessionId);
      return NextResponse.json({ ok: true });
    }

    // Enrich with real user data if we have a userId
    const u = await userPromise;
    const userEmail = u?.email;
    const userName = u?.name;
    const organizationName = u?.organizationName;
    const accountType = u?.accountType;
    const planId = (u?.subscription as Record<string, string> | undefined)?.planId;

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
