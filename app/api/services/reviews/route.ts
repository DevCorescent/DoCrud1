import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import { getProfileData } from '@/lib/server/user-profiles';
import {
  getReviewsForService,
  createReview,
  hasReviewedBooking,
  getCompletedBookingForReviewer,
} from '@/lib/server/services';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const users = await getStoredUsers();
  return users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase()) ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const serviceId = searchParams.get('serviceId');
    if (!serviceId) return NextResponse.json({ error: 'serviceId required' }, { status: 400 });

    const reviews = await getReviewsForService(serviceId);
    return NextResponse.json({ reviews });
  } catch (error) {
    console.error('[services/reviews] GET error', error);
    return NextResponse.json({ error: 'Failed to load reviews.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as {
      serviceId: string;
      rating: number;
      headline: string;
      body: string;
      testimonial?: string;
      images?: unknown;
      aspects?: { quality?: unknown; communication?: unknown; delivery?: unknown };
      /* A client-sent `verified` is ignored on purpose — see below. */
      verified?: unknown;
    };

    if (!body.serviceId) return NextResponse.json({ error: 'serviceId required.' }, { status: 400 });
    if (!body.rating || body.rating < 1 || body.rating > 5) return NextResponse.json({ error: 'Rating must be 1–5.' }, { status: 400 });
    if (!body.headline?.trim()) return NextResponse.json({ error: 'Headline is required.' }, { status: 400 });
    if (!body.body?.trim()) return NextResponse.json({ error: 'Review body is required.' }, { status: 400 });

    // Must have a completed booking for this service
    const completedBooking = await getCompletedBookingForReviewer(actor.id, body.serviceId);
    if (!completedBooking) {
      return NextResponse.json(
        { error: 'You can only review a service after your booking has been marked as completed.' },
        { status: 403 },
      );
    }

    // One review per booking
    const alreadyReviewed = await hasReviewedBooking(completedBooking.id);
    if (alreadyReviewed) {
      return NextResponse.json({ error: 'You have already reviewed this booking.' }, { status: 409 });
    }

    // Fetch reviewer profile for avatar
    const profile = await getProfileData(actor.id);

    /* §28 optional images — only URLs from our own upload endpoint / storage. */
    const images = Array.isArray(body.images)
      ? body.images
        .map((raw) => (typeof raw === 'string' ? raw.trim() : ''))
        .filter((url) => url && url.length < 2000 && (url.startsWith('/uploads/') || /^https?:\/\//i.test(url)))
        .slice(0, 6)
      : [];

    /* §28 service-specific feedback — per-aspect 1–5, each optional. */
    const aspectScore = (v: unknown) => {
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
      return Number.isFinite(n) && n >= 1 && n <= 5 ? Math.round(n) : undefined;
    };
    const aspects = {
      ...(aspectScore(body.aspects?.quality) ? { quality: aspectScore(body.aspects?.quality) } : {}),
      ...(aspectScore(body.aspects?.communication) ? { communication: aspectScore(body.aspects?.communication) } : {}),
      ...(aspectScore(body.aspects?.delivery) ? { delivery: aspectScore(body.aspects?.delivery) } : {}),
    };

    const review = await createReview({
      serviceId: body.serviceId,
      serviceUserId: completedBooking.serviceUserId,
      bookingId: completedBooking.id,
      reviewerId: actor.id,
      reviewerName: actor.name,
      reviewerAvatar: profile.avatarUrl,
      rating: Math.round(body.rating),
      headline: body.headline.trim(),
      body: body.body.trim(),
      testimonial: body.testimonial?.trim() || undefined,
      ...(images.length ? { images } : {}),
      ...(Object.keys(aspects).length ? { aspects } : {}),
      /* "Verified Service": true because `getCompletedBookingForReviewer`
         above found a completed engagement for THIS reviewer and service.
         Derived here, never read from the request. */
      verified: true,
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch (error) {
    console.error('[services/reviews] POST error', error);
    return NextResponse.json({ error: 'Failed to submit review.' }, { status: 500 });
  }
}
