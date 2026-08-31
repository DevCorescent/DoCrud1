/**
 * POST /api/mail/unsubscribe — act on an unsubscribe token.
 *
 * POST, not GET, and that is the point: mail scanners, link checkers and
 * browser prefetchers follow every URL in a message. If unsubscribing happened
 * on GET, a security appliance scanning the email would silently opt the
 * recipient out before they ever read it. The link opens a page; the page asks;
 * this endpoint acts.
 *
 * Idempotent: submitting twice leaves exactly one suppression record and says
 * the same thing both times.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  readUnsubscribeToken, addSuppression, getSuppression,
} from '@/lib/server/mail-suppression';
import { appendSuperAdminAudit } from '@/lib/server/super-admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONFIRMATION = 'You have been unsubscribed from marketing emails.';

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }

  const email = readUnsubscribeToken(String(body.token ?? ''));
  /* One answer for every kind of bad token, so nothing can be learned by
     probing: not whether the address exists, not why it failed. */
  if (!email) {
    return NextResponse.json({ error: 'This unsubscribe link is not valid.' }, { status: 400 });
  }

  const before = await getSuppression(email);
  await addSuppression({
    email, reason: 'unsubscribe', actor: 'recipient', source: 'unsubscribe_link',
  });

  /* Only the first time: a repeated click is not a new event worth recording,
     and logging it would turn a double-click into two audit entries. */
  if (!before?.active || before.reason !== 'unsubscribe') {
    await appendSuperAdminAudit({
      action: 'mail.suppression.unsubscribed',
      targetType: 'mail_suppression',
      targetId: email,
      details: { source: 'unsubscribe_link' },
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    message: CONFIRMATION,
    /* Stated so the recipient is not left wondering whether they have just
       locked themselves out of their own account. */
    note: 'Security and account emails, such as verification codes, are not affected.',
  });
}
