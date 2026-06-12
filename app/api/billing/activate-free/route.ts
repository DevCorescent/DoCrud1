import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { sanitizeCustomPlanConfiguration } from '@/lib/pricing-config';
import { assignUserPlan, getSaasPlanById } from '@/lib/server/saas';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
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

    if (!plan || !plan.active || plan.billingModel !== 'free') {
      return NextResponse.json({ error: 'This plan is not available for free activation.' }, { status: 400 });
    }

    const targetAudience = user.accountType === 'individual' ? 'individual' : 'business';
    if ((plan.targetAudience || 'business') !== targetAudience) {
      return NextResponse.json({ error: 'This free plan is not available for your account type.' }, { status: 403 });
    }

    await assignUserPlan(user.id, plan.id, 'active', customConfiguration);

    return NextResponse.json({
      success: true,
      redirectTo: `/welcome?plan=${encodeURIComponent(plan.id)}`,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to activate free plan.' },
      { status: 500 },
    );
  }
}
