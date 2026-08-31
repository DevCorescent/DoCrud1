/**
 * Shared authorization for scheduled (cron) endpoints.
 *
 * This is the SAME mechanism the existing cron routes already use — the
 * `CRON_SECRET` env var, presented as `x-cron-secret` or as
 * `Authorization: Bearer <secret>` (the header Vercel Cron sends automatically
 * when CRON_SECRET is configured). It is factored out here so a new scheduled
 * endpoint does not have to re-implement it and drift.
 *
 * Two deliberate differences from the older inline copies:
 *
 *  - THE SECRET IS NEVER ACCEPTED FROM THE QUERY STRING. One existing route
 *    allows `?secret=…`, which writes the secret into access logs, browser
 *    history and any Referer header. A header-only contract costs nothing and
 *    leaks nothing.
 *
 *  - THE LOCALHOST FALLBACK CANNOT APPLY IN PRODUCTION. Running without a
 *    secret is a development convenience; in production an unauthenticated
 *    caller must never be able to trigger a job that sends real email.
 *
 * The comparison is constant-time, so a caller cannot learn the secret one
 * byte at a time from response timing.
 */
import crypto from 'crypto';
import type { NextRequest } from 'next/server';

function safeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  /* timingSafeEqual throws on a length mismatch, which would itself leak the
     length; hash both sides to a fixed width first. */
  const ah = crypto.createHash('sha256').update(ab).digest();
  const bh = crypto.createHash('sha256').update(bb).digest();
  return crypto.timingSafeEqual(ah, bh);
}

export interface CronAuthResult {
  authorized: boolean;
  /** Safe to return to the caller — never contains the secret. */
  reason: 'ok' | 'missing-secret-config' | 'invalid-credentials';
}

export function checkCronAuth(req: NextRequest): CronAuthResult {
  const secret = process.env.CRON_SECRET || '';

  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return { authorized: false, reason: 'missing-secret-config' };
    }
    /* Development only: allow a local call so the job can be exercised without
       configuring a secret first. */
    const host = req.headers.get('host') || '';
    const local = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    return local
      ? { authorized: true, reason: 'ok' }
      : { authorized: false, reason: 'missing-secret-config' };
  }

  const headerSecret = req.headers.get('x-cron-secret') || '';
  const authorization = req.headers.get('authorization') || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  const ok = (headerSecret !== '' && safeEquals(headerSecret, secret))
    || (bearer !== '' && safeEquals(bearer, secret));

  return ok
    ? { authorized: true, reason: 'ok' }
    : { authorized: false, reason: 'invalid-credentials' };
}
