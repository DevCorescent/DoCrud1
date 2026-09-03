/**
 * Small persisted scraper run-state (last run + per-source last sync).
 *
 * Uses the EXISTING storage helpers (readJsonFile/writeJsonFile) — no new model,
 * no migration. In production this is one app_state blob; in dev a JSON file.
 */
import path from 'path';
import { readJsonFile, writeJsonFile } from '@/lib/server/storage';

const STATE_PATH = path.join(process.cwd(), 'data', 'scraper-state.json');

export interface ScraperRunSummary {
  runAt: string;
  fetched: number;
  valid: number;
  duplicates: number;
  imported: number;
  rejected: number;
  failed: number;
  /* Stage 1/2 breakdown. All optional so a run recorded by an older build
     still parses — an absent field means "that build did not measure it",
     never zero. */
  discovered?: number;
  inserted?: number;
  updated?: number;
  unchanged?: number;
  duplicateInRun?: number;
  truncated?: number;
  sourcesOk?: number;
}

/**
 * What is remembered about one source between runs.
 *
 * `failed` is recorded EXPLICITLY and is never inferred from `jobs === 0`. The
 * three states an administrator has to be able to tell apart:
 *
 *   failed: false, jobs > 0   the board was read and has openings
 *   failed: false, jobs === 0 the board was read and genuinely has none
 *   failed: true              the board could not be read at all
 *
 * A failed source KEEPS its previous `lastSyncAt`: the last successful sync is
 * a fact, and overwriting it would claim a sync that did not happen. Phase 8
 * reads this kind of signal when deciding whether a posting is genuinely gone.
 */
export interface ScraperSourceState {
  /** The last time this source was read SUCCESSFULLY. Absent if never. */
  lastSyncAt?: string;
  jobs: number;
  failed: boolean;
  /** When the most recent attempt ran, successful or not. */
  lastAttemptAt?: string;
  /** Safe message from the most recent failure. Cleared on success. */
  lastError?: string;
  /** Category from SourceFetchError — 'http', 'timeout', 'parse', 'config'… */
  lastErrorKind?: string;
  /** HTTP status, when the server actually sent one. */
  lastErrorStatus?: number;
  /** Consecutive failures. Resets to 0 on any success. */
  consecutiveFailures?: number;
}

export interface ScraperState {
  lastRun?: ScraperRunSummary;
  perSource?: Record<string, ScraperSourceState>;
  /**
   * Where the NEXT run starts — the sourceId the last run stopped after.
   *
   * A run is capped by the platform's execution window and works through its
   * sources one at a time, so a long list cannot all be read in one pass. With
   * a fixed starting point the same head of the list would be read every time
   * and the tail would never be reached at all, which is exactly how a source
   * ends up permanently "Never synced" while its neighbours are up to date.
   *
   * Advancing this cursor makes the run round-robin: each pass continues where
   * the last one stopped, so every source gets its turn. Absent means "start at
   * the beginning", which is also the correct behaviour for a fresh install.
   */
  cursor?: string;
  /**
   * Per-source resume tokens, keyed by sourceId.
   *
   * Distinct from `cursor` above: that one says which SOURCE to start with,
   * this one says where to resume INSIDE a source whose corpus is larger than
   * a single bounded run can read. A source absent here starts from the top.
   */
  sourceCursors?: Record<string, string>;
}

export async function getScraperState(): Promise<ScraperState> {
  return readJsonFile<ScraperState>(STATE_PATH, {});
}

export async function saveScraperState(state: ScraperState): Promise<void> {
  await writeJsonFile(STATE_PATH, state);
}
