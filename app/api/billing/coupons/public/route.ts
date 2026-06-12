import { NextRequest, NextResponse } from 'next/server';
import { listCoupons } from '@/lib/server/coupons';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(12, Number(searchParams.get('limit') || '6')));
    const coupons = await listCoupons();
    const now = Date.now();
    const active = coupons.filter((c) => {
      if (!c.active) return false;
      if (c.maxRedemptions && c.redeemedCount >= c.maxRedemptions) return false;
      if (c.validFrom) {
        const from = new Date(c.validFrom).getTime();
        if (Number.isFinite(from) && now < from) return false;
      }
      if (c.validUntil) {
        const until = new Date(c.validUntil).getTime();
        if (Number.isFinite(until) && now > until) return false;
      }
      return true;
    });
    return NextResponse.json({
      coupons: active.slice(0, limit).map((c) => ({
        id: c.id,
        code: c.code,
        percentOff: c.percentOff,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load coupons.' }, { status: 400 });
  }
}

