import { NextRequest, NextResponse } from 'next/server';
import { getPublicDocrudiansRoom, trackDocrudiansRoomEvent } from '@/lib/server/docrudians';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await getPublicDocrudiansRoom(id);
    if (!payload) {
      return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
    }
    return NextResponse.json(payload);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to load room.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const payload = await request.json().catch(() => null);
    const action = String(payload?.action || 'view');
    const eventType =
      action === 'join' || action === 'file_open' || action === 'download' || action === 'share'
        ? action
        : 'view';
    const event = await trackDocrudiansRoomEvent({
      roomId: id,
      type: eventType,
      actorName: payload?.actorName ? String(payload.actorName) : undefined,
      actorUserId: payload?.actorUserId ? String(payload.actorUserId) : undefined,
      resourceId: payload?.resourceId ? String(payload.resourceId) : undefined,
      resourceName: payload?.resourceName ? String(payload.resourceName) : undefined,
      note: payload?.note ? String(payload.note) : undefined,
    });
    return NextResponse.json(event);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to track room activity.' }, { status: 400 });
  }
}
