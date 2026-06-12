/**
 * Server-Sent Events endpoint for real-time notifications.
 * Client connects and receives the full notification payload on open,
 * then gets "ping" messages when something changes.
 * Falls back gracefully — clients also poll every 60s as a safety net.
 *
 * Note: In serverless deployments (Vercel) each request runs in an isolated
 * context, so the in-process connection registry only helps in dev/single-
 * process. The SSE still delivers the initial payload immediately on connect
 * and keeps the tab live via the keepalive tick.
 */
export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { getAuthSession } from '@/lib/server/auth';
import { getStoredUserById, getStoredUserByEmail } from '@/lib/server/users';
import { getWorkspaceNotifications } from '@/lib/server/notifications';

// In-memory registry of active SSE connections (works in dev / single-process)
// Maps userId → Set of ReadableStreamDefaultController
const connections = new Map<string, Set<ReadableStreamDefaultController>>();

/** Push a "ping" to any open SSE connections for the given user (dev/single-process only). */
function notifyUser(userId: string) {
  const ctrls = connections.get(userId);
  if (!ctrls || ctrls.size === 0) return;
  const msg = `data: ping\n\n`;
  ctrls.forEach((ctrl) => {
    try { ctrl.enqueue(msg); } catch { /* connection closed */ }
  });
}

// Keep a reference on the module so other server code can import from a shared
// helper if needed — in dev this works; in serverless it is a no-op.
if (typeof globalThis !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__sseNotifyUser = notifyUser;
}

export async function GET(req: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.email) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sessionId = (session.user as { id?: string })?.id;
  let user = sessionId
    ? await getStoredUserById(sessionId)
    : null;
  if (!user) user = await getStoredUserByEmail(session.user!.email!);
  if (!user) {
    // Authenticated but no workspace record yet — return an empty keepalive stream
    const emptyStream = new ReadableStream({
      start(c) {
        c.enqueue(`data: ${JSON.stringify({ notifications: [], unreadCount: 0 })}\n\n`);
        const keepalive = setInterval(() => {
          try { c.enqueue(`: keepalive\n\n`); } catch { clearInterval(keepalive); }
        }, 25_000);
        req.signal.addEventListener('abort', () => { clearInterval(keepalive); try { c.close(); } catch { /**/ } });
      },
    });
    return new Response(emptyStream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' },
    });
  }

  const userId = user.id;
  let ctrl!: ReadableStreamDefaultController;

  const stream = new ReadableStream({
    start(c) {
      ctrl = c;

      // Register this connection
      if (!connections.has(userId)) connections.set(userId, new Set());
      connections.get(userId)!.add(ctrl);

      // Send the full notification payload immediately on connect
      getWorkspaceNotifications(user)
        .then((payload) => {
          try {
            ctrl.enqueue(`data: ${JSON.stringify(payload)}\n\n`);
          } catch { /* already closed */ }
        })
        .catch(() => {});

      // Keepalive comment every 25s (below typical 30s proxy timeouts)
      const keepalive = setInterval(() => {
        try {
          ctrl.enqueue(`: keepalive\n\n`);
        } catch {
          clearInterval(keepalive);
        }
      }, 25_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(keepalive);
        connections.get(userId)?.delete(ctrl);
        if (connections.get(userId)?.size === 0) connections.delete(userId);
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
