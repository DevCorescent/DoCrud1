import { NextRequest, NextResponse } from 'next/server';
import { appendWebTelemetryEvent, isIpBlocked, type WebTelemetryEventType, type TelemetrySurface } from '@/lib/server/telemetry';

export const dynamic = 'force-dynamic';

function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim();
  }
  return request.ip || undefined;
}

const ALLOWED_TYPES: WebTelemetryEventType[] = ['page_view', 'page_leave', 'cta_click', 'search', 'login', 'signup', 'feature_open'];

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (await isIpBlocked(ip)) {
      return NextResponse.json({ ok: true });
    }

    const payload = await request.json().catch(() => null) as any;
    const type = String(payload?.type || '').trim() as WebTelemetryEventType;
    if (!ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const surfaceValue = String(payload?.surface || 'public');
    const surface: TelemetrySurface = surfaceValue === 'workspace' ? 'workspace' : 'public';
    const path = String(payload?.path || '/');

    const queryStr = payload?.query ? String(payload.query).trim() : undefined;
    await appendWebTelemetryEvent({
      type,
      surface,
      path,
      title:     payload?.title     ? String(payload.title)     : undefined,
      referrer:  payload?.referrer  ? String(payload.referrer)  : undefined,
      visitorId: payload?.visitorId ? String(payload.visitorId) : undefined,
      sessionId: payload?.sessionId ? String(payload.sessionId) : undefined,
      durationMs: payload?.durationMs,
      query:     queryStr,
      featureId: payload?.featureId ? String(payload.featureId) : undefined,
      ctaId:     payload?.ctaId     ? String(payload.ctaId)     : undefined,
      userAgent: request.headers.get('user-agent') || undefined,
      ip,
      userId:    payload?.userId    ? String(payload.userId)    : undefined,
      userRole:  payload?.userRole  ? String(payload.userRole)  : undefined,
      // Search enrichment
      searchContext: payload?.searchContext ? String(payload.searchContext).slice(0, 64) : undefined,
      resultsCount:  typeof payload?.resultsCount === 'number' ? Math.max(0, Math.round(payload.resultsCount)) : undefined,
      hasResults:    typeof payload?.hasResults === 'boolean' ? payload.hasResults : undefined,
      queryLength:   queryStr ? queryStr.length : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: true });
  }
}

