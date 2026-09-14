/**
 * Ingestion history and per-source health.
 *
 * Answers the questions an operator actually asks: did this source run, when
 * did it last work, how long did it take, how many jobs did it return, and why
 * did it stop. None of that can live in memory — it has to survive the request
 * that produced it — so it uses the project's existing storage helpers rather
 * than a new persistence tier.
 *
 * The existing `scraper-state.json` is deliberately left alone. It backs the
 * current Super Admin scraper screen, and repurposing it would break a working
 * page to save a file.
 */
import path from 'path';
import { readJsonFile, writeJsonFile, withStorageLock } from '@/lib/server/storage';
import {
  MAX_RUN_SOURCE_RESULTS,
  type IngestionRun,
  type IngestionSourceResult,
  type SourceHealthState,
} from './types';

const STATE_PATH = path.join(process.cwd(), 'data', 'job-ingestion.json');
const LOCK = 'job-ingestion';

/** How many completed runs are retained. Enough to see a trend. */
const MAX_RUNS = 50;

interface IngestionState {
  runs: IngestionRun[];
  health: Record<string, SourceHealthState>;
}

const fallback: IngestionState = { runs: [], health: {} };

async function read(): Promise<IngestionState> {
  const state = await readJsonFile<IngestionState>(STATE_PATH, fallback).catch(() => fallback);
  return {
    runs: Array.isArray(state?.runs) ? state.runs : [],
    health: (state?.health && typeof state.health === 'object') ? state.health : {},
  };
}

export async function getIngestionRuns(limit = 20): Promise<IngestionRun[]> {
  const { runs } = await read();
  return runs.slice(0, Math.max(1, Math.min(MAX_RUNS, limit)));
}

export async function getIngestionRun(runId: string): Promise<IngestionRun | null> {
  const { runs } = await read();
  return runs.find((r) => r.runId === runId) ?? null;
}

export async function getSourceHealth(): Promise<Record<string, SourceHealthState>> {
  return (await read()).health;
}

export function createRunId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface StartRunOptions {
  trigger?: 'manual' | 'timer' | 'api';
  workerId?: string;
  requestedBy?: string;
  sourcesTotal?: number;
  /**
   * Open the run as `queued` rather than `running`.
   *
   * The API accepts a request and returns 202 BEFORE a worker exists, so there
   * is a real interval with a run that nothing is executing. Recording it as
   * `running` during that window would make a worker that never starts look
   * like a worker that is busy — indistinguishable, and the UI would spin
   * forever. `queued` names the state honestly.
   */
  queued?: boolean;
}

/** Open a run. Recorded immediately so a crashed run is still visible. */
export async function startIngestionRun(
  runId: string,
  options: StartRunOptions = {},
): Promise<IngestionRun> {
  const now = new Date().toISOString();
  const run: IngestionRun = {
    runId,
    startedAt: now,
    status: options.queued ? 'queued' : 'running',
    heartbeatAt: now,
    ...(options.trigger ? { trigger: options.trigger } : {}),
    ...(options.workerId ? { workerId: options.workerId } : {}),
    ...(options.requestedBy ? { requestedBy: options.requestedBy } : {}),
    ...(typeof options.sourcesTotal === 'number' ? { sourcesTotal: options.sourcesTotal } : {}),
    sourcesAttempted: 0,
    sourcesSucceeded: 0,
    sourcesFailed: 0,
    jobsFound: 0,
    sources: [],
  };
  await withStorageLock(LOCK, async () => {
    const state = await read();
    await writeJsonFile(STATE_PATH, {
      ...state,
      runs: [run, ...state.runs].slice(0, MAX_RUNS),
    });
  });
  return run;
}

/**
 * Record one source's outcome and update its health, in a single write.
 *
 * Called after EVERY source, success or failure, so a run that dies halfway
 * still shows which sources completed. Health and history move together
 * because they are derived from the same event; updating them separately is
 * how they drift.
 */
export async function recordSourceResult(
  runId: string,
  result: IngestionSourceResult,
): Promise<void> {
  await withStorageLock(LOCK, async () => {
    const state = await read();
    const now = new Date().toISOString();

    const prior: SourceHealthState = state.health[result.sourceId]
      ?? { sourceId: result.sourceId, consecutiveFailures: 0 };

    let health: SourceHealthState = prior;
    /* A SKIPPED source is not evidence either way: it was never called, so its
       failure streak neither grows nor resets. */
    if (!result.skipped) {
      health = result.ok
        ? {
            ...prior,
            lastSuccessAt: now,
            /* A success clears the streak — that is what lets a source recover
               on its own after a provider outage ends. */
            consecutiveFailures: 0,
            lastError: undefined,
            autoDisabledAt: undefined,
            lastLatencyMs: result.latencyMs,
            lastJobCount: result.jobsFound,
          }
        : {
            ...prior,
            lastFailureAt: now,
            lastError: result.error,
            consecutiveFailures: prior.consecutiveFailures + 1,
            lastLatencyMs: result.latencyMs,
          };
    }

    const runs = state.runs.map((r) => {
      if (r.runId !== runId) return r;
      return {
        ...r,
        sourcesAttempted: r.sourcesAttempted + (result.skipped ? 0 : 1),
        sourcesSucceeded: r.sourcesSucceeded + (!result.skipped && result.ok ? 1 : 0),
        sourcesFailed: r.sourcesFailed + (!result.skipped && !result.ok ? 1 : 0),
        jobsFound: r.jobsFound + result.jobsFound,
        sources: [...r.sources, result].slice(0, MAX_RUN_SOURCE_RESULTS),
      };
    });

    await writeJsonFile(STATE_PATH, {
      runs,
      health: { ...state.health, [result.sourceId]: health },
    });
  });
}

