/**
 * Superadmin campaign actions: approve, reject, disable, reactivate, edit.
 *
 * Approval is the only route to `active` for a paid advertiser campaign, and
 * it refuses to approve anything that has not actually been paid for.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { getAdById, updateAd, type AdStatus, type SponsoredAd } from '@/lib/server/ads';

export const dynamic = 'force-dynamic';

/** getSuperAdminSessionFromRequest returns { valid }, so the flag must be
    checked — the object itself is always truthy. */
async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

type Action = 'approve' | 'reject' | 'disable' | 'reactivate' | 'edit';

export async function PATCH(req: NextRequest, { params }: { params: { adId: string } }) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    const ad = await getAdById(params.adId);
    if (!ad) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    if (ad.legacy) {
      return NextResponse.json({ error: 'Legacy banners are managed in the Ad Banners tab.' }, { status: 409 });
    }

    const body = (await req.json().catch(() => null)) as { action?: Action; reason?: string; patch?: Partial<SponsoredAd> } | null;
    const action = body?.action;
    const now = Date.now();

    if (action === 'approve') {
      /* A user campaign must be paid before it can go live. */
      if (ad.advertiserType === 'user' && ad.paymentStatus !== 'paid') {
        return NextResponse.json({ error: 'This campaign has not been paid for.' }, { status: 409 });
      }
      const startAt = ad.startAt ?? new Date(now).toISOString();
      const endAt = ad.endAt ?? new Date(now + (ad.durationDays || 7) * 86_400_000).toISOString();
      const updated = await updateAd(ad.id, { status: 'active' as AdStatus, startAt, endAt, rejectionReason: undefined });
      return NextResponse.json({ ad: updated });
    }

    if (action === 'reject') {
      const updated = await updateAd(ad.id, {
        status: 'rejected' as AdStatus,
        rejectionReason: String(body?.reason ?? '').slice(0, 300) || undefined,
      });
      return NextResponse.json({ ad: updated });
    }

    if (action === 'disable') {
      return NextResponse.json({ ad: await updateAd(ad.id, { status: 'disabled' as AdStatus }) });
    }

    if (action === 'reactivate') {
      if (ad.endAt && Date.parse(ad.endAt) <= now) {
        return NextResponse.json({ error: 'This campaign has expired.' }, { status: 409 });
      }
      if (ad.advertiserType === 'user' && ad.paymentStatus !== 'paid') {
        return NextResponse.json({ error: 'This campaign has not been paid for.' }, { status: 409 });
      }
      return NextResponse.json({ ad: await updateAd(ad.id, { status: 'active' as AdStatus }) });
    }

    if (action === 'edit') {
      const p = body?.patch ?? {};
      /* Payment and counters are never client-editable, even by Superadmin. */
      const updated = await updateAd(ad.id, {
        title: p.title?.trim() || ad.title,
        subtitle: p.subtitle?.trim(),
        description: p.description?.trim(),
        ctaLabel: p.ctaLabel?.trim(),
        ctaHref: p.ctaHref?.trim(),
        imageUrl: p.imageUrl?.trim() || ad.imageUrl,
        targetSection: Array.isArray(p.targetSection) ? p.targetSection.map(String) : ad.targetSection,
        targetDomain: Array.isArray(p.targetDomain) ? p.targetDomain.map(String) : ad.targetDomain,
        targetProfession: Array.isArray(p.targetProfession) ? p.targetProfession.map(String) : ad.targetProfession,
        targetSkills: Array.isArray(p.targetSkills) ? p.targetSkills.map(String) : ad.targetSkills,
        targetLocation: Array.isArray(p.targetLocation) ? p.targetLocation.map(String) : ad.targetLocation,
        startAt: typeof p.startAt === 'string' ? p.startAt : ad.startAt,
        endAt: typeof p.endAt === 'string' ? p.endAt : ad.endAt,
        feeInPaise: typeof p.feeInPaise === 'number' ? Math.max(0, Math.round(p.feeInPaise)) : ad.feeInPaise,
      });
      return NextResponse.json({ ad: updated });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('[super-admin/ads/id] PATCH error', error);
    return NextResponse.json({ error: 'Action failed.' }, { status: 500 });
  }
}
