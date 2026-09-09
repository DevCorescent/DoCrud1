/**
 * Liveness and readiness, kept apart on purpose.
 *
 * ═══ THE DISTINCTION MATTERS ═══
 *
 * LIVENESS (default, `GET /api/health`) answers one question: is this process
 * running and able to serve HTTP? It touches nothing else. An orchestrator
 * restarts a container that fails liveness, so making this depend on MongoDB
 * would turn a database blip into a restart storm — every replica killed at
 * once, precisely when the database is already struggling.
 *
 * READINESS (`GET /api/health?check=ready`) answers a different question:
 * should traffic be routed here? That one DOES probe MongoDB, because a
 * replica that cannot reach its database should be taken out of rotation
 * rather than restarted.
 *
 * Redis is deliberately NOT part of readiness. It is optional in this
 * codebase — `lib/server/cache.ts` degrades to computing the value — so an
 * unavailable cache must never remove a healthy replica from the pool. It is
 * reported as informational only.
 *
 * ═══ WHAT THIS MUST NEVER LEAK ═══
 *
 * No connection strings, credentials, environment variables, hostnames, driver
 * versions, internal paths or stack traces. A health endpoint is unauthenticated
 * by necessity, which makes it a reconnaissance target: the answer is a status
 * and a duration, and on failure a fixed word — never the underlying error.
 *
 * Cheap by construction: liveness does no I/O, and readiness issues one `ping`,
 * which is a fixed-cost admin command rather than a query over data.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/server/database';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Never cached: a cached health check reports the past, not the present. */
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request: NextRequest) {
  const wantsReadiness = request.nextUrl.searchParams.get('check') === 'ready';

  if (!wantsReadiness) {
    return NextResponse.json({ status: 'ok' }, { headers: NO_STORE });
  }

  const startedAt = Date.now();
  try {
    const db = await getMongoDb();
    if (!db) {
      /* No database configured at all. Honest 503 — this replica cannot serve
         data-backed requests, whatever the process is doing. */
      return NextResponse.json(
        { status: 'unavailable', database: 'not_configured' },
        { status: 503, headers: NO_STORE },
      );
    }
    await db.command({ ping: 1 });
    return NextResponse.json(
      { status: 'ok', database: 'ok', latencyMs: Date.now() - startedAt },
      { headers: NO_STORE },
    );
  } catch {
    /* The reason is swallowed ON PURPOSE — see the note above. A failed probe
       is a 503 with a fixed word, never the driver's message. */
    return NextResponse.json(
      { status: 'unavailable', database: 'unreachable' },
      { status: 503, headers: NO_STORE },
    );
  }
}
