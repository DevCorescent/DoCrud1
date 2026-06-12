import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { markBillingTransactionPaid, sendBillingReceiptEmail } from '@/lib/server/billing';
import { verifyTemplatePurchase } from '@/lib/server/template-marketplace';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null) as any;
    const purchaseId = String(body?.purchaseId || '').trim();
    const razorpay_order_id = String(body?.razorpay_order_id || '').trim();
    const razorpay_payment_id = String(body?.razorpay_payment_id || '').trim();
    const razorpay_signature = String(body?.razorpay_signature || '').trim();

    if (!purchaseId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ error: 'Missing payment verification fields.' }, { status: 400 });
    }

    const purchase = await verifyTemplatePurchase({
      buyer: session.user as any,
      purchaseId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });

    const transaction = await markBillingTransactionPaid({
      providerOrderId: razorpay_order_id,
      providerPaymentId: razorpay_payment_id,
      providerSignature: razorpay_signature,
    });
    if (transaction) {
      await sendBillingReceiptEmail({ transaction, origin: new URL(request.url).origin });
    }

    return NextResponse.json({ purchase }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to verify payment.' }, { status: 400 });
  }
}
