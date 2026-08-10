import { NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserByEmail, touchUserLastSeen } from '@/lib/server/users';
import { PRESENCE_MIN_WRITE_INTERVAL_MS, isPresenceEnded, parseLastSeen } from '@/lib/presence';

export const dynamic = 'force-dynamic';

/**
 * Presence heartbeat — the ONLY writer of `lastSeenAt`.
 *
 * The user is always derived from the server-side session. No request body is
 * read at all, so a client cannot stamp presence for another account.
 *
 * `lastActivityAt` is intentionally left alone here: it belongs to the
 * analytics/intelligence layer (appendUserActivityEvent) and mixing the two
 * would make presence reflect background server work rather than a live tab.
 */
export async function POST() {
  try {
    const session = await getAuthSession();
    const email = session?.user?.email;
    if (!email) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // Per-row lookup instead of loading and rewriting the whole users table.
    const user = await getStoredUserByEmail(email);
    if (!user) return NextResponse.json({ ok: true, lastSeenAt: null });

    const now = Date.now();
    const previous = parseLastSeen(user.lastSeenAt);

    // Throttle writes: several tabs, a refocus and the interval can all land at
    // once, and none of them change the answer within the write window.
    //
    // Exception: if presence was explicitly ended (the user signed out and back
    // in), the stored timestamp is being suppressed, so this heartbeat DOES
    // change the answer and must be written through.
    const wasEnded = isPresenceEnded(user.lastSeenAt, user.presenceEndedAt);
    if (!wasEnded && previous !== null && now - previous < PRESENCE_MIN_WRITE_INTERVAL_MS) {
      return NextResponse.json({ ok: true, lastSeenAt: user.lastSeenAt ?? null });
    }

    const lastSeenAt = new Date(now).toISOString();
    await touchUserLastSeen(user.id, lastSeenAt);

    return NextResponse.json({ ok: true, lastSeenAt });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
