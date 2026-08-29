/**
 * The recommendation caches, in one place so a job write can clear them.
 *
 * Both recommendation routes hold a short per-viewer result cache. Those caches
 * lived as module-level Maps inside the route files, which meant nothing
 * outside a route could invalidate them — so a newly posted job stayed
 * invisible to recommendations until the entry expired on its own.
 *
 * Registering the maps here lets `saveHiringJobs()` clear them the moment the
 * job store changes, without moving the caching logic itself or changing how
 * either route computes its answer.
 *
 * Cache KEYS are unchanged and still carry the viewer identity, so clearing is
 * all-or-nothing and can never hand one member's recommendations to another.
 */

type AnyCache = { clear(): void };

/* An array, not a Set: this project's TS target predates downlevel iteration,
   and registration happens once per route module so duplicates cannot occur. */
const registry: AnyCache[] = [];

/** Called once per route module, at import time. */
export function registerRecommendationCache(cache: AnyCache) {
  if (!registry.includes(cache)) registry.push(cache);
}

/**
 * Drops every cached recommendation result.
 *
 * Called after any job create / edit / unpublish / delete: a new or changed
 * posting can alter any viewer's matches, so the whole set is invalidated
 * rather than guessing which viewers were affected. The next request per
 * viewer recomputes — the same work the cache was already going to do when it
 * expired, just sooner.
 */
export function invalidateRecommendationCaches() {
  for (const cache of registry) {
    try { cache.clear(); } catch { /* a cache that cannot clear must not break the write */ }
  }
}
