import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { createGigBid, updateGigBidStatus, getGigListings } from '@/lib/server/gigs';
import { getOriginForRequest } from '@/lib/server/request';
import type { GigBid } from '@/types/document';
import { canUserAccessFeature, isSubscriptionPeriodExpired } from '@/lib/server/saas';
import { addSocialEvent } from '@/lib/server/social-events';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const users = await getStoredUsers();
  const normalizedEmail = (session.user.email || '').trim().toLowerCase();
  return users.find((entry) => entry.email.trim().toLowerCase() === normalizedEmail) || null;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Login required.' }, { status: 401 });
    }
    if (isSubscriptionPeriodExpired(actor.subscription)) {
      return NextResponse.json({ error: 'Plan expired. Renew to use Gigs.' }, { status: 402 });
    }
    const ok = await canUserAccessFeature(actor, 'gigs');
    if (!ok) {
      return NextResponse.json({ error: 'Gigs access is not included on your plan.' }, { status: 402 });
    }

    const body = await request.json().catch(() => null) as any;
    const gigId = typeof body?.gigId === 'string' ? body.gigId : '';
    const note = typeof body?.note === 'string' ? body.note : '';
    const timelineLabel = typeof body?.timelineLabel === 'string' ? body.timelineLabel : '';
    const amountInRupees = Number(body?.amountInRupees);

    if (!gigId || !Number.isFinite(amountInRupees) || !note.trim()) {
      return NextResponse.json({ error: 'Gig, amount, and note are required.' }, { status: 400 });
    }

    const bid = await createGigBid(actor, {
      gigId,
      amountInRupees,
      timelineLabel: timelineLabel.trim() || undefined,
      note,
    });

    // Fire social event to notify the gig owner (non-blocking)
    void (async () => {
      try {
        const gigs = await getGigListings();
        const gig = gigs.find((g) => g.id === gigId);
        if (gig?.ownerUserId && gig.ownerUserId !== actor.id) {
          await addSocialEvent({
            type: 'gig_applied',
            actorId: actor.id,
            actorName: actor.name || actor.email,
            targetUserId: gig.ownerUserId,
            resourceId: gigId,
            resourceTitle: gig.title,
            href: `/workspace?tab=gigs`,
          });
        }
      } catch { /* non-critical */ }
    })();

    return NextResponse.json(bid, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to submit bid.' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ error: 'Login required.' }, { status: 401 });
    }
    if (isSubscriptionPeriodExpired(actor.subscription)) {
      return NextResponse.json({ error: 'Plan expired. Renew to use Gigs.' }, { status: 402 });
    }
    const ok = await canUserAccessFeature(actor, 'gigs');
    if (!ok) {
      return NextResponse.json({ error: 'Gigs access is not included on your plan.' }, { status: 402 });
    }

    const body = await request.json().catch(() => null) as any;
    const id = typeof body?.id === 'string' ? body.id : '';
    const status = typeof body?.status === 'string' ? body.status : '';

    const allowed: GigBid['status'][] = ['submitted', 'shortlisted', 'accepted', 'rejected', 'withdrawn'];
    if (!id || !allowed.includes(status as GigBid['status'])) {
      return NextResponse.json({ error: 'Bid update payload is incomplete.' }, { status: 400 });
    }

    const origin = getOriginForRequest(request);
    const bid = await updateGigBidStatus(actor, id, status as GigBid['status'], origin);
    return NextResponse.json(bid);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update bid.' }, { status: 400 });
  }
}
