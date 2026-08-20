/** Superadmin: every campaign, with payment/approval state and performance. */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import {
  AD_MAX_DAYS, AD_MIN_DAYS, createAd, ctr, expireDueAds, getAllSponsoredAds, getLegacyAds, type SponsoredAd,
} from '@/lib/server/ads';

export const dynamic = 'force-dynamic';

/** getSuperAdminSessionFromRequest returns { valid }, so the flag must be
    checked — the object itself is always truthy. */
async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    await expireDueAds();
    const [own, legacy] = await Promise.all([getAllSponsoredAds(), getLegacyAds()]);
    const rows = [...own, ...legacy]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((a) => ({ ...a, ctr: ctr(a) }));
    return NextResponse.json({ ads: rows });
  } catch (error) {
    console.error('[super-admin/ads] GET error', error);
    return NextResponse.json({ error: 'Failed to load campaigns.' }, { status: 500 });
  }
}

/** Superadmin may create a house ad directly — no payment, no approval step. */
export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const body = (await req.json().catch(() => null)) as Partial<SponsoredAd> | null;
    if (!body?.title?.trim() || !body.imageUrl?.trim()) {
      return NextResponse.json({ error: 'Title and image are required.' }, { status: 400 });
    }
    const durationDays = Math.min(AD_MAX_DAYS, Math.max(AD_MIN_DAYS, Math.round(Number(body.durationDays) || 30)));
    const now = Date.now();
    const ad = await createAd({
      ownerId: '',
      ownerName: 'Docrud',
      advertiserType: 'superadmin',
      imageUrl: body.imageUrl.trim(),
      title: body.title.trim(),
      subtitle: body.subtitle?.trim(),
      description: body.description?.trim(),
      ctaLabel: body.ctaLabel?.trim(),
      ctaHref: body.ctaHref?.trim(),
      targetSection: Array.isArray(body.targetSection) ? body.targetSection.map(String) : [],
      targetDomain: Array.isArray(body.targetDomain) ? body.targetDomain.map(String) : [],
      targetProfession: Array.isArray(body.targetProfession) ? body.targetProfession.map(String) : [],
      targetSkills: Array.isArray(body.targetSkills) ? body.targetSkills.map(String) : [],
      targetLocation: Array.isArray(body.targetLocation) ? body.targetLocation.map(String) : [],
      durationDays,
      feeInPaise: 0,
      paymentStatus: 'none',
      status: 'active',
      startAt: new Date(now).toISOString(),
      endAt: new Date(now + durationDays * 86_400_000).toISOString(),
    });
    return NextResponse.json({ ad }, { status: 201 });
  } catch (error) {
    console.error('[super-admin/ads] POST error', error);
    return NextResponse.json({ error: 'Failed to create campaign.' }, { status: 500 });
  }
}
