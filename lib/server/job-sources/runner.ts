/**
 * The ingestion runner.
 *
 * Plans a run, enqueues one task per eligible source, and drains tasks within
 * a time budget. It fetches and records; it does NOT import, normalize,
 * deduplicate or classify — those are later phases, and the existing importer
 * remains the only path into the job store.
 *
 * FAILURE ISOLATION IS THE POINT. Every source runs inside its own try/catch,
 * its outcome is recorded against that source alone, and the drain continues.
 * One company's job board returning 500 costs exactly one source.
 */
import {
  getSourceConfig, listSourceConfigs, getAdapter, isPartnershipBlocked, safeMessage,
} from './registry';
import {
  claimTask, completeTask, enqueueSources, failTask, queueAvailable,
  runQueueStats, taskId,
} from './queue';
import {
  autoDisableSource, createRunId, finishIngestionRun, getSourceHealth,
  recordSourceResult, saveCursor, startIngestionRun,
} from './runs';
import type { ProviderDeps } from '@/lib/server/job-scraper/types';
import type { IngestionSourceResult, NormalizedJob, SourceConfig } from './types';

/** Which sources this run will attempt, and which it will skip and why. */
export interface RunPlan {
  runId: string;
  eligible: SourceConfig[];
  skipped: Array<{ sourceId: string; reason: IngestionSourceResult['skipReason'] }>;
}

/**
 * Decide what to run.
 *
 * Skipping is explicit and recorded. A source that silently does not run is
 * indistinguishable from one that ran and found nothing, and an operator
 * cannot debug the difference.
 */
export async function planRun(runId = createRunId()): Promise<RunPlan> {
  const health = await getSourceHealth();
  const eligible: SourceConfig[] = [];
  const skipped: RunPlan['skipped'] = [];

  for (const config of listSourceConfigs()) {
    /* Checked first and by IDENTITY, not by configuration: a source that needs
       a partnership must not become fetchable because someone set a flag. */
    if (isPartnershipBlocked(config.sourceId)) {
      skipped.push({ sourceId: config.sourceId, reason: 'requires_partnership' });
      continue;
    }
    if (!config.enabled) {
      skipped.push({ sourceId: config.sourceId, reason: 'disabled' });
      continue;
    }
    if (health[config.sourceId]?.autoDisabledAt) {
      skipped.push({ sourceId: config.sourceId, reason: 'auto_disabled' });
      continue;
    }
    eligible.push(config);
  }

  return { runId, eligible, skipped };
}

export interface StartRunResult {
  runId: string;
  queued: number;
  skipped: RunPlan['skipped'];
  /** False when Mongo is absent: the queue has no local-file equivalent. */
  queueAvailable: boolean;
}

/**
 * Open a run and enqueue its work.
 *
 * Enqueuing is separated from draining so a scheduled trigger stays fast and
 * cannot time out: it plans, records, and returns. Workers do the fetching.
 */
export async function startRun(): Promise<StartRunResult> {
  const plan = await planRun();
  await startIngestionRun(plan.runId);

  /* Skips are recorded immediately, so the run explains itself even if no
     worker ever drains it. */
  for (const s of plan.skipped) {
    await recordSourceResult(plan.runId, {
      sourceId: s.sourceId, ok: false, jobsFound: 0, latencyMs: 0, attempts: 0,
      skipped: true, skipReason: s.reason,
    });
  }

  const available = await queueAvailable();
  const queued = available
    ? await enqueueSources(plan.runId, plan.eligible.map((c) => ({
        sourceId: c.sourceId, maxAttempts: c.maxAttempts,
      })))
    : 0;

  return { runId: plan.runId, queued, skipped: plan.skipped, queueAvailable: available };
}

/** Per-source pacing, honoured within a single worker process. */
const lastRequestAt = new Map<string, number>();

async function respectRateLimit(config: SourceConfig, now = Date.now()): Promise<void> {
  const last = lastRequestAt.get(config.sourceId);
  if (last !== undefined) {
    const wait = config.minIntervalMs - (now - last);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }
  lastRequestAt.set(config.sourceId, Date.now());
}

