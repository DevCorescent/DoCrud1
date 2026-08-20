/**
 * Verify an advertisement payment.
 *
 * The Razorpay signature is checked server-side with the key secret; a client
 * claiming success proves nothing. A verified payment moves the campaign to
 * PENDING_APPROVAL — never straight to active. Superadmin approval is a
 * separate, required step.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { markBillingTransactionFailed, markBillingTransactionPaid, verifyRazorpayPaymentSignature } from '@/lib/server/billing';
import { getAdById, updateAd } from '@/lib/server/ads';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const users = await getStoredUsers();
    const actor = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
    if (!actor) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = (await req.json().catch(() => null)) as {
      adId?: string; razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string;
    } | null;

    const adId = String(body?.adId ?? '');
    const orderId = String(body?.razorpay_order_id ?? '');
    const paymentId = String(body?.razorpay_payment_id ?? '');
    const signature = String(body?.razorpay_signature ?? '');
    if (!adId || !orderId || !paymentId || !signature) {
      return NextResponse.json({ error: 'Incomplete payment details.' }, { status: 400 });
    }

    const ad = await getAdById(adId);
    if (!ad) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 });
    if (ad.ownerId !== actor.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    // The order must be the one this campaign started — no cross-order reuse.
    if (ad.orderId !== orderId) return NextResponse.json({ error: 'Order mismatch.' }, { status: 409 });
    if (ad.paymentStatus === 'paid') {
      return NextResponse.json({ ok: true, status: ad.status, alreadyProcessed: true });
    }

    const valid = verifyRazorpayPaymentSignature(orderId, paymentId, signature);
    if (!valid) {
      await markBillingTransactionFailed(orderId, 'failed').catch(() => {});
      await updateAd(adId, { paymentStatus: 'failed', status: 'draft' });
      return NextResponse.json({ error: 'Payment verification failed.' }, { status: 400 });
    }

    await markBillingTransactionPaid({ providerOrderId: orderId, providerPaymentId: paymentId, providerSignature: signature })
      .catch((e) => console.error('[ads/verify] billing mark paid failed', e));

    /* Paid, but deliberately NOT active. Superadmin still has to approve. */
    const updated = await updateAd(adId, {
      paymentStatus: 'paid',
      paymentId,
      status: 'pending_approval',
    });

    return NextResponse.json({ ok: true, status: updated?.status ?? 'pending_approval' });
  } catch (error) {
    console.error('[ads/verify] POST error', error);
    return NextResponse.json({ error: 'Could not verify payment.' }, { status: 500 });
  }
}
