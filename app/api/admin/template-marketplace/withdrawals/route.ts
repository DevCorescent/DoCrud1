import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getOriginForRequest } from '@/lib/server/request';
import { listAllTemplateWithdrawals, updateTemplateWithdrawalByAdmin } from '@/lib/server/template-withdrawals';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const status = (searchParams.get('status') || 'all').trim() as any;
    const limit = Number(searchParams.get('limit') || '300');
    const withdrawals = await listAllTemplateWithdrawals({
      status: status === 'requested' || status === 'approved' || status === 'paid' || status === 'rejected' || status === 'cancelled' ? status : 'all',
      limit,
    });
    return NextResponse.json({ withdrawals }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load withdrawal requests.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json().catch(() => null) as any;
    const id = typeof body?.id === 'string' ? body.id : '';
    const action = body?.action === 'approve' || body?.action === 'reject' || body?.action === 'mark_paid' ? body.action : '';
    const adminNote = typeof body?.adminNote === 'string' ? body.adminNote : undefined;
    const transactionRef = typeof body?.transactionRef === 'string' ? body.transactionRef : undefined;
    if (!id || !action) return NextResponse.json({ error: 'Update payload is incomplete.' }, { status: 400 });

    const origin = getOriginForRequest(request);
    await updateTemplateWithdrawalByAdmin({
      id,
      action,
      adminNote,
      transactionRef,
      actorEmail: session.user.email || 'admin',
      origin,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update withdrawal request.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

