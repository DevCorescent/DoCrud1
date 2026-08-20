/**
 * Start payment for a campaign.
 *
 * The fee is recomputed here from the stored duration — the client never sends
 * an amount. Reuses the existing Razorpay order + billing-transaction
 * infrastructure rather than introducing a second payment system.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { createPendingCommerceTransaction, getRazorpayConfig } from '@/lib/server/billing';
import { calculateAdFeeInPaise, createSponsoredAdOrder, getAdById, updateAd } from '@/lib/server/ads';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: { adId: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const users = await getStoredUsers();
    const actor = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
    if (!actor) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const ad = await getAdById(params.adId);
    if (!ad) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    if (ad.ownerId !== actor.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (ad.paymentStatus === 'paid') {
      return NextResponse.json({ error: 'This campaign is already paid.' }, { status: 409 });
    }
    if (!['draft', 'payment_pending'].includes(ad.status)) {
      return NextResponse.json({ error: 'This campaign cannot be paid for in its current state.' }, { status: 409 });
    }

    const config = getRazorpayConfig();
    if (!config?.keyId) {
      return NextResponse.json({ error: 'Payments are not configured.' }, { status: 503 });
    }

    const amountInPaise = calculateAdFeeInPaise(ad.durationDays);   // server-computed
    const order = await createSponsoredAdOrder({
      adId: ad.id, ownerUserId: actor.id, durationDays: ad.durationDays,
    });
    if (!order?.id) return NextResponse.json({ error: 'Could not create a payment order.' }, { status: 502 });

    await createPendingCommerceTransaction({
      user: actor,
      providerOrderId: order.id,
      productType: 'sponsored_ad',
      productLabel: `Sponsored campaign — ${ad.title}`,
      baseAmountInPaise: amountInPaise,
      amountInPaise,
      quantity: ad.durationDays,
      unitAmountInPaise: calculateAdFeeInPaise(1),
      notes: `adId=${ad.id}`,
    });

    await updateAd(ad.id, {
      status: 'payment_pending',
      paymentStatus: 'pending',
      orderId: order.id,
      feeInPaise: amountInPaise,
    });

    return NextResponse.json({
      orderId: order.id,
      amountInPaise,
      currency: 'INR',
      keyId: config.keyId,
      adId: ad.id,
    });
  } catch (error) {
    console.error('[ads/checkout] POST error', error);
    return NextResponse.json({ error: 'Could not start payment.' }, { status: 500 });
  }
}
