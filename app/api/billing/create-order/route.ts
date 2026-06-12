import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { buildBillingAmounts, calculateCustomPlanAmountInPaise, createRazorpayOrder, getRazorpayConfig } from '@/lib/server/billing';
import { validateCoupon } from '@/lib/server/coupons';
import { resolveReferralReferrer } from '@/lib/server/referrals';
import { sanitizeCustomPlanConfiguration } from '@/lib/pricing-config';
import { getSaasPlanById } from '@/lib/server/saas';

export const dynamic = 'force-dynamic';

function isMockCheckoutEnabled() {
  return process.env.ENABLE_MOCK_CHECKOUT === 'true';
}

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const planId = typeof body?.planId === 'string' ? body.planId : '';
    const customConfiguration = sanitizeCustomPlanConfiguration(body?.customConfiguration);
    const gstin = typeof body?.gstin === 'string' ? body.gstin.trim() : '';
    const couponCode = typeof body?.couponCode === 'string' ? body.couponCode.trim() : '';
    const referralCode = typeof body?.referralCode === 'string' ? body.referralCode.trim() : '';
    if (!planId) {
      return NextResponse.json({ error: 'Plan is required' }, { status: 400 });
    }

    const [users, plan] = await Promise.all([
      getStoredUsers(),
      getSaasPlanById(planId),
    ]);
    const normalizedEmail = (session.user.email || '').trim().toLowerCase();
    const user = users.find((entry) => entry.email.trim().toLowerCase() === normalizedEmail);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!plan || !plan.active) {
      return NextResponse.json({ error: 'Plan not available' }, { status: 404 });
    }

    // Guard against stale client requests for removed plans
    const removedPlanIds = ['workspace-pro', 'workspace-build-your-own', 'talent-directory-pass', 'gigs-pass', 'drive-starter', 'drive-pro'];
    if (removedPlanIds.includes(planId)) {
      return NextResponse.json(
        { error: 'This plan has been discontinued. Upgrade to Docrud Infinity instead.', redirectTo: '/pricing' },
        { status: 410 },
      );
    }

    if (plan.billingModel !== 'subscription' && plan.billingModel !== 'payg' && plan.billingModel !== 'custom') {
      return NextResponse.json(
        { error: 'This plan is not available for checkout. Upgrade to Docrud Infinity at /pricing.' },
        { status: 410 },
      );
    }

    const targetAudience = user.accountType === 'individual' ? 'individual' : 'business';
    const isUniversalWorkspacePlan = plan.id.startsWith('workspace-');
    if (!isUniversalWorkspacePlan && (plan.targetAudience || 'business') !== targetAudience) {
      return NextResponse.json({
        error: `This ${plan.targetAudience || 'business'} plan is not available for your ${targetAudience} account. Please choose a matching plan from pricing.`,
        expectedAccountType: targetAudience,
        planAudience: plan.targetAudience || 'business',
        pricingUrl: '/pricing',
      }, { status: 403 });
    }

    const razorpayConfig = getRazorpayConfig();
    if (!razorpayConfig.serverConfigured) {
      return NextResponse.json({
        error: 'Razorpay payment gateway is not configured. Please contact support or try again later.',
        supportUrl: '/support',
        fallbackAvailable: isMockCheckoutEnabled(),
      }, { status: 503 });
    }

    if (customConfiguration && customConfiguration.basePlanId !== plan.id) {
      return NextResponse.json({ error: 'Custom configuration does not match the selected base plan.' }, { status: 400 });
    }

    const baseAmount = calculateCustomPlanAmountInPaise(plan, customConfiguration);
    let discountAmountInPaise = 0;
    let appliedCoupon: string | undefined;
    let appliedReferral: string | undefined;

    if (referralCode) {
      const referrer = await resolveReferralReferrer(referralCode);
      if (!referrer) {
        return NextResponse.json({ error: 'Referral link is invalid.' }, { status: 400 });
      }
      if (referrer.id === user.id) {
        return NextResponse.json({ error: 'Referral link cannot be used on the same account.' }, { status: 400 });
      }
      discountAmountInPaise = Math.round(baseAmount * 0.5);
      appliedReferral = referralCode.trim().toUpperCase();
    } else if (couponCode) {
      const validation = await validateCoupon(couponCode);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.reason }, { status: 400 });
      }
      discountAmountInPaise = Math.round(baseAmount * (validation.coupon.percentOff / 100));
      appliedCoupon = validation.coupon.code;
    }

    const { order, transaction } = await createRazorpayOrder(user, plan, customConfiguration, {
      discountAmountInPaise,
      couponCode: appliedCoupon,
      referralCode: appliedReferral,
      gstin: gstin || undefined,
    });

    const pricing = buildBillingAmounts(Math.max(0, baseAmount - discountAmountInPaise));

    return NextResponse.json({
      order,
      transaction,
      keyId: razorpayConfig.keyId,
      isTestMode: razorpayConfig.isTestMode,
      plan: {
        id: plan.id,
        name: plan.name,
        amountInPaise: plan.amountInPaise,
        priceLabel: plan.priceLabel,
      },
      customConfiguration,
      customer: {
        name: user.name,
        email: user.email,
        contact: '',
      },
      pricing,
      discount: {
        amountInPaise: discountAmountInPaise,
        couponCode: appliedCoupon,
        referralCode: appliedReferral,
      },
      gstin: gstin || '',
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create checkout order',
        fallbackAvailable: isMockCheckoutEnabled(),
      },
      { status: 500 },
    );
  }
}
