import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { markBillingTransactionPaid, sendBillingReceiptEmail } from '@/lib/server/billing';
import { verifyGigUrgentPayment } from '@/lib/server/gigs';

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as any;
    const gigId = typeof body?.gigId === 'string' ? body.gigId : '';
    const durationDays = Number(body?.durationDays);
    const orderId = typeof body?.razorpay_order_id === 'string' ? body.razorpay_order_id : '';
    const paymentId = typeof body?.razorpay_payment_id === 'string' ? body.razorpay_payment_id : '';
    const signature = typeof body?.razorpay_signature === 'string' ? body.razorpay_signature : '';

    if (!gigId || !Number.isFinite(durationDays) || !orderId || !paymentId || !signature) {
      return NextResponse.json({ error: 'Payment verification payload is incomplete.' }, { status: 400 });
    }

    const gig = await verifyGigUrgentPayment(actor, {
      gigId,
      durationDays,
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    });

    const transaction = await markBillingTransactionPaid({
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      providerSignature: signature,
    });
    if (transaction) {
      await sendBillingReceiptEmail({ transaction, origin: new URL(request.url).origin });
    }

    return NextResponse.json({ success: true, gig });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify urgent payment.' }, { status: 400 });
  }
}
