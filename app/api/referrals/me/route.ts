import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { ensureUserReferralCode } from '@/lib/server/referrals';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const code = await ensureUserReferralCode(session.user.id);
  if (!code) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const origin = new URL(request.url).origin;
  return NextResponse.json({
    code,
    link: `${origin}/pricing?ref=${encodeURIComponent(code)}`,
  });
}

