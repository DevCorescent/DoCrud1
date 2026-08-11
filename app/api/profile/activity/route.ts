import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';
import { getProfileActivity } from '@/lib/server/profile-activity';

export const dynamic = 'force-dynamic';

/**
 * GET /api/profile/activity
 *
 * Returns activity for the AUTHENTICATED caller only. There is deliberately no
 * userId parameter — the owner is always derived from the session, so this
 * endpoint cannot be pointed at somebody else's profile.
 *
 * Visitor identity is resolved server-side against the owner's entitlement.
 * Without it, items come back as `{ anonymous: true, user: null }` and carry no
 * id, name, avatar or href.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ownerId = await resolveSessionUserId(session);
    if (!ownerId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = Number.parseInt(request.nextUrl.searchParams.get('limit') || '30', 10);
    const { activities, canSeeIdentity } = await getProfileActivity(ownerId, limit);

    return NextResponse.json(
      { activities, canSeeIdentity },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    console.error('[profile/activity] GET error', error);
    return NextResponse.json({ error: 'Failed to load activity.' }, { status: 500 });
  }
}
