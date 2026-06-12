import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { listBuyerPurchases } from '@/lib/server/resume-connect';
import { listGigConnectPurchases } from '@/lib/server/gig-connect';
import { getEffectiveSaasPlanForUser, getSubscriptionCycleRemaining, isSubscriptionPeriodExpired } from '@/lib/server/saas';
import { RESUME_CONNECT_PRICING } from '@/lib/server/resume-connect';
import { GIG_CONNECT_PRICING } from '@/lib/server/gig-connect';

export const dynamic = 'force-dynamic';

function safeInt(value: unknown) {
  const num = Math.round(Number(value || 0));
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const normalizedEmail = String(session.user.email || '').trim().toLowerCase();
    const user = users.find((entry) => entry.email.trim().toLowerCase() === normalizedEmail) || null;
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const plan = await getEffectiveSaasPlanForUser(user);
    const subscription = user.subscription || null;
    const isExpired = subscription ? isSubscriptionPeriodExpired(subscription) : false;

    const [resumePurchases, gigPurchases] = await Promise.all([
      listBuyerPurchases(user.id),
      listGigConnectPurchases(user.id),
    ]);

    const now = Date.now();
    const activeResumeCredits = resumePurchases
      .filter((purchase) => {
        if (purchase.status !== 'paid') return false;
        if (purchase.resumeId) return false; // only count generic credits in the limits card
        if (!purchase.validUntil) return true;
        const until = new Date(purchase.validUntil).getTime();
        return Number.isFinite(until) && until > now;
      })
      .reduce((sum, purchase) => sum + Math.max(0, safeInt(purchase.creditsGranted) - safeInt(purchase.creditsUsed)), 0);

    const activeGigCredits = gigPurchases
      .filter((purchase) => {
        if (purchase.status !== 'paid') return false;
        if (!purchase.validUntil) return true;
        const until = new Date(purchase.validUntil).getTime();
        return Number.isFinite(until) && until > now;
      })
      .reduce((sum, purchase) => sum + Math.max(0, safeInt(purchase.creditsGranted) - safeInt(purchase.creditsUsed)), 0);

    const talentRemaining = getSubscriptionCycleRemaining({
      maxPerCycle: isExpired ? 0 : plan?.maxTalentConnectsPerCycle,
      used: subscription?.talentConnectsUsed,
    });

    const gigsRemaining = getSubscriptionCycleRemaining({
      maxPerCycle: isExpired ? 0 : plan?.maxGigProposalsPerCycle,
      used: subscription?.gigProposalsUsed,
    });

    return NextResponse.json(
      {
        ok: true,
        subscription: subscription
          ? {
              planId: subscription.planId,
              planName: subscription.planName,
              status: subscription.status,
              currentPeriodEnd: subscription.currentPeriodEnd,
              upgradeRequired: subscription.status === 'upgrade_required',
            }
          : null,
        talentDirectory: {
          included: Boolean(talentRemaining.maxPerCycle),
          maxPerCycle: safeInt(talentRemaining.maxPerCycle),
          used: safeInt(talentRemaining.used),
          remaining: safeInt(talentRemaining.remaining),
          extraCredits: activeResumeCredits,
          topup: {
            unitAmountInPaise: RESUME_CONNECT_PRICING.oneTimeAmountInPaise,
            minQuantity: RESUME_CONNECT_PRICING.oneTimeMinQuantity,
            maxQuantity: RESUME_CONNECT_PRICING.oneTimeMaxQuantity,
          },
        },
        gigs: {
          included: Boolean(gigsRemaining.maxPerCycle),
          maxPerCycle: safeInt(gigsRemaining.maxPerCycle),
          used: safeInt(gigsRemaining.used),
          remaining: safeInt(gigsRemaining.remaining),
          extraCredits: activeGigCredits,
          topup: {
            unitAmountInPaise: GIG_CONNECT_PRICING.oneTimeAmountInPaise,
            minQuantity: GIG_CONNECT_PRICING.oneTimeMinQuantity,
            maxQuantity: GIG_CONNECT_PRICING.oneTimeMaxQuantity,
          },
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load limits.' },
      { status: 500 },
    );
  }
}
