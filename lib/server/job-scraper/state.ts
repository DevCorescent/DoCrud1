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
}

export interface ScraperState {
  lastRun?: ScraperRunSummary;
  perSource?: Record<string, { lastSyncAt: string; jobs: number; failed: boolean }>;
}

export async function getScraperState(): Promise<ScraperState> {
  return readJsonFile<ScraperState>(STATE_PATH, {});
}

export async function saveScraperState(state: ScraperState): Promise<void> {
  await writeJsonFile(STATE_PATH, state);
}
