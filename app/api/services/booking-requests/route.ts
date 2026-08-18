/**
 * Book Service — booking requests.
 *
 * POST creates a request in the `requested` state.
 * GET lists the caller's own requests — sent, received, or one by id.
 *
 * Nothing about identity or money comes from the client: the requester is the
 * session user, the provider is read off the stored service, and the price is
 * re-resolved from the service's own package list. A client that submits a
 * price is ignored entirely.
 *
 * No payment is taken. There is no payment infrastructure in this codebase, so
 * a booking request is a request — it never claims money changed hands.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserByEmail, getStoredUserById } from '@/lib/server/users';
import { getServiceById } from '@/lib/server/services';
import {
  createBookingRequest,
  findRecentDuplicate,
  getBookingRequestsForProvider,
  getBookingRequestsForRequester,
  getBookingRequestForViewer,
  type ServiceBookingRequest,
} from '@/lib/server/service-booking-requests';

export const dynamic = 'force-dynamic';

const REQUIREMENTS_MIN = 10;
const REQUIREMENTS_MAX = 4000;

async function currentUser() {
  const session = await getAuthSession();
  const id = session?.user?.id;
  const email = session?.user?.email;
  if (id) {
    const byId = await getStoredUserById(id).catch(() => null);
    if (byId) return byId;
  }
  if (email) return getStoredUserByEmail(email).catch(() => null);
  return null;
}

function clean(value: unknown, max = 200): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

/** Strict calendar date, or undefined. Never a reinterpreted free-text date. */
function cleanDate(value: unknown): string | undefined | null {
  const raw = clean(value, 32);
  if (raw === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) return null; // invalid
  return raw;
}

export async function POST(req: NextRequest) {
  try {
    const viewer = await currentUser();
    if (!viewer) {
      return NextResponse.json({ error: 'Sign in to book a service.' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const serviceId = clean(body?.serviceId, 128);
    if (!serviceId) {
      return NextResponse.json({ error: 'serviceId is required.' }, { status: 400 });
    }

    const requirements = typeof body?.requirements === 'string' ? body.requirements.trim() : '';
    if (requirements.length < REQUIREMENTS_MIN) {
      return NextResponse.json(
        { error: `Describe what you need — at least ${REQUIREMENTS_MIN} characters.`, field: 'requirements' },
        { status: 400 },
      );
    }

    /* The stored service decides who the provider is and what things cost. */
    const service = await getServiceById(serviceId);
    if (!service || !service.isActive) {
      return NextResponse.json({ error: 'This service is no longer available.' }, { status: 404 });
    }

    const provider = await getStoredUserById(service.userId).catch(() => null);
    const providerHidden =
      !provider ||
      provider.isActive === false ||
      Boolean(provider.deactivatedAt) ||
      Boolean(provider.pendingDeletion) ||
      provider.inviteStatus === 'disabled';
    if (!provider || providerHidden) {
      return NextResponse.json({ error: 'This service is no longer available.' }, { status: 404 });
    }

    if (provider.id === viewer.id) {
      return NextResponse.json({ error: 'You cannot book your own service.' }, { status: 400 });
    }

    /* Package and price are resolved from the service, never from the body.
       A named package that does not exist is rejected rather than quietly
       falling back to the base price — otherwise a client could book a
       "Premium" job at the Basic rate. */
    const requestedPackage = clean(body?.packageName, 120);
    let packageName: string | null = null;
    let price: number | null = null;

    if (requestedPackage) {
      const pkg = service.packages?.find((p) => p.name === requestedPackage);
      if (!pkg) {
        return NextResponse.json({ error: 'That package is not available for this service.', field: 'packageName' }, { status: 400 });
      }
      packageName = pkg.name;
      price = pkg.price;
    } else {
      // No package chosen — the service's own pricing model applies.
      price = service.pricingModel === 'contact' ? null : service.basePrice;
    }

    const start = cleanDate(body?.preferredStartDate);
    const end = cleanDate(body?.expectedCompletionDate);
    if (start === null || end === null) {
      return NextResponse.json({ error: 'Enter a valid date.', field: 'dates' }, { status: 400 });
    }
    if (start && end && Date.parse(end) < Date.parse(start)) {
      return NextResponse.json(
        { error: 'The completion date cannot be before the start date.', field: 'dates' },
        { status: 400 },
      );
    }

    /* Server-side double-submit guard: an identical request within the window
       returns the original, so a rapid double-click cannot create two. */
    const duplicate = await findRecentDuplicate(viewer.id, service.id, packageName, requirements);
    if (duplicate) {
      return NextResponse.json({ booking: publicShape(duplicate), duplicate: true }, { status: 200 });
    }

    const booking = await createBookingRequest({
      serviceId: service.id,
      serviceTitle: service.title,
      providerId: provider.id,
      requesterId: viewer.id,
      packageName,
      price,
      currency: service.currency,
      pricingModel: service.pricingModel,
      requirements: requirements.slice(0, REQUIREMENTS_MAX),
      preferredStartDate: start,
      expectedCompletionDate: end,
      phone: clean(body?.phone, 40),
      notes: clean(body?.notes, 1000),
    });

    return NextResponse.json({ booking: publicShape(booking) }, { status: 201 });
  } catch (error) {
    console.error('[services/booking-requests] POST error', error);
    return NextResponse.json({ error: 'Could not send your booking request.' }, { status: 500 });
  }
}

/** Confirmation payload — carries no internal user ids. */
function publicShape(b: ServiceBookingRequest) {
  return {
    id: b.id,
    reference: b.reference,
    serviceId: b.serviceId,
    serviceTitle: b.serviceTitle,
    packageName: b.packageName,
    price: b.price,
    currency: b.currency,
    status: b.status,
    createdAt: b.createdAt,
  };
}

export async function GET(req: NextRequest) {
  try {
    const viewer = await currentUser();
    if (!viewer) {
      return NextResponse.json({ error: 'Sign in to view bookings.' }, { status: 401 });
    }

    const sp = new URL(req.url).searchParams;
    const id = sp.get('id');
    if (id) {
      const one = await getBookingRequestForViewer(id, viewer.id);
      if (!one) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
      return NextResponse.json({ booking: one });
    }

    const box = sp.get('box') === 'received' ? 'received' : 'sent';
    const list =
      box === 'received'
        ? await getBookingRequestsForProvider(viewer.id)
        : await getBookingRequestsForRequester(viewer.id);

    return NextResponse.json({ bookings: list, box }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[services/booking-requests] GET error', error);
    return NextResponse.json({ error: 'Could not load bookings.' }, { status: 500 });
  }
}
