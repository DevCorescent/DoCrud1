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

import { readViewerCountRow, writeViewerCountRow } from '@/lib/server/db/recommendation-counts-rows';

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


/* ─── viewer count seeds ──────────────────────────────────────────────────
   The homepage renders "N new matches" / "N new people". Producing those
   numbers means running the personalised ranking, which is far too slow to put
   in front of a server render. So the last computed value per viewer is kept
   here — free, in-process — and mirrored to a durable per-user row so a cold
   process still has something to render.

   The homepage reads this and renders the number immediately, then lets the
   client refresh in the background. Nothing here ever COMPUTES a count; it
   only remembers one the recommendation routes already produced. */

interface ViewerCounts { jobs: number | null; people: number | null }

const viewerCounts = new Map<string, ViewerCounts>();

/** Called by a recommendation route once it has a real total. */
export function rememberViewerCount(userId: string, kind: 'jobs' | 'people', total: number) {
  if (!userId || !Number.isFinite(total)) return;
  const current = viewerCounts.get(userId) ?? { jobs: null, people: null };
  viewerCounts.set(userId, { ...current, [kind]: Math.max(0, Math.round(total)) });
  /* Mirrored durably so another process — or this one after a restart — can
     still seed the page. Fire-and-forget: the in-process value is already
     correct, and a missed mirror only means recomputing sooner. */
  void writeViewerCountRow(userId, kind, total);
}

/** In-process only. Free, and never triggers a computation. */
export function peekViewerCounts(userId: string): ViewerCounts | null {
  if (!userId) return null;
  return viewerCounts.get(userId) ?? null;
}

/**
 * The best counts available for this viewer WITHOUT computing anything:
 * the in-process value first, then the durable row.
 *
 * Nulls are honest — they mean "not known cheaply", and the caller lets the
 * browser fetch as it always did rather than blocking the render.
 */
export async function seedViewerCounts(userId: string): Promise<ViewerCounts> {
  if (!userId) return { jobs: null, people: null };

  const local = peekViewerCounts(userId);
  if (local && local.jobs !== null && local.people !== null) return local;

  const stored = await readViewerCountRow(userId).catch(() => null);
  return {
    jobs: local?.jobs ?? stored?.jobs ?? null,
    people: local?.people ?? stored?.people ?? null,
  };
}
