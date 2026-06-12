import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getWebTelemetryEvents, purgeWebTelemetryEvents, type WebTelemetryEvent, type WebTelemetryEventType, type TelemetrySurface } from '@/lib/server/telemetry';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

function maskIp(value?: string) {
  const ip = String(value || '').trim();
  if (!ip) return undefined;
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean);
    return parts.length >= 3 ? `${parts.slice(0, 3).join(':')}:…` : `${parts[0]}:…`;
  }
  const parts = ip.split('.').filter(Boolean);
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.…`;
  return `${ip.slice(0, 6)}…`;
}

function sanitizeEvent(event: WebTelemetryEvent) {
  const sanitized: WebTelemetryEvent = {
    ...event,
    ip: maskIp(event.ip),
    userAgent: event.userAgent ? String(event.userAgent).slice(0, 120) : undefined,
    // Safety: do not ship any accidental long strings to the admin UI.
    title: event.title ? String(event.title).slice(0, 120) : undefined,
    referrer: event.referrer ? String(event.referrer).slice(0, 120) : undefined,
    query: event.query ? String(event.query).slice(0, 120) : undefined,
    ctaId: event.ctaId ? String(event.ctaId).slice(0, 80) : undefined,
    featureId: event.featureId ? String(event.featureId).slice(0, 80) : undefined,
  };
  return sanitized;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const limit = Math.max(10, Math.min(500, Number(url.searchParams.get('limit') || 200)));
    const type = url.searchParams.get('type')?.trim() as WebTelemetryEventType | undefined;
    const surface = url.searchParams.get('surface')?.trim() as TelemetrySurface | undefined;
    const pathContains = url.searchParams.get('path')?.trim().toLowerCase();

    const events = await getWebTelemetryEvents();
    const filtered = events.filter((e) => {
      if (type && e.type !== type) return false;
      if (surface && e.surface !== surface) return false;
      if (pathContains && !String(e.path || '').toLowerCase().includes(pathContains)) return false;
      return true;
    });

    return NextResponse.json({ events: filtered.slice(0, limit).map(sanitizeEvent) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load telemetry events' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json().catch(() => null) as any;
    const maxAgeDays = Number(payload?.maxAgeDays);
    const keepLatest = Number(payload?.keepLatest);
    const all = Boolean(payload?.all);

    const result = await purgeWebTelemetryEvents({
      maxAgeMs: all ? 0 : (Number.isFinite(maxAgeDays) && maxAgeDays > 0 ? maxAgeDays * 24 * 60 * 60 * 1000 : undefined),
      keepLatest: Number.isFinite(keepLatest) ? keepLatest : 0,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to purge telemetry' }, { status: 500 });
  }
}