/** Store where a source should resume. Separate: not every fetch has a cursor. */
export async function saveCursor(sourceId: string, cursor: string | null): Promise<void> {
  await withStorageLock(LOCK, async () => {
    const state = await read();
    const prior = state.health[sourceId] ?? { sourceId, consecutiveFailures: 0 };
    await writeJsonFile(STATE_PATH, {
      ...state,
      health: { ...state.health, [sourceId]: { ...prior, cursor } },
    });
  });
}

/** Mark a source as auto-disabled after too many consecutive failures. */
export async function autoDisableSource(sourceId: string): Promise<void> {
  await withStorageLock(LOCK, async () => {
    const state = await read();
    const prior = state.health[sourceId] ?? { sourceId, consecutiveFailures: 0 };
    if (prior.autoDisabledAt) return;
    await writeJsonFile(STATE_PATH, {
      ...state,
      health: {
        ...state.health,
        [sourceId]: { ...prior, autoDisabledAt: new Date().toISOString() },
      },
    });
  });
}

/**
 * Clear an auto-disable so the source is scheduled again.
 *
 * Deliberately manual. A source that auto-disabled did so after repeated
 * failures, and re-enabling it on a timer would just resume hammering a server
 * that is still broken.
 */
export async function clearAutoDisable(sourceId: string): Promise<void> {
  await withStorageLock(LOCK, async () => {
    const state = await read();
    const prior = state.health[sourceId];
    if (!prior) return;
    await writeJsonFile(STATE_PATH, {
      ...state,
      health: {
        ...state.health,
        [sourceId]: { ...prior, autoDisabledAt: undefined, consecutiveFailures: 0 },
      },
    });
  });
}

/**
 * A worker has picked up a queued run and is now executing it.
 *
 * Separate from `startIngestionRun` because the two happen in DIFFERENT
 * PROCESSES: the API opens the run, the worker claims it. Collapsing them
 * would mean the API had to know the worker's identity before one existed.
 */
export async function claimIngestionRun(
  runId: string,
  workerId: string,
  sourcesTotal?: number,
): Promise<void> {
  await withStorageLock(LOCK, async () => {
    const state = await read();
    const now = new Date().toISOString();
    await writeJsonFile(STATE_PATH, {
      ...state,
      runs: state.runs.map((r) => (r.runId === runId
        ? {
            ...r,
            status: 'running' as const,
            workerId,
            heartbeatAt: now,
            ...(typeof sourcesTotal === 'number' ? { sourcesTotal } : {}),
          }
        : r)),
    });
  });
}

/**
 * Record that the worker is still alive.
 *
 * This is what lets the UI distinguish a slow run from a dead one. Cheap and
 * frequent by design; it writes one timestamp and nothing else.
 */
export async function heartbeatIngestionRun(runId: string): Promise<void> {
  await withStorageLock(LOCK, async () => {
    const state = await read();
    const now = new Date().toISOString();
    await writeJsonFile(STATE_PATH, {
      ...state,
      runs: state.runs.map((r) => (r.runId === runId ? { ...r, heartbeatAt: now } : r)),
    });
  });
}

/** Run-level totals, written once when the run ends. */
export interface RunTotals {
  discovered?: number;
  inserted?: number;
  updated?: number;
  unchanged?: number;
  duplicates?: number;
  rejected?: number;
  expired?: number;
  deadlineSkipped?: number;
}

export async function finishIngestionRun(
  runId: string,
  status: 'completed' | 'partial' | 'failed' | 'cancelled',
  error?: string,
  totals: RunTotals = {},
): Promise<void> {
  await withStorageLock(LOCK, async () => {
    const state = await read();
    const finishedAt = new Date().toISOString();
    await writeJsonFile(STATE_PATH, {
      ...state,
      runs: state.runs.map((r) => {
        if (r.runId !== runId) return r;
        const started = Date.parse(r.startedAt);
        return {
          ...r,
          status,
          finishedAt,
          heartbeatAt: finishedAt,
          ...(Number.isFinite(started)
            ? { durationMs: Math.max(0, Date.parse(finishedAt) - started) }
            : {}),
          ...totals,
          ...(error ? { error } : {}),
        };
      }),
    });
  });
}

/**
 * How a finished run should be LABELLED, from what its sources actually did.
 *
 * Kept as a pure function so the rule lives in one place and is testable
 * without a run. The distinction that matters is `partial`: a run where some
 * boards failed used to be recorded as `completed`, which made a run that
 * silently lost a source look exactly like a healthy one.
 */
export function runOutcome(
  sources: ReadonlyArray<{ ok: boolean; skipped?: boolean }>,
): 'completed' | 'partial' | 'failed' {
  const attempted = sources.filter((s) => !s.skipped);
  if (attempted.length === 0) return 'completed';
  const failed = attempted.filter((s) => !s.ok).length;
  if (failed === 0) return 'completed';
  /* EVERY attempted source failed. That is not a partial result, it is a run
     that achieved nothing, and calling it partial would overstate it. */
  if (failed === attempted.length) return 'failed';
  return 'partial';
}
