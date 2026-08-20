/**
 * Advertiser campaigns — list own, create draft.
 *
 * A user can only ever create a DRAFT. Price, payment state, approval state
 * and active state are all server-owned; anything the client sends for those
 * fields is ignored.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import {
  AD_MAX_DAYS, AD_MIN_DAYS, calculateAdFeeInPaise, createAd, getAdsByOwner, type SponsoredAd,
} from '@/lib/server/ads';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const users = await getStoredUsers();
  return users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase()) ?? null;
}

const strList = (v: unknown, cap = 12): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, cap) : [];

export async function GET() {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const ads = await getAdsByOwner(actor.id);
    return NextResponse.json({ ads, pricePerDayInPaise: calculateAdFeeInPaise(1) });
  } catch (error) {
    console.error('[ads] GET error', error);
    return NextResponse.json({ error: 'Failed to load campaigns.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as Partial<SponsoredAd> | null;
    if (!body?.title?.trim()) return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    if (!body.imageUrl?.trim()) return NextResponse.json({ error: 'An image is required.' }, { status: 400 });

    const durationDays = Math.min(AD_MAX_DAYS, Math.max(AD_MIN_DAYS, Math.round(Number(body.durationDays) || 7)));
    // Fee is computed here. A fee supplied by the client is discarded.
    const feeInPaise = calculateAdFeeInPaise(durationDays);

    const ad = await createAd({
      ownerId: actor.id,
      ownerName: actor.name,
      advertiserType: 'user',
      imageUrl: body.imageUrl.trim(),
      title: body.title.trim(),
      subtitle: body.subtitle?.trim() || undefined,
      description: body.description?.trim() || undefined,
      ctaLabel: body.ctaLabel?.trim() || undefined,
      ctaHref: body.ctaHref?.trim() || undefined,
      targetSection: strList(body.targetSection),
      targetDomain: strList(body.targetDomain),
      targetProfession: strList(body.targetProfession),
      targetSkills: strList(body.targetSkills),
      targetLocation: strList(body.targetLocation),
      durationDays,
      feeInPaise,
      paymentStatus: 'none',
      status: 'draft',
    });

    return NextResponse.json({ ad }, { status: 201 });
  } catch (error) {
    console.error('[ads] POST error', error);
    return NextResponse.json({ error: 'Failed to create campaign.' }, { status: 500 });
  }
}
