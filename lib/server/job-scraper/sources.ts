/**
 * Approved source registry (the SSRF allowlist).
 *
 * The admin selects a source by NAME; the browser never supplies a URL. The
 * fetcher will only ever request the configured `host` for a source. Add real
 * public careers sites you are permitted to scrape and set `enabled: true`.
 */
import { ScrapeSource } from './types';

export const APPROVED_SOURCES: ScrapeSource[] = [
  {
    // Template — disabled. Copy this, point it at a PUBLIC careers site you are
    // permitted to scrape, set enabled:true, and confirm its host.
    name: 'example-careers',
    label: 'Example Careers (template — disabled)',
    enabled: false,
    host: 'example.com',
    sitemapUrl: 'https://example.com/sitemap-jobs.xml',
    listingUrl: 'https://example.com/careers',
    jobLinkSelector: 'a.job-card',
    cssFallback: {
      title: 'h1.job-title',
      organizationName: '.company-name',
      location: '.job-location',
      department: '.job-department',
      description: '.job-description',
      responsibilities: '.job-responsibilities li',
      requirements: '.job-requirements li',
      preferredSkills: '.job-skills li',
      applyUrl: 'a.apply-button@href',
    },
    maxPages: 20,
    minIntervalMs: 1500,
  },
];

export function listSources(): ScrapeSource[] {
  return APPROVED_SOURCES.filter((s) => s.enabled);
}

export function getSource(name: string): ScrapeSource | null {
  return APPROVED_SOURCES.find((s) => s.enabled && s.name === name) || null;
}

export function sourceNames(): string[] {
  return listSources().map((s) => s.name);
}
