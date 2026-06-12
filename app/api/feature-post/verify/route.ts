import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import {
  verifyRazorpayPaymentSignature,
  getBillingTransactions,
  markBillingTransactionPaid,
  sendBillingReceiptEmail,
} from '@/lib/server/billing';
import { featureTransfer } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
      postId?: string;
      plan?: string;
    } | null;

    const orderId   = typeof body?.razorpay_order_id   === 'string' ? body.razorpay_order_id   : '';
    const paymentId = typeof body?.razorpay_payment_id  === 'string' ? body.razorpay_payment_id  : '';
    const signature = typeof body?.razorpay_signature   === 'string' ? body.razorpay_signature   : '';
    const postId    = typeof body?.postId               === 'string' ? body.postId               : '';
    const plan      = typeof body?.plan                 === 'string' ? body.plan                 : '';

    if (!orderId || !paymentId || !signature || !postId || !plan) {
      return NextResponse.json({ error: 'Incomplete payload.' }, { status: 400 });
    }

    const isValid = verifyRazorpayPaymentSignature(orderId, paymentId, signature);
    if (!isValid) {
      return NextResponse.json({ error: 'Payment signature verification failed.' }, { status: 400 });
    }

    const [users, transactions] = await Promise.all([getStoredUsers(), getBillingTransactions()]);
    const user = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const transaction = transactions.find((t) => t.providerOrderId === orderId);
    if (!transaction || transaction.userId !== user.id) {
      return NextResponse.json({ error: 'Transaction not found.' }, { status: 404 });
    }

    const paidTransaction = await markBillingTransactionPaid({ providerOrderId: orderId, providerPaymentId: paymentId, providerSignature: signature });

    const featuredPost = await featureTransfer(postId, plan as 'spotlight' | 'boost' | 'prime', orderId);

    if (paidTransaction) {
      void sendBillingReceiptEmail({ transaction: paidTransaction, origin: new URL(request.url).origin }).catch(() => {});
    }

    return NextResponse.json({ success: true, post: { id: featuredPost.id, featured: true, featuredUntil: featuredPost.featuredUntil } });
  } catch (error) {
    console.error('[feature-post/verify]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed.' }, { status: 500 });
  }
}
