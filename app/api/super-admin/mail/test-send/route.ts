/**
 * POST /api/super-admin/mail/test-send - the one test send.
 *
 * Compose, Drafts, Templates, Campaigns and System Emails all arrive here.
 * Before this route existed, Compose's "Send test" button posted to the SMTP
 * diagnostic endpoint, which ignored the editor entirely and mailed a fixed
 * connection-test message - so an admin could write an email, send a test,
 * receive something else, and conclude their email was fine.
 *
 * Three rules define it:
 *
 * 1. IT SENDS WHAT IS IN THE EDITOR. The subject and body come from the
 *    request, not from a draft, a published version, a template or a database
 *    row. Testing saved content while the admin looks at unsaved content
 *    proves nothing about what they are about to send.
 *
 * 2. THE SERVER RE-RENDERS. The browser's previewed HTML is never trusted or
 *    forwarded; it is re-run through the canonical pipeline here. The client
 *    supplies authored content, and nothing else decides what is sent.
 *
 * 3. NO AUDIENCE IS REACHABLE. One explicit address, validated. This route
 *    does not import the recipient engine, cannot resolve "Everyone", and has
 *    no path to a campaign's recipient list.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSuperAdminSessionFromRequest, appendSuperAdminAudit } from '@/lib/server/super-admin-auth';
import { renderEmail } from '@/lib/email/render-email';
import { getEmailRenderContext, isEmailSource } from '@/lib/server/email-render-context';
import { sendTrackedMail } from '@/lib/server/mailer';
import { classifyMailError } from '@/lib/server/mail-provider';
import { isValidEmail } from '@/lib/server/security';
import { getPublicAppBaseUrl } from '@/lib/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_HTML = 2_000_000;

/* -- Idempotency (section 11) ---------------------------------------------
   The client already guards a double-click with a synchronous ref, but that
   only protects one browser tab. This collapses an identical repeat - same
   actor, recipient, subject and body - inside a short window, so a double
   submission cannot produce two messages.

   Deliberately in-memory and short-lived: it exists to absorb a double-click,
   not to be a durable ledger. A second serverless instance would not share it,
   which is why it is the SECOND line of defence and not the only one. */
const RECENT_TESTS = new Map<string, number>();
const IDEMPOTENCY_WINDOW_MS = 15_000;

function idempotencyKey(parts: string[]): string {
  return createHash('sha256').update(parts.join(' ')).digest('hex');
}

/** Release a key so a FAILED attempt can be retried immediately. */
function releaseIdempotencyKey(key: string): void { RECENT_TESTS.delete(key); }

function alreadySentRecently(key: string): boolean {
  const now = Date.now();
  /* forEach rather than for..of: the project's compile target does not allow
     iterating a Map directly. */
  RECENT_TESTS.forEach((at, k) => {
    if (now - at > IDEMPOTENCY_WINDOW_MS) RECENT_TESTS.delete(k);
  });
  const seen = RECENT_TESTS.get(key);
  if (seen !== undefined && now - seen <= IDEMPOTENCY_WINDOW_MS) return true;
  RECENT_TESTS.set(key, now);
  return false;
}

/* Deliberately NOT exported: a Next route module may only export handlers and
   route config, and entries expire on their own inside the window above. */

