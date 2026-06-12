import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getPublicSaasPlans, getSaasPlans, saveSaasPlans } from '@/lib/server/saas';
import { SaasPlan } from '@/types/document';

export const dynamic = 'force-dynamic';

function isAdmin(session: Awaited<ReturnType<typeof getAuthSession>>) {
  return session?.user?.role === 'admin';
}

export async function GET() {
  try {
    const session = await getAuthSession();
    const plans = isAdmin(session) ? await getSaasPlans() : await getPublicSaasPlans();
    return NextResponse.json(plans);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load SaaS plans' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as Partial<SaasPlan>;
    if (!payload.name?.trim() || !payload.description?.trim()) {
      return NextResponse.json({ error: 'Plan name and description are required' }, { status: 400 });
    }

    const plans = await getSaasPlans();
    const now = new Date().toISOString();
    const nextPlan: SaasPlan = {
      id: payload.id?.trim() || `plan-${Date.now()}`,
      name: payload.name.trim(),
      description: payload.description.trim(),
      priceLabel: payload.priceLabel?.trim() || 'Custom pricing',
      amountInPaise: payload.amountInPaise ? Number(payload.amountInPaise) : undefined,
      targetAudience: payload.targetAudience || 'business',
      billingModel: payload.billingModel || 'subscription',
      includedFeatures: Array.isArray(payload.includedFeatures) ? payload.includedFeatures : ['dashboard', 'document_summary', 'generate_documents', 'history', 'client_portal', 'tutorials'],
      freeDocumentGenerations: Number(payload.freeDocumentGenerations || 5),
      maxDocumentGenerations: Number(payload.maxDocumentGenerations || payload.freeDocumentGenerations || 5),
      maxInternalUsers: payload.maxInternalUsers !== undefined ? Number(payload.maxInternalUsers) : undefined,
      maxMailboxThreads: payload.maxMailboxThreads !== undefined ? Number(payload.maxMailboxThreads) : undefined,
      overagePriceLabel: payload.overagePriceLabel?.trim() || '',
      watermarkOnFreeGenerations: payload.watermarkOnFreeGenerations ?? true,
      isPublic: payload.isPublic ?? true,
      isDefault: payload.isDefault ?? false,
      active: payload.active ?? true,
      ctaLabel: payload.ctaLabel?.trim() || 'Choose Plan',
      createdAt: now,
      updatedAt: now,
    };

    const normalizedPlans = nextPlan.isDefault
      ? plans.map((plan) => ({ ...plan, isDefault: false }))
      : plans;

    await saveSaasPlans([...normalizedPlans, nextPlan]);
    return NextResponse.json(nextPlan, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create SaaS plan' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json() as Partial<SaasPlan> & { id?: string };
    if (!payload.id) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    const plans = await getSaasPlans();
    const index = plans.findIndex((plan) => plan.id === payload.id);
    if (index === -1) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const updatedPlan: SaasPlan = {
      ...plans[index],
      ...payload,
      amountInPaise: payload.amountInPaise !== undefined ? Number(payload.amountInPaise) : plans[index].amountInPaise,
      maxInternalUsers: payload.maxInternalUsers !== undefined ? Number(payload.maxInternalUsers) : plans[index].maxInternalUsers,
      maxMailboxThreads: payload.maxMailboxThreads !== undefined ? Number(payload.maxMailboxThreads) : plans[index].maxMailboxThreads,
      name: payload.name?.trim() || plans[index].name,
      description: payload.description?.trim() || plans[index].description,
      priceLabel: payload.priceLabel?.trim() || plans[index].priceLabel,
      targetAudience: payload.targetAudience || plans[index].targetAudience || 'business',
      overagePriceLabel: payload.overagePriceLabel?.trim() ?? plans[index].overagePriceLabel,
      ctaLabel: payload.ctaLabel?.trim() || plans[index].ctaLabel,
      updatedAt: new Date().toISOString(),
    };

    const nextPlans = updatedPlan.isDefault
      ? plans.map((plan) => plan.id === updatedPlan.id ? updatedPlan : { ...plan, isDefault: false })
      : plans.map((plan) => plan.id === updatedPlan.id ? updatedPlan : plan);

    await saveSaasPlans(nextPlans);
    return NextResponse.json(updatedPlan);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update SaaS plan' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!isAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });
    }

    const plans = await getSaasPlans();
    const filtered = plans.filter((plan) => plan.id !== id);
    await saveSaasPlans(filtered);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete SaaS plan' }, { status: 500 });
  }
}
