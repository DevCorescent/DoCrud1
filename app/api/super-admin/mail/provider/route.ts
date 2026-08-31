/**
 * Super Admin provider settings.
 *
 * GET    the provider overview — configuration, status, recent activity
 * PATCH  the few sender fields that are safe to change from a browser
 * POST   { action: 'check' } — a live connection check
 *
 * NO SECRET LEAVES THIS ROUTE. Not the SMTP password, not masked, not as a
 * length, not as a boolean pair that would let one be guessed. The response
 * says whether a credential is PRESENT and nothing more, because "is it
 * configured" is the only question this screen needs answered.
 *
 * It also creates no transport of its own: the check calls the same
 * `getProviderHealth` the Health tab uses, so there is one connection
 * implementation and one cache.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { getMailSettings, saveMailSettings, defaultMailSettings } from '@/lib/server/settings';
import {
  getProviderHealth, getCachedProviderHealth, getMailProvider,
} from '@/lib/server/mail-provider';
import { getEmailOutbox } from '@/lib/server/email-outbox';
import { outboxFailure } from '@/lib/email/outbox-view';
import { isValidEmail } from '@/lib/server/security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The ONLY fields this screen may change.
 *
 * An allow-list, not a deny-list: a `Partial<MailSettings>` spread would let a
 * crafted request rewrite the host or the credentials through a form that is
 * supposed to edit a display name.
 */
const EDITABLE = ['fromName', 'replyTo'] as const;
type EditableKey = typeof EDITABLE[number];

/** Is this value supplied by the environment rather than stored config? */
function envBacked(key: string): boolean {
  return Boolean(process.env[key]);
}

export async function GET(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const settings = await getMailSettings().catch(() => null);
  if (!settings) {
    return NextResponse.json({ error: 'Unable to load provider settings.' }, { status: 500 });
  }

  /* Cached only. Opening this screen must not cost a 5-second handshake; the
     admin asks for a live check explicitly. */
  const health = getCachedProviderHealth();

  /* Recent provider activity, read from the outbox rather than re-derived. */
  const recent = await getEmailOutbox(200).catch(() => []);
  const lastAccepted = recent.find((e) => e.status === 'sent');
  const lastFailedRow = recent.find((e) => e.status === 'failed' && Boolean(e.error));
  const lastFailure = lastFailedRow ? outboxFailure(lastFailedRow) : null;

  const configured = Boolean(settings.host && settings.fromEmail)
    && (!settings.requireAuth || Boolean(settings.username && settings.password));

  return NextResponse.json({
    provider: {
      /* The seam's own name, so a second provider would report itself. */
      type: getMailProvider().name,
      host: settings.host,
      port: settings.port,
      encryption: settings.secure ? 'SSL/TLS' : 'STARTTLS or none',
      requiresAuth: settings.requireAuth,
      /* Presence only. Never the value, never a mask, never a length. */
      credentialPresent: Boolean(settings.password),
      usernamePresent: Boolean(settings.username),
      configured,
    },
    sender: {
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
      replyTo: settings.replyTo || '',
    },
    /* Which fields this screen may change, so the UI does not have to guess
       and cannot offer a control the server would reject. */
    editable: EDITABLE,
    /* Where each read-only value comes from, so the UI can explain rather than
       pretend the browser could change it. */
    configuredExternally: {
      host: envBacked('SMTP_HOST'),
      port: envBacked('SMTP_PORT'),
      encryption: envBacked('SMTP_SECURE'),
      username: envBacked('SMTP_USERNAME'),
      credential: envBacked('SMTP_PASSWORD'),
    },
    health: health
      ? {
          status: health.status,
          checkedAt: health.checkedAt ?? null,
          failureKind: health.failure?.kind ?? null,
          providerCode: health.failure?.code ?? null,
          retryable: health.failure?.retryable ?? null,
          advice: health.failure?.advice ?? null,
          message: health.failure?.message ?? null,
        }
      : null,
    activity: {
      /* "Accepted", never "delivered": acceptance is the strongest evidence
         this application holds. */
      lastAcceptedAt: lastAccepted?.sentAt ?? lastAccepted?.createdAt ?? null,
      lastFailedAt: lastFailedRow?.failedAt ?? lastFailedRow?.createdAt ?? null,
      lastFailureKind: lastFailure?.kind ?? null,
      lastFailureCode: lastFailure?.code ?? null,
      lastFailureRetryable: lastFailure?.retryable ?? null,
      lastFailureAdvice: lastFailure?.advice ?? null,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const actor = session.email || 'super-admin';

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }

  /* Anything outside the allow-list is REFUSED, not ignored: silently dropping
     a `password` field would tell the caller their change succeeded. */
  const unknown = Object.keys(body).filter(
    (k) => !(EDITABLE as readonly string[]).includes(k));
  if (unknown.length) {
    return NextResponse.json({
      error: 'These settings cannot be changed here.', fields: unknown,
    }, { status: 400 });
  }

  const current = await getMailSettings();
  const changes: Partial<Record<EditableKey, string>> = {};

  if (typeof body.fromName === 'string') {
    const value = body.fromName.trim().slice(0, 120);
    if (!value) {
      return NextResponse.json({ error: 'A sender name is required.' }, { status: 400 });
    }
    changes.fromName = value;
  }
  if (typeof body.replyTo === 'string') {
    const value = body.replyTo.trim();
    /* Empty clears it; anything else must be a real address, or replies would
       vanish silently. */
    if (value && !isValidEmail(value)) {
      return NextResponse.json({ error: 'Enter a valid reply-to address.' }, { status: 400 });
    }
    changes.replyTo = value;
  }

  if (Object.keys(changes).length === 0) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  /* Spread over the CURRENT settings, so a partial failure or a missing field
     cannot blank the host or the credentials. */
  const next = { ...defaultMailSettings, ...current, ...changes };
  await saveMailSettings(next);

  await appendSuperAdminAudit({
    action: 'mail.provider.settings_updated',
    targetType: 'mail_provider',
    targetId: 'smtp',
    /* Old and new values for the NON-SECRET fields only. */
    details: Object.fromEntries(
      (Object.keys(changes) as EditableKey[]).map((k) => [
        k, `${current[k] || '(empty)'} -> ${changes[k] || '(empty)'}`,
      ]),
    ),
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    sender: { fromName: next.fromName, fromEmail: next.fromEmail, replyTo: next.replyTo || '' },
    changed: Object.keys(changes),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if ((body as { action?: string }).action !== 'check') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  /* The SAME implementation the Health tab uses. No second transport, no
     second cache, no second set of failure vocabulary. */
  const health = await getProviderHealth(true);

  await appendSuperAdminAudit({
    action: 'mail.provider.checked',
    targetType: 'mail_provider',
    targetId: 'smtp',
    details: { status: health.status, code: String(health.failure?.code ?? '') },
  }).catch(() => {});

  return NextResponse.json({
    /* A connection check is not a send: there is no "delivered" outcome here,
       and a healthy result means the provider would accept mail, not that any
       message reached an inbox. */
    status: health.status,
    checkedAt: health.checkedAt ?? new Date().toISOString(),
    failureKind: health.failure?.kind ?? null,
    providerCode: health.failure?.code ?? null,
    retryable: health.failure?.retryable ?? null,
    advice: health.failure?.advice ?? null,
    message: health.failure?.message ?? null,
  });
}