export async function POST(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const actor = session.email || 'super-admin';

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }

  const recipient = String(body.recipient ?? '').trim();
  if (!isValidEmail(recipient)) {
    return NextResponse.json({ error: 'Enter a valid test recipient address.' }, { status: 400 });
  }

  const source = body.source ?? 'compose';
  if (!isEmailSource(source)) {
    return NextResponse.json({ error: 'Unknown email source.' }, { status: 400 });
  }
  const context = getEmailRenderContext(source, body.type as string | undefined);
  if (!context) return NextResponse.json({ error: 'Unknown system email.' }, { status: 404 });

  const rawSubject = String(body.subject ?? '').trim();
  if (!rawSubject) return NextResponse.json({ error: 'A subject is required.' }, { status: 400 });

  const rawHtml = String(body.html ?? '');
  if (!rawHtml.trim()) return NextResponse.json({ error: 'The email body is empty.' }, { status: 400 });
  if (rawHtml.length > MAX_HTML) {
    return NextResponse.json({ error: 'The email body is too large to send.' }, { status: 413 });
  }

  /* Re-rendered here from the AUTHORED content. Whatever the browser thought
     the final HTML was is irrelevant. */
  const rendered = renderEmail({
    subject: rawSubject,
    html: rawHtml,
    supported: context.supported,
    /* Sample data only. Nothing on this path can mint a real OTP or token. */
    values: context.sampleValues,
    preheader: body.preheader ? String(body.preheader) : undefined,
  });

  /* An unresolvable placeholder must not be mailed, even to a tester - the
     point of a test is to see what a recipient sees. */
  if (rendered.unsupported.length) {
    return NextResponse.json({
      error: 'This email uses variables it does not support. Remove them before sending a test.',
      unsupported: rendered.unsupported,
    }, { status: 400 });
  }

  if (!rendered.bodyHtml.trim()) {
    return NextResponse.json(
      { error: 'Nothing is left to send after sanitizing the body.' }, { status: 400 });
  }

  const key = idempotencyKey([actor, recipient, source, String(body.type ?? ''), rawSubject, rawHtml]);
  if (alreadySentRecently(key)) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      message: 'An identical test was just submitted, so this one was not sent again.',
    });
  }

  /* Marked in the message itself, so a tester can never mistake it for the
     real thing landing in a real inbox. */
  const subject = `[TEST] ${rendered.subject}`;
  const html =
    '<p style="background:#fef3c7;color:#78350f;padding:8px;border-radius:6px;font-size:13px;">'
    + 'Test email - any names, codes or dates below are sample data, not real values.</p>'
    + rendered.bodyHtml;

  try {
    /* The existing tracked sender: same provider, same outbox, same chrome,
       same tracking as a production send. No second transport exists. */
    const result = await sendTrackedMail({
      /* `smtp_test` rather than the production policy: disabling marketing mail
         should not disable an admin's ability to test, and vice versa. */
      policyKey: 'smtp_test',
      typeLabel: 'test',
      to: recipient,
      subject,
      text: rendered.text,
      html,
      preheader: body.preheader ? String(body.preheader) : undefined,
      origin: getPublicAppBaseUrl(),
      sentBy: actor,
      /* The outbox marker: these rows are identifiable as tests. */
      metadata: {
        test: 'true',
        source: String(source),
        ...(body.type ? { systemEmail: String(body.type) } : {}),
      },
    });

    await appendSuperAdminAudit({
      action: 'mail.test_send',
      targetType: 'email_test',
      targetId: String(body.type ?? source),
      /* Recipient and source only - never the rendered content or its values. */
      details: { source: String(source), recipient },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      skipped: result.skipped === true,
      outboxId: result.outboxId,
      /* "Accepted", never "delivered". The provider took the message; whether
         it reached an inbox is not something this application can observe. */
      message: result.skipped
        ? 'Blocked by the mail policy for test sends. Nothing was sent.'
        : 'The provider accepted the test message.',
    });
  } catch (err) {
    /* The send failed, so the admin must be able to try the SAME content again
       at once - after restarting the provider, say. Holding the key here would
       answer that retry with "an identical test was just submitted", which is
       both wrong and maddening. The guard exists to stop a double-click
       duplicating a message that WAS sent, not to rate-limit failures. */
    releaseIdempotencyKey(key);
    const failure = classifyMailError(err);
    return NextResponse.json({
      ok: false,
      error: 'The provider rejected the test message.',
      detail: failure.message,
      failureKind: failure.kind,
      providerCode: failure.code,
      retryable: failure.retryable,
      advice: failure.advice,
    }, { status: 502 });
  }
}
