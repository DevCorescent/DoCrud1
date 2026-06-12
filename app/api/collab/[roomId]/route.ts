export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';

type DrawElement = Record<string, unknown>;
type RoomUser = { userId: string; name: string; color: string };
type RoomState = {
  elements: DrawElement[];
  users: Map<string, RoomUser>;
  streams: Map<string, ReadableStreamDefaultController>;
};

const rooms = new Map<string, RoomState>();

function getRoom(roomId: string): RoomState {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { elements: [], users: new Map(), streams: new Map() });
  }
  return rooms.get(roomId)!;
}

function broadcastToRoom(room: RoomState, event: string, payload: unknown, excludeUserId?: string) {
  const msg = `data: ${JSON.stringify({ event, payload })}\n\n`;
  room.streams.forEach((ctrl, uid) => {
    if (uid === excludeUserId) return;
    try { ctrl.enqueue(msg); } catch { /* stream closed */ }
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') || crypto.randomUUID();
  const room = getRoom(roomId);

  let ctrl!: ReadableStreamDefaultController;
  const stream = new ReadableStream({
    start(c) {
      ctrl = c;
      room.streams.set(userId, ctrl);

      const snapshot = {
        elements: room.elements,
        users: Array.from(room.users.values()),
      };
      try {
        ctrl.enqueue(`data: ${JSON.stringify({ event: 'snapshot', payload: snapshot })}\n\n`);
      } catch { /* already closed */ }

      const keepalive = setInterval(() => {
        try { ctrl.enqueue(`: keepalive\n\n`); } catch { clearInterval(keepalive); }
      }, 25_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(keepalive);
        room.streams.delete(userId);
        room.users.delete(userId);
        if (room.streams.size === 0) {
          setTimeout(() => { if (rooms.get(roomId)?.streams.size === 0) rooms.delete(roomId); }, 60_000);
        } else {
          broadcastToRoom(room, 'presence', { users: Array.from(room.users.values()) });
        }
        try { ctrl.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const body = await req.json() as { userId: string; event: string; payload?: unknown; name?: string; color?: string };
  const room = getRoom(roomId);

  if (body.event === 'join') {
    room.users.set(body.userId, { userId: body.userId, name: body.name || 'User', color: body.color || '#6366f1' });
    broadcastToRoom(room, 'presence', { users: Array.from(room.users.values()) });
    const joinerCtrl = room.streams.get(body.userId);
    if (joinerCtrl && room.elements.length > 0) {
      try {
        joinerCtrl.enqueue(`data: ${JSON.stringify({ event: 'board_sync', payload: { elements: room.elements, from: 'server', seq: Date.now() } })}\n\n`);
      } catch { /* closed */ }
    }
    return Response.json({ ok: true });
  }

  if (body.event === 'leave') {
    room.users.delete(body.userId);
    broadcastToRoom(room, 'presence', { users: Array.from(room.users.values()) });
    return Response.json({ ok: true });
  }

  if (body.event === 'stroke_add') {
    const el = (body.payload as { element?: DrawElement })?.element;
    if (el) room.elements.push(el);
  } else if (body.event === 'board_clear') {
    room.elements = [];
  } else if (body.event === 'stroke_undo') {
    const undoUserId = (body.payload as { userId?: string })?.userId;
    if (undoUserId) {
      const idx = [...room.elements].reverse().findIndex((el) => el['ownerId'] === undoUserId);
      if (idx !== -1) room.elements.splice(room.elements.length - 1 - idx, 1);
    }
  }

  broadcastToRoom(room, body.event, body.payload, body.userId);
  return Response.json({ ok: true });
}
