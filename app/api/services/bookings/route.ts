import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserById } from '@/lib/server/users';
import { getProfileData } from '@/lib/server/user-profiles';
import { getOrCreateConversation, sendMessage } from '@/lib/server/messages';
import { sanitizeHtml, isValidEmail } from '@/lib/server/security';
import {
  createBooking,
  findRecentDuplicateBooking,
  getBookingById,
  getBookingsForProvider,
  getBookingsForClient,
  linkBooking,
  updateBookingStatus,
  getServiceById,
  type BookingStatus,
  type ServiceBooking,
} from '@/lib/server/services';
import {
  createServiceLead,
  getServiceLeadForSource,
  type ServiceLeadAttachment,
} from '@/lib/server/service-leads';

export const dynamic = 'force-dynamic';

/** Repeated "Send Booking Request" inside this window resolves to one booking. */
const DUPLICATE_BOOKING_WINDOW_MS = 10 * 60 * 1000;
const REQUIREMENT_MIN_LENGTH = 10;
const REQUIREMENT_MAX_LENGTH = 4000;
const NOTES_MAX_LENGTH = 1000;
const MAX_ATTACHMENTS = 5;

/** Session → stored user. Identity is never read from the request body. */
async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  return getStoredUserById(session.user.id);
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  const printable = sanitizeHtml(value)
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return ch === '\n' || ch === '\t' || (code >= 32 && code !== 127);
    })
    .join('');
  return printable.trim().slice(0, maxLength);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !ISO_DATE.test(value.trim())) return undefined;
  const trimmed = value.trim();
  return Number.isNaN(new Date(trimmed).getTime()) ? undefined : trimmed;
}

function cleanAmount(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return undefined;
  return Math.round(n);
}

function cleanAttachments(value: unknown): ServiceLeadAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const raw = item as Partial<ServiceLeadAttachment>;
      const url = typeof raw?.url === 'string' ? raw.url.trim() : '';
      const allowed = url.startsWith('/uploads/') || /^https?:\/\//i.test(url);
      if (!allowed || url.length > 2000) return null;
      return {
        url,
        name: cleanText(raw?.name, 120) || 'attachment',
        ...(Number.isFinite(raw?.size) ? { size: Number(raw?.size) } : {}),
        ...(typeof raw?.mimeType === 'string' ? { mimeType: raw.mimeType.slice(0, 100) } : {}),
      } as ServiceLeadAttachment;
    })
    .filter((item): item is ServiceLeadAttachment => item !== null)
    .slice(0, MAX_ATTACHMENTS);
}

async function providerSummary(providerId: string) {
  const [user, profile] = await Promise.all([
    getStoredUserById(providerId),
    getProfileData(providerId).catch(() => ({})),
  ]);
  return {
    id: providerId,
    name: user?.name ?? 'Provider',
    avatarUrl: (profile as { avatarUrl?: string }).avatarUrl,
    href: `/u/${providerId}`,
  };
}

/** The booking-request message the provider sees in the Services tab of Messages. */
function composeBookingMessage(booking: ServiceBooking) {
  const lines = [`Booking request — "${booking.serviceTitle}"`, ''];
  if (booking.packageName) lines.push(`Package: ${booking.packageName}`);
  if (booking.price != null) lines.push(`Price: ${booking.currency} ${booking.price.toLocaleString()}`);
  lines.push('', booking.requirement ?? booking.clientMessage);
  if (booking.scheduledDate || booking.expectedDeliveryDate) {
    const start = booking.scheduledDate ? `start ${booking.scheduledDate}` : '';
    const end = booking.expectedDeliveryDate ? `delivery by ${booking.expectedDeliveryDate}` : '';
    lines.push('', `Timeline: ${[start, end].filter(Boolean).join(' · ')}`);
  }
  if (booking.budgetMin != null || booking.budgetMax != null) {
    const b = booking.budgetMin != null && booking.budgetMax != null
      ? `${booking.budgetMin.toLocaleString()} – ${booking.budgetMax.toLocaleString()}`
      : booking.budgetMin != null ? `${booking.budgetMin.toLocaleString()}+` : `up to ${booking.budgetMax!.toLocaleString()}`;
    lines.push(`Budget: ${booking.currency} ${b}`);
  }
  if (booking.additionalNotes) lines.push('', `Notes: ${booking.additionalNotes}`);
  if (booking.attachments?.length) {
    lines.push(`Attachments: ${booking.attachments.length} file${booking.attachments.length === 1 ? '' : 's'}`);
  }
  return lines.join('\n').slice(0, 4000);
}

