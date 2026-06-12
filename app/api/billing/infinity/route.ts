import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import {
  buildBillingAmounts,
  createPendingCommerceTransaction,
  getRazorpayConfig,
  markBillingTransactionPaid,
  sendBillingReceiptEmail,
  verifyRazorpayPaymentSignature,
} from '@/lib/server/billing';
import { activateInfinity } from '@/lib/server/infinity';

export const dynamic = 'force-dynamic';

const INFINITY_PLAN = {
  monthly: { paise: 29900,  label: 'Docrud Infinity · Monthly' },
  annual:  { paise: 249900, label: 'Docrud Infinity · Annual'  },
};

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const period: 'monthly' | 'annual' = body?.period === 'annual' ? 'annual' : 'monthly';

    const { keyId, keySecret, serverConfigured } = getRazorpayConfig();
    if (!serverConfigured) {
      return NextResponse.json({ error: 'Payment gateway is not configured.' }, { status: 503 });
    }

    const users = await getStoredUsers();
    const user = users.find((u) => u.email.trim().toLowerCase() === session.user!.email!.trim().toLowerCase());
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const meta   = INFINITY_PLAN[period];
    const amounts = buildBillingAmounts(meta.paise);
    const receipt = `inf_${user.id.slice(-6)}_${Date.now()}`;

    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amounts.totalAmountInPaise,
        currency: 'INR',
        receipt,
        notes: {
          userId: user.id,
          planId: 'docrud-infinity',
          planName: meta.label,
          period,
          productType: 'docrud_infinity',
        },
      }),
    });

    const order = await razorpayRes.json().catch(() => null);
    if (!razorpayRes.ok || !order?.id) {
      throw new Error(order?.error?.description || 'Failed to create payment order.');
    }

    const transaction = await createPendingCommerceTransaction({
      user,
      providerOrderId: order.id,
      productType: 'docrud_infinity',
      productLabel: meta.label,
      baseAmountInPaise: amounts.baseAmountInPaise,
      amountInPaise: amounts.totalAmountInPaise,
      gstRate: 0.18,
      receipt,
      notes: `Docrud Infinity, period: ${period}`,
    });

    return NextResponse.json({
      order,
      transaction,
      keyId,
      period,
      pricing: amounts,
      customer: { name: user.name || '', email: user.email },
    });
  } catch (error) {
    console.error('[infinity POST]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create order.' },
      { status: 500 },
    );
  }
}

/** GET — return the current user's Infinity status */
export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const users = await getStoredUsers();
    const user  = users.find((u) => u.email.trim().toLowerCase() === session.user!.email!.trim().toLowerCase());
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const { getInfinityStatus } = await import('@/lib/server/infinity');
    const status = await getInfinityStatus(user.id);
    return NextResponse.json(status);
  } catch (error) {
    console.error('[infinity GET]', error);
    return NextResponse.json({ error: 'Failed to load Infinity status.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body      = await request.json().catch(() => null);
    const orderId   = typeof body?.razorpay_order_id   === 'string' ? body.razorpay_order_id   : '';
    const paymentId = typeof body?.razorpay_payment_id === 'string' ? body.razorpay_payment_id : '';
    const signature = typeof body?.razorpay_signature  === 'string' ? body.razorpay_signature  : '';
    const period: 'monthly' | 'annual' = body?.period === 'annual' ? 'annual' : 'monthly';

    if (!orderId || !paymentId || !signature) {
      return NextResponse.json({ error: 'Payment verification payload incomplete.' }, { status: 400 });
    }

    const isValid = verifyRazorpayPaymentSignature(orderId, paymentId, signature);
    if (!isValid) {
      return NextResponse.json({ error: 'Signature verification failed.' }, { status: 400 });
    }

    const paidTransaction = await markBillingTransactionPaid({
      providerOrderId: orderId,
      providerPaymentId: paymentId,
      providerSignature: signature,
    });

    // Activate / renew Infinity with full tracking
    const users = await getStoredUsers();
    const user  = users.find((u) => u.email.trim().toLowerCase() === session.user!.email!.trim().toLowerCase());
    if (user) {
      await activateInfinity(user.id, { period, orderId, paymentId });
      if (paidTransaction) {
        await sendBillingReceiptEmail({ transaction: paidTransaction, origin: new URL(request.url).origin });
      }
    }

    return NextResponse.json({ success: true, period, transaction: paidTransaction });
  } catch (error) {
    console.error('[infinity PUT]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Payment verification failed.' },
      { status: 500 },
    );
  }
}
