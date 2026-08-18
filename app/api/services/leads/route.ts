import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserById } from '@/lib/server/users';
import { getProfileFields } from '@/lib/server/user-profiles';
import { listServiceLeadsForProvider, SERVICE_LEAD_STATUSES, type ServiceLead } from '@/lib/server/service-leads';

export const dynamic = 'force-dynamic';

/** Session → stored user. Provider identity is never read from the query. */
async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  return getStoredUserById(session.user.id);
}

/**
 * §22 list row. Contact details are included because the provider is the
 * counterparty on their own lead — but only ever for leads they own.
 */
function listRow(lead: ServiceLead, profile?: { avatarUrl?: string; headline?: string }) {
  return {
    id: lead.id,
    type: lead.type,
    status: lead.status,
    customerId: lead.customerId,
    customerName: lead.customerName,
    customerAvatarUrl: profile?.avatarUrl,
    customerHeadline: profile?.headline,
    serviceId: lead.serviceId,
    serviceTitle: lead.serviceTitle,
    requirement: lead.requirement,
    budget: lead.budget,
    timeline: lead.timeline,
    attachmentCount: lead.attachments?.length ?? 0,
    contactMethod: lead.contactMethod,
    packageName: lead.packageName,
    price: lead.price,
    conversationId: lead.conversationId,
    noteCount: lead.notes?.length ?? 0,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  };
}

export async function GET(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') ?? '';
    const status = searchParams.get('status') ?? '';
    const type = searchParams.get('type') ?? '';
    const limit = Number(searchParams.get('limit') ?? '24');
    const offset = Number(searchParams.get('offset') ?? '0');

    /* Scoped to the session user — a providerId in the query is not accepted. */
    const { leads, total } = await listServiceLeadsForProvider({
      providerId: actor.id,
      q,
      status,
      type,
      limit: Number.isFinite(limit) ? limit : 24,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    /* §22 "Profile" — avatar/headline resolved from the existing profile store. */
    const profiles = await Promise.all(
      leads.map((lead) =>
        getProfileFields(lead.customerId, ['avatarUrl', 'headline'] as const)
          .then((p) => p as { avatarUrl?: string; headline?: string })
          .catch(() => ({} as { avatarUrl?: string; headline?: string })),
      ),
    );

    /* Counters for the status filter chips, over the provider's whole pipeline. */
    const all = await listServiceLeadsForProvider({ providerId: actor.id, limit: 60, offset: 0 });
    const counts: Record<string, number> = { all: all.total, enquiry: 0, booking: 0 };
    for (const s of SERVICE_LEAD_STATUSES) counts[s] = 0;
    for (const lead of all.leads) {
      counts[lead.status] = (counts[lead.status] ?? 0) + 1;
      counts[lead.type] = (counts[lead.type] ?? 0) + 1;
    }

    return NextResponse.json({
      leads: leads.map((lead, i) => listRow(lead, profiles[i])),
      total,
      counts,
    });
  } catch (error) {
    console.error('[services/leads] GET error', error);
    return NextResponse.json({ error: 'Failed to load leads.' }, { status: 500 });
  }
}
