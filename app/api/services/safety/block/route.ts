import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserById } from '@/lib/server/users';
import { sanitizeHtml } from '@/lib/server/security';
import { blockUser, listBlockedUsers, unblockUser } from '@/lib/server/service-safety';

export const dynamic = 'force-dynamic';

async function getActor() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;
  return getStoredUserById(session.user.id);
}

/** §25 Block user — the blocker is always the session user. */
export async function GET() {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const blocks = await listBlockedUsers(actor.id);
    return NextResponse.json({ blocks });
  } catch (error) {
    console.error('[services/safety/block] GET error', error);
    return NextResponse.json({ error: 'Failed to load blocked users.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Please sign in to block someone.' }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { userId?: string; reason?: string } | null;
    const targetId = String(body?.userId ?? '').trim();
    if (!targetId) return NextResponse.json({ error: 'userId is required.' }, { status: 400 });
    if (targetId === actor.id) return NextResponse.json({ error: 'You cannot block yourself.' }, { status: 400 });

    const target = await getStoredUserById(targetId);
    if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

    const reason = typeof body?.reason === 'string' ? sanitizeHtml(body.reason).trim() : undefined;
    const block = await blockUser(actor.id, target.id, reason);

    return NextResponse.json({ block: { id: block.id, blockedId: block.blockedId, createdAt: block.createdAt } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to block this user.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const actor = await getActor();
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const targetId = (searchParams.get('userId') ?? '').trim();
    if (!targetId) return NextResponse.json({ error: 'userId is required.' }, { status: 400 });

    const removed = await unblockUser(actor.id, targetId);
    return NextResponse.json({ unblocked: removed });
  } catch (error) {
    console.error('[services/safety/block] DELETE error', error);
    return NextResponse.json({ error: 'Failed to unblock this user.' }, { status: 500 });
  }
}
