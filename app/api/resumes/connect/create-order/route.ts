import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { createPendingCommerceTransaction } from '@/lib/server/billing';
import { createResumeConnectOrder, RESUME_CONNECT_PRICING } from '@/lib/server/resume-connect';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as any;
    const mode = body?.mode === 'monthly_pass' ? 'monthly_pass' : 'one_time';
    const resumeId = typeof body?.resumeId === 'string' ? body.resumeId.trim() : '';
    const resumeSlug = typeof body?.resumeSlug === 'string' ? body.resumeSlug.trim() : '';
    const quantity = typeof body?.quantity === 'number' || typeof body?.quantity === 'string'
      ? Number(body.quantity)
      : undefined;

    const result = await createResumeConnectOrder({
      buyerUserId: session.user.id,
      buyerName: session.user.name || '',
      buyerEmail: session.user.email || '',
      mode,
      resumeId: mode === 'one_time' && resumeId ? resumeId : undefined,
      resumeSlug: mode === 'one_time' && resumeSlug ? resumeSlug : undefined,
      quantity: mode === 'one_time' && !resumeId ? quantity : undefined,
    });

    const users = await getStoredUsers();
    const user = users.find((entry) => entry.id === session.user.id) || users.find((entry) => entry.email === session.user.email);
    if (user && result?.order?.id) {
      const normalizedQty = mode === 'monthly_pass'
        ? RESUME_CONNECT_PRICING.monthlyPassCredits
        : resumeId
          ? 1
          : Math.round(Number(quantity || 0));
      await createPendingCommerceTransaction({
        user,
        providerOrderId: String(result.order.id),
        productType: 'resume_connect',
        productLabel: resumeId ? 'Talent contact unlock' : 'Talent credits',
        baseAmountInPaise: result.amountInPaise,
        amountInPaise: result.amountInPaise,
        quantity: normalizedQty > 0 ? normalizedQty : undefined,
        unitAmountInPaise: mode === 'monthly_pass' ? Math.round(result.amountInPaise / RESUME_CONNECT_PRICING.monthlyPassCredits) : RESUME_CONNECT_PRICING.oneTimeAmountInPaise,
        gstRate: 0,
        notes: resumeId ? `Resume connect purchase (${resumeId})` : 'Resume connect credits purchase',
        receipt: String((result.order as any).receipt || ''),
      });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create checkout.';
    const status = /configured|required|unauthorized/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
