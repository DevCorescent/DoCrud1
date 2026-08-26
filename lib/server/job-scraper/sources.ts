/**
 * Approved source registry (the SSRF allowlist).
 *
 * Sources are built from CONFIGURATION, never from a browser-supplied URL. The
 * admin selects an approved source by NAME; the fetcher only ever calls the
 * provider's fixed API host for that source.
 *
 * Configuration (server env; public APIs — no secret needed). India-focused
 * discovery is achieved by pointing these at Indian companies' public ATS boards:
 *   JOB_SCRAPER_ENABLED   'false' disables all scraping (default: enabled).
 *   ASHBY_JOB_BOARDS      comma list of Ashby job-board names.
 *   LEVER_COMPANIES       comma list of Lever company slugs.
 *   GREENHOUSE_BOARDS     comma list of Greenhouse board tokens.
 * Each entry may be "slug", "slug|Display Name", or "slug|Display Name|IN"
 * (the 3rd field is an optional ISO country tag, e.g. IN for India).
 */
import { ScrapeSource } from './types';

const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function parseList(raw: string | undefined): Array<{ slug: string; label?: string; country?: string }> {
  return (raw || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => {
      const [slug, label, country] = e.split('|').map((x) => x.trim());
      return { slug, label: label || undefined, country: country || undefined };
    })
    .filter((e) => SLUG_RE.test(e.slug));
}

const PROVIDERS: Array<{ env: string; provider: ScrapeSource['provider']; host: string }> = [
  { env: 'ASHBY_JOB_BOARDS', provider: 'ashby', host: 'api.ashbyhq.com' },
  { env: 'LEVER_COMPANIES', provider: 'lever', host: 'api.lever.co' },
  { env: 'GREENHOUSE_BOARDS', provider: 'greenhouse', host: 'boards-api.greenhouse.io' },
];

function buildSources(): ScrapeSource[] {
  const enabled = (process.env.JOB_SCRAPER_ENABLED || '').trim().toLowerCase() !== 'false';
  const out: ScrapeSource[] = [];
  for (const { env, provider, host } of PROVIDERS) {
    for (const { slug, label, country } of parseList(process.env[env])) {
      out.push({ name: `${provider}:${slug}`, label: label || slug, provider, board: slug, country, host, enabled });
    }
  }
  return out;
}

// Rebuilt per call so tests / runtime env changes are reflected.
export function allSources(): ScrapeSource[] {
  return buildSources();
}

export function listSources(): ScrapeSource[] {
  return buildSources().filter((s) => s.enabled);
}

export function getSource(name: string): ScrapeSource | null {
  return buildSources().find((s) => s.enabled && s.name === name) || null;
}

export function sourceNames(): string[] {
  return listSources().map((s) => s.name);
}
