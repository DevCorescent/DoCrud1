/**
 * The one cache abstraction. SERVER ONLY.
 *
 * Route handlers call `cached()` / `invalidateNamespace()`. Nothing outside this
 * file issues a raw Redis command, so TTLs, key shapes, error handling and
 * metrics have exactly one definition.
 *
 * ═══ INVALIDATION IS BY VERSION, NOT BY WILDCARD ═══
 *
 * Deleting `jobs:public:*` means SCAN, which over Upstash's REST transport is
 * many round trips and gets slower as the keyspace grows. Instead every
 * namespace carries a counter:
 *
 *     jobs:public          -> version 7
 *     key                  -> jobs:public:v7:<hash>
 *
 * Bumping the counter to 8 makes every v7 key unreachable in ONE command. The
 * orphans expire on their own TTL. Invalidation is therefore O(1) and atomic,
 * and a mutation never has to know which query hashes exist.
 *
 * ═══ A CACHE MUST NOT BE ABLE TO TAKE THE SITE DOWN ═══
 *
 * Every Redis call is wrapped. A timeout, an auth failure or an outage is
 * counted and then treated as a MISS, so the request falls through to the
 * existing in-process cache and MongoDB. With Redis unconfigured this module is
 * a thin pass-through and behaviour is identical to today.
 */
import { createHash } from 'node:crypto';
import { getRedis } from './redis';

/* ── TTLs ─────────────────────────────────────────────────────────────────
   One TTL per KIND of data, chosen from how often that data actually changes
   and how wrong a stale answer would be — never one global number.

   Public data is versioned, so a TTL here is only a backstop against an
   invalidation that was missed; it can be generous. Owner-scoped data is NOT
   versioned by every mutation path, so its TTL is the real freshness bound and
   is deliberately short. */
export const TTL = {
  /** Public list pages. Versioned; bumped by every job write. */
  publicList: 120,
  /** One public posting. Versioned; the same bump covers it. */
  publicDetail: 300,
  /** Non-personalized recommendation row. Versioned with the job corpus. */
  recommendations: 120,
  /**
   * Personalized recommendations. User-scoped AND version-scoped.
   * Short because an application must stop the applied job reappearing, and a
   * profile edit should be reflected quickly.
   */
  personalized: 60,
  /** Employer's own postings. Short — an employer must see their own edit. */
  employerList: 15,
} as const;

/* ── Metrics ──────────────────────────────────────────────────────────────*/

export interface CacheMetrics {
  hit: number; miss: number; error: number; set: number; skip: number;
}
const metrics: CacheMetrics = { hit: 0, miss: 0, error: 0, set: 0, skip: 0 };

/** A snapshot for an admin panel or a test. Never contains cached payloads. */
export function cacheMetrics(): CacheMetrics {
  return { ...metrics };
}
export function resetCacheMetrics(): void {
  metrics.hit = 0; metrics.miss = 0; metrics.error = 0; metrics.set = 0; metrics.skip = 0;
}

/* ── Keys ─────────────────────────────────────────────────────────────────*/

/**
 * A canonical, bounded key fragment for a set of query parameters.
 *
 * The raw query string is NEVER used: it is attacker-controlled, unbounded, and
 * `?a=1&b=2` and `?b=2&a=1` must not become two entries for one answer. Keys
 * are sorted, JSON-encoded and hashed to a fixed 32 hex characters.
 *
 * Nothing secret belongs in a key. Callers pass query parameters and ids only —
 * never a token, a résumé, or a body.
 */
export function keyPart(params: Record<string, unknown>): string {
  const canonical = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => [k, String(params[k])]);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 32);
}

/* ── Version counters ─────────────────────────────────────────────────────*/

/** Namespaces that carry a version counter. */
export type Namespace = 'jobs:public' | 'jobs:recs' | 'jobs:personalized' | 'jobs:employer';

const versionKey = (ns: Namespace) => `${ns}:version`;

