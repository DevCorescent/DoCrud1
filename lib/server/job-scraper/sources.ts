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
 *   ASHBY_JOB_BOARDS          comma list of Ashby job-board names.
 *   LEVER_COMPANIES           comma list of Lever company slugs.
 *   GREENHOUSE_BOARDS         comma list of Greenhouse board tokens.
 *   SMARTRECRUITERS_COMPANIES comma list of SmartRecruiters company identifiers.
 *   WORKABLE_COMPANIES        comma list of Workable account slugs.
 *   RECRUITEE_COMPANIES       comma list of Recruitee company slugs.
 *   PERSONIO_COMPANIES        comma list of Personio company slugs.
 *   BAMBOOHR_COMPANIES        comma list of BambooHR company slugs.
 *   WORKDAY_BOARDS            comma list of "tenant:shard:site|Label|IN".
 * Each entry may be "slug", "slug|Display Name", or "slug|Display Name|IN"
 * (the 3rd field is an optional ISO country tag, e.g. IN for India).
 *
 * Deliberately NOT supported: Internshala and Instahyre. Neither publishes an
 * officially supported public jobs API — Internshala's robots.txt disallows its
 * /job/search and /api paths, and Instahyre exposes only an undocumented internal
 * endpoint. Integrating either would require scraping or a private API, which the
 * public-source architecture forbids. See scripts/india-sources.verify.ts.
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

/**
 * Slug-addressed providers: one configuration entry is one company board.
 *
 * `host` is the SSRF allowlist — the ONLY host the fetcher may call for that
 * provider. For the three per-tenant hosts the slug becomes a subdomain, so
 * the host is derived per source below rather than fixed.
 */
const PROVIDERS: Array<{
  env: string; provider: ScrapeSource['provider']; host: string | ((slug: string) => string);
}> = [
  { env: 'ASHBY_JOB_BOARDS', provider: 'ashby', host: 'api.ashbyhq.com' },
  { env: 'LEVER_COMPANIES', provider: 'lever', host: 'api.lever.co' },
  { env: 'GREENHOUSE_BOARDS', provider: 'greenhouse', host: 'boards-api.greenhouse.io' },
  { env: 'SMARTRECRUITERS_COMPANIES', provider: 'smartrecruiters', host: 'api.smartrecruiters.com' },
  { env: 'WORKABLE_COMPANIES', provider: 'workable', host: 'apply.workable.com' },
  /* Per-tenant subdomains. The slug is validated by SLUG_RE before it is ever
     interpolated, so a configuration typo cannot become an arbitrary host. */
  { env: 'RECRUITEE_COMPANIES', provider: 'recruitee', host: (slug) => `${slug}.recruitee.com` },
  { env: 'PERSONIO_COMPANIES', provider: 'personio', host: (slug) => `${slug}.jobs.personio.de` },
  { env: 'BAMBOOHR_COMPANIES', provider: 'bamboohr', host: (slug) => `${slug}.bamboohr.com` },
  /* Microsoft Careers (Eightfold). The slug is the Eightfold DOMAIN, not a
     subdomain: it is sent as the `domain` query parameter and can never
     become part of the host, which is a fixed literal. */
  { env: 'MICROSOFT_CAREERS', provider: 'microsoft', host: 'apply.careers.microsoft.com' },
];

/**
 * Workday, configured separately because it needs three identifiers.
 *
 *   WORKDAY_BOARDS = "tenant:shard:site|Display Name|IN, ..."
 *
 * e.g. "acme:wd3:Careers|Acme|IN" ->
 *   https://acme.wd3.myworkdayjobs.com/wday/cxs/acme/Careers/jobs
 *
 * An entry missing any of the three parts is DROPPED rather than guessed at:
 * a fabricated tenant would either 404 or, worse, address someone else's board.
 */
function parseWorkday(raw: string | undefined): ScrapeSource[] {
  const out: ScrapeSource[] = [];
  const enabled = (process.env.JOB_SCRAPER_ENABLED || '').trim().toLowerCase() !== 'false';
  for (const entry of (raw || '').split(',').map((e) => e.trim()).filter(Boolean)) {
    const [ident, label, country] = entry.split('|').map((x) => x.trim());
    const [tenant, shard, site] = (ident || '').split(':').map((x) => x.trim());
    if (!tenant || !shard || !site) continue;
    if (!SLUG_RE.test(tenant) || !SLUG_RE.test(shard) || !SLUG_RE.test(site)) continue;
    out.push({
      name: `workday:${tenant}:${site}`,
      label: label || tenant,
      provider: 'workday',
      board: site,
      workday: { tenant, shard, site },
      country: country || undefined,
      host: `${tenant}.${shard}.myworkdayjobs.com`,
      enabled,
    });
  }
  return out;
}

function buildSources(): ScrapeSource[] {
  const enabled = (process.env.JOB_SCRAPER_ENABLED || '').trim().toLowerCase() !== 'false';
  const out: ScrapeSource[] = [];
  for (const { env, provider, host } of PROVIDERS) {
    for (const { slug, label, country } of parseList(process.env[env])) {
      out.push({
        name: `${provider}:${slug}`, label: label || slug, provider, board: slug, country,
        host: typeof host === 'function' ? host(slug) : host,
        enabled,
      });
    }
  }
  out.push(...parseWorkday(process.env.WORKDAY_BOARDS));
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
