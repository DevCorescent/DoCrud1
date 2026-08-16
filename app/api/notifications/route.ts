import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserByEmail } from '@/lib/server/users';
import {
  getWorkspaceNotifications,
  markWorkspaceNotificationsRead,
  pruneNotificationReadState,
  NOTIFICATION_PAGE_LIMIT,
} from '@/lib/server/notifications';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    const sessionEmail = session?.user?.email;
    if (!sessionEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Indexed email lookup instead of scanning the whole users collection.
    const storedUser = await getStoredUserByEmail(sessionEmail);
    if (!storedUser) {
      return NextResponse.json({ notifications: [], unreadCount: 0 });
    }

    const payload = await getWorkspaceNotifications(storedUser);
    /* Opportunistic, best-effort cleanup using the live set we just built —
       no extra aggregation, and it never blocks the response. */
    void pruneNotificationReadState(storedUser.id, payload.notifications.map((n) => n.id)).catch(() => {});
    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load notifications.' }, { status: 500 });
  }
}

async function resolveUser(email: string) {
  return getStoredUserByEmail(email);
}

/** POST — mark specific notification ids as read */
export async function POST(request: NextRequest) {
  try {
    const session = await getAuthSession();
    const sessionEmail = session?.user?.email;
    if (!sessionEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const storedUser = await resolveUser(sessionEmail);
    if (!storedUser) return NextResponse.json({ notifications: [], unreadCount: 0 });

    const body = await request.json().catch(() => null);
    const ids = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    if (ids.length === 0) return NextResponse.json({ error: 'ids required.' }, { status: 400 });

    /* Mutate first, then aggregate exactly once for the response.
       Previously this endpoint aggregated on the way in as well. */
    await markWorkspaceNotificationsRead(storedUser.id, ids);
    return NextResponse.json(await getWorkspaceNotifications(storedUser));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to update notifications.' }, { status: 500 });
  }
}

/** PATCH — mark ALL unread notifications as read */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthSession();
    const sessionEmail = session?.user?.email;
    if (!sessionEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const storedUser = await resolveUser(sessionEmail);
    if (!storedUser) return NextResponse.json({ notifications: [], unreadCount: 0 });

    /* One aggregation, not two. The post-mark state is derived from the set we
       already have — marking every unread id read means every entry is read,
       so re-running the whole fan-out just to learn that is wasted work.
       Response shape is unchanged. */
    /* One aggregation, not two.

       Deliberately UNCAPPED here: "mark all read" must clear everything, not
       just the page the client happens to be showing, so this pass asks for the
       full set. The response is then truncated to the normal page size and its
       post-mark state derived locally — re-running the whole fan-out just to
       learn that every entry is now read would be wasted work.
       Response shape is unchanged. */
    const payload = await getWorkspaceNotifications(storedUser, Number.POSITIVE_INFINITY);
    const unreadIds = payload.notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length > 0) await markWorkspaceNotificationsRead(storedUser.id, unreadIds);

    const readAll = payload.notifications.map((n) => (n.read ? n : { ...n, read: true }));
    return NextResponse.json({
      notifications: readAll.slice(0, NOTIFICATION_PAGE_LIMIT),
      unreadCount: 0,
      total: readAll.length,
      hasMore: readAll.length > NOTIFICATION_PAGE_LIMIT,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to mark all read.' }, { status: 500 });
  }
}
