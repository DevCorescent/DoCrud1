/**
 * Centralized, server-side rate limiting for DoCrud.
 *
 * ONE reusable limiter for every abuse-sensitive flow (login, OTP, signup),
 * instead of per-route in-memory Maps. It reuses the project's existing shared
 * store — MongoDB — exactly the way lib/server/service-safety.ts does:
 *
 *  - Production (Mongo configured): an atomic `$inc` fixed-window counter. Mongo
 *    is the shared store, so the counter is correct ACROSS serverless instances
 *    and ACROSS concurrent requests (the increment is a single atomic op — 20
 *    simultaneous requests get 20 distinct counts, none can bypass the limit).
 *  - Development / no Mongo: a JSON-file fallback, serialized through an
 *    in-process write lock so concurrent writers on this single process cannot
 *    clobber each other. This fallback is SINGLE-INSTANCE ONLY and is NOT
 *    production-equivalent (a multi-instance deploy without Mongo would keep
 *    separate counters per instance).
 *
 * No new dependency is added; no external Redis/Upstash is required.
 */

import path from 'path';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/server/database';
import { dataDir, readJsonFile, writeJsonFile } from '@/lib/server/storage';

const RATE_COL = 'auth_rate_limits';
const rateLimitsPath = path.join(dataDir, 'auth-rate-limits.json');

export interface RatePolicy { limit: number; windowMs: number }
export interface RateResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  /** True when the store errored and the limiter could not count (fail-open,
      logged). Sensitive endpoints may choose to treat this as blocked. */
  degraded: boolean;
}

const MIN = 60 * 1000;
/**
 * Starting policies (see the audit). Failure-counted flows (login, OTP verify)
 * refund the account key on success so legitimate repeated use is never blocked.
 */
export const RATE_POLICIES = {
  loginAccount:           { limit: 5,  windowMs: 10 * MIN },
  loginIp:                { limit: 20, windowMs: 10 * MIN },
  signupIp:               { limit: 5,  windowMs: 60 * MIN },
  otpSendAccount:         { limit: 3,  windowMs: 10 * MIN },
  otpSendIp:              { limit: 10, windowMs: 10 * MIN },
  otpVerifyAccount:       { limit: 5,  windowMs: 10 * MIN },
  otpVerifyIp:            { limit: 20, windowMs: 10 * MIN },
  superadminLoginAccount: { limit: 3,  windowMs: 15 * MIN },
  superadminLoginIp:      { limit: 10, windowMs: 15 * MIN },
} as const satisfies Record<string, RatePolicy>;

export type RatePolicyName = keyof typeof RATE_POLICIES;

interface RateRow { _id: string; count: number; expiresAt: string }

function windowStartFor(windowMs: number): number {
  return Math.floor(Date.now() / windowMs) * windowMs;
}

/* JSON-fallback write serialization: the file is read-whole → mutate → write-whole,
   so concurrent writers must not interleave (dev/single-instance only). */
let jsonWriteChain: Promise<void> = Promise.resolve();
function serializeJsonWrite<T>(fn: () => Promise<T>): Promise<T> {
  const run = jsonWriteChain.then(fn, fn);
  jsonWriteChain = run.then(() => undefined, () => undefined);
  return run;
}

/** Atomically add `delta` to the window counter and return the new count. */
async function bump(fullKey: string, windowMs: number, delta: number): Promise<number> {
  const expiresAt = new Date(windowStartFor(windowMs) + windowMs).toISOString();
  const db = await getMongoDb();
  if (db) {
    const res = await db.collection<RateRow>(RATE_COL).findOneAndUpdate(
      { _id: fullKey },
      { $inc: { count: delta }, $setOnInsert: { expiresAt } },
      { upsert: true, returnDocument: 'after' },
    );
    const doc = res as unknown as { value?: RateRow; count?: number };
    return Math.max(0, doc?.value?.count ?? doc?.count ?? 0);
  }
  return serializeJsonWrite(async () => {
    const all = await readJsonFile<Record<string, RateRow>>(rateLimitsPath, {});
    const nowIso = new Date().toISOString();
    const fresh: Record<string, RateRow> = {};
    for (const [k, row] of Object.entries(all)) {
      if (row?.expiresAt && row.expiresAt > nowIso) fresh[k] = row; // drop expired windows
    }
    const count = Math.max(0, (fresh[fullKey]?.count ?? 0) + delta);
    fresh[fullKey] = { _id: fullKey, count, expiresAt };
    await writeJsonFile(rateLimitsPath, fresh);
    return count;
  });
}

/**
 * Count one attempt against `key` and decide. Increment-first (atomic), so the
 * decision cannot be raced. On store failure it fails OPEN but flags `degraded`
 * and logs — it never silently drops the signal.
 */
export async function rateLimit(key: string, policy: RatePolicy): Promise<RateResult> {
  const { limit, windowMs } = policy;
  const ws = windowStartFor(windowMs);
  const retryAfterSeconds = Math.max(1, Math.ceil((ws + windowMs - Date.now()) / 1000));
  try {
    const count = await bump(`${key}:${ws}`, windowMs, 1);
    return { allowed: count <= limit, limit, remaining: Math.max(0, limit - count), retryAfterSeconds, degraded: false };
  } catch (err) {
    console.error('[rate-limit] store error (failing open):', err);
    return { allowed: true, limit, remaining: limit, retryAfterSeconds, degraded: true };
  }
}

/** Refund one previously-counted attempt (e.g. a login that then SUCCEEDED), so
    only failures accumulate against the account key. Best-effort; never throws. */
export async function refundRateLimit(key: string, policy: RatePolicy): Promise<void> {
  const ws = windowStartFor(policy.windowMs);
  try { await bump(`${key}:${ws}`, policy.windowMs, -1); } catch { /* best-effort */ }
}

/**
 * Client IP. On Vercel `req.ip` is set by the platform and is trustworthy.
 * The header fallbacks are only trustworthy behind a trusted proxy, so IP keys
 * are treated as a COARSE secondary control — the per-account keys are the
 * primary defense and cannot be bypassed by spoofing a header.
 */
export function getClientIp(req: NextRequest): string {
  const ip = (req as unknown as { ip?: string }).ip;
  if (ip) return ip;
  const xreal = req.headers.get('x-real-ip');
  if (xreal) return xreal.trim();
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim(); // leftmost = client on typical proxies
  return 'unknown';
}

/** Consistent identity normalization for account keys. */
export function rateKeyEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** The generic 429 response — no internal detail, no account existence leak. */
export function tooManyRequestsResponse(retryAfterSeconds = 60): NextResponse {
  return NextResponse.json(
    { error: 'Too many attempts. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfterSeconds)) } },
  );
}

/**
 * Enforce a set of rate-limit checks. Returns a 429 NextResponse if any is
 * exceeded (or, when `failClosedOnDegraded`, if the store errored), else null.
 * Every listed check is counted (increment-first).
 */
export async function enforceRateLimits(
  checks: Array<{ key: string; policy: RatePolicy }>,
  opts: { failClosedOnDegraded?: boolean } = {},
): Promise<NextResponse | null> {
  for (const c of checks) {
    const r = await rateLimit(c.key, c.policy);
    if (opts.failClosedOnDegraded && r.degraded) return tooManyRequestsResponse(60);
    if (!r.allowed) return tooManyRequestsResponse(r.retryAfterSeconds);
  }
  return null;
}
