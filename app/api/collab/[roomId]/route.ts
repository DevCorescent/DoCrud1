export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import crypto from 'crypto';
import { getAuthSession, resolveSessionUserId } from '@/lib/server/auth';

/*
 * AUTHZ-02 fix — collaboration whiteboard access control.
 *
 * Before: no authentication at all; the caller's identity was whatever the
 * client sent (`?userId=` on GET, `body.userId` on POST). Anyone who knew a
 * room's share code could read the live board, join as ANY spoofed user, inject
 * or clear strokes, and undo another user's work.
 *
 * Now: every request must carry a valid DoCrud session (getAuthSession →
 * resolveSessionUserId). The authenticated session id is the ONLY identity used
 * for presence, membership, element ownership and undo — the client-supplied
 * userId is ignored for all authorization decisions. Mutating events require the
 * caller to have an established, authenticated presence in THAT room (they must
 * have opened/joined it), otherwise 403.
 *
 * Note on the model: rooms are ephemeral, in-memory, and capability-based (the
 * share link IS the room code). This change removes anonymous access and
 * identity spoofing; it does not add a persistent invite-only membership model
 * (the app has none) — see the report's follow-up note.
 */

type DrawElement = Record<string, unknown>;
type RoomUser = { userId: string; name: string; color: string };
type StreamEntry = { ctrl: ReadableStreamDefaultController; userId: string };
type RoomState = {
  elements: DrawElement[];
  users: Map<string, RoomUser>;      // presence, keyed by session userId
  streams: Map<string, StreamEntry>; // keyed by per-connection id; carries session userId
  members: Set<string>;              // session userIds that have opened/joined this room
};

const rooms = new Map<string, RoomState>();

function getRoom(roomId: string): RoomState {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { elements: [], users: new Map(), streams: new Map(), members: new Set() });
  }
  return rooms.get(roomId)!;
}

function broadcastToRoom(room: RoomState, event: string, payload: unknown, excludeUserId?: string) {
  const msg = `data: ${JSON.stringify({ event, payload })}\n\n`;
  room.streams.forEach((entry) => {
    if (entry.userId === excludeUserId) return;
    try { entry.ctrl.enqueue(msg); } catch { /* stream closed */ }
  });
}

/** Send a message to every live connection a given session user has in the room. */
function sendToUser(room: RoomState, userId: string, raw: string) {
  room.streams.forEach((entry) => {
    if (entry.userId !== userId) return;
    try { entry.ctrl.enqueue(raw); } catch { /* closed */ }
  });
}

function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
function forbidden() {
  return Response.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;

  // Require a valid session. The `?userId=` query param is ignored for identity.
  const userId = await resolveSessionUserId(await getAuthSession());
  if (!userId) return unauthorized();

  const room = getRoom(roomId);
  room.members.add(userId); // opening the stream establishes authenticated membership
  const connId = crypto.randomUUID();

  let ctrl!: ReadableStreamDefaultController;
  const stream = new ReadableStream({
    start(c) {
      ctrl = c;
      room.streams.set(connId, { ctrl, userId });

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
        room.streams.delete(connId);
        // Drop presence only when the user has no other live connections here.
        const stillConnected = Array.from(room.streams.values()).some((e) => e.userId === userId);
        if (!stillConnected) room.users.delete(userId);
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

  // Require a valid session. `body.userId` is accepted on the wire for backward
  // compatibility but is IGNORED — authorization always uses the session id.
  const userId = await resolveSessionUserId(await getAuthSession());
  if (!userId) return unauthorized();

  const body = await req.json() as { userId?: string; event: string; payload?: unknown; name?: string; color?: string };
  const room = getRoom(roomId);

  if (body.event === 'join') {
    room.members.add(userId);
    room.users.set(userId, { userId, name: body.name || 'User', color: body.color || '#6366f1' });
    broadcastToRoom(room, 'presence', { users: Array.from(room.users.values()) });
    if (room.elements.length > 0) {
      sendToUser(room, userId, `data: ${JSON.stringify({ event: 'board_sync', payload: { elements: room.elements, from: 'server', seq: Date.now() } })}\n\n`);
    }
    return Response.json({ ok: true });
  }

  // Every other event requires an established authenticated presence in THIS room.
  if (!room.members.has(userId)) return forbidden();

  if (body.event === 'leave') {
    room.users.delete(userId);
    room.members.delete(userId);
    broadcastToRoom(room, 'presence', { users: Array.from(room.users.values()) });
    return Response.json({ ok: true });
  }

  if (body.event === 'stroke_add') {
    const el = (body.payload as { element?: DrawElement })?.element;
    if (el) {
      // Stamp server-authoritative ownership so a client cannot forge ownerId
      // (and so undo can be scoped to the real author).
      el['ownerId'] = userId;
      room.elements.push(el);
    }
  } else if (body.event === 'board_clear') {
    room.elements = [];
  } else if (body.event === 'stroke_undo') {
    // Undo only the CALLER'S own most-recent element (session identity), never an
    // arbitrary userId supplied in the payload.
    const idx = [...room.elements].reverse().findIndex((el) => el['ownerId'] === userId);
    if (idx !== -1) room.elements.splice(room.elements.length - 1 - idx, 1);
  }

  broadcastToRoom(room, body.event, body.payload, userId);
  return Response.json({ ok: true });
}
