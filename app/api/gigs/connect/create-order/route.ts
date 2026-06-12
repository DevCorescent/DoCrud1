import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { createPendingCommerceTransaction } from '@/lib/server/billing';
import { createGigConnectOrder, GIG_CONNECT_PRICING } from '@/lib/server/gig-connect';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null) as any;
    const mode = body?.mode === 'monthly_pass' ? 'monthly_pass' : 'one_time';
    const quantity = typeof body?.quantity === 'number' || typeof body?.quantity === 'string'
      ? Number(body.quantity)
      : undefined;

    const result = await createGigConnectOrder({
      buyerUserId: session.user.id,
      buyerName: session.user.name || '',
      buyerEmail: session.user.email || '',
      mode,
      quantity: mode === 'one_time' ? quantity : undefined,
    });

    const users = await getStoredUsers();
    const user = users.find((entry) => entry.id === session.user.id) || users.find((entry) => entry.email === session.user.email);
    if (user && result?.order?.id) {
      const normalizedQty = mode === 'monthly_pass'
        ? GIG_CONNECT_PRICING.monthlyPassCredits
        : Math.round(Number(quantity || 0));
      await createPendingCommerceTransaction({
        user,
        providerOrderId: String(result.order.id),
        productType: 'gig_connect',
        productLabel: mode === 'monthly_pass' ? 'Gigs monthly pass' : 'Gigs credits',
        baseAmountInPaise: result.amountInPaise,
        amountInPaise: result.amountInPaise,
        quantity: normalizedQty > 0 ? normalizedQty : undefined,
        unitAmountInPaise: mode === 'monthly_pass' ? Math.round(result.amountInPaise / GIG_CONNECT_PRICING.monthlyPassCredits) : GIG_CONNECT_PRICING.oneTimeAmountInPaise,
        gstRate: 0,
        notes: 'Gig connect credits purchase',
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
