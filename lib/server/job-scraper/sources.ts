/**
 * Approved source registry (the SSRF allowlist).
 *
 * Sources are built from CONFIGURATION, never from a browser-supplied URL. The
 * admin selects an approved source by NAME; the fetcher only ever calls the
 * provider's fixed API host for that source.
 *
 * Configuration (server env; public APIs — no secret needed):
 *   JOB_SCRAPER_ENABLED   'false' disables all scraping (default: enabled).
 *   ASHBY_JOB_BOARDS      comma list of Ashby job-board names.  e.g. "acme,globex|Globex Inc"
 *   LEVER_COMPANIES       comma list of Lever company slugs.    e.g. "leverdemo"
 * Each entry may be "slug" or "slug|Display Name".
 */
import { ScrapeSource } from './types';

const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

function parseList(raw: string | undefined): Array<{ slug: string; label?: string }> {
  return (raw || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => {
      const [slug, label] = e.split('|').map((x) => x.trim());
      return { slug, label: label || undefined };
    })
    .filter((e) => SLUG_RE.test(e.slug));
}

function buildSources(): ScrapeSource[] {
  const enabled = (process.env.JOB_SCRAPER_ENABLED || '').trim().toLowerCase() !== 'false';
  const out: ScrapeSource[] = [];

  for (const { slug, label } of parseList(process.env.ASHBY_JOB_BOARDS)) {
    out.push({
      name: `ashby:${slug}`,
      label: label || slug,
      provider: 'ashby',
      board: slug,
      host: 'api.ashbyhq.com',
      enabled,
    });
  }
  for (const { slug, label } of parseList(process.env.LEVER_COMPANIES)) {
    out.push({
      name: `lever:${slug}`,
      label: label || slug,
      provider: 'lever',
      board: slug,
      host: 'api.lever.co',
      enabled,
    });
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
