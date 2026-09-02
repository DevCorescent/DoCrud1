/**
 * The Redis connection. SERVER ONLY — never import this from a client component.
 *
 * ═══ WHY REDIS, GIVEN THERE IS ALREADY AN IN-PROCESS CACHE ═══
 *
 * The in-process cache in lib/server/hiring.ts took the public feed from 33 s to
 * ~6 ms, but it lives in ONE lambda's memory. On Vercel that means:
 *
 *   · every cold start begins with an empty cache and pays the full corpus read;
 *   · every additional concurrent instance keeps its own copy;
 *   · a job edited on instance A is stale on instance B until its probe fires.
 *
 * Redis is shared across instances, so a corpus read paid once is reused by all
 * of them, and an invalidation is seen by all of them. It is a CACHE, not a
 * store: MongoDB remains the only source of truth, and every key here can be
 * dropped at any moment without losing data.
 *
 * ═══ REDIS BEING DOWN IS NOT AN OUTAGE ═══
 *
 * `getRedis()` returns null when the credentials are absent or the client
 * cannot be constructed, and every caller treats null as a cache miss. With no
 * configuration at all the application behaves exactly as it does today — the
 * in-process cache and MongoDB carry it. That is deliberate: a cache that can
 * take the site down is worse than no cache.
 */
import { Redis } from '@upstash/redis';

/** Set on the server only. NEVER prefixed NEXT_PUBLIC_ — these are credentials. */
const URL_VAR = 'UPSTASH_REDIS_REST_URL';
const TOKEN_VAR = 'UPSTASH_REDIS_REST_TOKEN';

let client: Redis | null = null;
let attempted = false;
/** Set when construction failed, so we log the reason once rather than per call. */
let disabledReason: string | null = null;

/**
 * The shared client, or null when Redis is not configured or unusable.
 *
 * Constructed lazily and once. A missing configuration is NOT an error — it is
 * the normal state for local development and for any deployment that has not
 * provisioned Redis.
 */
export function getRedis(): Redis | null {
  if (attempted) return client;
  attempted = true;

  const url = (process.env[URL_VAR] || '').trim();
  const token = (process.env[TOKEN_VAR] || '').trim();
  if (!url || !token) {
    disabledReason = 'not configured';
    return null;
  }
  /* A REST URL is the only shape this client speaks. A `redis://` URL here is a
     configuration mistake worth naming rather than failing on every request. */
  if (!/^https:\/\//i.test(url)) {
    disabledReason = `${URL_VAR} must be an https REST URL`;
    console.warn(`[redis] disabled — ${disabledReason}`);
    return null;
  }

  try {
    client = new Redis({ url, token });
    return client;
  } catch (error) {
    disabledReason = error instanceof Error ? error.message : 'client construction failed';
    console.warn(`[redis] disabled — ${disabledReason}`);
    client = null;
    return null;
  }
}

/** Whether a distributed cache is available. Never throws. */
export function redisEnabled(): boolean {
  return getRedis() !== null;
}

/** Why Redis is off, for an admin diagnostic. Never contains the token. */
export function redisStatus(): { enabled: boolean; reason: string | null } {
  const enabled = redisEnabled();
  return { enabled, reason: enabled ? null : (disabledReason ?? 'not configured') };
}

/** Test seam: swap the client, or clear it. Server-side tests only. */
export function __setRedisClientForTests(next: Redis | null): void {
  client = next;
  attempted = true;
  disabledReason = next ? null : 'cleared by test';
}
