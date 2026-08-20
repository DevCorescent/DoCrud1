/** Advertiser: edit or delete a campaign they own, while it is still a draft. */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import {
  AD_MAX_DAYS, AD_MIN_DAYS, calculateAdFeeInPaise, deleteAd, getAdById, updateAd, type SponsoredAd,
} from '@/lib/server/ads';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.email) return null;
  const users = await getStoredUsers();
  return users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase()) ?? null;
}

export async function PUT(req: NextRequest, { params }: { params: { adId: string } }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const existing = await getAdById(params.adId);
    if (!existing) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    if (existing.ownerId !== actor.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    /* Once money or review is involved the advertiser can no longer edit. */
    if (existing.status !== 'draft') {
      return NextResponse.json({ error: 'Only a draft campaign can be edited.' }, { status: 409 });
    }

    const body = (await req.json().catch(() => null)) as Partial<SponsoredAd> | null;
    const durationDays = body?.durationDays !== undefined
      ? Math.min(AD_MAX_DAYS, Math.max(AD_MIN_DAYS, Math.round(Number(body.durationDays) || existing.durationDays)))
      : existing.durationDays;

    const updated = await updateAd(params.adId, {
      title: body?.title?.trim() || existing.title,
      subtitle: body?.subtitle?.trim(),
      description: body?.description?.trim(),
      ctaLabel: body?.ctaLabel?.trim(),
      ctaHref: body?.ctaHref?.trim(),
      imageUrl: body?.imageUrl?.trim() || existing.imageUrl,
      targetSection: Array.isArray(body?.targetSection) ? body!.targetSection!.map(String) : existing.targetSection,
      targetDomain: Array.isArray(body?.targetDomain) ? body!.targetDomain!.map(String) : existing.targetDomain,
      targetProfession: Array.isArray(body?.targetProfession) ? body!.targetProfession!.map(String) : existing.targetProfession,
      targetSkills: Array.isArray(body?.targetSkills) ? body!.targetSkills!.map(String) : existing.targetSkills,
      targetLocation: Array.isArray(body?.targetLocation) ? body!.targetLocation!.map(String) : existing.targetLocation,
      durationDays,
      feeInPaise: calculateAdFeeInPaise(durationDays),   // always recomputed
    });
    return NextResponse.json({ ad: updated });
  } catch (error) {
    console.error('[ads/id] PUT error', error);
    return NextResponse.json({ error: 'Failed to update campaign.' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { adId: string } }) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const existing = await getAdById(params.adId);
    if (!existing) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    if (existing.ownerId !== actor.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (existing.paymentStatus === 'paid') {
      return NextResponse.json({ error: 'A paid campaign cannot be deleted.' }, { status: 409 });
    }
    const ok = await deleteAd(params.adId, actor.id);
    return NextResponse.json({ ok });
  } catch (error) {
    console.error('[ads/id] DELETE error', error);
    return NextResponse.json({ error: 'Failed to delete campaign.' }, { status: 500 });
  }
}
