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
import { getLeadsForProvider, getLeadsForRequester, updateLeadStatus, type Lead } from '@/lib/server/service-leads';
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
function shape(lead: Lead, names: Map<string, string>, avatars: Map<string, string | null>) {
  return {
    id: lead.id,
    reference: lead.reference,
    source: lead.source,
    serviceId: lead.serviceId,
    serviceTitle: lead.serviceTitle,
    requester: {
      name: names.get(lead.requesterId) || 'Docrud member',
      avatarUrl: avatars.get(lead.requesterId) ?? null,
    },
    requirement: lead.requirement,
    budget: lead.budget,
    timeline: lead.timeline,
    contactMethod: lead.contactMethod,
    phone: lead.phone,
    company: lead.company,
    packageName: lead.packageName,
    price: lead.price,
    currency: lead.currency,
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
      ? await getLeadsForRequester(viewer.id)
      : await getLeadsForProvider(viewer.id);

    /* Two batched lookups for the whole list — never one per lead. */
    const ids = Array.from(new Set(leads.map((l) => l.requesterId)));
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
    const result = await updateLeadStatus(leadId, viewer.id, body.status);
    if (!result.ok) {
      return NextResponse.json({ error: 'Lead not found.' }, { status: 404 });
    }

    const names = await getUserNames([result.lead.requesterId]).catch(() => new Map<string, string>());
    const avatars = await getProfileAvatars([result.lead.requesterId]).catch(() => new Map<string, string | null>());
    return NextResponse.json({ lead: shape(result.lead, names, avatars) });
  } catch (error) {
    console.error('[services/leads] PATCH error', error);
    return NextResponse.json({ error: 'Could not update the lead.' }, { status: 500 });
  }
}
