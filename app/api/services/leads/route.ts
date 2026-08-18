/**
 * Provider lead pipeline.
 *
 * GET  — the caller's leads: `box=received` (their services) or `box=sent`.
 * PATCH — set a lead's status. Provider-only, and only for their own leads.
 *
 * The acting identity always comes from the session. Any providerId,
 * requesterId or userId in the request is ignored entirely.
 *
 * Requester identity is resolved in bulk for the page — one name lookup and
 * one avatar lookup for the whole list, never one per lead.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserByEmail, getStoredUserById, getUserNames } from '@/lib/server/users';
import { getProfileAvatars } from '@/lib/server/user-profiles';
import {
  listServiceLeadsForProvider,
  listServiceLeadsForCustomer,
  updateServiceLead,
  type ServiceLead,
} from '@/lib/server/service-leads';
import { isLeadStatus } from '@/lib/service-lead-status';

export const dynamic = 'force-dynamic';

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

/**
 * Shapes a lead for the client.
 *
 * The requester's display name and avatar are included because the
 * specification's lead record calls for the customer's name and profile. Their
 * email and every other profile field are not — a lead is not a licence to
 * read somebody's account. Internal ids are dropped except the service id,
 * which the provider needs to link back to their own listing.
 */
/** Budget and timeline are stored structurally; the client renders text. */
function budgetText(budget: ServiceLead['budget']) {
  if (!budget) return null;
  const { min, max, currency } = budget;
  if (min != null && max != null) return `${currency} ${min.toLocaleString()} – ${max.toLocaleString()}`;
  if (min != null) return `${currency} ${min.toLocaleString()}+`;
  if (max != null) return `Up to ${currency} ${max.toLocaleString()}`;
  return null;
}

function timelineText(timeline: ServiceLead['timeline']) {
  if (!timeline) return null;
  const { startDate, completionDate } = timeline;
  if (startDate && completionDate) return `${startDate} → ${completionDate}`;
  return startDate || completionDate || null;
}

function shape(lead: ServiceLead, names: Map<string, string>, avatars: Map<string, string | null>) {
  return {
    id: lead.id,
    /* The source record is the human-facing reference for the lead. */
    reference: lead.enquiryId ?? lead.bookingId ?? lead.id,
    source: lead.type,
    serviceId: lead.serviceId,
    serviceTitle: lead.serviceTitle,
    requester: {
      name: names.get(lead.customerId) || lead.customerName || 'Docrud member',
      avatarUrl: avatars.get(lead.customerId) ?? null,
    },
    requirement: lead.requirement,
    budget: budgetText(lead.budget),
    timeline: timelineText(lead.timeline),
    contactMethod: lead.contactMethod,
    phone: lead.contactPhone ?? null,
    company: lead.companyInfo ?? null,
    packageName: lead.packageName ?? null,
    price: lead.price ?? null,
    /* Currency is only recorded alongside a budget, so it is only reported
       when the record actually holds one. */
    currency: lead.budget?.currency ?? null,
    status: lead.status,
    createdAt: lead.createdAt,
  };
}

export async function GET(req: NextRequest) {
  try {
    const viewer = await currentUser();
    if (!viewer) {
      return NextResponse.json({ error: 'Sign in to view leads.' }, { status: 401 });
    }

    const box = new URL(req.url).searchParams.get('box') === 'sent' ? 'sent' : 'received';
    const leads = box === 'sent'
      ? await listServiceLeadsForCustomer(viewer.id)
      : (await listServiceLeadsForProvider({ providerId: viewer.id, limit: 60 })).leads;

    /* Two batched lookups for the whole list — never one per lead. */
    const ids = Array.from(new Set(leads.map((l) => l.customerId)));
    const [names, avatars] = await Promise.all([
      getUserNames(ids).catch(() => new Map<string, string>()),
      getProfileAvatars(ids).catch(() => new Map<string, string | null>()),
    ]);

    return NextResponse.json(
      { leads: leads.map((l) => shape(l, names, avatars)), box, total: leads.length },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[services/leads] GET error', error);
    return NextResponse.json({ error: 'Could not load leads.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const viewer = await currentUser();
    if (!viewer) {
      return NextResponse.json({ error: 'Sign in to update a lead.' }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required.' }, { status: 400 });
    }
    if (!isLeadStatus(body?.status)) {
      return NextResponse.json({ error: 'Unknown lead status.' }, { status: 400 });
    }

    /* The store decides whether this provider owns the lead. A lead owned by
       somebody else is reported as not-found so ids cannot be probed. */
    let lead: ServiceLead;
    try {
      lead = await updateServiceLead({ providerId: viewer.id, leadId, status: body.status });
    } catch {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    const names = await getUserNames([lead.customerId]).catch(() => new Map<string, string>());
    const avatars = await getProfileAvatars([lead.customerId]).catch(() => new Map<string, string | null>());
    return NextResponse.json({ lead: shape(lead, names, avatars) });
  } catch (error) {
    console.error('[services/leads] PATCH error', error);
    return NextResponse.json({ error: 'Could not update the lead.' }, { status: 500 });
  }
}
