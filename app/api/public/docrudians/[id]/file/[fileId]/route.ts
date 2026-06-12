import { NextResponse } from 'next/server';
import { getPublicDocrudiansRoomFile, trackDocrudiansRoomEvent } from '@/lib/server/docrudians';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  try {
    const { id, fileId } = await params;
    const payload = await getPublicDocrudiansRoomFile(id, fileId);
    if (!payload) {
      return NextResponse.json({ error: 'Shared file not found.' }, { status: 404 });
    }
    await trackDocrudiansRoomEvent({
      roomId: payload.room.id,
      type: 'file_open',
      resourceId: payload.attachment.id,
      resourceName: payload.attachment.name,
      note: 'Opened from dedicated file page',
    });
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load shared file.' }, { status: 500 });
  }
}