/* A short-lived local copy, so a page render does not spend a round trip
   re-reading a counter that changes rarely. The window is intentionally tiny:
   it is the maximum time a mutation can go unnoticed by THIS instance. */
const VERSION_TTL_MS = 5_000;
const versionCache = new Map<Namespace, { value: number; at: number }>();

/** The namespace's current version. Falls back to 0 when Redis is unavailable. */
export async function namespaceVersion(ns: Namespace): Promise<number> {
  const local = versionCache.get(ns);
  if (local && Date.now() - local.at < VERSION_TTL_MS) return local.value;

  const redis = getRedis();
  if (!redis) return 0;
  try {
    const raw = await redis.get<number | string>(versionKey(ns));
    const value = Number(raw) || 0;
    versionCache.set(ns, { value, at: Date.now() });
    return value;
  } catch {
    metrics.error += 1;
    return 0;
  }
}

/**
 * Invalidate an entire namespace in ONE command.
 *
 * Bumping the counter makes every key built against the previous version
 * unreachable at once. Nothing is scanned and nothing is deleted; the orphans
 * expire on their own TTL.
 */
export async function invalidateNamespace(ns: Namespace): Promise<void> {
  /* Cleared locally FIRST, so this instance cannot keep serving the old version
     from `versionCache` even if the Redis write then fails. */
  versionCache.delete(ns);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.incr(versionKey(ns));
  } catch {
    metrics.error += 1;
  }
}

/** Invalidate several namespaces. Used by writes that affect more than one. */
export async function invalidateNamespaces(list: readonly Namespace[]): Promise<void> {
  await Promise.all(list.map((ns) => invalidateNamespace(ns)));
}

/* ── The cache ────────────────────────────────────────────────────────────*/

export interface CachedOptions {
  ns: Namespace;
  /** Distinguishes different shapes inside one namespace, e.g. 'list', 'detail'. */
  kind: string;
  /** Query parameters and ids. Hashed. Never secrets. */
  params: Record<string, unknown>;
  ttlSeconds: number;
  /**
   * Scope to one user. REQUIRED for anything derived from a member's own data —
   * a personalized feed, an employer's postings — so one member's answer can
   * never be served to another.
   */
  userId?: string;
}

/**
 * Read through the cache, computing on a miss.
 *
 * `compute` runs on a miss, on a Redis error, and whenever Redis is not
 * configured — so the caller's existing path is always the fallback.
 *
 * AUTHORIZATION IS NEVER CACHED. The caller authenticates and authorizes BEFORE
 * calling this, and user-scoped data passes `userId` so the key itself cannot
 * be shared. A cache hit therefore skips computation, never a permission check.
 */
export async function cached<T>(
  opts: CachedOptions,
  compute: () => Promise<T>,
): Promise<T> {
  const redis = getRedis();
  if (!redis) { metrics.skip += 1; return compute(); }

  const version = await namespaceVersion(opts.ns);
  const scope = opts.userId ? `u:${opts.userId}:` : '';
  const key = `${opts.ns}:${opts.kind}:v${version}:${scope}${keyPart(opts.params)}`;

  try {
    const hit = await redis.get<T>(key);
    if (hit !== null && hit !== undefined) { metrics.hit += 1; return hit; }
  } catch {
    /* A read failure is a miss, never an error the caller sees. */
    metrics.error += 1;
    return compute();
  }

  metrics.miss += 1;
  const value = await compute();

  try {
    /* Written after the value is computed, so a failed write costs a repeat
       computation and never a wrong answer. */
    await redis.set(key, value, { ex: opts.ttlSeconds });
    metrics.set += 1;
  } catch {
    metrics.error += 1;
  }
  return value;
}

/** Drop one key. Rarely needed — prefer a namespace bump. */
export async function invalidateKey(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try { await redis.del(key); } catch { metrics.error += 1; }
}

/** Test seam: clear the local version memo. */
export function __clearVersionCache(): void {
  versionCache.clear();
}
