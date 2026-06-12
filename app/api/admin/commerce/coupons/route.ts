import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { createCoupon, listCoupons, setCouponActive } from '@/lib/server/coupons';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAuthSession();
  if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const coupons = await listCoupons();
  return NextResponse.json({ coupons }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = await request.json().catch(() => null) as any;
    const code = typeof body?.code === 'string' ? body.code : undefined;
    const percentOff = Number(body?.percentOff);
    const maxRedemptions = body?.maxRedemptions == null ? undefined : Number(body.maxRedemptions);
    const validUntil = typeof body?.validUntil === 'string' ? body.validUntil : undefined;
    const coupon = await createCoupon({ code, percentOff, maxRedemptions, validUntil });
    return NextResponse.json({ coupon }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create coupon.' }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (session?.user?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const body = await request.json().catch(() => null) as any;
    const id = typeof body?.id === 'string' ? body.id : '';
    const active = Boolean(body?.active);
    if (!id) return NextResponse.json({ error: 'Coupon id is required.' }, { status: 400 });
    const coupon = await setCouponActive(id, active);
    return NextResponse.json({ coupon }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update coupon.' }, { status: 400 });
  }
}

