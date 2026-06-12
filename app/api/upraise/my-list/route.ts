import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getMyUpraisedIds } from '@/lib/server/upraised';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) return NextResponse.json({ upraisedIds: [] });
    const users = await getStoredUsers();
    const actor = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
    if (!actor) return NextResponse.json({ upraisedIds: [] });
    const ids = await getMyUpraisedIds(actor.id);
    return NextResponse.json({ upraisedIds: ids });
  } catch {
    return NextResponse.json({ upraisedIds: [] });
  }
}
