import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserById } from '@/lib/server/users';
import { getProfileFields } from '@/lib/server/user-profiles';
import {
  allowedServiceLeadTransitions,
  getServiceLeadById,
  updateServiceLead,
  SERVICE_LEAD_STATUSES,
  type ServiceLeadStatus,
} from '@/lib/server/service-leads';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  return getStoredUserById(session.user.id);
}

/**
 * Provider-owned lead, or null.
 *
 * Callers answer 404 (not 403) for a lead owned by somebody else, so lead ids
 * are not enumerable by a signed-in stranger.
 */
async function loadOwnedLead(leadId: string, providerId: string) {
  const lead = await getServiceLeadById(leadId);
  if (!lead || lead.providerId !== providerId) return null;
  return lead;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const lead = await loadOwnedLead(params.id, actor.id);
    if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

    const profile = await getProfileFields(lead.customerId, ['avatarUrl', 'headline', 'location'] as const)
      .catch(() => ({} as Record<string, string | undefined>));

    return NextResponse.json({
      lead,
      customer: {
        id: lead.customerId,
        name: lead.customerName,
        avatarUrl: (profile as { avatarUrl?: string }).avatarUrl,
        headline: (profile as { headline?: string }).headline,
        location: (profile as { location?: string }).location,
        href: `/u/${lead.customerId}`,
      },
      conversation: lead.conversationId
        ? { id: lead.conversationId, href: `/messages?user=${lead.customerId}` }
        : null,
      allowedTransitions: allowedServiceLeadTransitions(lead.status),
    });
  } catch (error) {
    console.error('[services/leads/id] GET error', error);
    return NextResponse.json({ error: 'Failed to load lead.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    /* Ownership first: a non-owner learns nothing about the lead. */
    const lead = await loadOwnedLead(params.id, actor.id);
    if (!lead) return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });

    const body = (await req.json().catch(() => null)) as { status?: string; note?: string } | null;
    if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

    const requestedStatus = typeof body.status === 'string' ? body.status.trim() : '';
    const note = typeof body.note === 'string' ? body.note : undefined;
    if (!requestedStatus && !note?.trim()) {
      return NextResponse.json({ error: 'Provide a status or a note.' }, { status: 400 });
    }

    if (requestedStatus) {
      if (!SERVICE_LEAD_STATUSES.includes(requestedStatus as ServiceLeadStatus)) {
        return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
      }
      const next = requestedStatus as ServiceLeadStatus;
      if (next !== lead.status && !allowedServiceLeadTransitions(lead.status).includes(next)) {
        return NextResponse.json(
          { error: `This lead is ${lead.status.replace(/_/g, ' ')} and can no longer change status.` },
          { status: 409 },
        );
      }
    }

    const updated = await updateServiceLead({
      providerId: actor.id,
      leadId: params.id,
      status: requestedStatus || undefined,
      noteBody: note,
    });

    return NextResponse.json({
      lead: updated,
      allowedTransitions: allowedServiceLeadTransitions(updated.status),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update lead.';
    const status = message.startsWith('Invalid transition') ? 409 : message === 'Lead not found.' ? 404 : 500;
    if (status === 500) console.error('[services/leads/id] PATCH error', error);
    return NextResponse.json({ error: message }, { status });
  }
}
