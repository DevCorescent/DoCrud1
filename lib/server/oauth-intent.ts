/**
 * The account-type intent carried across a Google OAuth round-trip.
 *
 * OAuth leaves the page, so client React state cannot survive the trip. The
 * intended account type (and the referral/plan/config that came with the signup
 * link) is stashed in a short-lived, httpOnly, SameSite=Lax cookie set by our
 * own server the moment "Continue with Google" is pressed, and read back
 * server-side in the NextAuth signIn callback.
 *
 * SECURITY: this cookie is the *intent for a NEW account only*. It is never
 * trusted to change an existing account's type — the signIn callback keeps a
 * stored account's type untouched and lets a mismatch be rejected. So even a
 * tampered cookie can only pick which type a brand-new account is created as,
 * which is a choice the user is entitled to make anyway. accountType is still
 * established server-side; it is never read from a request body.
 */

import { cookies } from 'next/headers';

export const OAUTH_INTENT_COOKIE = 'docrud_oauth_intent';
const TTL_SECONDS = 60 * 10; // 10 minutes — long enough for the OAuth hop, short enough to not linger.

export type OAuthAccountType = 'individual' | 'business';

export type OAuthIntent = {
  accountType: OAuthAccountType;
  ref?: string;
  plan?: string;
  config?: string;
};

/** Anything not exactly 'business' is an individual. */
export function normalizeOAuthAccountType(value: unknown): OAuthAccountType {
  return value === 'business' ? 'business' : 'individual';
}

function sanitizeParam(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  // Keep it short and free of control characters; these ride into a cookie.
  if (!trimmed || trimmed.length > 128) return undefined;
  return /^[\w.\-:=+/]+$/.test(trimmed) ? trimmed : undefined;
}

export function coerceOAuthIntent(input: {
  accountType?: unknown;
  ref?: unknown;
  plan?: unknown;
  config?: unknown;
}): OAuthIntent {
  return {
    accountType: normalizeOAuthAccountType(input.accountType),
    ref: sanitizeParam(input.ref),
    plan: sanitizeParam(input.plan),
    config: sanitizeParam(input.config),
  };
}

/** Set the intent cookie. Route-handler context only (it writes a cookie). */
export function setOAuthIntentCookie(intent: OAuthIntent): void {
  cookies().set(OAUTH_INTENT_COOKIE, JSON.stringify(intent), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_SECONDS,
  });
}

/** Read + validate the intent cookie. Returns null when absent, malformed, or
    unreadable in this context — callers then safely default to individual. */
export function readOAuthIntent(): OAuthIntent | null {
  try {
    const raw = cookies().get(OAUTH_INTENT_COOKIE)?.value;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return coerceOAuthIntent(parsed);
  } catch {
    return null;
  }
}

/** Best-effort clear. Safe to call from a route handler. */
export function clearOAuthIntentCookie(): void {
  try {
    cookies().set(OAUTH_INTENT_COOKIE, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });
  } catch {
    /* cookie writes are only allowed in some contexts; expiry TTL covers the rest */
  }
}
