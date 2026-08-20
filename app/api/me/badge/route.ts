import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { resolveSessionUserId } from '@/lib/server/auth';
import { getProfileFields } from '@/lib/server/user-profiles';
import { calculateProfileScore } from '@/lib/profile-score';

export const dynamic = 'force-dynamic';

/**
 * The badge itself needs only the first four. The rest are the inputs to the
 * shared profile score (lib/profile-score.ts) which the top-nav announcement
 * and the avatar ring both render — folded into this existing call so the nav
 * does not need a second round-trip on every page load.
 */
const BADGE_FIELDS = [
  'docrudGo', 'docrudInfinity', 'docrudInfinityExpiresAt', 'avatarUrl',
  'headline', 'bio', 'location', 'website',
  'skills', 'interests', 'experience', 'education', 'achievements', 'socialLinks',
] as const;

export async function GET() {
  const session = await getAuthSession();
  const userId = await resolveSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ docrudGo: false, avatarUrl: null, profileScore: null });
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

  // Derived, never stored — the score cannot go stale against the profile.
  const { score } = calculateProfileScore(profile);

  return NextResponse.json(
    { docrudGo, avatarUrl: profile?.avatarUrl ?? null, profileScore: score },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
