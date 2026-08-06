import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getProfileData } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getAuthSession();
  const { resolveSessionUserId } = await import('@/lib/server/auth');
  const userId = await resolveSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ docrudGo: false, avatarUrl: null });
  }
  const profile = await getProfileData(userId);

  // Infinity badge: granted via docrudGo (legacy) OR active docrudInfinity subscription
  const hasInfinityActive = !!profile?.docrudInfinity && (
    !profile.docrudInfinityExpiresAt ||
    new Date(profile.docrudInfinityExpiresAt).getTime() > Date.now()
  );
  const docrudGo = !!(profile?.docrudGo || hasInfinityActive);

  return NextResponse.json(
    { docrudGo, avatarUrl: profile?.avatarUrl ?? null },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
