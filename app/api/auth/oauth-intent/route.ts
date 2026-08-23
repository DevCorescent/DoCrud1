import { NextRequest, NextResponse } from 'next/server';
import { coerceOAuthIntent, setOAuthIntentCookie } from '@/lib/server/oauth-intent';

export const dynamic = 'force-dynamic';

/**
 * Records which account type the user intends to create/log in with before we
 * hand off to Google. The "Continue with Google" button POSTs here first, then
 * calls signIn('google'); the NextAuth signIn callback reads the cookie back.
 *
 * The body only *proposes* the type — the server sanitizes it and, on the way
 * back, the signIn callback still refuses to convert any existing account. So
 * this endpoint cannot be used to escalate an existing account's type.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const intent = coerceOAuthIntent(body);
  setOAuthIntentCookie(intent);
  return NextResponse.json({ ok: true, accountType: intent.accountType });
}
