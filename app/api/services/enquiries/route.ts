import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserById } from '@/lib/server/users';
import { getProfileData } from '@/lib/server/user-profiles';
import { getServiceById } from '@/lib/server/services';
import { getOrCreateConversation, sendMessage } from '@/lib/server/messages';
import { sanitizeHtml, isValidEmail } from '@/lib/server/security';
import {
  createServiceEnquiry,
  findRecentDuplicateEnquiry,
  getServiceEnquiryById,
  linkServiceEnquiry,
  listServiceEnquiries,
  CONTACT_METHODS,
  COMPANY_INFO_MAX_LENGTH,
  MAX_ATTACHMENTS,
  REQUIREMENT_MAX_LENGTH,
  REQUIREMENT_MIN_LENGTH,
  type ServiceEnquiry,
} from '@/lib/server/service-enquiries';
import {
  createServiceLead,
  getServiceLeadForSource,
  type ServiceContactMethod,
  type ServiceLeadAttachment,
  type ServiceLeadBudget,
  type ServiceLeadTimeline,
} from '@/lib/server/service-leads';

export const dynamic = 'force-dynamic';

/* ─── helpers ──────────────────────────────────────────────────────────── */

/** Session → stored user. Identity is never read from the request body. */
async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  return getStoredUserById(session.user.id);
}

/** Free text: strip script/handler payloads and control chars, then clamp. */
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
      // Only accept URLs produced by our own upload endpoint / storage.
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

/** Shape returned to the §18 success state. Contact details are never echoed. */
function publicEnquiry(enquiry: ServiceEnquiry) {
  return {
    id: enquiry.id,
    serviceId: enquiry.serviceId,
    serviceTitle: enquiry.serviceTitle,
    providerId: enquiry.providerId,
    requirement: enquiry.requirement,
    contactMethod: enquiry.contactMethod,
    budget: enquiry.budget,
    timeline: enquiry.timeline,
    attachments: enquiry.attachments,
    companyInfo: enquiry.companyInfo,
    leadId: enquiry.leadId,
    conversationId: enquiry.conversationId,
    createdAt: enquiry.createdAt,
  };
}

function formatBudget(budget?: ServiceLeadBudget) {
  if (!budget || (budget.min == null && budget.max == null)) return null;
  const c = budget.currency;
  if (budget.min != null && budget.max != null) return `${c} ${budget.min.toLocaleString()} – ${budget.max.toLocaleString()}`;
  if (budget.min != null) return `${c} ${budget.min.toLocaleString()}+`;
  return `Up to ${c} ${budget.max!.toLocaleString()}`;
}

/** The message the provider actually sees in the Services tab of Messages. */
function composeConversationMessage(enquiry: ServiceEnquiry) {
  const lines = [`Enquiry about "${enquiry.serviceTitle}"`, '', enquiry.requirement];
  const budget = formatBudget(enquiry.budget);
  if (budget) lines.push('', `Budget: ${budget}`);
  if (enquiry.timeline?.startDate || enquiry.timeline?.completionDate) {
    const start = enquiry.timeline.startDate ? `starts ${enquiry.timeline.startDate}` : '';
    const end = enquiry.timeline.completionDate ? `needed by ${enquiry.timeline.completionDate}` : '';
    lines.push(`Timeline: ${[start, end].filter(Boolean).join(', ')}`);
  }
  if (enquiry.companyInfo) lines.push(`Company/project: ${enquiry.companyInfo}`);
  if (enquiry.attachments.length > 0) {
    lines.push(`Attachments: ${enquiry.attachments.length} file${enquiry.attachments.length === 1 ? '' : 's'}`);
  }
  return lines.join('\n').slice(0, 4000);
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
    headline: (profile as { headline?: string }).headline,
    href: `/u/${providerId}`,
  };
}

