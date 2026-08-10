import { NextRequest, NextResponse } from 'next/server';
import { getStoredUserById } from '@/lib/server/users';
import { isPresenceEnded, isUserOnline } from '@/lib/presence';

export const dynamic = 'force-dynamic';

/**
 * Presence for a single user.
 *
 * Returns only the heartbeat timestamp and the derived online flag — never
 * email, IP, location or device data.
 */
export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const user = await getStoredUserById(params.userId);
    if (!user) {
      return NextResponse.json({ lastSeenAt: null, online: false }, { status: 404 });
    }

    // Only the presence heartbeat counts. Deliberately no fallback to
    // `lastLogin` (logging in then closing the browser is not being online) and
    // none to `lastActivityAt` (that is an analytics signal written by
    // background server activity, not by a live tab).
    const lastSeenAt = user.lastSeenAt ?? null;

    return NextResponse.json({
      userId: params.userId,
      lastSeenAt,
      online: !isPresenceEnded(lastSeenAt, user.presenceEndedAt ?? null)
        && isUserOnline(lastSeenAt),
    });
  } catch {
    return NextResponse.json({ lastSeenAt: null, online: false }, { status: 500 });
  }
}
