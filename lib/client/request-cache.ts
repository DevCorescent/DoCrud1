/**
 * De-duplicating GET helper for read-only, session-scoped endpoints.
 *
 * WHY: independent components legitimately want the same data and each fetched
 * it. One homepage load asked `/api/me/badge` twice (the nav avatar ring and
 * the profile-score card) and `/api/recommendations/jobs` twice (the headline
 * count and the recommended carousel) — four requests where two would do, each
 * one a full round trip.
 *
 * WHAT IT DOES: concurrent callers for the same URL share ONE in-flight
 * request, and a completed response is reusable for a short window. Nothing
 * else changes — same endpoints, same responses, same error handling at the
 * call site.
 *
 * WHAT IT IS NOT: not a general data layer, not persisted, and not for
 * mutations. It lives only in the tab's memory and is dropped on navigation
 * away from the app. Only use it for GETs whose response depends on nothing but
 * the URL and the signed-in session.
 *
 * SESSION SAFETY: the cache dies with the page, so it cannot outlive a session.
 * `clearRequestCache()` is exported for sign-out/sign-in transitions, where the
 * same URL would otherwise be answered with the previous member's data.
 */

type Entry = { at: number; value: unknown };

const DEFAULT_TTL = 30_000;

const settled = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

/** Drop everything — call when the signed-in identity changes. */
export function clearRequestCache() {
  settled.clear();
  inFlight.clear();
}

/**
 * GETs `url` as JSON, sharing the request with any concurrent caller and
 * reusing a fresh result for `ttl` ms.
 *
 * Rejections are never cached: a failed request clears its slot so the next
 * caller retries rather than inheriting the failure for the whole window.
 */
export function cachedJson<T>(url: string, ttl: number = DEFAULT_TTL): Promise<T> {
  const hit = settled.get(url);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value as T);

  const pending = inFlight.get(url);
  if (pending) return pending as Promise<T>;

  const request = fetch(url, { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      const value = await response.json();
      settled.set(url, { at: Date.now(), value });
      return value as T;
    })
    .finally(() => { inFlight.delete(url); });

  inFlight.set(url, request);
  return request as Promise<T>;
}
