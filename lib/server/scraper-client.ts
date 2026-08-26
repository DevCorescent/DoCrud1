/**
 * Scraper access layer used by the Super Admin routes.
 *
 * The scraper runs ENTIRELY inside DoCrud (lib/server/job-scraper): approved
 * public job APIs (Ashby / Lever) configured via env, fetched + normalized +
 * scored + deduped, then persisted through the EXISTING importer
 * (importJobsFromCsv → HiringJobPosting). No external service, no Python, no
 * second job model, no second import path, no browser-supplied URLs.
 */
import { runApprovedScrape } from '@/lib/server/job-scraper';
import { allSources, listSources } from '@/lib/server/job-scraper/sources';
import { getScraperState, saveScraperState, type ScraperRunSummary } from '@/lib/server/job-scraper/state';
import { importJobsFromCsv } from '@/lib/server/job-import';
import type { SourceRunStat } from '@/lib/server/job-scraper/types';

export interface SourceInfo {
  name: string;
  label: string;
  provider: string;
  enabled: boolean;
  lastSyncAt?: string;
  jobs?: number;
  failed?: boolean;
}

export interface ScraperStatus {
  mode: 'internal' | 'unconfigured';
  configured: boolean;
  sourceNames: string[];
  sources: SourceInfo[];
  lastRun: ScraperRunSummary | null;
}

export async function getScraperStatus(): Promise<ScraperStatus> {
  const enabled = listSources();
  const state = await getScraperState().catch(() => ({}));
  const perSource = (state as { perSource?: Record<string, { lastSyncAt: string; jobs: number; failed: boolean }> }).perSource ?? {};
  const sources: SourceInfo[] = allSources().map((s) => ({
    name: s.name,
    label: s.label || s.name,
    provider: s.provider ?? 'jsonld',
    enabled: s.enabled,
    lastSyncAt: perSource[s.name]?.lastSyncAt,
    jobs: perSource[s.name]?.jobs,
    failed: perSource[s.name]?.failed,
  }));
  return {
    mode: enabled.length > 0 ? 'internal' : 'unconfigured',
    configured: enabled.length > 0,
    sourceNames: enabled.map((s) => s.name),
    sources,
    lastRun: (state as { lastRun?: ScraperRunSummary }).lastRun ?? null,
  };
}

export interface ScrapeSummary {
  sources: number;
  fetched: number;
  valid: number;
  duplicates: number;
  imported: number;
  rejected: number;
  failed: number;
  perSource: SourceRunStat[];
  runAt: string;
}

/**
 * Run every enabled approved source and persist the best jobs through the
 * existing importer. Returns a summary and records last-run state.
 */
export async function runApprovedAndImport(opts: { totalLimit?: number; adminEmail: string }): Promise<ScrapeSummary> {
  if (listSources().length === 0) throw new Error('No approved scraper sources are configured.');

  const out = await runApprovedScrape({ totalLimit: opts.totalLimit });

  let imported = 0, valid = 0, existingDupes = 0, importInvalid = 0;
  if (out.csv && out.jobs.length > 0) {
    const summary = await importJobsFromCsv(out.csv, { commit: true, adminEmail: opts.adminEmail });
    imported = summary.imported;
    valid = summary.valid;
    existingDupes = summary.duplicates;
    importInvalid = summary.invalid;
  }

  const runAt = new Date().toISOString();
  const duplicates = out.duplicates + existingDupes; // within-batch + already-existing
  const rejected = out.rejected + importInvalid;

  // Persist last-run + per-source state (reuses existing storage; no new model).
  const prev = await getScraperState().catch(() => ({}));
  const perSourceMap = { ...((prev as { perSource?: Record<string, { lastSyncAt: string; jobs: number; failed: boolean }> }).perSource ?? {}) };
  for (const s of out.perSource) perSourceMap[s.name] = { lastSyncAt: runAt, jobs: s.active, failed: s.failed };
  await saveScraperState({
    lastRun: { runAt, fetched: out.fetched, valid, duplicates, imported, rejected, failed: out.failed },
    perSource: perSourceMap,
  }).catch(() => {});

  return {
    sources: out.perSource.length,
    fetched: out.fetched,
    valid,
    duplicates,
    imported,
    rejected,
    failed: out.failed,
    perSource: out.perSource,
    runAt,
  };
}
