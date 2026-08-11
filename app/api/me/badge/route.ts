import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { resolveSessionUserId } from '@/lib/server/auth';
import { getProfileFields } from '@/lib/server/user-profiles';

export const dynamic = 'force-dynamic';

/** The only profile fields this badge renders. */
const BADGE_FIELDS = ['docrudGo', 'docrudInfinity', 'docrudInfinityExpiresAt', 'avatarUrl'] as const;

export async function GET() {
  const session = await getAuthSession();
  const userId = await resolveSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ docrudGo: false, avatarUrl: null });
  }
  // Projected: the full profile document carries resume files and portfolio
  // entries this endpoint never looks at.
  const profile = await getProfileFields(userId, BADGE_FIELDS);

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