/* ─── POST — submit an enquiry (§17 → §18) ─────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Please sign in to send an enquiry.' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

    /* — service + provider relationship — */
    const serviceId = typeof body.serviceId === 'string' ? body.serviceId.trim() : '';
    if (!serviceId) return NextResponse.json({ error: 'serviceId is required.' }, { status: 400 });

    const service = await getServiceById(serviceId);
    if (!service) return NextResponse.json({ error: 'Service not found.' }, { status: 404 });
    if (!service.isActive) return NextResponse.json({ error: 'This service is not accepting enquiries.' }, { status: 409 });
    if (!service.userId) return NextResponse.json({ error: 'This service has no provider attached.' }, { status: 409 });

    const provider = await getStoredUserById(service.userId);
    if (!provider) return NextResponse.json({ error: 'Provider not found.' }, { status: 404 });
    if (provider.id === actor.id) return NextResponse.json({ error: 'You cannot enquire about your own service.' }, { status: 400 });

    /* — required fields — */
    const requirement = cleanText(body.requirement ?? body.message, REQUIREMENT_MAX_LENGTH);
    if (requirement.length < REQUIREMENT_MIN_LENGTH) {
      return NextResponse.json(
        { error: `Please describe what you need in at least ${REQUIREMENT_MIN_LENGTH} characters.` },
        { status: 400 },
      );
    }

    const contactMethodRaw = typeof body.contactMethod === 'string' ? body.contactMethod.trim() : '';
    if (!CONTACT_METHODS.includes(contactMethodRaw as ServiceContactMethod)) {
      return NextResponse.json({ error: 'Select a preferred contact method.' }, { status: 400 });
    }
    const contactMethod = contactMethodRaw as ServiceContactMethod;

    /* Store only the channel the customer chose. Chat keeps everything private. */
    let contactEmail: string | undefined;
    let contactPhone: string | undefined;
    if (contactMethod === 'email') {
      const provided = typeof body.contactEmail === 'string' ? body.contactEmail.trim().toLowerCase() : '';
      const email = provided || actor.email;
      if (!email || !isValidEmail(email)) return NextResponse.json({ error: 'A valid email is required for email contact.' }, { status: 400 });
      contactEmail = email;
    }
    if (contactMethod === 'phone') {
      const phone = cleanText(body.contactPhone, 20).replace(/[^\d+\-\s()]/g, '');
      if (phone.replace(/\D/g, '').length < 7) return NextResponse.json({ error: 'A valid phone number is required for phone contact.' }, { status: 400 });
      contactPhone = phone;
    }

    /* — optional fields — */
    const budgetMin = cleanAmount(body.budgetMin);
    const budgetMax = cleanAmount(body.budgetMax);
    if (budgetMin != null && budgetMax != null && budgetMin > budgetMax) {
      return NextResponse.json({ error: 'Budget minimum cannot exceed the maximum.' }, { status: 400 });
    }
    const budget: ServiceLeadBudget | undefined = (budgetMin != null || budgetMax != null)
      ? {
        ...(budgetMin != null ? { min: budgetMin } : {}),
        ...(budgetMax != null ? { max: budgetMax } : {}),
        currency: (typeof body.budgetCurrency === 'string' ? body.budgetCurrency.trim().slice(0, 5) : '') || service.currency || 'INR',
      }
      : undefined;

    const startDate = cleanDate(body.expectedStartDate);
    const completionDate = cleanDate(body.expectedCompletionDate);
    if (startDate && completionDate && startDate > completionDate) {
      return NextResponse.json({ error: 'Completion date cannot be before the start date.' }, { status: 400 });
    }
    const timeline: ServiceLeadTimeline | undefined = (startDate || completionDate)
      ? { ...(startDate ? { startDate } : {}), ...(completionDate ? { completionDate } : {}) }
      : undefined;

    const attachments = cleanAttachments(body.attachments);
    const companyInfo = cleanText(body.companyInfo, COMPANY_INFO_MAX_LENGTH) || undefined;

    /* — duplicate protection (§25, minimal): identical resend inside the window — */
    const duplicate = await findRecentDuplicateEnquiry(actor.id, serviceId, requirement);
    if (duplicate) {
      const existingLead = await getServiceLeadForSource('enquiry', duplicate.id);
      return NextResponse.json({
        duplicate: true,
        enquiry: publicEnquiry(duplicate),
        lead: existingLead ? { id: existingLead.id, type: existingLead.type, status: existingLead.status } : null,
        conversation: duplicate.conversationId
          ? { id: duplicate.conversationId, href: `/messages?user=${provider.id}` }
          : null,
        provider: await providerSummary(provider.id),
        message: 'You have already sent this enquiry.',
      }, { status: 200 });
    }

    /* — persist the enquiry — */
    const enquiry = await createServiceEnquiry({
      serviceId: service.id,
      serviceTitle: service.title,
      providerId: provider.id,
      customerId: actor.id,
      customerName: actor.name,
      requirement,
      contactMethod,
      contactEmail,
      contactPhone,
      budget,
      timeline,
      attachments,
      companyInfo,
    });

    /* — conversation: reuse the existing service messaging, never a new chat — */
    let conversationId: string | undefined;
    try {
      const { conversation } = await getOrCreateConversation(actor.id, provider.id, 'service');
      conversationId = conversation.id;
      await sendMessage(conversation.id, actor.id, composeConversationMessage(enquiry), 'text');
    } catch (error) {
      // The enquiry and its lead still stand if messaging is unavailable.
      console.error('[services/enquiries] conversation failed', error);
    }

    /* — exactly one lead, idempotent on the enquiry id (§18/§22) — */
    const lead = await createServiceLead({
      type: 'enquiry',
      providerId: provider.id,
      customerId: actor.id,
      customerName: actor.name,
      serviceId: service.id,
      serviceTitle: service.title,
      enquiryId: enquiry.id,
      requirement,
      budget,
      timeline,
      attachments,
      companyInfo,
      contactMethod,
      contactEmail,
      contactPhone,
      conversationId,
    });

    const linked = await linkServiceEnquiry(enquiry.id, { leadId: lead.id, conversationId });

    return NextResponse.json({
      duplicate: false,
      enquiry: publicEnquiry(linked ?? { ...enquiry, leadId: lead.id, conversationId }),
      lead: { id: lead.id, type: lead.type, status: lead.status },
      conversation: conversationId ? { id: conversationId, href: `/messages?user=${provider.id}` } : null,
      provider: await providerSummary(provider.id),
    }, { status: 201 });
  } catch (error) {
    console.error('[services/enquiries] POST error', error);
    return NextResponse.json({ error: 'Failed to send enquiry.' }, { status: 500 });
  }
}

