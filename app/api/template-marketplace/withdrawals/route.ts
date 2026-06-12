import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { createTemplateWithdrawalRequest, getSellerWithdrawalSummary, listTemplateWithdrawals } from '@/lib/server/template-withdrawals';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  const users = await getStoredUsers();
  return users.find((u) => u.id === session.user!.id) || null;
}

export async function GET() {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [summary, withdrawals] = await Promise.all([
      getSellerWithdrawalSummary(actor.id),
      listTemplateWithdrawals({ sellerUserId: actor.id, limit: 200 }),
    ]);

    return NextResponse.json({ summary, withdrawals }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load withdrawals.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => null) as any;
    const amountInPaise = Number(body?.amountInPaise);
    const payoutMethodLabel = typeof body?.payoutMethodLabel === 'string' ? body.payoutMethodLabel : '';
    const payoutMethodDetails = typeof body?.payoutMethodDetails === 'string' ? body.payoutMethodDetails : '';

    const record = await createTemplateWithdrawalRequest({
      actor,
      amountInPaise,
      payoutMethodLabel,
      payoutMethodDetails,
    });

    return NextResponse.json({ withdrawal: record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create withdrawal request.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

