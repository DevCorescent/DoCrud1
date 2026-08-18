import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import {
  getServiceById,
  trackAnalyticsEvent,
  ANALYTICS_EVENT_TYPES,
  type AnalyticsEventType,
} from '@/lib/server/services';

export const dynamic = 'force-dynamic';

/** Small, non-sensitive context only — strings/numbers/booleans, capped. */
function cleanMetadata(raw: unknown): Record<string, string | number | boolean> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 8)) {
    const key = k.slice(0, 32);
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof v === 'boolean') out[key] = v;
    else if (typeof v === 'string') out[key] = v.slice(0, 120);
  }
  return Object.keys(out).length ? out : undefined;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      serviceId: string;
      type: AnalyticsEventType;
      visitorId?: string;
      source?: 'profile' | 'catalogue' | 'direct';
      metadata?: unknown;
    };

    if (!body.serviceId || !body.type) {
      return NextResponse.json({ error: 'serviceId and type required.' }, { status: 400 });
    }
    if (!ANALYTICS_EVENT_TYPES.includes(body.type)) {
      return NextResponse.json({ error: 'Invalid event type.' }, { status: 400 });
    }

    const service = await getServiceById(body.serviceId);
    if (!service) return NextResponse.json({ ok: true }); // silently ignore unknown services

    /* Actor is resolved from the session, never accepted from the body. */
    const session = await getAuthSession();
    const actorId = session?.user?.id;
    const metadata = cleanMetadata(body.metadata);

    await trackAnalyticsEvent({
      serviceId: body.serviceId,
      serviceUserId: service.userId,
      type: body.type,
      visitorId: body.visitorId,
      source: body.source ?? 'direct',
      ...(actorId ? { actorId } : {}),
      ...(metadata ? { metadata } : {}),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[services/analytics/track] POST error', error);
    return NextResponse.json({ ok: true }); // never block the UI for analytics failures
  }
}
