/**
 * One service, plus everything its page renders.
 *
 * Deliberately a single request: the service, its provider's public identity,
 * and the provider's other active services all come back together, so the
 * detail page never issues a follow-up call per field or per related service.
 *
 * Read-only. Profile → Services remains the only writer. Visibility rules
 * match the rest of the public service surface: the service must be active and
 * the provider's account must be live.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceById, getPublicUserServices } from '@/lib/server/services';
import { getStoredUserById } from '@/lib/server/users';
import { getProfileFields } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

/** Only the profile fields this page shows — never the whole document. */
const PROVIDER_FIELDS = ['avatarUrl', 'headline', 'bio', 'location'] as const;

export async function GET(req: NextRequest) {
  try {
    const serviceId = (new URL(req.url).searchParams.get('serviceId') || '').trim();
    if (!serviceId) {
      return NextResponse.json({ error: 'serviceId required' }, { status: 400 });
    }

    const service = await getServiceById(serviceId);
    // An unpublished service is indistinguishable from a missing one.
    if (!service || !service.isActive) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const provider = await getStoredUserById(service.userId).catch(() => null);
    const hidden =
      !provider ||
      provider.isActive === false ||
      Boolean(provider.deactivatedAt) ||
      Boolean(provider.pendingDeletion) ||
      provider.inviteStatus === 'disabled';
    if (!provider || hidden) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    /* One profile read and one services read for the whole page — the other
       services are already filtered to active by getPublicUserServices. */
    const [profile, providerServices] = await Promise.all([
      getProfileFields(provider.id, PROVIDER_FIELDS).catch(() => null),
      getPublicUserServices(provider.id).catch(() => [] as Awaited<ReturnType<typeof getPublicUserServices>>),
    ]);

    const others = providerServices.filter((s) => s.id !== service.id);
    const rated = providerServices.filter((s) => s.reviewCount > 0);

    return NextResponse.json({
      service: {
        id: service.id,
        title: service.title,
        tagline: service.tagline,
        description: service.description,
        category: service.category,
        tags: service.tags ?? [],
        pricingModel: service.pricingModel,
        basePrice: service.basePrice,
        currency: service.currency,
        /* Optional in the model — sent as null rather than invented, so the
           page can omit the whole section instead of rendering an empty one. */
        packages: service.packages?.length ? service.packages : null,
        deliveryTime: service.deliveryTime ?? null,
        deliveryUnit: service.deliveryUnit ?? null,
        imageUrl: service.imageUrl || null,
        gallery: service.gallery?.length ? service.gallery : null,
        faqs: service.faqs?.length ? service.faqs : null,
        featured: !!service.featured,
        rating: service.rating ?? 0,
        reviewCount: service.reviewCount ?? 0,
        bookingCount: service.bookingCount ?? 0,
        createdAt: service.createdAt,
      },
      /* Public identity only — no email, no role, no internal flags. */
      provider: {
        id: provider.id,
        name: provider.name?.trim() || 'Docrud member',
        avatarUrl: profile?.avatarUrl ?? null,
        headline: profile?.headline ?? null,
        bio: profile?.bio ?? null,
        location: profile?.location ?? null,
        memberSince: provider.createdAt ?? null,
        activeServiceCount: providerServices.length,
        /* Averaged across rated services only, so one unrated listing cannot
           drag the figure down to zero. Null when nothing is rated yet. */
        rating: rated.length
          ? Number((rated.reduce((t, s) => t + s.rating, 0) / rated.length).toFixed(2))
          : null,
        reviewCount: providerServices.reduce((t, s) => t + (s.reviewCount ?? 0), 0),
        completedBookings: providerServices.reduce((t, s) => t + (s.bookingCount ?? 0), 0),
      },
      /* Enough for the compact cards at the foot of the page — no second call. */
      otherServices: others.map((s) => ({
        id: s.id,
        title: s.title,
        tagline: s.tagline,
        category: s.category,
        pricingModel: s.pricingModel,
        basePrice: s.basePrice,
        currency: s.currency,
        imageUrl: s.imageUrl || null,
        rating: s.rating ?? 0,
        reviewCount: s.reviewCount ?? 0,
      })),
    });
  } catch (error) {
    console.error('[services/detail] GET error', error);
    return NextResponse.json({ error: 'Failed to load service.' }, { status: 500 });
  }
}
