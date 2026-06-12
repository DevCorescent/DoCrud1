import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers, getAuthSession } from '@/lib/server/auth';
import {
  createBooking,
  getBookingsForProvider,
  getBookingsForClient,
  updateBookingStatus,
  getServiceById,
  type BookingStatus,
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
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role') ?? 'provider';

    const bookings = role === 'client'
      ? await getBookingsForClient(actor.id)
      : await getBookingsForProvider(actor.id);

    return NextResponse.json({ bookings });
  } catch (error) {
    console.error('[services/bookings] GET error', error);
    return NextResponse.json({ error: 'Failed to load bookings.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      serviceId: string;
      clientName: string;
      clientEmail: string;
      clientPhone?: string;
      clientMessage: string;
      packageName?: string;
      scheduledDate?: string;
    };

    if (!body.serviceId) return NextResponse.json({ error: 'serviceId required' }, { status: 400 });
    if (!body.clientName?.trim()) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    if (!body.clientEmail?.trim()) return NextResponse.json({ error: 'Email is required.' }, { status: 400 });

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(body.clientEmail)) return NextResponse.json({ error: 'Valid email required.' }, { status: 400 });

    const service = await getServiceById(body.serviceId);
    if (!service || !service.isActive) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });

    // Optionally attach clientId if logged in
    const session = await getAuthSession();
    let clientId: string | undefined;
    if (session?.user?.email) {
      const users = await getStoredUsers();
      const actor = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
      if (actor) clientId = actor.id;
    }

    let price = service.basePrice;
    if (body.packageName && service.packages) {
      const pkg = service.packages.find((p) => p.name === body.packageName);
      if (pkg) price = pkg.price;
    }

    const booking = await createBooking({
      serviceId: service.id,
      serviceTitle: service.title,
      serviceUserId: service.userId,
      clientId,
      clientName: body.clientName.trim(),
      clientEmail: body.clientEmail.trim().toLowerCase(),
      clientPhone: body.clientPhone?.trim() || undefined,
      clientMessage: body.clientMessage?.trim() ?? '',
      packageName: body.packageName,
      price,
      currency: service.currency,
      status: 'pending',
      scheduledDate: body.scheduledDate,
    });

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    console.error('[services/bookings] POST error', error);
    return NextResponse.json({ error: 'Failed to create booking.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { bookingId, status } = await req.json() as { bookingId: string; status: BookingStatus };
    if (!bookingId || !status) return NextResponse.json({ error: 'bookingId and status required.' }, { status: 400 });

    const booking = await updateBookingStatus(bookingId, status);
    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });

    return NextResponse.json({ booking });
  } catch (error) {
    console.error('[services/bookings] PATCH error', error);
    return NextResponse.json({ error: 'Failed to update booking.' }, { status: 500 });
  }
}
