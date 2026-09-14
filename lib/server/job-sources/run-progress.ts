/**
 * Shared constants for reading a run's progress.
 *
 * Kept out of `runs.ts` so a route can import the threshold without pulling in
 * the storage layer, and out of the route so the worker's heartbeat cadence and
 * the reader's staleness rule cannot drift apart in separate files.
 */

/**
 * How long a `running` run may go without a heartbeat before it is DESCRIBED
 * as stale.
 *
 * The worker beats once per lease-renewal interval (60 s). Three missed beats
 * is the threshold: one missed beat is a slow storage write, three is a process
 * that is gone. Set it tighter and a busy worker gets reported dead; looser and
 * a crash shows as an indefinite spinner, which is the failure this exists to
 * prevent.
 *
 * Staleness is a READING, never a write. Only the lease TTL actually frees the
 * scraper, and only the worker may change its own run's status — a reader that
 * marked runs failed would race the worker it just declared dead.
 */
export const HEARTBEAT_STALE_MS = 3 * 60_000;

/** Statuses that mean the run is over and polling should stop. */
export const TERMINAL_RUN_STATUSES = ['completed', 'partial', 'failed', 'cancelled'] as const;

export function isTerminalRunStatus(status: string): boolean {
  return (TERMINAL_RUN_STATUSES as readonly string[]).includes(status);
}
