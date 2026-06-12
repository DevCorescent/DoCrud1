import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import {
  getRazorpayConfig,
  buildBillingAmounts,
  buildRazorpayReceipt,
  createPendingCommerceTransaction,
} from '@/lib/server/billing';
import { getFileTransfers } from '@/lib/server/file-transfers';

export const dynamic = 'force-dynamic';

const FEATURE_PLANS = {
  spotlight: { label: 'Spotlight (3 days)', days: 3, baseInPaise: 19900 },
  boost:     { label: 'Boost (7 days)',     days: 7, baseInPaise: 39900 },
  prime:     { label: 'Prime (30 days)',    days: 30, baseInPaise: 99900 },
} as const;

type FeaturePlan = keyof typeof FEATURE_PLANS;

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as { postId?: string; plan?: string } | null;
    const postId = typeof body?.postId === 'string' ? body.postId.trim() : '';
    const planKey = (typeof body?.plan === 'string' ? body.plan.trim() : '') as FeaturePlan;

    if (!postId) return NextResponse.json({ error: 'postId is required.' }, { status: 400 });
    if (!FEATURE_PLANS[planKey]) return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 });

    const [users, transfers] = await Promise.all([getStoredUsers(), getFileTransfers()]);
    const user = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
    if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const post = transfers.find((t) => t.id === postId || t.shareId === postId);
    if (!post) return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    if (post.uploadedByUserId !== user.id) {
      return NextResponse.json({ error: 'You can only feature your own posts.' }, { status: 403 });
    }

    const plan = FEATURE_PLANS[planKey];
    const amounts = buildBillingAmounts(plan.baseInPaise);
    const receipt = buildRazorpayReceipt(user.id, `feat_${planKey}`);

    const { keyId, keySecret } = getRazorpayConfig();
    if (!keyId || !keySecret) {
      return NextResponse.json({ error: 'Payment gateway not configured.' }, { status: 503 });
    }

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
        notes: { userId: user.id, postId, plan: planKey, postTitle: post.title || post.fileName },
      }),
    });

    if (!razorpayRes.ok) {
      const err = await razorpayRes.json().catch(() => ({})) as { error?: { description?: string } };
      throw new Error(err?.error?.description || 'Failed to create Razorpay order.');
    }

    const order = await razorpayRes.json() as { id: string };

    const transaction = await createPendingCommerceTransaction({
      user,
      providerOrderId: order.id,
      productType: 'feature_post',
      productLabel: `${plan.label} — ${post.title || post.fileName}`,
      baseAmountInPaise: plan.baseInPaise,
      amountInPaise: amounts.totalAmountInPaise,
      gstRate: 0.18,
      notes: JSON.stringify({ postId, plan: planKey }),
      receipt,
    });

    return NextResponse.json({
      orderId: order.id,
      amount: amounts.totalAmountInPaise,
      currency: 'INR',
      keyId,
      planLabel: plan.label,
      transactionId: transaction.id,
      postTitle: post.title || post.fileName,
    });
  } catch (error) {
    console.error('[feature-post/create-order]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed.' }, { status: 500 });
  }
}
