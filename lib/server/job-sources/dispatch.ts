/**
 * Starting a scraper run from a request, without the request waiting for it.
 *
 * ═══ THE PROBLEM THIS SOLVES ═══
 *
 * The Super Admin route used to run the whole scrape inline. nginx closes a
 * proxied response after `proxy_read_timeout` (60 s in production) and a run
 * over the configured boards takes minutes, so the browser reliably received
 * nginx's HTML 504 while the run carried on invisibly. Raising the proxy
 * timeout would only move the number; the request is simply the wrong place to
 * do minutes of work.
 *
 * So the route now ACCEPTS the work and returns. This module is the seam
 * between the two: it opens the run record, hands execution to the same
 * standalone worker systemd uses, and gets out of the way.
 *
 * ═══ WHY A DETACHED CHILD PROCESS ═══
 *
 * The alternative — kicking off the async work inside the route and not
 * awaiting it — keeps the scrape inside the Next.js process, where a PM2
 * restart or a deploy kills it mid-write, and where nothing supervises it.
 *
 * A detached child survives the response, survives PM2 restarting the web
 * process, and is the SAME entrypoint the timer runs, so there is one execution
 * path to reason about rather than two. It inherits no stdio: the worker's own
 * structured logging goes to the run record, which is what the UI reads.
 */
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { startIngestionRun, finishIngestionRun } from './runs';
import { readScraperLease } from './run-lock';

export type DispatchResult =
  | { ok: true; runId: string; status: 'queued' }
  | { ok: false; reason: 'already_running'; runId: string }
  | { ok: false; reason: 'dispatch_failed'; error: string };

export interface DispatchOptions {
  /** Identity of the Super Admin who asked. Never session material. */
  requestedBy?: string;
  perSourceLimit?: number;
  /** Injected by tests so no process is ever actually spawned. */
  spawnWorker?: (args: string[]) => void;
  /** Injected by tests. */
  now?: () => Date;
}

/** The worker entrypoint, relative to the application root. */
export const WORKER_SCRIPT = 'scripts/run-job-scraper.ts';

/**
 * Accept a scrape request and return immediately.
 *
 * Checks the lease FIRST. That check is advisory — the worker takes the lease
 * atomically and is the real arbiter — but it means a second click gets an
 * honest "already running" with the live runId instead of spawning a process
 * whose only job is to discover it lost and exit.
 */
export async function dispatchScraperRun(
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  const held = await readScraperLease(options.now?.()).catch(() => null);
  if (held) return { ok: false, reason: 'already_running', runId: held.runId };

  const runId = `run-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

  /* Opened as `queued`, before the process exists. The 202 hands this id
     straight to the browser, so it must be pollable the moment it is returned —
     a run created after the spawn would be briefly un-findable. */
  await startIngestionRun(runId, {
    trigger: 'manual',
    queued: true,
    ...(options.requestedBy ? { requestedBy: options.requestedBy } : {}),
  });

  const args = [
    'tsx', WORKER_SCRIPT,
    '--trigger', 'manual',
    '--run-id', runId,
    ...(options.perSourceLimit ? ['--limit', String(options.perSourceLimit)] : []),
  ];

  try {
    if (options.spawnWorker) {
      options.spawnWorker(args);
    } else {
      const child = spawn('npx', args, {
        cwd: process.cwd(),
        /* Its own process group, so it is not killed along with the web
           process on a restart or a Ctrl+C in the foreground. */
        detached: true,
        /* No inherited pipes. An inherited stdout would keep a handle open
           against the parent and, worse, block the child once nobody drains
           it. The worker reports through the run record. */
        stdio: 'ignore',
        env: process.env,
      });
      child.on('error', () => {
        /* Reported through the run, since there is no request left to fail. */
        void finishIngestionRun(runId, 'failed', 'worker process could not be started')
          .catch(() => {});
      });
      child.unref();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'worker dispatch failed';
    /* A run left `queued` forever would show as a permanent spinner. Close it. */
    await finishIngestionRun(runId, 'failed', 'worker process could not be started')
      .catch(() => {});
    return { ok: false, reason: 'dispatch_failed', error: message };
  }

  return { ok: true, runId, status: 'queued' };
}
