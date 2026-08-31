/**
 * POST /api/mail/provider-events — bounce and complaint callbacks.
 *
 * Authenticated with a shared secret in a header, because the configured
 * provider is SMTP and sends no signed callbacks at all. Nothing reaches this
 * endpoint today without someone configuring a provider that does, and mapping
 * its payload onto `ProviderEvent`.
 *
 * Closed by default: with no secret configured the endpoint refuses everything.
 * An open version would let anyone permanently stop mail to any address.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  applyProviderEvent, parseProviderEvent, checkProviderEventAuth,
} from '@/lib/server/mail-provider-events';
import { appendSuperAdminAudit } from '@/lib/server/super-admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One batch may not be unbounded. */
const MAX_EVENTS = 100;

export async function POST(req: NextRequest) {
  const auth = checkProviderEventAuth(req.headers.get('x-provider-secret'));
  if (!auth.authorized) {
    /* The reason is safe to return: it says whether the deployment is
       configured, never anything about the secret itself. */
    return NextResponse.json({ error: 'Unauthorized', reason: auth.reason }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Malformed payload.' }, { status: 400 }); }

  const raw = Array.isArray(body) ? body
    : (body && typeof body === 'object' && Array.isArray((body as { events?: unknown[] }).events))
      ? (body as { events: unknown[] }).events
      : [body];

  if (raw.length === 0 || raw.length > MAX_EVENTS) {
    return NextResponse.json(
      { error: `Send between 1 and ${MAX_EVENTS} events.` }, { status: 400 });
  }

  const parsed = raw.map(parseProviderEvent);
  /* An unknown event type or a malformed address is rejected outright rather
     than skipped: acting on part of a batch a caller believed was valid is
     worse than making them fix it. */
  if (parsed.some((e) => e === null)) {
    return NextResponse.json(
      { error: 'Unknown event type or malformed event.' }, { status: 400 });
  }

  const results = [];
  for (const event of parsed) {
    const applied = await applyProviderEvent(event!);
    results.push(applied);

    /* A duplicate is not a new event, so it is not audited again. */
    if (!applied.duplicate && applied.suppressed) {
      await appendSuperAdminAudit({
        action: `mail.suppression.${applied.suppressionReason}`,
        targetType: 'mail_suppression',
        targetId: applied.email,
        /* The address and the classification. No provider payload, no secret. */
        details: {
          type: applied.type,
          permanence: applied.permanence ?? 'n/a',
          provider: event!.provider ?? 'unknown',
        },
      }).catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    suppressed: results.filter((r) => r.suppressed).length,
    duplicates: results.filter((r) => r.duplicate).length,
    results,
  });
}
