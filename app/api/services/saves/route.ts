import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserById } from '@/lib/server/users';
import { getServiceById, trackAnalyticsEvent } from '@/lib/server/services';
import {
  isServiceSaved,
  listSavedServiceIds,
  listSavedServices,
  saveService,
  unsaveService,
} from '@/lib/server/service-saves';

export const dynamic = 'force-dynamic';

/** Session → stored user. The owner of a save is never read from the request. */
async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  return getStoredUserById(session.user.id);
}

/**
 * GET
 *   ?ids=1        → just the saved service ids, for marking cards
 *   ?serviceId=X  → whether that one service is saved
 *   (default)     → the saved list, enriched for the saved section
 */
export async function GET(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);

    if (searchParams.get('ids') === '1') {
      return NextResponse.json({ serviceIds: await listSavedServiceIds(actor.id) });
    }

    const single = searchParams.get('serviceId');
    if (single) {
      return NextResponse.json({ saved: await isServiceSaved(actor.id, single) });
    }

    const saves = await listSavedServices(actor.id);

    /* A saved service can be deleted or unpublished after the fact. Those rows
       are still returned, flagged unavailable, so the section degrades instead
       of dropping rows the user does not understand the loss of. */
    const items = await Promise.all(saves.map(async (save) => {
      const service = await getServiceById(save.serviceId).catch(() => null);
      if (!service) {
        return { saveId: save.id, serviceId: save.serviceId, savedAt: save.createdAt, available: false as const };
      }
      const provider = service.userId ? await getStoredUserById(service.userId).catch(() => null) : null;
      return {
        saveId: save.id,
        serviceId: service.id,
        savedAt: save.createdAt,
        available: service.isActive,
        title: service.title,
        tagline: service.tagline,
        category: service.category,
        imageUrl: service.imageUrl,
        currency: service.currency,
        basePrice: service.basePrice,
        pricingModel: service.pricingModel,
        rating: service.rating,
        reviewCount: service.reviewCount,
        providerId: service.userId,
        providerName: provider?.name ?? 'Provider',
        href: service.userId ? `/services/${service.userId}?service=${service.id}` : null,
      };
    }));

    return NextResponse.json({ items, total: items.length });
  } catch (error) {
    console.error('[services/saves] GET error', error);
    return NextResponse.json({ error: 'Failed to load saved services.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Please sign in to save services.' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { serviceId?: string } | null;
    const serviceId = String(body?.serviceId ?? '').trim();
    if (!serviceId) return NextResponse.json({ error: 'serviceId is required.' }, { status: 400 });

    const service = await getServiceById(serviceId);
    if (!service) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });
    if (!service.isActive) return NextResponse.json({ error: 'This service is not available.' }, { status: 409 });

    const alreadySaved = await isServiceSaved(actor.id, service.id);
    const save = await saveService(actor.id, service.id);

    /* §35 — a re-save of the same service is not a new save event. */
    if (!alreadySaved) {
      void trackAnalyticsEvent({
        serviceId: service.id, serviceUserId: service.userId, type: 'service_saved',
        source: 'direct', actorId: actor.id,
      }).catch(() => {});
    }

    return NextResponse.json({ saved: true, save: { id: save.id, serviceId: save.serviceId, createdAt: save.createdAt } }, { status: 201 });
  } catch (error) {
    console.error('[services/saves] POST error', error);
    return NextResponse.json({ error: 'Failed to save this service.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const serviceId = (searchParams.get('serviceId') ?? '').trim();
    if (!serviceId) return NextResponse.json({ error: 'serviceId is required.' }, { status: 400 });

    /* Scoped to the session user, so one account can only ever remove its own
       save even when the service id belongs to somebody else's shortlist. */
    const removed = await unsaveService(actor.id, serviceId);
    return NextResponse.json({ saved: false, removed });
  } catch (error) {
    console.error('[services/saves] DELETE error', error);
    return NextResponse.json({ error: 'Failed to remove this saved service.' }, { status: 500 });
  }
}