/** A fetch that cannot hang for ever. */
async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface DrainOptions {
  /** Stop claiming new tasks once this much time has been spent. */
  budgetMs?: number;
  /** Safety ceiling on tasks per invocation. */
  maxTasks?: number;
  workerId?: string;
  deps?: ProviderDeps;
  /**
   * What to do with the jobs a source returned.
   *
   * Phase 2 fetches and records only. Normalization, deduplication and import
   * are Phase 3, and passing a sink keeps that seam explicit instead of
   * leaving a TODO in the runner.
   */
  onJobs?: (sourceId: string, jobs: NormalizedJob[]) => Promise<void> | void;
}

export interface DrainResult {
  claimed: number;
  succeeded: number;
  failed: number;
  jobsFound: number;
  /** True when the budget stopped the drain with work still queued. */
  budgetExhausted: boolean;
}

/**
 * Claim and process tasks until the budget runs out.
 *
 * Safe to call concurrently: every task is claimed atomically, so two workers
 * running at once simply share the work rather than duplicating it.
 */
export async function drainQueue(options: DrainOptions = {}): Promise<DrainResult> {
  const budgetMs = options.budgetMs ?? 45_000;
  const maxTasks = options.maxTasks ?? 25;
  const workerId = options.workerId
    ?? `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const startedAt = Date.now();
  const result: DrainResult = {
    claimed: 0, succeeded: 0, failed: 0, jobsFound: 0, budgetExhausted: false,
  };

  while (result.claimed < maxTasks) {
    if (Date.now() - startedAt > budgetMs) { result.budgetExhausted = true; break; }

    const task = await claimTask(workerId);
    if (!task) break;
    result.claimed += 1;

    const config = getSourceConfig(task.sourceId);
    const adapter = getAdapter(task.sourceId, options.deps);
    const startedFetch = Date.now();

    /* Everything below is inside one try/catch PER SOURCE. A throw here ends
       this task and nothing else. */
    try {
      if (!config) throw new Error(`Source "${task.sourceId}" is no longer configured.`);
      if (!adapter) throw new Error(`No adapter for source "${task.sourceId}".`);
      if (isPartnershipBlocked(task.sourceId)) {
        throw new Error(`${task.sourceId} may not be ingested without a partnership.`);
      }

      await respectRateLimit(config);
      const { jobs, nextCursor } = await withTimeout(
        adapter.fetch(task.cursor), config.timeoutMs, task.sourceId,
      );

      if (options.onJobs) await options.onJobs(task.sourceId, jobs);

      await completeTask(task._id, nextCursor);
      await saveCursor(task.sourceId, nextCursor);
      await recordSourceResult(task.runId, {
        sourceId: task.sourceId, ok: true, jobsFound: jobs.length,
        latencyMs: Date.now() - startedFetch, attempts: task.attempts,
      });

      result.succeeded += 1;
      result.jobsFound += jobs.length;
    } catch (error) {
      const message = safeMessage(error);
      const maxAttempts = config?.maxAttempts ?? task.maxAttempts;
      const { willRetry } = await failTask(task._id, message, task.attempts, maxAttempts);

      /* Only a FINAL failure counts against the source's health. Counting each
         retry would auto-disable a source after one bad afternoon. */
      if (!willRetry) {
        await recordSourceResult(task.runId, {
          sourceId: task.sourceId, ok: false, jobsFound: 0,
          latencyMs: Date.now() - startedFetch, attempts: task.attempts, error: message,
        });

        const health = (await getSourceHealth())[task.sourceId];
        const limit = config?.disableAfterConsecutiveFailures
          ?? Number.POSITIVE_INFINITY;
        if (health && health.consecutiveFailures >= limit) {
          await autoDisableSource(task.sourceId);
        }
        result.failed += 1;
      }
    }
  }

  return result;
}

/** Whether a run still has work outstanding. */
export async function runIsComplete(runId: string): Promise<boolean> {
  const stats = await runQueueStats(runId);
  return stats.pending === 0 && stats.claimed === 0;
}

export async function closeRunIfComplete(runId: string): Promise<boolean> {
  if (!(await runIsComplete(runId))) return false;
  await finishIngestionRun(runId, 'completed');
  return true;
}

export { taskId };
