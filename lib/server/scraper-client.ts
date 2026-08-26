/**
 * Scraper access layer used by the Super Admin routes.
 *
 * The scraper now runs ENTIRELY inside DoCrud (lib/server/job-scraper) — no
 * external service, no Python, no JOB_SCRAPER_URL / JOB_SCRAPER_API_KEY /
 * JOB_SCRAPER_MODE, and no filesystem dependency. The admin selects an
 * allowlisted source NAME (never a URL); the scraper returns the 13-column CSV,
 * which the browser hands to the EXISTING importer for preview + commit.
 */
import { runScrape } from '@/lib/server/job-scraper';
import { getSource, sourceNames } from '@/lib/server/job-scraper/sources';
import type { ScrapeResult } from '@/lib/server/job-scraper/types';

export type { ScrapeResult };

export interface ScraperStatus {
  mode: 'internal' | 'unconfigured';
  configured: boolean;
  sources: string[]; // allowlisted source NAMES only
}

export function getScraperStatus(): ScraperStatus {
  const sources = sourceNames();
  return { mode: sources.length > 0 ? 'internal' : 'unconfigured', configured: sources.length > 0, sources };
}

/** Run a scrape for an ALLOWLISTED source. `resume` is accepted for API
 *  compatibility but is a no-op: each run is a bounded, stateless batch and
 *  duplicate detection against existing jobs is the importer's responsibility. */
export async function runScraper(opts: { source: string; limit?: number; resume?: boolean }): Promise<ScrapeResult> {
  const source = getSource(String(opts.source || '').trim());
  if (!source) throw new Error('Unknown or disallowed scraper source.');
  return runScrape(source, { limit: opts.limit });
}
