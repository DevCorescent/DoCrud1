import { NextRequest, NextResponse } from 'next/server';
import { getServiceById, trackAnalyticsEvent, type AnalyticsEventType } from '@/lib/server/services';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      serviceId: string;
      type: AnalyticsEventType;
      visitorId?: string;
      source?: 'profile' | 'catalogue' | 'direct';
    };

    if (!body.serviceId || !body.type) {
      return NextResponse.json({ error: 'serviceId and type required.' }, { status: 400 });
    }

    const validTypes: AnalyticsEventType[] = ['view', 'detail_open', 'book_click', 'booking_submitted'];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json({ error: 'Invalid event type.' }, { status: 400 });
    }

    const service = await getServiceById(body.serviceId);
    if (!service) return NextResponse.json({ ok: true }); // silently ignore unknown services

    await trackAnalyticsEvent({
      serviceId: body.serviceId,
      serviceUserId: service.userId,
      type: body.type,
      visitorId: body.visitorId,
      source: body.source ?? 'direct',
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[services/analytics/track] POST error', error);
    return NextResponse.json({ ok: true }); // never block the UI for analytics failures
  }
}
