import { NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getUpraisedCount, hasUserUpraised, toggleUpraise } from '@/lib/server/upraised';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { userId: string } },
) {
  try {
    const count = await getUpraisedCount(params.userId);
    const session = await getAuthSession();
    let hasUpraised = false;
    if (session?.user?.email) {
      const users = await getStoredUsers();
      const actor = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
      if (actor) hasUpraised = await hasUserUpraised(params.userId, actor.id);
    }
    return NextResponse.json({ count, hasUpraised });
  } catch (err) {
    console.error('[upraise/GET]', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(
  _req: Request,
  { params }: { params: { userId: string } },
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const users = await getStoredUsers();
    const actor = users.find((u) => u.email.toLowerCase() === session.user!.email!.toLowerCase());
    if (!actor) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (actor.id === params.userId) {
      return NextResponse.json({ error: 'Cannot upraise yourself' }, { status: 400 });
    }
    const result = await toggleUpraise(params.userId, actor.id);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[upraise/POST]', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
