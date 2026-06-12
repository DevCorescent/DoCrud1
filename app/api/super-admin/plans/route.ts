import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { getSaasPlans, saveSaasPlans } from '@/lib/server/saas';
import { getStoredUsers } from '@/lib/server/auth';
import { getBillingTransactions } from '@/lib/server/billing';

async function guard(req: NextRequest) {
  const s = await getSuperAdminSessionFromRequest(req);
  return s.valid ? s : null;
}

export async function GET(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [plans, users, billing] = await Promise.all([
      getSaasPlans(),
      getStoredUsers(),
      getBillingTransactions().catch(() => []),
    ]);

    // Per-plan subscriber count and revenue
    const planStats: Record<string, { subscribers: number; revenue: number; trials: number; active: number; cancelled: number }> = {};
    plans.forEach((p) => {
      planStats[p.id] = { subscribers: 0, revenue: 0, trials: 0, active: 0, cancelled: 0 };
    });

    users.forEach((u) => {
      const pid = u.subscription?.planId;
      if (pid && planStats[pid]) {
        planStats[pid].subscribers++;
        const st = u.subscription?.status;
        if (st === 'trial') planStats[pid].trials++;
        else if (st === 'active') planStats[pid].active++;
        else if (st === 'upgrade_required' || st === 'suspended') planStats[pid].cancelled++;
      }
    });

    billing
      .filter((t: { status: string }) => t.status === 'paid' || t.status === 'success')
      .forEach((t: { planId?: string; amountPaise?: number }) => {
        const pid = t.planId;
        if (pid && planStats[pid]) {
          planStats[pid].revenue += t.amountPaise || 0;
        }
      });

    const enriched = plans.map((p) => ({
      ...p,
      stats: planStats[p.id] || { subscribers: 0, revenue: 0, trials: 0, active: 0, cancelled: 0 },
    }));

    return NextResponse.json({ plans: enriched });
  } catch (err) {
    console.error('[super-admin/plans GET]', err);
    return NextResponse.json({ error: 'Failed to load plans' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await guard(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action, plan } = body;

    const plans = await getSaasPlans();

    if (action === 'create') {
      if (!plan?.id || !plan?.name) return NextResponse.json({ error: 'Plan id and name required' }, { status: 400 });
      if (plans.find((p) => p.id === plan.id)) return NextResponse.json({ error: 'Plan with this ID already exists' }, { status: 409 });
      plans.push({ ...plan, isCustom: true, createdAt: new Date().toISOString() });
      await saveSaasPlans(plans);
      await appendSuperAdminAudit({ action: 'plan_created', targetType: 'plan', targetId: plan.id, details: { plan }, ip: req.headers.get('x-forwarded-for') || undefined });
      return NextResponse.json({ success: true });
    }

    if (action === 'update') {
      if (!plan?.id) return NextResponse.json({ error: 'Plan id required' }, { status: 400 });
      const idx = plans.findIndex((p) => p.id === plan.id);
      if (idx === -1) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      plans[idx] = { ...plans[idx], ...plan, updatedAt: new Date().toISOString() };
      await saveSaasPlans(plans);
      await appendSuperAdminAudit({ action: 'plan_updated', targetType: 'plan', targetId: plan.id, details: { plan }, ip: req.headers.get('x-forwarded-for') || undefined });
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      if (!plan?.id) return NextResponse.json({ error: 'Plan id required' }, { status: 400 });
      const filtered = plans.filter((p) => p.id !== plan.id);
      if (filtered.length === plans.length) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      await saveSaasPlans(filtered);
      await appendSuperAdminAudit({ action: 'plan_deleted', targetType: 'plan', targetId: plan.id, ip: req.headers.get('x-forwarded-for') || undefined });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[super-admin/plans POST]', err);
    return NextResponse.json({ error: 'Failed to process plan action' }, { status: 500 });
  }
}
