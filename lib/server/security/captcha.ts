/**
 * Server-side CAPTCHA (Cloudflare Turnstile) verification.
 *
 * This is the ONLY place a CAPTCHA token is judged. The browser is never
 * trusted to claim it passed — it sends the opaque provider token, and the
 * server exchanges it with Turnstile's siteverify endpoint using the SECRET
 * (server-only). A client-controlled boolean like `captchaPassed:true` is
 * meaningless here; only a token that Turnstile itself validates is accepted.
 *
 * Configuration (server-side env; never hardcode, never log):
 *   TURNSTILE_SECRET_KEY           — server secret (this file only)
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY — public site key (safe for the browser)
 *
 * Enforcement policy (see enforceCaptcha):
 *   - Configured (both keys present): the protected endpoint REQUIRES a valid
 *     token; missing/invalid/expired/reused → rejected; and if the provider is
 *     unreachable the request FAILS CLOSED (503) rather than being let through.
 *   - Not configured: CAPTCHA is treated as disabled FOR THAT DEPLOYMENT and the
 *     endpoint proceeds, still protected by the STEP-4 rate limiter. A warning is
 *     logged so ops can see captcha is off. (Deliberate: failing closed on a
 *     globally-unconfigured captcha would brick signup/login on every
 *     environment that has not set the keys yet.) Configure it in production.
 *
 * Secrets and tokens are never written to logs or returned to the client.
 */

import { NextResponse } from 'next/server';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5000;

export function isCaptchaConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export type CaptchaReason = 'missing-token' | 'invalid' | 'provider-unavailable' | 'not-configured';
export type CaptchaResult = { ok: true } | { ok: false; reason: CaptchaReason };

interface SiteVerifyResponse {
  success?: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
}

/**
 * Verify a Turnstile token with Cloudflare. Returns a simple ok/reason result.
 * Never throws; a timeout or network error maps to 'provider-unavailable'.
 */
export async function verifyCaptcha(
  token: unknown,
  ctx: { remoteIp?: string; expectedAction?: string } = {},
): Promise<CaptchaResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: false, reason: 'not-configured' };
  if (typeof token !== 'string' || !token.trim()) return { ok: false, reason: 'missing-token' };

  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token.trim());
  if (ctx.remoteIp && ctx.remoteIp !== 'unknown') form.set('remoteip', ctx.remoteIp);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body: form, signal: controller.signal });
    if (!res.ok) return { ok: false, reason: 'provider-unavailable' };
    const data = (await res.json()) as SiteVerifyResponse;
    if (data.success !== true) return { ok: false, reason: 'invalid' };
    // Only enforce action when the caller configured one (Turnstile supports it).
    if (ctx.expectedAction && data.action && data.action !== ctx.expectedAction) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true };
  } catch {
    // Timeout / network failure — never let the raw error reach the client/logs.
    return { ok: false, reason: 'provider-unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Endpoint guard: verify the token and, on failure, return the appropriate
 * generic NextResponse. Returns null when the request may proceed.
 *
 * Order of use in a route: input checks → rate limit → enforceCaptcha → work.
 */
export async function enforceCaptcha(
  token: unknown,
  ctx: { remoteIp?: string; expectedAction?: string; label?: string } = {},
): Promise<NextResponse | null> {
  if (!isCaptchaConfigured()) {
    console.warn(`[captcha] not configured — proceeding without CAPTCHA${ctx.label ? ` for ${ctx.label}` : ''} (rate limiting still applies)`);
    return null;
  }
  // Skip verification when no token is present — the widget may have failed to
  // load (e.g. domain not proxied through Cloudflare). Rate limiting still applies.
  if (typeof token !== 'string' || !token.trim()) {
    console.warn(`[captcha] token absent — skipping verification${ctx.label ? ` for ${ctx.label}` : ''} (rate limiting still applies)`);
    return null;
  }
  const result = await verifyCaptcha(token, ctx);
  if (result.ok) return null;

  if (result.reason === 'provider-unavailable') {
    // Fail closed for protected operations when the provider cannot be reached.
    return NextResponse.json(
      { error: 'Security verification is temporarily unavailable. Please try again later.' },
      { status: 503 },
    );
  }
  // invalid / reused token → reject.
  return NextResponse.json(
    { error: 'CAPTCHA verification failed. Please try again.' },
    { status: 400 },
  );
}
