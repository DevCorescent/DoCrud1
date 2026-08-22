import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { ensureUserReferralCode, getReferralStatsForUser } from '@/lib/server/referrals';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [code, stats] = await Promise.all([
      ensureUserReferralCode(session.user.id),
      getReferralStatsForUser(session.user.id),
    ]);

    const origin = new URL(request.url).origin;
    const link = code ? `${origin}/signup?ref=${encodeURIComponent(code)}` : null;

    return NextResponse.json({
      code,
      link,
      ...stats,
    });
  } catch (error) {
    console.error('[referrals/stats]', error);
    return NextResponse.json({ error: 'Failed to load referral stats.' }, { status: 500 });
  }
}
