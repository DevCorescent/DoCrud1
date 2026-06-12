import { NextRequest, NextResponse } from 'next/server';
import { resolveReferralReferrer } from '@/lib/server/referrals';
import { getAllProfiles } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code') ?? '';
    if (!code || code.length > 24) {
      return NextResponse.json({ error: 'Invalid code.' }, { status: 400 });
    }

    const referrer = await resolveReferralReferrer(code);
    if (!referrer) {
      return NextResponse.json({ error: 'Referral code not found.' }, { status: 404 });
    }

    const profiles = await getAllProfiles();
    const profile = profiles[referrer.id] ?? {};

    return NextResponse.json({
      id: referrer.id,
      name: referrer.name,
      headline: profile.headline ?? null,
      avatarUrl: profile.avatarUrl ?? null,
    });
  } catch (err) {
    console.error('[public/referrer] GET error', err);
    return NextResponse.json({ error: 'Failed to resolve referrer.' }, { status: 500 });
  }
}
