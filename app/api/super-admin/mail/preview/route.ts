/**
 * POST /api/super-admin/mail/preview — the sanitized body and its plain-text
 * version.
 *
 * The preview is built on the SERVER for one reason: what an admin approves
 * must be the same bytes a recipient receives. A client-side preview would be
 * a second rendering path, free to diverge from the sanitizer — and the first
 * time it diverged, someone would approve one email and send another.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSuperAdminSessionFromRequest } from '@/lib/server/super-admin-auth';
import { sanitizeEmailHtml } from '@/lib/security/email-html-sanitizer';
import { emailHtmlToText } from '@/lib/email/html-to-text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getSuperAdminSessionFromRequest(req);
  if (!session.valid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }

  const raw = String(body.html ?? '');
  /* A generous ceiling: enough for any real email, small enough that a huge
     paste cannot tie up the sanitizer. */
  if (raw.length > 2_000_000) {
    return NextResponse.json({ error: 'The email body is too large to preview.' }, { status: 413 });
  }

  const html = sanitizeEmailHtml(raw);
  return NextResponse.json({
    html,
    text: emailHtmlToText(html),
    /* Lets the UI tell the admin when sanitization removed something. */
    modified: html !== raw,
  });
}
