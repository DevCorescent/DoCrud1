import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers, saveStoredUsers } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const users = await getStoredUsers();
    const idx = users.findIndex(
      (u) => u.email.toLowerCase() === session.user!.email!.toLowerCase(),
    );
    if (idx === -1) return NextResponse.json({ ok: true });

    users[idx] = { ...users[idx], lastActivityAt: new Date().toISOString() };
    await saveStoredUsers(users);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
