/**
 * Keeps the recommendation inputs resident in this worker so a person's
 * request never pays to reload them.
 *
 * ═══ THE PROBLEM IT REMOVES ═══
 *
 * `getPublishedHiringJobs` trusts its corpus for PUBLISHED_MAX_AGE (10 min)
 * without a caller; after that the next caller reloads 72.6 MB across regions
 * (~52 s measured in production) and then derives per-posting features
 * (~8.8 s). With several PM2 workers and quiet nights, "the next caller" was a
 * real person opening the homepage — and their recommendation request timed
 * out at nginx's 60 s.
 *
 * ═══ WHAT THIS DOES ═══
 *
 * A timer in the worker calls the SAME two functions the request path calls,
 * on an interval shorter than the corpus's trust window:
 *
 *   · `getPublishedHiringJobs()` — inside the trust window this is the
 *     existing ~50-byte version probe, which renews the window when nothing
 *     changed and reloads only when a job actually changed. Either way the
 *     reload, if any, happens HERE, off every request.
 *   · `recFeaturesFor(version, jobs)` — a no-op while the version is
 *     unchanged; derives the new set (in yielding slices) when it moved.
 *
 * Nothing is computed that the request path would not compute, the corpus's
 * freshness rules are exactly the existing ones, and no recommendation is
 * precomputed here — snapshots are built by the route's own pass.
 *
 * ═══ SAFETY ═══
 *
 * One timer per process, guarded on `globalThis` against module re-evaluation
 * (dev HMR, route chunk duplication). `unref()`ed, so it never keeps a
 * shutting-down process alive. Skipped during `next build`, where a prerender
 * worker must not hold timers. A tick that fails logs and waits for the next;
 * ticks never overlap.
 */
import { getPublishedHiringJobs } from '@/lib/server/hiring';
import { readHiringCorpusVersion } from '@/lib/server/db/hiring-jobs-collection';
import { corpusVersionKey } from '@/lib/server/recommendation-refresh';
import { recFeaturesFor } from '@/lib/server/recommendation-features';

/** Shorter than PUBLISHED_MAX_AGE (10 min) so the corpus never lapses. */
export const KEEP_WARM_INTERVAL_MS = 4 * 60_000;

const GUARD = Symbol.for('docrud.recommendation-keep-warm');
type Guard = { timer: ReturnType<typeof setInterval>; ticking: boolean };

/** One warm-up pass: the request path's own two loads, in the same order. */
export async function warmRecommendationInputs(): Promise<{ jobs: number; features: number }> {
  const jobs = await getPublishedHiringJobs();
  const version = corpusVersionKey(await readHiringCorpusVersion().catch(() => null));
  const features = await recFeaturesFor(version, jobs as unknown as Array<Record<string, unknown>>).catch(() => null);
  return { jobs: jobs.length, features: features?.size ?? 0 };
}

/**
 * Start the timer if it is not already running. Idempotent. Returns whether
 * this call started it.
 */
export function startRecommendationKeepWarm(intervalMs: number = KEEP_WARM_INTERVAL_MS): boolean {
  if (process.env.NEXT_PHASE === 'phase-production-build') return false;
  const g = globalThis as unknown as Record<symbol, Guard | undefined>;
  if (g[GUARD]) return false;

  const guard: Guard = { timer: undefined as unknown as ReturnType<typeof setInterval>, ticking: false };
  guard.timer = setInterval(() => {
    if (guard.ticking) return;
    guard.ticking = true;
    warmRecommendationInputs()
      .catch((error) => { console.error('[recommendations/keep-warm] tick failed', error); })
      .finally(() => { guard.ticking = false; });
  }, intervalMs);
  (guard.timer as { unref?: () => void }).unref?.();
  g[GUARD] = guard;
  return true;
}

/** Test seam: stop the timer so a process can exit. */
export function stopRecommendationKeepWarm(): void {
  const g = globalThis as unknown as Record<symbol, Guard | undefined>;
  const guard = g[GUARD];
  if (!guard) return;
  clearInterval(guard.timer);
  delete g[GUARD];
}
