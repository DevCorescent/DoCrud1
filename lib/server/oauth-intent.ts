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

/**
 * The onboarding answers, carried across the Google redirect.
 *
 * Small, non-sensitive strings only — a name and some ids. No password, no
 * token, no file. The cookie is httpOnly so the browser cannot read it back,
 * and it is cleared as soon as the answers are written to the profile.
 */
export type OAuthOnboarding = {
  name?: string;
  roles?: string[];
  customRoles?: string[];
  skills?: string[];
  /** Business branch: an IndustryKey, and the skills the business hires for. */
  businessSpace?: string;
  businessSkills?: string[];
};

export type OAuthIntent = {
  accountType: OAuthAccountType;
  ref?: string;
  plan?: string;
  config?: string;
  onboarding?: OAuthOnboarding;
};

/** Caps, so a crafted request cannot push an oversized cookie. */
const MAX_LIST = 20;
const MAX_ENTRY = 80;

function coerceList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((v) => String(v ?? '').trim().slice(0, MAX_ENTRY))
    .filter(Boolean)
    .slice(0, MAX_LIST);
  return out.length ? out : undefined;
}

export function coerceOnboarding(value: unknown): OAuthOnboarding | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const name = String(v.name ?? '').trim().slice(0, MAX_ENTRY) || undefined;
  const out: OAuthOnboarding = {
    name,
    roles: coerceList(v.roles),
    customRoles: coerceList(v.customRoles),
    skills: coerceList(v.skills),
    businessSpace: String(v.businessSpace ?? '').trim().slice(0, MAX_ENTRY) || undefined,
    businessSkills: coerceList(v.businessSkills),
  };
  return Object.values(out).some(Boolean) ? out : undefined;
}

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
  onboarding?: unknown;
}): OAuthIntent {
  return {
    accountType: normalizeOAuthAccountType(input.accountType),
    ref: sanitizeParam(input.ref),
    plan: sanitizeParam(input.plan),
    config: sanitizeParam(input.config),
    onboarding: coerceOnboarding(input.onboarding),
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