/* ─── GET — my enquiries, or one enquiry I am party to (§18 "View Enquiry") ─ */

export async function GET(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const enquiry = await getServiceEnquiryById(id);
      if (!enquiry) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
      const isCustomer = enquiry.customerId === actor.id;
      const isProvider = enquiry.providerId === actor.id;
      if (!isCustomer && !isProvider) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });

      // The provider needs the chosen contact channel; the customer already knows it.
      const payload = isProvider
        ? { ...publicEnquiry(enquiry), customerName: enquiry.customerName, contactEmail: enquiry.contactEmail, contactPhone: enquiry.contactPhone }
        : publicEnquiry(enquiry);

      return NextResponse.json({ enquiry: payload, role: isProvider ? 'provider' : 'customer' });
    }

    const role = searchParams.get('role') === 'provider' ? 'provider' : 'customer';
    const limit = Number(searchParams.get('limit') || '24');
    const offset = Number(searchParams.get('offset') || '0');
    const serviceId = searchParams.get('serviceId') || undefined;

    const { enquiries, total } = await listServiceEnquiries({
      role,
      userId: actor.id,
      serviceId,
      limit: Number.isFinite(limit) ? limit : 24,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    return NextResponse.json({
      enquiries: enquiries.map((e) => (role === 'provider'
        ? { ...publicEnquiry(e), customerName: e.customerName, contactEmail: e.contactEmail, contactPhone: e.contactPhone }
        : publicEnquiry(e))),
      total,
      role,
    });
  } catch (error) {
    console.error('[services/enquiries] GET error', error);
    return NextResponse.json({ error: 'Failed to load enquiries.' }, { status: 500 });
  }
}
