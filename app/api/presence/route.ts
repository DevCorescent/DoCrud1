import { NextRequest, NextResponse } from 'next/server';
import { getStoredUsers } from '@/lib/server/users';
import { selectUserPresenceRows } from '@/lib/server/db/users-rows';
import { isPresenceEnded, isUserOnline } from '@/lib/presence';

export const dynamic = 'force-dynamic';

/** Upper bound on ids per request — a feed page never needs more than this. */
const MAX_IDS = 100;

/**
 * Batch presence lookup: GET /api/presence?ids=a,b,c
 *
 * Lists and feeds render many user cards at once; without this every card would
 * poll /api/presence/[userId] on its own. On Mongo the whole batch is a single
 * indexed `$in` query projecting only `lastSeenAt`.
 *
 * Returns only heartbeat timestamps and derived online flags — never email, IP,
 * device, user agent or location.
 */
export async function GET(request: NextRequest) {
  try {
    const ids = Array.from(
      new Set(
        (request.nextUrl.searchParams.get('ids') || '')
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ).slice(0, MAX_IDS);

    if (ids.length === 0) {
      return NextResponse.json({ presence: {} });
    }

    // Mongo: one projected `$in`. Otherwise fall back to the JSON storage path.
    let rowsById = await selectUserPresenceRows(ids);
    if (!rowsById) {
      const users = await getStoredUsers();
      const byId = new Map(users.map((user) => [user.id, user]));
      rowsById = new Map(ids.map((id) => [id, {
        lastSeenAt: byId.get(id)?.lastSeenAt ?? null,
        presenceEndedAt: byId.get(id)?.presenceEndedAt ?? null,
      }]));
    }

    const now = Date.now();
    const presence: Record<string, { lastSeenAt: string | null; online: boolean }> = {};
    for (const id of ids) {
      // Unknown ids resolve to "never seen" rather than being omitted, so the
      // client can render nothing and stop asking.
      const row = rowsById.get(id);
      const lastSeenAt = row?.lastSeenAt ?? null;
      const online = !isPresenceEnded(lastSeenAt, row?.presenceEndedAt ?? null)
        && isUserOnline(lastSeenAt, now);
      presence[id] = { lastSeenAt, online };
    }

    return NextResponse.json({ presence });
  } catch {
    return NextResponse.json({ presence: {} }, { status: 500 });
  }
}
