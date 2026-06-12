import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { markBillingTransactionPaid, sendBillingReceiptEmail } from '@/lib/server/billing';
import { verifyResumeConnectPayment } from '@/lib/server/resume-connect';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as any;
    const purchaseId = typeof body?.purchaseId === 'string' ? body.purchaseId : '';
    const mode = body?.mode === 'monthly_pass' ? 'monthly_pass' : 'one_time';
    const resumeId = typeof body?.resumeId === 'string' ? body.resumeId.trim() : '';
    const resumeSlug = typeof body?.resumeSlug === 'string' ? body.resumeSlug.trim() : '';

    const orderId = typeof body?.razorpay_order_id === 'string' ? body.razorpay_order_id : '';
    const paymentId = typeof body?.razorpay_payment_id === 'string' ? body.razorpay_payment_id : '';
    const signature = typeof body?.razorpay_signature === 'string' ? body.razorpay_signature : '';
    if (!purchaseId || !orderId || !paymentId || !signature) {
      return NextResponse.json({ error: 'Payment verification payload is incomplete.' }, { status: 400 });
    }

    const result = await verifyResumeConnectPayment({
      buyerUserId: session.user.id,
      purchaseId,
      mode,
      resumeId: mode === 'one_time' && resumeId ? resumeId : undefined,
      resumeSlug: mode === 'one_time' && resumeSlug ? resumeSlug : undefined,
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

    return NextResponse.json({ success: true, result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to verify payment.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