/* ─── GET — my bookings, as provider or client ─────────────────────────── */

export async function GET(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const bookingId = searchParams.get('id');

    /* Single booking — only the two parties may read it. */
    if (bookingId) {
      const booking = await getBookingById(bookingId);
      if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
      const isProvider = booking.serviceUserId === actor.id;
      const isClient = booking.clientId === actor.id;
      if (!isProvider && !isClient) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
      return NextResponse.json({ booking, role: isProvider ? 'provider' : 'client' });
    }

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

/* ─── POST — send a booking request (§19–21) ───────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    /* §25 — booking requires an account; identity comes from the session only. */
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Please sign in to send a booking request.' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

    /* — service + provider — */
    const serviceId = typeof body.serviceId === 'string' ? body.serviceId.trim() : '';
    if (!serviceId) return NextResponse.json({ error: 'serviceId is required.' }, { status: 400 });

    const service = await getServiceById(serviceId);
    if (!service) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });
    if (!service.isActive) return NextResponse.json({ error: 'This service is not accepting bookings.' }, { status: 409 });
    if (!service.userId) return NextResponse.json({ error: 'This service has no provider attached.' }, { status: 409 });

    const provider = await getStoredUserById(service.userId);
    if (!provider) return NextResponse.json({ error: 'Provider not found.' }, { status: 404 });
    if (provider.id === actor.id) return NextResponse.json({ error: 'You cannot book your own service.' }, { status: 400 });

    /* — requirements (§20, required). `clientMessage` kept as a legacy alias. — */
    const requirement = cleanText(body.requirement ?? body.clientMessage, REQUIREMENT_MAX_LENGTH);
    if (requirement.length < REQUIREMENT_MIN_LENGTH) {
      return NextResponse.json(
        { error: `Please describe your requirements in at least ${REQUIREMENT_MIN_LENGTH} characters.` },
        { status: 400 },
      );
    }

    /* — package must belong to THIS service — */
    const packageName = typeof body.packageName === 'string' ? body.packageName.trim() : '';
    let price = service.basePrice;
    let selectedPackage: string | undefined;
    if (packageName) {
      const pkg = service.packages?.find((p) => p.name === packageName);
      if (!pkg) return NextResponse.json({ error: 'Selected package is not available for this service.' }, { status: 400 });
      price = pkg.price;
      selectedPackage = pkg.name;
    }

    /* — timeline — */
    const scheduledDate = cleanDate(body.scheduledDate ?? body.preferredStartDate);
    const expectedDeliveryDate = cleanDate(body.expectedDeliveryDate);
    if (scheduledDate && expectedDeliveryDate && scheduledDate > expectedDeliveryDate) {
      return NextResponse.json({ error: 'Expected delivery cannot be before the start date.' }, { status: 400 });
    }

    /* — budget — */
    const budgetMin = cleanAmount(body.budgetMin);
    const budgetMax = cleanAmount(body.budgetMax);
    if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
      return NextResponse.json({ error: 'Budget minimum cannot exceed the maximum.' }, { status: 400 });
    }

    /* — contact details: profile is the source, body may only refine them — */
    const clientName = cleanText(body.clientName, 120) || actor.name;
    const providedEmail = typeof body.clientEmail === 'string' ? body.clientEmail.trim().toLowerCase() : '';
    const clientEmail = providedEmail && isValidEmail(providedEmail) ? providedEmail : actor.email;
    if (!clientEmail || !isValidEmail(clientEmail)) {
      return NextResponse.json({ error: 'A valid contact email is required.' }, { status: 400 });
    }
    const clientPhone = cleanText(body.clientPhone, 20).replace(/[^\d+\-\s()]/g, '') || undefined;

    const attachments = cleanAttachments(body.attachments);
    const additionalNotes = cleanText(body.additionalNotes, NOTES_MAX_LENGTH) || undefined;

    /* — duplicate protection: identical resend inside the window — */
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${actor.id}|${service.id}|${selectedPackage ?? ''}|${requirement.toLowerCase().replace(/\s+/g, ' ')}`)
      .digest('hex')
      .slice(0, 32);

    const duplicate = await findRecentDuplicateBooking(actor.id, fingerprint, DUPLICATE_BOOKING_WINDOW_MS);
    if (duplicate) {
      const existingLead = await getServiceLeadForSource('booking', duplicate.id);
      return NextResponse.json({
        duplicate: true,
        booking: duplicate,
        lead: existingLead ? { id: existingLead.id, type: existingLead.type, status: existingLead.status } : null,
        conversation: duplicate.conversationId
          ? { id: duplicate.conversationId, href: `/messages?user=${provider.id}` }
          : null,
        provider: await providerSummary(provider.id),
        message: 'This booking request has already been sent.',
      }, { status: 200 });
    }

    /* — create the booking request (no payment: §19 Booking Request model) — */
    const booking = await createBooking({
      serviceId: service.id,
      serviceTitle: service.title,
      serviceUserId: provider.id,
      clientId: actor.id,
      clientName,
      clientEmail,
      clientPhone,
      clientMessage: requirement,
      requirement,
      packageName: selectedPackage,
      price,
      currency: service.currency,
      status: 'pending',
      scheduledDate,
      expectedDeliveryDate,
      budgetMin,
      budgetMax,
      attachments,
      additionalNotes,
      fingerprint,
    });

    /* — conversation: reuse the existing service messaging — */
    let conversationId: string | undefined;
    try {
      const { conversation } = await getOrCreateConversation(actor.id, provider.id, 'service');
      conversationId = conversation.id;
      await sendMessage(conversation.id, actor.id, composeBookingMessage(booking), 'text');
    } catch (error) {
      console.error('[services/bookings] conversation failed', error);
    }

    /* — exactly one lead, idempotent on the booking id (§22/§23) — */
    const lead = await createServiceLead({
      type: 'booking',
      providerId: provider.id,
      customerId: actor.id,
      customerName: clientName,
      serviceId: service.id,
      serviceTitle: service.title,
      bookingId: booking.id,
      requirement,
      ...(budgetMin != null || budgetMax != null
        ? { budget: { ...(budgetMin != null ? { min: budgetMin } : {}), ...(budgetMax != null ? { max: budgetMax } : {}), currency: service.currency } }
        : {}),
      ...(scheduledDate || expectedDeliveryDate
        ? { timeline: { ...(scheduledDate ? { startDate: scheduledDate } : {}), ...(expectedDeliveryDate ? { completionDate: expectedDeliveryDate } : {}) } }
        : {}),
      attachments,
      contactMethod: clientPhone ? 'phone' : 'email',
      contactEmail: clientEmail,
      contactPhone: clientPhone,
      packageName: selectedPackage,
      price,
      conversationId,
      status: 'booking_requested',
    });

    const linked = await linkBooking(booking.id, { leadId: lead.id, conversationId });

    return NextResponse.json({
      duplicate: false,
      booking: linked ?? { ...booking, leadId: lead.id, conversationId },
      lead: { id: lead.id, type: lead.type, status: lead.status },
      conversation: conversationId ? { id: conversationId, href: `/messages?user=${provider.id}` } : null,
      provider: await providerSummary(provider.id),
    }, { status: 201 });
  } catch (error) {
    console.error('[services/bookings] POST error', error);
    return NextResponse.json({ error: 'Failed to send booking request.' }, { status: 500 });
  }
}

/* ─── PATCH — update a booking's status ────────────────────────────────── */

/** Who may move a booking into a given status. */
function canTransition(role: 'provider' | 'client', status: BookingStatus) {
  if (role === 'provider') return true;              // provider owns the lifecycle
  return status === 'cancelled';                     // customer may only cancel
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { bookingId, status } = await req.json() as { bookingId?: string; status?: BookingStatus };
    if (!bookingId || !status) return NextResponse.json({ error: 'bookingId and status required.' }, { status: 400 });

    const valid: BookingStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!valid.includes(status)) return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });

    /* Ownership check — previously absent, so any signed-in user could move
       any booking through its lifecycle. */
    const existing = await getBookingById(bookingId);
    if (!existing) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });

    const isProvider = existing.serviceUserId === actor.id;
    const isClient = existing.clientId === actor.id;
    if (!isProvider && !isClient) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    if (!canTransition(isProvider ? 'provider' : 'client', status)) {
      return NextResponse.json({ error: 'Not permitted to set this status.' }, { status: 403 });
    }

    const booking = await updateBookingStatus(bookingId, status);
    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });

    return NextResponse.json({ booking });
  } catch (error) {
    console.error('[services/bookings] PATCH error', error);
    return NextResponse.json({ error: 'Failed to update booking.' }, { status: 500 });
  }
}
