import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getMailPolicies, saveMailPolicies } from '@/lib/server/mail-policies';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const policies = await getMailPolicies();
    return NextResponse.json({ policies });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load mail policies' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const payload = await request.json().catch(() => null) as any;
    const policies = payload?.policies && typeof payload.policies === 'object' ? payload.policies : null;
    if (!policies) {
      return NextResponse.json({ error: 'policies required' }, { status: 400 });
    }
    await saveMailPolicies(policies);
    const next = await getMailPolicies();
    return NextResponse.json({ policies: next });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save mail policies' }, { status: 500 });
  }
}

