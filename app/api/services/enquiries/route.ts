/**
 * Service enquiries.
 *
 * POST creates an enquiry and, with it, the provider's lead.
 * GET lists the caller's own enquiries — sent, received, or one by id.
 *
 * Identity is never taken from the client. The requester comes from the
 * session; the provider is resolved from the stored service record, so a
 * caller cannot address an enquiry to somebody else or attribute it to
 * somebody else.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserByEmail, getStoredUserById } from '@/lib/server/users';
import { getServiceById } from '@/lib/server/services';
import {
  createEnquiry,
  findRecentDuplicate,
  getEnquiriesForProvider,
  getEnquiriesForRequester,
  getEnquiryForViewer,
  type ContactMethod,
} from '@/lib/server/service-enquiries';

export const dynamic = 'force-dynamic';

const MESSAGE_MIN = 10;
const MESSAGE_MAX = 4000;
const FIELD_MAX = 200;
const CONTACT_METHODS: ContactMethod[] = ['platform', 'email', 'phone'];

/** The signed-in user, or null. Resolved from the session only. */
async function currentUser() {
  const session = await getAuthSession();
  const email = session?.user?.email;
  const id = session?.user?.id;
  if (id) {
    const byId = await getStoredUserById(id).catch(() => null);
    if (byId) return byId;
  }
  if (email) return getStoredUserByEmail(email).catch(() => null);
  return null;
}

function clean(value: unknown, max = FIELD_MAX): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/** ISO date (YYYY-MM-DD) or nothing — never a free-text date. */
function cleanDate(value: unknown): string | undefined {
  const raw = clean(value, 32);
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  return Number.isNaN(Date.parse(raw)) ? undefined : raw;
}

export async function POST(req: NextRequest) {
  try {
    const viewer = await currentUser();
    if (!viewer) {
      return NextResponse.json({ error: 'Sign in to send an enquiry.' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const serviceId = clean(body?.serviceId, 128);
    if (!serviceId) {
      return NextResponse.json({ error: 'serviceId is required.' }, { status: 400 });
    }

    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (message.length < MESSAGE_MIN) {
      return NextResponse.json(
        { error: `Tell the provider a little more — at least ${MESSAGE_MIN} characters.`, field: 'message' },
        { status: 400 },
      );
    }

    /* The service is the source of truth for who the provider is. */
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
      return NextResponse.json({ error: 'You cannot enquire about your own service.' }, { status: 400 });
    }

    const rawContact = clean(body?.contactMethod, 16) as ContactMethod | undefined;
    const contactMethod: ContactMethod =
      rawContact && CONTACT_METHODS.includes(rawContact) ? rawContact : 'platform';

    const phone = clean(body?.phone, 40);
    if (contactMethod === 'phone' && !phone) {
      return NextResponse.json(
        { error: 'Add a phone number, or choose another contact method.', field: 'phone' },
        { status: 400 },
      );
    }

    /* Server-side double-submit guard: an identical message for the same
       service within the window returns the original instead of a second
       lead, so a rapid double-click cannot create two. */
    const duplicate = await findRecentDuplicate(viewer.id, service.id, message);
    if (duplicate) {
      return NextResponse.json({ enquiry: publicShape(duplicate), duplicate: true }, { status: 200 });
    }

    const enquiry = await createEnquiry({
      serviceId: service.id,
      serviceTitle: service.title,
      providerId: provider.id,
      requesterId: viewer.id,
      message: message.slice(0, MESSAGE_MAX),
      budget: clean(body?.budget, 80),
      preferredStartDate: cleanDate(body?.preferredStartDate),
      expectedCompletionDate: cleanDate(body?.expectedCompletionDate),
      contactMethod,
      phone,
      company: clean(body?.company),
    });

    return NextResponse.json({ enquiry: publicShape(enquiry) }, { status: 201 });
  } catch (error) {
    console.error('[services/enquiries] POST error', error);
    return NextResponse.json({ error: 'Could not send your enquiry.' }, { status: 500 });
  }
}

/** Never returns internal user ids or contact details of the other party. */
function publicShape(e: Awaited<ReturnType<typeof createEnquiry>>) {
  return {
    id: e.id,
    reference: e.reference,
    serviceId: e.serviceId,
    serviceTitle: e.serviceTitle,
    status: e.status,
    createdAt: e.createdAt,
  };
}

export async function GET(req: NextRequest) {
  try {
    const viewer = await currentUser();
    if (!viewer) {
      return NextResponse.json({ error: 'Sign in to view enquiries.' }, { status: 401 });
    }

    const sp = new URL(req.url).searchParams;
    const id = sp.get('id');
    if (id) {
      /* Readable only by the two parties — anybody else gets a plain 404. */
      const one = await getEnquiryForViewer(id, viewer.id);
      if (!one) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
      return NextResponse.json({ enquiry: one });
    }

    const box = sp.get('box') === 'received' ? 'received' : 'sent';
    const list =
      box === 'received'
        ? await getEnquiriesForProvider(viewer.id)
        : await getEnquiriesForRequester(viewer.id);

    return NextResponse.json({ enquiries: list, box }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[services/enquiries] GET error', error);
    return NextResponse.json({ error: 'Could not load enquiries.' }, { status: 500 });
  }
}
