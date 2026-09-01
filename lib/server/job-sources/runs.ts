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

/** Open a run. Recorded immediately so a crashed run is still visible. */
export async function startIngestionRun(runId: string): Promise<IngestionRun> {
  const run: IngestionRun = {
    runId,
    startedAt: new Date().toISOString(),
    status: 'running',
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

export async function finishIngestionRun(
  runId: string, status: 'completed' | 'failed', error?: string,
): Promise<void> {
  await withStorageLock(LOCK, async () => {
    const state = await read();
    await writeJsonFile(STATE_PATH, {
      ...state,
      runs: state.runs.map((r) => (r.runId === runId
        ? { ...r, status, finishedAt: new Date().toISOString(), error }
        : r)),
    });
  });
}
