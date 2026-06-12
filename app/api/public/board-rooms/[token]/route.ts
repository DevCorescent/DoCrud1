import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession, getStoredUsers } from '@/lib/server/auth';
import { getPublicBoardRoomByToken, requestBoardRoomAccess } from '@/lib/server/deal-rooms';

export const dynamic = 'force-dynamic';

export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  try {
    const room = await getPublicBoardRoomByToken(params.token);
    if (!room) {
      return NextResponse.json({ error: 'Board room not found.' }, { status: 404 });
    }

    const session = await getAuthSession();
    let actor = null;
    if (session?.user?.email) {
      const users = await getStoredUsers();
      actor = users.find((user) => user.email.toLowerCase() === session.user.email?.toLowerCase()) || null;
    }

    const participant = actor ? room.participants.find((entry) => entry.userId === actor?.id) : null;
    const pendingRequest = actor ? room.accessRequests.find((entry) => entry.userId === actor?.id && entry.status === 'pending') : null;

    return NextResponse.json({
      room: {
        id: room.id,
        title: room.title,
        summary: room.summary,
        counterpartyName: room.counterpartyName,
        stage: room.stage,
        targetCloseDate: room.targetCloseDate,
        organizationName: room.organizationName,
      },
      auth: {
        loggedIn: Boolean(actor),
        participant: participant ? { accessLevel: participant.accessLevel, source: participant.source } : null,
        pendingRequest: pendingRequest ? { requestedAccessLevel: pendingRequest.requestedAccessLevel, requestedAt: pendingRequest.requestedAt } : null,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load board room.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Login is required before joining a board room.' }, { status: 401 });
    }

    const users = await getStoredUsers();
    const actor = users.find((user) => user.email.toLowerCase() === session.user.email?.toLowerCase());
    if (!actor) {
      return NextResponse.json({ error: 'Workspace user not found.' }, { status: 404 });
    }

    const payload = await request.json() as {
      joinPassword?: string;
      requestedAccessLevel?: 'viewer' | 'editor' | 'approver';
      note?: string;
    };

    const result = await requestBoardRoomAccess(params.token, actor, {
      joinPassword: payload.joinPassword || '',
      requestedAccessLevel: payload.requestedAccessLevel === 'viewer' || payload.requestedAccessLevel === 'approver' ? payload.requestedAccessLevel : 'editor',
      note: payload.note,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to request board room access.' }, { status: 400 });
  }
}
