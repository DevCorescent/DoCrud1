import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { createPendingBillingTransaction, markBillingTransactionPaid, syncPaidPlanToUser } from '@/lib/server/billing';
import { sanitizeCustomPlanConfiguration } from '@/lib/pricing-config';
import { getSaasPlanById } from '@/lib/server/saas';

export const dynamic = 'force-dynamic';

function isMockCheckoutEnabled() {
  return process.env.ENABLE_MOCK_CHECKOUT === 'true';
}

export async function POST(request: Request) {
  try {
    if (!isMockCheckoutEnabled()) {
      return NextResponse.json({ error: 'Mock checkout is disabled. Use Razorpay payment flow instead.' }, { status: 403 });
    }

    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const planId = typeof body?.planId === 'string' ? body.planId : '';
    const customConfiguration = sanitizeCustomPlanConfiguration(body?.customConfiguration);
    if (!planId) {
      return NextResponse.json({ error: 'Plan is required.' }, { status: 400 });
    }
    if (customConfiguration && customConfiguration.basePlanId !== planId) {
      return NextResponse.json({ error: 'Custom configuration does not match the selected base plan.' }, { status: 400 });
    }

    const [users, plan] = await Promise.all([
      getStoredUsers(),
      getSaasPlanById(planId),
    ]);
    const normalizedEmail = (session.user.email || '').trim().toLowerCase();
    const user = users.find((entry) => entry.email.trim().toLowerCase() === normalizedEmail);

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    if (!plan || !plan.active || plan.billingModel === 'custom' || plan.billingModel === 'free') {
      return NextResponse.json({ error: 'This plan cannot be activated from checkout.' }, { status: 400 });
    }

    const targetAudience = user.accountType === 'individual' ? 'individual' : 'business';
    if ((plan.targetAudience || 'business') !== targetAudience) {
      return NextResponse.json({
        error: `This ${plan.targetAudience || 'business'} plan is not available for your ${targetAudience} account. Please choose a matching plan from pricing.`,
        expectedAccountType: targetAudience,
        planAudience: plan.targetAudience || 'business',
        pricingUrl: '/pricing',
      }, { status: 403 });
    }

    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const providerOrderId = `mock_order_${uniqueSuffix}`;
    const providerPaymentId = `mock_pay_${uniqueSuffix}`;

    const transaction = await createPendingBillingTransaction(
      user,
      plan,
      providerOrderId,
      `Instant activation checkout completed for ${plan.name}`,
      undefined,
      customConfiguration,
    );
    const paidTransaction = await markBillingTransactionPaid({
      providerOrderId,
      providerPaymentId,
      providerSignature: 'mock_signature',
    });
    const updatedUser = await syncPaidPlanToUser(user.id, plan.id, paidTransaction, customConfiguration);

    return NextResponse.json({
      success: true,
      plan: {
        id: plan.id,
        name: plan.name,
        billingModel: plan.billingModel,
      },
      transaction,
      updatedUser,
      redirectTo: `/welcome?plan=${encodeURIComponent(plan.id)}`,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to complete checkout.' },
      { status: 500 },
    );
  }
}
