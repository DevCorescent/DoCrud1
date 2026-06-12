import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getWorkspaceNotifications, markWorkspaceNotificationsRead } from '@/lib/server/notifications';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    const sessionEmail = session?.user?.email;
    if (!sessionEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const storedUser = users.find((entry) => entry.email.toLowerCase() === sessionEmail.toLowerCase());
    if (!storedUser) {
      return NextResponse.json({ notifications: [], unreadCount: 0 });
    }

    const payload = await getWorkspaceNotifications(storedUser);
    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load notifications.' }, { status: 500 });
  }
}

async function resolveUser(email: string) {
  const users = await getStoredUsers();
  return users.find((entry) => entry.email.toLowerCase() === email.toLowerCase()) ?? null;
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

    const { notifications } = await getWorkspaceNotifications(storedUser);
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length > 0) await markWorkspaceNotificationsRead(storedUser.id, unreadIds);
    return NextResponse.json(await getWorkspaceNotifications(storedUser));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to mark all read.' }, { status: 500 });
  }
}
