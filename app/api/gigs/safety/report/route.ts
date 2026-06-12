import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getOriginForRequest } from '@/lib/server/request';
import { createGigsSafetyReport } from '@/lib/server/gigs-safety';
import { getGigListings } from '@/lib/server/gigs';
import { canUserAccessFeature, isSubscriptionPeriodExpired } from '@/lib/server/saas';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const users = await getStoredUsers();
  const normalizedEmail = (session.user.email || '').trim().toLowerCase();
  return users.find((u) => u.email.trim().toLowerCase() === normalizedEmail) || null;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (isSubscriptionPeriodExpired(actor.subscription)) {
      return NextResponse.json({ error: 'Plan expired. Renew to use Gigs.' }, { status: 402 });
    }
    const ok = await canUserAccessFeature(actor, 'gigs');
    if (!ok) return NextResponse.json({ error: 'Gigs access is not included on your plan.' }, { status: 402 });

    const body = await request.json().catch(() => null) as any;
    const gigId = typeof body?.gigId === 'string' ? body.gigId.trim() : '';
    const gigSlug = typeof body?.gigSlug === 'string' ? body.gigSlug.trim() : '';
    const accusedUserId = typeof body?.accusedUserId === 'string' ? body.accusedUserId.trim() : '';
    const reason = typeof body?.reason === 'string' ? body.reason : '';
    const details = typeof body?.details === 'string' ? body.details : undefined;
    const evidence = Array.isArray(body?.evidence) ? body.evidence : [];
    if (!gigId || !gigSlug || !accusedUserId) return NextResponse.json({ error: 'Report payload is incomplete.' }, { status: 400 });

    const gigs = await getGigListings();
    const gig = gigs.find((g) => g.id === gigId && g.slug === gigSlug) || null;
    if (!gig) return NextResponse.json({ error: 'Gig not found.' }, { status: 404 });
    const actorOwnsGig = gig.ownerUserId === actor.id || gig.organizationId === actor.organizationId || actor.role === 'admin';
    if (!actorOwnsGig) return NextResponse.json({ error: 'Not permitted to report users for this gig.' }, { status: 403 });

    const report = await createGigsSafetyReport({
      gigId,
      gigSlug,
      reporter: actor,
      accusedUserId,
      reason,
      details,
      evidence,
    });

    return NextResponse.json({ report, origin: getOriginForRequest(request) }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit report.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

